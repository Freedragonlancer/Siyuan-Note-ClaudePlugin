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

import type { ClaudeSettings } from "../claude";
import { AVAILABLE_MODELS } from "../claude";
import { ClaudeClient } from "../claude/ClaudeClient";
import type { ConfigManager } from "./ConfigManager";
import type { ConfigProfile } from "./config-types";
import { Dialog } from "siyuan";

export class SettingsPanelV3 {
    private element: HTMLElement;
    private onSave: (settings: Partial<ClaudeSettings>) => void;
    private onOpenPromptEditor: () => void;
    private configManager: ConfigManager;
    private currentProfile: ConfigProfile;
    private testClient: ClaudeClient | null = null;
    private availableModels: { value: string; label: string }[] = AVAILABLE_MODELS;
    private dialog: Dialog | null = null;

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
        container.className = "claude-settings-panel-v3";
        container.style.cssText = "max-height: 70vh; overflow-y: auto; padding: 16px;";

        console.log("[SettingsPanelV3] Current profile:", this.currentProfile);

        const profileSection = this.createProfileManagementSection();
        const connectionSection = this.createConnectionSection();
        const modelSection = this.createModelSection();
        const promptEditorSection = this.createPromptEditorSection();
        const loggingSection = this.createLoggingSection();
        const actionsSection = this.createActionsSection();

        console.log("[SettingsPanelV3] Sections created, profile section length:", profileSection.length);

        container.innerHTML = `
            <div class="b3-dialog__content">
                ${profileSection}
                <div class="fn__hr" style="margin: 20px 0;"></div>
                ${connectionSection}
                <div class="fn__hr" style="margin: 20px 0;"></div>
                ${modelSection}
                <div class="fn__hr" style="margin: 20px 0;"></div>
                ${promptEditorSection}
                <div class="fn__hr" style="margin: 20px 0;"></div>
                ${loggingSection}
                <div class="fn__hr" style="margin: 20px 0;"></div>
                ${actionsSection}
            </div>
        `;

        console.log("[SettingsPanelV3] HTML set, container innerHTML length:", container.innerHTML.length);

        this.attachEventListeners(container);
        console.log("[SettingsPanelV3] Event listeners attached");
        return container;
    }

    //#region HTML Sections

    private createProfileManagementSection(): string {
        const profiles = this.configManager.getAllProfiles();
        const activeProfileId = this.configManager.getActiveProfileId();

        return `
            <div class="settings-section">
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
            </div>
        `;
    }

    private createConnectionSection(): string {
        const settings = this.currentProfile.settings;
        const hasProxy = !!settings.baseURL;

        return `
            <div class="settings-section">
                <div class="section-header" style="margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 15px; font-weight: 500;">
                        🔌 连接设置
                    </h3>
                    <div class="ft__smaller ft__secondary" style="margin-top: 4px;">
                        配置 Claude API 连接方式
                    </div>
                </div>

                <!-- API Provider -->
                <div class="setting-item" style="margin-bottom: 16px;">
                    <div class="setting-label" style="margin-bottom: 8px;">
                        <span style="font-weight: 500;">API 提供商</span>
                    </div>
                    <div class="b3-form__radio" style="margin-bottom: 8px;">
                        <label>
                            <input type="radio" name="api-provider" value="official" ${!hasProxy ? 'checked' : ''}>
                            <span>Anthropic 官方 API</span>
                        </label>
                    </div>
                    <div class="b3-form__radio">
                        <label>
                            <input type="radio" name="api-provider" value="proxy" ${hasProxy ? 'checked' : ''}>
                            <span>自定义反向代理</span>
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
                            id="claude-api-key"
                            placeholder="输入您的 API Key"
                            value="${settings.apiKey || ""}"
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
                    <div class="ft__smaller ft__secondary" style="margin-top: 8px;">
                        📍 获取 API Key: <a href="https://console.anthropic.com/settings/keys" target="_blank" style="color: var(--b3-theme-on-background);">Anthropic 控制台</a>
                    </div>
                </div>

                <!-- Proxy URL -->
                <div class="setting-item" id="proxy-url-section" style="margin-bottom: 16px; ${hasProxy ? '' : 'display: none;'}">
                    <div class="setting-label" style="margin-bottom: 8px;">
                        <span style="font-weight: 500;">反向代理地址</span>
                    </div>
                    <input
                        class="b3-text-field"
                        type="text"
                        id="claude-base-url"
                        placeholder="https://your-proxy.com/v1"
                        value="${settings.baseURL || ""}"
                        style="width: 100%;"
                    >
                    <div class="ft__smaller ft__secondary" style="margin-top: 8px;">
                        💡 支持 OpenAI 兼容的 API 接口
                    </div>
                </div>
            </div>
        `;
    }

    private createModelSection(): string {
        const settings = this.currentProfile.settings;

        return `
            <div class="settings-section">
                <div class="settings-section-header">
                    <h3>
                        🤖 模型设置
                    </h3>
                    <div class="ft__secondary">
                        选择模型并调整参数
                    </div>
                </div>

                <!-- Model Selection -->
                <div class="setting-item">
                    <div class="setting-label">
                        <span>模型</span>
                    </div>
                    <select class="b3-select settings-full-width" id="claude-model">
                        ${this.availableModels.map(m => `
                            <option value="${m.value}" ${m.value === settings.model ? 'selected' : ''}>
                                ${m.label}
                            </option>
                        `).join('')}
                    </select>
                    <div class="ft__smaller ft__secondary" style="margin-top: 8px;" id="model-info">
                        ${this.getModelInfo(settings.model)}
                    </div>
                </div>

                <!-- Max Tokens -->
                <div class="setting-item">
                    <div class="settings-slider-header">
                        <span class="settings-label-weight">最大输出长度</span>
                        <span class="ft__smaller ft__secondary" id="max-tokens-value">${settings.maxTokens} tokens</span>
                    </div>
                    <input
                        type="range"
                        id="claude-max-tokens"
                        min="256"
                        max="8192"
                        step="256"
                        value="${settings.maxTokens}"
                        class="settings-full-width"
                    >
                    <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                        <span class="ft__smaller ft__secondary">256</span>
                        <span class="ft__smaller ft__secondary">8192</span>
                    </div>
                </div>

                <!-- Temperature -->
                <div class="setting-item">
                    <div class="settings-slider-header">
                        <span class="settings-label-weight">Temperature</span>
                        <span class="ft__smaller ft__secondary" id="temperature-value">${settings.temperature}</span>
                    </div>
                    <input
                        type="range"
                        id="claude-temperature"
                        min="0"
                        max="1"
                        step="0.1"
                        value="${settings.temperature}"
                        class="settings-full-width"
                    >
                    <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                        <span class="ft__smaller ft__secondary">保守 (0.0)</span>
                        <span class="ft__smaller ft__secondary">创造 (1.0)</span>
                    </div>
                </div>
            </div>
        `;
    }

    private createPromptEditorSection(): string {
        return `
            <div class="settings-section">
                <div class="section-header" style="margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 15px; font-weight: 500;">
                        📝 提示词设置
                    </h3>
                    <div class="ft__smaller ft__secondary" style="margin-top: 4px;">
                        管理系统提示词、追加提示词、预设模板和AI编辑指令
                    </div>
                </div>

                <div class="setting-item">
                    <button class="b3-button b3-button--outline" id="open-prompt-editor-btn" style="width: 100%; padding: 12px;">
                        <svg style="width: 16px; height: 16px;"><use xlink:href="#iconEdit"></use></svg>
                        <span style="margin-left: 8px; font-weight: 500;">编辑提示词和模板</span>
                    </button>
                    <div class="ft__smaller ft__secondary" style="margin-top: 12px; padding: 8px; background: var(--b3-theme-surface); border-radius: 4px;">
                        💡 在独立面板中编辑：<br>
                        • 系统提示词（定义AI角色）<br>
                        • 追加提示词（自动附加到请求）<br>
                        • 预设模板管理（创建和编辑模板）<br>
                        • AI编辑指令（文本编辑快捷指令）
                    </div>
                </div>
            </div>
        `;
    }

    private createLoggingSection(): string {
        const settings = this.currentProfile.settings;
        const enabled = settings.enableRequestLogging ?? false;
        const logPath = settings.requestLogPath || '';
        const includeResponse = settings.requestLogIncludeResponse ?? true;

        return `
            <div class="settings-section">
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

    private createActionsSection(): string {
        return `
            <div class="settings-flex-between" style="padding-top: 16px;">
                <button class="b3-button b3-button--outline" id="claude-test-connection" style="min-width: 120px;">
                    <svg><use xlink:href="#iconRefresh"></use></svg>
                    <span style="margin-left: 4px;">测试连接</span>
                </button>
                <div class="settings-button-group">
                    <button class="b3-button b3-button--cancel" id="claude-cancel">
                        取消
                    </button>
                    <button class="b3-button b3-button--text" id="claude-save" style="min-width: 100px;">
                        保存设置
                    </button>
                </div>
            </div>
        `;
    }

    //#endregion

    //#region Event Listeners

    private attachEventListeners(container: HTMLElement) {
        // Profile management
        this.attachProfileListeners(container);

        // API Provider toggle
        const providerRadios = container.querySelectorAll('input[name="api-provider"]');
        const proxySection = container.querySelector("#proxy-url-section") as HTMLElement;

        providerRadios.forEach(radio => {
            radio.addEventListener("change", (e) => {
                const value = (e.target as HTMLInputElement).value;
                if (proxySection) {
                    proxySection.style.display = value === "proxy" ? "block" : "none";
                }
            });
        });

        // Toggle API Key visibility
        const toggleKeyBtn = container.querySelector("#toggle-api-key");
        const apiKeyInput = container.querySelector("#claude-api-key") as HTMLInputElement;

        toggleKeyBtn?.addEventListener("click", () => {
            apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
        });

        // Model selection
        const modelSelect = container.querySelector("#claude-model");
        const modelInfo = container.querySelector("#model-info");

        modelSelect?.addEventListener("change", (e) => {
            const value = (e.target as HTMLSelectElement).value;
            if (modelInfo) {
                modelInfo.textContent = this.getModelInfo(value);
            }
        });

        // Max Tokens slider
        const maxTokensSlider = container.querySelector("#claude-max-tokens") as HTMLInputElement;
        const maxTokensValue = container.querySelector("#max-tokens-value");

        maxTokensSlider?.addEventListener("input", (e) => {
            const value = (e.target as HTMLInputElement).value;
            if (maxTokensValue) {
                maxTokensValue.textContent = `${value} tokens`;
            }
        });

        // Temperature slider
        const temperatureSlider = container.querySelector("#claude-temperature") as HTMLInputElement;
        const temperatureValue = container.querySelector("#temperature-value");

        temperatureSlider?.addEventListener("input", (e) => {
            const value = (e.target as HTMLInputElement).value;
            if (temperatureValue) {
                temperatureValue.textContent = value;
            }
        });

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

        // Action buttons
        const saveBtn = container.querySelector("#claude-save");
        const cancelBtn = container.querySelector("#claude-cancel");
        const testBtn = container.querySelector("#claude-test-connection");

        saveBtn?.addEventListener("click", () => this.saveSettings(container));
        cancelBtn?.addEventListener("click", () => this.close());
        testBtn?.addEventListener("click", () => this.testConnection(container));
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

    private saveSettings(container: HTMLElement) {
        const useProxy = (container.querySelector('input[name="api-provider"]:checked') as HTMLInputElement)?.value === "proxy";

        const updates: Partial<ClaudeSettings> = {
            apiKey: (container.querySelector("#claude-api-key") as HTMLInputElement)?.value || "",
            baseURL: useProxy
                ? (container.querySelector("#claude-base-url") as HTMLInputElement)?.value || ""
                : "",
            model: (container.querySelector("#claude-model") as HTMLSelectElement)?.value || this.currentProfile.settings.model,
            maxTokens: parseInt((container.querySelector("#claude-max-tokens") as HTMLInputElement)?.value) || this.currentProfile.settings.maxTokens,
            temperature: parseFloat((container.querySelector("#claude-temperature") as HTMLInputElement)?.value) || this.currentProfile.settings.temperature,
            enableRequestLogging: (container.querySelector("#enable-request-logging") as HTMLInputElement)?.checked ?? false,
            requestLogPath: (container.querySelector("#request-log-path") as HTMLInputElement)?.value || "",
            requestLogIncludeResponse: (container.querySelector("#log-include-response") as HTMLInputElement)?.checked ?? true,
        };

        // Update current profile
        this.configManager.updateProfile(this.currentProfile.id, {
            settings: { ...this.currentProfile.settings, ...updates }
        });

        // Notify parent to save
        this.onSave(updates);

        console.log('[SettingsPanelV3] Settings saved');
        this.close();
    }

    private async testConnection(container: HTMLElement) {
        const testBtn = container.querySelector("#claude-test-connection") as HTMLButtonElement;
        const originalHTML = testBtn.innerHTML;

        try {
            testBtn.disabled = true;
            testBtn.innerHTML = '<svg class="fn__rotate"><use xlink:href="#iconRefresh"></use></svg><span style="margin-left: 4px;">测试中...</span>';

            const useProxy = (container.querySelector('input[name="api-provider"]:checked') as HTMLInputElement)?.value === "proxy";
            const settings: Partial<ClaudeSettings> = {
                apiKey: (container.querySelector("#claude-api-key") as HTMLInputElement)?.value || "",
                baseURL: useProxy
                    ? (container.querySelector("#claude-base-url") as HTMLInputElement)?.value || ""
                    : "",
                model: (container.querySelector("#claude-model") as HTMLSelectElement)?.value,
                maxTokens: this.currentProfile.settings.maxTokens,
                temperature: this.currentProfile.settings.temperature,
                systemPrompt: this.currentProfile.settings.systemPrompt,
                appendedPrompt: this.currentProfile.settings.appendedPrompt,
            };

            if (!settings.apiKey || settings.apiKey.trim() === "") {
                throw new Error("请输入 API Key");
            }

            this.testClient = new ClaudeClient(settings as ClaudeSettings);

            await this.testClient.sendMessageSimple([
                { role: "user", content: "Hi" }
            ]);

            testBtn.innerHTML = '<svg><use xlink:href="#iconCheck"></use></svg><span style="margin-left: 4px;">连接成功</span>';
            setTimeout(() => {
                testBtn.innerHTML = originalHTML;
                testBtn.disabled = false;
            }, 2000);

        } catch (error) {
            testBtn.innerHTML = '<svg><use xlink:href="#iconClose"></use></svg><span style="margin-left: 4px;">连接失败</span>';
            alert(`测试失败: ${error instanceof Error ? error.message : String(error)}`);
            setTimeout(() => {
                testBtn.innerHTML = originalHTML;
                testBtn.disabled = false;
            }, 2000);
        }
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

    //#endregion
}
