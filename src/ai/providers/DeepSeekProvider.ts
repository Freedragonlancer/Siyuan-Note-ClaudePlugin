/**
 * DeepSeek AI Provider Implementation
 * DeepSeek API is OpenAI-compatible with special handling for reasoning models
 */

import { OpenAIProvider } from './OpenAIProvider';
import type { Message } from '../../claude/types';
import type { AIModelConfig, AIRequestOptions, ParameterLimits, ProviderMetadata } from '../types';

export class DeepSeekProvider extends OpenAIProvider {
    readonly providerType = 'deepseek' as const;
    readonly providerName = 'DeepSeek';

    constructor(config: AIModelConfig) {
        // Override baseURL to DeepSeek endpoint if not provided
        const deepseekConfig = {
            ...config,
            baseURL: config.baseURL || 'https://api.deepseek.com',
        };
        super(deepseekConfig);
    }

    async sendMessage(messages: Message[], options?: AIRequestOptions): Promise<string> {
        // For reasoning models, override temperature to undefined
        const adjustedOptions = this.shouldOmitSamplingParams(options)
            ? { ...options, temperature: undefined }
            : options;

        return super.sendMessage(messages, adjustedOptions);
    }

    async streamMessage(messages: Message[], options?: AIRequestOptions): Promise<void> {
        // For reasoning models, override temperature to undefined
        const adjustedOptions = this.shouldOmitSamplingParams(options)
            ? { ...options, temperature: undefined }
            : options;

        return super.streamMessage(messages, adjustedOptions);
    }


    /**
     * DeepSeek reasoning models reject sampling parameters. Remove them after
     * OpenAI-compatible params are built so saved global defaults cannot leak in.
     */
    protected buildCompletionParams(messages: Message[], options?: AIRequestOptions, streaming: boolean = false) {
        const params = super.buildCompletionParams(messages, options, streaming);

        const thinking = this.resolveThinkingMode(options);

        if (thinking !== undefined) {
            params.thinking = { type: thinking ? 'enabled' : 'disabled' };
        }

        if (thinking) {
            const effort = options?.reasoningEffort || this.config.reasoningEffort || 'high';
            params.reasoning_effort = effort === 'max' ? 'max' : 'high';
        }

        if (this.shouldOmitSamplingParams(options)) {
            delete params.temperature;
            delete params.top_p;
        }

        return params;
    }

    validateConfig(config: AIModelConfig): true | string {
        // Call base validation from BaseAIProvider
        const baseValidation = super.validateConfig(config);
        if (baseValidation !== true) {
            return baseValidation;
        }

        // DeepSeek-specific validation
        const validModels = this.getAvailableModels();
        if (!validModels.some(model => config.modelId.startsWith(model.split('-')[0]))) {
            console.warn(`[DeepSeekProvider] Unknown model: ${config.modelId}, proceeding anyway`);
        }

        return true;
    }

    // getAvailableModels() - inherited from BaseAIProvider, derives from getMetadata()

    getMaxTokenLimit(model: string): number {
        const limits: Record<string, number> = {
            'deepseek-v4-flash': 393216,    // DeepSeek-V4 Flash, 1M context, 384K max output
            'deepseek-v4-pro': 393216,      // DeepSeek-V4 Pro, 1M context, 384K max output
            'deepseek-chat': 393216,        // Deprecated 2026-07-24, maps to V4 Flash non-thinking
            'deepseek-reasoner': 393216,    // Deprecated 2026-07-24, maps to V4 Flash thinking
        };

        // Try exact match first
        if (limits[model]) {
            return limits[model];
        }

        // Try prefix match
        for (const [key, value] of Object.entries(limits)) {
            if (model.startsWith(key)) {
                return value;
            }
        }

        return 8192; // Safe fallback for unknown/relay models
    }

    getParameterLimits(): ParameterLimits {
        // Note: this.config might not be set yet if called during construction validation
        // Use safe defaults
        const modelId = this.config?.modelId || 'deepseek-v4-flash';
        const isReasoning = this.resolveThinkingMode();

        // Thinking mode ignores sampling params, but keep normal UI/validation limits
        // because the provider removes temperature/top_p before sending requests.
        if (isReasoning) {
            return {
                temperature: { min: 0, max: 2, default: 1 },
                maxTokens: { min: 1, max: this.getMaxTokenLimit(modelId), default: 4096 },
                topP: { min: 0, max: 1, default: 1 },
            };
        }

        return {
            temperature: { min: 0, max: 2, default: 1 },
            maxTokens: { min: 1, max: this.getMaxTokenLimit(modelId), default: 4096 },
            topP: { min: 0, max: 1, default: 1 },
        };
    }

    getMetadata(): ProviderMetadata {
        return {
            type: 'deepseek',
            displayName: 'DeepSeek',
            description: 'DeepSeek-V4 Flash / Pro 模型，支持 Thinking 开关与 effort',
            icon: '🧠',
            apiKeyUrl: 'https://platform.deepseek.com/api_keys',
            defaultBaseURL: 'https://api.deepseek.com',
            defaultModel: 'deepseek-v4-flash',
            models: [
                {
                    id: 'deepseek-v4-flash',
                    displayName: 'DeepSeek V4 Flash (推荐)',
                    contextWindow: 1000000,
                    description: 'DeepSeek-V4-Flash，1M上下文，384K输出，支持Thinking开关',
                    recommended: true,
                },
                {
                    id: 'deepseek-v4-pro',
                    displayName: 'DeepSeek V4 Pro',
                    contextWindow: 1000000,
                    description: 'DeepSeek-V4-Pro，1M上下文，384K输出，支持Thinking与high/max effort',
                },
                {
                    id: 'deepseek-chat',
                    displayName: 'DeepSeek Chat (兼容，将弃用)',
                    contextWindow: 1000000,
                    description: '兼容别名：对应deepseek-v4-flash非思考模式，官方计划2026-07-24弃用',
                    deprecated: true,
                },
                {
                    id: 'deepseek-reasoner',
                    displayName: 'DeepSeek Reasoner (兼容，将弃用)',
                    contextWindow: 1000000,
                    description: '兼容别名：对应deepseek-v4-flash思考模式，官方计划2026-07-24弃用，不支持temperature/top_p',
                    deprecated: true,
                },
            ],
            features: {
                supportsStreaming: true,
                supportsSystemPrompt: true,
                supportsVision: false,
                supportsFunctionCalling: false,
            },
            defaults: {
                maxTokens: 4096,
                temperature: 1,
            },
            badgeColors: { bg: '#E8EAF6', border: '#9FA8DA' },
        };
    }

    /**
     * Check if current model is a reasoning model
     * Reasoning models don't support temperature/top_p parameters
     */
    private isReasoningModel(): boolean {
        return this.config.modelId.includes('reasoner');
    }

    private isV4Model(): boolean {
        return this.config.modelId.startsWith('deepseek-v4');
    }

    /**
     * DeepSeek V4 supports explicit thinking toggles. Legacy aliases keep their
     * fixed behavior: chat = non-thinking, reasoner = thinking.
     */
    private resolveThinkingMode(options?: AIRequestOptions): boolean | undefined {
        if (this.isReasoningModel()) return true;
        if (this.config.modelId === 'deepseek-chat') return false;
        if (!this.isV4Model()) return undefined;

        if (options?.thinkingMode !== undefined) {
            return options.thinkingMode;
        }

        return this.config.thinkingMode ?? true;
    }

    private shouldOmitSamplingParams(options?: AIRequestOptions): boolean {
        return this.resolveThinkingMode(options) === true;
    }
}
