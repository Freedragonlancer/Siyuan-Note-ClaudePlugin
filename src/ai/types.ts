/**
 * AI Provider Types and Interfaces
 * Provides abstraction layer for multiple AI providers (Anthropic, OpenAI, Gemini, Local Models, etc.)
 */

import type { Message } from '../claude/types';

/**
 * Supported AI providers
 */
export type AIProviderType = 'anthropic' | 'openai' | 'gemini' | 'xai' | 'deepseek' | 'custom';

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
