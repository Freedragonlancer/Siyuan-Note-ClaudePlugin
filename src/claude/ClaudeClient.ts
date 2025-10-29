import Anthropic from "@anthropic-ai/sdk";
import type { Message, ClaudeSettings, MessageCallback, ErrorCallback, CompleteCallback } from "./types";
import { RequestLogger, type LogEntry } from "../logger/RequestLogger";
import { responseFilter, type FilterRule } from "../filter";

/**
 * Claude API Client
 * Handles communication with Claude API including streaming responses
 */
export class ClaudeClient {
    private client: Anthropic | null = null;
    private settings: ClaudeSettings;
    private logger: RequestLogger;
    private activeAbortController: AbortController | null = null;

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
        feature: string = "Chat",
        filterRules?: FilterRule[]
    ): Promise<void> {
        if (!this.isConfigured()) {
            onError(new Error("Claude API is not configured. Please set your API key in settings."));
            return;
        }

        // 创建 AbortController 用于请求取消
        this.activeAbortController = new AbortController();
        const STREAM_CHUNK_TIMEOUT = 30000; // 30秒chunk超时

        // 日志记录：准备
        const requestId = RequestLogger.generateRequestId();
        const startTime = Date.now();
        const startedAt = new Date().toISOString();
        let accumulatedResponse = "";  // 累积流式响应
        let timeoutHandle: NodeJS.Timeout | null = null;

        console.log(`[ClaudeClient] Starting request ${requestId} with cancellation and timeout protection`);

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

            // 设置超时保护（30秒无数据则中止）
            const resetTimeout = () => {
                if (timeoutHandle) clearTimeout(timeoutHandle);
                timeoutHandle = setTimeout(() => {
                    console.error('[ClaudeClient] Stream timeout: no data received for 30 seconds');
                    this.activeAbortController?.abort();
                }, STREAM_CHUNK_TIMEOUT);
            };

            resetTimeout(); // 初始超时

            // 流式传输：实时发送每个 chunk（保留流式显示效果）
            for await (const chunk of stream) {
                // 检查是否被取消
                if (this.activeAbortController?.signal.aborted) {
                    console.log('[ClaudeClient] Streaming aborted by cancellation');
                    throw new Error('Request cancelled by user');
                }

                if (chunk.type === "content_block_delta") {
                    if (chunk.delta?.type === "text_delta") {
                        const text = chunk.delta.text || "";
                        accumulatedResponse += text;
                        // 实时发送 chunk，让用户看到流式效果
                        onMessage(text);
                        
                        // 重置超时（收到数据说明连接正常）
                        resetTimeout();
                    }
                }
            }

            // 清除超时计时器
            if (timeoutHandle) clearTimeout(timeoutHandle);

            // 流式传输完成后，应用过滤规则
            const hasFilterRules = filterRules && filterRules.length > 0 && filterRules.some(r => r.enabled);
            let finalResponse = accumulatedResponse;
            let filterResult = { changed: false, filteredText: accumulatedResponse, appliedRulesCount: 0, originalLength: accumulatedResponse.length, filteredLength: accumulatedResponse.length };

            if (hasFilterRules) {
                filterResult = responseFilter.applyFilters(accumulatedResponse, filterRules);
                finalResponse = filterResult.filteredText;

                if (filterResult.changed) {
                    console.log(`[ClaudeClient] Response filtered: ${filterResult.appliedRulesCount} rules applied, ${filterResult.originalLength} → ${filterResult.filteredLength} chars`);
                    
                    // 发送特殊标记的消息，告诉接收方需要替换全部内容
                    // 格式: [FILTERED_REPLACE]${filteredText}
                    onMessage(`[FILTERED_REPLACE]${finalResponse}`);
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
                        content: finalResponse,  // 记录过滤后的内容
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
                    },
                    filtering: filterResult.changed ? {
                        applied: true,
                        rulesCount: filterResult.appliedRulesCount,
                        originalLength: filterResult.originalLength,
                        filteredLength: filterResult.filteredLength
                    } : undefined
                };

                this.logger.writeLog(logEntry).catch(err =>
                    console.error('[ClaudeClient] Failed to write request log:', err)
                );
            }

            } catch (error) {
            // 清除超时计时器
            if (timeoutHandle) clearTimeout(timeoutHandle);
            
            console.error("[ClaudeClient] API error:", error);
            
            // 处理取消错误
            if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('cancel'))) {
                console.log('[ClaudeClient] Request cancelled by user');
                onError(new Error('Request cancelled by user'));
            } else {
                onError(error instanceof Error ? error : new Error(String(error)));
            }
        } finally {
            // 确保总是清理并调用完成回调
            if (timeoutHandle) clearTimeout(timeoutHandle);
            this.activeAbortController = null;
            onComplete();
            console.log(`[ClaudeClient] Request ${requestId} completed/cancelled`);
        }
    }

    /**
     * Send a simple message and get the complete response (non-streaming)
     */
    async sendMessageSimple(messages: Message[], feature: string = "QuickEdit", filterRules?: FilterRule[]): Promise<string> {
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

            // 应用过滤规则
            const filterResult = responseFilter.applyFilters(responseText, filterRules);
            const finalResponse = filterResult.filteredText;

            if (filterResult.changed) {
                console.log(`[ClaudeClient] Response filtered: ${filterResult.appliedRulesCount} rules applied, ${filterResult.originalLength} → ${filterResult.filteredLength} chars`);
            }

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
                        content: finalResponse,  // 记录过滤后的内容
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
                    },
                    filtering: filterResult.changed ? {
                        applied: true,
                        rulesCount: filterResult.appliedRulesCount,
                        originalLength: filterResult.originalLength,
                        filteredLength: filterResult.filteredLength
                    } : undefined
                };

                this.logger.writeLog(logEntry).catch(err =>
                    console.error('[ClaudeClient] Failed to write request log:', err)
                );
            }

            return finalResponse;
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

    /**
     * Cancel the currently active request
     * This will abort the ongoing streaming operation
     */
    cancelActiveRequest(): void {
        if (this.activeAbortController) {
            console.log('[ClaudeClient] Cancelling active request');
            this.activeAbortController.abort();
            this.activeAbortController = null;
        } else {
            console.log('[ClaudeClient] No active request to cancel');
        }
    }
}
