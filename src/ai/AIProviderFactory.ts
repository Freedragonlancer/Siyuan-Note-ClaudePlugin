/**
 * AI Provider Factory
 * Manages registration and creation of AI providers
 */

import type { AIProvider, AIProviderType, AIModelConfig, ProviderRegistration } from './types';
import { AnthropicProvider } from './AnthropicProvider';

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

        // TODO: Register other providers
        // this.register({
        //     type: 'openai',
        //     factory: (config) => new OpenAIProvider(config),
        //     displayName: 'OpenAI',
        //     description: 'GPT-4, GPT-3.5 and other OpenAI models',
        // });
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
}

// Initialize factory on module load
AIProviderFactory.initialize();
