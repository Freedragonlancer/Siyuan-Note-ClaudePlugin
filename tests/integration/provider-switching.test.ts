/**
 * Integration tests for provider switching
 * Tests the full workflow of switching between AI providers
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import nock from 'nock';
import { UniversalAIClient } from '@/claude/UniversalAIClient';
import type { MultiProviderSettings } from '@/claude/types';

describe('Provider Switching Integration', () => {
    let client: UniversalAIClient;
    
    const createTestSettings = (activeProvider: 'anthropic' | 'openai'): MultiProviderSettings => ({
        activeProvider,
        providers: {
            anthropic: {
                apiKey: 'sk-ant-test-key-1234567890',
                model: 'claude-3-5-sonnet-20241022',
                baseURL: '',
                enabled: true,
            },
            openai: {
                apiKey: 'sk-test-openai-key-1234567890',
                model: 'gpt-4-turbo-preview',
                baseURL: '',
                enabled: true,
            },
        },
        model: 'claude-3-5-sonnet-20241022',
        maxTokens: 1024,
        temperature: 0.7,
        systemPrompt: '',
        appendedPrompt: '',
    });
    
    beforeEach(() => {
        nock.cleanAll();
    });
    
    afterEach(() => {
        nock.cleanAll();
    });
    
    describe('Basic Provider Switching', () => {
        it('should initialize with Anthropic provider', () => {
            const settings = createTestSettings('anthropic');
            client = new UniversalAIClient(settings);
            
            expect(client.isConfigured()).toBe(true);
            expect(client.getProviderName()).toContain('Anthropic');
            expect(client.getActiveProvider()).toBe('anthropic');
        });
        
        it('should switch from Anthropic to OpenAI', () => {
            const settings = createTestSettings('anthropic');
            client = new UniversalAIClient(settings);
            
            expect(client.getActiveProvider()).toBe('anthropic');
            
            // Switch to OpenAI
            client.updateSettings({ activeProvider: 'openai' });
            
            expect(client.getActiveProvider()).toBe('openai');
            expect(client.getProviderName()).toContain('OpenAI');
        });
        
        it('should switch from OpenAI to Anthropic', () => {
            const settings = createTestSettings('openai');
            client = new UniversalAIClient(settings);
            
            expect(client.getActiveProvider()).toBe('openai');
            
            // Switch to Anthropic
            client.updateSettings({ activeProvider: 'anthropic' });
            
            expect(client.getActiveProvider()).toBe('anthropic');
            expect(client.getProviderName()).toContain('Anthropic');
        });
    });
    
    describe('Provider Switching During Active Request', () => {
        it('should cancel active request when switching providers', async () => {
            const settings = createTestSettings('anthropic');
            client = new UniversalAIClient(settings);
            
            // Mock slow Anthropic response
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .delay(2000) // 2 second delay
                .reply(200, {
                    content: [{ type: 'text', text: 'Anthropic response' }],
                });
            
            // Start request with Anthropic
            const messageCallback = vi.fn();
            const errorCallback = vi.fn();
            const completeCallback = vi.fn();
            
            const requestPromise = client.sendMessage(
                [{ role: 'user', content: 'Hello' }],
                messageCallback,
                errorCallback,
                completeCallback,
                'Test'
            );
            
            // Wait a bit, then switch provider mid-request
            await new Promise(resolve => setTimeout(resolve, 100));
            client.updateSettings({ activeProvider: 'openai' });
            
            // Wait for request to complete/fail
            await requestPromise;
            
            // Should have called error callback (request cancelled)
            expect(errorCallback).toHaveBeenCalled();
            expect(completeCallback).toHaveBeenCalled();
        });
    });
    
    describe('Concurrent Provider Initialization Prevention', () => {
        it('should prevent concurrent provider initialization', () => {
            const settings = createTestSettings('anthropic');
            client = new UniversalAIClient(settings);
            
            // Try to switch providers rapidly
            client.updateSettings({ activeProvider: 'openai' });
            client.updateSettings({ activeProvider: 'anthropic' });
            client.updateSettings({ activeProvider: 'openai' });
            
            // Should not crash or create multiple providers
            expect(client.isConfigured()).toBe(true);
            expect(client.getActiveProvider()).toBe('openai'); // Last switch wins
        });
    });
    
    describe('Provider Configuration Validation', () => {
        it('should fail gracefully when provider is not configured', () => {
            const settings: MultiProviderSettings = {
                activeProvider: 'anthropic',
                providers: {
                    anthropic: {
                        apiKey: '', // Empty API key
                        model: 'claude-3-5-sonnet-20241022',
                        baseURL: '',
                        enabled: true,
                    },
                },
                model: 'claude-3-5-sonnet-20241022',
                maxTokens: 1024,
                temperature: 0.7,
                systemPrompt: '',
                appendedPrompt: '',
            };
            
            client = new UniversalAIClient(settings);
            
            expect(client.isConfigured()).toBe(false);
            expect(client.getProviderName()).toBe('Not configured');
        });
        
        it('should reconfigure when API key is added', () => {
            const settings: MultiProviderSettings = {
                activeProvider: 'anthropic',
                providers: {
                    anthropic: {
                        apiKey: '', // Empty initially
                        model: 'claude-3-5-sonnet-20241022',
                        baseURL: '',
                        enabled: true,
                    },
                },
                model: 'claude-3-5-sonnet-20241022',
                maxTokens: 1024,
                temperature: 0.7,
                systemPrompt: '',
                appendedPrompt: '',
            };
            
            client = new UniversalAIClient(settings);
            expect(client.isConfigured()).toBe(false);
            
            // Add API key
            client.updateSettings({
                providers: {
                    anthropic: {
                        apiKey: 'sk-ant-test-key-1234567890',
                        model: 'claude-3-5-sonnet-20241022',
                        baseURL: '',
                        enabled: true,
                    },
                },
            });
            
            expect(client.isConfigured()).toBe(true);
            expect(client.getProviderName()).toContain('Anthropic');
        });
    });
    
    describe('Provider Switching with Different Models', () => {
        it('should use correct model after provider switch', async () => {
            const settings = createTestSettings('anthropic');
            client = new UniversalAIClient(settings);
            
            // Mock Anthropic request with Claude model
            const anthropicMock = nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(200, function(uri, requestBody: any) {
                    // Verify correct model is used
                    expect(requestBody.model).toBe('claude-3-5-sonnet-20241022');
                    return {
                        content: [{ type: 'text', text: 'Anthropic response' }],
                    };
                });
            
            await client.sendMessageSimple([{ role: 'user', content: 'Hello' }]);
            
            expect(anthropicMock.isDone()).toBe(true);
            
            // Switch to OpenAI
            client.updateSettings({
                activeProvider: 'openai',
                providers: {
                    ...settings.providers,
                    openai: {
                        ...settings.providers.openai!,
                        model: 'gpt-4-turbo-preview',
                    },
                },
            });
            
            // Mock OpenAI request with GPT model
            const openaiMock = nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, function(uri, requestBody: any) {
                    // Verify correct model is used
                    expect(requestBody.model).toBe('gpt-4-turbo-preview');
                    return {
                        choices: [{ message: { content: 'OpenAI response' } }],
                    };
                });
            
            await client.sendMessageSimple([{ role: 'user', content: 'Hello' }]);
            
            expect(openaiMock.isDone()).toBe(true);
        });
    });
});
