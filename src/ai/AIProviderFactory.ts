/**
 * AI Provider Factory
 * Manages registration and creation of AI providers
 */

import type { AIProvider, AIProviderType, AIModelConfig, ProviderRegistration, ProviderMetadata } from './types';
import { AnthropicProvider } from './AnthropicProvider';
import { OpenAIProvider, GeminiProvider, XAIProvider, DeepSeekProvider, MoonshotProvider } from './providers';

export class AIProviderFactory {
    private static registrations: Map<AIProviderType, ProviderRegistration> = new Map();

    /**
     * Initialize factory with default providers
     * Simplified: displayName/description are retrieved from provider's getMetadata()
     */
    static initialize(): void {
        // Register all providers - metadata is obtained from getMetadata()
        this.register({ type: 'anthropic', factory: (config) => new AnthropicProvider(config) });
        this.register({ type: 'openai', factory: (config) => new OpenAIProvider(config) });
        this.register({ type: 'gemini', factory: (config) => new GeminiProvider(config) });
        this.register({ type: 'xai', factory: (config) => new XAIProvider(config) });
        this.register({ type: 'deepseek', factory: (config) => new DeepSeekProvider(config) });
        this.register({ type: 'moonshot', factory: (config) => new MoonshotProvider(config) });
    }

    /**
     * Register a new AI provider
     */
    static register(registration: ProviderRegistration): void {
        this.registrations.set(registration.type, registration);
        console.log(`[AIProviderFactory] Registered provider: ${registration.type}`);
    }

    /**
     * Create an AI provider instance
     * @param config Model configuration
     * @returns AI provider instance
     */
    static create(config: AIModelConfig): AIProvider {
        const registration = this.registrations.get(config.provider);
        if (!registration) {
            throw new Error(`Unknown AI provider: ${config.provider}`);
        }

        return registration.factory(config);
    }

    /**
     * Get all registered providers
     * @returns List of provider registrations
     */
    static getRegistrations(): ProviderRegistration[] {
        return Array.from(this.registrations.values());
    }

    /**
     * Check if a provider is registered
     */
    static isRegistered(providerType: AIProviderType): boolean {
        return this.registrations.has(providerType);
    }

    /**
     * Get provider registration by type
     */
    static getRegistration(providerType: AIProviderType): ProviderRegistration | undefined {
        return this.registrations.get(providerType);
    }

    /**
     * Get all registered provider types
     * @returns Array of provider type strings
     */
    static getProviderTypes(): string[] {
        return Array.from(this.registrations.keys());
    }

    /**
     * Check if a provider is registered (alias for isRegistered)
     * @param type Provider type to check
     * @returns True if provider is registered
     */
    static hasProvider(type: string): boolean {
        return this.registrations.has(type);
    }

    /**
     * Get provider metadata by creating a temporary instance
     * @param type Provider type
     * @returns Provider metadata
     */
    static getMetadata(type: string): ProviderMetadata {
        const registration = this.registrations.get(type);
        if (!registration) {
            throw new Error(`Provider "${type}" not registered. Available providers: ${this.getProviderTypes().join(', ')}`);
        }

        // Create temporary instance to get metadata
        // Use placeholder values to pass validation (not used for actual API calls)
        const tempConfig: AIModelConfig = {
            provider: type,
            apiKey: 'placeholder-key-for-metadata-retrieval',
            modelId: 'placeholder-model-for-metadata-retrieval',
        };
        const instance = registration.factory(tempConfig);
        return instance.getMetadata();
    }

    /**
     * Get metadata for all registered providers
     * @returns Map of provider type to metadata
     */
    static getAllMetadata(): Map<string, ProviderMetadata> {
        const metadata = new Map<string, ProviderMetadata>();
        for (const type of this.getProviderTypes()) {
            try {
                metadata.set(type, this.getMetadata(type));
            } catch (error) {
                console.error(`[AIProviderFactory] Failed to get metadata for ${type}:`, error);
            }
        }
        return metadata;
    }

    /**
     * Get parameter limits for a provider by creating a temporary instance
     * @param type Provider type
     * @returns Parameter limits (temperature and maxTokens ranges)
     */
    static getParameterLimits(type: string) {
        const registration = this.registrations.get(type);
        if (!registration) {
            throw new Error(`Provider "${type}" not registered. Available providers: ${this.getProviderTypes().join(', ')}`);
        }

        // Create temporary instance to get parameter limits
        // Use placeholder values to pass validation (not used for actual API calls)
        const tempConfig: AIModelConfig = {
            provider: type,
            // IMPORTANT: Use same placeholder key as getMetadata() to bypass validation
            apiKey: 'placeholder-key-for-metadata-retrieval',
            modelId: 'placeholder-model-for-limits-retrieval',
        };
        const instance = registration.factory(tempConfig);
        return instance.getParameterLimits();
    }
}

// Initialize factory on module load
AIProviderFactory.initialize();
