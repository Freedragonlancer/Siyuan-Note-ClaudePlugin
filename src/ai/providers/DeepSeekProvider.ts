/**
 * DeepSeek AI Provider Implementation
 * DeepSeek API is OpenAI-compatible with special handling for reasoning models
 */

import { OpenAIProvider } from './OpenAIProvider';
import type { Message } from '../../claude/types';
import type { AIModelConfig, AIRequestOptions, ParameterLimits } from '../types';

export class DeepSeekProvider extends OpenAIProvider {
    readonly providerType = 'deepseek' as const;
    readonly providerName = 'DeepSeek';

    constructor(config: AIModelConfig) {
        // Override baseURL to DeepSeek endpoint if not provided
        const deepseekConfig = {
            ...config,
            baseURL: config.baseURL || 'https://api.deepseek.com/v1',
        };
        super(deepseekConfig);
    }

    async sendMessage(messages: Message[], options?: AIRequestOptions): Promise<string> {
        // For reasoning models, override temperature to undefined
        const adjustedOptions = this.isReasoningModel()
            ? { ...options, temperature: undefined }
            : options;

        return super.sendMessage(messages, adjustedOptions);
    }

    async streamMessage(messages: Message[], options?: AIRequestOptions): Promise<void> {
        // For reasoning models, override temperature to undefined
        const adjustedOptions = this.isReasoningModel()
            ? { ...options, temperature: undefined }
            : options;

        return super.streamMessage(messages, adjustedOptions);
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

    getAvailableModels(): string[] {
        return [
            'deepseek-chat',
            'deepseek-coder',
            'deepseek-reasoner',  // Reasoning model
        ];
    }

    getMaxTokenLimit(model: string): number {
        const limits: Record<string, number> = {
            'deepseek-chat': 4096,
            'deepseek-coder': 4096,
            'deepseek-reasoner': 8192,
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

        return 4096; // Safe default
    }

    getParameterLimits(): ParameterLimits {
        // Note: this.config might not be set yet if called during construction validation
        // Use safe defaults
        const modelId = this.config?.modelId || 'deepseek-chat';
        const isReasoning = modelId.includes('reasoner');
        
        // Reasoning model doesn't support temperature/top_p
        if (isReasoning) {
            return {
                temperature: { min: 0, max: 0, default: 0 }, // Disabled for reasoning
                maxTokens: { min: 1, max: this.getMaxTokenLimit(modelId), default: 4096 },
                topP: { min: 0, max: 0, default: 0 }, // Disabled for reasoning
            };
        }

        return {
            temperature: { min: 0, max: 2, default: 1 },
            maxTokens: { min: 1, max: this.getMaxTokenLimit(modelId), default: 4096 },
            topP: { min: 0, max: 1, default: 1 },
        };
    }

    /**
     * Check if current model is a reasoning model
     * Reasoning models don't support temperature/top_p parameters
     */
    private isReasoningModel(): boolean {
        return this.config.modelId.includes('reasoner');
    }
}
