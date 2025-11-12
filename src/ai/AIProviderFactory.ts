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
     */
    static initialize(): void {
        // Register Anthropic provider
        this.register({
            type: 'anthropic',
            factory: (config) => new AnthropicProvider(config),
            displayName: 'Anthropic Claude',
            description: 'Claude AI models (Opus, Sonnet, Haiku)',
        });

        // Register OpenAI provider
        this.register({
            type: 'openai',
            factory: (config) => new OpenAIProvider(config),
            displayName: 'OpenAI',
            description: 'GPT-4, GPT-3.5 and other OpenAI models',
        });

        // Register Google Gemini provider
        this.register({
            type: 'gemini',
            factory: (config) => new GeminiProvider(config),
            displayName: 'Google Gemini',
            description: 'Gemini Pro and other Google AI models',
        });

        // Register xAI Grok provider
        this.register({
            type: 'xai',
            factory: (config) => new XAIProvider(config),
            displayName: 'xAI Grok',
            description: 'Grok and other xAI models',
        });

        // Register DeepSeek provider
        this.register({
            type: 'deepseek',
            factory: (config) => new DeepSeekProvider(config),
            displayName: 'DeepSeek',
            description: 'DeepSeek Chat, Coder, and Reasoner models',
        });

        // Register Moonshot AI (Kimi) provider
        this.register({
            type: 'moonshot',
            factory: (config) => new MoonshotProvider(config),
            displayName: 'Moonshot AI (Kimi)',
            description: 'Kimi K2 series with 256K context and reasoning models',
        });
    }

    /**
     * Register a new AI provider
     */
    static register(registration: ProviderRegistration): void {
        this.registrations.set(registration.type, registration);
        console.log(`[AIProviderFactory] Registered provider: ${registration.displayName}`);
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
        const tempConfig: AIModelConfig = {
            provider: type,
            apiKey: '',
            modelId: '',
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
}

// Initialize factory on module load
AIProviderFactory.initialize();
