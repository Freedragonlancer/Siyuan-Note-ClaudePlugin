# Multi-AI Platform Integration Technical Documentation

**Project**: SiYuan Note Plugin - Multi-AI Platform Support
**Version**: 1.0.0
**Date**: 2025-01-11
**Author**: Claude Assistant

---

## Executive Summary

This document outlines the technical architecture and implementation plan for integrating multiple AI platforms into the SiYuan Note plugin. The plugin already has a modular AIProvider abstraction layer with Anthropic Claude implemented. This document details how to extend support to OpenAI, Google Gemini, xAI Grok, and DeepSeek platforms.

---

## Table of Contents

1. [AI Platform API Comparison](#ai-platform-api-comparison)
2. [Unified Provider Interface Design](#unified-provider-interface-design)
3. [Configuration Management](#configuration-management)
4. [Implementation Architecture](#implementation-architecture)
5. [Provider Implementations](#provider-implementations)
6. [Testing Strategy](#testing-strategy)
7. [Migration & Deployment](#migration--deployment)
8. [Performance Considerations](#performance-considerations)
9. [Security & Best Practices](#security--best-practices)

---

## AI Platform API Comparison

### API Endpoints & Authentication

| Platform | Base URL | Authentication | Custom Endpoint Support | API Compatibility |
|----------|----------|----------------|-------------------------|-------------------|
| **OpenAI** | `https://api.openai.com/v1` | Bearer Token (API Key) | Yes (Azure, proxies) | OpenAI Standard |
| **Anthropic** | `https://api.anthropic.com` | x-api-key Header | Yes | Anthropic Format |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta` | API Key in URL/Header | Yes (Vertex AI) | Gemini + OpenAI Compatible |
| **xAI Grok** | `https://api.x.ai/v1` | Bearer Token (API Key) | Yes | OpenAI Compatible |
| **DeepSeek** | `https://api.deepseek.com` | Bearer Token (API Key) | Yes | OpenAI Compatible |

### Streaming Support

| Platform | Streaming Method | Response Format | Stream Terminator |
|----------|-----------------|-----------------|-------------------|
| **OpenAI** | Server-Sent Events (SSE) | `data: {json}\n\n` | `data: [DONE]` |
| **Anthropic** | SSE | Event-based chunks | Stream end event |
| **Google Gemini** | SSE | `streamGenerateContent` | Stream completion |
| **xAI Grok** | SSE | OpenAI-compatible | `data: [DONE]` |
| **DeepSeek** | SSE | OpenAI-compatible | `data: [DONE]` |

### Core Parameters Comparison

| Parameter | OpenAI | Anthropic | Gemini | xAI Grok | DeepSeek | Notes |
|-----------|---------|-----------|---------|-----------|----------|-------|
| **temperature** | ✅ 0-2 | ✅ 0-1 | ✅ 0-2 | ✅ 0-2 | ✅ 0-2† | Controls randomness |
| **max_tokens** | ✅ Optional | ✅ Required | ✅ Optional | ✅ Optional | ✅ Optional | Response length limit |
| **top_p** | ✅ 0-1 | ✅ 0-1 | ✅ 0-1 | ✅ 0-1 | ✅ 0-1† | Nucleus sampling |
| **top_k** | ❌ | ✅ | ✅ | ❌ | ❌ | Token selection |
| **stop_sequences** | ✅ | ✅ | ✅ (stopSequences) | ✅ | ✅ | Stop generation triggers |
| **system_prompt** | ✅ (system message) | ✅ (system param) | ✅ (systemInstruction) | ✅ (system message) | ✅ (system message) | System instructions |
| **presence_penalty** | ✅ -2 to 2 | ❌ | ❌ | ✅ -2 to 2 | ✅ -2 to 2† | Topic diversity |
| **frequency_penalty** | ✅ -2 to 2 | ❌ | ❌ | ✅ -2 to 2 | ✅ -2 to 2† | Repetition control |

† DeepSeek's reasoning model (deepseek-reasoner) ignores temperature, top_p, presence_penalty, and frequency_penalty

### Available Models (January 2025)

#### OpenAI
- `gpt-4-turbo-preview` - Latest GPT-4 Turbo
- `gpt-4` - GPT-4 base model
- `gpt-3.5-turbo` - Fast, cost-effective
- `gpt-4-vision-preview` - Multimodal support

#### Anthropic (Already Implemented)
- `claude-3-5-sonnet-20241022` - Most capable
- `claude-3-opus-20240229` - High performance
- `claude-3-sonnet-20240229` - Balanced
- `claude-3-haiku-20240307` - Fast, efficient

#### Google Gemini
- `gemini-2.0-flash-exp` - Latest experimental
- `gemini-1.5-pro` - Advanced capabilities
- `gemini-1.5-flash` - Fast responses
- `gemini-1.0-pro` - Stable, production-ready

#### xAI Grok
- `grok-4` - Most intelligent, with tool use
- `grok-3` - Advanced reasoning
- `grok-3-mini` - Lightweight, fast
- `grok-2-vision` - Multimodal support

#### DeepSeek
- `deepseek-v3` - Latest general model
- `deepseek-reasoner` - Reasoning-focused (no temperature control)
- `deepseek-coder` - Code-optimized
- `deepseek-r1` - Research model (max 8192 tokens recommended)

---

## Unified Provider Interface Design

### Enhanced AIProvider Interface

```typescript
// src/ai/types.ts - Enhanced version
export interface AIProvider {
    // Existing methods
    readonly providerType: AIProviderType;
    readonly providerName: string;
    sendMessage(messages: Message[], options?: AIRequestOptions): Promise<string>;
    streamMessage(messages: Message[], options?: AIRequestOptions): Promise<void>;
    validateConfig(config: AIModelConfig): true | string;
    getAvailableModels(): string[];

    // New methods for enhanced compatibility
    supportsStreaming(): boolean;
    supportsSystemPrompt(): boolean;
    getMaxTokenLimit(model: string): number;
    getParameterLimits(): ParameterLimits;
    formatMessages(messages: Message[]): any; // Provider-specific format
}

export interface ParameterLimits {
    temperature: { min: number; max: number; default: number };
    maxTokens: { min: number; max: number; default: number };
    topP?: { min: number; max: number; default: number };
    topK?: { min: number; max: number; default: number };
}

// Extended provider types
export type AIProviderType =
    | 'anthropic'
    | 'openai'
    | 'gemini'
    | 'xai'
    | 'deepseek'
    | 'custom';
```

### Request/Response Normalization

```typescript
// src/ai/normalizers.ts
export class MessageNormalizer {
    static toProviderFormat(
        messages: Message[],
        provider: AIProviderType
    ): any {
        switch (provider) {
            case 'openai':
            case 'xai':
            case 'deepseek':
                return messages.map(m => ({
                    role: m.role,
                    content: m.content
                }));

            case 'anthropic':
                return messages.map(m => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content
                }));

            case 'gemini':
                return {
                    contents: messages.map(m => ({
                        role: m.role === 'assistant' ? 'model' : 'user',
                        parts: [{ text: m.content }]
                    }))
                };

            default:
                return messages;
        }
    }
}
```

---

## Configuration Management

### Multi-Provider Configuration Schema

```typescript
// src/settings/multi-provider-config.ts
export interface MultiProviderConfig {
    // Active provider
    activeProvider: AIProviderType;

    // Provider configurations
    providers: {
        anthropic?: AnthropicConfig;
        openai?: OpenAIConfig;
        gemini?: GeminiConfig;
        xai?: XAIConfig;
        deepseek?: DeepSeekConfig;
        custom?: CustomProviderConfig[];
    };

    // Global settings
    global: {
        defaultMaxTokens: number;
        defaultTemperature: number;
        streamingEnabled: boolean;
        timeout: number;
        retryAttempts: number;
        proxyUrl?: string; // Global proxy for all providers
    };
}

export interface BaseProviderConfig {
    apiKey: string;
    baseURL?: string; // Custom endpoint/proxy
    models: ModelConfig[];
    enabled: boolean;
}

export interface ModelConfig {
    id: string;
    displayName: string;
    maxTokens: number;
    contextWindow: number;
    costPer1kTokens?: number;
    capabilities: string[]; // ['chat', 'code', 'vision', 'function-calling']
}

export interface AnthropicConfig extends BaseProviderConfig {
    // Anthropic-specific settings
}

export interface OpenAIConfig extends BaseProviderConfig {
    organization?: string;
    azureDeploymentName?: string; // For Azure OpenAI
}

export interface GeminiConfig extends BaseProviderConfig {
    projectId?: string; // For Vertex AI
    location?: string;
}

export interface XAIConfig extends BaseProviderConfig {
    // xAI-specific settings
}

export interface DeepSeekConfig extends BaseProviderConfig {
    useReasoningModel?: boolean;
}
```

### Settings UI Integration

```typescript
// src/settings/MultiProviderSettingsPanel.ts
export class MultiProviderSettingsPanel {
    private config: MultiProviderConfig;

    render(): HTMLElement {
        return this.createTabbedInterface([
            { id: 'general', label: 'General', content: this.renderGeneralSettings() },
            { id: 'openai', label: 'OpenAI', content: this.renderOpenAISettings() },
            { id: 'anthropic', label: 'Anthropic', content: this.renderAnthropicSettings() },
            { id: 'gemini', label: 'Gemini', content: this.renderGeminiSettings() },
            { id: 'xai', label: 'xAI Grok', content: this.renderXAISettings() },
            { id: 'deepseek', label: 'DeepSeek', content: this.renderDeepSeekSettings() },
            { id: 'custom', label: 'Custom', content: this.renderCustomProviderSettings() }
        ]);
    }

    private renderProviderSettings(provider: AIProviderType): HTMLElement {
        // Common settings: API Key, Base URL, Model Selection
        // Provider-specific settings based on type
    }

    private testConnection(provider: AIProviderType): Promise<boolean> {
        // Test API connection with minimal request
    }
}
```

---

## Implementation Architecture

### Provider Factory Enhancement

```typescript
// src/ai/ProviderManager.ts
export class ProviderManager {
    private static instance: ProviderManager;
    private providers: Map<AIProviderType, AIProvider> = new Map();
    private config: MultiProviderConfig;

    static getInstance(): ProviderManager {
        if (!this.instance) {
            this.instance = new ProviderManager();
        }
        return this.instance;
    }

    async initialize(config: MultiProviderConfig): Promise<void> {
        this.config = config;

        // Lazy load providers based on configuration
        for (const [type, providerConfig] of Object.entries(config.providers)) {
            if (providerConfig?.enabled) {
                await this.loadProvider(type as AIProviderType);
            }
        }
    }

    private async loadProvider(type: AIProviderType): Promise<void> {
        switch (type) {
            case 'openai':
                const { OpenAIProvider } = await import('./providers/OpenAIProvider');
                this.providers.set(type, new OpenAIProvider(this.config.providers.openai!));
                break;
            case 'gemini':
                const { GeminiProvider } = await import('./providers/GeminiProvider');
                this.providers.set(type, new GeminiProvider(this.config.providers.gemini!));
                break;
            // ... other providers
        }
    }

    getActiveProvider(): AIProvider {
        const provider = this.providers.get(this.config.activeProvider);
        if (!provider) {
            throw new Error(`Active provider ${this.config.activeProvider} not initialized`);
        }
        return provider;
    }

    switchProvider(type: AIProviderType): void {
        if (!this.providers.has(type)) {
            throw new Error(`Provider ${type} not available`);
        }
        this.config.activeProvider = type;
        this.saveConfig();
    }
}
```

---

## Provider Implementations

### OpenAI Provider

```typescript
// src/ai/providers/OpenAIProvider.ts
import OpenAI from 'openai';
import type { AIProvider, AIRequestOptions } from '../types';
import type { Message } from '../../claude/types';

export class OpenAIProvider implements AIProvider {
    readonly providerType = 'openai' as const;
    readonly providerName = 'OpenAI';
    private client: OpenAI;
    private config: OpenAIConfig;

    constructor(config: OpenAIConfig) {
        this.config = config;
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL || 'https://api.openai.com/v1',
            organization: config.organization,
            dangerouslyAllowBrowser: true,
            timeout: 120000,
            maxRetries: 2,
        });
    }

    async sendMessage(messages: Message[], options?: AIRequestOptions): Promise<string> {
        const systemMessage = options?.systemPrompt
            ? [{ role: 'system' as const, content: options.systemPrompt }]
            : [];

        const completion = await this.client.chat.completions.create({
            model: this.config.models[0].id, // Use selected model
            messages: [
                ...systemMessage,
                ...messages.map(m => ({
                    role: m.role as 'user' | 'assistant' | 'system',
                    content: m.content
                }))
            ],
            max_tokens: options?.maxTokens || this.config.models[0].maxTokens,
            temperature: options?.temperature ?? 0.7,
            stop: options?.stopSequences,
            stream: false,
        }, {
            signal: options?.signal,
        });

        return completion.choices[0]?.message?.content || '';
    }

    async streamMessage(messages: Message[], options?: AIRequestOptions): Promise<void> {
        const systemMessage = options?.systemPrompt
            ? [{ role: 'system' as const, content: options.systemPrompt }]
            : [];

        const stream = await this.client.chat.completions.create({
            model: this.config.models[0].id,
            messages: [
                ...systemMessage,
                ...messages.map(m => ({
                    role: m.role as 'user' | 'assistant' | 'system',
                    content: m.content
                }))
            ],
            max_tokens: options?.maxTokens || this.config.models[0].maxTokens,
            temperature: options?.temperature ?? 0.7,
            stop: options?.stopSequences,
            stream: true,
        }, {
            signal: options?.signal,
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                options?.onStream?.(content);
            }
        }
    }

    validateConfig(config: AIModelConfig): true | string {
        if (!config.apiKey || config.apiKey.trim() === '') {
            return 'API key is required';
        }
        if (!config.modelId) {
            return 'Model ID is required';
        }
        if (config.baseURL && !/^https?:\/\/.+/.test(config.baseURL)) {
            return 'Base URL must be a valid HTTP(S) URL';
        }
        return true;
    }

    getAvailableModels(): string[] {
        return [
            'gpt-4-turbo-preview',
            'gpt-4',
            'gpt-3.5-turbo',
            'gpt-4-vision-preview',
        ];
    }

    supportsStreaming(): boolean { return true; }
    supportsSystemPrompt(): boolean { return true; }

    getMaxTokenLimit(model: string): number {
        const limits: Record<string, number> = {
            'gpt-4-turbo-preview': 128000,
            'gpt-4': 8192,
            'gpt-3.5-turbo': 16384,
        };
        return limits[model] || 4096;
    }

    getParameterLimits() {
        return {
            temperature: { min: 0, max: 2, default: 0.7 },
            maxTokens: { min: 1, max: 128000, default: 4096 },
            topP: { min: 0, max: 1, default: 1 },
        };
    }

    formatMessages(messages: Message[]) {
        return messages.map(m => ({
            role: m.role,
            content: m.content
        }));
    }
}
```

### Google Gemini Provider

```typescript
// src/ai/providers/GeminiProvider.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIProvider, AIRequestOptions } from '../types';
import type { Message } from '../../claude/types';

export class GeminiProvider implements AIProvider {
    readonly providerType = 'gemini' as const;
    readonly providerName = 'Google Gemini';
    private client: GoogleGenerativeAI;
    private config: GeminiConfig;

    constructor(config: GeminiConfig) {
        this.config = config;
        const apiKey = config.apiKey;
        const baseURL = config.baseURL || 'https://generativelanguage.googleapis.com/v1beta';

        // Initialize with custom endpoint if provided
        this.client = new GoogleGenerativeAI(apiKey, {
            baseUrl: baseURL
        });
    }

    async sendMessage(messages: Message[], options?: AIRequestOptions): Promise<string> {
        const model = this.client.getGenerativeModel({
            model: this.config.models[0].id,
            generationConfig: {
                temperature: options?.temperature ?? 0.7,
                maxOutputTokens: options?.maxTokens || this.config.models[0].maxTokens,
                topP: options?.temperature ? undefined : 0.95, // Use either temperature or topP
                stopSequences: options?.stopSequences,
            },
            systemInstruction: options?.systemPrompt,
        });

        // Convert messages to Gemini format
        const history = messages.slice(0, -1).map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }));

        const chat = model.startChat({ history });
        const result = await chat.sendMessage(messages[messages.length - 1].content);

        return result.response.text();
    }

    async streamMessage(messages: Message[], options?: AIRequestOptions): Promise<void> {
        const model = this.client.getGenerativeModel({
            model: this.config.models[0].id,
            generationConfig: {
                temperature: options?.temperature ?? 0.7,
                maxOutputTokens: options?.maxTokens || this.config.models[0].maxTokens,
                topP: options?.temperature ? undefined : 0.95,
                stopSequences: options?.stopSequences,
            },
            systemInstruction: options?.systemPrompt,
        });

        const history = messages.slice(0, -1).map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }));

        const chat = model.startChat({ history });
        const result = await chat.sendMessageStream(messages[messages.length - 1].content);

        for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
                options?.onStream?.(text);
            }
        }
    }

    validateConfig(config: AIModelConfig): true | string {
        if (!config.apiKey || config.apiKey.trim() === '') {
            return 'API key is required';
        }
        if (!config.modelId) {
            return 'Model ID is required';
        }
        return true;
    }

    getAvailableModels(): string[] {
        return [
            'gemini-2.0-flash-exp',
            'gemini-1.5-pro',
            'gemini-1.5-flash',
            'gemini-1.0-pro',
        ];
    }

    supportsStreaming(): boolean { return true; }
    supportsSystemPrompt(): boolean { return true; }

    getMaxTokenLimit(model: string): number {
        const limits: Record<string, number> = {
            'gemini-1.5-pro': 1048576, // 1M context
            'gemini-1.5-flash': 1048576,
            'gemini-1.0-pro': 32768,
        };
        return limits[model] || 32768;
    }

    getParameterLimits() {
        return {
            temperature: { min: 0, max: 2, default: 0.7 },
            maxTokens: { min: 1, max: 32768, default: 2048 },
            topP: { min: 0, max: 1, default: 0.95 },
            topK: { min: 1, max: 40, default: 40 },
        };
    }

    formatMessages(messages: Message[]) {
        return {
            contents: messages.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }))
        };
    }
}
```

### xAI Grok Provider

```typescript
// src/ai/providers/XAIProvider.ts
export class XAIProvider implements AIProvider {
    readonly providerType = 'xai' as const;
    readonly providerName = 'xAI Grok';
    private client: OpenAI; // xAI is OpenAI-compatible
    private config: XAIConfig;

    constructor(config: XAIConfig) {
        this.config = config;
        // xAI uses OpenAI SDK with custom baseURL
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL || 'https://api.x.ai/v1',
            dangerouslyAllowBrowser: true,
            timeout: 120000,
            maxRetries: 2,
        });
    }

    // Implementation similar to OpenAIProvider
    // Key differences:
    // - Model IDs: grok-4, grok-3, grok-3-mini
    // - Supports real-time search integration
    // - Native tool use capabilities

    getAvailableModels(): string[] {
        return [
            'grok-4',
            'grok-3',
            'grok-3-mini',
            'grok-2-vision',
        ];
    }
}
```

### DeepSeek Provider

```typescript
// src/ai/providers/DeepSeekProvider.ts
export class DeepSeekProvider implements AIProvider {
    readonly providerType = 'deepseek' as const;
    readonly providerName = 'DeepSeek';
    private client: OpenAI; // DeepSeek is OpenAI-compatible
    private config: DeepSeekConfig;

    constructor(config: DeepSeekConfig) {
        this.config = config;
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL || 'https://api.deepseek.com',
            dangerouslyAllowBrowser: true,
            timeout: 120000,
            maxRetries: 2,
        });
    }

    async sendMessage(messages: Message[], options?: AIRequestOptions): Promise<string> {
        const isReasoningModel = this.config.models[0].id.includes('reasoner');

        // Reasoning model doesn't support temperature/top_p
        const parameters = isReasoningModel
            ? { max_tokens: options?.maxTokens }
            : {
                max_tokens: options?.maxTokens,
                temperature: options?.temperature ?? 1.0,
                top_p: options?.topP,
                frequency_penalty: 0,
                presence_penalty: 0,
            };

        // Similar to OpenAI implementation with adjusted parameters
        // ...
    }

    getAvailableModels(): string[] {
        return [
            'deepseek-v3',
            'deepseek-reasoner',
            'deepseek-coder',
            'deepseek-r1',
        ];
    }

    getMaxTokenLimit(model: string): number {
        // DeepSeek R1 optimal at 8192, max 32768
        if (model === 'deepseek-r1') return 8192;
        return 32768;
    }
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// src/ai/providers/__tests__/provider.test.ts
describe('AI Provider Tests', () => {
    const providers = [
        { type: 'openai', config: mockOpenAIConfig },
        { type: 'gemini', config: mockGeminiConfig },
        { type: 'xai', config: mockXAIConfig },
        { type: 'deepseek', config: mockDeepSeekConfig },
    ];

    providers.forEach(({ type, config }) => {
        describe(`${type} Provider`, () => {
            let provider: AIProvider;

            beforeEach(() => {
                provider = ProviderManager.createProvider(type, config);
            });

            test('validates configuration', () => {
                const result = provider.validateConfig(config);
                expect(result).toBe(true);
            });

            test('formats messages correctly', () => {
                const messages: Message[] = [
                    { role: 'user', content: 'Hello' },
                    { role: 'assistant', content: 'Hi there' },
                ];
                const formatted = provider.formatMessages(messages);
                expect(formatted).toMatchSnapshot();
            });

            test('handles streaming', async () => {
                if (provider.supportsStreaming()) {
                    const chunks: string[] = [];
                    await provider.streamMessage(
                        [{ role: 'user', content: 'Test' }],
                        {
                            onStream: (chunk) => chunks.push(chunk),
                        }
                    );
                    expect(chunks.length).toBeGreaterThan(0);
                }
            });
        });
    });
});
```

### Integration Tests

```typescript
// src/ai/providers/__tests__/integration.test.ts
describe('Multi-Provider Integration', () => {
    test('switches providers seamlessly', async () => {
        const manager = ProviderManager.getInstance();

        // Test OpenAI
        manager.switchProvider('openai');
        let response = await manager.getActiveProvider().sendMessage(
            [{ role: 'user', content: 'Test message' }]
        );
        expect(response).toBeTruthy();

        // Switch to Gemini
        manager.switchProvider('gemini');
        response = await manager.getActiveProvider().sendMessage(
            [{ role: 'user', content: 'Test message' }]
        );
        expect(response).toBeTruthy();
    });

    test('handles provider-specific features', async () => {
        const manager = ProviderManager.getInstance();

        // Test DeepSeek reasoning model (no temperature)
        manager.switchProvider('deepseek');
        const deepseekProvider = manager.getActiveProvider();
        const response = await deepseekProvider.sendMessage(
            [{ role: 'user', content: 'Solve: 2+2' }],
            { temperature: 0.5 } // Should be ignored for reasoning model
        );
        expect(response).toContain('4');
    });
});
```

### Mock API Testing

```typescript
// src/ai/providers/__tests__/mocks.ts
export class MockAPIServer {
    private responses: Map<string, any> = new Map();

    setupOpenAIMock() {
        this.responses.set('POST /v1/chat/completions', {
            choices: [{
                message: { content: 'Mocked OpenAI response' },
                delta: { content: 'Chunk' }
            }]
        });
    }

    setupGeminiMock() {
        this.responses.set('POST /v1beta/models/*/generateContent', {
            candidates: [{
                content: {
                    parts: [{ text: 'Mocked Gemini response' }]
                }
            }]
        });
    }

    // Setup mocks for other providers
}
```

---

## Migration & Deployment

### Migration Path from Single Provider

```typescript
// src/migration/provider-migration.ts
export class ProviderMigration {
    static async migrateFromV1(oldSettings: any): Promise<MultiProviderConfig> {
        // Convert old Anthropic-only settings to multi-provider format
        return {
            activeProvider: 'anthropic',
            providers: {
                anthropic: {
                    apiKey: oldSettings.apiKey,
                    baseURL: oldSettings.apiEndpoint,
                    models: [{
                        id: oldSettings.model,
                        displayName: oldSettings.model,
                        maxTokens: oldSettings.maxTokens || 4096,
                        contextWindow: 200000,
                        capabilities: ['chat', 'code'],
                    }],
                    enabled: true,
                }
            },
            global: {
                defaultMaxTokens: oldSettings.maxTokens || 4096,
                defaultTemperature: oldSettings.temperature || 0.7,
                streamingEnabled: oldSettings.streaming !== false,
                timeout: 120000,
                retryAttempts: 2,
            }
        };
    }
}
```

### Deployment Checklist

```markdown
## Pre-Deployment
- [ ] All provider implementations tested
- [ ] Configuration migration tested
- [ ] UI components updated for multi-provider
- [ ] Documentation updated
- [ ] API keys secured (encrypted storage)

## Deployment Steps
1. **Phase 1: Core Infrastructure**
   - Deploy AIProvider interface updates
   - Deploy ProviderManager
   - Maintain backward compatibility

2. **Phase 2: Provider Implementations**
   - Deploy OpenAI provider
   - Deploy Gemini provider
   - Deploy xAI provider
   - Deploy DeepSeek provider

3. **Phase 3: UI & Configuration**
   - Deploy multi-provider settings UI
   - Deploy provider selector in main UI
   - Enable provider switching

4. **Phase 4: Testing & Optimization**
   - Monitor performance metrics
   - Collect user feedback
   - Optimize based on usage patterns
```

---

## Performance Considerations

### Provider-Specific Optimizations

```typescript
// src/ai/optimizations.ts
export class ProviderOptimizer {
    static getOptimalSettings(provider: AIProviderType, useCase: string) {
        const optimizations: Record<string, any> = {
            'quick-response': {
                openai: { model: 'gpt-3.5-turbo', temperature: 0.3 },
                gemini: { model: 'gemini-1.5-flash', temperature: 0.3 },
                xai: { model: 'grok-3-mini', temperature: 0.3 },
                deepseek: { model: 'deepseek-v3', temperature: 0.3 },
            },
            'creative-writing': {
                openai: { model: 'gpt-4', temperature: 0.8 },
                anthropic: { model: 'claude-3-opus-20240229', temperature: 0.8 },
                gemini: { model: 'gemini-1.5-pro', temperature: 0.9 },
                xai: { model: 'grok-4', temperature: 0.8 },
            },
            'code-generation': {
                openai: { model: 'gpt-4', temperature: 0.2 },
                anthropic: { model: 'claude-3-5-sonnet-20241022', temperature: 0.2 },
                deepseek: { model: 'deepseek-coder', temperature: 0.1 },
            },
            'reasoning': {
                deepseek: { model: 'deepseek-reasoner', temperature: null }, // No temp
                openai: { model: 'gpt-4', temperature: 0.1 },
                xai: { model: 'grok-4', temperature: 0.1 },
            }
        };

        return optimizations[useCase]?.[provider] || {};
    }
}
```

### Caching Strategy

```typescript
// src/ai/cache.ts
export class ResponseCache {
    private cache: Map<string, CacheEntry> = new Map();
    private maxSize = 100;
    private ttl = 3600000; // 1 hour

    getCacheKey(
        provider: AIProviderType,
        messages: Message[],
        options: AIRequestOptions
    ): string {
        // Generate unique cache key
        return crypto.createHash('sha256')
            .update(JSON.stringify({ provider, messages, options }))
            .digest('hex');
    }

    get(key: string): string | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.response;
    }

    set(key: string, response: string): void {
        // LRU eviction
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }

        this.cache.set(key, {
            response,
            timestamp: Date.now()
        });
    }
}
```

---

## Security & Best Practices

### API Key Management

```typescript
// src/security/key-manager.ts
export class APIKeyManager {
    private static ENCRYPTION_KEY = 'siyuan-plugin-encryption-key'; // Should be dynamic

    static async encryptKey(apiKey: string): Promise<string> {
        // Use Web Crypto API for encryption
        const encoder = new TextEncoder();
        const data = encoder.encode(apiKey);

        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(this.ENCRYPTION_KEY),
            { name: 'AES-GCM' },
            false,
            ['encrypt']
        );

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );

        // Combine IV and encrypted data
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);

        return btoa(String.fromCharCode(...combined));
    }

    static async decryptKey(encryptedKey: string): Promise<string> {
        // Decrypt using Web Crypto API
        // ... implementation
    }

    static validateKeyFormat(key: string, provider: AIProviderType): boolean {
        const patterns: Record<AIProviderType, RegExp> = {
            openai: /^sk-[A-Za-z0-9]{48}$/,
            anthropic: /^sk-ant-[A-Za-z0-9-]{40,}$/,
            gemini: /^[A-Za-z0-9_-]{39}$/,
            xai: /^xai-[A-Za-z0-9]{48}$/,
            deepseek: /^sk-[A-Za-z0-9]{48}$/,
            custom: /.+/,
        };

        return patterns[provider]?.test(key) || false;
    }
}
```

### Base URL Normalization for Reverse Proxies

**Issue**: When using reverse proxies, users commonly provide baseURL values that include API version paths (e.g., `https://proxy.com/api/v1`). However, some SDKs automatically append their own version paths, causing duplicate path segments like `/v1/v1/messages`.

**Affected Provider**: Anthropic (Claude)

**Root Cause**: The Anthropic SDK internally uses a base path structure that includes `/v1`, so when users provide `baseURL: "https://proxy.com/api/v1"`, the final URL becomes `https://proxy.com/api/v1/v1/messages` (404 error).

**Solution**: Normalize baseURL by removing trailing `/v1` before passing to Anthropic SDK:

```typescript
// src/ai/AnthropicProvider.ts (Fixed in v1.0.1)
constructor(config: AIModelConfig) {
    super(config);
    
    // Normalize baseURL to prevent duplicate /v1 paths
    // Users commonly provide "https://proxy.com/api/v1" for reverse proxies
    // But Anthropic SDK automatically appends "/v1/messages"
    // So we strip trailing /v1 to avoid /v1/v1/messages
    let normalizedBaseURL = config.baseURL;
    if (normalizedBaseURL) {
        // Remove trailing slashes first
        normalizedBaseURL = normalizedBaseURL.replace(/\/+$/, '');
        // Remove trailing /v1 if present
        if (normalizedBaseURL.endsWith('/v1')) {
            normalizedBaseURL = normalizedBaseURL.slice(0, -3);
        }
    }
    
    this.client = new Anthropic({
        apiKey: config.apiKey,
        baseURL: normalizedBaseURL,  // Use normalized URL
        dangerouslyAllowBrowser: true,
        timeout: 120000,
        maxRetries: 2,
    });
}
```

**User Configuration Examples**:

| User Input | Normalized | Final API Endpoint |
|------------|------------|-------------------|
| `https://cc.leve.pub/api/v1` | `https://cc.leve.pub/api` | `https://cc.leve.pub/api/v1/messages` ✅ |
| `https://proxy.com/api/v1/` | `https://proxy.com/api` | `https://proxy.com/api/v1/messages` ✅ |
| `https://api.anthropic.com` | `https://api.anthropic.com` | `https://api.anthropic.com/v1/messages` ✅ |

**Best Practice**: Always normalize baseURL for SDKs that have hardcoded version paths. For OpenAI-compatible providers (OpenAI, xAI, DeepSeek), this is not necessary as their SDKs use `/v1/chat/completions` which is expected in the baseURL.

### Error Handling

```typescript
// src/ai/error-handler.ts
export class AIErrorHandler {
    static handleProviderError(
        error: any,
        provider: AIProviderType
    ): { message: string; recoverable: boolean; action?: string } {
        // Rate limiting
        if (error.status === 429) {
            return {
                message: `Rate limit exceeded for ${provider}`,
                recoverable: true,
                action: 'retry-with-backoff'
            };
        }

        // Invalid API key
        if (error.status === 401) {
            return {
                message: `Invalid API key for ${provider}`,
                recoverable: false,
                action: 'update-api-key'
            };
        }

        // Model not available
        if (error.status === 404 && error.message?.includes('model')) {
            return {
                message: `Model not available for ${provider}`,
                recoverable: true,
                action: 'switch-model'
            };
        }

        // Network error
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            return {
                message: `Network error connecting to ${provider}`,
                recoverable: true,
                action: 'check-network-or-proxy'
            };
        }

        // Default
        return {
            message: `Unexpected error from ${provider}: ${error.message}`,
            recoverable: false
        };
    }
}
```

### Best Practices Implementation

```typescript
// src/ai/best-practices.ts
export class AIBestPractices {
    // Automatic retry with exponential backoff
    static async retryWithBackoff<T>(
        fn: () => Promise<T>,
        maxRetries = 3,
        initialDelay = 1000
    ): Promise<T> {
        let lastError: any;

        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                if (i < maxRetries - 1) {
                    const delay = initialDelay * Math.pow(2, i);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError;
    }

    // Provider fallback chain
    static async withFallback<T>(
        providers: AIProvider[],
        operation: (provider: AIProvider) => Promise<T>
    ): Promise<T> {
        const errors: Array<{ provider: string; error: any }> = [];

        for (const provider of providers) {
            try {
                return await operation(provider);
            } catch (error) {
                errors.push({
                    provider: provider.providerName,
                    error
                });
                console.warn(`Provider ${provider.providerName} failed, trying next...`);
            }
        }

        throw new Error(`All providers failed: ${JSON.stringify(errors)}`);
    }

    // Request sanitization
    static sanitizeRequest(messages: Message[]): Message[] {
        return messages.map(msg => ({
            ...msg,
            content: msg.content
                .replace(/api[_-]?key[\s:=]+[\w-]+/gi, '[REDACTED]')
                .replace(/sk-[\w-]+/g, '[REDACTED]')
                .trim()
        }));
    }
}
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Enhance AIProvider interface with new methods
- [ ] Create ProviderManager for multi-provider support
- [ ] Implement configuration migration
- [ ] Update settings UI framework

### Phase 2: OpenAI & Gemini (Week 3-4)
- [ ] Implement OpenAIProvider
- [ ] Implement GeminiProvider
- [ ] Add provider-specific settings UI
- [ ] Test streaming and error handling

### Phase 3: xAI & DeepSeek (Week 5)
- [ ] Implement XAIProvider
- [ ] Implement DeepSeekProvider
- [ ] Add specialized features (reasoning model, search)
- [ ] Performance optimization

### Phase 4: Integration & Testing (Week 6)
- [ ] Integrate with existing Quick Edit system
- [ ] Integrate with Chat panel
- [ ] Comprehensive testing
- [ ] Performance benchmarking

### Phase 5: Polish & Deploy (Week 7)
- [ ] Security audit (API key handling)
- [ ] Documentation update
- [ ] User migration guide
- [ ] Beta release

---

## Conclusion

This multi-AI platform integration design provides:

1. **Flexibility**: Easy switching between AI providers
2. **Extensibility**: Simple to add new providers
3. **Compatibility**: Maintains backward compatibility
4. **Performance**: Provider-specific optimizations
5. **Security**: Encrypted API key storage
6. **User Experience**: Unified interface across providers

The modular architecture ensures that adding new providers is straightforward, while the abstraction layer shields the rest of the application from provider-specific implementation details.

---

## Appendix: Quick Reference

### Provider Comparison Matrix

| Feature | Anthropic | OpenAI | Gemini | xAI | DeepSeek |
|---------|-----------|---------|---------|-----|----------|
| **Streaming** | ✅ SSE | ✅ SSE | ✅ SSE | ✅ SSE | ✅ SSE |
| **System Prompt** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Vision** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Function Calling** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Custom Endpoint** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Max Context** | 200K | 128K | 1M | 128K | 64K |
| **SDK Available** | ✅ | ✅ | ✅ | ✅* | ✅* |

*Uses OpenAI-compatible SDK

### Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Rate limiting | Implement exponential backoff |
| API key invalid | Validate format before request |
| Model not found | Fallback to default model |
| Network timeout | Increase timeout, check proxy |
| Response truncated | Adjust max_tokens parameter |
| Streaming fails | Fallback to non-streaming mode |

---

**Document Version**: 1.0.0
**Last Updated**: 2025-01-11
**Next Review**: After Phase 1 implementation