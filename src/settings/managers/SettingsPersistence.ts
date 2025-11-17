/**
 * Settings Persistence - Save/Load/Test Module
 *
 * Handles persistence operations for settings:
 * - Saving settings to ConfigManager
 * - Testing provider connections
 * - Reading and validating user input
 *
 * Separated from SettingsPanelV3 as part of architectural refactoring (Task 1.1).
 *
 * @module SettingsPersistence
 * @see SettingsPanelV3
 */

import type { ClaudeSettings, MultiProviderSettings, ProviderConfig } from "../../claude";
import type { ConfigManager } from "../ConfigManager";
import type { ConfigProfile } from "../config-types";
import type { AIProviderType } from "../../ai/types";
import { UniversalAIClient } from "../../claude/UniversalAIClient";
import { KeyboardShortcutFormatter } from "../../utils/KeyboardShortcutFormatter";

/**
 * Manager class for settings persistence operations
 */
export class SettingsPersistence {
    private configManager: ConfigManager;
    private testClient: UniversalAIClient | null = null;

    constructor(configManager: ConfigManager) {
        this.configManager = configManager;
    }

    /**
     * Save settings from UI to ConfigManager
     *
     * @param currentProfile - Current active profile
     * @param container - Settings panel container element
     * @param onSave - Callback to notify parent of settings change
     * @returns Updated settings partial
     */
    saveSettings(
        currentProfile: ConfigProfile,
        container: HTMLElement,
        onSave: (settings: Partial<ClaudeSettings>) => void
    ): Partial<MultiProviderSettings> {
        const settings = currentProfile.settings as MultiProviderSettings;
        const activeProvider = (container.querySelector("#ai-provider-selector") as HTMLSelectElement)?.value as AIProviderType || 'anthropic';
        const useCustomEndpoint = (container.querySelector('input[name="api-endpoint-type"]:checked') as HTMLInputElement)?.value === "custom";

        // Read provider-specific parameters
        const providerMaxTokens = parseInt((container.querySelector("#provider-max-tokens") as HTMLInputElement)?.value) || 4096;
        const providerTemperature = parseFloat((container.querySelector("#provider-temperature") as HTMLInputElement)?.value) || 0.7;

        // v0.13.0: Read thinking/reasoning mode parameters
        const thinkingMode = (container.querySelector("#thinking-mode-toggle") as HTMLInputElement)?.checked ?? false;
        const thinkingBudget = parseInt((container.querySelector("#thinking-budget") as HTMLInputElement)?.value) || 10000;
        const reasoningEffort = (container.querySelector("#reasoning-effort") as HTMLSelectElement)?.value as 'low' | 'high' || 'low';

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

            // v0.13.0: Thinking/Reasoning mode parameters
            thinkingMode: thinkingMode,
            thinkingBudget: thinkingBudget,
            reasoningEffort: reasoningEffort,
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
        this.configManager.updateProfile(currentProfile.id, {
            settings: { ...currentProfile.settings, ...updates }
        });

        // Notify parent to save
        onSave(updates);

        console.log('[SettingsPersistence] Settings saved, active provider:', activeProvider);

        return updates;
    }

    /**
     * Test connection to AI provider
     *
     * @param currentProfile - Current active profile
     * @param container - Settings panel container element
     */
    async testConnection(currentProfile: ConfigProfile, container: HTMLElement): Promise<void> {
        const testBtn = container.querySelector("#test-provider-connection") as HTMLButtonElement;
        const originalHTML = testBtn.innerHTML;

        try {
            testBtn.disabled = true;
            testBtn.innerHTML = '<svg class="fn__rotate"><use xlink:href="#iconRefresh"></use></svg><span style="margin-left: 4px;">测试中...</span>';

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
                ...currentProfile.settings,
                activeProvider,
                providers: {
                    ...currentProfile.settings.providers,
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
}
