/**
 * Configuration Profile and Template Type Definitions
 *
 * This file defines the data structures for the new configuration management system.
 */

import type { ClaudeSettings } from "../claude";
import type { FilterRule } from "../filter";

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

    /** Optional preset-specific filter rules (applied after global rules) */
    filterRules?: FilterRule[];

    /**
     * Optional Selection Q&A template with context placeholders
     * Supports: {selection}, {question}, {above_blocks=n}, {below_blocks=n}, {above=n}, {below=n}
     * If not set, uses default format
     */
    selectionQATemplate?: string;
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

    /** Custom templates (user-created, excluding built-in) */
    customTemplates?: PromptTemplate[];

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
        isBuiltIn: true, // Prevent overwriting by saved templates
        category: 'assistant',
        icon: '🤖',
        description: '默认配置',
        editInstruction: '优化和改进文本' // Default instruction for Quick Edit
    }
];

/**
 * Default Selection Q&A Template
 * Used when preset doesn't define a custom selectionQATemplate
 */
export const DEFAULT_SELECTION_QA_TEMPLATE = `以下是选中的内容：

{selection}

---

用户问题：{question}`;
