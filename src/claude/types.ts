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
 */
export interface MultiProviderSettings extends ClaudeSettings {
    /** Currently active provider */
    activeProvider?: AIProviderType;

    /** Provider-specific configurations */
    providers?: {
        anthropic?: ProviderConfig;
        openai?: ProviderConfig;
        gemini?: ProviderConfig;
        xai?: ProviderConfig;
        deepseek?: ProviderConfig;
    };
}

/**
 * Migrate legacy ClaudeSettings to MultiProviderSettings
 * Preserves existing Claude configuration under 'anthropic' provider
 */
export function migrateToMultiProvider(settings: ClaudeSettings): MultiProviderSettings {
    // Check if already migrated
    if ('activeProvider' in settings && 'providers' in settings) {
        // Ensure all providers exist (merge with defaults)
        const migratedSettings = settings as MultiProviderSettings;
        return {
            ...migratedSettings,
            // Ensure keyboardShortcuts always exists
            keyboardShortcuts: migratedSettings.keyboardShortcuts || DEFAULT_KEYBOARD_SHORTCUTS,
            providers: {
                anthropic: migratedSettings.providers?.anthropic || {
                    apiKey: '',
                    baseURL: '',
                    model: 'claude-sonnet-4-5-20250929',
                    enabled: false,
                },
                openai: migratedSettings.providers?.openai || {
                    apiKey: '',
                    baseURL: '',
                    model: 'gpt-4-turbo-preview',
                    enabled: false,
                },
                gemini: migratedSettings.providers?.gemini || {
                    apiKey: '',
                    baseURL: '',
                    model: 'gemini-pro',
                    enabled: false,
                },
                xai: migratedSettings.providers?.xai || {
                    apiKey: '',
                    baseURL: '',
                    model: 'grok-beta',
                    enabled: false,
                },
                deepseek: migratedSettings.providers?.deepseek || {
                    apiKey: '',
                    baseURL: '',
                    model: 'deepseek-chat',
                    enabled: false,
                },
            },
        };
    }

    // Migrate legacy settings (first time)
    return {
        ...settings,
        // Ensure keyboardShortcuts always exists
        keyboardShortcuts: settings.keyboardShortcuts || DEFAULT_KEYBOARD_SHORTCUTS,
        activeProvider: 'anthropic',
        providers: {
            anthropic: {
                apiKey: settings.apiKey || '',
                baseURL: settings.baseURL || '',
                model: settings.model || 'claude-sonnet-4-5-20250929',
                enabled: true,
            },
            openai: {
                apiKey: '',
                baseURL: '',
                model: 'gpt-4-turbo-preview',
                enabled: false,
            },
            gemini: {
                apiKey: '',
                baseURL: '',
                model: 'gemini-pro',
                enabled: false,
            },
            xai: {
                apiKey: '',
                baseURL: '',
                model: 'grok-beta',
                enabled: false,
            },
            deepseek: {
                apiKey: '',
                baseURL: '',
                model: 'deepseek-chat',
                enabled: false,
            },
        },
    };
}
