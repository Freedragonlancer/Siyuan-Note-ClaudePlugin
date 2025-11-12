/**
 * xAI Grok AI Provider Implementation
 * xAI's Grok API is OpenAI-compatible, so we extend OpenAIProvider
 */

import { OpenAIProvider } from './OpenAIProvider';
import type { AIModelConfig, ParameterLimits } from '../types';

export class XAIProvider extends OpenAIProvider {
    readonly providerType = 'xai' as const;
    readonly providerName = 'xAI Grok';

    constructor(config: AIModelConfig) {
        // Override baseURL to xAI endpoint if not provided
        const xaiConfig = {
            ...config,
            baseURL: config.baseURL || 'https://api.x.ai/v1',
        };
        super(xaiConfig);
    }

    validateConfig(config: AIModelConfig): true | string {
        // Call base validation from BaseAIProvider (skip OpenAIProvider's model validation)
        const baseValidation = super.validateConfig(config);
        if (baseValidation !== true) {
            return baseValidation;
        }

        // xAI-specific validation (optional, since API is OpenAI-compatible)
        const validModels = this.getAvailableModels();
        if (!validModels.includes(config.modelId) && !config.modelId.startsWith('grok-')) {
            console.warn(`[XAIProvider] Unknown model: ${config.modelId}, proceeding anyway`);
        }

        return true;
    }

    getAvailableModels(): string[] {
        return [
            'grok-beta',
            'grok-vision-beta',
        ];
    }

    getMaxTokenLimit(model: string): number {
        const limits: Record<string, number> = {
            'grok-beta': 8192,
            'grok-vision-beta': 8192,
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

        return 8192; // Safe default
    }

    getParameterLimits(): ParameterLimits {
        // Note: this.config might not be set yet if called during construction validation
        // Use safe defaults for max tokens
        const modelId = this.config?.modelId || 'grok-beta';
        return {
            temperature: { min: 0, max: 2, default: 1 },
            maxTokens: { min: 1, max: this.getMaxTokenLimit(modelId), default: 8192 },
            topP: { min: 0, max: 1, default: 1 },
        };
    }
}
