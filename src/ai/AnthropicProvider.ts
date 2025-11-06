/**
 * Anthropic Claude AI Provider Implementation
 * Wraps Anthropic SDK for use with the AIProvider interface
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Message } from '../claude/types';
import type {
    AIProvider,
    AIProviderType,
    AIModelConfig,
    AIRequestOptions,
} from './types';

export class AnthropicProvider implements AIProvider {
    readonly providerType: AIProviderType = 'anthropic';
    readonly providerName = 'Anthropic Claude';

    private client: Anthropic;
    private config: AIModelConfig;

    constructor(config: AIModelConfig) {
        const validationResult = this.validateConfig(config);
        if (validationResult !== true) {
            throw new Error(`Invalid Anthropic config: ${validationResult}`);
        }

        this.config = config;
        this.client = new Anthropic({
            apiKey: config.apiKey,
            baseURL: config.baseURL,
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
        if (!config.apiKey || config.apiKey.trim() === '') {
            return 'API key is required';
        }

        if (!config.modelId || config.modelId.trim() === '') {
            return 'Model ID is required';
        }

        // Validate model ID format (should start with 'claude-')
        if (!config.modelId.startsWith('claude-')) {
            return 'Invalid model ID: must start with "claude-"';
        }

        if (config.baseURL && !/^https?:\/\/.+/.test(config.baseURL)) {
            return 'Base URL must be a valid HTTP(S) URL';
        }

        return true;
    }

    getAvailableModels(): string[] {
        return [
            'claude-3-5-sonnet-20241022',
            'claude-3-5-sonnet-20240620',
            'claude-3-opus-20240229',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307',
        ];
    }
}
