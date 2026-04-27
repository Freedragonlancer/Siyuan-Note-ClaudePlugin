/**
 * Moonshot AI (Kimi) Provider
 * Official Docs: https://platform.moonshot.ai/docs
 *
 * Features:
 * - OpenAI-compatible API
 * - 128K-256K context windows
 * - K2 Thinking models with reasoning exposure
 * - K2.5 multimodal support (images/video)
 * - Support for global and China regions
 */

import { BaseAIProvider } from '../BaseAIProvider';
import type { AIModelConfig, AIRequestOptions, AIProvider, ProviderMetadata, ParameterLimits } from '../types';
import type { Message, ContentBlock } from '../../claude/types';

// OpenAI-compatible content types for K2.5 multimodal
type MoonshotTextContent = { type: 'text'; text: string };
type MoonshotImageContent = { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };
type MoonshotContentPart = MoonshotTextContent | MoonshotImageContent;

export class MoonshotProvider extends BaseAIProvider implements AIProvider {
    readonly providerType = 'moonshot';
    readonly providerName = 'Moonshot AI (Kimi)';

    private baseURL: string;
    private apiKey: string;
    private model: string;
    private temperature: number;
    private maxTokens: number;
    private thinkingMode: boolean;

    constructor(config: AIModelConfig) {
        super(config);
        this.apiKey = config.apiKey;
        this.model = config.modelId || 'kimi-k2.6';
        this.temperature = config.temperature ?? 1;
        this.maxTokens = config.maxTokens ?? 4096;

        // v0.13.0: Reasoning mode support (K2 Thinking models)
        this.thinkingMode = config.thinkingMode ?? false;

        // Allow user to choose between global and China API
        // Default to global if not specified
        this.baseURL = (config.baseURL || 'https://api.moonshot.cn/v1').replace(/\/+$/, '');

    }

    /**
     * Send a non-streaming message
     */
    async sendMessage(messages: Message[], options?: AIRequestOptions): Promise<string> {
        const url = `${this.baseURL}/chat/completions`;

        // Moonshot limits temperature to [0, 1] range (vs OpenAI's [0, 2])
        const clampedTemperature = this.clampTemperature(
            options?.temperature ?? this.temperature
        );

        // v0.20.0+: Use a shared builder for latest Kimi multimodal/thinking models
        const requestBody = this.buildRequestBody(messages, options, false, clampedTemperature);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
                signal: options?.signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[MoonshotProvider] API error (${response.status}):`, errorText);

                // Handle rate limiting
                if (response.status === 429) {
                    throw new Error('Moonshot API rate limit exceeded. Please try again later or upgrade your plan.');
                }

                throw new Error(`Moonshot API error: ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            return this.extractResponse(data);

        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.log('[MoonshotProvider] Request aborted');
                throw new Error('Request cancelled');
            }
            console.error('[MoonshotProvider] Error:', error);
            throw error;
        }
    }

    /**
     * Send a streaming message
     */
    async streamMessage(messages: Message[], options?: AIRequestOptions): Promise<void> {
        if (!options?.onStream) {
            throw new Error('onStream callback is required for streaming');
        }

        const url = `${this.baseURL}/chat/completions`;

        const clampedTemperature = this.clampTemperature(
            options?.temperature ?? this.temperature
        );

        // v0.20.0+: Use a shared builder for latest Kimi multimodal/thinking models
        const requestBody = this.buildRequestBody(messages, options, true, clampedTemperature);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
                signal: options?.signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[MoonshotProvider] Streaming API error (${response.status}):`, errorText);

                if (response.status === 429) {
                    throw new Error('Moonshot API rate limit exceeded. Please try again later.');
                }

                throw new Error(`Moonshot API error: ${response.statusText} - ${errorText}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('Response body is not readable');
            }

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    console.log('[MoonshotProvider] Streaming completed');
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]') continue;

                    if (trimmed.startsWith('data: ')) {
                        try {
                            const jsonData = JSON.parse(trimmed.slice(6));
                            const delta = jsonData.choices?.[0]?.delta;

                            if (delta?.content) {
                                options.onStream!(delta.content);
                            }

                            // Handle reasoning content from K2 Thinking models
                            if (delta?.reasoning_content) {
                                // Optionally pass reasoning to callback if needed
                            }
                        } catch (parseError) {
                            console.warn('[MoonshotProvider] Failed to parse SSE line:', trimmed);
                        }
                    }
                }
            }

            if (options.onComplete) {
                options.onComplete();
            }

        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.log('[MoonshotProvider] Streaming request aborted');
                throw new Error('Request cancelled');
            }
            console.error('[MoonshotProvider] Streaming error:', error);
            if (options.onError) {
                options.onError(error as Error);
            }
            throw error;
        }
    }

    /**
     * Validate configuration
     */
    validateConfig(config: AIModelConfig): true | string {
        if (!config.apiKey) {
            return 'Moonshot API key is required';
        }

        if (!config.modelId) {
            return 'Model selection is required';
        }

        const validModels = this.getAvailableModels();
        if (!validModels.includes(config.modelId)) {
            return `Invalid model. Available models: ${validModels.join(', ')}`;
        }

        return true;
    }

    // getAvailableModels() - inherited from BaseAIProvider, derives from getMetadata()

    /**
     * Get model context window limits
     */
    getModelContextWindow(model: string): number {
        const contextWindows: Record<string, number> = {
            'kimi-k2.6': 262144,                 // 256K (latest)
            'kimi-k2.5': 262144,                 // 256K multimodal
            'kimi-k2-0905-preview': 262144,      // 256K
            'kimi-k2-0711-preview': 131072,      // 128K
            'kimi-k2-thinking': 262144,          // 256K
            'kimi-k2-thinking-turbo': 262144,    // 256K
            'moonshot-v1-128k': 131072,          // 128K
            'moonshot-v1-32k': 32768,            // 32K
            'moonshot-v1-8k': 8192,              // 8K
        };

        return contextWindows[model] || 128000; // Default to 128K
    }

    private buildRequestBody(
        messages: Message[],
        options: AIRequestOptions | undefined,
        stream: boolean,
        clampedTemperature: number
    ): any {
        const body: any = {
            model: this.model,
            messages: this.convertMessages(messages, options?.systemPrompt),
            max_tokens: options?.maxTokens || this.maxTokens,
            stream,
        };

        const thinkingEnabled = options?.thinkingMode ?? this.thinkingMode;
        if (this.usesLatestKimiProtocol(this.model)) {
            // K2.5/K2.6 use fixed sampling presets with the thinking switch.
            body.thinking = { type: thinkingEnabled ? 'enabled' : 'disabled' };
        } else {
            body.temperature = clampedTemperature;
            if (thinkingEnabled) {
                body.reasoning = true;
            }
        }

        return body;
    }

    /**
     * Convert messages to OpenAI-compatible format for K2.5 multimodal
     * Handles both text-only and multimodal (text + images) messages
     */
    private convertMessages(messages: Message[], systemPrompt?: string): Array<{
        role: string;
        content: string | MoonshotContentPart[];
    }> {
        const normalized = this.normalizeMessages(messages);
        const converted: Array<{ role: string; content: string | MoonshotContentPart[] }> = [];
        const allowImages = this.supportsVisionForModel(this.model);

        if (systemPrompt && systemPrompt.trim()) {
            converted.push({
                role: 'system',
                content: systemPrompt.trim(),
            });
        }

        for (const msg of normalized) {
            // Check if content is multimodal (ContentBlock array)
            if (typeof msg.content !== 'string' && Array.isArray(msg.content)) {
                const parts = this.convertContentBlocks(msg.content, allowImages);
                converted.push({
                    role: msg.role,
                    content: parts,
                });
            } else {
                // Simple string content
                converted.push({
                    role: msg.role,
                    content: msg.content as string,
                });
            }
        }

        return converted;
    }

    /**
     * Convert ContentBlock array to OpenAI-compatible format
     * Used for K2.5 multimodal image input
     */
    private convertContentBlocks(blocks: ContentBlock[], allowImages: boolean): MoonshotContentPart[] {
        const parts: MoonshotContentPart[] = [];
        let omittedImages = 0;

        for (const block of blocks) {
            if (block.type === 'text') {
                parts.push({
                    type: 'text',
                    text: block.text,
                });
            } else if (block.type === 'image' && allowImages) {
                // K2.5 uses OpenAI-compatible image_url format
                let imageUrl: string;

                if (block.source.type === 'base64') {
                    // Convert to data URL format: data:image/png;base64,...
                    imageUrl = `data:${block.source.media_type};base64,${block.source.data}`;
                } else {
                    // URL type - use directly
                    imageUrl = block.source.data;
                }

                parts.push({
                    type: 'image_url',
                    image_url: {
                        url: imageUrl,
                        detail: 'auto', // Let K2.5 decide the detail level
                    },
                });
            } else if (block.type === 'image') {
                omittedImages++;
            }
        }

        if (omittedImages > 0 && parts.length === 0) {
            parts.push({
                type: 'text',
                text: `[${omittedImages} image(s) omitted: selected Moonshot model does not support vision]`,
            });
        }

        return parts;
    }

    private usesLatestKimiProtocol(model: string): boolean {
        return model === 'kimi-k2.6' || model.startsWith('kimi-k2.6-') || model === 'kimi-k2.5' || model.startsWith('kimi-k2.5-');
    }

    /**
     * K2.5/K2.6 accept image_url content through Moonshot's
     * OpenAI-compatible chat endpoint. Older text models receive text only.
     */
    private supportsVisionForModel(model: string): boolean {
        return this.usesLatestKimiProtocol(model);
    }

    /**
     * Extract response from API data
     * Handles special K2 Thinking models with reasoning_content
     */
    private extractResponse(data: any): string {
        const message = data.choices?.[0]?.message;

        if (!message) {
            throw new Error('Invalid API response: no message found');
        }

        const content = message.content || '';

        // K2 Thinking models return reasoning_content separately
        if (message.reasoning_content) {
            console.log('[MoonshotProvider] 🤔 Reasoning process detected:');
            console.log(message.reasoning_content);

            // Option 1: Return content with collapsible reasoning (recommended)
            return `${content}\n\n<details>\n<summary>🤔 推理过程 (Reasoning Process)</summary>\n\n${message.reasoning_content}\n</details>`;

            // Option 2: Return content only (user won't see reasoning)
            // return content;

            // Option 3: Return both concatenated
            // return `${content}\n\n---\n\n**推理过程：**\n\n${message.reasoning_content}`;
        }

        return content;
    }

    /**
     * Clamp temperature to Moonshot's [0, 1] range
     * (vs OpenAI's [0, 2])
     */
    private clampTemperature(temperature: number): number {
        const clamped = Math.max(0, Math.min(1, temperature));

        if (clamped !== temperature) {
            console.warn(`[MoonshotProvider] Temperature ${temperature} clamped to ${clamped} (Moonshot range: [0, 1])`);
        }

        return clamped;
    }

    /**
     * Get maximum token limit for a specific model
     */
    getMaxTokenLimit(model: string): number {
        return this.getModelContextWindow(model);
    }

    /**
     * Get parameter limits for Moonshot provider
     */
    getParameterLimits(): ParameterLimits {
        const modelId = this.model || 'kimi-k2.6';
        return {
            temperature: { min: 0, max: 1, default: 1 },           // Moonshot限制 [0, 1]
            maxTokens: { min: 1, max: this.getMaxTokenLimit(modelId), default: 4096 },
        };
    }

    /**
     * Get provider metadata (single source of truth)
     */
    getMetadata(): ProviderMetadata {
        return {
            type: 'moonshot',
            displayName: 'Moonshot AI (Kimi)',
            description: 'Kimi K2.6/K2.5/K2 系列，支持256K上下文、多模态和推理模型',
            icon: '🌙',
            apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
            defaultBaseURL: 'https://api.moonshot.cn/v1',
            defaultModel: 'kimi-k2.6',
            models: [
                {
                    id: 'kimi-k2.6',
                    displayName: 'Kimi K2.6 (最新旗舰，推荐)',
                    contextWindow: 262144,
                    description: '最新Kimi K2.6模型，支持Thinking和多模态输入',
                    recommended: true,
                },
                {
                    id: 'kimi-k2.5',
                    displayName: 'Kimi K2.5 (256K，多模态)',
                    contextWindow: 262144,
                    description: 'K2.5模型，原生多模态支持图像/视频，内置Thinking推理',
                },
                {
                    id: 'kimi-k2-0905-preview',
                    displayName: 'Kimi K2 0905 (256K上下文)',
                    contextWindow: 262144,
                    description: 'K2模型，支持256K上下文窗口',
                },
                {
                    id: 'kimi-k2-thinking',
                    displayName: 'Kimi K2 Thinking (256K，推理模型)',
                    contextWindow: 262144,
                    description: '推理模型，暴露思考过程',
                },
                {
                    id: 'kimi-k2-thinking-turbo',
                    displayName: 'Kimi K2 Thinking Turbo (256K，快速推理)',
                    contextWindow: 262144,
                    description: '快速推理模型，平衡速度和质量',
                },
                {
                    id: 'kimi-k2-0711-preview',
                    displayName: 'Kimi K2 0711 (128K)',
                    contextWindow: 131072,
                    description: '早期K2模型',
                    deprecated: true,
                },
                {
                    id: 'moonshot-v1-128k',
                    displayName: 'Moonshot V1 128K',
                    contextWindow: 131072,
                    description: '第一代128K模型',
                    deprecated: true,
                },
                {
                    id: 'moonshot-v1-32k',
                    displayName: 'Moonshot V1 32K',
                    contextWindow: 32768,
                    description: '第一代32K模型',
                    deprecated: true,
                },
                {
                    id: 'moonshot-v1-8k',
                    displayName: 'Moonshot V1 8K',
                    contextWindow: 8192,
                    description: '第一代8K模型',
                    deprecated: true,
                },
            ],
            features: {
                supportsStreaming: true,
                supportsSystemPrompt: true,
                supportsVision: true,  // K2.5/K2.6 support native multimodal; older models are text-only
                supportsFunctionCalling: false,
            },
            defaults: {
                maxTokens: 4096,
                temperature: 1,
                thinkingMode: false,
            },
            badgeColors: { bg: '#FFF3E0', border: '#FFB74D' },
        };
    }
}
