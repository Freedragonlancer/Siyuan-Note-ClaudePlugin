/**
 * Configuration Profile and Template Type Definitions
 *
 * This file defines the data structures for the new configuration management system.
 */

import type { ClaudeSettings } from "../claude";

/**
 * Prompt Template
 * Represents a reusable prompt configuration with system and appended prompts
 */
export interface PromptTemplate {
    /** Unique identifier */
    id: string;

    /** Template display name */
    name: string;

    /** System prompt defining AI role and behavior */
    systemPrompt: string;

    /** Appended prompt automatically added to requests */
    appendedPrompt: string;

    /** Whether this is a built-in template (cannot be deleted) */
    isBuiltIn: boolean;

    /** Category for organization */
    category?: 'assistant' | 'code' | 'writing' | 'translation' | 'custom';

    /** Optional icon identifier */
    icon?: string;

    /** Optional description */
    description?: string;

    /** Optional edit instruction for AI Quick Edit feature */
    editInstruction?: string;

    /** Whether to show diff comparison for this preset (for quick edit) */
    showDiff?: boolean;
}

/**
 * Configuration Profile
 * Represents a complete configuration set for the plugin
 */
export interface ConfigProfile {
    /** Unique identifier */
    id: string;

    /** Profile display name */
    name: string;

    /** Optional description */
    description?: string;

    /** Optional icon identifier */
    icon?: string;

    /** Whether this is the default profile */
    isDefault?: boolean;

    /** Creation timestamp */
    createdAt: number;

    /** Last update timestamp */
    updatedAt: number;

    /** Complete plugin settings */
    settings: ClaudeSettings;
}

/**
 * Configuration Manager State
 * Stores the active profile ID and all profiles
 */
export interface ConfigManagerState {
    /** ID of the currently active profile */
    activeProfileId: string;

    /** All available profiles */
    profiles: ConfigProfile[];

    /** Last sync timestamp */
    lastSyncAt: number;
}

/**
 * Export format for configuration profiles
 * Used when exporting/importing configurations
 */
export interface ConfigExport {
    /** Format version for compatibility */
    version: string;

    /** Export timestamp */
    exportedAt: number;

    /** Exported profiles */
    profiles: ConfigProfile[];

    /** Optional metadata */
    metadata?: {
        exportedBy?: string;
        notes?: string;
    };
}

/**
 * Default Prompt Template
 * Only one default template, fully editable by user
 */
export const BUILTIN_TEMPLATES: PromptTemplate[] = [
    {
        id: 'default',
        name: 'Default',
        systemPrompt: 'You are a helpful AI assistant integrated into SiYuan Note. Help users with their notes, writing, and questions.',
        appendedPrompt: '请用清晰的 Markdown 格式回复，确保回答准确、简洁、易于理解。',
        isBuiltIn: false, // Set to false to allow user editing
        category: 'assistant',
        icon: '🤖',
        description: '默认配置'
    }
];
