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
        this.reasoningEffort = config.reasoningEffort === 'high' ? 'high' : 'low';  // 'low' for speed, 'high' for depth
    }

    /**
     * Override to add reasoning_effort parameter
     */
    protected buildCompletionParams(messages: Message[], options?: AIRequestOptions, streaming: boolean = false) {
        const baseParams = super.buildCompletionParams(messages, options, streaming);

        // Add per-request reasoning_effort if thinking mode is enabled.
        const thinkingEnabled = options?.thinkingMode ?? this.thinkingMode;
        if (thinkingEnabled) {
            const effort = options?.reasoningEffort === 'high' ? 'high' : 'low';
            baseParams.reasoning_effort = effort || this.reasoningEffort;
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
            // Latest Grok models
            'grok-4-20': 16384,
            'grok-4-1': 16384,
            'grok-code-fast-2': 16384,

            // Grok 4.1 fast models (2M context window)
            'grok-4-1-fast-reasoning': 16384,
            'grok-4-1-fast-non-reasoning': 16384,

            // Grok Code (256K context)
            'grok-code-fast-1': 16384,

            // Grok 4 Fast models (2M context window)
            'grok-4-fast-reasoning': 16384,
            'grok-4-fast-non-reasoning': 16384,

            // Grok 4 models (256K context window)
            'grok-4-0709': 16384,
            'grok-4': 16384,

            // Grok 3 models (128K context)
            'grok-3': 16384,
            'grok-3-mini': 16384,

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
        const modelId = this.config?.modelId || 'grok-4-20';
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
            description: 'Grok 4.20/4.1/Code 等 xAI 模型',
            icon: '🚀',
            apiKeyUrl: 'https://console.x.ai/api-keys',
            defaultBaseURL: 'https://api.x.ai/v1',
            defaultModel: 'grok-4-20',
            models: [
                {
                    id: 'grok-4-20',
                    displayName: 'Grok 4.20 (最新旗舰，推荐)',
                    contextWindow: 2000000,
                    description: '最新Grok旗舰模型，2M上下文，适合复杂推理和智能体任务',
                    recommended: true,
                },
                {
                    id: 'grok-4-1',
                    displayName: 'Grok 4.1 (旗舰)',
                    contextWindow: 2000000,
                    description: 'Grok 4.1旗舰模型，2M上下文',
                },
                {
                    id: 'grok-code-fast-2',
                    displayName: 'Grok Code Fast 2 (最新编程)',
                    contextWindow: 262144,
                    description: '最新编程专用模型，适合代码生成和修改',
                    recommended: true,
                },
                {
                    id: 'grok-4-1-fast-reasoning',
                    displayName: 'Grok 4.1 Fast Reasoning',
                    contextWindow: 2000000,
                    description: 'Grok 4.1快速推理模型，2M上下文',
                },
                {
                    id: 'grok-4-1-fast-non-reasoning',
                    displayName: 'Grok 4.1 Fast Non-Reasoning',
                    contextWindow: 2000000,
                    description: 'Grok 4.1快速非推理模型，2M上下文',
                },
                {
                    id: 'grok-code-fast-1',
                    displayName: 'Grok Code Fast 1 (编程)',
                    contextWindow: 262144,
                    description: '上一代编程专用模型',
                    deprecated: true,
                },
                {
                    id: 'grok-4-fast-reasoning',
                    displayName: 'Grok 4 Fast Reasoning',
                    contextWindow: 2000000,
                    description: 'Grok 4快速推理，2M上下文',
                },
                {
                    id: 'grok-4-fast-non-reasoning',
                    displayName: 'Grok 4 Fast Non-Reasoning',
                    contextWindow: 2000000,
                    description: 'Grok 4快速非推理，2M上下文',
                },
                {
                    id: 'grok-4-0709',
                    displayName: 'Grok 4 (256K)',
                    contextWindow: 262144,
                    description: 'Grok 4原始版本，多模态理解 (256K)',
                    deprecated: true,
                },
                {
                    id: 'grok-3',
                    displayName: 'Grok 3',
                    contextWindow: 131072,
                    description: 'Grok 3基础模型 (128K)',
                    deprecated: true,
                },
                {
                    id: 'grok-3-mini',
                    displayName: 'Grok 3 Mini (推理)',
                    contextWindow: 131072,
                    description: 'Grok 3轻量推理模型 (128K)',
                    deprecated: true,
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
