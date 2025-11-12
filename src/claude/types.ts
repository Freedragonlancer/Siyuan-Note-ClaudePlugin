/**
 * Claude API types and interfaces
 */

import type { EditSettings } from "../editor/types";
import type { FilterRule } from "../filter";
import type { AIProviderType } from "../ai/types";

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
 */
export interface ProviderConfig {
    apiKey: string;
    baseURL?: string;
    model: string;
    enabled?: boolean;
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
export function migrateToMultiProvider(settings: ClaudeSettings): MultiProviderSettings {
    // Import here to avoid circular dependency
    const { ConfigGenerator } = require('../settings/ConfigGenerator');
    const defaultProviders = ConfigGenerator.generateDefaultProviders();

    // Check if already migrated
    if ('activeProvider' in settings && 'providers' in settings) {
        const migratedSettings = settings as MultiProviderSettings;
        return {
            ...migratedSettings,
            keyboardShortcuts: migratedSettings.keyboardShortcuts || DEFAULT_KEYBOARD_SHORTCUTS,
            // Deep merge: ensure new providers are added to existing configs
            providers: ConfigGenerator.mergeProviderConfigs(
                defaultProviders,
                migratedSettings.providers
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
            },
        },
    };
}
