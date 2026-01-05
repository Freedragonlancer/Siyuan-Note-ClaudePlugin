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

    // getAvailableModels() - inherited from BaseAIProvider, derives from getMetadata()

    getMaxTokenLimit(model: string): number {
        const limits: Record<string, number> = {
            // Grok 4.1 models
            'grok-4-1-fast-reasoning': 16384,
            'grok-4-1-fast-non-reasoning': 16384,

            // Grok 4 models (256K context window)
            'grok-4-0709': 16384,
            'grok-4': 16384,

            // Legacy models
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

        return 16384; // Safe default (updated for Grok 4+)
    }

    getParameterLimits(): ParameterLimits {
        // Note: this.config might not be set yet if called during construction validation
        // Use safe defaults for max tokens
        const modelId = this.config?.modelId || 'grok-4-1-fast-reasoning';
        return {
            temperature: { min: 0, max: 2, default: 1 },
            maxTokens: { min: 1, max: this.getMaxTokenLimit(modelId), default: 16384 },
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
            defaultModel: 'grok-4-1-fast-reasoning',
            models: [
                {
                    id: 'grok-4-1-fast-reasoning',
                    displayName: 'Grok 4.1 Fast Reasoning (推荐，最新)',
                    contextWindow: 262144,
                    description: 'Grok 4.1推理模型，降低65%错误率 (256K)',
                    recommended: true,
                },
                {
                    id: 'grok-4-1-fast-non-reasoning',
                    displayName: 'Grok 4.1 Fast Non-Reasoning',
                    contextWindow: 262144,
                    description: 'Grok 4.1非推理模型，更快响应 (256K)',
                },
                {
                    id: 'grok-4-0709',
                    displayName: 'Grok 4 (256K)',
                    contextWindow: 262144,
                    description: 'Grok 4原始版本，多模态理解 (256K)',
                },
                {
                    id: 'grok-beta',
                    displayName: 'Grok Beta (传统)',
                    contextWindow: 131072,
                    description: 'Grok基础模型 (128K)',
                    deprecated: true,
                },
                {
                    id: 'grok-vision-beta',
                    displayName: 'Grok Vision Beta (传统)',
                    contextWindow: 131072,
                    description: 'Grok视觉模型，支持图像理解',
                    deprecated: true,
                },
            ],
            features: {
                supportsStreaming: true,
                supportsSystemPrompt: true,
                supportsVision: true,
                supportsFunctionCalling: false,
            },
            defaults: {
                maxTokens: 16384,
                temperature: 1,
                thinkingMode: false,
                reasoningEffort: 'low',
            },
            badgeColors: { bg: '#FCE4EC', border: '#F48FB1' },
        };
    }
}
