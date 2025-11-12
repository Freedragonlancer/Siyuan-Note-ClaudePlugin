/**
 * Unit tests for BaseAIProvider
 * Tests common provider functionality and edge cases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AIProvider, AIModelConfig, AIRequestOptions, Message } from '@/ai/types';

// Mock implementation of BaseAIProvider for testing
class TestProvider implements AIProvider {
    readonly providerType = 'test' as const;
    readonly providerName = 'Test Provider';
    
    constructor(public config: AIModelConfig) {
        const validation = this.validateConfig(config);
        if (validation !== true) {
            throw new Error(validation);
        }
    }
    
    async sendMessage(messages: Message[], options?: AIRequestOptions): Promise<string> {
        return 'test response';
    }
    
    async streamMessage(messages: Message[], options?: AIRequestOptions): Promise<void> {
        options?.onStream?.('test chunk');
    }
    
    validateConfig(config: AIModelConfig): true | string {
        if (!config.apiKey || config.apiKey.trim() === '') {
            return 'API key is required';
        }
        if (config.apiKey.length < 10) {
            return 'API key is too short';
        }
        return true;
    }
    
    getAvailableModels(): string[] {
        return ['test-model-1', 'test-model-2'];
    }
    
    getMaxTokenLimit(model: string): number {
        return 8192;
    }
}

describe('BaseAIProvider', () => {
    describe('Configuration Validation', () => {
        it('should reject empty API key', () => {
            expect(() => new TestProvider({
                provider: 'test',
                modelId: 'test-model',
                apiKey: '',
                maxTokens: 1024,
                temperature: 0.7,
            })).toThrow('API key is required');
        });
        
        it('should reject whitespace-only API key', () => {
            expect(() => new TestProvider({
                provider: 'test',
                modelId: 'test-model',
                apiKey: '   ',
                maxTokens: 1024,
                temperature: 0.7,
            })).toThrow('API key is required');
        });
        
        it('should reject API key that is too short', () => {
            expect(() => new TestProvider({
                provider: 'test',
                modelId: 'test-model',
                apiKey: 'short',
                maxTokens: 1024,
                temperature: 0.7,
            })).toThrow('API key is too short');
        });
        
        it('should accept valid API key', () => {
            expect(() => new TestProvider({
                provider: 'test',
                modelId: 'test-model',
                apiKey: 'valid-api-key-12345',
                maxTokens: 1024,
                temperature: 0.7,
            })).not.toThrow();
        });
    });
    
    describe('sendMessage', () => {
        let provider: TestProvider;
        
        beforeEach(() => {
            provider = new TestProvider({
                provider: 'test',
                modelId: 'test-model',
                apiKey: 'valid-api-key-12345',
                maxTokens: 1024,
                temperature: 0.7,
            });
        });
        
        it('should send message and return response', async () => {
            const messages: Message[] = [
                { role: 'user', content: 'Hello' }
            ];
            
            const response = await provider.sendMessage(messages);
            expect(response).toBe('test response');
        });
        
        it('should handle empty message array', async () => {
            const response = await provider.sendMessage([]);
            expect(response).toBe('test response');
        });
        
        it('should pass options to implementation', async () => {
            const messages: Message[] = [
                { role: 'user', content: 'Hello' }
            ];
            
            const options: AIRequestOptions = {
                maxTokens: 512,
                temperature: 0.5,
            };
            
            const response = await provider.sendMessage(messages, options);
            expect(response).toBe('test response');
        });
    });
    
    describe('streamMessage', () => {
        let provider: TestProvider;
        
        beforeEach(() => {
            provider = new TestProvider({
                provider: 'test',
                modelId: 'test-model',
                apiKey: 'valid-api-key-12345',
                maxTokens: 1024,
                temperature: 0.7,
            });
        });
        
        it('should stream chunks via callback', async () => {
            const chunks: string[] = [];
            const onStream = (chunk: string) => chunks.push(chunk);
            
            const messages: Message[] = [
                { role: 'user', content: 'Hello' }
            ];
            
            await provider.streamMessage(messages, { onStream });
            
            expect(chunks).toEqual(['test chunk']);
        });
        
        it('should handle undefined onStream callback', async () => {
            const messages: Message[] = [
                { role: 'user', content: 'Hello' }
            ];
            
            // Should not throw
            await expect(provider.streamMessage(messages, {})).resolves.toBeUndefined();
        });
    });
    
    describe('getAvailableModels', () => {
        it('should return list of available models', () => {
            const provider = new TestProvider({
                provider: 'test',
                modelId: 'test-model',
                apiKey: 'valid-api-key-12345',
                maxTokens: 1024,
                temperature: 0.7,
            });
            
            const models = provider.getAvailableModels();
            expect(models).toEqual(['test-model-1', 'test-model-2']);
            expect(models.length).toBeGreaterThan(0);
        });
    });
    
    describe('getMaxTokenLimit', () => {
        it('should return maximum token limit for model', () => {
            const provider = new TestProvider({
                provider: 'test',
                modelId: 'test-model',
                apiKey: 'valid-api-key-12345',
                maxTokens: 1024,
                temperature: 0.7,
            });
            
            const limit = provider.getMaxTokenLimit('test-model-1');
            expect(limit).toBe(8192);
            expect(limit).toBeGreaterThan(0);
        });
    });
});
