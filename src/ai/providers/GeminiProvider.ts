/**
 * Google Gemini AI Provider Implementation
 * Supports Gemini Pro, Gemini Pro Vision, and other Google AI models
 */

import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';

// Gemini Part type for multimodal content
type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
import type { Message, ContentBlock, ImageContent, TextContent } from '../../claude/types';
import { extractText } from '../../claude/types';
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
    private thinkingMode: boolean;
    private thinkingBudget: number;

    constructor(config: AIModelConfig) {
        super(config);

        // v0.13.0: Thinking mode support (Gemini 2.5+)
        this.thinkingMode = config.thinkingMode ?? false;
        this.thinkingBudget = config.thinkingBudget ?? 8192;  // Default 8K, max 24576 for 2.5 Flash

        // Debug: Log configuration (API key excluded for security)
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

        const thinkingEnabled = options?.thinkingMode ?? this.thinkingMode;
        const thinkingBudget = options?.thinkingBudget ?? this.thinkingBudget;

        // Non-streaming mode
        try {
            const chat = this.model.startChat({
                history: this.convertMessagesToHistory(messages, options?.systemPrompt),
                generationConfig: {
                    maxOutputTokens: this.getEffectiveMaxTokens(options),
                    temperature: this.getEffectiveTemperature(options),
                    stopSequences: options?.stopSequences,
                    // v0.13.0: Thinking mode (Gemini 2.5+ supports thought budgets)
                    ...(thinkingEnabled && {
                        thoughtBudget: thinkingBudget,  // Budget for reasoning process
                    }),
                },
            });

            // Get the last user message and convert to Gemini format
            const lastMessage = messages[messages.length - 1];
            const lastMessageParts = this.convertContentToParts(lastMessage.content);
            const result = await chat.sendMessage(lastMessageParts);
            const response = await result.response;

            return response.text();
        } catch (error) {
            this.handleError(error, 'sendMessage');
        }
    }

    async streamMessage(messages: Message[], options?: AIRequestOptions): Promise<void> {
        this.validateStreamingOptions(options);

        const thinkingEnabled = options?.thinkingMode ?? this.thinkingMode;
        const thinkingBudget = options?.thinkingBudget ?? this.thinkingBudget;

        try {
            const chat = this.model.startChat({
                history: this.convertMessagesToHistory(messages, options?.systemPrompt),
                generationConfig: {
                    maxOutputTokens: this.getEffectiveMaxTokens(options),
                    temperature: this.getEffectiveTemperature(options),
                    stopSequences: options?.stopSequences,
                    // v0.13.0: Thinking mode (Gemini 2.5+ supports thought budgets)
                    ...(thinkingEnabled && {
                        thoughtBudget: thinkingBudget,  // Budget for reasoning process
                    }),
                },
            });

            // Get the last user message and convert to Gemini format
            const lastMessage = messages[messages.length - 1];
            const lastMessageParts = this.convertContentToParts(lastMessage.content);
            const result = await chat.sendMessageStream(lastMessageParts);

            // v0.19.0: Collect generated images during streaming
            const generatedImages: Array<{ base64: string; mimeType: string }> = [];

            // Stream the response
            for await (const chunk of result.stream) {
                const text = chunk.text();
                if (text) {
                    options?.onStream?.(text);
                }

                // v0.19.0: Check for generated images in response parts
                const candidate = chunk.candidates?.[0];
                if (candidate?.content?.parts) {
                    for (const part of candidate.content.parts) {
                        // Check for inline image data
                        if ((part as any).inlineData?.data && (part as any).inlineData?.mimeType) {
                            const inlineData = (part as any).inlineData;
                            generatedImages.push({
                                base64: inlineData.data,
                                mimeType: inlineData.mimeType
                            });
                            console.log(`[GeminiProvider] Received generated image: ${inlineData.mimeType}`);
                        }
                    }
                }
            }

            // v0.19.0: Notify about generated images after streaming completes
            if (generatedImages.length > 0 && options?.onGeneratedImages) {
                options.onGeneratedImages(generatedImages.map((img, i) => ({
                    base64: img.base64,
                    mimeType: img.mimeType,
                    fileName: `gemini-image-${Date.now()}-${i + 1}.${img.mimeType.split('/')[1] || 'png'}`
                })));
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

    // getAvailableModels() - inherited from BaseAIProvider, derives from getMetadata()

    getMaxTokenLimit(model: string): number {
        const limits: Record<string, number> = {
            // Gemini 3 preview models (1M input / 64K output unless noted)
            'gemini-3.1-pro-preview': 65536,
            'gemini-3-flash-preview': 65536,
            'gemini-3-pro-image-preview': 32768,

            // Gemini 2.5 stable models (1M input / 64K output)
            'gemini-2.5-pro': 65536,
            'gemini-2.5-flash': 65536,
            'gemini-2.5-flash-lite': 65536,
            'gemini-2.5-flash-preview-09-2025': 65536,
            'gemini-2.5-flash-lite-preview-09-2025': 65536,
            'gemini-2.5-flash-image': 32768,

            // Gemini 2.0 models
            'gemini-2.0-flash': 8192,
            'gemini-2.0-flash-lite': 8192,
            'gemini-2.0-flash-preview-image-generation': 8192,
        };

        // Try exact match first
        if (limits[model]) {
            return limits[model];
        }

        // Try prefix match (e.g., "gemini-3-flash-001" matches "gemini-3-flash")
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
        const modelId = this.config?.modelId || 'gemini-3-flash-preview';
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
            description: 'Gemini 3 Preview / 2.5 / 2.0 系列 AI 模型',
            icon: '✨',
            apiKeyUrl: 'https://aistudio.google.com/apikey',
            defaultBaseURL: 'https://generativelanguage.googleapis.com',
            defaultModel: 'gemini-3-flash-preview',
            models: [
                // Gemini 3 系列 - 官方预览模型
                {
                    id: 'gemini-3.1-pro-preview',
                    displayName: 'Gemini 3.1 Pro Preview (最强推理)',
                    contextWindow: 1048576,
                    description: 'Gemini 3.1 Pro预览版，1M输入/64K输出，多模态和智能体任务',
                    recommended: true,
                },
                {
                    id: 'gemini-3-flash-preview',
                    displayName: 'Gemini 3 Flash Preview (推荐默认)',
                    contextWindow: 1048576,
                    description: 'Gemini 3 Flash预览版，速度/成本/能力平衡，1M输入/64K输出',
                    recommended: true,
                },
                {
                    id: 'gemini-3-pro-image-preview',
                    displayName: 'Gemini 3 Pro Image Preview (图像生成)',
                    contextWindow: 65536,
                    description: 'Nano Banana Pro，图像生成和理解，65K输入/32K输出',
                },
                // Gemini 2.5 系列 - 生产就绪
                {
                    id: 'gemini-2.5-flash',
                    displayName: 'Gemini 2.5 Flash (稳定，性价比)',
                    contextWindow: 1048576,
                    description: '稳定版，1M输入/64K输出，适合规模化任务',
                },
                {
                    id: 'gemini-2.5-pro',
                    displayName: 'Gemini 2.5 Pro (稳定推理)',
                    contextWindow: 1048576,
                    description: '稳定版复杂推理模型，1M输入/64K输出',
                },
                {
                    id: 'gemini-2.5-flash-lite',
                    displayName: 'Gemini 2.5 Flash-Lite (最快稳定)',
                    contextWindow: 1048576,
                    description: '稳定版最快最经济模型，1M输入/64K输出',
                },
                {
                    id: 'gemini-2.5-flash-image',
                    displayName: 'Gemini 2.5 Flash Image (图像)',
                    contextWindow: 65536,
                    description: '稳定图像生成模型，65K输入/32K输出',
                },
                // Gemini 2.0 系列 - 仍可用
                {
                    id: 'gemini-2.0-flash',
                    displayName: 'Gemini 2.0 Flash',
                    contextWindow: 1000000,
                    description: '2.0 Flash，稳定可靠',
                },
                {
                    id: 'gemini-2.0-flash-lite',
                    displayName: 'Gemini 2.0 Flash Lite',
                    contextWindow: 1000000,
                    description: '2.0 轻量版',
                },
            ],
            features: {
                supportsStreaming: true,
                supportsSystemPrompt: true,
                supportsVision: true,
                supportsFunctionCalling: true,
            },
            defaults: {
                maxTokens: 8192,
                temperature: 0.9,
                thinkingMode: false,
                thinkingBudget: 8192,
            },
            badgeColors: { bg: '#E3F2FD', border: '#64B5F6' },
        };
    }

    /**
     * Convert message content to Gemini Part array
     * Handles both string content and ContentBlock[] (multimodal)
     */
    private convertContentToParts(content: string | ContentBlock[]): GeminiPart[] {
        // Simple string content
        if (typeof content === 'string') {
            return [{ text: content }];
        }

        // Multimodal ContentBlock array
        const parts: GeminiPart[] = [];
        for (const block of content) {
            if (block.type === 'text') {
                parts.push({ text: block.text });
            } else if (block.type === 'image') {
                if (block.source.type === 'base64') {
                    // Gemini uses inlineData format for base64 images
                    parts.push({
                        inlineData: {
                            mimeType: block.source.media_type,
                            data: block.source.data,
                        },
                    });
                } else if (block.source.type === 'url') {
                    // Gemini also supports URL images via fileData (but requires gcloud auth)
                    // For now, log a warning - users should pre-convert to base64
                    console.warn('[GeminiProvider] URL images not directly supported. Pre-convert to base64.');
                }
            }
        }

        return parts;
    }

    /**
     * Convert messages to Gemini chat history format
     * Gemini requires alternating user/model roles
     * Supports multimodal content (text + images)
     */
    private convertMessagesToHistory(messages: Message[], systemPrompt?: string): Array<{ role: string; parts: GeminiPart[] }> {
        const normalized = this.normalizeMessages(messages);
        const history: Array<{ role: string; parts: GeminiPart[] }> = [];

        // Gemini doesn't have a separate system prompt field
        // We prepend it as the first user message if provided
        if (systemPrompt && systemPrompt.trim()) {
            const firstUserIndex = normalized.findIndex(m => m.role === 'user');
            if (firstUserIndex >= 0) {
                // Found user message - merge system prompt with it
                const existingContent = normalized[firstUserIndex].content;
                const existingText = extractText(existingContent);
                normalized[firstUserIndex] = {
                    ...normalized[firstUserIndex],
                    content: `${systemPrompt.trim()}\n\n${existingText}`,
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
                parts: this.convertContentToParts(msg.content),
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
