/**
 * Configuration Module Exports
 */

export {
    IS_DEV,
    IS_PROD,
    devConsole,
    getDefaultLogLevel,
} from './environment';

export {
    STORAGE_KEYS,
    API_CONFIG,
    UI_CONFIG,
    EDITOR_CONFIG,
    VALIDATION,
    SECURITY_CONFIG,
    // PROVIDER_NAMES - REMOVED: Use AIProviderFactory.getMetadata(provider).displayName
    // RECOMMENDED_MODELS - REMOVED: Use AIProviderFactory.getMetadata(provider).defaultModel
    LOG_CONFIG,
    PERFORMANCE,
    FEATURES,
    PLUGIN_META,
} from './constants';
