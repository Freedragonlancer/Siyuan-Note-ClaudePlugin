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
        const reasoningEffort = providerConfig?.reasoningEffort ?? 'low';

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

                <!-- Reasoning Effort (xAI only) -->
                <div id="reasoning-effort-container" class="setting-item" style="margin-top: 16px; margin-left: 20px; display: ${thinkingMode && activeProvider === 'xai' ? 'block' : 'none'};">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span class="ft__smaller" style="font-weight: 500;">推理强度</span>
                        <select id="reasoning-effort" class="b3-select">
                            <option value="low" ${reasoningEffort === 'low' ? 'selected' : ''}>Low (快速)</option>
                            <option value="high" ${reasoningEffort === 'high' ? 'selected' : ''}>High (深度)</option>
                        </select>
                    </div>
                    <div class="ft__smaller ft__secondary" style="margin-top: 8px;">
                        💡 'low' 快速响应，'high' 深度推理（xAI Grok）
                    </div>
                </div>

                <!-- Provider Support Hint -->
                <div class="ft__smaller ft__secondary" style="margin-top: 12px; padding: 8px; background: var(--b3-card-info-background); border-radius: 4px;">
                    <strong>📌 支持情况：</strong><br>
                    • Anthropic (Claude): Extended Thinking (Sonnet 4+, Opus 4)<br>
                    • Gemini: Thinking Budget (2.5+)<br>
                    • xAI (Grok): Reasoning Effort<br>
                    • Moonshot (Kimi): K2 Thinking 模型<br>
                    • OpenAI/DeepSeek: 通过选择推理模型（o1/o3, deepseek-reasoner）
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

    /**
     * Get model options HTML for a specific provider
     */
    static getModelOptionsForProvider(provider: AIProviderType, selectedModel: string): string {
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
            .map(m => `<option value="${this.escapeHtml(m.value)}" ${m.value === selectedModel ? 'selected' : ''}>${this.escapeHtml(m.label)}</option>`)
            .join('');
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
