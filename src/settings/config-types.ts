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
 * Built-in Prompt Templates
 * Default templates that come with the plugin
 */
export const BUILTIN_TEMPLATES: PromptTemplate[] = [
    {
        id: 'builtin-default',
        name: '默认助手',
        systemPrompt: 'You are a helpful AI assistant integrated into SiYuan Note. Help users with their notes, writing, and questions.',
        appendedPrompt: '请用清晰的 Markdown 格式回复，确保回答准确、简洁、易于理解。',
        isBuiltIn: true,
        category: 'assistant',
        icon: '🤖',
        description: '通用AI助手，适合日常使用'
    },
    {
        id: 'builtin-code',
        name: '代码助手',
        systemPrompt: 'You are an expert programming assistant. Provide clear, well-commented code examples and explain technical concepts concisely.',
        appendedPrompt: '请提供完整可运行的代码，包含必要注释，遵循最佳实践和代码规范。',
        isBuiltIn: true,
        category: 'code',
        icon: '💻',
        description: '专注于编程和技术问题'
    },
    {
        id: 'builtin-writing',
        name: '写作助手',
        systemPrompt: 'You are a professional writing assistant. Help improve clarity, grammar, and style while maintaining the user\'s voice.',
        appendedPrompt: '请保持原文风格，注重语言流畅性和可读性，标注修改要点。',
        isBuiltIn: true,
        category: 'writing',
        icon: '✍️',
        description: '帮助改进文本的清晰度和风格'
    },
    {
        id: 'builtin-translation',
        name: '翻译助手',
        systemPrompt: 'You are a professional translator. Provide accurate, natural-sounding translations while preserving the original meaning and tone.',
        appendedPrompt: '请确保译文准确、自然、符合目标语言习惯，保留原文格式。',
        isBuiltIn: true,
        category: 'translation',
        icon: '🌐',
        description: '专业的翻译服务'
    },
    {
        id: 'builtin-custom',
        name: '自定义',
        systemPrompt: '',
        appendedPrompt: '',
        isBuiltIn: true,
        category: 'custom',
        icon: '⚙️',
        description: '完全自定义的提示词'
    }
];
