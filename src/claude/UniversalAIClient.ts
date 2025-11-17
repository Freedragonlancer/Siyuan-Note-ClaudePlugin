/**
 * Universal AI Client
 * Unified client for multiple AI providers (Anthropic, OpenAI, Gemini, etc.)
 * Replaces ClaudeClient with multi-provider support
 */

import type { Message, MultiProviderSettings, MessageCallback, ErrorCallback, CompleteCallback, IConfigManager } from "./types";
import { migrateToMultiProvider } from "./types";
import { RequestLogger, type LogEntry } from "../logger/RequestLogger";
import { responseFilter, type FilterRule } from "../filter";
import type { ISiYuanPlugin } from "@/types/siyuan";
import { AIProviderFactory } from "../ai/AIProviderFactory";
import type { AIProvider, AIModelConfig, AIRequestOptions } from "../ai/types";

/**
 * Universal AI Client
 * Handles communication with multiple AI providers including streaming responses
 */
export class UniversalAIClient {
    private provider: AIProvider | null = null;
    private settings: MultiProviderSettings;
    private logger: RequestLogger;
    private activeAbortController: AbortController | null = null;
    private configManager: IConfigManager | null = null; // ConfigManager reference for preset-level filterRules
    public plugin: ISiYuanPlugin | null = null; // Plugin instance for file storage access
    private isInitializing: boolean = false; // FIX Race Condition: Track initialization state

    constructor(settings: MultiProviderSettings, configManager?: IConfigManager) {
        // Ensure settings are migrated to multi-provider format
        this.settings = migrateToMultiProvider(settings);
        this.configManager = configManager || null;
        this.logger = new RequestLogger();
        this.configureLogger();
        this.initializeProvider();
    }

    /**
     * Update config manager reference (for lazy initialization)
     */
    setConfigManager(configManager: IConfigManager): void {
        this.configManager = configManager;
    }

    /**
     * Set plugin instance (for file storage access)
     */
    setPlugin(plugin: ISiYuanPlugin): void {
        this.plugin = plugin;
    }

    /**
     * Initialize AI provider based on current settings
     * FIX Race Condition: Protected against concurrent initialization
     */
    private initializeProvider(): void {
        // FIX: Prevent concurrent initialization
        if (this.isInitializing) {
            console.warn('[UniversalAIClient] Provider initialization already in progress, skipping');
            return;
        }

        try {
            this.isInitializing = true;

            const activeProvider = this.settings.activeProvider || 'anthropic';
            const providerConfig = this.settings.providers?.[activeProvider];

            // DEBUG: Log configuration state
            console.log('[UniversalAIClient] DEBUG - activeProvider:', activeProvider);
            console.log('[UniversalAIClient] DEBUG - settings.providers keys:', this.settings.providers ? Object.keys(this.settings.providers) : 'undefined');
            console.log('[UniversalAIClient] DEBUG - providerConfig:', providerConfig);
            console.log('[UniversalAIClient] DEBUG - apiKey exists:', providerConfig ? !!providerConfig.apiKey : 'no config');
            console.log('[UniversalAIClient] DEBUG - apiKey value:', providerConfig?.apiKey ? `${providerConfig.apiKey.substring(0, 10)}...` : 'empty');

            // Validate critical configuration values
            if (!providerConfig || !providerConfig.apiKey || providerConfig.apiKey.trim() === '') {
                console.log(`[UniversalAIClient] Provider ${activeProvider} not configured (API Key required)`);
                this.provider = null;
                return;
            }

            if (!providerConfig.model) {
                console.warn(`[UniversalAIClient] Provider ${activeProvider} missing model ID, will use provider default`);
            }

            if (this.settings.maxTokens === undefined || this.settings.temperature === undefined) {
                console.warn(`[UniversalAIClient] Global maxTokens or temperature undefined, using defaults`);
            }

            // FIX: Cancel any active requests before switching providers
            if (this.activeAbortController) {
                console.log('[UniversalAIClient] Cancelling active request before provider switch');
                this.activeAbortController.abort();
                this.activeAbortController = null;
            }

            // FIX: Cleanup old provider (could add provider.dispose() if needed)
            const oldProvider = this.provider;
            if (oldProvider) {
                console.log(`[UniversalAIClient] Cleaning up old provider: ${oldProvider.providerName}`);
                // Future: if providers need cleanup, call oldProvider.dispose() here
            }

            // v0.13.0: Use per-provider parameters with fallback to global settings
            // Priority: providerConfig > global settings > hardcoded defaults
            let maxTokens = providerConfig.maxTokens;
            if (typeof maxTokens !== 'number' || maxTokens <= 0) {
                maxTokens = this.settings.maxTokens;
            }
            if (typeof maxTokens !== 'number' || maxTokens <= 0) {
                maxTokens = 4096; // Final fallback
            }

            let temperature = providerConfig.temperature;
            if (typeof temperature !== 'number' || temperature < 0) {
                temperature = this.settings.temperature;
            }
            if (typeof temperature !== 'number' || temperature < 0) {
                temperature = 0.7; // Final fallback
            }

            // Choose appropriate default model based on provider
            let defaultModel = 'claude-sonnet-4-5-20250929';  // Default for Anthropic
            if (activeProvider === 'openai') defaultModel = 'gpt-4o';
            else if (activeProvider === 'gemini') defaultModel = 'gemini-2.0-flash-exp';
            else if (activeProvider === 'xai') defaultModel = 'grok-beta';
            else if (activeProvider === 'deepseek') defaultModel = 'deepseek-chat';
            else if (activeProvider === 'moonshot') defaultModel = 'moonshot-v1-8k';

            const modelId = (providerConfig.model && providerConfig.model.trim() !== '')
                ? providerConfig.model
                : defaultModel;

            // Log the actual values being used (v0.13.0: shows per-provider vs global)
            console.log(`[UniversalAIClient] Config values: maxTokens=${maxTokens}, temperature=${temperature}, modelId=${modelId}`);
            console.log(`[UniversalAIClient] Provider config: maxTokens=${providerConfig.maxTokens}, temperature=${providerConfig.temperature}, model=${providerConfig.model}`);
            console.log(`[UniversalAIClient] Global settings: maxTokens=${this.settings.maxTokens}, temperature=${this.settings.temperature}`);

            // Create provider config with defensive defaults
            const config: AIModelConfig = {
                provider: activeProvider,
                modelId: modelId,
                apiKey: providerConfig.apiKey,
                baseURL: providerConfig.baseURL,
                maxTokens: maxTokens,
                temperature: temperature,

                // v0.13.0: Thinking/Reasoning mode parameters
                thinkingMode: providerConfig.thinkingMode ?? false,
                thinkingBudget: providerConfig.thinkingBudget,
                reasoningEffort: providerConfig.reasoningEffort,
            };

            this.provider = AIProviderFactory.create(config);
            console.log(`[UniversalAIClient] Initialized provider: ${this.provider.providerName}`);
        } catch (error) {
            console.error(`[UniversalAIClient] Failed to initialize provider:`, error);
            this.provider = null;
        } finally {
            this.isInitializing = false;
        }
    }

    /**
     * Configure logger
     */
    private configureLogger() {
        this.logger.configure(
            this.settings.enableRequestLogging ?? false,
            this.settings.requestLogPath ?? '',
            this.settings.requestLogIncludeResponse ?? true
        );
    }

    /**
     * Update settings and reinitialize provider if necessary
     */
    updateSettings(settings: Partial<MultiProviderSettings>) {
        this.settings = { ...this.settings, ...settings };
        
        // Re-initialize provider if provider-related settings changed
        if (settings.activeProvider !== undefined || settings.providers !== undefined) {
            this.initializeProvider();
        }
        
        // Reconfigure logger if logging settings changed
        if (settings.enableRequestLogging !== undefined ||
            settings.requestLogPath !== undefined ||
            settings.requestLogIncludeResponse !== undefined) {
            this.configureLogger();
        }
    }

    /**
     * Check if client is configured and ready
     */
    isConfigured(): boolean {
        return this.provider !== null;
    }

    /**
     * Get current settings
     */
    getSettings(): MultiProviderSettings {
        return { ...this.settings };
    }

    /**
     * Get appended prompt
     */
    getAppendedPrompt(): string {
        return this.settings.appendedPrompt || "";
    }

    /**
     * Get system prompt
     */
    getSystemPrompt(): string {
        return this.settings.systemPrompt || "";
    }

    /**
     * Get current provider name
     */
    getProviderName(): string {
        return this.provider?.providerName || 'Not configured';
    }

    /**
     * Get current active provider type
     */
    getActiveProvider(): string {
        return this.settings.activeProvider || 'anthropic';
    }

    /**
     * Get display-friendly provider name (short form)
     */
    getProviderDisplayName(): string {
        const provider = this.settings.activeProvider;
        const names: Record<string, string> = {
            'anthropic': 'Claude',
            'openai': 'GPT',
            'gemini': 'Gemini',
            'xai': 'Grok',
            'deepseek': 'DeepSeek',
            'moonshot': 'Kimi'
        };
        return names[provider] || provider || 'Unknown';
    }

    /**
     * Get filter rules with optional preset scope
     * @param presetId Optional preset ID to include preset-specific rules
     * @returns Merged filter rules (global first, then preset)
     */
    getFilterRules(presetId?: string): FilterRule[] {
        // Always include global rules
        const globalRules = this.settings.filterRules || [];

        // If no preset ID or no config manager, return only global rules
        if (!presetId || !this.configManager) {
            return globalRules;
        }

        // Try to get preset-specific rules
        try {
            const allTemplates = this.configManager.getAllTemplates?.();
            if (!allTemplates) return globalRules;

            const preset = allTemplates.find((t: any) => t.id === presetId);
            if (!preset) return globalRules;

            const presetRules = preset.filterRules || [];

            // Merge: global rules first, then preset rules
            return [...globalRules, ...presetRules];
        } catch (error) {
            console.warn('[UniversalAIClient] Failed to get preset filterRules:', error);
            return globalRules;
        }
    }

    /**
     * Send a message and get a streaming response
     */
    async sendMessage(
        messages: Message[],
        onMessage: MessageCallback,
        onError: ErrorCallback,
        onComplete: CompleteCallback,
        feature: string = "Chat",
        filterRules?: FilterRule[],
        systemPrompt?: string
    ): Promise<void> {
        if (!this.isConfigured()) {
            onError(new Error("AI provider is not configured. Please set your API key in settings."));
            return;
        }

        // Create AbortController for request cancellation
        this.activeAbortController = new AbortController();
        const STREAM_CHUNK_TIMEOUT = 30000; // 30 seconds chunk timeout

        // Logging: preparation
        const requestId = RequestLogger.generateRequestId();
        const startTime = Date.now();
        const startedAt = new Date().toISOString();
        let accumulatedResponse = "";  // Accumulated streaming response
        let timeoutHandle: NodeJS.Timeout | null = null;

        console.log(`[UniversalAIClient] Starting request ${requestId} with ${this.getProviderName()}`);

        try {
            // v0.13.0: Use per-provider parameters
            const activeProvider = this.settings.activeProvider || 'anthropic';
            const providerConfig = this.settings.providers?.[activeProvider];
            const maxTokens = providerConfig?.maxTokens ?? this.settings.maxTokens ?? 4096;
            const temperature = providerConfig?.temperature ?? this.settings.temperature ?? 0.7;

            const options: AIRequestOptions = {
                systemPrompt: systemPrompt || this.settings.systemPrompt,
                maxTokens: maxTokens,
                temperature: temperature,
                signal: this.activeAbortController.signal,
                onStream: (chunk: string) => {
                    // Check if cancelled
                    if (this.activeAbortController?.signal.aborted) {
                        throw new Error('Request cancelled by user');
                    }

                    accumulatedResponse += chunk;
                    onMessage(chunk);

                    // Reset timeout (data received means connection is healthy)
                    if (timeoutHandle) clearTimeout(timeoutHandle);
                    timeoutHandle = setTimeout(() => {
                        console.error('[UniversalAIClient] Stream timeout: no data received for 30 seconds');
                        this.activeAbortController?.abort();
                    }, STREAM_CHUNK_TIMEOUT);
                },
            };

            // Set initial timeout
            timeoutHandle = setTimeout(() => {
                console.error('[UniversalAIClient] Stream timeout: no data received for 30 seconds');
                this.activeAbortController?.abort();
            }, STREAM_CHUNK_TIMEOUT);

            // Stream message via provider
            await this.provider!.streamMessage(messages, options);

            // Clear timeout timer
            if (timeoutHandle) clearTimeout(timeoutHandle);

            // Apply filter rules after streaming completes
            console.log('[UniversalAIClient] DEBUG filterRules received:', filterRules);
            console.log('[UniversalAIClient] DEBUG filterRules length:', filterRules?.length || 0);
            console.log('[UniversalAIClient] DEBUG enabled rules:', filterRules?.filter(r => r.enabled).length || 0);

            const hasFilterRules = filterRules && filterRules.length > 0 && filterRules.some(r => r.enabled);
            console.log('[UniversalAIClient] DEBUG hasFilterRules:', hasFilterRules);

            let finalResponse = accumulatedResponse;
            let filterResult = { 
                changed: false, 
                filteredText: accumulatedResponse, 
                appliedRulesCount: 0, 
                originalLength: accumulatedResponse.length, 
                filteredLength: accumulatedResponse.length 
            };

            if (hasFilterRules) {
                filterResult = responseFilter.applyFilters(accumulatedResponse, filterRules);
                finalResponse = filterResult.filteredText;

                if (filterResult.changed) {
                    console.log(`[UniversalAIClient] Response filtered: ${filterResult.appliedRulesCount} rules applied, ${filterResult.originalLength} → ${filterResult.filteredLength} chars`);
                    
                    // Send special marker message to indicate full content replacement
                    // Format: [FILTERED_REPLACE]${filteredText}
                    onMessage(`[FILTERED_REPLACE]${finalResponse}`);
                }
            }

            // Logging: success
            if (this.logger.isEnabled()) {
                const completedAt = new Date().toISOString();
                const duration = Date.now() - startTime;

                const activeProvider = this.settings.activeProvider || 'anthropic';
                const providerConfig = this.settings.providers?.[activeProvider];

                const logEntry: LogEntry = {
                    timestamp: startedAt,
                    requestId,
                    feature,
                    request: {
                        model: providerConfig?.model || 'unknown',
                        temperature: this.settings.temperature,
                        max_tokens: this.settings.maxTokens,
                        system: this.settings.systemPrompt,
                        messages: messages.map(m => ({ role: m.role, content: m.content }))
                    },
                    response: {
                        content: finalResponse,
                        stop_reason: "end_turn",
                        usage: undefined  // Streaming doesn't provide token usage
                    },
                    performance: {
                        duration_ms: duration,
                        started_at: startedAt,
                        completed_at: completedAt
                    },
                    config: {
                        apiKey: RequestLogger.maskApiKey(providerConfig?.apiKey || ''),
                        baseURL: providerConfig?.baseURL || this.getDefaultBaseURL()
                    },
                    filtering: filterResult.changed ? {
                        applied: true,
                        rulesCount: filterResult.appliedRulesCount,
                        originalLength: filterResult.originalLength,
                        filteredLength: filterResult.filteredLength
                    } : undefined
                };

                this.logger.writeLog(logEntry).catch(err =>
                    console.error('[UniversalAIClient] Failed to write request log:', err)
                );
            }

        } catch (error) {
            // Clear timeout timer
            if (timeoutHandle) clearTimeout(timeoutHandle);
            
            console.error("[UniversalAIClient] API error:", error);
            
            // Handle cancellation error
            if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('cancel'))) {
                console.log('[UniversalAIClient] Request cancelled by user');
                onError(new Error('Request cancelled by user'));
            } else {
                onError(error instanceof Error ? error : new Error(String(error)));
            }
        } finally {
            // Always cleanup and call completion callback
            if (timeoutHandle) clearTimeout(timeoutHandle);
            this.activeAbortController = null;
            onComplete();
            console.log(`[UniversalAIClient] Request ${requestId} completed/cancelled`);
        }
    }

    /**
     * Send a simple message and get the complete response (non-streaming)
     */
    async sendMessageSimple(
        messages: Message[], 
        feature: string = "QuickEdit", 
        filterRules?: FilterRule[], 
        systemPrompt?: string
    ): Promise<string> {
        if (!this.isConfigured()) {
            throw new Error("AI provider is not configured. Please set your API key in settings.");
        }

        // Logging: preparation
        const requestId = RequestLogger.generateRequestId();
        const startTime = Date.now();
        const startedAt = new Date().toISOString();

        try {
            const activeProvider = this.settings.activeProvider || 'anthropic';
            const providerConfig = this.settings.providers?.[activeProvider];

            // v0.13.0: Use per-provider parameters
            const maxTokens = providerConfig?.maxTokens ?? this.settings.maxTokens ?? 4096;
            const temperature = providerConfig?.temperature ?? this.settings.temperature ?? 0.7;

            console.log(`[UniversalAIClient] Sending request to ${this.getProviderName()}`);
            console.log(`[UniversalAIClient] Messages count: ${messages.length}, Model: ${providerConfig?.model}`);

            const options: AIRequestOptions = {
                systemPrompt: systemPrompt || this.settings.systemPrompt,
                maxTokens: maxTokens,
                temperature: temperature,
            };

            const responseText = await this.provider!.sendMessage(messages, options);

            const duration = Date.now() - startTime;
            const completedAt = new Date().toISOString();
            console.log(`[UniversalAIClient] Request completed in ${duration}ms`);

            // Apply filter rules
            const filterResult = responseFilter.applyFilters(responseText, filterRules);
            const finalResponse = filterResult.filteredText;

            if (filterResult.changed) {
                console.log(`[UniversalAIClient] Response filtered: ${filterResult.appliedRulesCount} rules applied, ${filterResult.originalLength} → ${filterResult.filteredLength} chars`);
            }

            // Logging: success
            if (this.logger.isEnabled()) {
                const logEntry: LogEntry = {
                    timestamp: startedAt,
                    requestId,
                    feature,
                    request: {
                        model: providerConfig?.model || 'unknown',
                        temperature: this.settings.temperature,
                        max_tokens: this.settings.maxTokens,
                        system: this.settings.systemPrompt,
                        messages: messages.map(m => ({ role: m.role, content: m.content }))
                    },
                    response: {
                        content: finalResponse,
                        stop_reason: "end_turn",
                        usage: undefined
                    },
                    performance: {
                        duration_ms: duration,
                        started_at: startedAt,
                        completed_at: completedAt
                    },
                    config: {
                        apiKey: RequestLogger.maskApiKey(providerConfig?.apiKey || ''),
                        baseURL: providerConfig?.baseURL || this.getDefaultBaseURL()
                    },
                    filtering: filterResult.changed ? {
                        applied: true,
                        rulesCount: filterResult.appliedRulesCount,
                        originalLength: filterResult.originalLength,
                        filteredLength: filterResult.filteredLength
                    } : undefined
                };

                this.logger.writeLog(logEntry).catch(err =>
                    console.error('[UniversalAIClient] Failed to write request log:', err)
                );
            }

            return finalResponse;
        } catch (error) {
            console.error("[UniversalAIClient] API error:", error);
            if (error instanceof Error) {
                console.error("[UniversalAIClient] Error name:", error.name);
                console.error("[UniversalAIClient] Error message:", error.message);
            }
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    /**
     * Fetch available models from the current provider
     */
    async listModels(): Promise<string[]> {
        if (!this.isConfigured()) {
            // Return empty array instead of throwing when not configured
            console.warn("[UniversalAIClient] Cannot list models: provider not configured");
            return [];
        }

        try {
            return this.provider!.getAvailableModels();
        } catch (error) {
            console.error("Failed to fetch models list:", error);
            return []; // Return empty array on error instead of throwing
        }
    }

    /**
     * Cancel the currently active request
     * This will abort the ongoing streaming operation
     */
    cancelActiveRequest(): void {
        if (this.activeAbortController) {
            console.log('[UniversalAIClient] Cancelling active request');
            this.activeAbortController.abort();
            this.activeAbortController = null;
        } else {
            console.log('[UniversalAIClient] No active request to cancel');
        }
    }

    /**
     * Get default base URL for current provider
     */
    private getDefaultBaseURL(): string {
        const activeProvider = this.settings.activeProvider || 'anthropic';
        const defaultURLs: Record<string, string> = {
            anthropic: 'https://api.anthropic.com',
            openai: 'https://api.openai.com',
            gemini: 'https://generativelanguage.googleapis.com',
            xai: 'https://api.x.ai',
            deepseek: 'https://api.deepseek.com',
        };
        return defaultURLs[activeProvider] || 'unknown';
    }
}
