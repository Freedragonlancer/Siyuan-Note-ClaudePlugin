/**
 * Configuration Generator
 * Dynamically generates configuration from Provider metadata
 *
 * NOTE: This class is used by src/claude/index.ts for DEFAULT_SETTINGS generation.
 * However, src/claude/types.ts uses inlined versions of these methods to avoid
 * circular dependency issues when migrateToMultiProvider() is called at runtime.
 *
 * DO NOT use require() to import this module in types.ts - use the inlined functions instead.
 */

import { AIProviderFactory } from '../ai/AIProviderFactory';
import type { ProviderConfig } from '../claude/types';

/**
 * Configuration generator - creates configs from Provider metadata
 */
export class ConfigGenerator {
    /**
     * Generate default configuration for all registered providers
     * @returns Record of provider type to default config
     */
    static generateDefaultProviders(): Record<string, ProviderConfig> {
        const providers: Record<string, ProviderConfig> = {};
        const allMetadata = AIProviderFactory.getAllMetadata();

        // Provider-specific default parameters (v0.13.0)
        // Each provider has different limits, so we define them separately
        const defaultParams: Record<string, {
            maxTokens: number;
            temperature: number;
            thinkingMode?: boolean;
            thinkingBudget?: number;
            reasoningEffort?: 'low' | 'high';
        }> = {
            'anthropic': {
                maxTokens: 4096,
                temperature: 0.7,
                thinkingMode: false,
                thinkingBudget: 10000  // Default 10K tokens for extended thinking
            },
            'openai': {
                maxTokens: 4096,
                temperature: 1.0
                // No thinking params - use o1/o3 models instead
            },
            'gemini': {
                maxTokens: 8192,
                temperature: 0.9,
                thinkingMode: false,
                thinkingBudget: 8192  // Default 8K, max 24576 for 2.5 Flash
            },
            'xai': {
                maxTokens: 4096,
                temperature: 0.7,
                thinkingMode: false,
                reasoningEffort: 'low'  // 'low' for speed, 'high' for depth
            },
            'deepseek': {
                maxTokens: 4096,
                temperature: 0.7
                // No thinking params - use deepseek-reasoner model instead
            },
            'moonshot': {
                maxTokens: 4096,
                temperature: 0.7,
                thinkingMode: false  // K2 Thinking model support
            },
        };

        for (const [type, metadata] of allMetadata) {
            const params = defaultParams[type] || { maxTokens: 4096, temperature: 0.7 };

            providers[type] = {
                apiKey: '',
                baseURL: metadata.defaultBaseURL,
                model: metadata.defaultModel,
                enabled: type === 'anthropic', // Only Anthropic enabled by default

                // Per-provider parameters (v0.13.0)
                maxTokens: params.maxTokens,
                temperature: params.temperature,

                // Thinking/Reasoning mode parameters (v0.13.0)
                thinkingMode: params.thinkingMode,
                thinkingBudget: params.thinkingBudget,
                reasoningEffort: params.reasoningEffort,
            };
        }

        console.log(`[ConfigGenerator] Generated default config for ${allMetadata.size} providers`);
        return providers;
    }

    /**
     * Deep merge provider configurations
     * Merges user config with defaults, preserving user values
     * @param defaults Default provider configurations
     * @param user User's saved configurations
     * @returns Merged configuration
     */
    static mergeProviderConfigs(
        defaults: Record<string, ProviderConfig>,
        user: Record<string, ProviderConfig> | undefined
    ): Record<string, ProviderConfig> {
        if (!user) {
            return defaults;
        }

        const merged: Record<string, ProviderConfig> = { ...defaults };

        // Merge user configs into defaults
        for (const [key, value] of Object.entries(user)) {
            if (merged[key]) {
                // Provider exists in defaults, merge
                merged[key] = {
                    ...defaults[key],
                    ...value,
                };
            } else {
                // Provider doesn't exist in defaults (e.g., removed provider)
                // Keep user's config anyway for backward compatibility
                merged[key] = value;
            }
        }

        return merged;
    }
}
