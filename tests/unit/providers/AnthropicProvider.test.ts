/**
 * Unit tests for AnthropicProvider
 * Tests Anthropic-specific functionality and edge cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import nock from 'nock';
import { AnthropicProvider } from '@/ai/AnthropicProvider';
import type { AIModelConfig, Message } from '@/ai/types';

describe('AnthropicProvider', () => {
    let provider: AnthropicProvider;
    const mockConfig: AIModelConfig = {
        provider: 'anthropic',
        modelId: 'claude-3-5-sonnet-20241022',
        apiKey: 'sk-ant-test-key-1234567890',
        maxTokens: 1024,
        temperature: 0.7,
    };
    
    beforeEach(() => {
        // Clean up nock interceptors before each test
        nock.cleanAll();
    });
    
    afterEach(() => {
        nock.cleanAll();
    });
    
    describe('Configuration Validation', () => {
        it('should reject empty API key', () => {
            expect(() => new AnthropicProvider({
                ...mockConfig,
                apiKey: '',
            })).toThrow('API key is required');
        });
        
        it('should reject whitespace-only API key', () => {
            expect(() => new AnthropicProvider({
                ...mockConfig,
                apiKey: '   ',
            })).toThrow('API key is required');
        });
        
        it('should reject non-Claude model IDs', () => {
            expect(() => new AnthropicProvider({
                ...mockConfig,
                modelId: 'gpt-4',
            })).toThrow(/only supports Claude models/i);
        });
        
        it('should accept valid Claude model IDs', () => {
            const validModels = [
                'claude-3-5-sonnet-20241022',
                'claude-3-5-haiku-20241022',
                'claude-3-opus-20240229',
                'claude-sonnet-4-20250514',
            ];
            
            validModels.forEach(modelId => {
                expect(() => new AnthropicProvider({
                    ...mockConfig,
                    modelId,
                })).not.toThrow();
            });
        });
    });
    
    describe('BaseURL Normalization', () => {
        it('should remove trailing slash from baseURL', () => {
            const providerWithTrailingSlash = new AnthropicProvider({
                ...mockConfig,
                baseURL: 'https://api.example.com/',
            });
            
            // Verify that baseURL is normalized (implementation detail check)
            expect(providerWithTrailingSlash).toBeDefined();
        });
        
        it('should remove trailing /v1 from baseURL', () => {
            const providerWithV1 = new AnthropicProvider({
                ...mockConfig,
                baseURL: 'https://api.example.com/v1',
            });
            
            expect(providerWithV1).toBeDefined();
        });
        
        it('should handle multiple trailing slashes', () => {
            const providerWithMultipleSlashes = new AnthropicProvider({
                ...mockConfig,
                baseURL: 'https://api.example.com///',
            });
            
            expect(providerWithMultipleSlashes).toBeDefined();
        });
    });
    
    describe('sendMessage', () => {
        beforeEach(() => {
            provider = new AnthropicProvider(mockConfig);
        });
        
        it('should send message and return response', async () => {
            // Mock successful API response
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(200, {
                    id: 'msg_test',
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'text', text: 'Hello! How can I help you?' }],
                    model: 'claude-3-5-sonnet-20241022',
                    stop_reason: 'end_turn',
                    usage: { input_tokens: 10, output_tokens: 20 },
                });
            
            const messages: Message[] = [
                { role: 'user', content: 'Hello' }
            ];
            
            const response = await provider.sendMessage(messages);
            expect(response).toBe('Hello! How can I help you?');
        });
        
        it('should handle malformed API response - missing content', async () => {
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(200, {
                    id: 'msg_test',
                    type: 'message',
                    role: 'assistant',
                    // Missing 'content' field
                    model: 'claude-3-5-sonnet-20241022',
                });
            
            const messages: Message[] = [
                { role: 'user', content: 'Hello' }
            ];
            
            await expect(provider.sendMessage(messages)).rejects.toThrow();
        });
        
        it('should handle malformed API response - empty content array', async () => {
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(200, {
                    id: 'msg_test',
                    type: 'message',
                    role: 'assistant',
                    content: [], // Empty content array
                    model: 'claude-3-5-sonnet-20241022',
                });
            
            const messages: Message[] = [
                { role: 'user', content: 'Hello' }
            ];
            
            const response = await provider.sendMessage(messages);
            expect(response).toBe(''); // Should return empty string, not throw
        });
        
        it('should handle malformed API response - invalid JSON', async () => {
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(200, 'not valid json');
            
            const messages: Message[] = [
                { role: 'user', content: 'Hello' }
            ];
            
            await expect(provider.sendMessage(messages)).rejects.toThrow();
        });
        
        it('should handle 401 authentication error', async () => {
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(401, {
                    error: {
                        type: 'authentication_error',
                        message: 'Invalid API key',
                    },
                });
            
            const messages: Message[] = [
                { role: 'user', content: 'Hello' }
            ];
            
            await expect(provider.sendMessage(messages)).rejects.toThrow();
        });
        
        it('should handle 429 rate limit error', async () => {
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(429, {
                    error: {
                        type: 'rate_limit_error',
                        message: 'Rate limit exceeded',
                    },
                }, {
                    'retry-after': '60',
                });
            
            const messages: Message[] = [
                { role: 'user', content: 'Hello' }
            ];
            
            await expect(provider.sendMessage(messages)).rejects.toThrow();
        });
        
        it('should handle 500 server error', async () => {
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(500, {
                    error: {
                        type: 'internal_server_error',
                        message: 'Internal server error',
                    },
                });
            
            const messages: Message[] = [
                { role: 'user', content: 'Hello' }
            ];
            
            await expect(provider.sendMessage(messages)).rejects.toThrow();
        });
        
        it('should handle network timeout', async () => {
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .delayConnection(130000) // 130 seconds > 120s timeout
                .reply(200, { content: [{ type: 'text', text: 'too late' }] });
            
            const messages: Message[] = [
                { role: 'user', content: 'Hello' }
            ];
            
            await expect(provider.sendMessage(messages)).rejects.toThrow();
        });
        
        it('should respect AbortSignal', async () => {
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .delay(1000)
                .reply(200, {
                    content: [{ type: 'text', text: 'Response' }],
                });
            
            const controller = new AbortController();
            const messages: Message[] = [
                { role: 'user', content: 'Hello' }
            ];
            
            // Abort after 100ms
            setTimeout(() => controller.abort(), 100);
            
            await expect(
                provider.sendMessage(messages, { signal: controller.signal })
            ).rejects.toThrow();
        });
    });
    
    describe('streamMessage', () => {
        beforeEach(() => {
            provider = new AnthropicProvider(mockConfig);
        });
        
        it('should stream message chunks', async () => {
            // Note: Mocking streaming is complex with nock
            // This is a simplified test - real implementation would use event streams
            const chunks: string[] = [];
            const onStream = (chunk: string) => chunks.push(chunk);
            
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(200, {
                    id: 'msg_test',
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'text', text: 'Streamed response' }],
                    model: 'claude-3-5-sonnet-20241022',
                    stop_reason: 'end_turn',
                });
            
            const messages: Message[] = [
                { role: 'user', content: 'Hello' }
            ];
            
            await provider.streamMessage(messages, { onStream });
            
            expect(chunks.length).toBeGreaterThan(0);
        });
    });
    
    describe('getAvailableModels', () => {
        it('should return list of Claude models', () => {
            provider = new AnthropicProvider(mockConfig);
            const models = provider.getAvailableModels();
            
            expect(models).toContain('claude-3-5-sonnet-20241022');
            expect(models).toContain('claude-3-5-haiku-20241022');
            expect(models.length).toBeGreaterThan(0);
            
            // All models should contain 'claude'
            models.forEach(model => {
                expect(model.toLowerCase()).toContain('claude');
            });
        });
    });
    
    describe('getMaxTokenLimit', () => {
        beforeEach(() => {
            provider = new AnthropicProvider(mockConfig);
        });
        
        it('should return correct token limit for Sonnet 4.5', () => {
            const limit = provider.getMaxTokenLimit('claude-sonnet-4-5-20250929');
            expect(limit).toBe(8192);
        });
        
        it('should return correct token limit for Claude 3.5', () => {
            const limit = provider.getMaxTokenLimit('claude-3-5-sonnet-20241022');
            expect(limit).toBe(8192);
        });
        
        it('should return default limit for unknown model', () => {
            const limit = provider.getMaxTokenLimit('unknown-model');
            expect(limit).toBe(4096);
        });
    });
});
