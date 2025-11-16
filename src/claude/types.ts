/**
 * Claude API types and interfaces
 */

import type { EditSettings } from "../editor/types";
import type { FilterRule } from "../filter";
import type { AIProviderType } from "../ai/types";
import { AIProviderFactory } from "../ai/AIProviderFactory";

/**
 * Default keyboard shortcuts configuration
 */
export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcuts = {
    quickEdit: "⌃⇧Q",      // Ctrl+Shift+Q
    undoAIEdit: "⌃⇧Z",     // Ctrl+Shift+Z
    openClaude: "⌥⇧C",     // Alt+Shift+C
};

/**
 * Keyboard shortcuts configuration
 */
export interface KeyboardShortcuts {
    quickEdit?: string;      // AI Quick Edit (default: ⌃⇧Q)
    undoAIEdit?: string;     // Undo Last AI Edit (default: ⌃⇧Z)
    openClaude?: string;     // Open Claude AI Panel (default: ⌥⇧C)
}

export interface ClaudeSettings {
    apiKey: string;
    baseURL: string;
    model: string;
    maxTokens: number;
    temperature: number;
    systemPrompt: string;
    appendedPrompt: string; // Prompt appended to end of each request

    // Quick Edit prompt template
    // Placeholders: {instruction} - user instruction, {original} - original text
    quickEditPromptTemplate?: string;

    // Response Filter Rules (global, applies to all requests)
    filterRules?: FilterRule[];

    // AI Request Logging
    enableRequestLogging?: boolean;        // 是否启用AI请求日志 (默认false)
    requestLogPath?: string;                // 日志保存路径 (用户自定义)
    requestLogIncludeResponse?: boolean;    // 是否记录响应内容 (默认true)

    // AI Text Editing settings
    editSettings?: EditSettings;

    // Keyboard shortcuts
    keyboardShortcuts?: KeyboardShortcuts;
}

export interface Message {
    role: "user" | "assistant";
    content: string;
}

export interface StreamChunk {
    type: "content_block_delta" | "message_delta" | "message_stop";
    delta?: {
        type: string;
        text?: string;
    };
}

export type MessageCallback = (chunk: string) => void;
export type ErrorCallback = (error: Error) => void;
export type CompleteCallback = () => void;

/**
 * Single AI Provider Configuration
 * v0.13.0: Added per-provider maxTokens and temperature parameters
 */
export interface ProviderConfig {
    apiKey: string;
    baseURL?: string;
    model: string;
    enabled?: boolean;

    // Per-provider parameters (v0.13.0)
    // Each provider has different limits, so store separately
    maxTokens?: number;      // Max output tokens for this provider
    temperature?: number;    // Temperature setting for this provider
}

/**
 * Multi-Provider Settings
 * Extends ClaudeSettings to support multiple AI providers
 *
 * v0.12.0: Changed to Record type for dynamic provider support
 */
export interface MultiProviderSettings extends ClaudeSettings {
    /** Currently active provider */
    activeProvider?: string;  // Changed from AIProviderType to string

    /** Provider-specific configurations (dynamic) */
    providers?: Record<string, ProviderConfig>;
}

/**
 * Migrate legacy ClaudeSettings to MultiProviderSettings
 * Preserves existing Claude configuration under 'anthropic' provider
 *
 * v0.12.0: Simplified using ConfigGenerator for dynamic provider support
 */
/**
 * Generate default configuration for all registered providers (inlined version)
 *
 * NOTE: This is an inlined version of ConfigGenerator.generateDefaultProviders()
 * to avoid circular dependency issues. Uses static import of AIProviderFactory.
 *
 * @returns Record of provider type to default config
 */
function generateDefaultProvidersInline(): Record<string, ProviderConfig> {
    const providers: Record<string, ProviderConfig> = {};
    const allMetadata = AIProviderFactory.getAllMetadata();

    // Provider-specific default parameters (v0.13.0)
    // Each provider has different limits, so we define them separately
    const defaultParams: Record<string, { maxTokens: number; temperature: number }> = {
        'anthropic': { maxTokens: 4096, temperature: 0.7 },
        'openai': { maxTokens: 4096, temperature: 1.0 },
        'gemini': { maxTokens: 8192, temperature: 0.9 },
        'xai': { maxTokens: 4096, temperature: 0.7 },
        'deepseek': { maxTokens: 4096, temperature: 0.7 },
        'moonshot': { maxTokens: 4096, temperature: 0.7 },
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
        };
    }

    return providers;
}

/**
 * Deep merge provider configurations (inlined version)
 * 
 * NOTE: This is an inlined version of ConfigGenerator.mergeProviderConfigs()
 * to avoid circular dependency issues.
 * 
 * @param defaults Default provider configurations
 * @param user User's saved configurations
 * @returns Merged configuration
 */
function mergeProviderConfigsInline(
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

export function migrateToMultiProvider(settings: ClaudeSettings): MultiProviderSettings {
    // Use inlined functions to avoid circular dependency with ConfigGenerator
    const defaultProviders = generateDefaultProvidersInline();

    // Check if already migrated
    if ('activeProvider' in settings && 'providers' in settings) {
        const migratedSettings = settings as MultiProviderSettings;

        // v0.13.0: Migrate per-provider parameters
        // Ensure each provider has maxTokens/temperature
        const migratedProviders: Record<string, ProviderConfig> = {};
        for (const [type, config] of Object.entries(migratedSettings.providers || {})) {
            const defaultConfig = defaultProviders[type];
            migratedProviders[type] = {
                ...config,
                // If provider config doesn't have parameters, use global or defaults
                maxTokens: config.maxTokens ?? migratedSettings.maxTokens ?? defaultConfig?.maxTokens ?? 4096,
                temperature: config.temperature ?? migratedSettings.temperature ?? defaultConfig?.temperature ?? 0.7,
            };
        }

        return {
            ...migratedSettings,
            keyboardShortcuts: migratedSettings.keyboardShortcuts || DEFAULT_KEYBOARD_SHORTCUTS,
            // Deep merge: ensure new providers are added to existing configs
            providers: mergeProviderConfigsInline(
                defaultProviders,
                migratedProviders
            ),
        };
    }

    // Migrate legacy settings (first time)
    return {
        ...settings,
        keyboardShortcuts: settings.keyboardShortcuts || DEFAULT_KEYBOARD_SHORTCUTS,
        activeProvider: 'anthropic',
        providers: {
            ...defaultProviders,
            // Preserve legacy Anthropic config
            anthropic: {
                ...defaultProviders.anthropic,
                apiKey: settings.apiKey || '',
                baseURL: settings.baseURL || '',
                model: settings.model || defaultProviders.anthropic.model,
                enabled: true,
                // v0.13.0: Migrate global parameters to Anthropic
                maxTokens: settings.maxTokens ?? defaultProviders.anthropic.maxTokens,
                temperature: settings.temperature ?? defaultProviders.anthropic.temperature,
            },
        },
    };
}

/**
 * Validate and fix provider parameters to comply with provider limits
 * Auto-clamps maxTokens and temperature if they exceed provider-specific limits
 * @param settings Settings to validate and fix
 * @returns Fixed settings with valid parameter values
 */
export function validateProviderParameters(settings: MultiProviderSettings): MultiProviderSettings {
    if (!settings.providers) {
        return settings;
    }

    const fixedProviders: Record<string, ProviderConfig> = {};

    for (const [providerType, config] of Object.entries(settings.providers)) {
        if (!config) {
            fixedProviders[providerType] = config;
            continue;
        }

        try {
            // Get parameter limits for this provider
            const limits = AIProviderFactory.getParameterLimits(providerType);

            const fixedConfig = { ...config };
            let wasFixed = false;

            // If provider config is missing parameters, fall back to global settings
            // This replicates UniversalAIClient's behavior
            if (typeof config.maxTokens !== 'number') {
                fixedConfig.maxTokens = settings.maxTokens ?? 4096;
            }
            if (typeof config.temperature !== 'number') {
                fixedConfig.temperature = settings.temperature ?? 0.7;
            }

            // Validate and clamp maxTokens (now always present due to fallback above)
            if (typeof fixedConfig.maxTokens === 'number') {
                const { min, max } = limits.maxTokens;
                if (fixedConfig.maxTokens > max) {
                    console.warn(`[Config Validation] Clamping ${providerType} maxTokens from ${fixedConfig.maxTokens} to ${max}`);
                    fixedConfig.maxTokens = max;
                    wasFixed = true;
                } else if (fixedConfig.maxTokens < min) {
                    console.warn(`[Config Validation] Clamping ${providerType} maxTokens from ${fixedConfig.maxTokens} to ${min}`);
                    fixedConfig.maxTokens = min;
                    wasFixed = true;
                }
            }

            // Validate and clamp temperature (now always present due to fallback above)
            if (typeof fixedConfig.temperature === 'number') {
                const { min, max } = limits.temperature;
                if (fixedConfig.temperature > max) {
                    console.warn(`[Config Validation] Clamping ${providerType} temperature from ${fixedConfig.temperature} to ${max}`);
                    fixedConfig.temperature = max;
                    wasFixed = true;
                } else if (fixedConfig.temperature < min) {
                    console.warn(`[Config Validation] Clamping ${providerType} temperature from ${fixedConfig.temperature} to ${min}`);
                    fixedConfig.temperature = min;
                    wasFixed = true;
                }
            }

            fixedProviders[providerType] = fixedConfig;
        } catch (error) {
            console.error(`[Config Validation] Failed to validate ${providerType}:`, error);
            fixedProviders[providerType] = config;
        }
    }

    return {
        ...settings,
        providers: fixedProviders,
    };
}
