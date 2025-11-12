/**
 * Unit tests for OpenAIProvider
 * Tests OpenAI-specific functionality and edge cases
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { OpenAIProvider } from '@/ai/providers/OpenAIProvider';
import type { AIModelConfig, Message } from '@/ai/types';

describe('OpenAIProvider', () => {
    let provider: OpenAIProvider;
    const mockConfig: AIModelConfig = {
        provider: 'openai',
        modelId: 'gpt-4-turbo-preview',
        apiKey: 'sk-test-openai-key-1234567890',
        maxTokens: 1024,
        temperature: 0.7,
    };
    
    beforeEach(() => {
        nock.cleanAll();
    });
    
    afterEach(() => {
        nock.cleanAll();
    });
    
    describe('Configuration Validation', () => {
        it('should reject empty API key', () => {
            expect(() => new OpenAIProvider({
                ...mockConfig,
                apiKey: '',
            })).toThrow('API key is required');
        });
        
        it('should accept valid OpenAI model IDs', () => {
            const validModels = [
                'gpt-4-turbo-preview',
                'gpt-4o',
                'gpt-4',
                'gpt-3.5-turbo',
            ];
            
            validModels.forEach(modelId => {
                expect(() => new OpenAIProvider({
                    ...mockConfig,
                    modelId,
                })).not.toThrow();
            });
        });
        
        it('should warn about unknown models but not fail', () => {
            // OpenAIProvider allows unknown models with warning
            expect(() => new OpenAIProvider({
                ...mockConfig,
                modelId: 'gpt-unknown-model',
            })).not.toThrow();
        });
    });
    
    describe('sendMessage', () => {
        beforeEach(() => {
            provider = new OpenAIProvider(mockConfig);
        });
        
        it('should send message and return response', async () => {
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    id: 'chatcmpl-test',
                    object: 'chat.completion',
                    created: 1234567890,
                    model: 'gpt-4-turbo-preview',
                    choices: [{
                        index: 0,
                        message: { role: 'assistant', content: 'Hello! How can I help you?' },
                        finish_reason: 'stop',
                    }],
                    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
                });
            
            const messages: Message[] = [
                { role: 'user', content: 'Hello' }
            ];
            
            const response = await provider.sendMessage(messages);
            expect(response).toBe('Hello! How can I help you?');
        });
        
        it('should handle malformed API response - missing choices', async () => {
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    id: 'chatcmpl-test',
                    object: 'chat.completion',
                    // Missing 'choices' field
                });
            
            const messages: Message[] = [
                { role: 'user', content: 'Hello' }
            ];
            
            await expect(provider.sendMessage(messages)).rejects.toThrow();
        });
        
        it('should handle malformed API response - empty choices array', async () => {
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    id: 'chatcmpl-test',
                    choices: [], // Empty choices
                });
            
            const messages: Message[] = [
                { role: 'user', content: 'Hello' }
            ];
            
            await expect(provider.sendMessage(messages)).rejects.toThrow();
        });
        
        it('should handle 401 authentication error', async () => {
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(401, {
                    error: {
                        message: 'Incorrect API key provided',
                        type: 'invalid_request_error',
                    },
                });
            
            const messages: Message[] = [
                { role: 'user', content: 'Hello' }
            ];
            
            await expect(provider.sendMessage(messages)).rejects.toThrow();
        });
        
        it('should handle 429 rate limit error', async () => {
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(429, {
                    error: {
                        message: 'Rate limit exceeded',
                        type: 'rate_limit_error',
                    },
                }, {
                    'retry-after': '60',
                });
            
            const messages: Message[] = [
                { role: 'user', content: 'Hello' }
            ];
            
            await expect(provider.sendMessage(messages)).rejects.toThrow();
        });
        
        it('should respect AbortSignal', async () => {
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .delay(1000)
                .reply(200, {
                    choices: [{ message: { content: 'Response' } }],
                });
            
            const controller = new AbortController();
            const messages: Message[] = [
                { role: 'user', content: 'Hello' }
            ];
            
            setTimeout(() => controller.abort(), 100);
            
            await expect(
                provider.sendMessage(messages, { signal: controller.signal })
            ).rejects.toThrow();
        });
    });
    
    describe('getAvailableModels', () => {
        it('should return list of OpenAI models', () => {
            provider = new OpenAIProvider(mockConfig);
            const models = provider.getAvailableModels();
            
            expect(models).toContain('gpt-4-turbo-preview');
            expect(models).toContain('gpt-4o');
            expect(models).toContain('gpt-3.5-turbo');
            expect(models.length).toBeGreaterThan(0);
        });
    });
    
    describe('getMaxTokenLimit', () => {
        beforeEach(() => {
            provider = new OpenAIProvider(mockConfig);
        });
        
        it('should return correct token limit for GPT-4', () => {
            const limit = provider.getMaxTokenLimit('gpt-4-turbo-preview');
            expect(limit).toBeGreaterThan(0);
        });
        
        it('should return correct token limit for GPT-3.5', () => {
            const limit = provider.getMaxTokenLimit('gpt-3.5-turbo');
            expect(limit).toBeGreaterThan(0);
        });
    });
});
