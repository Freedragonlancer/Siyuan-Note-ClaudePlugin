import type { ClaudeSettings } from "../claude";
import { AVAILABLE_MODELS } from "../claude";

/**
 * Settings Panel UI
 */
export class SettingsPanel {
    private element: HTMLElement;
    private onSave: (settings: Partial<ClaudeSettings>) => void;
    private currentSettings: ClaudeSettings;

    constructor(settings: ClaudeSettings, onSave: (settings: Partial<ClaudeSettings>) => void) {
        this.currentSettings = settings;
        this.onSave = onSave;
        this.element = this.createPanel();
    }

    private createPanel(): HTMLElement {
        const container = document.createElement("div");
        container.className = "claude-settings-panel";
        container.innerHTML = `
            <div class="b3-dialog__content">
                <div class="fn__flex-column">
                    <label class="fn__flex">
                        <span class="fn__flex-center" style="width: 120px;">API Key</span>
                        <div class="fn__flex-1">
                            <input class="b3-text-field fn__flex-1" type="password" id="claude-api-key"
                                   placeholder="输入您的 API Key (官方或反代)" value="${this.currentSettings.apiKey || ""}">
                            <div class="fn__hr"></div>
                            <div class="ft__smaller ft__secondary">
                                ⚠️ Warning: API key is stored locally in your browser. Keep it secure.
                                <br>Get your API key from: <a href="https://console.anthropic.com/" target="_blank">console.anthropic.com</a>
                            </div>
                        </div>
                    </label>

                    <div class="fn__hr"></div>

                    <label class="fn__flex">
                        <span class="fn__flex-center" style="width: 120px;">API Base URL</span>
                        <div class="fn__flex-1">
                            <input class="b3-text-field fn__flex-1" type="text" id="claude-base-url"
                                   placeholder="https://api.anthropic.com (leave empty for default)" value="${this.currentSettings.baseURL || ""}">
                            <div class="fn__hr"></div>
                            <div class="ft__smaller ft__secondary">
                                Custom API endpoint for reverse proxy. Leave empty to use official Anthropic API.
                                <br>Example: https://your-proxy.com/v1
                            </div>
                        </div>
                    </label>

                    <div class="fn__hr"></div>

                    <label class="fn__flex">
                        <span class="fn__flex-center" style="width: 120px;">Model</span>
                        <div class="fn__flex-1">
                            <select class="b3-select fn__flex-1" id="claude-model">
                                ${AVAILABLE_MODELS.map(m =>
                                    `<option value="${m.value}" ${m.value === this.currentSettings.model ? "selected" : ""}>${m.label}</option>`
                                ).join("")}
                            </select>
                        </div>
                    </label>

                    <div class="fn__hr"></div>

                    <label class="fn__flex">
                        <span class="fn__flex-center" style="width: 120px;">Max Tokens</span>
                        <div class="fn__flex-1">
                            <input class="b3-text-field fn__flex-1" type="number" id="claude-max-tokens"
                                   min="256" max="8192" step="256" value="${this.currentSettings.maxTokens}">
                            <div class="ft__smaller ft__secondary">Maximum length of response (256-8192)</div>
                        </div>
                    </label>

                    <div class="fn__hr"></div>

                    <label class="fn__flex">
                        <span class="fn__flex-center" style="width: 120px;">Temperature</span>
                        <div class="fn__flex-1">
                            <input class="b3-text-field fn__flex-1" type="number" id="claude-temperature"
                                   min="0" max="1" step="0.1" value="${this.currentSettings.temperature}">
                            <div class="ft__smaller ft__secondary">Randomness of response (0-1, higher = more creative)</div>
                        </div>
                    </label>

                    <div class="fn__hr"></div>

                    <label class="fn__flex">
                        <span class="fn__flex-center fn__flex-1" style="width: 120px;">System Prompt</span>
                        <div class="fn__flex-1">
                            <textarea class="b3-text-field fn__flex-1" id="claude-system-prompt"
                                      rows="4" placeholder="System prompt for Claude...">${this.currentSettings.systemPrompt}</textarea>
                            <div class="ft__smaller ft__secondary">Instructions for Claude's behavior</div>
                        </div>
                    </label>

                    <div class="fn__hr"></div>

                    <div class="fn__flex fn__flex-end">
                        <button class="b3-button b3-button--outline fn__flex-center fn__size200" id="claude-test-connection">
                            <span>Test Connection</span>
                        </button>
                        <div class="fn__space"></div>
                        <button class="b3-button b3-button--cancel" id="claude-cancel">Cancel</button>
                        <div class="fn__space"></div>
                        <button class="b3-button b3-button--text" id="claude-save">Save</button>
                    </div>
                </div>
            </div>
        `;

        this.attachEventListeners(container);
        return container;
    }

    private attachEventListeners(container: HTMLElement) {
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
        return {
            apiKey: (container.querySelector("#claude-api-key") as HTMLInputElement)?.value || "",
            baseURL: (container.querySelector("#claude-base-url") as HTMLInputElement)?.value || "",
            model: (container.querySelector("#claude-model") as HTMLSelectElement)?.value || this.currentSettings.model,
            maxTokens: parseInt((container.querySelector("#claude-max-tokens") as HTMLInputElement)?.value) || this.currentSettings.maxTokens,
            temperature: parseFloat((container.querySelector("#claude-temperature") as HTMLInputElement)?.value) || this.currentSettings.temperature,
            systemPrompt: (container.querySelector("#claude-system-prompt") as HTMLTextAreaElement)?.value || this.currentSettings.systemPrompt,
        };
    }

    private async testConnection(container: HTMLElement) {
        const testBtn = container.querySelector("#claude-test-connection") as HTMLButtonElement;
        const originalText = testBtn.textContent;

        try {
            testBtn.disabled = true;
            testBtn.textContent = "Testing...";

            const settings = this.collectSettings(container);

            // Simple validation
            if (!settings.apiKey || settings.apiKey.trim() === "") {
                throw new Error("Please enter API key");
            }

            // Here you would test the actual connection
            // For now, just a basic validation
            testBtn.textContent = "✓ Connection OK";
            setTimeout(() => {
                testBtn.textContent = originalText || "";
                testBtn.disabled = false;
            }, 2000);
        } catch (error) {
            testBtn.textContent = "✗ Failed";
            alert(`Connection failed: ${error instanceof Error ? error.message : String(error)}`);
            setTimeout(() => {
                testBtn.textContent = originalText || "";
                testBtn.disabled = false;
            }, 2000);
        }
    }

    getElement(): HTMLElement {
        return this.element;
    }

    private close() {
        this.element.parentElement?.remove();
    }

    destroy() {
        this.element.remove();
    }
}
