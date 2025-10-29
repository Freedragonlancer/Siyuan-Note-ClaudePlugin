import Anthropic from "@anthropic-ai/sdk";
import type { Message, ClaudeSettings, MessageCallback, ErrorCallback, CompleteCallback } from "./types";
import { RequestLogger, type LogEntry } from "../logger/RequestLogger";

/**
 * Claude API Client
 * Handles communication with Claude API including streaming responses
 */
export class ClaudeClient {
    private client: Anthropic | null = null;
    private settings: ClaudeSettings;
    private logger: RequestLogger;

    constructor(settings: ClaudeSettings) {
        this.settings = settings;
        this.logger = new RequestLogger();
        this.configureLogger();
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

    /**
     * 配置日志记录器
     */
    private configureLogger() {
        this.logger.configure(
            this.settings.enableRequestLogging ?? false,
            this.settings.requestLogPath ?? '',
            this.settings.requestLogIncludeResponse ?? true
        );
    }

    updateSettings(settings: Partial<ClaudeSettings>) {
        this.settings = { ...this.settings, ...settings };
        if (settings.apiKey || settings.baseURL !== undefined) {
            this.initializeClient();
        }
        // 重新配置日志记录器（如果日志相关设置发生变化）
        if (settings.enableRequestLogging !== undefined ||
            settings.requestLogPath !== undefined ||
            settings.requestLogIncludeResponse !== undefined) {
            this.configureLogger();
        }
    }

    isConfigured(): boolean {
        return !!this.client && !!this.settings.apiKey;
    }

    getSettings(): ClaudeSettings {
        return { ...this.settings };
    }

    getAppendedPrompt(): string {
        return this.settings.appendedPrompt || "";
    }

    /**
     * Send a message to Claude and get a streaming response
     */
    async sendMessage(
        messages: Message[],
        onMessage: MessageCallback,
        onError: ErrorCallback,
        onComplete: CompleteCallback,
        feature: string = "Chat"
    ): Promise<void> {
        if (!this.isConfigured()) {
            onError(new Error("Claude API is not configured. Please set your API key in settings."));
            return;
        }

        // 日志记录：准备
        const requestId = RequestLogger.generateRequestId();
        const startTime = Date.now();
        const startedAt = new Date().toISOString();
        let accumulatedResponse = "";  // 累积流式响应

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
                        const text = chunk.delta.text || "";
                        accumulatedResponse += text;  // 累积响应
                        onMessage(text);
                    }
                }
            }

            // 日志记录：成功完成
            if (this.logger.isEnabled()) {
                const completedAt = new Date().toISOString();
                const duration = Date.now() - startTime;

                const logEntry: LogEntry = {
                    timestamp: startedAt,
                    requestId,
                    feature,
                    request: {
                        model: this.settings.model,
                        temperature: this.settings.temperature,
                        max_tokens: this.settings.maxTokens,
                        system: this.settings.systemPrompt,
                        messages: messages.map(m => ({ role: m.role, content: m.content }))
                    },
                    response: {
                        content: accumulatedResponse,
                        stop_reason: "end_turn",
                        usage: undefined  // 流式响应不提供token用量
                    },
                    performance: {
                        duration_ms: duration,
                        started_at: startedAt,
                        completed_at: completedAt
                    },
                    config: {
                        apiKey: RequestLogger.maskApiKey(this.settings.apiKey),
                        baseURL: this.settings.baseURL || "https://api.anthropic.com"
                    }
                };

                this.logger.writeLog(logEntry).catch(err =>
                    console.error('[ClaudeClient] Failed to write request log:', err)
                );
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
    async sendMessageSimple(messages: Message[], feature: string = "QuickEdit"): Promise<string> {
        if (!this.isConfigured()) {
            throw new Error("Claude API is not configured. Please set your API key in settings.");
        }

        // 日志记录：准备
        const requestId = RequestLogger.generateRequestId();
        const startTime = Date.now();
        const startedAt = new Date().toISOString();

        try {
            console.log(`[ClaudeClient] Sending request to ${this.settings.baseURL || 'official API'}`);
            console.log(`[ClaudeClient] Messages count: ${messages.length}, Model: ${this.settings.model}`);

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
            const completedAt = new Date().toISOString();
            console.log(`[ClaudeClient] Request completed in ${duration}ms`);

            const textContent = response.content.find(block => block.type === "text");
            const responseText = textContent && "text" in textContent ? textContent.text : "";

            // 日志记录：成功完成
            if (this.logger.isEnabled()) {
                const logEntry: LogEntry = {
                    timestamp: startedAt,
                    requestId,
                    feature,
                    request: {
                        model: this.settings.model,
                        temperature: this.settings.temperature,
                        max_tokens: this.settings.maxTokens,
                        system: this.settings.systemPrompt,
                        messages: messages.map(m => ({ role: m.role, content: m.content }))
                    },
                    response: {
                        content: responseText,
                        stop_reason: response.stop_reason,
                        usage: {
                            input_tokens: response.usage.input_tokens,
                            output_tokens: response.usage.output_tokens
                        }
                    },
                    performance: {
                        duration_ms: duration,
                        started_at: startedAt,
                        completed_at: completedAt
                    },
                    config: {
                        apiKey: RequestLogger.maskApiKey(this.settings.apiKey),
                        baseURL: this.settings.baseURL || "https://api.anthropic.com"
                    }
                };

                this.logger.writeLog(logEntry).catch(err =>
                    console.error('[ClaudeClient] Failed to write request log:', err)
                );
            }

            return responseText;
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
