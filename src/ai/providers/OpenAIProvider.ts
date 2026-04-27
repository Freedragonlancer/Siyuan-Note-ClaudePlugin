/**
 * OpenAI AI Provider Implementation
 * Supports GPT-4, GPT-3.5-turbo and other OpenAI models
 */

import OpenAI from 'openai';
import type { ChatCompletionContentPart, ChatCompletionContentPartImage, ChatCompletionContentPartText } from 'openai/resources/chat/completions';
import type { Message, ContentBlock } from '../../claude/types';
import type {
    AIModelConfig,
    AIRequestOptions,
    ParameterLimits,
    ProviderMetadata,
} from '../types';
import { BaseAIProvider } from '../BaseAIProvider';

type ResponsesContentPart =
    | { type: 'input_text'; text: string }
    | { type: 'input_image'; image_url: string; detail?: 'auto' | 'low' | 'high' };

type ResponsesInputMessage = {
    role: string;
    content: string | ResponsesContentPart[];
};

export class OpenAIProvider extends BaseAIProvider {
    readonly providerType = 'openai' as const;
    readonly providerName = 'OpenAI';

    private client: OpenAI;
    private baseURL: string;
    private apiKey: string;

    constructor(config: AIModelConfig) {
        super(config);

        // Debug: Log configuration (API key excluded for security)
        console.log(`[OpenAIProvider] Model ID: ${config.modelId}`);
        console.log(`[OpenAIProvider] Base URL: ${config.baseURL || 'https://api.openai.com/v1'}`);

        this.apiKey = config.apiKey;
        this.baseURL = (config.baseURL || 'https://api.openai.com/v1').replace(/\/+$/, '');

        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: this.baseURL,
            timeout: 120000, // 120 seconds
            maxRetries: 2,
            dangerouslyAllowBrowser: true,
        });
    }

    /**
     * Check if model is GPT-5.x or o-series (uses max_completion_tokens instead of max_tokens)
     * These models also have different temperature handling
     */
    protected isModernReasoningModel(): boolean {
        const modelId = this.config.modelId.toLowerCase();
        // GPT-5.x series
        if (modelId.startsWith('gpt-5')) return true;
        // o-series reasoning models (o1, o3, o4)
        if (modelId.startsWith('o1') || modelId.startsWith('o3') || modelId.startsWith('o4')) return true;
        return false;
    }


    /**
     * Latest GPT-5.4/5.5 models are Responses API-first. Keep older and
     * OpenAI-compatible custom endpoints on Chat Completions unless needed.
     */
    protected usesResponsesApi(): boolean {
        const mode = this.config.options?.openaiApiMode as 'auto' | 'chat' | 'responses' | undefined;
        if (mode === 'responses') return true;
        if (mode === 'chat') return false;

        const modelId = this.config.modelId.toLowerCase();
        return modelId.startsWith('gpt-5.5') || modelId.startsWith('gpt-5.4');
    }

    private getResponsesURL(): string {
        return this.baseURL.endsWith('/responses') ? this.baseURL : `${this.baseURL}/responses`;
    }

    /**
     * Build completion parameters based on model type
     */
    protected buildCompletionParams(messages: Message[], options?: AIRequestOptions, streaming: boolean = false) {
        const isModernModel = this.isModernReasoningModel();

        const baseParams: any = {
            model: this.config.modelId,
            messages: this.convertMessages(messages, options?.systemPrompt),
            stop: options?.stopSequences,
        };

        // GPT-5.x and o-series models only support temperature = 1 (default)
        // For other models, send temperature parameter
        if (!isModernModel) {
            baseParams.temperature = this.getEffectiveTemperature(options);
        }
        // For modern reasoning models: omit temperature parameter to use default (1)

        // Add streaming flag if needed
        if (streaming) {
            baseParams.stream = true;
        }

        // GPT-5.x and o-series models use max_completion_tokens instead of max_tokens
        const maxTokens = this.getEffectiveMaxTokens(options);
        if (isModernModel) {
            baseParams.max_completion_tokens = maxTokens;
        } else {
            baseParams.max_tokens = maxTokens;
        }

        return baseParams;
    }

    async sendMessage(messages: Message[], options?: AIRequestOptions): Promise<string> {
        if (options?.onStream) {
            // If streaming callback provided, use streaming mode
            let fullResponse = '';
            await this.streamMessage(messages, {
                ...options,
                onStream: (chunk) => {
                    fullResponse += chunk;
                    options.onStream?.(chunk);
                },
            });
            return fullResponse;
        }

        if (this.usesResponsesApi()) {
            return this.sendResponsesMessage(messages, options);
        }

        // Non-streaming mode
        try {
            const completion = await this.client.chat.completions.create(
                this.buildCompletionParams(messages, options, false),
                { signal: options?.signal }
            );

            const content = completion.choices?.[0]?.message?.content;
            if (content === undefined || content === null) {
                throw new Error('Invalid OpenAI response: missing message content');
            }
            return content;
        } catch (error) {
            this.handleError(error, 'sendMessage');
        }
    }

    async streamMessage(messages: Message[], options?: AIRequestOptions): Promise<void> {
        this.validateStreamingOptions(options);

        if (this.usesResponsesApi()) {
            await this.streamResponsesMessage(messages, options);
            return;
        }

        try {
            const stream = await this.client.chat.completions.create(
                this.buildCompletionParams(messages, options, true),
                { signal: options?.signal }
            );

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                    options?.onStream?.(content);
                }
            }
        } catch (error) {
            this.handleError(error, 'streamMessage');
        }
    }

    private buildResponsesBody(messages: Message[], options?: AIRequestOptions, streaming: boolean = false): any {
        const body: any = {
            model: this.config.modelId,
            input: this.convertResponsesInput(messages),
            max_output_tokens: this.getEffectiveMaxTokens(options),
        };

        if (options?.systemPrompt?.trim()) {
            body.instructions = options.systemPrompt.trim();
        }

        if (options?.thinkingMode) {
            body.reasoning = {
                effort: options.reasoningEffort || 'medium',
            };
        }

        if (streaming) {
            body.stream = true;
        }

        if (options?.stopSequences?.length) {
            body.stop = options.stopSequences;
        }

        return body;
    }

    private async sendResponsesMessage(messages: Message[], options?: AIRequestOptions): Promise<string> {
        try {
            const response = await fetch(this.getResponsesURL(), {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(this.buildResponsesBody(messages, options, false)),
                signal: options?.signal,
            });

            if (!response.ok) {
                throw new Error(`OpenAI Responses API error: ${response.status} ${await response.text()}`);
            }

            const data = await response.json();
            return this.extractResponsesText(data);
        } catch (error) {
            this.handleError(error, 'sendResponsesMessage');
        }
    }

    private async streamResponsesMessage(messages: Message[], options?: AIRequestOptions): Promise<void> {
        try {
            const response = await fetch(this.getResponsesURL(), {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(this.buildResponsesBody(messages, options, true)),
                signal: options?.signal,
            });

            if (!response.ok) {
                throw new Error(`OpenAI Responses API error: ${response.status} ${await response.text()}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('OpenAI Responses API stream is not readable');
            }

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split('\n\n');
                buffer = events.pop() || '';

                for (const event of events) {
                    for (const line of event.split('\n')) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;

                        try {
                            const payload = JSON.parse(trimmed.slice(6));
                            if (payload.type === 'response.output_text.delta' && payload.delta) {
                                options?.onStream?.(payload.delta);
                            }
                        } catch (parseError) {
                            console.warn('[OpenAIProvider] Failed to parse Responses SSE payload:', trimmed);
                        }
                    }
                }
            }
        } catch (error) {
            this.handleError(error, 'streamResponsesMessage');
        }
    }

    private extractResponsesText(data: any): string {
        if (typeof data.output_text === 'string') {
            return data.output_text;
        }

        const chunks: string[] = [];
        for (const item of data.output || []) {
            for (const part of item.content || []) {
                if (part.type === 'output_text' && typeof part.text === 'string') {
                    chunks.push(part.text);
                }
            }
        }

        return chunks.join('');
    }

    validateConfig(config: AIModelConfig): true | string {
        // Call base validation first
        const baseValidation = super.validateConfig(config);
        if (baseValidation !== true) {
            return baseValidation;
        }

        // OpenAI-specific API key validation
        // OpenAI API keys should start with "sk-"
        if (config.apiKey && !config.apiKey.startsWith('sk-')) {
            console.warn(`[OpenAIProvider] API key format warning: Expected to start with 'sk-', got '${config.apiKey.substring(0, 4)}...'`);
            console.warn('[OpenAIProvider] This may indicate an invalid API key format');
        }

        // OpenAI-specific model validation
        const validModels = this.getAvailableModels();
        const isValidModel = validModels.some(model => 
            config.modelId === model || config.modelId.startsWith(model.split('-')[0])
        );
        
        if (!isValidModel) {
            console.warn(`[OpenAIProvider] Unknown model: ${config.modelId}`);
            console.warn(`[OpenAIProvider] Available models: ${validModels.slice(0, 5).join(', ')}...`);
            // Don't fail - allow unknown models in case of new releases
        }

        return true;
    }

    // getAvailableModels() - inherited from BaseAIProvider, derives from getMetadata()

    getMaxTokenLimit(model: string): number {
        const limits: Record<string, number> = {
            // GPT-5 Series (Responses API-first for latest 5.4/5.5)
            'gpt-5.5': 128000,
            'gpt-5.4': 128000,
            'gpt-5.4-mini': 65536,
            'gpt-5.4-nano': 32768,
            'gpt-5.2': 65536,
            'gpt-5.1': 65536,
            'gpt-5': 65536,
            'gpt-5-mini': 32768,
            'gpt-5-nano': 16384,

            // GPT-4.1 Series (1M context window)
            'gpt-4.1': 32768,                 // 32k output, 1M context
            'gpt-4.1-mini': 16384,            // 16k output, 1M context
            'gpt-4.1-nano': 8192,             // 8k output, 1M context

            // o-Series Reasoning Models (2025)
            'o3': 100000,                     // 100k output, 200k context
            'o3-pro': 100000,                 // 100k output, 200k context
            'o4-mini': 65536,                 // 65k output, 128k context
            'o3-deep-research': 100000,       // Deep research variant
            'o4-mini-deep-research': 65536,   // Deep research variant
            'o1': 100000,                     // 100k output tokens, 200k context
            'o1-2024-12-17': 100000,
            'o1-preview': 32768,              // 32k output tokens, 128k context
            'o1-mini': 65536,                 // 65k output tokens, 128k context
            'o3-mini': 65536,                 // Similar to o1-mini

            // GPT-4o Series (16k output tokens, 128k context)
            'gpt-4o': 16384,
            'gpt-4o-2024-11-20': 16384,
            'gpt-4o-2024-08-06': 16384,
            'gpt-4o-mini': 16384,
            'gpt-4o-mini-2024-07-18': 16384,

            // GPT-4 Turbo Series (4k-8k output, 128k context)
            'gpt-4-turbo': 4096,
            'gpt-4-turbo-2024-04-09': 4096,

            // GPT-4 Classic Series
            'gpt-4': 8192,                    // 8k output, 8k context
            'gpt-4-32k': 32768,               // 32k output, 32k context

            // GPT-3.5 Series
            'gpt-3.5-turbo': 4096,           // 4k output, 16k context
        };

        // Try exact match first
        if (limits[model]) {
            return limits[model];
        }

        // Try prefix match (e.g., "gpt-5.2-2025-01-15" matches "gpt-5.2")
        for (const [key, value] of Object.entries(limits)) {
            if (model.startsWith(key)) {
                return value;
            }
        }

        return 8192; // Safe default (increased for modern models)
    }

    getParameterLimits(): ParameterLimits {
        // Note: this.config might not be set yet if called during construction validation
        // Use safe defaults for max tokens
        const modelId = this.config?.modelId || 'gpt-4-turbo-preview';
        return {
            temperature: { min: 0, max: 2, default: 1 },
            maxTokens: { min: 1, max: this.getMaxTokenLimit(modelId), default: 4096 },
            topP: { min: 0, max: 1, default: 1 },
        };
    }

    getMetadata(): ProviderMetadata {
        return {
            type: 'openai',
            displayName: 'OpenAI',
            description: 'GPT-5.5/5.4, GPT-4.1, o-series 等 OpenAI 模型',
            icon: '⚡',
            apiKeyUrl: 'https://platform.openai.com/api-keys',
            defaultBaseURL: 'https://api.openai.com/v1',
            defaultModel: 'gpt-5.4-mini',
            models: [
                // GPT-5 Series (latest models use Responses API)
                {
                    id: 'gpt-5.5',
                    displayName: 'GPT-5.5 (最新旗舰)',
                    contextWindow: 512000,
                    description: '最新旗舰模型，适合复杂推理、编码和智能体任务（Responses API）',
                    recommended: true,
                },
                {
                    id: 'gpt-5.4',
                    displayName: 'GPT-5.4 (旗舰)',
                    contextWindow: 512000,
                    description: '旗舰通用模型（Responses API）',
                },
                {
                    id: 'gpt-5.4-mini',
                    displayName: 'GPT-5.4 Mini (推荐，快速)',
                    contextWindow: 256000,
                    description: '推荐默认模型，速度和成本平衡（Responses API）',
                    recommended: true,
                },
                {
                    id: 'gpt-5.4-nano',
                    displayName: 'GPT-5.4 Nano (最快)',
                    contextWindow: 128000,
                    description: '最快、最低成本的GPT-5.4模型（Responses API）',
                },
                {
                    id: 'gpt-5.2',
                    displayName: 'GPT-5.2 (旧旗舰)',
                    contextWindow: 256000,
                    description: '上一代旗舰模型',
                    deprecated: true,
                },
                {
                    id: 'gpt-5.1',
                    displayName: 'GPT-5.1',
                    contextWindow: 256000,
                    description: '上一代GPT-5模型',
                    deprecated: true,
                },
                {
                    id: 'gpt-5-mini',
                    displayName: 'GPT-5 Mini',
                    contextWindow: 128000,
                    description: '旧版快速模型',
                    deprecated: true,
                },
                {
                    id: 'gpt-5-nano',
                    displayName: 'GPT-5 Nano',
                    contextWindow: 128000,
                    description: '旧版经济模型',
                    deprecated: true,
                },
                // GPT-4.1 Series (1M context)
                {
                    id: 'gpt-4.1',
                    displayName: 'GPT-4.1 (1M上下文，代码优化)',
                    contextWindow: 1000000,
                    description: '最强非推理模型，超长上下文',
                },
                {
                    id: 'gpt-4.1-mini',
                    displayName: 'GPT-4.1 Mini (1M上下文)',
                    contextWindow: 1000000,
                    description: 'Mini版本，1M上下文',
                },
                {
                    id: 'gpt-4.1-nano',
                    displayName: 'GPT-4.1 Nano (最快)',
                    contextWindow: 1000000,
                    description: '最快速度，1M上下文',
                },
                // o-Series Reasoning
                {
                    id: 'o3',
                    displayName: 'o3 (推理模型，200K)',
                    contextWindow: 200000,
                    description: '推理模型，已被GPT-5接替',
                },
                {
                    id: 'o3-pro',
                    displayName: 'o3-pro (最强推理)',
                    contextWindow: 200000,
                    description: '最强推理，更多计算资源',
                },
                {
                    id: 'o4-mini',
                    displayName: 'o4-mini (高效推理)',
                    contextWindow: 128000,
                    description: '高效推理，已被GPT-5 Mini接替',
                },
                {
                    id: 'o3-mini',
                    displayName: 'o3-mini (经济推理)',
                    contextWindow: 128000,
                    description: 'o3系列mini模型',
                },
                {
                    id: 'o1',
                    displayName: 'o1 (推理模型)',
                    contextWindow: 200000,
                    description: '早期推理模型',
                },
                // GPT-4o Series
                {
                    id: 'gpt-4o',
                    displayName: 'GPT-4o (128K上下文)',
                    contextWindow: 128000,
                    description: 'GPT-4o，平衡性能和成本',
                    deprecated: true,
                },
                {
                    id: 'gpt-4o-mini',
                    displayName: 'GPT-4o Mini (快速、经济)',
                    contextWindow: 128000,
                    description: 'Mini版本，快速且经济',
                    deprecated: true,
                },
                // Legacy
                {
                    id: 'gpt-4-turbo-preview',
                    displayName: 'GPT-4 Turbo Preview (128K)',
                    contextWindow: 128000,
                    description: 'GPT-4 Turbo预览版，兼容旧配置',
                    deprecated: true,
                },
                {
                    id: 'gpt-4-turbo',
                    displayName: 'GPT-4 Turbo (128K)',
                    contextWindow: 128000,
                    description: 'GPT-4 Turbo，高性能',
                    deprecated: true,
                },
                {
                    id: 'gpt-4',
                    displayName: 'GPT-4 (8K)',
                    contextWindow: 8192,
                    description: 'GPT-4经典版本',
                    deprecated: true,
                },
                {
                    id: 'gpt-3.5-turbo',
                    displayName: 'GPT-3.5 Turbo (16K)',
                    contextWindow: 16384,
                    description: '预算友好型模型',
                    deprecated: true,
                },
            ],
            features: {
                supportsStreaming: true,
                supportsSystemPrompt: true,
                supportsVision: true,
                supportsFunctionCalling: true,
            },
            defaults: {
                maxTokens: 4096,
                temperature: 1,
            },
            badgeColors: { bg: '#E8F5E9', border: '#81C784' },
        };
    }

    private convertResponsesInput(messages: Message[]): ResponsesInputMessage[] {
        const normalized = this.normalizeMessages(messages);
        const converted: ResponsesInputMessage[] = [];

        for (const msg of normalized) {
            if (typeof msg.content !== 'string' && Array.isArray(msg.content)) {
                converted.push({
                    role: msg.role,
                    content: this.convertResponsesContentBlocks(msg.content),
                });
            } else {
                converted.push({
                    role: msg.role,
                    content: msg.content as string,
                });
            }
        }

        return converted;
    }

    private convertResponsesContentBlocks(blocks: ContentBlock[]): ResponsesContentPart[] {
        const parts: ResponsesContentPart[] = [];

        for (const block of blocks) {
            if (block.type === 'text') {
                parts.push({ type: 'input_text', text: block.text });
            } else if (block.type === 'image') {
                const imageUrl = block.source.type === 'base64'
                    ? `data:${block.source.media_type};base64,${block.source.data}`
                    : block.source.data;
                parts.push({ type: 'input_image', image_url: imageUrl, detail: 'auto' });
            }
        }

        return parts;
    }

    /**
     * Convert messages to OpenAI format
     * OpenAI uses separate system message instead of system prompt in options
     * Supports multimodal content (text + images)
     */
    private convertMessages(messages: Message[], systemPrompt?: string): Array<{
        role: string;
        content: string | ChatCompletionContentPart[];
    }> {
        const normalized = this.normalizeMessages(messages);
        const converted: Array<{ role: string; content: string | ChatCompletionContentPart[] }> = [];

        // Add system message if provided
        // Convert user/assistant messages
        for (const msg of normalized) {
            // Check if content is multimodal (ContentBlock array)
            if (typeof msg.content !== 'string' && Array.isArray(msg.content)) {
                const openaiContent = this.convertContentBlocks(msg.content);
                converted.push({
                    role: msg.role,
                    content: openaiContent,
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
     * Convert ContentBlock array to OpenAI's ChatCompletionContentPart array
     */
    private convertContentBlocks(blocks: ContentBlock[]): ChatCompletionContentPart[] {
        const parts: ChatCompletionContentPart[] = [];

        for (const block of blocks) {
            if (block.type === 'text') {
                parts.push({
                    type: 'text',
                    text: block.text,
                } as ChatCompletionContentPartText);
            } else if (block.type === 'image') {
                // OpenAI uses image_url format with data URL for base64 images
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
                        detail: 'auto', // Let OpenAI decide the detail level
                    },
                } as ChatCompletionContentPartImage);
            }
        }

        return parts;
    }
}
