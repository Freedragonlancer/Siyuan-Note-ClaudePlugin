/**
 * OpenAI AI Provider Implementation
 * Supports GPT-4, GPT-3.5-turbo and other OpenAI models
 */

import OpenAI from 'openai';
import type { Message } from '../../claude/types';
import type {
    AIModelConfig,
    AIRequestOptions,
    ParameterLimits,
    ProviderMetadata,
} from '../types';
import { BaseAIProvider } from '../BaseAIProvider';

export class OpenAIProvider extends BaseAIProvider {
    readonly providerType = 'openai' as const;
    readonly providerName = 'OpenAI';

    private client: OpenAI;

    constructor(config: AIModelConfig) {
        super(config);

        // Debug: Log configuration (API key excluded for security)
        console.log(`[OpenAIProvider] Model ID: ${config.modelId}`);
        console.log(`[OpenAIProvider] Base URL: ${config.baseURL || 'https://api.openai.com/v1'}`);

        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL || 'https://api.openai.com/v1',
            timeout: 120000, // 120 seconds
            maxRetries: 2,
            dangerouslyAllowBrowser: true,
        });
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

        // Non-streaming mode
        try {
            const completion = await this.client.chat.completions.create({
                model: this.config.modelId,
                messages: this.convertMessages(messages, options?.systemPrompt),
                max_tokens: this.getEffectiveMaxTokens(options),
                temperature: this.getEffectiveTemperature(options),
                stop: options?.stopSequences,
            }, {
                signal: options?.signal,
            });

            return completion.choices[0]?.message?.content || '';
        } catch (error) {
            this.handleError(error, 'sendMessage');
        }
    }

    async streamMessage(messages: Message[], options?: AIRequestOptions): Promise<void> {
        this.validateStreamingOptions(options);

        try {
            const stream = await this.client.chat.completions.create({
                model: this.config.modelId,
                messages: this.convertMessages(messages, options?.systemPrompt),
                max_tokens: this.getEffectiveMaxTokens(options),
                temperature: this.getEffectiveTemperature(options),
                stop: options?.stopSequences,
                stream: true,
            }, {
                signal: options?.signal,
            });

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

    getAvailableModels(): string[] {
        return [
            // GPT-4o Series (Latest - 2024-2025)
            'chatgpt-4o-latest',              // Latest ChatGPT-4o
            'gpt-4o',                         // GPT-4o (recommended)
            'gpt-4o-2024-11-20',              // Latest snapshot
            'gpt-4o-2024-08-06',              // August 2024 snapshot
            'gpt-4o-2024-05-13',              // May 2024 snapshot
            'gpt-4o-mini',                    // Mini version (fast & cheap)
            'gpt-4o-mini-2024-07-18',         // July 2024 mini snapshot
            
            // o-Series Reasoning Models (2025)
            'o1',                             // Latest o1
            'o1-2024-12-17',                  // December 2024 snapshot
            'o1-preview',                     // o1 Preview
            'o1-mini',                        // o1 Mini (cost-efficient)
            'o1-mini-2024-09-12',             // September 2024 mini snapshot
            'o3-mini',                        // o3-mini (Jan 2025)
            
            // GPT-4 Turbo Series (Legacy but still supported)
            'gpt-4-turbo',                    // Latest GPT-4 Turbo
            'gpt-4-turbo-2024-04-09',         // April 2024 snapshot
            'gpt-4-turbo-preview',            // Turbo Preview
            'gpt-4-0125-preview',             // January 2025 preview
            
            // GPT-4 Classic Series
            'gpt-4',                          // GPT-4
            'gpt-4-32k',                      // GPT-4 32k context
            
            // GPT-3.5 Series (Budget option)
            'gpt-3.5-turbo',                  // Latest 3.5 Turbo
            'gpt-3.5-turbo-16k',              // 3.5 Turbo 16k context
        ];
    }

    getMaxTokenLimit(model: string): number {
        const limits: Record<string, number> = {
            // GPT-4o Series (16k output tokens, 128k context)
            'chatgpt-4o-latest': 16384,
            'gpt-4o': 16384,
            'gpt-4o-2024-11-20': 16384,
            'gpt-4o-2024-08-06': 16384,
            'gpt-4o-2024-05-13': 16384,
            'gpt-4o-mini': 16384,
            'gpt-4o-mini-2024-07-18': 16384,
            
            // o-Series Reasoning Models (varies by model)
            'o1': 100000,                     // 100k output tokens, 200k context
            'o1-2024-12-17': 100000,
            'o1-preview': 32768,              // 32k output tokens, 128k context
            'o1-mini': 65536,                 // 65k output tokens, 128k context
            'o1-mini-2024-09-12': 65536,
            'o3-mini': 65536,                 // Similar to o1-mini
            
            // GPT-4 Turbo Series (4k-8k output, 128k context)
            'gpt-4-turbo': 4096,
            'gpt-4-turbo-2024-04-09': 4096,
            'gpt-4-turbo-preview': 4096,
            'gpt-4-0125-preview': 4096,
            
            // GPT-4 Classic Series
            'gpt-4': 8192,                    // 8k output, 8k context
            'gpt-4-32k': 32768,               // 32k output, 32k context
            
            // GPT-3.5 Series
            'gpt-3.5-turbo': 4096,           // 4k output, 16k context
            'gpt-3.5-turbo-16k': 16384,      // 16k output, 16k context
        };

        // Try exact match first
        if (limits[model]) {
            return limits[model];
        }

        // Try prefix match (e.g., "gpt-4o-2025-01-15" matches "gpt-4o")
        for (const [key, value] of Object.entries(limits)) {
            if (model.startsWith(key)) {
                return value;
            }
        }

        return 4096; // Safe default
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
            description: 'GPT-4, GPT-3.5 等 OpenAI 模型',
            icon: '⚡',
            apiKeyUrl: 'https://platform.openai.com/api-keys',
            defaultBaseURL: 'https://api.openai.com/v1',
            defaultModel: 'gpt-4o',
            models: [
                {
                    id: 'chatgpt-4o-latest',
                    displayName: 'ChatGPT-4o Latest (推荐)',
                    contextWindow: 128000,
                    description: '最新ChatGPT-4o，自动更新',
                    recommended: true,
                },
                {
                    id: 'gpt-4o',
                    displayName: 'GPT-4o (128K上下文)',
                    contextWindow: 128000,
                    description: 'GPT-4o，平衡性能和成本',
                },
                {
                    id: 'gpt-4o-mini',
                    displayName: 'GPT-4o Mini (快速、经济)',
                    contextWindow: 128000,
                    description: 'Mini版本，快速且经济',
                },
                {
                    id: 'o1',
                    displayName: 'o1 (推理模型，200K)',
                    contextWindow: 200000,
                    description: '推理模型，适合复杂问题',
                },
                {
                    id: 'o1-mini',
                    displayName: 'o1 Mini (128K，经济推理)',
                    contextWindow: 128000,
                    description: '经济型推理模型',
                },
                {
                    id: 'o3-mini',
                    displayName: 'o3-mini (最新推理模型)',
                    contextWindow: 128000,
                    description: 'o3系列mini模型 (2025-01)',
                },
                {
                    id: 'gpt-4-turbo',
                    displayName: 'GPT-4 Turbo (128K)',
                    contextWindow: 128000,
                    description: 'GPT-4 Turbo，高性能',
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
                    displayName: 'GPT-3.5 Turbo (16K，预算选择)',
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
        };
    }

    /**
     * Convert messages to OpenAI format
     * OpenAI uses separate system message instead of system prompt in options
     */
    private convertMessages(messages: Message[], systemPrompt?: string): Array<{ role: string; content: string }> {
        const normalized = this.normalizeMessages(messages);
        const converted: Array<{ role: string; content: string }> = [];

        // Add system message if provided
        if (systemPrompt && systemPrompt.trim()) {
            converted.push({
                role: 'system',
                content: systemPrompt.trim(),
            });
        }

        // Convert user/assistant messages
        for (const msg of normalized) {
            converted.push({
                role: msg.role,
                content: msg.content,
            });
        }

        return converted;
    }
}
