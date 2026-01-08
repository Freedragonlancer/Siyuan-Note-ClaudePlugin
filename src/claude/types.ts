/**
 * Claude API types and interfaces
 */

import type { EditSettings } from "../editor/types";
import type { FilterRule } from "../filter";
import type { AIProviderType, StreamCallback } from "../ai/types";
import { AIProviderFactory } from "../ai/AIProviderFactory";
import type { PromptTemplate } from "../settings/config-types";

/**
 * Minimal ConfigManager interface for type safety
 * Avoids circular dependencies while providing type checking
 *
 * @see ConfigManager (full implementation in settings/)
 */
export interface IConfigManager {
    getAllTemplates?(): PromptTemplate[];
    getTemplateById?(id: string): PromptTemplate | undefined;
}

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

// ============================================================
// Multimodal Content Types (v0.19.0)
// ============================================================

/**
 * Text content block for multimodal messages
 */
export interface TextContent {
    type: 'text';
    text: string;
}

/**
 * Supported image media types
 */
export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

/**
 * Image content block for multimodal messages
 * Supports both base64 encoded data and URLs
 */
export interface ImageContent {
    type: 'image';
    source: {
        type: 'base64' | 'url';
        media_type: ImageMediaType;
        data: string;  // base64 string or URL depending on source.type
    };
}

/**
 * Union type for all content block types
 * Extensible for future content types (audio, video, etc.)
 */
export type ContentBlock = TextContent | ImageContent;

/**
 * Message interface with multimodal support
 * - content: string - backward compatible text-only message
 * - content: ContentBlock[] - multimodal message with text and images
 */
export interface Message {
    role: "user" | "assistant";
    content: string | ContentBlock[];
}

// ============================================================
// Multimodal Helper Functions
// ============================================================

/**
 * Check if a message contains image content
 * @param message Message to check
 * @returns true if message contains at least one image
 */
export function hasImageContent(message: Message): boolean {
    if (typeof message.content === 'string') {
        return false;
    }
    return message.content.some(block => block.type === 'image');
}

/**
 * Normalize message content to ContentBlock array
 * Converts string content to array with single TextContent block
 * @param content String or ContentBlock array
 * @returns ContentBlock array
 */
export function normalizeContent(content: string | ContentBlock[]): ContentBlock[] {
    if (typeof content === 'string') {
        return [{ type: 'text', text: content }];
    }
    return content;
}

/**
 * Extract plain text from message content
 * Concatenates all TextContent blocks, ignores images
 * @param content String or ContentBlock array
 * @returns Plain text string
 */
export function extractText(content: string | ContentBlock[]): string {
    if (typeof content === 'string') {
        return content;
    }
    return content
        .filter((block): block is TextContent => block.type === 'text')
        .map(block => block.text)
        .join('\n');
}

/**
 * Create a text-only message (convenience function)
 * @param role Message role
 * @param text Text content
 * @returns Message with string content
 */
export function createTextMessage(role: 'user' | 'assistant', text: string): Message {
    return { role, content: text };
}

/**
 * Create a multimodal message with text and images
 * @param role Message role
 * @param text Text content
 * @param images Array of ImageContent blocks
 * @returns Message with ContentBlock array
 */
export function createMultimodalMessage(
    role: 'user' | 'assistant',
    text: string,
    images: ImageContent[]
): Message {
    const content: ContentBlock[] = [
        ...images,  // Images first (common convention for vision models)
        { type: 'text', text }
    ];
    return { role, content };
}

/**
 * Convert base64 data to ImageContent block
 * @param base64Data Base64 encoded image data (without data URL prefix)
 * @param mediaType Image media type
 * @returns ImageContent block
 */
export function createImageContent(
    base64Data: string,
    mediaType: ImageMediaType
): ImageContent {
    return {
        type: 'image',
        source: {
            type: 'base64',
            media_type: mediaType,
            data: base64Data
        }
    };
}

/**
 * Convert image URL to ImageContent block
 * @param url Image URL
 * @param mediaType Image media type
 * @returns ImageContent block
 */
export function createImageContentFromURL(
    url: string,
    mediaType: ImageMediaType
): ImageContent {
    return {
        type: 'image',
        source: {
            type: 'url',
            media_type: mediaType,
            data: url
        }
    };
}

/**
 * Detect media type from file extension or data URL prefix
 * @param source File name, URL, or data URL
 * @returns Detected media type or default to image/png
 */
export function detectMediaType(source: string): ImageMediaType {
    const lower = source.toLowerCase();

    // Check data URL prefix
    if (lower.startsWith('data:image/jpeg') || lower.startsWith('data:image/jpg')) {
        return 'image/jpeg';
    }
    if (lower.startsWith('data:image/png')) {
        return 'image/png';
    }
    if (lower.startsWith('data:image/gif')) {
        return 'image/gif';
    }
    if (lower.startsWith('data:image/webp')) {
        return 'image/webp';
    }

    // Check file extension
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
        return 'image/jpeg';
    }
    if (lower.endsWith('.png')) {
        return 'image/png';
    }
    if (lower.endsWith('.gif')) {
        return 'image/gif';
    }
    if (lower.endsWith('.webp')) {
        return 'image/webp';
    }

    // Default to PNG
    return 'image/png';
}

/**
 * Extract base64 data from a data URL
 * @param dataUrl Data URL (e.g., "data:image/png;base64,...")
 * @returns Object with base64 data and media type
 */
export function parseDataUrl(dataUrl: string): { data: string; mediaType: ImageMediaType } | null {
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/i);
    if (!match) {
        return null;
    }
    return {
        data: match[2],
        mediaType: match[1].toLowerCase() as ImageMediaType
    };
}

export interface StreamChunk {
    type: "content_block_delta" | "message_delta" | "message_stop";
    delta?: {
        type: string;
        text?: string;
    };
}

// Re-export StreamCallback and GeneratedImage from ai/types as canonical types
export type { StreamCallback, GeneratedImage } from '../ai/types';
// MessageCallback is an alias for backward compatibility
export type MessageCallback = StreamCallback;
export type ErrorCallback = (error: Error) => void;
export type CompleteCallback = () => void;
// v0.19.0: Callback for AI-generated images
export type GeneratedImagesCallback = (images: import('../ai/types').GeneratedImage[]) => void;

/**
 * Single AI Provider Configuration
 * v0.13.0: Added per-provider maxTokens and temperature parameters
 * v0.13.0: Added thinking/reasoning mode parameters
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

    // Thinking/Reasoning mode parameters (v0.13.0)
    thinkingMode?: boolean;           // Enable thinking/reasoning mode
    thinkingBudget?: number;          // Thinking budget in tokens (Anthropic, Gemini)
    reasoningEffort?: 'low' | 'high'; // Reasoning effort level (xAI)
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
