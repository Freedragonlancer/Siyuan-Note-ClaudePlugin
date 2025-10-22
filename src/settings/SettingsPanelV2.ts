import type { ClaudeSettings } from "../claude";
import { AVAILABLE_MODELS } from "../claude";
import { ClaudeClient } from "../claude/ClaudeClient";

/**
 * System Prompt Templates
 */
const PROMPT_TEMPLATES = [
    {
        name: "默认助手",
        value: "You are a helpful AI assistant integrated into SiYuan Note. Help users with their notes, writing, and questions.",
    },
    {
        name: "代码助手",
        value: "You are an expert programming assistant. Provide clear, well-commented code examples and explain technical concepts concisely.",
    },
    {
        name: "写作助手",
        value: "You are a professional writing assistant. Help improve clarity, grammar, and style while maintaining the user's voice.",
    },
    {
        name: "翻译助手",
        value: "You are a professional translator. Provide accurate, natural-sounding translations while preserving the original meaning and tone.",
    },
    {
        name: "自定义",
        value: "",
    },
];

/**
 * Improved Settings Panel with Better UX
 */
export class SettingsPanelV2 {
    private element: HTMLElement;
    private onSave: (settings: Partial<ClaudeSettings>) => void;
    private currentSettings: ClaudeSettings;
    private testClient: ClaudeClient | null = null;
    private availableModels: { value: string; label: string }[] = AVAILABLE_MODELS;
    private isLoadingModels = false;

    constructor(settings: ClaudeSettings, onSave: (settings: Partial<ClaudeSettings>) => void) {
        this.currentSettings = settings;
        this.onSave = onSave;
        this.element = this.createPanel();
    }

    private createPanel(): HTMLElement {
        const container = document.createElement("div");
        container.className = "claude-settings-panel-v2";
        container.style.cssText = "max-height: 70vh; overflow-y: auto; padding: 16px;";

        container.innerHTML = `
            <div class="b3-dialog__content">
                ${this.createConnectionSection()}
                <div class="fn__hr" style="margin: 20px 0;"></div>
                ${this.createModelSection()}
                <div class="fn__hr" style="margin: 20px 0;"></div>
                ${this.createSystemPromptSection()}
                <div class="fn__hr" style="margin: 20px 0;"></div>
                ${this.createActionsSection()}
            </div>
        `;

        this.attachEventListeners(container);
        return container;
    }

    private createConnectionSection(): string {
        const hasApiKey = !!this.currentSettings.apiKey;
        const hasProxy = !!this.currentSettings.baseURL;

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
                <div class="setting-item" style="margin-bottom: 16px;">
                    <div class="setting-label" style="margin-bottom: 8px;">
                        <span style="font-weight: 500;">API Key <span style="color: var(--b3-theme-error);">*</span></span>
                        <span class="ft__smaller ft__secondary"> (必填)</span>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <input
                            class="b3-text-field"
                            type="password"
                            id="claude-api-key"
                            placeholder="输入您的 API Key (官方或反代)"
                            value="${this.currentSettings.apiKey || ""}"
                            style="flex: 1;"
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
                        ${hasApiKey
                            ? '✅ API Key 已配置'
                            : '⚠️ 请填写 API Key'}
                        <br>
                        📍 获取 API Key: <a href="https://console.anthropic.com/settings/keys" target="_blank" style="color: var(--b3-theme-on-background);">Anthropic 控制台</a>
                    </div>
                </div>

                <!-- Proxy URL -->
                <div class="setting-item" id="proxy-url-section" style="margin-bottom: 16px; ${hasProxy ? '' : 'display: none;'}">
                    <div class="setting-label" style="margin-bottom: 8px;">
                        <span style="font-weight: 500;">反向代理地址</span>
                        <span class="ft__smaller ft__secondary"> (可选)</span>
                    </div>
                    <input
                        class="b3-text-field"
                        type="text"
                        id="claude-base-url"
                        placeholder="https://your-proxy.com/v1"
                        value="${this.currentSettings.baseURL || ""}"
                        style="width: 100%;"
                    >
                    <div class="ft__smaller ft__secondary" style="margin-top: 8px;">
                        💡 支持 OpenAI 兼容的 API 接口<br>
                        例如: https://api.openai-proxy.com/v1
                    </div>
                </div>
            </div>
        `;
    }

    private createModelSection(): string {
        return `
            <div class="settings-section">
                <div class="section-header" style="margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 15px; font-weight: 500;">
                        🤖 模型设置
                    </h3>
                    <div class="ft__smaller ft__secondary" style="margin-top: 4px;">
                        选择模型并调整参数
                    </div>
                </div>

                <!-- Model Selection -->
                <div class="setting-item" style="margin-bottom: 16px;">
                    <div class="setting-label" style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 500;">模型</span>
                        <button
                            class="b3-button b3-button--text"
                            id="refresh-models-btn"
                            style="padding: 2px 8px; font-size: 12px;"
                            title="从 API 刷新模型列表"
                        >
                            <svg style="width: 14px; height: 14px;"><use xlink:href="#iconRefresh"></use></svg>
                            <span style="margin-left: 4px;">刷新模型</span>
                        </button>
                    </div>
                    <select class="b3-select" id="claude-model" style="width: 100%;">
                        ${this.availableModels.map(m => `
                            <option value="${m.value}" ${m.value === this.currentSettings.model ? 'selected' : ''}>
                                ${m.label}
                            </option>
                        `).join('')}
                    </select>
                    <div class="ft__smaller ft__secondary" style="margin-top: 8px;" id="model-info">
                        ${this.getModelInfo(this.currentSettings.model)}
                    </div>
                </div>

                <!-- Max Tokens -->
                <div class="setting-item" style="margin-bottom: 16px;">
                    <div class="setting-label" style="margin-bottom: 8px; display: flex; justify-content: space-between;">
                        <span style="font-weight: 500;">最大输出长度</span>
                        <span class="ft__smaller ft__secondary" id="max-tokens-value">${this.currentSettings.maxTokens} tokens</span>
                    </div>
                    <input
                        type="range"
                        id="claude-max-tokens"
                        min="256"
                        max="8192"
                        step="256"
                        value="${this.currentSettings.maxTokens}"
                        style="width: 100%;"
                    >
                    <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                        <span class="ft__smaller ft__secondary">256</span>
                        <span class="ft__smaller ft__secondary">8192</span>
                    </div>
                </div>

                <!-- Temperature -->
                <div class="setting-item" style="margin-bottom: 16px;">
                    <div class="setting-label" style="margin-bottom: 8px; display: flex; justify-content: space-between;">
                        <span style="font-weight: 500;">创造性</span>
                        <span class="ft__smaller ft__secondary" id="temperature-value">${this.currentSettings.temperature}</span>
                    </div>
                    <input
                        type="range"
                        id="claude-temperature"
                        min="0"
                        max="1"
                        step="0.1"
                        value="${this.currentSettings.temperature}"
                        style="width: 100%;"
                    >
                    <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                        <span class="ft__smaller ft__secondary">保守 (0.0)</span>
                        <span class="ft__smaller ft__secondary">创造 (1.0)</span>
                    </div>
                </div>
            </div>
        `;
    }

    private createSystemPromptSection(): string {
        const selectedTemplate = PROMPT_TEMPLATES.find(t =>
            t.value === this.currentSettings.systemPrompt
        )?.name || "自定义";

        return `
            <div class="settings-section">
                <div class="section-header" style="margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 15px; font-weight: 500;">
                        📝 系统提示词
                    </h3>
                    <div class="ft__smaller ft__secondary" style="margin-top: 4px;">
                        自定义 Claude 的行为和角色
                    </div>
                </div>

                <!-- Template Selection -->
                <div class="setting-item" style="margin-bottom: 16px;">
                    <div class="setting-label" style="margin-bottom: 8px;">
                        <span style="font-weight: 500;">使用预设模板</span>
                    </div>
                    <select class="b3-select" id="prompt-template" style="width: 100%;">
                        ${PROMPT_TEMPLATES.map(t => `
                            <option value="${t.name}" ${t.name === selectedTemplate ? 'selected' : ''}>
                                ${t.name}
                            </option>
                        `).join('')}
                    </select>
                </div>

                <!-- Custom Prompt -->
                <div class="setting-item">
                    <div class="setting-label" style="margin-bottom: 8px;">
                        <span style="font-weight: 500;">自定义指令</span>
                    </div>
                    <textarea
                        class="b3-text-field"
                        id="claude-system-prompt"
                        rows="4"
                        placeholder="描述 Claude 应该如何回应..."
                        style="width: 100%; resize: vertical;"
                    >${this.currentSettings.systemPrompt}</textarea>
                    <div class="ft__smaller ft__secondary" style="margin-top: 8px;">
                        💡 提示: 清晰具体的指令能获得更好的回应
                    </div>
                </div>
            </div>
        `;
    }

    private createActionsSection(): string {
        return `
            <div class="settings-actions" style="display: flex; justify-content: space-between; align-items: center; padding-top: 16px;">
                <button class="b3-button b3-button--outline" id="claude-test-connection" style="min-width: 120px;">
                    <svg><use xlink:href="#iconRefresh"></use></svg>
                    <span style="margin-left: 4px;">测试连接</span>
                </button>
                <div style="display: flex; gap: 8px;">
                    <button class="b3-button b3-button--cancel" id="claude-cancel">
                        取消
                    </button>
                    <button class="b3-button b3-button--text" id="claude-save" style="min-width: 100px;">
                        💾 保存设置
                    </button>
                </div>
            </div>
        `;
    }

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

    private attachEventListeners(container: HTMLElement) {
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

        // Prompt template selection
        const templateSelect = container.querySelector("#prompt-template");
        const systemPromptTextarea = container.querySelector("#claude-system-prompt") as HTMLTextAreaElement;

        templateSelect?.addEventListener("change", (e) => {
            const templateName = (e.target as HTMLSelectElement).value;
            const template = PROMPT_TEMPLATES.find(t => t.name === templateName);
            if (template && systemPromptTextarea) {
                if (template.name !== "自定义") {
                    systemPromptTextarea.value = template.value;
                }
            }
        });

        // Refresh models button
        const refreshModelsBtn = container.querySelector("#refresh-models-btn");
        refreshModelsBtn?.addEventListener("click", () => {
            this.refreshModelsList(container);
        });

        // Buttons
        const saveBtn = container.querySelector("#claude-save");
        const cancelBtn = container.querySelector("#claude-cancel");
        const testBtn = container.querySelector("#claude-test-connection");

        saveBtn?.addEventListener("click", () => {
            const settings = this.collectSettings(container);
            this.onSave(settings);
        });

        cancelBtn?.addEventListener("click", () => {
            this.close();
        });

        testBtn?.addEventListener("click", () => {
            this.testConnection(container);
        });
    }

    private collectSettings(container: HTMLElement): Partial<ClaudeSettings> {
        const useProxy = (container.querySelector('input[name="api-provider"]:checked') as HTMLInputElement)?.value === "proxy";

        return {
            apiKey: (container.querySelector("#claude-api-key") as HTMLInputElement)?.value || "",
            baseURL: useProxy
                ? (container.querySelector("#claude-base-url") as HTMLInputElement)?.value || ""
                : "",
            model: (container.querySelector("#claude-model") as HTMLSelectElement)?.value || this.currentSettings.model,
            maxTokens: parseInt((container.querySelector("#claude-max-tokens") as HTMLInputElement)?.value) || this.currentSettings.maxTokens,
            temperature: parseFloat((container.querySelector("#claude-temperature") as HTMLInputElement)?.value) || this.currentSettings.temperature,
            systemPrompt: (container.querySelector("#claude-system-prompt") as HTMLTextAreaElement)?.value || this.currentSettings.systemPrompt,
        };
    }

    private async testConnection(container: HTMLElement) {
        const testBtn = container.querySelector("#claude-test-connection") as HTMLButtonElement;
        const originalHTML = testBtn.innerHTML;

        try {
            testBtn.disabled = true;
            testBtn.innerHTML = '<svg class="fn__rotate"><use xlink:href="#iconRefresh"></use></svg><span style="margin-left: 4px;">测试中...</span>';

            const settings = this.collectSettings(container);

            // Validate API key exists
            if (!settings.apiKey || settings.apiKey.trim() === "") {
                throw new Error("请输入 API Key");
            }

            // Create test client
            this.testClient = new ClaudeClient(settings as ClaudeSettings);

            // Test with a simple message
            await this.testClient.sendMessageSimple([
                { role: "user", content: "Hi" }
            ]);

            testBtn.innerHTML = '<svg><use xlink:href="#iconCheck"></use></svg><span style="margin-left: 4px; color: var(--b3-theme-primary);">✓ 连接成功</span>';

            setTimeout(() => {
                testBtn.innerHTML = originalHTML;
                testBtn.disabled = false;
            }, 2000);
        } catch (error) {
            testBtn.innerHTML = '<svg><use xlink:href="#iconClose"></use></svg><span style="margin-left: 4px; color: var(--b3-theme-error);">✗ 连接失败</span>';

            const errorMessage = error instanceof Error ? error.message : String(error);

            // Show detailed error
            const errorDialog = document.createElement("div");
            errorDialog.className = "b3-dialog__content";
            errorDialog.style.cssText = "margin-top: 8px; padding: 12px; background: var(--b3-theme-error-lighter); border-radius: 4px;";
            errorDialog.innerHTML = `
                <div class="ft__smaller" style="color: var(--b3-theme-error);">
                    <strong>错误详情:</strong><br>
                    ${errorMessage}
                    <br><br>
                    <strong>常见解决方案:</strong><br>
                    • 检查 API Key 是否正确<br>
                    • 确认代理地址可访问<br>
                    • 检查网络连接<br>
                    • 查看控制台了解更多信息
                </div>
            `;

            const existingError = container.querySelector(".error-message");
            if (existingError) {
                existingError.remove();
            }

            errorDialog.className += " error-message";
            testBtn.parentElement?.appendChild(errorDialog);

            setTimeout(() => {
                testBtn.innerHTML = originalHTML;
                testBtn.disabled = false;
                errorDialog.remove();
            }, 5000);
        }
    }

    getElement(): HTMLElement {
        return this.element;
    }

    private close() {
        // Find and close the dialog
        const dialog = this.element.closest(".b3-dialog");
        if (dialog) {
            dialog.remove();
        }
    }

    private async refreshModelsList(container: HTMLElement) {
        if (this.isLoadingModels) {
            return; // Prevent concurrent requests
        }

        const refreshBtn = container.querySelector("#refresh-models-btn") as HTMLButtonElement;
        const modelSelect = container.querySelector("#claude-model") as HTMLSelectElement;
        const currentValue = modelSelect?.value;

        if (!refreshBtn || !modelSelect) return;

        try {
            this.isLoadingModels = true;
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<svg class="fn__rotate"><use xlink:href="#iconRefresh"></use></svg><span style="margin-left: 4px;">加载中...</span>';

            // Get current settings to create a client
            const settings = this.collectSettings(container);

            // Validate API key exists
            if (!settings.apiKey || settings.apiKey.trim() === "") {
                throw new Error("请先输入 API Key");
            }

            // Create a temporary client to fetch models
            const tempClient = new ClaudeClient(settings as ClaudeSettings);
            const modelIds = await tempClient.listModels();

            // Filter to only Claude models and create model list with better labels
            const claudeModels = modelIds
                .filter(id => id.startsWith('claude-'))
                .map(id => ({
                    value: id,
                    label: this.formatModelLabel(id)
                }));

            if (claudeModels.length === 0) {
                throw new Error("未找到可用的 Claude 模型");
            }

            // Update available models
            this.availableModels = claudeModels;

            // Rebuild select options
            modelSelect.innerHTML = claudeModels.map(m => `
                <option value="${m.value}" ${m.value === currentValue ? 'selected' : ''}>
                    ${m.label}
                </option>
            `).join('');

            // If current model is not in the list, select the first one
            if (!claudeModels.find(m => m.value === currentValue)) {
                modelSelect.value = claudeModels[0].value;
            }

            // Show success message
            refreshBtn.innerHTML = '<svg><use xlink:href="#iconCheck"></use></svg><span style="margin-left: 4px;">已更新 (' + claudeModels.length + ')</span>';
            setTimeout(() => {
                refreshBtn.innerHTML = '<svg style="width: 14px; height: 14px;"><use xlink:href="#iconRefresh"></use></svg><span style="margin-left: 4px;">刷新模型</span>';
                refreshBtn.disabled = false;
            }, 2000);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            refreshBtn.innerHTML = '<svg><use xlink:href="#iconClose"></use></svg><span style="margin-left: 4px;">失败</span>';

            // Show error notification
            console.error("Failed to refresh models:", error);
            alert("刷新模型列表失败:\n" + errorMessage);

            setTimeout(() => {
                refreshBtn.innerHTML = '<svg style="width: 14px; height: 14px;"><use xlink:href="#iconRefresh"></use></svg><span style="margin-left: 4px;">刷新模型</span>';
                refreshBtn.disabled = false;
            }, 2000);
        } finally {
            this.isLoadingModels = false;
        }
    }

    private formatModelLabel(modelId: string): string {
        // Extract version and model name from ID
        const idLower = modelId.toLowerCase();

        if (idLower.includes('sonnet-4-5')) return 'Claude Sonnet 4.5 (Latest, Recommended)';
        if (idLower.includes('sonnet-4')) return 'Claude Sonnet 4';
        if (idLower.includes('opus-4-1')) return 'Claude Opus 4.1';
        if (idLower.includes('opus-4')) return 'Claude Opus 4 (Most Capable)';
        if (idLower.includes('3-7-sonnet')) return 'Claude 3.7 Sonnet';
        if (idLower.includes('3-5-sonnet')) return 'Claude 3.5 Sonnet';
        if (idLower.includes('3-5-haiku')) return 'Claude 3.5 Haiku (Fast)';
        if (idLower.includes('3-opus')) return 'Claude 3 Opus';
        if (idLower.includes('3-sonnet')) return 'Claude 3 Sonnet';
        if (idLower.includes('3-haiku')) return 'Claude 3 Haiku';

        // Default: capitalize and format
        return modelId.split('-').map(part =>
            part.charAt(0).toUpperCase() + part.slice(1)
        ).join(' ');
    }

    destroy() {
        this.element.remove();
    }
}
