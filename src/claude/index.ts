// Export UniversalAIClient (new multi-provider client)
export { UniversalAIClient } from "./UniversalAIClient";

// Backward compatibility: ClaudeClient is now an alias for UniversalAIClient
export { UniversalAIClient as ClaudeClient } from "./UniversalAIClient";

// Export types
export type { 
    ClaudeSettings, 
    MultiProviderSettings,
    ProviderConfig,
    KeyboardShortcuts, 
    Message, 
    MessageCallback, 
    ErrorCallback, 
    CompleteCallback 
} from "./types";

// Export constants
export { DEFAULT_KEYBOARD_SHORTCUTS } from "./types";

// Export migration utility
export { migrateToMultiProvider } from "./types";
import { DEFAULT_EDIT_SETTINGS } from "../editor/types";
import type { MultiProviderSettings } from "./types";
import { ConfigGenerator } from "../settings/ConfigGenerator";

export const DEFAULT_SETTINGS: Omit<MultiProviderSettings, "apiKey"> = {
    // Legacy single-provider settings (for backward compatibility)
    // These will be migrated to multi-provider format automatically
    baseURL: "",
    model: "claude-sonnet-4-5-20250929",
    maxTokens: 4096,
    temperature: 0.7,
    systemPrompt: "You are a helpful AI assistant integrated into SiYuan Note. Help users with their writing, editing, and note-taking tasks. Be concise and clear in your responses.",
    appendedPrompt: "请用清晰的 Markdown 格式回复，确保回答准确、简洁、易于理解。",
    quickEditPromptTemplate: `{instruction}

原文：
{original}

重要：只返回修改后的完整文本，不要添加任何前言、说明、解释或格式标记（如"以下是..."、"主要改进："等）。直接输出修改后的文本内容即可。`,
    filterRules: [
        {
            id: 'remove-think-tags',
            name: '删除 <think> 标签',
            pattern: '<think>.*?</think>',
            replacement: '',
            flags: 'gis',
            enabled: true
        },
        {
            id: 'remove-thinking-tags',
            name: '删除 <thinking> 标签',
            pattern: '<thinking>.*?</thinking>',
            replacement: '',
            flags: 'gis',
            enabled: true
        }
    ],
    enableRequestLogging: false,
    requestLogPath: '',
    requestLogIncludeResponse: true,
    editSettings: DEFAULT_EDIT_SETTINGS,
    keyboardShortcuts: {
        quickEdit: "⌃⇧Q",      // Ctrl+Shift+Q
        undoAIEdit: "⌃⇧Z",     // Ctrl+Shift+Z
        openClaude: "⌥⇧C",     // Alt+Shift+C
    },
    
    // Multi-provider settings (new in v0.10.0+)
    // Dynamically generated from registered providers (v0.12.0+)
    activeProvider: 'anthropic' as const,
    providers: ConfigGenerator.generateDefaultProviders(),
};

// Default fallback models if API fetch fails
export const AVAILABLE_MODELS = [
    { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5 (Latest, Recommended)" },
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-opus-4-20250514", label: "Claude Opus 4 (Most Capable)" },
    { value: "claude-opus-4-1-20250805", label: "Claude Opus 4.1" },
    { value: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet" },
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
    { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku (Fast)" },
    { value: "claude-3-opus-20240229", label: "Claude 3 Opus" },
    { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
];
