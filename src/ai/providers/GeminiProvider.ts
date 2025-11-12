/**
 * Google Gemini AI Provider Implementation
 * Supports Gemini Pro, Gemini Pro Vision, and other Google AI models
 */

import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import type { Message } from '../../claude/types';
import type {
    AIModelConfig,
    AIRequestOptions,
    ParameterLimits,
    ProviderMetadata,
} from '../types';
import { BaseAIProvider } from '../BaseAIProvider';

export class GeminiProvider extends BaseAIProvider {
    readonly providerType = 'gemini' as const;
    readonly providerName = 'Google Gemini';

    private client: GoogleGenerativeAI;
    private model: any; // GenerativeModel type

    constructor(config: AIModelConfig) {
        super(config);
        
        // Debug: Log API key format (first 10 chars only for security)
        console.log(`[GeminiProvider] Initializing with API key: ${config.apiKey.substring(0, 10)}...`);
        console.log(`[GeminiProvider] Model ID: ${config.modelId}`);
        
        this.client = new GoogleGenerativeAI(config.apiKey);
        this.initializeModel();
    }

    private initializeModel(): void {
        this.model = this.client.getGenerativeModel({
            model: this.config.modelId,
            safetySettings: [
                {
                    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
            ],
        });
    }

    async sendMessage(messages: Message[], options?: AIRequestOptions): Promise<string> {
        if (options?.onStream) {
            // If streaming callback provided, use streaming mode
            let fullResponse = '';
            await this.streamMessage(messages, {
                ...options,
                onStream: (chunk) => {
                    fullResponse += chunk;
                    options.onStream?.(chunk);
                },
            });
            return fullResponse;
        }

        // Non-streaming mode
        try {
            const chat = this.model.startChat({
                history: this.convertMessagesToHistory(messages, options?.systemPrompt),
                generationConfig: {
                    maxOutputTokens: this.getEffectiveMaxTokens(options),
                    temperature: this.getEffectiveTemperature(options),
                    stopSequences: options?.stopSequences,
                },
            });

            // Get the last user message
            const lastMessage = messages[messages.length - 1];
            const result = await chat.sendMessage(lastMessage.content);
            const response = await result.response;
            
            return response.text();
        } catch (error) {
            this.handleError(error, 'sendMessage');
        }
    }

    async streamMessage(messages: Message[], options?: AIRequestOptions): Promise<void> {
        this.validateStreamingOptions(options);

        try {
            const chat = this.model.startChat({
                history: this.convertMessagesToHistory(messages, options?.systemPrompt),
                generationConfig: {
                    maxOutputTokens: this.getEffectiveMaxTokens(options),
                    temperature: this.getEffectiveTemperature(options),
                    stopSequences: options?.stopSequences,
                },
            });

            // Get the last user message
            const lastMessage = messages[messages.length - 1];
            const result = await chat.sendMessageStream(lastMessage.content);

            // Stream the response
            for await (const chunk of result.stream) {
                const text = chunk.text();
                if (text) {
                    options?.onStream?.(text);
                }
            }
        } catch (error) {
            this.handleError(error, 'streamMessage');
        }
    }

    validateConfig(config: AIModelConfig): true | string {
        // Call base validation first
        const baseValidation = super.validateConfig(config);
        if (baseValidation !== true) {
            return baseValidation;
        }

        // Gemini-specific API key validation
        // Gemini API keys should start with "AIza" (for most cases)
        if (config.apiKey && !config.apiKey.startsWith('AIza')) {
            console.warn(`[GeminiProvider] API key format warning: Expected to start with 'AIza', got '${config.apiKey.substring(0, 4)}...'`);
            console.warn('[GeminiProvider] This may indicate an invalid API key format');
        }

        // Gemini-specific model validation
        const validModels = this.getAvailableModels();
        const isValidModel = validModels.some(model => 
            config.modelId === model || config.modelId.startsWith(model.split('-')[0])
        );
        
        if (!isValidModel) {
            console.warn(`[GeminiProvider] Unknown model: ${config.modelId}`);
            console.warn(`[GeminiProvider] Available models: ${validModels.join(', ')}`);
            // Don't fail - allow unknown models in case of new releases
        }

        return true;
    }

    getAvailableModels(): string[] {
        return [
            // Gemini 2.5 Series (Latest - 2025)
            'gemini-2.5-pro',                    // State-of-the-art thinking model (STABLE)
            'gemini-2.5-flash',                  // Best price-performance (STABLE)
            'gemini-2.5-flash-lite',             // Fastest, cost-efficient (STABLE)
            'gemini-2.5-flash-image',            // Image generation & understanding (STABLE)
            'gemini-2.5-flash-preview-09-2025', // Preview version (PREVIEW)
            
            // Gemini 2.0 Series
            'gemini-2.0-flash',                  // Next-gen features (STABLE)
            'gemini-2.0-flash-001',              // Latest 2.0 Flash version
            'gemini-2.0-flash-exp',              // Experimental 2.0 Flash
            'gemini-2.0-flash-lite',             // 2.0 Lite version (STABLE)
            
            // Gemini 1.5 Series (Previous generation)
            'gemini-1.5-pro-latest',             // Latest 1.5 Pro
            'gemini-1.5-pro',                    // 1.5 Pro
            'gemini-1.5-flash-latest',           // Latest 1.5 Flash
            'gemini-1.5-flash',                  // 1.5 Flash
            'gemini-1.5-flash-8b',               // 1.5 Flash 8B
            
            // Legacy models (may be deprecated soon)
            'gemini-pro',                        // Legacy Pro
            'gemini-pro-vision',                 // Legacy Pro Vision
        ];
    }

    getMaxTokenLimit(model: string): number {
        const limits: Record<string, number> = {
            // Gemini 2.5 models (1M token context window)
            'gemini-2.5-pro': 8192,              // Max output tokens
            'gemini-2.5-flash': 8192,
            'gemini-2.5-flash-lite': 8192,
            'gemini-2.5-flash-image': 8192,
            'gemini-2.5-flash-preview': 8192,
            
            // Gemini 2.0 models (1M token context window)
            'gemini-2.0-flash': 8192,
            'gemini-2.0-flash-001': 8192,
            'gemini-2.0-flash-exp': 8192,
            'gemini-2.0-flash-lite': 8192,
            
            // Gemini 1.5 models
            'gemini-1.5-pro': 8192,
            'gemini-1.5-pro-latest': 8192,
            'gemini-1.5-flash': 8192,
            'gemini-1.5-flash-latest': 8192,
            'gemini-1.5-flash-8b': 8192,
            
            // Legacy models
            'gemini-pro': 8192,
            'gemini-pro-vision': 4096,
            'gemini-ultra': 8192,
        };

        // Try exact match first
        if (limits[model]) {
            return limits[model];
        }

        // Try prefix match (e.g., "gemini-2.5-pro-001" matches "gemini-2.5-pro")
        for (const [key, value] of Object.entries(limits)) {
            if (model.startsWith(key)) {
                return value;
            }
        }

        return 8192; // Safe default
    }

    getParameterLimits(): ParameterLimits {
        // Note: this.config might not be set yet if called during construction validation
        // Use safe defaults for max tokens
        const modelId = this.config?.modelId || 'gemini-1.5-pro';
        return {
            temperature: { min: 0, max: 2, default: 0.9 },
            maxTokens: { min: 1, max: this.getMaxTokenLimit(modelId), default: 8192 },
            topP: { min: 0, max: 1, default: 0.95 },
        };
    }

    getMetadata(): ProviderMetadata {
        return {
            type: 'gemini',
            displayName: 'Google Gemini',
            description: 'Gemini Pro 及其他 Google AI 模型',
            icon: '✨',
            apiKeyUrl: 'https://makersuite.google.com/app/apikey',
            defaultBaseURL: 'https://generativelanguage.googleapis.com',
            defaultModel: 'gemini-2.5-flash',
            models: [
                {
                    id: 'gemini-2.5-flash',
                    displayName: 'Gemini 2.5 Flash (推荐，性价比最高)',
                    contextWindow: 1000000,
                    description: '最新2.5 Flash，性价比最高',
                    recommended: true,
                },
                {
                    id: 'gemini-2.5-pro',
                    displayName: 'Gemini 2.5 Pro (1M上下文)',
                    contextWindow: 1000000,
                    description: '最先进的思考模型',
                },
                {
                    id: 'gemini-2.5-flash-lite',
                    displayName: 'Gemini 2.5 Flash Lite (最快)',
                    contextWindow: 1000000,
                    description: '最快、最经济的模型',
                },
                {
                    id: 'gemini-2.5-flash-image',
                    displayName: 'Gemini 2.5 Flash Image (图像生成)',
                    contextWindow: 1000000,
                    description: '图像生成和理解',
                },
                {
                    id: 'gemini-2.0-flash',
                    displayName: 'Gemini 2.0 Flash (1M)',
                    contextWindow: 1000000,
                    description: '2.0下一代特性',
                },
                {
                    id: 'gemini-2.0-flash-lite',
                    displayName: 'Gemini 2.0 Flash Lite',
                    contextWindow: 1000000,
                    description: '2.0轻量版',
                },
                {
                    id: 'gemini-1.5-pro',
                    displayName: 'Gemini 1.5 Pro (2M)',
                    contextWindow: 2000000,
                    description: '1.5 Pro，超大上下文',
                },
                {
                    id: 'gemini-1.5-flash',
                    displayName: 'Gemini 1.5 Flash',
                    contextWindow: 1000000,
                    description: '1.5 Flash，快速响应',
                },
                {
                    id: 'gemini-pro',
                    displayName: 'Gemini Pro (传统)',
                    contextWindow: 32768,
                    description: '传统Gemini Pro',
                    deprecated: true,
                },
                {
                    id: 'gemini-pro-vision',
                    displayName: 'Gemini Pro Vision (传统)',
                    contextWindow: 16384,
                    description: '传统视觉模型',
                    deprecated: true,
                },
            ],
            features: {
                supportsStreaming: true,
                supportsSystemPrompt: true,
                supportsVision: true,
                supportsFunctionCalling: false,
            },
        };
    }

    /**
     * Convert messages to Gemini chat history format
     * Gemini requires alternating user/model roles
     */
    private convertMessagesToHistory(messages: Message[], systemPrompt?: string): Array<{ role: string; parts: string }> {
        const normalized = this.normalizeMessages(messages);
        const history: Array<{ role: string; parts: string }> = [];

        // Gemini doesn't have a separate system prompt field
        // We prepend it as the first user message if provided
        if (systemPrompt && systemPrompt.trim()) {
            const firstUserIndex = normalized.findIndex(m => m.role === 'user');
            if (firstUserIndex >= 0) {
                // Found user message - merge system prompt with it
                normalized[firstUserIndex] = {
                    ...normalized[firstUserIndex],
                    content: `${systemPrompt.trim()}

${normalized[firstUserIndex].content}`,
                };
            } else {
                // No user message found - insert a virtual user message at the beginning
                // This ensures the system prompt is always included
                normalized.unshift({
                    role: 'user',
                    content: systemPrompt.trim(),
                });
            }
        }

        // Convert messages to Gemini format (excluding the last user message for chat API)
        for (let i = 0; i < normalized.length - 1; i++) {
            const msg = normalized[i];
            history.push({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: msg.content,
            });
        }

        return history;
    }

    /**
     * Gemini has some special requirements
     */
    supportsSystemPrompt(): boolean {
        // Gemini doesn't have a dedicated system prompt field
        // We can include it in the first user message though
        return true;
    }
}
