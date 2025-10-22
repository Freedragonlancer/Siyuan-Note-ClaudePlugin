import Anthropic from "@anthropic-ai/sdk";
import type { Message, ClaudeSettings, MessageCallback, ErrorCallback, CompleteCallback } from "./types";

/**
 * Claude API Client
 * Handles communication with Claude API including streaming responses
 */
export class ClaudeClient {
    private client: Anthropic | null = null;
    private settings: ClaudeSettings;

    constructor(settings: ClaudeSettings) {
        this.settings = settings;
        if (settings.apiKey) {
            this.initializeClient();
        }
    }

    private initializeClient() {
        const config: any = {
            apiKey: this.settings.apiKey,
            dangerouslyAllowBrowser: true, // Enable browser usage
            timeout: 120000, // 120 seconds timeout for long AI responses
            maxRetries: 2, // Retry failed requests up to 2 times
        };

        // Support custom API endpoint (for reverse proxy)
        if (this.settings.baseURL && this.settings.baseURL.trim()) {
            config.baseURL = this.settings.baseURL.trim();
        }

        this.client = new Anthropic(config);
    }

    updateSettings(settings: Partial<ClaudeSettings>) {
        this.settings = { ...this.settings, ...settings };
        if (settings.apiKey || settings.baseURL !== undefined) {
            this.initializeClient();
        }
    }

    isConfigured(): boolean {
        return !!this.client && !!this.settings.apiKey;
    }

    /**
     * Send a message to Claude and get a streaming response
     */
    async sendMessage(
        messages: Message[],
        onMessage: MessageCallback,
        onError: ErrorCallback,
        onComplete: CompleteCallback
    ): Promise<void> {
        if (!this.isConfigured()) {
            onError(new Error("Claude API is not configured. Please set your API key in settings."));
            return;
        }

        try {
            const stream = await this.client!.messages.create({
                model: this.settings.model,
                max_tokens: this.settings.maxTokens,
                temperature: this.settings.temperature,
                system: this.settings.systemPrompt,
                messages: messages.map(m => ({
                    role: m.role,
                    content: m.content
                })),
                stream: true,
            });

            for await (const chunk of stream) {
                if (chunk.type === "content_block_delta") {
                    if (chunk.delta?.type === "text_delta") {
                        onMessage(chunk.delta.text || "");
                    }
                }
            }

            onComplete();
        } catch (error) {
            console.error("Claude API error:", error);
            onError(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Send a simple message and get the complete response (non-streaming)
     */
    async sendMessageSimple(messages: Message[]): Promise<string> {
        if (!this.isConfigured()) {
            throw new Error("Claude API is not configured. Please set your API key in settings.");
        }

        try {
            console.log(`[ClaudeClient] Sending request to ${this.settings.baseURL || 'official API'}`);
            console.log(`[ClaudeClient] Messages count: ${messages.length}, Model: ${this.settings.model}`);
            
            const startTime = Date.now();
            const response = await this.client!.messages.create({
                model: this.settings.model,
                max_tokens: this.settings.maxTokens,
                temperature: this.settings.temperature,
                system: this.settings.systemPrompt,
                messages: messages.map(m => ({
                    role: m.role,
                    content: m.content
                })),
            });
            
            const duration = Date.now() - startTime;
            console.log(`[ClaudeClient] Request completed in ${duration}ms`);

            const textContent = response.content.find(block => block.type === "text");
            return textContent && "text" in textContent ? textContent.text : "";
        } catch (error) {
            console.error("[ClaudeClient] API error:", error);
            // Log more details about the error
            if (error instanceof Error) {
                console.error("[ClaudeClient] Error name:", error.name);
                console.error("[ClaudeClient] Error message:", error.message);
            }
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    /**
     * Fetch available models from the API
     */
    async listModels(): Promise<string[]> {
        if (!this.isConfigured()) {
            throw new Error("Claude API is not configured. Please set your API key in settings.");
        }

        try {
            const response = await this.client!.models.list();
            return response.data.map(model => model.id);
        } catch (error) {
            console.error("Failed to fetch models list:", error);
            throw error instanceof Error ? error : new Error(String(error));
        }
    }
}
