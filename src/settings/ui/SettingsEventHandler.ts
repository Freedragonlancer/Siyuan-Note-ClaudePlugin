/**
 * Settings Event Handler - Event Coordination Module
 *
 * Handles all event listeners and user interactions for settings panel:
 * - Navigation sidebar clicks
 * - Provider selector changes
 * - Parameter slider updates
 * - Keyboard shortcuts management
 * - Logging configuration changes
 *
 * Separated from SettingsPanelV3 as part of architectural refactoring (Task 1.1).
 *
 * @module SettingsEventHandler
 * @see SettingsPanelV3
 */

import type { MultiProviderSettings, ProviderConfig } from "../../claude";
import type { ConfigProfile } from "../config-types";
import type { AIProviderType } from "../../ai/types";
import { AIProviderFactory } from "../../ai/AIProviderFactory";
import { KeyboardShortcutFormatter } from "../../utils/KeyboardShortcutFormatter";
import { KeyboardRecorder } from "../../utils/KeyboardRecorder";
import { ShortcutValidator } from "../../utils/ShortcutValidator";
import { SettingsUIBuilder } from "./SettingsUIBuilder";
import { ProfileManager } from "../managers/ProfileManager";
import { SettingsPersistence } from "../managers/SettingsPersistence";

/**
 * Callbacks for event handling
 */
export interface EventHandlerCallbacks {
    onProfileChanged: (profile: ConfigProfile) => void;
    onOpenPromptEditor: () => void;
    onSave: () => void;
}

/**
 * Manager class for settings event handling
 */
export class SettingsEventHandler {
    private profileManager: ProfileManager;
    private settingsPersistence: SettingsPersistence;
    private currentProfile: ConfigProfile;
    private shortcutValidator: ShortcutValidator;
    private currentRecorder: KeyboardRecorder | null = null;

    constructor(
        profileManager: ProfileManager,
        settingsPersistence: SettingsPersistence,
        currentProfile: ConfigProfile
    ) {
        this.profileManager = profileManager;
        this.settingsPersistence = settingsPersistence;
        this.currentProfile = currentProfile;
        this.shortcutValidator = new ShortcutValidator();
    }

    /**
     * Update current profile reference (called when profile changes)
     */
    setCurrentProfile(profile: ConfigProfile): void {
        this.currentProfile = profile;
    }

    /**
     * Attach all event listeners to container
     */
    attachEventListeners(container: HTMLElement, callbacks: EventHandlerCallbacks): void {
        // Navigation sidebar
        this.attachNavigationListeners(container);

        // Profile management
        this.attachProfileListeners(container, callbacks);

        // AI Provider and connection settings
        this.attachProviderListeners(container, callbacks);

        // Parameter sliders
        this.attachParameterListeners(container);

        // Thinking mode (v0.13.0)
        this.attachThinkingModeListeners(container);

        // Prompt editor
        this.attachPromptEditorListeners(container, callbacks);

        // Logging configuration
        this.attachLoggingListeners(container);

        // Keyboard shortcuts
        this.attachKeyboardShortcutListeners(container);

        // Test connection
        this.attachTestConnectionListener(container);
    }

    /**
     * Attach navigation sidebar event listeners
     */
    private attachNavigationListeners(container: HTMLElement): void {
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

    /**
     * Attach profile management event listeners
     */
    private attachProfileListeners(container: HTMLElement, callbacks: EventHandlerCallbacks): void {
        // Profile selector
        const profileSelector = container.querySelector("#profile-selector") as HTMLSelectElement;
        profileSelector?.addEventListener("change", (e) => {
            const newProfileId = (e.target as HTMLSelectElement).value;
            this.profileManager.switchProfile(newProfileId, container, (profile) => {
                this.currentProfile = profile;
                callbacks.onProfileChanged(profile);
            });
        });

        // New profile
        container.querySelector("#new-profile-btn")?.addEventListener("click", () => {
            this.profileManager.createNewProfile(this.currentProfile, container, (profile) => {
                this.currentProfile = profile;
                callbacks.onProfileChanged(profile);
            });
        });

        // Duplicate profile
        container.querySelector("#duplicate-profile-btn")?.addEventListener("click", () => {
            this.profileManager.duplicateCurrentProfile(this.currentProfile, container);
        });

        // Rename profile
        container.querySelector("#rename-profile-btn")?.addEventListener("click", () => {
            this.profileManager.renameCurrentProfile(this.currentProfile, container, (profile) => {
                this.currentProfile = profile;
                callbacks.onProfileChanged(profile);
            });
        });

        // Delete profile
        container.querySelector("#delete-profile-btn")?.addEventListener("click", () => {
            this.profileManager.deleteCurrentProfile(this.currentProfile, container, (profile) => {
                this.currentProfile = profile;
                callbacks.onProfileChanged(profile);
            });
        });

        // Import profile
        container.querySelector("#import-profile-btn")?.addEventListener("click", () => {
            this.profileManager.importProfile(container);
        });

        // Export profile
        container.querySelector("#export-profile-btn")?.addEventListener("click", () => {
            this.profileManager.exportCurrentProfile(this.currentProfile);
        });
    }

    /**
     * Attach AI provider and connection setting listeners
     */
    private attachProviderListeners(container: HTMLElement, callbacks: EventHandlerCallbacks): void {
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
                modelSelect.innerHTML = SettingsUIBuilder.getModelOptionsForProvider(selectedProvider, providerConfig?.model || '');
            }

            // Get provider info dynamically from Factory
            const currentInfo = this.getProviderInfo(selectedProvider);

            // Update official API endpoint text label
            const officialRadioLabel = officialRadio?.parentElement?.querySelector('span');
            if (officialRadioLabel) {
                officialRadioLabel.textContent = `官方 API (${currentInfo.defaultBaseURL})`;
            }

            // Update API key help text
            if (apiKeyHelp && currentInfo.url) {
                apiKeyHelp.innerHTML = `📍 获取 API Key: <a href="${currentInfo.url}" target="_blank" style="color: var(--b3-theme-on-background);">${currentInfo.name} 控制台</a>`;
            }

            // Update "测试连接" button help text
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

            // v0.13.0: Update thinking mode controls when switching providers
            this.updateThinkingModeControls(container, selectedProvider, providerConfig);

            // Auto-save provider selection
            callbacks.onSave();

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
    }

    /**
     * Attach parameter slider event listeners
     */
    private attachParameterListeners(container: HTMLElement): void {
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
    }

    /**
     * Attach thinking mode event listeners (v0.13.0)
     */
    private attachThinkingModeListeners(container: HTMLElement): void {
        const thinkingModeToggle = container.querySelector("#thinking-mode-toggle") as HTMLInputElement;
        const thinkingBudgetContainer = container.querySelector("#thinking-budget-container") as HTMLElement;
        const reasoningEffortContainer = container.querySelector("#reasoning-effort-container") as HTMLElement;

        thinkingModeToggle?.addEventListener("change", (e) => {
            const enabled = (e.target as HTMLInputElement).checked;
            const activeProvider = (container.querySelector("#ai-provider-selector") as HTMLSelectElement)?.value || 'anthropic';

            // Show/hide provider-specific controls
            if (thinkingBudgetContainer) {
                thinkingBudgetContainer.style.display = enabled && (activeProvider === 'anthropic' || activeProvider === 'gemini') ? 'block' : 'none';
            }
            if (reasoningEffortContainer) {
                reasoningEffortContainer.style.display = enabled && activeProvider === 'xai' ? 'block' : 'none';
            }
        });

        // Thinking Budget Slider
        const thinkingBudgetSlider = container.querySelector("#thinking-budget") as HTMLInputElement;
        const thinkingBudgetValue = container.querySelector("#thinking-budget-value");

        thinkingBudgetSlider?.addEventListener("input", (e) => {
            const value = (e.target as HTMLInputElement).value;
            if (thinkingBudgetValue) {
                thinkingBudgetValue.textContent = `${value} tokens`;
            }
        });
    }

    /**
     * Update thinking mode controls when provider changes (v0.13.0)
     */
    private updateThinkingModeControls(container: HTMLElement, selectedProvider: AIProviderType, providerConfig: ProviderConfig | undefined): void {
        const thinkingModeToggle = container.querySelector("#thinking-mode-toggle") as HTMLInputElement;
        const thinkingBudgetSlider = container.querySelector("#thinking-budget") as HTMLInputElement;
        const thinkingBudgetValue = container.querySelector("#thinking-budget-value");
        const reasoningEffortSelect = container.querySelector("#reasoning-effort") as HTMLSelectElement;
        const thinkingBudgetContainer = container.querySelector("#thinking-budget-container") as HTMLElement;
        const reasoningEffortContainer = container.querySelector("#reasoning-effort-container") as HTMLElement;

        if (providerConfig) {
            // Update thinking mode toggle
            if (thinkingModeToggle) {
                thinkingModeToggle.checked = providerConfig.thinkingMode ?? false;
            }

            // Update thinking budget
            const budget = providerConfig.thinkingBudget ?? 10000;
            if (thinkingBudgetSlider) {
                thinkingBudgetSlider.value = String(budget);
            }
            if (thinkingBudgetValue) {
                thinkingBudgetValue.textContent = `${budget} tokens`;
            }

            // Update reasoning effort
            if (reasoningEffortSelect) {
                reasoningEffortSelect.value = providerConfig.reasoningEffort ?? 'low';
            }

            // Show/hide provider-specific controls
            const thinkingEnabled = providerConfig.thinkingMode ?? false;
            if (thinkingBudgetContainer) {
                thinkingBudgetContainer.style.display = thinkingEnabled && (selectedProvider === 'anthropic' || selectedProvider === 'gemini') ? 'block' : 'none';
            }
            if (reasoningEffortContainer) {
                reasoningEffortContainer.style.display = thinkingEnabled && selectedProvider === 'xai' ? 'block' : 'none';
            }
        }
    }

    /**
     * Attach prompt editor event listeners
     */
    private attachPromptEditorListeners(container: HTMLElement, callbacks: EventHandlerCallbacks): void {
        const openPromptEditorBtn = container.querySelector("#open-prompt-editor-btn");
        openPromptEditorBtn?.addEventListener("click", () => {
            callbacks.onOpenPromptEditor();
        });
    }

    /**
     * Attach logging configuration event listeners
     */
    private attachLoggingListeners(container: HTMLElement): void {
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
    }

    /**
     * Attach keyboard shortcut event listeners
     */
    private attachKeyboardShortcutListeners(container: HTMLElement): void {
        if (!container) {
            console.error('[SettingsEventHandler] Container is null in attachKeyboardShortcutListeners');
            return;
        }

        try {
            // 为所有录制按钮绑定事件
            const recordButtons = container.querySelectorAll('.shortcut-record-btn');
            recordButtons.forEach((btn) => {
                const button = btn as HTMLButtonElement;
                const shortcutName = button.dataset.shortcutName;
                if (!shortcutName) return;

                button.addEventListener('click', () => {
                    this.startRecording(button, shortcutName, container);
                });
            });

            // 恢复默认快捷键按钮
            const restoreDefaultShortcutsBtn = container.querySelector("#restore-default-shortcuts");
            restoreDefaultShortcutsBtn?.addEventListener("click", () => {
                const shortcuts = [
                    { name: 'quickEdit', default: '⌃⇧Q' },
                    { name: 'undoAIEdit', default: '⌃⇧Z' },
                    { name: 'openClaude', default: '⌥⇧C' }
                ];

                shortcuts.forEach(({ name, default: defaultShortcut }) => {
                    const input = container.querySelector(`#shortcut-${this.toKebabCase(name)}`) as HTMLInputElement;
                    if (input) {
                        input.value = KeyboardShortcutFormatter.format(defaultShortcut);
                        // 验证默认快捷键
                        this.validateShortcut(name, defaultShortcut, container);
                    }
                });
            });

            // 初始验证所有快捷键（延迟执行）
            this.validateAllShortcuts(container);
        } catch (error) {
            console.error('[SettingsEventHandler] Error attaching keyboard shortcut listeners:', error);
        }
    }

    /**
     * 开始录制快捷键
     */
    private startRecording(button: HTMLButtonElement, shortcutName: string, container: HTMLElement): void {
        if (!button || !shortcutName || !container) {
            console.error('[SettingsEventHandler] Invalid parameters for startRecording');
            return;
        }

        try {
            // 停止之前的录制（如果有）
            if (this.currentRecorder) {
                this.currentRecorder.stopRecording();
            }

            const inputId = `shortcut-${this.toKebabCase(shortcutName)}`;
            const input = container.querySelector(`#${inputId}`) as HTMLInputElement;
            const validationHint = container.querySelector(`#validation-${this.toKebabCase(shortcutName)}`) as HTMLElement;

            if (!input || !validationHint) {
                console.warn('[SettingsEventHandler] Cannot find input or validation hint element');
                return;
            }

            // 更新按钮状态
            button.textContent = '⏹ 按下快捷键...';
            button.classList.add('recording');
            button.disabled = true;

            // 创建录制器
            this.currentRecorder = new KeyboardRecorder({
                onPreview: (preview) => {
                    // 实时显示预览
                    input.value = preview;
                    validationHint.innerHTML = '<span style="color: #666;">⏺️ 录制中...</span>';
                },
                onRecorded: (shortcut) => {
                    // 录制完成
                    input.value = shortcut;

                    // 验证快捷键
                    this.validateShortcut(shortcutName, shortcut, container);

                    // 重置按钮状态
                    button.textContent = '🎤 录制';
                    button.classList.remove('recording');
                    button.disabled = false;
                },
                onStateChange: (state) => {
                    if (state === 'idle') {
                        button.textContent = '🎤 录制';
                        button.classList.remove('recording');
                        button.disabled = false;
                    }
                }
            });

            // 开始录制
            this.currentRecorder.startRecording();

            // 5秒后自动停止（防止用户忘记）
            setTimeout(() => {
                if (this.currentRecorder && this.currentRecorder.getState() === 'recording') {
                    this.currentRecorder.stopRecording();
                    validationHint.innerHTML = '<span style="color: #f5a623;">⚠️ 录制超时，请重新录制</span>';
                }
            }, 5000);
        } catch (error) {
            console.error('[SettingsEventHandler] Error starting recording:', error);
            // 恢复按钮状态
            button.textContent = '🎤 录制';
            button.classList.remove('recording');
            button.disabled = false;
        }
    }

    /**
     * 验证单个快捷键
     */
    private validateShortcut(shortcutName: string, shortcut: string, container: HTMLElement): void {
        // 安全检查
        if (!container || !shortcutName || !shortcut) {
            return;
        }

        const validationHint = container.querySelector(`#validation-${this.toKebabCase(shortcutName)}`) as HTMLElement;
        if (!validationHint) {
            // 验证提示元素不存在，可能 DOM 还未渲染完成
            return;
        }

        try {
            // 转换为 Mac 格式（用于验证）
            const macFormat = KeyboardShortcutFormatter.toMacFormat(shortcut);

            // 更新验证器的快捷键列表（用于冲突检测）
            const shortcuts = this.getCurrentShortcuts(container);
            this.shortcutValidator.setPluginShortcuts(shortcuts);

            // 执行验证
            const result = this.shortcutValidator.validate(shortcut, shortcutName);

            // 显示验证结果
            if (result.valid) {
                validationHint.innerHTML = '<span style="color: #52c41a;">✓ 快捷键可用</span>';
            } else {
                if (result.type === 'conflict') {
                    const suggestions = result.suggestions?.length
                        ? `<br><span style="font-size: 11px;">建议：${result.suggestions.slice(0, 2).join('、')}</span>`
                        : '';
                    validationHint.innerHTML = `<span style="color: #f5a623;">⚠️ ${result.message}${suggestions}</span>`;
                } else {
                    // 格式错误
                    validationHint.innerHTML = `<span style="color: #ff4d4f;">✗ ${result.message}</span>`;
                }
            }
        } catch (error) {
            console.error('[SettingsEventHandler] Error validating shortcut:', error);
            // 静默失败，不影响其他功能
        }
    }

    /**
     * 验证所有快捷键（初始化时调用）
     */
    private validateAllShortcuts(container: HTMLElement): void {
        if (!container) {
            return;
        }

        // 延迟执行，确保 DOM 完全渲染
        setTimeout(() => {
            try {
                const shortcuts = [
                    { name: 'quickEdit', inputId: 'shortcut-quick-edit' },
                    { name: 'undoAIEdit', inputId: 'shortcut-undo-ai-edit' },
                    { name: 'openClaude', inputId: 'shortcut-open-claude' }
                ];

                shortcuts.forEach(({ name, inputId }) => {
                    const input = container.querySelector(`#${inputId}`) as HTMLInputElement;
                    if (input && input.value && input.value.trim() !== '') {
                        this.validateShortcut(name, input.value, container);
                    }
                });
            } catch (error) {
                console.error('[SettingsEventHandler] Error validating all shortcuts:', error);
            }
        }, 100); // 延迟 100ms 确保 DOM 渲染完成
    }

    /**
     * 获取当前所有快捷键
     */
    private getCurrentShortcuts(container: HTMLElement): Record<string, string> {
        const quickEditInput = container.querySelector("#shortcut-quick-edit") as HTMLInputElement;
        const undoAIEditInput = container.querySelector("#shortcut-undo-ai-edit") as HTMLInputElement;
        const openClaudeInput = container.querySelector("#shortcut-open-claude") as HTMLInputElement;

        return {
            quickEdit: quickEditInput?.value || '',
            undoAIEdit: undoAIEditInput?.value || '',
            openClaude: openClaudeInput?.value || ''
        };
    }

    /**
     * 转换驼峰命名为短横线命名
     */
    private toKebabCase(str: string): string {
        return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    }

    /**
     * Attach test connection button listener
     */
    private attachTestConnectionListener(container: HTMLElement): void {
        const testBtn = container.querySelector("#test-provider-connection");
        testBtn?.addEventListener("click", () => {
            this.settingsPersistence.testConnection(this.currentProfile, container);
        });
    }

    /**
     * Update parameter slider limits based on selected provider
     * Auto-clamps values if they exceed new limits
     */
    private updateProviderParameterLimits(provider: AIProviderType, container: HTMLElement): void {
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
                console.warn('[SettingsEventHandler] Parameter sliders not found');
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
                console.log(`[SettingsEventHandler] Auto-clamped maxTokens from ${maxTokensSlider.value} to ${currentMaxTokens} for ${provider}`);
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
                console.log(`[SettingsEventHandler] Auto-clamped temperature from ${temperatureSlider.value} to ${currentTemp} for ${provider}`);
            }
            if (currentTemp < tempLimits.min) {
                currentTemp = tempLimits.min;
                temperatureSlider.value = String(currentTemp);
            }

            // Update temperature display
            if (temperatureValue) temperatureValue.textContent = currentTemp.toFixed(1);

            console.log(`[SettingsEventHandler] Updated parameter limits for ${provider}: maxTokens [${tokenLimits.min}-${tokenLimits.max}], temperature [${tempLimits.min}-${tempLimits.max}]`);

        } catch (error) {
            console.error(`[SettingsEventHandler] Failed to update parameter limits for ${provider}:`, error);
        }
    }

    /**
     * Get provider info from AIProviderFactory
     */
    private getProviderInfo(type: string): { name: string; icon: string; url: string; defaultBaseURL: string } {
        try {
            if (!AIProviderFactory.hasProvider(type)) {
                console.warn(`[SettingsEventHandler] Provider "${type}" not registered, using fallback`);
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
            console.error(`[SettingsEventHandler] Failed to get provider info for ${type}:`, error);
            return { name: 'Unknown Provider', icon: '❓', url: '', defaultBaseURL: '' };
        }
    }
}
