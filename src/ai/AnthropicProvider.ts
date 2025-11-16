/**
 * Anthropic Claude AI Provider Implementation
 * Wraps Anthropic SDK for use with the AIProvider interface
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Message } from '../claude/types';
import type {
    AIModelConfig,
    AIRequestOptions,
    ParameterLimits,
    ProviderMetadata,
} from './types';
import { BaseAIProvider } from './BaseAIProvider';

export class AnthropicProvider extends BaseAIProvider {
    readonly providerType = 'anthropic' as const;
    readonly providerName = 'Anthropic Claude';

    private client: Anthropic;

    constructor(config: AIModelConfig) {
        super(config);
        
        // Normalize baseURL to prevent duplicate /v1 paths
        // Users commonly provide "https://proxy.com/api/v1" for reverse proxies
        // But Anthropic SDK automatically appends "/v1/messages"
        // So we strip trailing /v1 to avoid /v1/v1/messages
        let normalizedBaseURL = config.baseURL;
        if (normalizedBaseURL) {
            // Remove trailing slashes first
            normalizedBaseURL = normalizedBaseURL.replace(/\/+$/, '');
            // Remove trailing /v1 if present
            if (normalizedBaseURL.endsWith('/v1')) {
                normalizedBaseURL = normalizedBaseURL.slice(0, -3);
            }
        }
        
        this.client = new Anthropic({
            apiKey: config.apiKey,
            baseURL: normalizedBaseURL,
            dangerouslyAllowBrowser: true,
            timeout: 120000, // 120 seconds
            maxRetries: 2,
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
        const response = await this.client.messages.create({
            model: this.config.modelId,
            max_tokens: options?.maxTokens || this.config.maxTokens || 4096,
            temperature: options?.temperature ?? this.config.temperature ?? 0.7,
            system: options?.systemPrompt || '',
            messages: messages.map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            })),
            stop_sequences: options?.stopSequences,
        }, {
            signal: options?.signal,
        });

        // Extract text from response
        const textContent = response.content.find(c => c.type === 'text');
        return textContent && 'text' in textContent ? textContent.text : '';
    }

    async streamMessage(messages: Message[], options?: AIRequestOptions): Promise<void> {
        const stream = await this.client.messages.create({
            model: this.config.modelId,
            max_tokens: options?.maxTokens || this.config.maxTokens || 4096,
            temperature: options?.temperature ?? this.config.temperature ?? 0.7,
            system: options?.systemPrompt || '',
            messages: messages.map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            })),
            stop_sequences: options?.stopSequences,
            stream: true,
        }, {
            signal: options?.signal,
        });

        for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta') {
                if (chunk.delta?.type === 'text_delta') {
                    const text = chunk.delta.text || '';
                    options?.onStream?.(text);
                }
            }
        }
    }

    validateConfig(config: AIModelConfig): true | string {
        // Call base validation first
        const baseValidation = super.validateConfig(config);
        if (baseValidation !== true) {
            return baseValidation;
        }

        // Validate model ID format (should start with 'claude-')
        if (!config.modelId.startsWith('claude-')) {
            return 'Invalid model ID: must start with "claude-"';
        }

        return true;
    }

    getAvailableModels(): string[] {
        return [
            'claude-sonnet-4-5-20250929',
            'claude-sonnet-4-20250514',
            'claude-opus-4-20250514',
            'claude-3-7-sonnet-20250219',
            'claude-3-5-sonnet-20241022',
            'claude-3-5-haiku-20241022',
            'claude-3-5-sonnet-20240620',
            'claude-3-opus-20240229',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307',
        ];
    }

    getMaxTokenLimit(model: string): number {
        // Claude models have 200K context window but output is limited
        if (model.includes('claude-3')) {
            return 4096; // Safe default for output
        }
        return 4096;
    }

    getParameterLimits(): ParameterLimits {
        return {
            temperature: { min: 0, max: 1, default: 0.7 },
            maxTokens: { min: 1, max: 8192, default: 4096 },  // Updated 2025: Extended mode supports 8K
            topP: { min: 0, max: 1, default: 0.9 },
        };
    }

    getMetadata(): ProviderMetadata {
        return {
            type: 'anthropic',
            displayName: 'Anthropic Claude',
            description: 'Claude AI 系列 - Opus, Sonnet, Haiku',
            icon: '🤖',
            apiKeyUrl: 'https://console.anthropic.com/settings/keys',
            defaultBaseURL: 'https://api.anthropic.com',
            defaultModel: 'claude-sonnet-4-5-20250929',
            models: [
                {
                    id: 'claude-sonnet-4-5-20250929',
                    displayName: 'Claude Sonnet 4.5 (Latest, Recommended)',
                    contextWindow: 200000,
                    description: '最新Sonnet 4.5，平衡性能和成本',
                    recommended: true,
                },
                {
                    id: 'claude-sonnet-4-20250514',
                    displayName: 'Claude Sonnet 4',
                    contextWindow: 200000,
                },
                {
                    id: 'claude-opus-4-20250514',
                    displayName: 'Claude Opus 4 (Most Capable)',
                    contextWindow: 200000,
                    description: '最强能力模型',
                },
                {
                    id: 'claude-3-7-sonnet-20250219',
                    displayName: 'Claude 3.7 Sonnet',
                    contextWindow: 200000,
                },
                {
                    id: 'claude-3-5-sonnet-20241022',
                    displayName: 'Claude 3.5 Sonnet',
                    contextWindow: 200000,
                },
                {
                    id: 'claude-3-5-haiku-20241022',
                    displayName: 'Claude 3.5 Haiku (Fast)',
                    contextWindow: 200000,
                    description: '快速模型',
                },
                {
                    id: 'claude-3-opus-20240229',
                    displayName: 'Claude 3 Opus',
                    contextWindow: 200000,
                    deprecated: true,
                },
                {
                    id: 'claude-3-haiku-20240307',
                    displayName: 'Claude 3 Haiku',
                    contextWindow: 200000,
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
}
