/**
 * Settings UI Builder - HTML Generation Module
 *
 * Responsible for generating all HTML content for the settings panel.
 * Separated from SettingsPanelV3 as part of architectural refactoring (Task 1.1).
 *
 * @module SettingsUIBuilder
 * @see SettingsPanelV3
 */

import type { MultiProviderSettings, ProviderConfig } from "../../claude";
import type { ConfigProfile } from "../config-types";
import type { AIProviderType } from "../../ai/types";
import { AIProviderFactory } from "../../ai/AIProviderFactory";
import { KeyboardShortcutFormatter } from "../../utils/KeyboardShortcutFormatter";
import { SecurityUtils } from "../../utils/Security";
import { QUICK_EDIT_AUTO_ACTIONS, REASONING_EFFORT_OPTIONS } from "../../config/ui-constants";

/**
 * Utility class for building settings UI HTML
 */
export class SettingsUIBuilder {
    /**
     * Escape HTML to prevent XSS
     * @deprecated Use SecurityUtils.escapeHtml directly
     */
    static escapeHtml(unsafe: string): string {
        return SecurityUtils.escapeHtml(unsafe);
    }

    /**
     * Create navigation sidebar for settings
     */
    static createNavigationBar(): string {
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

    /**
     * Create profile management section
     */
    static createProfileManagementSection(profiles: ConfigProfile[], activeProfileId: string, currentProfile: ConfigProfile): string {
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
                        ${this.escapeHtml(currentProfile.description || '')}
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
                        <button class="b3-button b3-button--outline" id="delete-profile-btn" style="flex: 1; min-width: 100px;" ${currentProfile.isDefault ? 'disabled' : ''}>
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

    /**
     * Create connection settings section
     */
    static createConnectionSection(currentProfile: ConfigProfile): string {
        const settings = currentProfile.settings as MultiProviderSettings;
        const activeProvider = settings.activeProvider || 'anthropic';
        const providerConfig = settings.providers?.[activeProvider];

        // Get provider info dynamically from Factory
        const currentInfo = this.getProviderInfo(activeProvider);
        const hasCustomBaseURL = !!(providerConfig?.baseURL && providerConfig.baseURL.trim());

        // Get provider-specific parameter values
        const providerMaxTokens = providerConfig?.maxTokens ?? settings.maxTokens ?? 4096;
        const providerTemperature = providerConfig?.temperature ?? settings.temperature ?? 0.7;

        // v0.13.0: Thinking/Reasoning mode values
        const thinkingMode = providerConfig?.thinkingMode ?? false;
        const thinkingBudget = providerConfig?.thinkingBudget ?? 10000;
        const reasoningEffort = providerConfig?.reasoningEffort ?? (activeProvider === 'deepseek' ? 'high' : 'low');
        const openaiApiMode = providerConfig?.openaiApiMode ?? 'auto';

        return `
            <div class="section-header" style="margin-bottom: 16px;">
                <h3 style="margin: 0; font-size: 15px; font-weight: 500;">
                    🔌 连接设置
                </h3>
                <div class="ft__smaller ft__secondary" style="margin-top: 4px;">
                    配置 AI 提供商和 API 连接
                </div>
            </div>

            <!-- AI Provider Selector -->
            <div class="setting-item" style="margin-bottom: 16px;">
                <div class="setting-label" style="margin-bottom: 8px;">
                    <span style="font-weight: 500;">AI 提供商 <span style="color: var(--b3-theme-error);">*</span></span>
                </div>
                <select class="b3-select" id="ai-provider-selector" style="width: 100%;">
                    ${this.getProviderSelectorOptions(activeProvider)}
                </select>
                <div class="ft__smaller ft__secondary" style="margin-top: 8px;">
                    💡 选择不同的 AI 提供商，支持多平台切换
                </div>
            </div>

            <!-- API Endpoint Type -->
            <div class="setting-item" style="margin-bottom: 16px;">
                <div class="setting-label" style="margin-bottom: 8px;">
                    <span style="font-weight: 500;">API 端点</span>
                </div>
                <div class="b3-form__radio" style="margin-bottom: 8px;">
                    <label>
                        <input type="radio" name="api-endpoint-type" value="official" ${!hasCustomBaseURL ? 'checked' : ''}>
                        <span>官方 API (${currentInfo.defaultBaseURL})</span>
                    </label>
                </div>
                <div class="b3-form__radio">
                    <label>
                        <input type="radio" name="api-endpoint-type" value="custom" ${hasCustomBaseURL ? 'checked' : ''}>
                        <span>自定义端点 / 反向代理</span>
                    </label>
                </div>
            </div>

            <!-- API Key -->
            <div class="setting-item">
                <div class="setting-label">
                    <span>API Key <span style="color: var(--b3-theme-error);">*</span></span>
                </div>
                <div class="settings-input-group">
                    <input
                        class="b3-text-field"
                        type="password"
                        id="provider-api-key"
                        placeholder="输入您的 API Key"
                        value="${this.escapeHtml(providerConfig?.apiKey || '')}"
                    >
                    <button
                        class="b3-button b3-button--outline"
                        id="toggle-api-key"
                        title="显示/隐藏 API Key"
                        style="padding: 0 12px;"
                    >
                        <svg><use xlink:href="#iconEye"></use></svg>
                    </button>
                </div>
                <div class="ft__smaller ft__secondary" style="margin-top: 8px;" id="api-key-help">
                    ${currentInfo.url ? `📍 获取 API Key: <a href="${currentInfo.url}" target="_blank" style="color: var(--b3-theme-on-background);">${currentInfo.name} 控制台</a>` : ''}
                </div>
            </div>

            <!-- Custom Base URL -->
            <div class="setting-item" id="custom-baseurl-section" style="margin-bottom: 16px; ${hasCustomBaseURL ? '' : 'display: none;'}">
                <div class="setting-label" style="margin-bottom: 8px;">
                    <span style="font-weight: 500;">自定义 API 端点</span>
                </div>
                <input
                    class="b3-text-field"
                    type="text"
                    id="provider-base-url"
                    placeholder="https://your-proxy.com/v1"
                    value="${this.escapeHtml(providerConfig?.baseURL || '')}"
                    style="width: 100%;"
                >
                <div class="ft__smaller ft__secondary" style="margin-top: 8px;">
                    💡 支持反向代理或自建 API 服务
                </div>
            </div>

            <!-- OpenAI API Mode (for reverse proxies / model relay services) -->
            <div class="setting-item" id="openai-api-mode-section" style="margin-bottom: 16px; ${activeProvider === 'openai' ? '' : 'display: none;'}">
                <div class="setting-label" style="margin-bottom: 8px;">
                    <span style="font-weight: 500;">OpenAI 接口模式</span>
                </div>
                <select class="b3-select" id="openai-api-mode" style="width: 100%;">
                    <option value="auto" ${openaiApiMode === 'auto' ? 'selected' : ''}>自动（新模型走 Responses，旧模型走 Chat Completions）</option>
                    <option value="chat" ${openaiApiMode === 'chat' ? 'selected' : ''}>强制 Chat Completions (/chat/completions)</option>
                    <option value="responses" ${openaiApiMode === 'responses' ? 'selected' : ''}>强制 Responses (/responses，适合反代模型模式）</option>
                </select>
                <div class="ft__smaller ft__secondary" style="margin-top: 8px;">
                    💡 如果你的 OpenAI 反向代理只支持 Responses API，选择“强制 Responses”。自定义端点可填 <code>https://proxy.example.com/v1</code> 或直接填到 <code>/responses</code>。
                </div>
            </div>

            <!-- Model Selection -->
            <div class="setting-item" style="margin-bottom: 16px;">
                <div class="setting-label" style="margin-bottom: 8px;">
                    <span style="font-weight: 500;">模型选择 <span style="color: var(--b3-theme-error);">*</span></span>
                </div>
                <select class="b3-select" id="provider-model" style="width: 100%;">
                    ${this.getModelOptionsForProvider(activeProvider, providerConfig?.model || '')}
                </select>
                <div class="ft__smaller ft__secondary" style="margin-top: 8px;" id="model-help">
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

            <!-- Thinking/Reasoning Mode (v0.13.0) -->
            <div class="setting-item" style="margin-bottom: 16px; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--b3-border-color);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                    <div>
                        <span style="font-weight: 500;">🧠 Thinking/Reasoning Mode</span>
                        <div class="ft__smaller ft__secondary" style="margin-top: 4px;">
                            启用深度推理模式（仅支持特定模型）
                        </div>
                    </div>
                    <input type="checkbox" id="thinking-mode-toggle" class="b3-switch fn__flex-center" ${thinkingMode ? 'checked' : ''}>
                </div>

                <!-- Thinking Budget (Anthropic/Gemini only) -->
                <div id="thinking-budget-container" class="setting-item" style="margin-top: 16px; margin-left: 20px; display: ${thinkingMode && (activeProvider === 'anthropic' || activeProvider === 'gemini') ? 'block' : 'none'};">
                    <div class="settings-slider-header">
                        <span class="ft__smaller" style="font-weight: 500;">推理 Token 预算</span>
                        <span class="ft__smaller ft__secondary" id="thinking-budget-value">${thinkingBudget} tokens</span>
                    </div>
                    <input
                        type="range"
                        id="thinking-budget"
                        min="1000"
                        max="24576"
                        step="1000"
                        value="${thinkingBudget}"
                        class="settings-full-width"
                    >
                    <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                        <span class="ft__smaller ft__secondary">1K</span>
                        <span class="ft__smaller ft__secondary">24K</span>
                    </div>
                    <div class="ft__smaller ft__secondary" style="margin-top: 8px;">
                        💡 控制推理过程可使用的最大 token 数（Anthropic/Gemini）
                    </div>
                </div>

                <!-- Reasoning Effort (xAI / DeepSeek V4) -->
                <div id="reasoning-effort-container" class="setting-item" style="margin-top: 16px; margin-left: 20px; display: ${thinkingMode && (activeProvider === 'xai' || activeProvider === 'deepseek') ? 'block' : 'none'};">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span class="ft__smaller" style="font-weight: 500;">推理强度</span>
                        <select id="reasoning-effort" class="b3-select">
                            ${(activeProvider === 'deepseek' ? [
                                { value: 'high', label: 'High (默认)' },
                                { value: 'max', label: 'Max (最强)' },
                            ] : REASONING_EFFORT_OPTIONS).map(opt =>
                                `<option value="${opt.value}" ${reasoningEffort === opt.value ? 'selected' : ''}>${opt.label}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="ft__smaller ft__secondary" style="margin-top: 8px;">
                        💡 xAI 支持 low/high；DeepSeek V4 支持 high/max，且 Thinking 开启时 temperature/top_p 无效。
                    </div>
                </div>

                <!-- Provider Support Hint -->
                <div class="ft__smaller ft__secondary" style="margin-top: 12px; padding: 8px; background: var(--b3-card-info-background); border-radius: 4px;">
                    <strong>📌 支持情况：</strong><br>
                    • Anthropic (Claude): Extended Thinking (Sonnet 4+, Opus 4)<br>
                    • Gemini: Thinking Budget (2.5+)<br>
                    • xAI (Grok): Reasoning Effort<br>
                    • Moonshot (Kimi): K2 Thinking 模型<br>
                    • OpenAI: Responses API 模式支持 reasoning effort<br>
                    • DeepSeek: V4 支持 Thinking 开关与 high/max effort
                </div>
            </div>

            <!-- Test Connection Button -->
            <div class="setting-item" style="margin-top: 24px;">
                <button class="b3-button b3-button--outline" id="test-provider-connection" style="width: 100%;">
                    <svg><use xlink:href="#iconRefresh"></use></svg>
                    <span style="margin-left: 4px;">测试连接</span>
                </button>
                <div class="ft__smaller ft__secondary" style="margin-top: 8px; text-align: center;">
                    验证 ${currentInfo.name} API 连接是否正常
                </div>
            </div>
        `;
    }

    /**
     * Create prompt editor section
     */
    static createPromptEditorSection(): string {
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

    /**
     * Create logging configuration section
     */
    static createLoggingSection(currentProfile: ConfigProfile): string {
        const settings = currentProfile.settings;
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

    /**
     * Create keyboard shortcuts section
     */
    static createKeyboardShortcutsSection(currentProfile: ConfigProfile): string {
        const settings = currentProfile.settings;
        const shortcuts = settings.keyboardShortcuts || {};

        return `
                <style>
                    /* 录制按钮脉动动画 */
                    @keyframes recording-pulse {
                        0%, 100% {
                            background-color: #e8f4fd;
                            border-color: #1890ff;
                            transform: scale(1);
                        }
                        50% {
                            background-color: #bae7ff;
                            border-color: #40a9ff;
                            transform: scale(1.02);
                        }
                    }

                    .shortcut-record-btn.recording {
                        animation: recording-pulse 1.5s ease-in-out infinite;
                        color: #1890ff;
                        font-weight: 500;
                    }

                    .shortcut-record-btn:hover:not(:disabled) {
                        background-color: #f0f0f0;
                        border-color: #d9d9d9;
                    }

                    .shortcut-record-btn:disabled {
                        opacity: 1;
                    }

                    /* 输入框录制状态 */
                    .b3-text-field[readonly] {
                        background-color: #fafafa;
                    }

                    /* 验证提示样式 */
                    .shortcut-validation-hint {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    }
                </style>

                <!-- Quick Edit Auto Action Setting -->
                <div class="section-header" style="margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 15px; font-weight: 500;">
                        ⚡ 快速编辑行为
                    </h3>
                    <div class="ft__smaller ft__secondary" style="margin-top: 4px;">
                        设置 AI 编辑完成后的默认行为
                    </div>
                </div>

                <div class="setting-item" style="margin-bottom: 24px;">
                    <div class="setting-label" style="margin-bottom: 8px;">
                        <span style="font-weight: 500;">完成后动作</span>
                    </div>
                    <select
                        class="b3-select"
                        id="quick-edit-auto-action"
                        style="width: 100%;"
                    >
                        ${QUICK_EDIT_AUTO_ACTIONS.map(opt =>
                            `<option value="${opt.value}" ${(settings.editSettings?.quickEditAutoAction || 'preview') === opt.value ? 'selected' : ''}>${opt.label}</option>`
                        ).join('')}
                    </select>
                    <div class="ft__smaller" style="margin-top: 8px; color: var(--b3-theme-on-surface);">
                        • <b>预览确认</b>：显示 AI 结果，需手动选择接受/拒绝<br>
                        • <b>自动替换</b>：AI 完成后直接替换原文<br>
                        • <b>自动插入</b>：AI 完成后直接插入到原文下方
                    </div>
                </div>

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
                    <div style="display: flex; gap: 8px; align-items: stretch;">
                        <input
                            class="b3-text-field"
                            type="text"
                            id="shortcut-quick-edit"
                            placeholder="${KeyboardShortcutFormatter.format('⌃⇧Q')}"
                            value="${KeyboardShortcutFormatter.format(shortcuts.quickEdit || '⌃⇧Q')}"
                            readonly
                            style="flex: 1; cursor: default;"
                        >
                        <button
                            class="b3-button b3-button--outline shortcut-record-btn"
                            id="record-shortcut-quick-edit"
                            data-shortcut-name="quickEdit"
                            style="min-width: 90px;"
                        >
                            🎤 录制
                        </button>
                    </div>
                    <div class="shortcut-validation-hint" id="validation-quick-edit" style="margin-top: 6px; font-size: 12px; min-height: 18px;">
                    </div>
                    <div class="ft__smaller" style="margin-top: 8px; color: var(--b3-theme-on-surface);">
                        选中文本后快速调用 AI 编辑功能（默认：${KeyboardShortcutFormatter.format('⌃⇧Q')}）
                    </div>
                </div>

                <!-- Undo AI Edit Shortcut -->
                <div class="setting-item" style="margin-bottom: 16px;">
                    <div class="setting-label" style="margin-bottom: 8px;">
                        <span style="font-weight: 500;">撤销 AI 编辑</span>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: stretch;">
                        <input
                            class="b3-text-field"
                            type="text"
                            id="shortcut-undo-ai-edit"
                            placeholder="${KeyboardShortcutFormatter.format('⌃⇧Z')}"
                            value="${KeyboardShortcutFormatter.format(shortcuts.undoAIEdit || '⌃⇧Z')}"
                            readonly
                            style="flex: 1; cursor: default;"
                        >
                        <button
                            class="b3-button b3-button--outline shortcut-record-btn"
                            id="record-shortcut-undo-ai-edit"
                            data-shortcut-name="undoAIEdit"
                            style="min-width: 90px;"
                        >
                            🎤 录制
                        </button>
                    </div>
                    <div class="shortcut-validation-hint" id="validation-undo-ai-edit" style="margin-top: 6px; font-size: 12px; min-height: 18px;">
                    </div>
                    <div class="ft__smaller" style="margin-top: 8px; color: var(--b3-theme-on-surface);">
                        撤销上一次 AI 编辑操作（默认：${KeyboardShortcutFormatter.format('⌃⇧Z')}）
                    </div>
                </div>

                <!-- Open Claude Shortcut -->
                <div class="setting-item" style="margin-bottom: 16px;">
                    <div class="setting-label" style="margin-bottom: 8px;">
                        <span style="font-weight: 500;">打开 Claude AI 面板</span>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: stretch;">
                        <input
                            class="b3-text-field"
                            type="text"
                            id="shortcut-open-claude"
                            placeholder="${KeyboardShortcutFormatter.format('⌥⇧C')}"
                            value="${KeyboardShortcutFormatter.format(shortcuts.openClaude || '⌥⇧C')}"
                            readonly
                            style="flex: 1; cursor: default;"
                        >
                        <button
                            class="b3-button b3-button--outline shortcut-record-btn"
                            id="record-shortcut-open-claude"
                            data-shortcut-name="openClaude"
                            style="min-width: 90px;"
                        >
                            🎤 录制
                        </button>
                    </div>
                    <div class="shortcut-validation-hint" id="validation-open-claude" style="margin-top: 6px; font-size: 12px; min-height: 18px;">
                    </div>
                    <div class="ft__smaller" style="margin-top: 8px; color: var(--b3-theme-on-surface);">
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

                <!-- Restart Warning -->
                <div style="margin-top: 16px; padding: 16px; background: var(--b3-theme-warning-lightest); border-left: 4px solid var(--b3-theme-warning); border-radius: 6px;">
                    <div style="display: flex; align-items: start; gap: 12px;">
                        <svg style="width: 20px; height: 20px; flex-shrink: 0; color: var(--b3-theme-warning);"><use xlink:href="#iconInfo"></use></svg>
                        <div style="flex: 1;">
                            <div style="font-weight: 600; font-size: 14px; color: var(--b3-theme-on-surface); margin-bottom: 6px;">
                                重要提示：快捷键修改后需要重启思源笔记
                            </div>
                            <div class="ft__smaller" style="color: var(--b3-theme-on-surface-light); line-height: 1.5;">
                                这是 SiYuan 插件机制的限制，快捷键在插件加载时注册。<br>
                                保存设置后，请关闭并重新启动思源笔记，新快捷键才会生效。
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Format Guide -->
                <div style="margin-top: 12px; padding: 12px; background: var(--b3-theme-surface); border-radius: 4px; border-left: 3px solid var(--b3-theme-primary);">
                    <div class="ft__smaller" style="line-height: 1.6;">
                        <strong>⌨️ 快捷键格式说明：</strong><br>
                        • ⌃ = Ctrl（Windows/Linux）或 ⌘ Command（macOS）<br>
                        • ⌥ = Alt（Windows/Linux）或 ⌥ Option（macOS）<br>
                        • ⇧ = Shift<br>
                        • 示例：⌃⇧Q = ${KeyboardShortcutFormatter.format('⌃⇧Q')}，⌥⇧C = ${KeyboardShortcutFormatter.format('⌥⇧C')}
                    </div>
                </div>
        `;
    }

    /**
     * Get model options HTML for a specific provider
     * Dynamically fetches models from AIProviderFactory.getMetadata()
     */
    static getModelOptionsForProvider(provider: AIProviderType, selectedModel: string): string {
        // Handle custom provider separately (no metadata available)
        if (provider === 'custom') {
            return `<option value="custom-model" ${selectedModel === 'custom-model' ? 'selected' : ''}>Custom Model</option>`;
        }

        try {
            // Get models from provider metadata (single source of truth)
            const metadata = AIProviderFactory.getMetadata(provider);
            const models = metadata.models || [];

            return models
                .map(m => {
                    // Build display label with icons
                    let label = m.displayName;

                    // Add icon prefix based on flags (avoid duplicating if already in displayName)
                    if (!label.startsWith('🌟') && !label.startsWith('⚡') && !label.startsWith('🚀')) {
                        if (m.recommended) {
                            // First recommended gets star, second gets lightning
                            const recommendedCount = models.filter(x => x.recommended).indexOf(m);
                            label = (recommendedCount === 0 ? '🌟 ' : '⚡ ') + label;
                        } else if (m.deprecated) {
                            label = label + ' (旧版)';
                        }
                    }

                    return `<option value="${this.escapeHtml(m.id)}" ${m.id === selectedModel ? 'selected' : ''}>${this.escapeHtml(label)}</option>`;
                })
                .join('');
        } catch (error) {
            console.error(`[SettingsUIBuilder] Failed to get models for ${provider}:`, error);
            // Fallback: return empty or a placeholder
            return `<option value="">加载模型失败</option>`;
        }
    }

    /**
     * Get provider metadata from AIProviderFactory
     * Returns display info (name, icon, URL, defaultBaseURL) for a provider type
     */
    private static getProviderInfo(type: string): { name: string; icon: string; url: string; defaultBaseURL: string } {
        try {
            if (!AIProviderFactory.hasProvider(type)) {
                console.warn(`[SettingsUIBuilder] Provider "${type}" not registered, using fallback`);
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
            console.error(`[SettingsUIBuilder] Failed to get provider info for ${type}:`, error);
            return { name: 'Unknown Provider', icon: '❓', url: '', defaultBaseURL: '' };
        }
    }

    /**
     * Generate provider selector options HTML (dynamic from Factory)
     */
    static getProviderSelectorOptions(activeProvider: string): string {
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
            console.error('[SettingsUIBuilder] Failed to generate provider options:', error);
            return '<option value="">Error loading providers</option>';
        }
    }
}
