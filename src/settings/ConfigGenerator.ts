/**
 * Configuration Generator
 * Dynamically generates configuration from Provider metadata
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

        for (const [type, metadata] of allMetadata) {
            providers[type] = {
                apiKey: '',
                baseURL: metadata.defaultBaseURL,
                model: metadata.defaultModel,
                enabled: type === 'anthropic', // Only Anthropic enabled by default
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
