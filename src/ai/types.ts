/**
 * AI Provider Types and Interfaces
 * Provides abstraction layer for multiple AI providers (Anthropic, OpenAI, Gemini, Local Models, etc.)
 */

import type { Message } from '../claude/types';

/**
 * Supported AI providers
 * Changed to string for runtime flexibility (no longer union type)
 */
export type AIProviderType = string;

/**
 * AI model configuration
 */
export interface AIModelConfig {
    /** Provider type */
    provider: AIProviderType;
    /** Model identifier (e.g., 'claude-3-5-sonnet-20241022', 'gpt-4', etc.) */
    modelId: string;
    /** API key */
    apiKey: string;
    /** API base URL (optional, for custom endpoints) */
    baseURL?: string;
    /** Maximum tokens for response */
    maxTokens?: number;
    /** Temperature (0-1) */
    temperature?: number;
    /** Additional provider-specific options */
    options?: Record<string, any>;
}

/**
 * Parameter limits for AI provider
 */
export interface ParameterLimits {
    temperature: { min: number; max: number; default: number };
    maxTokens: { min: number; max: number; default: number };
    topP?: { min: number; max: number; default: number };
}

/**
 * Streaming callback for real-time response chunks
 */
export type StreamCallback = (chunk: string) => void;

/**
 * Request options for AI API calls
 */
export interface AIRequestOptions {
    /** System prompt */
    systemPrompt?: string;
    /** Maximum tokens */
    maxTokens?: number;
    /** Temperature */
    temperature?: number;
    /** Stop sequences */
    stopSequences?: string[];
    /** Streaming callback */
    onStream?: StreamCallback;
    /** Abort signal for cancellation */
    signal?: AbortSignal;
}

/**
 * AI Provider Interface
 * All AI providers must implement this interface
 */
export interface AIProvider {
    /**
     * Provider type identifier
     */
    readonly providerType: AIProviderType;

    /**
     * Provider name for display
     */
    readonly providerName: string;

    /**
     * Send a message and get complete response
     * @param messages Conversation messages
     * @param options Request options
     * @returns Complete response text
     */
    sendMessage(messages: Message[], options?: AIRequestOptions): Promise<string>;

    /**
     * Stream a message response in real-time
     * @param messages Conversation messages
     * @param options Request options with streaming callback
     * @returns Promise that resolves when streaming completes
     */
    streamMessage(messages: Message[], options?: AIRequestOptions): Promise<void>;

    /**
     * Validate configuration
     * @param config Model configuration
     * @returns True if valid, error message if invalid
     */
    validateConfig(config: AIModelConfig): true | string;

    /**
     * Get available models for this provider
     * @returns List of model identifiers
     */
    getAvailableModels(): string[];

    /**
     * Check if provider supports streaming
     * @returns True if streaming is supported
     */
    supportsStreaming(): boolean;

    /**
     * Check if provider supports system prompts
     * @returns True if system prompts are supported
     */
    supportsSystemPrompt(): boolean;

    /**
     * Get maximum token limit for a specific model
     * @param model Model identifier
     * @returns Maximum token limit
     */
    getMaxTokenLimit(model: string): number;

    /**
     * Get parameter limits for this provider
     * @returns Parameter limits configuration
     */
    getParameterLimits(): ParameterLimits;

    /**
     * Get provider metadata (single source of truth)
     * @returns Complete provider metadata
     */
    getMetadata(): ProviderMetadata;
}

/**
 * Provider factory registration entry
 */
export interface ProviderRegistration {
    type: AIProviderType;
    factory: (config: AIModelConfig) => AIProvider;
    displayName: string;
    description: string;
}

// ==================== Provider Metadata ====================

/**
 * Model metadata for display and configuration
 */
export interface ModelMetadata {
    /** Model ID (used in API calls) */
    id: string;
    /** Display name (shown in UI) */
    displayName: string;
    /** Context window size (tokens) */
    contextWindow: number;
    /** Model description */
    description?: string;
    /** Whether the model is deprecated */
    deprecated?: boolean;
    /** Whether this is a recommended model */
    recommended?: boolean;
}

/**
 * Provider feature flags
 */
export interface ProviderFeatures {
    /** Supports streaming responses */
    supportsStreaming: boolean;
    /** Supports system prompts */
    supportsSystemPrompt: boolean;
    /** Supports vision/image inputs */
    supportsVision: boolean;
    /** Supports function calling */
    supportsFunctionCalling: boolean;
}

/**
 * Complete provider metadata (single source of truth)
 */
export interface ProviderMetadata {
    /** Provider type identifier */
    type: string;
    /** Display name for UI */
    displayName: string;
    /** Short description */
    description: string;
    /** UI icon (emoji or SVG) */
    icon: string;
    /** URL to get API key */
    apiKeyUrl: string;
    /** Default API base URL */
    defaultBaseURL: string;
    /** Default model ID */
    defaultModel: string;
    /** Available models */
    models: ModelMetadata[];
    /** Feature flags */
    features: ProviderFeatures;
}

// ==================== Runtime Type Validation ====================

/**
 * Check if a provider type is valid (registered in factory)
 * @param type Provider type to check
 * @returns True if provider is registered
 */
export function isValidProviderType(type: string): boolean {
    // Will be implemented using AIProviderFactory.hasProvider()
    // Import moved to avoid circular dependency
    return true; // Placeholder
}

/**
 * Assert that a provider type is valid, throw if not
 * @param type Provider type to validate
 * @throws Error if provider type is not registered
 */
export function assertProviderType(type: string): asserts type is AIProviderType {
    // Will be implemented using AIProviderFactory
    // Import moved to avoid circular dependency
}
