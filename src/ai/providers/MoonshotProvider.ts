/**
 * Moonshot AI (Kimi) Provider
 * Official Docs: https://platform.moonshot.ai/docs
 *
 * Features:
 * - OpenAI-compatible API
 * - 128K-256K context windows
 * - K2 Thinking models with reasoning exposure
 * - Support for global and China regions
 */

import { BaseAIProvider } from '../BaseAIProvider';
import type { AIModelConfig, Message, AIRequestOptions, AIProvider, ProviderMetadata, ParameterLimits } from '../types';

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
        this.model = config.modelId || 'kimi-k2-0905-preview';
        this.temperature = config.temperature ?? 1;
        this.maxTokens = config.maxTokens ?? 4096;

        // v0.13.0: Reasoning mode support (K2 Thinking models)
        this.thinkingMode = config.thinkingMode ?? false;

        // Allow user to choose between global and China API
        // Default to global if not specified
        this.baseURL = config.baseURL || 'https://api.moonshot.cn/v1';

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

        const requestBody = {
            model: this.model,
            messages: messages.map(msg => ({
                role: msg.role,
                content: msg.content
            })),
            temperature: clampedTemperature,
            max_tokens: options?.maxTokens || this.maxTokens,
            stream: false,
            // v0.13.0: Reasoning mode (K2 Thinking models expose reasoning_content)
            ...(this.thinkingMode && {
                reasoning: true,  // Enable reasoning mode
            }),
        };

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

        const requestBody = {
            model: this.model,
            messages: messages.map(msg => ({
                role: msg.role,
                content: msg.content
            })),
            temperature: clampedTemperature,
            max_tokens: options?.maxTokens || this.maxTokens,
            stream: true,
            // v0.13.0: Reasoning mode (K2 Thinking models expose reasoning_content)
            ...(this.thinkingMode && {
                reasoning: true,  // Enable reasoning mode
            }),
        };

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

    /**
     * Get list of available models
     */
    getAvailableModels(): string[] {
        return [
            // Kimi K2 Series (2025 Latest)
            'kimi-k2-0905-preview',      // Latest, 256K context
            'kimi-k2-0711-preview',      // Earlier version, 128K context
            'kimi-k2-thinking',          // Reasoning model with exposed thinking
            'kimi-k2-thinking-turbo',    // Faster reasoning variant

            // Legacy (may still be supported)
            'moonshot-v1-128k',          // 128K context
            'moonshot-v1-32k',           // 32K context
            'moonshot-v1-8k',            // 8K context
        ];
    }

    /**
     * Get model context window limits
     */
    getModelContextWindow(model: string): number {
        const contextWindows: Record<string, number> = {
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
        const modelId = this.model || 'kimi-k2-0905-preview';
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
            description: 'Kimi K2 系列，支持256K上下文和推理模型',
            icon: '🌙',
            apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
            defaultBaseURL: 'https://api.moonshot.cn/v1',
            defaultModel: 'kimi-k2-0905-preview',
            models: [
                {
                    id: 'kimi-k2-0905-preview',
                    displayName: 'Kimi K2 0905 (256K上下文，最新推荐)',
                    contextWindow: 262144,
                    description: '最新K2模型，支持256K上下文窗口',
                    recommended: true,
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
                supportsVision: false,
                supportsFunctionCalling: false,
            },
        };
    }
}
