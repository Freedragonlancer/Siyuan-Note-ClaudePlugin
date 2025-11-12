/**
 * Base AI Provider Implementation
 * Provides common functionality shared by all AI providers
 */

import type {
    AIProvider,
    AIProviderType,
    AIModelConfig,
    AIRequestOptions,
    ParameterLimits,
} from './types';
import type { Message } from '../claude/types';

/**
 * Abstract base class for AI providers
 * Implements common validation and helper methods
 */
export abstract class BaseAIProvider implements AIProvider {
    abstract readonly providerType: AIProviderType;
    abstract readonly providerName: string;

    protected config: AIModelConfig;

    constructor(config: AIModelConfig) {
        const validationResult = this.validateConfig(config);
        if (validationResult !== true) {
            throw new Error(`Invalid ${this.providerName} config: ${validationResult}`);
        }
        this.config = config;
    }

    // Abstract methods that must be implemented by subclasses
    abstract sendMessage(messages: Message[], options?: AIRequestOptions): Promise<string>;
    abstract streamMessage(messages: Message[], options?: AIRequestOptions): Promise<void>;
    abstract getAvailableModels(): string[];
    abstract getMaxTokenLimit(model: string): number;
    abstract getParameterLimits(): ParameterLimits;

    /**
     * Base configuration validation
     * Can be extended by subclasses
     */
    validateConfig(config: AIModelConfig): true | string {
        if (!config.apiKey || config.apiKey.trim() === '') {
            return 'API key is required';
        }

        if (!config.modelId || config.modelId.trim() === '') {
            return 'Model ID is required';
        }

        if (config.baseURL && !/^https?:\/\/.+/.test(config.baseURL)) {
            return 'Base URL must be a valid HTTP(S) URL';
        }

        // Validate temperature range
        if (config.temperature !== undefined) {
            const limits = this.getParameterLimits();
            if (config.temperature < limits.temperature.min || config.temperature > limits.temperature.max) {
                return `Temperature must be between ${limits.temperature.min} and ${limits.temperature.max}`;
            }
        }

        // Validate maxTokens range
        if (config.maxTokens !== undefined) {
            const limits = this.getParameterLimits();
            if (config.maxTokens < limits.maxTokens.min || config.maxTokens > limits.maxTokens.max) {
                return `Max tokens must be between ${limits.maxTokens.min} and ${limits.maxTokens.max}`;
            }
        }

        return true;
    }

    /**
     * Default streaming support (most providers support it)
     */
    supportsStreaming(): boolean {
        return true;
    }

    /**
     * Default system prompt support (most providers support it)
     */
    supportsSystemPrompt(): boolean {
        return true;
    }

    /**
     * Helper method to normalize messages format
     * Removes empty messages and trims content
     */
    protected normalizeMessages(messages: Message[]): Message[] {
        return messages
            .filter(m => m.content && m.content.trim() !== '')
            .map(m => ({
                role: m.role,
                content: m.content.trim(),
            }));
    }

    /**
     * Helper method to handle API errors
     */
    protected handleError(error: any, context: string): never {
        console.error(`[${this.providerName}] ${context}:`, error);

        // Extract meaningful error message
        let errorMessage = 'Unknown error occurred';
        if (error?.message) {
            errorMessage = error.message;
        } else if (error?.error?.message) {
            errorMessage = error.error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        }

        throw new Error(`${this.providerName} API Error: ${errorMessage}`);
    }

    /**
     * Helper method to validate streaming options
     */
    protected validateStreamingOptions(options?: AIRequestOptions): void {
        if (!this.supportsStreaming() && options?.onStream) {
            throw new Error(`${this.providerName} does not support streaming`);
        }
    }

    /**
     * Helper method to get effective temperature
     */
    protected getEffectiveTemperature(options?: AIRequestOptions): number {
        const limits = this.getParameterLimits();
        return options?.temperature ?? this.config.temperature ?? limits.temperature.default;
    }

    /**
     * Helper method to get effective max tokens
     */
    protected getEffectiveMaxTokens(options?: AIRequestOptions): number {
        const limits = this.getParameterLimits();
        return options?.maxTokens ?? this.config.maxTokens ?? limits.maxTokens.default;
    }
}
