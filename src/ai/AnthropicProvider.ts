/**
 * Anthropic Claude AI Provider Implementation
 * Wraps Anthropic SDK for use with the AIProvider interface
 */

import Anthropic from '@anthropic-ai/sdk';
import type { TextBlock, ImageBlockParam } from '@anthropic-ai/sdk/resources/messages';
import type { Message, ContentBlock, ImageContent, TextContent } from '../claude/types';
import { normalizeContent, extractText } from '../claude/types';
import { sanitizeForAI } from '../utils/Security';
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
    private thinkingMode: boolean;
    private thinkingBudget: number;

    constructor(config: AIModelConfig) {
        super(config);

        // v0.13.0: Extended Thinking mode support
        this.thinkingMode = config.thinkingMode ?? false;
        this.thinkingBudget = config.thinkingBudget ?? 10000;  // Default 10K tokens

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

    /**
     * Convert our Message format to Anthropic SDK format
     * Handles both text-only and multimodal messages
     */
    private convertMessages(messages: Message[]): Array<{
        role: 'user' | 'assistant';
        content: string | Array<{ type: 'text'; text: string } | ImageBlockParam>;
    }> {
        return messages
            .map(m => {
                // If content is a simple string, sanitize and return
                if (typeof m.content === 'string') {
                    const sanitized = sanitizeForAI(m.content);
                    // Skip empty messages after sanitization
                    if (!sanitized.trim()) {
                        console.warn('[AnthropicProvider] Message content empty after sanitization, skipping');
                        return null;
                    }
                    return {
                        role: m.role as 'user' | 'assistant',
                        content: sanitized,
                    };
                }

                // Convert ContentBlock[] to Anthropic format
                const anthropicContent: Array<{ type: 'text'; text: string } | ImageBlockParam> = [];

                for (const block of m.content) {
                    if (block.type === 'text') {
                        // Sanitize text content and skip empty blocks
                        const sanitizedText = sanitizeForAI(block.text);
                        if (sanitizedText.trim()) {
                            anthropicContent.push({
                                type: 'text',
                                text: sanitizedText,
                            });
                        }
                    } else if (block.type === 'image') {
                        // Anthropic only supports base64 images
                        if (block.source.type === 'base64') {
                            anthropicContent.push({
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: block.source.media_type,
                                    data: block.source.data,
                                },
                            });
                        } else if (block.source.type === 'url') {
                            // For URL images, we need to fetch and convert to base64
                            // This should be done before calling sendMessage
                            // For now, log a warning and skip
                            console.warn('[AnthropicProvider] URL images not directly supported, skipping. Pre-convert to base64.');
                        }
                    }
                }

                // If no valid content after conversion, return null to filter out
                if (anthropicContent.length === 0) {
                    console.warn('[AnthropicProvider] Message has no valid content after conversion, skipping');
                    return null;
                }

                return {
                    role: m.role as 'user' | 'assistant',
                    content: anthropicContent,
                };
            })
            // Filter out null entries (messages with no valid content)
            .filter((m): m is NonNullable<typeof m> => m !== null);
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

        // Convert and validate messages
        const convertedMessages = this.convertMessages(messages);
        if (convertedMessages.length === 0) {
            throw new Error('No valid message content to send. The message may contain only control characters or be empty after sanitization.');
        }

        const thinkingEnabled = options?.thinkingMode ?? this.thinkingMode;
        const thinkingBudget = options?.thinkingBudget ?? this.thinkingBudget;

        // Non-streaming mode
        const response = await this.client.messages.create({
            model: this.config.modelId,
            max_tokens: options?.maxTokens || this.config.maxTokens || 4096,
            temperature: options?.temperature ?? this.config.temperature ?? 0.7,
            system: options?.systemPrompt || '',
            messages: convertedMessages,
            stop_sequences: options?.stopSequences,
            // v0.13.0: Extended Thinking mode (Claude 3.7+, Sonnet 4+, Opus 4+)
            ...(thinkingEnabled && {
                thinking: {
                    type: 'enabled' as const,
                    budget_tokens: thinkingBudget,
                },
            }),
        } as any, {
            signal: options?.signal,
        });

        // Extract text from response (thinking blocks are separate)
        const textContent = response.content.find(c => c.type === 'text');
        return textContent && 'text' in textContent ? textContent.text : '';
    }

    async streamMessage(messages: Message[], options?: AIRequestOptions): Promise<void> {
        // Convert and validate messages
        const convertedMessages = this.convertMessages(messages);
        if (convertedMessages.length === 0) {
            throw new Error('No valid message content to send. The message may contain only control characters or be empty after sanitization.');
        }

        const thinkingEnabled = options?.thinkingMode ?? this.thinkingMode;
        const thinkingBudget = options?.thinkingBudget ?? this.thinkingBudget;

        const stream = await this.client.messages.create({
            model: this.config.modelId,
            max_tokens: options?.maxTokens || this.config.maxTokens || 4096,
            temperature: options?.temperature ?? this.config.temperature ?? 0.7,
            system: options?.systemPrompt || '',
            messages: convertedMessages,
            stop_sequences: options?.stopSequences,
            stream: true,
            // v0.13.0: Extended Thinking mode (Claude 3.7+, Sonnet 4+, Opus 4+)
            ...(thinkingEnabled && {
                thinking: {
                    type: 'enabled' as const,
                    budget_tokens: thinkingBudget,
                },
            }),
        } as any, {
            signal: options?.signal,
        });

        for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta') {
                if (chunk.delta?.type === 'text_delta') {
                    const text = chunk.delta.text || '';
                    options?.onStream?.(text);
                }
                // v0.13.0: Thinking deltas can be captured here if needed
                // Currently we only stream the final text output, not thinking process
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
            return 'AnthropicProvider only supports Claude models (model ID must start with "claude-")';
        }

        return true;
    }

    // getAvailableModels() - inherited from BaseAIProvider, derives from getMetadata()

    getMaxTokenLimit(model: string): number {
        if (model.includes('claude-sonnet-4') || model.includes('claude-3-7-sonnet')) {
            return 64000;
        }
        if (model.includes('claude-opus-4')) {
            return 32000;
        }
        if (model.includes('claude-3-5-sonnet')) {
            return 8192;
        }
        return 4096; // Unknown/legacy safe default
    }

    getParameterLimits(): ParameterLimits {
        const modelId = this.config?.modelId || 'claude-sonnet-4-5-20250929';
        return {
            temperature: { min: 0, max: 1, default: 0.7 },
            maxTokens: { min: 1, max: this.getMaxTokenLimit(modelId), default: 4096 },
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
            defaultModel: 'claude-sonnet-4-20250514',
            models: [
                {
                    id: 'claude-sonnet-4-20250514',
                    displayName: 'Claude Sonnet 4 (推荐)',
                    contextWindow: 200000,
                    description: '最新稳定Sonnet模型，平衡推理、编码和成本',
                    recommended: true,
                },
                {
                    id: 'claude-opus-4-1-20250805',
                    displayName: 'Claude Opus 4.1 (最强)',
                    contextWindow: 200000,
                    description: 'Claude Opus 4.1，复杂推理和编码旗舰模型',
                    recommended: true,
                },
                {
                    id: 'claude-opus-4-20250514',
                    displayName: 'Claude Opus 4',
                    contextWindow: 200000,
                    description: 'Claude Opus 4旗舰模型',
                },
                {
                    id: 'claude-3-7-sonnet-20250219',
                    displayName: 'Claude 3.7 Sonnet',
                    contextWindow: 200000,
                    description: '支持扩展思考的上一代Sonnet模型',
                },
                {
                    id: 'claude-3-5-sonnet-20241022',
                    displayName: 'Claude 3.5 Sonnet',
                    contextWindow: 200000,
                    description: '上一代Sonnet模型',
                    deprecated: true,
                },
                {
                    id: 'claude-3-5-haiku-20241022',
                    displayName: 'Claude 3.5 Haiku',
                    contextWindow: 200000,
                    description: '快速低成本模型',
                    deprecated: true,
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
            defaults: {
                maxTokens: 4096,
                temperature: 0.7,
                thinkingMode: false,
                thinkingBudget: 10000,
            },
            badgeColors: { bg: '#F5E6D3', border: '#D4A574' },
        };
    }
}
