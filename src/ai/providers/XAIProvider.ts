/**
 * xAI Grok AI Provider Implementation
 * xAI's Grok API is OpenAI-compatible, so we extend OpenAIProvider
 */

import { OpenAIProvider } from './OpenAIProvider';
import type { AIModelConfig, AIRequestOptions, ParameterLimits, ProviderMetadata } from '../types';
import type { Message } from '../../claude/types';

export class XAIProvider extends OpenAIProvider {
    readonly providerType = 'xai' as const;
    readonly providerName = 'xAI Grok';

    private thinkingMode: boolean;
    private reasoningEffort: 'low' | 'high';

    constructor(config: AIModelConfig) {
        // Override baseURL to xAI endpoint if not provided
        const xaiConfig = {
            ...config,
            baseURL: config.baseURL || 'https://api.x.ai/v1',
        };
        super(xaiConfig);

        // v0.13.0: Reasoning mode support (Grok 3+, Grok 4 Fast)
        this.thinkingMode = config.thinkingMode ?? false;
        this.reasoningEffort = config.reasoningEffort ?? 'low';  // 'low' for speed, 'high' for depth
    }

    /**
     * Override to add reasoning_effort parameter
     */
    protected buildCompletionParams(messages: Message[], options?: AIRequestOptions, streaming: boolean = false) {
        const baseParams = super['buildCompletionParams'](messages, options, streaming);

        // v0.13.0: Add reasoning_effort parameter if thinking mode enabled
        if (this.thinkingMode) {
            baseParams.reasoning_effort = this.reasoningEffort;
        }

        return baseParams;
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

    getMetadata(): ProviderMetadata {
        return {
            type: 'xai',
            displayName: 'xAI Grok',
            description: 'Grok 及其他 xAI 模型',
            icon: '🚀',
            apiKeyUrl: 'https://console.x.ai/api-keys',
            defaultBaseURL: 'https://api.x.ai/v1',
            defaultModel: 'grok-beta',
            models: [
                {
                    id: 'grok-beta',
                    displayName: 'Grok Beta (推荐)',
                    contextWindow: 131072,
                    description: 'Grok基础模型 (128K)',
                    recommended: true,
                },
                {
                    id: 'grok-vision-beta',
                    displayName: 'Grok Vision Beta (视觉)',
                    contextWindow: 131072,
                    description: 'Grok视觉模型，支持图像理解',
                },
            ],
            features: {
                supportsStreaming: true,
                supportsSystemPrompt: true,
                supportsVision: true,
                supportsFunctionCalling: false,
            },
        };
    }
}
