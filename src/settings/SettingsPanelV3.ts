/**
 * Settings Panel V3 - Streamlined Configuration Management
 *
 * This is the new main settings panel that focuses on:
 * 1. Configuration profile management (select, create, delete, import/export)
 * 2. Connection settings (API key, base URL)
 * 3. Model settings (model selection, tokens, temperature)
 * 4. Entry point to Prompt Editor Panel
 *
 * Prompt editing is moved to a separate dedicated panel.
 */

import type { ClaudeSettings, MultiProviderSettings, ProviderConfig } from "../claude";
import { AVAILABLE_MODELS } from "../claude";
import { UniversalAIClient } from "../claude/UniversalAIClient";
import { AIProviderFactory } from "../ai/AIProviderFactory";
import type { AIProviderType } from "../ai/types";
import type { ConfigManager } from "./ConfigManager";
import type { ConfigProfile, PromptTemplate } from "./config-types";
import { Dialog } from "siyuan";
import { KeyboardShortcutFormatter } from "../utils/KeyboardShortcutFormatter";

export class SettingsPanelV3 {
    private element: HTMLElement;
    private container: HTMLElement | null = null;
    private onSave: (settings: Partial<ClaudeSettings>) => void;
    private onOpenPromptEditor: () => void;
    private configManager: ConfigManager;
    private currentProfile: ConfigProfile;
    private testClient: UniversalAIClient | null = null;
    private availableModels: { value: string; label: string }[] = AVAILABLE_MODELS;
    private dialog: Dialog | null = null;
    private quickEditPreset: PromptTemplate | null = null;
    private aiDockPreset: PromptTemplate | null = null;

    constructor(
        configManager: ConfigManager,
        onSave: (settings: Partial<ClaudeSettings>) => void,
        onOpenPromptEditor: () => void
    ) {
        this.configManager = configManager;
        this.currentProfile = configManager.getActiveProfile();
        this.onSave = onSave;
        this.onOpenPromptEditor = onOpenPromptEditor;
        this.element = this.createPanel();
    }

    /**
     * FIX Critical 1.4: Escape HTML to prevent XSS attacks
     * Escapes special HTML characters in user-controlled strings
     */
    private escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    private createPanel(): HTMLElement {
        console.log("[SettingsPanelV3] Creating panel...");
        const container = document.createElement("div");
        container.className = "claude-settings-panel-v3-with-nav";

        console.log("[SettingsPanelV3] Current profile:", this.currentProfile);

        const navigationBar = this.createNavigationBar();
        const profileSection = this.createProfileManagementSection();
        const connectionSection = this.createConnectionSection();
        const promptEditorSection = this.createPromptEditorSection();
        const keyboardShortcutsSection = this.createKeyboardShortcutsSection();
        const loggingSection = this.createLoggingSection();

        console.log("[SettingsPanelV3] Sections created, profile section length:", profileSection.length);

        container.innerHTML = `
            ${navigationBar}
            <div class="settings-content">
                <div class="settings-content-scroll">
                    <div class="settings-section active" id="section-profile">
                        ${profileSection}
                    </div>
                    <div class="settings-section" id="section-connection">
                        ${connectionSection}
                    </div>
                    <div class="settings-section" id="section-prompt">
                        ${promptEditorSection}
                    </div>
                    <div class="settings-section" id="section-shortcuts">
                        ${keyboardShortcutsSection}
                    </div>
                    <div class="settings-section" id="section-logging">
                        ${loggingSection}
                    </div>
                </div>
            </div>
        `;

        console.log("[SettingsPanelV3] HTML set, container innerHTML length:", container.innerHTML.length);

        // Store container reference for triggerSave() method
        this.container = container;

        this.attachEventListeners(container);
        console.log("[SettingsPanelV3] Event listeners attached");
        return container;
    }

    //#region HTML Sections

    /**
     * Create navigation sidebar for settings
     */
    private createNavigationBar(): string {
        return `
            <div class="settings-sidebar">
                <div class="settings-nav-item active" data-section="profile">
                    <svg class="settings-nav-icon"><use xlink:href="#iconFiles"></use></svg>
                    <span>配置文件管理</span>
                </div>
                <div class="settings-nav-item" data-section="connection">
                    <svg class="settings-nav-icon"><use xlink:href="#iconLink"></use></svg>
                    <span>连接设置</span>
                </div>
                <div class="settings-nav-item" data-section="prompt">
                    <svg class="settings-nav-icon"><use xlink:href="#iconEdit"></use></svg>
                    <span>提示词设置</span>
                </div>
                <div class="settings-nav-item" data-section="shortcuts">
                    <svg class="settings-nav-icon"><use xlink:href="#iconKeymap"></use></svg>
                    <span>快捷键设置</span>
                </div>
                <div class="settings-nav-item" data-section="logging">
                    <svg class="settings-nav-icon"><use xlink:href="#iconLog"></use></svg>
                    <span>日志配置</span>
                </div>
            </div>
        `;
    }

    private createProfileManagementSection(): string {
        const profiles = this.configManager.getAllProfiles();
        const activeProfileId = this.configManager.getActiveProfileId();

        return `
            <div class="section-header" style="margin-bottom: 16px;">
                <h3 style="margin: 0; font-size: 15px; font-weight: 500;">
                    📁 配置文件管理
                </h3>
                <div class="ft__smaller ft__secondary" style="margin-top: 4px;">
                    管理多个配置方案，快速切换不同的使用场景
                </div>
            </div>

                <!-- Profile Selector -->
                <div class="setting-item" style="margin-bottom: 16px;">
                    <div class="setting-label" style="margin-bottom: 8px;">
                        <span style="font-weight: 500;">当前配置</span>
                    </div>
                    <select class="b3-select" id="profile-selector" style="width: 100%;">
                        ${profiles.map(p => `
                            <option value="${this.escapeHtml(p.id)}" ${p.id === activeProfileId ? 'selected' : ''}>
                                ${this.escapeHtml(p.icon || '📋')} ${this.escapeHtml(p.name)}${p.isDefault ? ' (默认)' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <div class="ft__smaller ft__secondary" style="margin-top: 8px;" id="profile-description">
                        ${this.escapeHtml(this.currentProfile.description || '')}
                    </div>
                </div>

                <!-- Profile Management Buttons -->
                <div class="setting-item" style="margin-bottom: 12px;">
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button class="b3-button b3-button--outline" id="new-profile-btn" style="flex: 1; min-width: 100px;">
                            <svg style="width: 14px; height: 14px;"><use xlink:href="#iconAdd"></use></svg>
                            <span style="margin-left: 4px;">新建</span>
                        </button>
                        <button class="b3-button b3-button--outline" id="duplicate-profile-btn" style="flex: 1; min-width: 100px;">
                            <svg style="width: 14px; height: 14px;"><use xlink:href="#iconCopy"></use></svg>
                            <span style="margin-left: 4px;">复制</span>
                        </button>
                        <button class="b3-button b3-button--outline" id="rename-profile-btn" style="flex: 1; min-width: 100px;">
                            <svg style="width: 14px; height: 14px;"><use xlink:href="#iconEdit"></use></svg>
                            <span style="margin-left: 4px;">重命名</span>
                        </button>
                        <button class="b3-button b3-button--outline" id="delete-profile-btn" style="flex: 1; min-width: 100px;" ${this.currentProfile.isDefault ? 'disabled' : ''}>
                            <svg style="width: 14px; height: 14px;"><use xlink:href="#iconTrashcan"></use></svg>
                            <span style="margin-left: 4px;">删除</span>
                        </button>
                    </div>
                </div>

                <!-- Import/Export Buttons -->
                <div class="setting-item">
                    <div style="display: flex; gap: 8px;">
                        <button class="b3-button b3-button--outline" id="import-profile-btn" style="flex: 1;">
                            <svg style="width: 14px; height: 14px;"><use xlink:href="#iconDownload"></use></svg>
                            <span style="margin-left: 4px;">导入配置</span>
                        </button>
                        <button class="b3-button b3-button--outline" id="export-profile-btn" style="flex: 1;">
                            <svg style="width: 14px; height: 14px;"><use xlink:href="#iconUpload"></use></svg>
                            <span style="margin-left: 4px;">导出配置</span>
                        </button>
                    </div>
                    <div class="ft__smaller ft__secondary" style="margin-top: 8px;">
                        💡 导入/导出配置文件，方便备份和分享
                    </div>
                </div>
        `;
    }

    private createConnectionSection(): string {
        const settings = this.currentProfile.settings as MultiProviderSettings;
        const activeProvider = settings.activeProvider || 'anthropic';
        const providerConfig = settings.providers?.[activeProvider];
        
        // Get provider info dynamically from Factory
        const currentInfo = this.getProviderInfo(activeProvider);
        const hasCustomBaseURL = !!(providerConfig?.baseURL && providerConfig.baseURL.trim());

        // Get provider-specific parameter values
        const providerMaxTokens = providerConfig?.maxTokens ?? settings.maxTokens ?? 4096;
        const providerTemperature = providerConfig?.temperature ?? settings.temperature ?? 0.7;

        return `
            <div class=\"section-header\" style=\"margin-bottom: 16px;\">
                <h3 style=\"margin: 0; font-size: 15px; font-weight: 500;\">
                    🔌 连接设置
                </h3>
                <div class=\"ft__smaller ft__secondary\" style=\"margin-top: 4px;\">
                    配置 AI 提供商和 API 连接
                </div>
            </div>

            <!-- AI Provider Selector -->
            <div class=\"setting-item\" style=\"margin-bottom: 16px;\">
                <div class=\"setting-label\" style=\"margin-bottom: 8px;\">
                    <span style=\"font-weight: 500;\">AI 提供商 <span style=\"color: var(--b3-theme-error);\">*</span></span>
                </div>
                <select class=\"b3-select\" id=\"ai-provider-selector\" style=\"width: 100%;\">
                    ${this.getProviderSelectorOptions(activeProvider)}
                </select>
                <div class=\"ft__smaller ft__secondary\" style=\"margin-top: 8px;\">
                    💡 选择不同的 AI 提供商，支持多平台切换
                </div>
            </div>

            <!-- API Endpoint Type -->
            <div class=\"setting-item\" style=\"margin-bottom: 16px;\">
                <div class=\"setting-label\" style=\"margin-bottom: 8px;\">
                    <span style=\"font-weight: 500;\">API 端点</span>
                </div>
                <div class=\"b3-form__radio\" style=\"margin-bottom: 8px;\">
                    <label>
                        <input type=\"radio\" name=\"api-endpoint-type\" value=\"official\" ${!hasCustomBaseURL ? 'checked' : ''}>
                        <span>官方 API (${currentInfo.defaultBaseURL})</span>
                    </label>
                </div>
                <div class=\"b3-form__radio\">
                    <label>
                        <input type=\"radio\" name=\"api-endpoint-type\" value=\"custom\" ${hasCustomBaseURL ? 'checked' : ''}>
                        <span>自定义端点 / 反向代理</span>
                    </label>
                </div>
            </div>

            <!-- API Key -->
            <div class=\"setting-item\">
                <div class=\"setting-label\">
                    <span>API Key <span style=\"color: var(--b3-theme-error);\">*</span></span>
                </div>
                <div class=\"settings-input-group\">
                    <input
                        class=\"b3-text-field\"
                        type=\"password\"
                        id=\"provider-api-key\"
                        placeholder=\"输入您的 API Key\"
                        value=\"${this.escapeHtml(providerConfig?.apiKey || '')}\"
                    >
                    <button
                        class=\"b3-button b3-button--outline\"
                        id=\"toggle-api-key\"
                        title=\"显示/隐藏 API Key\"
                        style=\"padding: 0 12px;\"
                    >
                        <svg><use xlink:href=\"#iconEye\"></use></svg>
                    </button>
                </div>
                <div class=\"ft__smaller ft__secondary\" style=\"margin-top: 8px;\" id=\"api-key-help\">
                    ${currentInfo.url ? `📍 获取 API Key: <a href=\"${currentInfo.url}\" target=\"_blank\" style=\"color: var(--b3-theme-on-background);\">${currentInfo.name} 控制台</a>` : ''}
                </div>
            </div>

            <!-- Custom Base URL -->
            <div class=\"setting-item\" id=\"custom-baseurl-section\" style=\"margin-bottom: 16px; ${hasCustomBaseURL ? '' : 'display: none;'}\">
                <div class=\"setting-label\" style=\"margin-bottom: 8px;\">
                    <span style=\"font-weight: 500;\">自定义 API 端点</span>
                </div>
                <input
                    class=\"b3-text-field\"
                    type=\"text\"
                    id=\"provider-base-url\"
                    placeholder=\"https://your-proxy.com/v1\"
                    value=\"${this.escapeHtml(providerConfig?.baseURL || '')}\"
                    style=\"width: 100%;\"
                >
                <div class=\"ft__smaller ft__secondary\" style=\"margin-top: 8px;\">
                    💡 支持反向代理或自建 API 服务
                </div>
            </div>

            <!-- Model Selection -->
            <div class=\"setting-item\" style=\"margin-bottom: 16px;\">
                <div class=\"setting-label\" style=\"margin-bottom: 8px;\">
                    <span style=\"font-weight: 500;\">模型选择 <span style=\"color: var(--b3-theme-error);\">*</span></span>
                </div>
                <select class=\"b3-select\" id=\"provider-model\" style=\"width: 100%;\">
                    ${this.getModelOptionsForProvider(activeProvider, providerConfig?.model || '')}
                </select>
                <div class=\"ft__smaller ft__secondary\" style=\"margin-top: 8px;\" id=\"model-help\">
                    选择此提供商的模型版本
                </div>
            </div>


            <!-- Per-Provider Max Tokens -->
            <div class="setting-item" style="margin-bottom: 16px;">
                <div class="settings-slider-header">
                    <span style="font-weight: 500;">最大输出长度 (此提供商)</span>
                    <span class="ft__smaller ft__secondary" id="provider-max-tokens-value">${providerMaxTokens} tokens</span>
                </div>
                <input
                    type="range"
                    id="provider-max-tokens"
                    min="256"
                    max="8192"
                    step="256"
                    value="${providerMaxTokens}"
                    class="settings-full-width"
                >
                <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                    <span class="ft__smaller ft__secondary" id="provider-max-tokens-min">256</span>
                    <span class="ft__smaller ft__secondary" id="provider-max-tokens-max">8192</span>
                </div>
                <div class="ft__smaller ft__secondary" style="margin-top: 8px;">
                    💡 不同提供商有不同的输出长度限制，切换提供商时会自动调整
                </div>
            </div>

            <!-- Per-Provider Temperature -->
            <div class="setting-item" style="margin-bottom: 16px;">
                <div class="settings-slider-header">
                    <span style="font-weight: 500;">Temperature (此提供商)</span>
                    <span class="ft__smaller ft__secondary" id="provider-temperature-value">${providerTemperature}</span>
                </div>
                <input
                    type="range"
                    id="provider-temperature"
                    min="0"
                    max="1"
                    step="0.1"
                    value="${providerTemperature}"
                    class="settings-full-width"
                >
                <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                    <span class="ft__smaller ft__secondary">保守 (0.0)</span>
                    <span class="ft__smaller ft__secondary">创造 (1.0)</span>
                </div>
                <div class="ft__smaller ft__secondary" style="margin-top: 8px;">
                    💡 控制响应的随机性和创造性，不同提供商可能有不同范围
                </div>
            </div>

            <!-- Test Connection Button -->
            <div class=\"setting-item\" style=\"margin-top: 24px;\">
                <button class=\"b3-button b3-button--outline\" id=\"test-provider-connection\" style=\"width: 100%;\">
                    <svg><use xlink:href=\"#iconRefresh\"></use></svg>
                    <span style=\"margin-left: 4px;\">测试连接</span>
                </button>
                <div class=\"ft__smaller ft__secondary\" style=\"margin-top: 8px; text-align: center;\">
                    验证 ${currentInfo.name} API 连接是否正常
                </div>
            </div>
        `;
    }

    /**
     * Get model options HTML for a specific provider
     */
    private getModelOptionsForProvider(provider: AIProviderType, selectedModel: string): string {
        const modelsByProvider: Record<AIProviderType, Array<{ value: string; label: string }>> = {
            anthropic: [
                { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5 (推荐)' },
                { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
                { value: 'claude-opus-4-20250514', label: 'Claude Opus 4 (最强)' },
                { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
                { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (快速)' },
            ],
            openai: [
                // GPT-4o Series (Recommended - 2024-2025)
                { value: 'chatgpt-4o-latest', label: '🌟 ChatGPT-4o Latest (最新推荐)' },
                { value: 'gpt-4o', label: '⚡ GPT-4o (多模态旗舰)' },
                { value: 'gpt-4o-2024-11-20', label: 'GPT-4o (2024-11-20)' },
                { value: 'gpt-4o-mini', label: '🚀 GPT-4o Mini (快速省钱)' },
                
                // o-Series Reasoning Models (2025)
                { value: 'o1', label: '🧠 o1 (深度推理)' },
                { value: 'o1-preview', label: 'o1 Preview' },
                { value: 'o1-mini', label: 'o1 Mini (推理精简版)' },
                { value: 'o3-mini', label: 'o3-mini (最新推理模型)' },
                
                // GPT-4 Turbo (Legacy but supported)
                { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
                { value: 'gpt-4', label: 'GPT-4 Classic' },
                
                // GPT-3.5 (Budget option)
                { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (经济型)' },
            ],
            gemini: [
                // Gemini 2.5 Series (Latest - 2025)
                { value: 'gemini-2.5-pro', label: '🌟 Gemini 2.5 Pro (最强推理能力)' },
                { value: 'gemini-2.5-flash', label: '⚡ Gemini 2.5 Flash (推荐，性价比最高)' },
                { value: 'gemini-2.5-flash-lite', label: '🚀 Gemini 2.5 Flash Lite (最快最省)' },
                { value: 'gemini-2.5-flash-image', label: '🖼️ Gemini 2.5 Flash Image (图像生成)' },
                
                // Gemini 2.0 Series
                { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (稳定版)' },
                { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash Exp (实验版)' },
                
                // Gemini 1.5 Series (Previous generation)
                { value: 'gemini-1.5-pro-latest', label: 'Gemini 1.5 Pro Latest' },
                { value: 'gemini-1.5-flash-latest', label: 'Gemini 1.5 Flash Latest' },
            ],
            xai: [
                { value: 'grok-beta', label: 'Grok Beta' },
                { value: 'grok-vision-beta', label: 'Grok Vision Beta' },
            ],
            deepseek: [
                { value: 'deepseek-chat', label: 'DeepSeek Chat' },
                { value: 'deepseek-coder', label: 'DeepSeek Coder' },
                { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner (推理模型)' },
            ],
            moonshot: [
                // Kimi K2 Series (Latest - 2025)
                { value: 'kimi-k2-0905-preview', label: '🌟 Kimi K2 0905 (256K上下文，最新推荐)' },
                { value: 'kimi-k2-thinking', label: '🧠 Kimi K2 Thinking (256K，推理模型)' },
                { value: 'kimi-k2-thinking-turbo', label: '⚡ Kimi K2 Thinking Turbo (256K，快速推理)' },
                { value: 'kimi-k2-0711-preview', label: 'Kimi K2 0711 (128K)' },
                
                // Legacy models
                { value: 'moonshot-v1-128k', label: 'Moonshot V1 128K (旧版)' },
                { value: 'moonshot-v1-32k', label: 'Moonshot V1 32K (旧版)' },
                { value: 'moonshot-v1-8k', label: 'Moonshot V1 8K (旧版)' },
            ],
            custom: [
                { value: 'custom-model', label: 'Custom Model' },
            ],
        };

        const models = modelsByProvider[provider] || [];
        return models
            .map(m => `<option value=\"${this.escapeHtml(m.value)}\" ${m.value === selectedModel ? 'selected' : ''}>${this.escapeHtml(m.label)}</option>`)
            .join('');
    }

    /**
     * Generate provider selector options HTML (dynamic from Factory)
     */
    /**
     * Get provider metadata from AIProviderFactory
     * Returns display info (name, icon, URL, defaultBaseURL) for a provider type
     */
    private getProviderInfo(type: string): { name: string; icon: string; url: string; defaultBaseURL: string } {
        try {
            if (!AIProviderFactory.hasProvider(type)) {
                console.warn(`[SettingsPanelV3] Provider "${type}" not registered, using fallback`);
                return { name: 'Unknown Provider', icon: '❓', url: '', defaultBaseURL: '' };
            }

            const metadata = AIProviderFactory.getMetadata(type);
            return {
                name: metadata.displayName,
                icon: metadata.icon,
                url: metadata.apiKeyUrl,
                defaultBaseURL: metadata.defaultBaseURL,
            };
        } catch (error) {
            console.error(`[SettingsPanelV3] Failed to get provider info for ${type}:`, error);
            return { name: 'Unknown Provider', icon: '❓', url: '', defaultBaseURL: '' };
        }
    }

    private getProviderSelectorOptions(activeProvider: string): string {
        try {
            const providerTypes = AIProviderFactory.getProviderTypes();
            
            if (providerTypes.length === 0) {
                return '<option value="">No providers available</option>';
            }

            return providerTypes.map(type => {
                const info = this.getProviderInfo(type);
                return `<option value="${this.escapeHtml(type)}" ${type === activeProvider ? 'selected' : ''}>
                    ${this.escapeHtml(`${info.icon} ${info.name}`)}
                </option>`;
            }).join('');
        } catch (error) {
            console.error('[SettingsPanelV3] Failed to generate provider options:', error);
            return '<option value="">Error loading providers</option>';
        }
    }


    private createPromptEditorSection(): string {
        return `
            <div class="section-header" style="margin-bottom: 12px;">
                <h3 style="margin: 0; font-size: 15px; font-weight: 500;">
                    📝 提示词设置
                </h3>
                <div class="ft__smaller ft__secondary" style="margin-top: 4px;">
                    管理系统提示词、追加提示词、预设模板和AI编辑指令
                </div>
            </div>

            <!-- 功能说明 -->
            <div class="prompt-feature-hint" style="margin-bottom: 12px;">
                <div style="margin-bottom: 4px;">📝 <strong>编辑模板</strong>：自定义AI角色、系统指令和响应格式，创建适合不同场景的预设模板</div>
                <div>🔍 <strong>过滤规则</strong>：使用正则表达式处理AI响应，支持全局规则和预设特定规则</div>
            </div>

            <!-- Preset列表 -->
            <div class="preset-list" style="margin-bottom: 12px;">
                <div class="preset-item" id="quick-edit-preset-item">
                    <div class="preset-item-label">⚡ Quick Edit 当前激活</div>
                    <div class="preset-item-content" id="quick-edit-preset-card">
                        <svg class="fn__rotate" style="width: 14px; height: 14px;"><use xlink:href="#iconRefresh"></use></svg>
                        <span style="margin-left: 6px;">加载中...</span>
                    </div>
                </div>
                <div class="preset-item" id="ai-dock-preset-item">
                    <div class="preset-item-label">💬 AI Dock 当前激活</div>
                    <div class="preset-item-content" id="ai-dock-preset-card">
                        <svg class="fn__rotate" style="width: 14px; height: 14px;"><use xlink:href="#iconRefresh"></use></svg>
                        <span style="margin-left: 6px;">加载中...</span>
                    </div>
                </div>
            </div>

            <!-- 过滤规则统计 -->
            <div class="filter-stats-inline" id="filter-stats-inline" style="margin-bottom: 12px;">
                📊 过滤规则:
                <span class="stat-badge">全局 <strong>-</strong></span> ·
                <span class="stat-badge">Quick Edit <strong>-</strong></span> ·
                <span class="stat-badge">AI Dock <strong>-</strong></span>
            </div>

            <!-- 编辑按钮 -->
            <button class="b3-button b3-button--outline" id="open-prompt-editor-btn" style="width: 100%; padding: 10px;">
                <svg style="width: 16px; height: 16px;"><use xlink:href="#iconEdit"></use></svg>
                <span style="margin-left: 8px; font-weight: 500;">编辑提示词和模板</span>
            </button>
        `;
    }

    private createLoggingSection(): string {
        const settings = this.currentProfile.settings;
        const enabled = settings.enableRequestLogging ?? false;
        const logPath = settings.requestLogPath || '';
        const includeResponse = settings.requestLogIncludeResponse ?? true;

        return `
                <div class="section-header" style="margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 15px; font-weight: 500;">
                        🗂️ 日志配置
                    </h3>
                    <div class="ft__smaller ft__secondary" style="margin-top: 4px;">
                        记录AI请求和响应到本地文件，方便调试和分析
                    </div>
                </div>

                <!-- Enable Logging -->
                <div class="setting-item" style="margin-bottom: 16px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="enable-request-logging" ${enabled ? 'checked' : ''} style="margin-right: 8px;">
                        <span style="font-weight: 500;">启用AI请求日志</span>
                    </label>
                    <div class="ft__smaller ft__secondary" style="margin-top: 8px; margin-left: 24px;">
                        记录所有AI请求和响应到指定目录，方便调试prompt
                    </div>
                </div>

                <!-- Log Path -->
                <div class="setting-item" style="margin-bottom: 16px; ${enabled ? '' : 'opacity: 0.5; pointer-events: none;'}" id="log-path-container">
                    <div class="setting-label" style="margin-bottom: 8px;">
                        <span style="font-weight: 500;">日志保存路径</span>
                    </div>
                    <input
                        class="b3-text-field"
                        type="text"
                        id="request-log-path"
                        placeholder="例如: C:\\Logs\\SiYuan-AI 或 /home/user/logs/siyuan-ai"
                        value="${this.escapeHtml(logPath)}"
                        style="width: 100%;"
                        ${enabled ? '' : 'disabled'}
                    >
                    <div class="ft__smaller ft__secondary" style="margin-top: 8px;">
                        💡 日志将按日期保存为 ai-requests-YYYY-MM-DD.log，每次请求独立记录
                    </div>
                </div>

                <!-- Include Response -->
                <div class="setting-item" style="${enabled ? '' : 'opacity: 0.5; pointer-events: none;'}" id="log-response-container">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="log-include-response" ${includeResponse ? 'checked' : ''} style="margin-right: 8px;" ${enabled ? '' : 'disabled'}>
                        <span style="font-weight: 500;">记录AI响应内容</span>
                    </label>
                    <div class="ft__smaller ft__secondary" style="margin-top: 8px; margin-left: 24px;">
                        关闭后仅记录请求，不记录响应（减小日志体积）
                    </div>
                </div>

                <!-- Info Box -->
                <div style="margin-top: 16px; padding: 12px; background: var(--b3-theme-surface); border-radius: 4px; border-left: 3px solid var(--b3-theme-primary);">
                    <div class="ft__smaller" style="line-height: 1.6;">
                        <strong>📋 日志内容包括：</strong><br>
                        • 完整的请求参数（model、temperature、system、messages）<br>
                        • AI返回的响应文本和metadata<br>
                        • 性能数据（请求时长、token用量）<br>
                        • API Key自动脱敏（显示前7后4位）<br>
                        • 功能来源标记（Chat/QuickEdit等）
                    </div>
                </div>
            </div>
        `;
    }

    private createKeyboardShortcutsSection(): string {
        const settings = this.currentProfile.settings;
        const shortcuts = settings.keyboardShortcuts || {};

        return `
                <div class="section-header" style="margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 15px; font-weight: 500;">
                        ⌨️ 快捷键设置
                    </h3>
                    <div class="ft__smaller ft__secondary" style="margin-top: 4px;">
                        自定义键盘快捷键，提升操作效率
                    </div>
                </div>

                <!-- Quick Edit Shortcut -->
                <div class="setting-item" style="margin-bottom: 16px;">
                    <div class="setting-label" style="margin-bottom: 8px;">
                        <span style="font-weight: 500;">AI 快速编辑</span>
                    </div>
                    <input
                        class="b3-text-field"
                        type="text"
                        id="shortcut-quick-edit"
                        placeholder="${KeyboardShortcutFormatter.format('⌃⇧Q')}"
                        value="${KeyboardShortcutFormatter.format(shortcuts.quickEdit || '⌃⇧Q')}"
                        style="width: 100%;"
                    >
                    <div class="ft__smaller ft__secondary" style="margin-top: 8px;">
                        选中文本后快速调用 AI 编辑功能（默认：${KeyboardShortcutFormatter.format('⌃⇧Q')}）
                    </div>
                </div>

                <!-- Undo AI Edit Shortcut -->
                <div class="setting-item" style="margin-bottom: 16px;">
                    <div class="setting-label" style="margin-bottom: 8px;">
                        <span style="font-weight: 500;">撤销 AI 编辑</span>
                    </div>
                    <input
                        class="b3-text-field"
                        type="text"
                        id="shortcut-undo-ai-edit"
                        placeholder="${KeyboardShortcutFormatter.format('⌃⇧Z')}"
                        value="${KeyboardShortcutFormatter.format(shortcuts.undoAIEdit || '⌃⇧Z')}"
                        style="width: 100%;"
                    >
                    <div class="ft__smaller ft__secondary" style="margin-top: 8px;">
                        撤销上一次 AI 编辑操作（默认：${KeyboardShortcutFormatter.format('⌃⇧Z')}）
                    </div>
                </div>

                <!-- Open Claude Shortcut -->
                <div class="setting-item" style="margin-bottom: 16px;">
                    <div class="setting-label" style="margin-bottom: 8px;">
                        <span style="font-weight: 500;">打开 Claude AI 面板</span>
                    </div>
                    <input
                        class="b3-text-field"
                        type="text"
                        id="shortcut-open-claude"
                        placeholder="${KeyboardShortcutFormatter.format('⌥⇧C')}"
                        value="${KeyboardShortcutFormatter.format(shortcuts.openClaude || '⌥⇧C')}"
                        style="width: 100%;"
                    >
                    <div class="ft__smaller ft__secondary" style="margin-top: 8px;">
                        打开侧边栏 Claude AI 聊天面板（默认：${KeyboardShortcutFormatter.format('⌥⇧C')}）
                    </div>
                </div>

                <!-- Restore Defaults Button -->
                <div class="setting-item">
                    <button class="b3-button b3-button--outline" id="restore-default-shortcuts" style="width: 100%;">
                        <svg style="width: 14px; height: 14px;"><use xlink:href="#iconUndo"></use></svg>
                        <span style="margin-left: 4px;">恢复默认快捷键</span>
                    </button>
                </div>

                <!-- Format Guide -->
                <div style="margin-top: 16px; padding: 12px; background: var(--b3-theme-surface); border-radius: 4px; border-left: 3px solid var(--b3-theme-primary);">
                    <div class="ft__smaller" style="line-height: 1.6;">
                        <strong>⌨️ 快捷键格式说明：</strong><br>
                        • ⌃ = Ctrl（Windows/Linux）或 ⌘ Command（macOS）<br>
                        • ⌥ = Alt（Windows/Linux）或 ⌥ Option（macOS）<br>
                        • ⇧ = Shift<br>
                        • 示例：⌃⇧Q = ${KeyboardShortcutFormatter.format('⌃⇧Q')}，⌥⇧C = ${KeyboardShortcutFormatter.format('⌥⇧C')}<br>
                        <br>
                        <strong>💡 提示：</strong>修改后需要重启思源笔记才能生效
                    </div>
                </div>
        `;
    }

    //#endregion

    //#region Event Listeners

    private attachEventListeners(container: HTMLElement) {
        // Navigation sidebar
        this.attachNavigationListeners(container);

        // Profile management
        this.attachProfileListeners(container);

        // AI Provider Selector
        const providerSelector = container.querySelector("#ai-provider-selector") as HTMLSelectElement;
        const modelSelect = container.querySelector("#provider-model") as HTMLSelectElement;
        const apiKeyHelp = container.querySelector("#api-key-help") as HTMLElement;

        providerSelector?.addEventListener("change", (e) => {
            const selectedProvider = (e.target as HTMLSelectElement).value as AIProviderType;
            const settings = this.currentProfile.settings as MultiProviderSettings;
            const providerConfig = settings.providers?.[selectedProvider];
            
            // Update all input fields with the selected provider's configuration
            const apiKeyInput = container.querySelector("#provider-api-key") as HTMLInputElement;
            const baseURLInput = container.querySelector("#provider-base-url") as HTMLInputElement;
            const customBaseURLSection = container.querySelector("#custom-baseurl-section") as HTMLElement;
            const officialRadio = container.querySelector('input[name="api-endpoint-type"][value="official"]') as HTMLInputElement;
            const customRadio = container.querySelector('input[name="api-endpoint-type"][value="custom"]') as HTMLInputElement;
            
            // Update API Key
            if (apiKeyInput) {
                apiKeyInput.value = providerConfig?.apiKey || '';
            }
            
            // Update Base URL and endpoint type
            const hasCustomBaseURL = !!(providerConfig?.baseURL && providerConfig.baseURL.trim());
            if (baseURLInput) {
                baseURLInput.value = providerConfig?.baseURL || '';
            }
            if (officialRadio && customRadio) {
                officialRadio.checked = !hasCustomBaseURL;
                customRadio.checked = hasCustomBaseURL;
            }
            if (customBaseURLSection) {
                customBaseURLSection.style.display = hasCustomBaseURL ? 'block' : 'none';
            }
            
            // Update model options for selected provider
            if (modelSelect) {
                modelSelect.innerHTML = this.getModelOptionsForProvider(selectedProvider, providerConfig?.model || '');
            }

            // Get provider info dynamically from Factory
            const currentInfo = this.getProviderInfo(selectedProvider);

            // FIX: Update official API endpoint text label
            const officialRadioLabel = officialRadio?.parentElement?.querySelector('span');
            if (officialRadioLabel) {
                officialRadioLabel.textContent = `官方 API (${currentInfo.defaultBaseURL})`;
            }

            // Update API key help text
            if (apiKeyHelp && currentInfo.url) {
                apiKeyHelp.innerHTML = `📍 获取 API Key: <a href="${currentInfo.url}" target="_blank" style="color: var(--b3-theme-on-background);">${currentInfo.name} 控制台</a>`;
            }

            // FIX: Update "测试连接" button help text
            const testBtnHelp = container.querySelector('#test-provider-connection')?.nextElementSibling;
            if (testBtnHelp) {
                testBtnHelp.textContent = `验证 ${currentInfo.name} API 连接是否正常`;
            }

            // Update provider-specific parameter sliders
            const providerMaxTokensSlider = container.querySelector("#provider-max-tokens") as HTMLInputElement;
            const providerMaxTokensValue = container.querySelector("#provider-max-tokens-value");
            const providerTemperatureSlider = container.querySelector("#provider-temperature") as HTMLInputElement;
            const providerTemperatureValue = container.querySelector("#provider-temperature-value");

            if (providerMaxTokensSlider && providerConfig) {
                const maxTokens = providerConfig.maxTokens ?? settings.maxTokens ?? 4096;
                providerMaxTokensSlider.value = String(maxTokens);
                if (providerMaxTokensValue) {
                    providerMaxTokensValue.textContent = `${maxTokens} tokens`;
                }
            }

            if (providerTemperatureSlider && providerConfig) {
                const temperature = providerConfig.temperature ?? settings.temperature ?? 0.7;
                providerTemperatureSlider.value = String(temperature);
                if (providerTemperatureValue) {
                    providerTemperatureValue.textContent = temperature.toFixed(1);
                }
            }

            // Auto-save provider selection
            this.triggerSave();

            // Update parameter limits for selected provider
            this.updateProviderParameterLimits(selectedProvider, container);
        });

        // API Endpoint Type toggle
        const endpointRadios = container.querySelectorAll('input[name="api-endpoint-type"]');
        const customBaseURLSection = container.querySelector("#custom-baseurl-section") as HTMLElement;

        endpointRadios.forEach(radio => {
            radio.addEventListener("change", (e) => {
                const value = (e.target as HTMLInputElement).value;
                if (customBaseURLSection) {
                    customBaseURLSection.style.display = value === "custom" ? "block" : "none";
                }
            });
        });

        // Toggle API Key visibility
        const toggleKeyBtn = container.querySelector("#toggle-api-key");
        const apiKeyInput = container.querySelector("#provider-api-key") as HTMLInputElement;

        toggleKeyBtn?.addEventListener("click", () => {
            apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
        });

        // Provider-specific Max Tokens slider
        const providerMaxTokensSlider = container.querySelector("#provider-max-tokens") as HTMLInputElement;
        const providerMaxTokensValue = container.querySelector("#provider-max-tokens-value");

        providerMaxTokensSlider?.addEventListener("input", (e) => {
            const value = (e.target as HTMLInputElement).value;
            if (providerMaxTokensValue) {
                providerMaxTokensValue.textContent = `${value} tokens`;
            }
        });

        // Provider-specific Temperature slider
        const providerTemperatureSlider = container.querySelector("#provider-temperature") as HTMLInputElement;
        const providerTemperatureValue = container.querySelector("#provider-temperature-value");

        providerTemperatureSlider?.addEventListener("input", (e) => {
            const value = (e.target as HTMLInputElement).value;
            if (providerTemperatureValue) {
                providerTemperatureValue.textContent = parseFloat(value).toFixed(1);
            }
        });

        // Model selection is now handled above in provider selector
        // (Legacy code removed - model is now selected per-provider)

        // Open Prompt Editor
        const openPromptEditorBtn = container.querySelector("#open-prompt-editor-btn");
        openPromptEditorBtn?.addEventListener("click", () => {
            this.onOpenPromptEditor();
        });

        // Logging configuration
        const enableLoggingCheckbox = container.querySelector("#enable-request-logging") as HTMLInputElement;
        const logPathContainer = container.querySelector("#log-path-container") as HTMLElement;
        const logPathInput = container.querySelector("#request-log-path") as HTMLInputElement;
        const logResponseContainer = container.querySelector("#log-response-container") as HTMLElement;
        const logResponseCheckbox = container.querySelector("#log-include-response") as HTMLInputElement;

        enableLoggingCheckbox?.addEventListener("change", (e) => {
            const enabled = (e.target as HTMLInputElement).checked;

            // Toggle visibility and disabled state
            if (logPathContainer) {
                logPathContainer.style.opacity = enabled ? "1" : "0.5";
                logPathContainer.style.pointerEvents = enabled ? "auto" : "none";
            }
            if (logResponseContainer) {
                logResponseContainer.style.opacity = enabled ? "1" : "0.5";
                logResponseContainer.style.pointerEvents = enabled ? "auto" : "none";
            }
            if (logPathInput) {
                logPathInput.disabled = !enabled;
            }
            if (logResponseCheckbox) {
                logResponseCheckbox.disabled = !enabled;
            }
        });

        // Keyboard shortcuts
        const restoreDefaultShortcutsBtn = container.querySelector("#restore-default-shortcuts");
        restoreDefaultShortcutsBtn?.addEventListener("click", () => {
            const quickEditInput = container.querySelector("#shortcut-quick-edit") as HTMLInputElement;
            const undoAIEditInput = container.querySelector("#shortcut-undo-ai-edit") as HTMLInputElement;
            const openClaudeInput = container.querySelector("#shortcut-open-claude") as HTMLInputElement;

            if (quickEditInput) quickEditInput.value = KeyboardShortcutFormatter.format("⌃⇧Q");
            if (undoAIEditInput) undoAIEditInput.value = KeyboardShortcutFormatter.format("⌃⇧Z");
            if (openClaudeInput) openClaudeInput.value = KeyboardShortcutFormatter.format("⌥⇧C");
        });

        // Test connection button (in connection section)
        const testBtn = container.querySelector("#test-provider-connection");
        testBtn?.addEventListener("click", () => this.testConnection(container));

        // Load preset information asynchronously
        this.loadPresetInfo(container);
    }

    /**
     * Attach navigation sidebar event listeners
     */
    private attachNavigationListeners(container: HTMLElement) {
        const navItems = container.querySelectorAll('.settings-nav-item');
        const sections = container.querySelectorAll('.settings-section');

        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const sectionId = item.getAttribute('data-section');

                // Update navigation active state
                navItems.forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');

                // Update section visibility
                sections.forEach(section => {
                    section.classList.remove('active');
                });

                const targetSection = container.querySelector(`#section-${sectionId}`);
                if (targetSection) {
                    targetSection.classList.add('active');
                }
            });
        });
    }

    private attachProfileListeners(container: HTMLElement) {
        // Profile selector
        const profileSelector = container.querySelector("#profile-selector") as HTMLSelectElement;
        profileSelector?.addEventListener("change", (e) => {
            const newProfileId = (e.target as HTMLSelectElement).value;
            this.switchProfile(newProfileId, container);
        });

        // New profile
        container.querySelector("#new-profile-btn")?.addEventListener("click", () => {
            this.createNewProfile(container);
        });

        // Duplicate profile
        container.querySelector("#duplicate-profile-btn")?.addEventListener("click", () => {
            this.duplicateCurrentProfile(container);
        });

        // Rename profile
        container.querySelector("#rename-profile-btn")?.addEventListener("click", () => {
            this.renameCurrentProfile(container);
        });

        // Delete profile
        container.querySelector("#delete-profile-btn")?.addEventListener("click", () => {
            this.deleteCurrentProfile(container);
        });

        // Import profile
        container.querySelector("#import-profile-btn")?.addEventListener("click", () => {
            this.importProfile(container);
        });

        // Export profile
        container.querySelector("#export-profile-btn")?.addEventListener("click", () => {
            this.exportCurrentProfile();
        });
    }

    /**
     * Update parameter slider limits based on selected provider
     * Auto-clamps values if they exceed new limits
     */
    private updateProviderParameterLimits(provider: AIProviderType, container: HTMLElement) {
        try {
            // Get parameter limits from provider
            const metadata = AIProviderFactory.getMetadata(provider);
            const limits = AIProviderFactory.getParameterLimits(provider);

            // Get slider elements
            const maxTokensSlider = container.querySelector("#provider-max-tokens") as HTMLInputElement;
            const maxTokensMin = container.querySelector("#provider-max-tokens-min") as HTMLElement;
            const maxTokensMax = container.querySelector("#provider-max-tokens-max") as HTMLElement;
            const maxTokensValue = container.querySelector("#provider-max-tokens-value") as HTMLElement;

            const temperatureSlider = container.querySelector("#provider-temperature") as HTMLInputElement;
            const temperatureValue = container.querySelector("#provider-temperature-value") as HTMLElement;

            if (!maxTokensSlider || !temperatureSlider) {
                console.warn('[SettingsPanelV3] Parameter sliders not found');
                return;
            }

            // Update max tokens slider
            const tokenLimits = limits.maxTokens;
            maxTokensSlider.min = String(tokenLimits.min);
            maxTokensSlider.max = String(tokenLimits.max);

            // Auto-clamp if current value exceeds new limit
            let currentMaxTokens = parseInt(maxTokensSlider.value);
            if (currentMaxTokens > tokenLimits.max) {
                currentMaxTokens = tokenLimits.max;
                maxTokensSlider.value = String(currentMaxTokens);
                console.log(`[SettingsPanelV3] Auto-clamped maxTokens from ${maxTokensSlider.value} to ${currentMaxTokens} for ${provider}`);
            }
            if (currentMaxTokens < tokenLimits.min) {
                currentMaxTokens = tokenLimits.min;
                maxTokensSlider.value = String(currentMaxTokens);
            }

            // Update labels
            if (maxTokensMin) maxTokensMin.textContent = String(tokenLimits.min);
            if (maxTokensMax) maxTokensMax.textContent = String(tokenLimits.max);
            if (maxTokensValue) maxTokensValue.textContent = `${currentMaxTokens} tokens`;

            // Update temperature slider
            const tempLimits = limits.temperature;
            temperatureSlider.min = String(tempLimits.min);
            temperatureSlider.max = String(tempLimits.max);
            temperatureSlider.step = String(tempLimits.max <= 1 ? 0.1 : 0.1); // Keep 0.1 step

            // Auto-clamp temperature
            let currentTemp = parseFloat(temperatureSlider.value);
            if (currentTemp > tempLimits.max) {
                currentTemp = tempLimits.max;
                temperatureSlider.value = String(currentTemp);
                console.log(`[SettingsPanelV3] Auto-clamped temperature from ${temperatureSlider.value} to ${currentTemp} for ${provider}`);
            }
            if (currentTemp < tempLimits.min) {
                currentTemp = tempLimits.min;
                temperatureSlider.value = String(currentTemp);
            }

            // Update temperature display
            if (temperatureValue) temperatureValue.textContent = currentTemp.toFixed(1);

            console.log(`[SettingsPanelV3] Updated parameter limits for ${provider}: maxTokens [${tokenLimits.min}-${tokenLimits.max}], temperature [${tempLimits.min}-${tempLimits.max}]`);

        } catch (error) {
            console.error(`[SettingsPanelV3] Failed to update parameter limits for ${provider}:`, error);
        }
    }


    //#endregion

    //#region Profile Management Methods

    private switchProfile(profileId: string, container: HTMLElement) {
        const profile = this.configManager.getProfile(profileId);
        if (!profile) {
            console.error('[SettingsPanelV3] Profile not found:', profileId);
            return;
        }

        this.configManager.setActiveProfile(profileId);
        this.currentProfile = profile;

        // Refresh UI with new profile settings
        this.refreshSettingsUI(container);

        console.log('[SettingsPanelV3] Switched to profile:', profile.name);
    }

    private refreshSettingsUI(container: HTMLElement) {
        const settings = this.currentProfile.settings;

        // Update description
        const descElem = container.querySelector("#profile-description");
        if (descElem) {
            descElem.textContent = this.currentProfile.description || '';
        }

        // Update API key
        const apiKeyInput = container.querySelector("#claude-api-key") as HTMLInputElement;
        if (apiKeyInput) {
            apiKeyInput.value = settings.apiKey || '';
        }

        // Update base URL
        const baseURLInput = container.querySelector("#claude-base-url") as HTMLInputElement;
        if (baseURLInput) {
            baseURLInput.value = settings.baseURL || '';
        }

        // Update provider radio
        const hasProxy = !!settings.baseURL;
        const officialRadio = container.querySelector('input[name="api-provider"][value="official"]') as HTMLInputElement;
        const proxyRadio = container.querySelector('input[name="api-provider"][value="proxy"]') as HTMLInputElement;
        if (officialRadio && proxyRadio) {
            officialRadio.checked = !hasProxy;
            proxyRadio.checked = hasProxy;
        }

        // Update proxy section visibility
        const proxySection = container.querySelector("#proxy-url-section") as HTMLElement;
        if (proxySection) {
            proxySection.style.display = hasProxy ? 'block' : 'none';
        }

        // Update model
        const modelSelect = container.querySelector("#claude-model") as HTMLSelectElement;
        if (modelSelect) {
            modelSelect.value = settings.model;
        }

        // Update max tokens
        const maxTokensSlider = container.querySelector("#claude-max-tokens") as HTMLInputElement;
        const maxTokensValue = container.querySelector("#max-tokens-value");
        if (maxTokensSlider) {
            maxTokensSlider.value = String(settings.maxTokens);
        }
        if (maxTokensValue) {
            maxTokensValue.textContent = `${settings.maxTokens} tokens`;
        }

        // Update temperature
        const tempSlider = container.querySelector("#claude-temperature") as HTMLInputElement;
        const tempValue = container.querySelector("#temperature-value");
        if (tempSlider) {
            tempSlider.value = String(settings.temperature);
        }
        if (tempValue) {
            tempValue.textContent = String(settings.temperature);
        }

        // Update delete button state
        const deleteBtn = container.querySelector("#delete-profile-btn") as HTMLButtonElement;
        if (deleteBtn) {
            deleteBtn.disabled = this.currentProfile.isDefault || false;
        }
    }

    private createNewProfile(container: HTMLElement) {
        const name = prompt('请输入新配置的名称:', '新配置');
        if (!name || !name.trim()) return;

        if (this.configManager.profileNameExists(name.trim())) {
            alert('配置名称已存在，请使用其他名称');
            return;
        }

        const newProfile = this.configManager.createProfile(
            name.trim(),
            this.currentProfile.settings,
            '基于当前配置创建'
        );

        // Switch to new profile
        this.configManager.setActiveProfile(newProfile.id);
        this.currentProfile = newProfile;

        // Refresh selector
        this.refreshProfileSelector(container, newProfile.id);

        console.log('[SettingsPanelV3] Created new profile:', name);
    }

    private duplicateCurrentProfile(container: HTMLElement) {
        const name = prompt('请输入复制配置的名称:', `${this.currentProfile.name} (复制)`);
        if (!name || !name.trim()) return;

        if (this.configManager.profileNameExists(name.trim())) {
            alert('配置名称已存在，请使用其他名称');
            return;
        }

        const duplicated = this.configManager.duplicateProfile(this.currentProfile.id, name.trim());
        if (!duplicated) {
            alert('复制配置失败');
            return;
        }

        // Refresh selector
        this.refreshProfileSelector(container, this.currentProfile.id);

        console.log('[SettingsPanelV3] Duplicated profile:', name);
    }

    private renameCurrentProfile(container: HTMLElement) {
        if (this.currentProfile.isDefault) {
            alert('默认配置不能重命名');
            return;
        }

        const newName = prompt('请输入新的配置名称:', this.currentProfile.name);
        if (!newName || !newName.trim()) return;

        if (this.configManager.profileNameExists(newName.trim(), this.currentProfile.id)) {
            alert('配置名称已存在，请使用其他名称');
            return;
        }

        this.configManager.updateProfile(this.currentProfile.id, { name: newName.trim() });
        this.currentProfile = this.configManager.getProfile(this.currentProfile.id)!;

        // Refresh selector
        this.refreshProfileSelector(container, this.currentProfile.id);

        console.log('[SettingsPanelV3] Renamed profile to:', newName);
    }

    private deleteCurrentProfile(container: HTMLElement) {
        if (this.currentProfile.isDefault) {
            alert('默认配置不能删除');
            return;
        }

        const confirmed = confirm(`确定要删除配置"${this.currentProfile.name}"吗？此操作不可恢复。`);
        if (!confirmed) return;

        // Get another profile to switch to
        const profiles = this.configManager.getAllProfiles().filter(p => p.id !== this.currentProfile.id);
        if (profiles.length === 0) {
            alert('无法删除最后一个配置');
            return;
        }

        const nextProfile = profiles[0];
        const deletedId = this.currentProfile.id;

        // Switch first, then delete
        this.configManager.setActiveProfile(nextProfile.id);
        this.currentProfile = nextProfile;

        const success = this.configManager.deleteProfile(deletedId);
        if (!success) {
            alert('删除配置失败');
            return;
        }

        // Refresh UI
        this.refreshProfileSelector(container, nextProfile.id);
        this.refreshSettingsUI(container);

        console.log('[SettingsPanelV3] Deleted profile');
    }

    private importProfile(container: HTMLElement) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const jsonData = event.target?.result as string;
                    const result = this.configManager.importProfiles(jsonData);

                    if (result.success) {
                        alert(`成功导入 ${result.imported} 个配置`);
                        this.refreshProfileSelector(container, this.currentProfile.id);
                    } else {
                        alert(`导入失败:\n${result.errors.join('\n')}`);
                    }
                } catch (error) {
                    alert(`导入失败: ${error instanceof Error ? error.message : String(error)}`);
                }
            };
            reader.readAsText(file);
        };

        input.click();
    }

    private exportCurrentProfile() {
        const jsonData = this.configManager.exportProfile(this.currentProfile.id);
        if (!jsonData) {
            alert('导出失败');
            return;
        }

        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `claude-config-${this.currentProfile.name}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        console.log('[SettingsPanelV3] Exported profile:', this.currentProfile.name);
    }

    private refreshProfileSelector(container: HTMLElement, selectedId: string) {
        const selector = container.querySelector("#profile-selector") as HTMLSelectElement;
        if (!selector) return;

        const profiles = this.configManager.getAllProfiles();
        // FIX Critical 1.4: Escape HTML to prevent XSS in profile names
        selector.innerHTML = profiles.map(p => `
            <option value="${this.escapeHtml(p.id)}" ${p.id === selectedId ? 'selected' : ''}>
                ${this.escapeHtml(p.icon || '📋')} ${this.escapeHtml(p.name)}${p.isDefault ? ' (默认)' : ''}
            </option>
        `).join('');
    }

    //#endregion

    //#region Save & Test

    private saveSettings(container: HTMLElement, closeAfterSave: boolean = true) {
        const settings = this.currentProfile.settings as MultiProviderSettings;
        const activeProvider = (container.querySelector("#ai-provider-selector") as HTMLSelectElement)?.value as AIProviderType || 'anthropic';
        const useCustomEndpoint = (container.querySelector('input[name="api-endpoint-type"]:checked') as HTMLInputElement)?.value === "custom";

        // Read provider-specific parameters
        const providerMaxTokens = parseInt((container.querySelector("#provider-max-tokens") as HTMLInputElement)?.value) || 4096;
        const providerTemperature = parseFloat((container.querySelector("#provider-temperature") as HTMLInputElement)?.value) || 0.7;

        // Build provider config
        const providerConfig: ProviderConfig = {
            apiKey: (container.querySelector("#provider-api-key") as HTMLInputElement)?.value || "",
            baseURL: useCustomEndpoint
                ? (container.querySelector("#provider-base-url") as HTMLInputElement)?.value || ""
                : "",
            model: (container.querySelector("#provider-model") as HTMLSelectElement)?.value || "",
            enabled: true,
            maxTokens: providerMaxTokens,
            temperature: providerTemperature,
        };

        // Update multi-provider settings
        const updates: Partial<MultiProviderSettings> = {
            activeProvider,
            providers: {
                ...settings.providers,
                [activeProvider]: providerConfig,
            },
            // Keep global params for backward compatibility with old code paths
            // NOTE: The old UI sliders (#claude-max-tokens, #claude-temperature) no longer exist.
            // We preserve existing settings values here instead of reading from deleted UI elements.
            // The provider-specific values (in providerConfig above) are what will actually be used by UniversalAIClient.
            maxTokens: settings.maxTokens,
            temperature: settings.temperature,
            enableRequestLogging: (container.querySelector("#enable-request-logging") as HTMLInputElement)?.checked ?? false,
            requestLogPath: (container.querySelector("#request-log-path") as HTMLInputElement)?.value || "",
            requestLogIncludeResponse: (container.querySelector("#log-include-response") as HTMLInputElement)?.checked ?? true,
            keyboardShortcuts: {
                quickEdit: KeyboardShortcutFormatter.toMacFormat(
                    (container.querySelector("#shortcut-quick-edit") as HTMLInputElement)?.value || "Ctrl+Shift+Q"
                ) || "⌃⇧Q",
                undoAIEdit: KeyboardShortcutFormatter.toMacFormat(
                    (container.querySelector("#shortcut-undo-ai-edit") as HTMLInputElement)?.value || "Ctrl+Shift+Z"
                ) || "⌃⇧Z",
                openClaude: KeyboardShortcutFormatter.toMacFormat(
                    (container.querySelector("#shortcut-open-claude") as HTMLInputElement)?.value || "Alt+Shift+C"
                ) || "⌥⇧C",
            },
            // Also update legacy fields for backward compatibility
            apiKey: providerConfig.apiKey,
            baseURL: providerConfig.baseURL,
            model: providerConfig.model,
        };

        // Update current profile
        this.configManager.updateProfile(this.currentProfile.id, {
            settings: { ...this.currentProfile.settings, ...updates }
        });

        // Notify parent to save
        this.onSave(updates);

        console.log('[SettingsPanelV3] Settings saved, active provider:', activeProvider);
        
        // Only close if explicitly requested (e.g., from Save button)
        if (closeAfterSave) {
            this.close();
        }
    }

    private async testConnection(container: HTMLElement) {
        const testBtn = container.querySelector("#test-provider-connection") as HTMLButtonElement;
        const originalHTML = testBtn.innerHTML;

        try {
            testBtn.disabled = true;
            testBtn.innerHTML = '<svg class="fn__rotate"><use xlink:href="#iconRefresh"></use></svg><span style="margin-left: 4px;\">测试中...</span>';

            const activeProvider = (container.querySelector("#ai-provider-selector") as HTMLSelectElement)?.value as AIProviderType || 'anthropic';
            const useCustomEndpoint = (container.querySelector('input[name="api-endpoint-type"]:checked') as HTMLInputElement)?.value === "custom";
            
            const providerConfig: ProviderConfig = {
                apiKey: (container.querySelector("#provider-api-key") as HTMLInputElement)?.value || "",
                baseURL: useCustomEndpoint
                    ? (container.querySelector("#provider-base-url") as HTMLInputElement)?.value || ""
                    : "",
                model: (container.querySelector("#provider-model") as HTMLSelectElement)?.value || "",
                enabled: true,
            };

            const settings: MultiProviderSettings = {
                ...this.currentProfile.settings,
                activeProvider,
                providers: {
                    ...this.currentProfile.settings.providers,
                    [activeProvider]: providerConfig,
                },
            };

            if (!providerConfig.apiKey || providerConfig.apiKey.trim() === "") {
                throw new Error("请输入 API Key");
            }

            if (!providerConfig.model || providerConfig.model.trim() === "") {
                throw new Error("请选择模型");
            }

            this.testClient = new UniversalAIClient(settings);

            await this.testClient.sendMessageSimple([
                { role: "user", content: "Hi" }
            ]);

            testBtn.innerHTML = '<svg><use xlink:href="#iconCheck"></use></svg><span style="margin-left: 4px;\">连接成功</span>';
            setTimeout(() => {
                testBtn.innerHTML = originalHTML;
                testBtn.disabled = false;
            }, 2000);

        } catch (error) {
            testBtn.innerHTML = '<svg><use xlink:href="#iconClose"></use></svg><span style="margin-left: 4px;\">连接失败</span>';
            alert(`测试失败: ${error instanceof Error ? error.message : String(error)}`);
            setTimeout(() => {
                testBtn.innerHTML = originalHTML;
                testBtn.disabled = false;
            }, 2000);
        }
    }

    /**
     * Load preset information asynchronously
     * This method fetches the current active presets for Quick Edit and AI Dock,
     * then updates the UI cards with preset details
     */
    private async loadPresetInfo(container: HTMLElement) {
        try {
            console.log('[SettingsPanelV3] Loading preset info...');

            // Get Quick Edit preset from localStorage (PresetSelectionManager uses 'lastSelectedPresetId')
            // NOTE: PresetSelectionManager stores preset ID (not index), aligned since v0.9.0
            const quickEditPresetId = localStorage.getItem('lastSelectedPresetId') || 'default';
            console.log('[SettingsPanelV3] Quick Edit preset ID from localStorage:', quickEditPresetId);

            // Validate preset exists before using it
            const preset = this.configManager.getTemplateById(quickEditPresetId);
            this.quickEditPreset = preset || this.configManager.getTemplateById('default');
            console.log('[SettingsPanelV3] Quick Edit preset loaded:', this.quickEditPreset?.name || 'default');

            // Get AI Dock preset from localStorage (UnifiedAIPanel persists to 'claude-ai-dock-preset-id')
            // NOTE: AI Dock now persists selection, aligned with Quick Edit persistence pattern
            const aiDockPresetId = localStorage.getItem('claude-ai-dock-preset-id') || 'default';
            console.log('[SettingsPanelV3] AI Dock preset ID from localStorage:', aiDockPresetId);

            // Validate preset exists before using it
            const aiDockPreset = this.configManager.getTemplateById(aiDockPresetId);
            this.aiDockPreset = aiDockPreset || this.configManager.getTemplateById('default');
            console.log('[SettingsPanelV3] AI Dock preset loaded:', this.aiDockPreset?.name || 'default');

            // Update the UI
            this.updatePresetCards(container);
        } catch (error) {
            console.error("[SettingsPanelV3] Failed to load preset info:", error);
            // Display error in cards
            const quickEditCard = container.querySelector("#quick-edit-preset-card");
            const aiDockCard = container.querySelector("#ai-dock-preset-card");

            if (quickEditCard) {
                quickEditCard.innerHTML = `
                    <div class="preset-label" style="font-size: 12px; color: var(--b3-theme-on-surface-light); margin-bottom: 8px;">⚡ Quick Edit 当前激活</div>
                    <div style="color: var(--b3-theme-error);">加载失败</div>
                `;
            }
            if (aiDockCard) {
                aiDockCard.innerHTML = `
                    <div class="preset-label" style="font-size: 12px; color: var(--b3-theme-on-surface-light); margin-bottom: 8px;">💬 AI 对话当前激活</div>
                    <div style="color: var(--b3-theme-error);">加载失败</div>
                `;
            }
        }
    }

    /**
     * Update preset info with loaded preset data (List version)
     */
    private updatePresetCards(container: HTMLElement) {
        // Update Quick Edit content
        const quickEditContent = container.querySelector("#quick-edit-preset-card");
        if (quickEditContent && this.quickEditPreset) {
            const preset = this.quickEditPreset;
            const icon = this.escapeHtml(preset.icon || '📝'); // FIX XSS: Escape icon
            const name = this.escapeHtml(preset.name);
            const filterCount = (preset.filterRules || []).filter(r => r.enabled).length;

            quickEditContent.innerHTML = `
                <span style="font-size: 18px; margin-right: 8px;">${icon}</span>
                <span style="font-weight: 500;">${name}</span>
                ${filterCount > 0 ? `<span style="margin-left: 8px; font-size: 11px; color: var(--b3-theme-primary); background: var(--b3-theme-primary-lightest); padding: 2px 6px; border-radius: 3px;">🔧 ${filterCount}</span>` : ''}
            `;
        }

        // Update AI Dock content
        const aiDockContent = container.querySelector("#ai-dock-preset-card");
        if (aiDockContent && this.aiDockPreset) {
            const preset = this.aiDockPreset;
            const icon = this.escapeHtml(preset.icon || '💬'); // FIX XSS: Escape icon
            const name = this.escapeHtml(preset.name);
            const filterCount = (preset.filterRules || []).filter(r => r.enabled).length;

            aiDockContent.innerHTML = `
                <span style="font-size: 18px; margin-right: 8px;">${icon}</span>
                <span style="font-weight: 500;">${name}</span>
                ${filterCount > 0 ? `<span style="margin-left: 8px; font-size: 11px; color: var(--b3-theme-primary); background: var(--b3-theme-primary-lightest); padding: 2px 6px; border-radius: 3px;">🔧 ${filterCount}</span>` : ''}
            `;
        }

        // Update filter stats
        const stats = this.getFilterRuleStats();
        const statsInline = container.querySelector("#filter-stats-inline");
        if (statsInline) {
            statsInline.innerHTML = `
                📊 过滤规则:
                <span class="stat-badge">全局 <strong>${stats.enabledGlobalCount}</strong></span> ·
                <span class="stat-badge">Quick Edit <strong>${stats.enabledQuickEditCount}</strong></span> ·
                <span class="stat-badge">AI Dock <strong>${stats.enabledAIDockCount}</strong></span>
            `;
        }
    }

    /**
     * Get filter rule statistics
     * Returns count of enabled rules for global, Quick Edit, and AI Dock
     */
    private getFilterRuleStats() {
        const globalRules = this.currentProfile.settings.filterRules || [];
        const enabledGlobalCount = globalRules.filter(r => r.enabled).length;

        const quickEditRules = this.quickEditPreset?.filterRules || [];
        const enabledQuickEditCount = quickEditRules.filter(r => r.enabled).length;

        const aiDockRules = this.aiDockPreset?.filterRules || [];
        const enabledAIDockCount = aiDockRules.filter(r => r.enabled).length;

        return { enabledGlobalCount, enabledQuickEditCount, enabledAIDockCount };
    }

    //#endregion

    //#region Helper Methods

    private getModelInfo(model: string): string {
        const modelLower = model.toLowerCase();

        if (modelLower.includes('sonnet-4-5')) return "🚀 最新 Claude 4.5 | 性能卓越 | 推荐使用";
        if (modelLower.includes('sonnet-4')) return "⚡ Claude 4.0 | 速度与质量平衡";
        if (modelLower.includes('opus-4')) return "🧠 Claude Opus 4 | 最强推理能力";
        if (modelLower.includes('3-7-sonnet')) return "💪 Claude 3.7 | 优秀性能";
        if (modelLower.includes('3-5-sonnet')) return "⚖️ Claude 3.5 | 平衡选择";
        if (modelLower.includes('3-5-haiku')) return "⚡ Claude 3.5 Haiku | 快速响应";
        if (modelLower.includes('3-opus')) return "🧠 Claude 3 Opus | 强大推理";
        if (modelLower.includes('3-haiku')) return "⚡ 最快响应 | 适合简单任务";

        return "选择模型查看详情";
    }

    //#endregion

    //#region Public API

    getElement(): HTMLElement {
        return this.element;
    }

    open(dialog: Dialog) {
        this.dialog = dialog;
    }

    close() {
        if (this.dialog) {
            this.dialog.destroy();
            this.dialog = null;
        }
    }

    /**
     * Trigger save action from external components (e.g., title bar button)
     * This allows the title bar Save button to trigger the save workflow
     */
    triggerSave() {
        if (this.container) {
            // Auto-save from provider switching - don't close dialog
            this.saveSettings(this.container, false);
        } else {
            console.error("[SettingsPanelV3] Cannot save: container not initialized");
        }
    }

    /**
     * Trigger save action and prepare for dialog close
     * Used by Save button to save settings without closing dialog
     * (dialog will be closed by button handler in index.ts)
     */
    async triggerSaveAndClose() {
        if (this.container) {
            // Save from explicit Save button - but don't close dialog here
            // The dialog will be closed by the button handler in index.ts
            this.saveSettings(this.container, false);
        } else {
            console.error("[SettingsPanelV3] Cannot save: container not initialized");
        }
    }

    //#endregion
}
