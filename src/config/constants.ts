/**
 * Application Constants
 * Centralized location for all hardcoded values
 */

/**
 * Storage Keys
 */
export const STORAGE_KEYS = {
    SETTINGS: 'claude-assistant-settings',
    SETTINGS_FILE: 'settings.json',
    INSTRUCTION_HISTORY_FILE: 'instruction-history.json',
} as const;

/**
 * API Configuration
 */
export const API_CONFIG = {
    DEFAULT_TIMEOUT_MS: 120000,  // 2 minutes
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 1000,
} as const;

/**
 * UI Constants
 */
export const UI_CONFIG = {
    MESSAGE_DISPLAY_DURATION_MS: 5000,
    TOAST_DURATION_ERROR_MS: 5000,
    TOAST_DURATION_SUCCESS_MS: 3000,
    POPUP_Z_INDEX: 9999,
    MAX_INSTRUCTION_HISTORY: 30,
} as const;

/**
 * Editor Constants
 */
export const EDITOR_CONFIG = {
    MAX_CONTEXT_LINES: 100,
    DEFAULT_WINDOW_SIZE: 10000,
    MIN_WINDOW_SIZE: 5000,
    MAX_WINDOW_SIZE: 50000,
    BATCH_OPERATION_THRESHOLD: 10,  // Use batch API for 10+ blocks
} as const;

/**
 * Validation Constants
 */
export const VALIDATION = {
    BLOCK_ID_PATTERN: /^[0-9]{14}-[0-9a-z]{7}$/i,
    MIN_CONTEXT_COUNT: 1,
    MAX_CONTEXT_COUNT: 100,
} as const;

/**
 * Security Configuration
 */
export const SECURITY_CONFIG = {
    API_KEY_STORAGE_WARNING: '⚠️ 安全提示: API Key 存储在本地 localStorage 中（未加密）。请确保您的设备安全。',
    API_KEY_DISPLAY_PREFIX_LENGTH: 7,
    API_KEY_DISPLAY_SUFFIX_LENGTH: 4,
    ENABLE_XSS_PROTECTION: true,
} as const;

/**
 * Provider Display Names
 */
export const PROVIDER_NAMES = {
    anthropic: 'Claude',
    openai: 'GPT',
    gemini: 'Gemini',
    xai: 'Grok',
    deepseek: 'DeepSeek',
    moonshot: 'Kimi',
} as const;

/**
 * Default Model Recommendations
 */
export const RECOMMENDED_MODELS = {
    anthropic: 'claude-sonnet-4-5-20250514',
    openai: 'gpt-5.1-chat-latest',  // Updated to GPT-5.1 (November 2025)
    gemini: 'gemini-2.0-flash-exp',
    xai: 'grok-beta',
    deepseek: 'deepseek-chat',
    moonshot: 'moonshot-v1-8k',
} as const;

/**
 * Log Configuration
 */
export const LOG_CONFIG = {
    PREFIX: '[ClaudePlugin]',
    ENABLE_TIMESTAMP: false,  // Enabled in dev mode via environment
    ENABLE_STACK_TRACE: false,  // Enabled in dev mode via environment
} as const;

/**
 * Performance Constants
 */
export const PERFORMANCE = {
    DEBOUNCE_DELAY_MS: 300,
    THROTTLE_DELAY_MS: 100,
    PROGRESS_UPDATE_INTERVAL_MS: 100,
} as const;

/**
 * Feature Flags
 */
export const FEATURES = {
    ENABLE_REQUEST_LOGGING: false,  // User-configurable
    ENABLE_COMMAND_HISTORY: true,
    ENABLE_BATCH_OPERATIONS: true,
    ENABLE_GPU_ACCELERATION: false,  // Not applicable for web plugin
} as const;

/**
 * Plugin Metadata
 */
export const PLUGIN_META = {
    NAME: 'siyuan-plugin-claude-assistant',
    DISPLAY_NAME: 'Claude Assistant',
    VERSION: '0.12.2',  // Should match package.json
} as const;
