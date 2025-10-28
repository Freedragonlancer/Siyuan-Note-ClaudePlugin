/**
 * Prompt Editor Panel - Independent Dialog for Prompt Management
 *
 * Features:
 * - Tab 1: Preset template management (list, create, edit, delete)
 * - Tab 2: System prompt editing
 * - Tab 3: Appended prompt editing
 * - Tab 4: AI edit instruction management
 *
 * This panel is opened from SettingsPanelV3 or Chat panel header.
 */

import { Dialog, showMessage, confirm } from "siyuan";
import type { ConfigManager } from "./ConfigManager";
import type { PromptTemplate } from "./config-types";
import type { ClaudeSettings } from "../claude";

type TabType = "templates" | "system" | "appended" | "editInstructions";

export class PromptEditorPanel {
    private dialog: Dialog | null = null;
    private configManager: ConfigManager;
    private currentSettings: ClaudeSettings;
    private onSave: (settings: Partial<ClaudeSettings>) => void;
    private activeTab: TabType = "templates";
    private customTemplates: PromptTemplate[] = [];

    constructor(
        configManager: ConfigManager,
        currentSettings: ClaudeSettings,
        onSave: (settings: Partial<ClaudeSettings>) => void
    ) {
        this.configManager = configManager;
        this.currentSettings = { ...currentSettings };
        this.onSave = onSave;

        // Load custom templates
        this.loadCustomTemplates();
    }

    /**
     * Open the prompt editor dialog
     */
    open(): void {
        console.log("[PromptEditor] Opening prompt editor panel");

        this.dialog = new Dialog({
            title: "📝 提示词编辑器",
            content: `<div id="prompt-editor-container" class="prompt-editor-container"></div>`,
            width: "900px",
            height: "600px",
            destroyCallback: () => {
                console.log("[PromptEditor] Dialog closed");
                this.dialog = null;
            }
        });

        const container = this.dialog.element.querySelector("#prompt-editor-container");
        if (container) {
            this.renderContent(container as HTMLElement);
        }
    }

    /**
     * Close the dialog
     */
    close(): void {
        if (this.dialog) {
            this.dialog.destroy();
            this.dialog = null;
        }
    }

    //#region Main Rendering

    private renderContent(container: HTMLElement): void {
        container.innerHTML = `
            <div class="prompt-editor-layout">
                ${this.createTabBar()}
                <div class="prompt-editor-body">
                    ${this.createTabContent()}
                </div>
            </div>
        `;

        this.attachEventListeners(container);
    }

    private createTabBar(): string {
        const tabs = [
            { id: "presets", label: "🎨 提示词预设", icon: "🎨" },
            { id: "system", label: "🤖 系统提示词", icon: "🤖" },
            { id: "appended", label: "📌 追加提示词", icon: "📌" },
            { id: "editInstructions", label: "✏️ AI编辑指令", icon: "✏️" }
        ];

        return `
            <div class="prompt-editor-tabs" style="display: flex; border-bottom: 1px solid var(--b3-border-color); margin-bottom: 16px;">
                ${tabs.map(tab => `
                    <button
                        class="prompt-editor-tab ${this.activeTab === tab.id ? 'active' : ''}"
                        data-tab="${tab.id}"
                        style="
                            flex: 1;
                            padding: 12px 16px;
                            border: none;
                            background: ${this.activeTab === tab.id ? 'var(--b3-theme-primary)' : 'transparent'};
                            color: ${this.activeTab === tab.id ? 'var(--b3-theme-on-primary)' : 'var(--b3-theme-on-background)'};
                            cursor: pointer;
                            font-size: 14px;
                            transition: all 0.2s;
                            border-bottom: 2px solid ${this.activeTab === tab.id ? 'var(--b3-theme-primary)' : 'transparent'};
                        "
                    >
                        ${tab.icon} ${tab.label}
                    </button>
                `).join('')}
            </div>
        `;
    }

    private createTabContent(): string {
        switch (this.activeTab) {
            case "presets":
            case "templates": // Keep for backward compatibility
                return this.createPresetsTab();
            case "system":
                return this.createSystemPromptTab();
            case "appended":
                return this.createAppendedPromptTab();
            case "editInstructions":
                return this.createEditInstructionsTab();
            default:
                return "<div>Unknown tab</div>";
        }
    }

    //#endregion

    //#region Tab 1: Presets Management

    private createPresetsTab(): string {
        // Get all templates (now all are user-editable)
        const allPresets = this.configManager.getAllTemplates();

        // Find currently active preset
        const activePreset = allPresets.find(p => this.isActivePreset(p));

        // Create current preset indicator
        const currentPresetIndicator = activePreset
            ? `<div style="
                background: var(--b3-theme-primary-lightest);
                border-left: 4px solid var(--b3-theme-primary);
                padding: 12px 16px;
                margin-bottom: 16px;
                border-radius: 4px;
                display: flex;
                align-items: center;
                gap: 8px;
            ">
                <svg style="width: 16px; height: 16px; color: var(--b3-theme-primary);"><use xlink:href="#iconCheck"></use></svg>
                <span style="font-weight: 500; color: var(--b3-theme-on-surface);">当前使用预设：</span>
                <span style="color: var(--b3-theme-primary); font-weight: 500;">${activePreset.icon || '📝'} ${activePreset.name}</span>
                ${activePreset.description ? `<span class="ft__smaller ft__secondary" style="margin-left: 8px;">- ${activePreset.description}</span>` : ''}
            </div>`
            : `<div style="
                background: var(--b3-theme-warning-lightest);
                border-left: 4px solid var(--b3-theme-warning);
                padding: 12px 16px;
                margin-bottom: 16px;
                border-radius: 4px;
                display: flex;
                align-items: center;
                gap: 8px;
            ">
                <svg style="width: 16px; height: 16px; color: var(--b3-theme-warning);"><use xlink:href="#iconInfo"></use></svg>
                <span style="color: var(--b3-theme-on-surface);">当前使用的是自定义配置（未匹配任何预设）</span>
            </div>`;

        return `
            <div class="presets-tab" style="padding: 16px;">
                <div style="margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <div>
                            <h3 style="margin: 0; font-size: 16px; font-weight: 500;">🎨 提示词预设</h3>
                            <div class="ft__smaller ft__secondary" style="margin-top: 4px;">
                                管理所有AI对话的系统提示词和追加提示词预设
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="b3-button b3-button--text" id="export-all-presets" title="导出所有预设为JSON">
                                <svg><use xlink:href="#iconDownload"></use></svg>
                                <span style="margin-left: 4px;">导出全部</span>
                            </button>
                            <button class="b3-button b3-button--text" id="import-presets" title="从JSON导入预设">
                                <svg><use xlink:href="#iconUpload"></use></svg>
                                <span style="margin-left: 4px;">导入预设</span>
                            </button>
                            <button class="b3-button b3-button--outline" id="add-preset">
                                <svg><use xlink:href="#iconAdd"></use></svg>
                                <span style="margin-left: 4px;">新建预设</span>
                            </button>
                        </div>
                    </div>

                    ${currentPresetIndicator}
                </div>

                <div class="presets-list">
                    ${allPresets.length > 0
                        ? allPresets.map(preset => this.createPresetCard(preset)).join('')
                        : '<div class="ft__secondary" style="padding: 32px; text-align: center;">暂无预设，点击上方按钮创建</div>'
                    }
                </div>
            </div>
        `;
    }

    // Keep old method name for compatibility
    private createTemplatesTab(): string {
        return this.createPresetsTab();
    }

    private createPresetCard(preset: PromptTemplate): string {
        // Check if this preset is currently active
        const isActive = this.isActivePreset(preset);

        // Show edit instruction badge if configured
        const editInstructionBadge = preset.editInstruction
            ? `<span class="b3-chip" style="margin-left: 8px; font-size: 12px; background: var(--b3-theme-primary-light);" title="配置了AI快速编辑指令">✏️ 快速编辑</span>`
            : '';

        // Active preset badge
        const activeBadge = isActive
            ? `<span class="b3-chip" style="margin-left: 8px; font-size: 12px; background: var(--b3-theme-success-light); color: var(--b3-theme-success); font-weight: 500;" title="当前正在使用此预设">✓ 当前使用</span>`
            : '';

        // Card styling based on active state
        const cardBorder = isActive
            ? '2px solid var(--b3-theme-primary)'
            : '1px solid var(--b3-border-color)';

        const cardBackground = isActive
            ? 'linear-gradient(135deg, var(--b3-theme-primary-lightest) 0%, var(--b3-theme-surface) 50%)'
            : 'var(--b3-theme-surface)';

        // Apply button state
        const applyButtonHTML = isActive
            ? `<button class="b3-button b3-button--outline" disabled style="opacity: 0.6; cursor: not-allowed;" title="此预设已应用">
                <svg><use xlink:href="#iconCheck"></use></svg>
                <span style="margin-left: 4px;">✓ 已应用</span>
            </button>`
            : `<button class="b3-button b3-button--outline preset-apply" data-preset-id="${preset.id}" title="应用到当前配置">
                应用
            </button>`;

        return `
            <div class="preset-card ${isActive ? 'preset-card--active' : ''}" data-preset-id="${preset.id}" style="
                border: ${cardBorder};
                border-radius: 4px;
                padding: 12px;
                margin-bottom: 8px;
                background: ${cardBackground};
                transition: all 0.3s ease;
            ">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; margin-bottom: 8px;">
                            <span style="font-size: 20px; margin-right: 8px;">${preset.icon || '📝'}</span>
                            <span style="font-weight: 500; font-size: 14px;">${preset.name}</span>
                            ${preset.category ? `<span class="b3-chip" style="margin-left: 8px; font-size: 12px;">${preset.category}</span>` : ''}
                            ${activeBadge}
                            ${editInstructionBadge}
                        </div>
                        ${preset.description ? `<div class="ft__smaller ft__secondary" style="margin-bottom: 8px;">${preset.description}</div>` : ''}
                        <div class="ft__smaller" style="color: var(--b3-theme-on-surface-light);">
                            系统提示词: ${preset.systemPrompt.substring(0, 80)}${preset.systemPrompt.length > 80 ? '...' : ''}
                        </div>
                        ${preset.editInstruction ? `
                        <div class="ft__smaller" style="color: var(--b3-theme-on-surface-light); margin-top: 4px;">
                            快速编辑: ${preset.editInstruction.substring(0, 80)}${preset.editInstruction.length > 80 ? '...' : ''}
                        </div>
                        ` : ''}
                    </div>
                    <div style="display: flex; gap: 4px; margin-left: 12px;">
                        <button class="b3-button b3-button--text preset-preview" data-preset-id="${preset.id}" title="预览">
                            <svg><use xlink:href="#iconEye"></use></svg>
                        </button>
                        <button class="b3-button b3-button--text preset-edit" data-preset-id="${preset.id}" title="编辑">
                            <svg><use xlink:href="#iconEdit"></use></svg>
                        </button>
                        <button class="b3-button b3-button--text preset-export" data-preset-id="${preset.id}" title="导出此预设">
                            <svg><use xlink:href="#iconDownload"></use></svg>
                        </button>
                        <button class="b3-button b3-button--text preset-delete" data-preset-id="${preset.id}" title="删除">
                            <svg><use xlink:href="#iconTrashcan"></use></svg>
                        </button>
                        ${applyButtonHTML}
                    </div>
                </div>
            </div>
        `;
    }

    // Keep old method for compatibility
    private createTemplateCard(template: PromptTemplate, isCustom: boolean): string {
        return this.createPresetCard(template);
    }

    //#endregion

    //#region Tab 2: System Prompt

    private createSystemPromptTab(): string {
        return `
            <div class="system-prompt-tab" style="padding: 16px;">
                <div style="margin-bottom: 16px;">
                    <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 500;">🤖 系统提示词</h3>
                    <div class="ft__smaller ft__secondary">
                        定义 AI 的角色、行为和回应风格。系统提示词会在每次对话开始时发送给 Claude。
                    </div>
                </div>

                <div style="margin-bottom: 16px;">
                    <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                        <button class="b3-button b3-button--outline" id="load-template-system">
                            <svg><use xlink:href="#iconDownload"></use></svg>
                            <span style="margin-left: 4px;">从模板加载</span>
                        </button>
                        <button class="b3-button b3-button--outline" id="reset-system-prompt">
                            <svg><use xlink:href="#iconRefresh"></use></svg>
                            <span style="margin-left: 4px;">恢复默认</span>
                        </button>
                    </div>
                </div>

                <textarea
                    id="system-prompt-editor"
                    class="b3-text-field"
                    style="
                        width: 100%;
                        min-height: 300px;
                        font-family: 'Consolas', 'Monaco', monospace;
                        font-size: 13px;
                        resize: vertical;
                    "
                    placeholder="例如：You are a helpful AI assistant..."
                >${this.currentSettings.systemPrompt || ''}</textarea>

                <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center;">
                    <div class="ft__smaller ft__secondary">
                        字符数: <span id="system-prompt-length">${this.currentSettings.systemPrompt?.length || 0}</span>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="b3-button b3-button--cancel" id="cancel-system-prompt">取消</button>
                        <button class="b3-button b3-button--text" id="save-system-prompt">💾 保存</button>
                    </div>
                </div>
            </div>
        `;
    }

    //#endregion

    //#region Tab 3: Appended Prompt

    private createAppendedPromptTab(): string {
        return `
            <div class="appended-prompt-tab" style="padding: 16px;">
                <div style="margin-bottom: 16px;">
                    <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 500;">📌 追加提示词</h3>
                    <div class="ft__smaller ft__secondary">
                        追加提示词会自动附加到每次用户请求的末尾，用于输出格式控制、质量要求、行为约束等。
                    </div>
                </div>

                <div style="margin-bottom: 16px;">
                    <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                        <button class="b3-button b3-button--outline" id="load-template-appended">
                            <svg><use xlink:href="#iconDownload"></use></svg>
                            <span style="margin-left: 4px;">从模板加载</span>
                        </button>
                        <button class="b3-button b3-button--outline" id="reset-appended-prompt">
                            <svg><use xlink:href="#iconRefresh"></use></svg>
                            <span style="margin-left: 4px;">恢复默认</span>
                        </button>
                    </div>
                </div>

                <textarea
                    id="appended-prompt-editor"
                    class="b3-text-field"
                    style="
                        width: 100%;
                        min-height: 200px;
                        font-family: 'Consolas', 'Monaco', monospace;
                        font-size: 13px;
                        resize: vertical;
                    "
                    placeholder="例如：请用清晰的 Markdown 格式回复..."
                >${this.currentSettings.appendedPrompt || ''}</textarea>

                <div style="margin-top: 12px;">
                    <div class="ft__smaller" style="padding: 12px; background: var(--b3-theme-surface-lighter); border-radius: 4px; margin-bottom: 12px;">
                        <div style="font-weight: 500; margin-bottom: 8px;">💡 使用建议</div>
                        <ul style="margin: 0; padding-left: 20px;">
                            <li>输出格式要求（如 Markdown、JSON、表格等）</li>
                            <li>质量控制（准确性、简洁性、详细程度）</li>
                            <li>特殊约束（避免使用某些词汇、保持特定语气）</li>
                            <li>后处理指令（检查、验证、总结）</li>
                        </ul>
                    </div>
                </div>

                <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center;">
                    <div class="ft__smaller ft__secondary">
                        字符数: <span id="appended-prompt-length">${this.currentSettings.appendedPrompt?.length || 0}</span>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="b3-button b3-button--cancel" id="cancel-appended-prompt">取消</button>
                        <button class="b3-button b3-button--text" id="save-appended-prompt">💾 保存</button>
                    </div>
                </div>
            </div>
        `;
    }

    //#endregion

    //#region Tab 4: Edit Instructions

    private createEditInstructionsTab(): string {
        // Get all presets from ConfigManager and filter those with editInstruction
        const allPresets = this.configManager.getAllTemplates();
        const presetsWithEditInstruction = allPresets.filter(p => p.editInstruction && p.editInstruction.trim());

        return `
            <div class="edit-instructions-tab" style="padding: 16px;">
                <div style="margin-bottom: 16px;">
                    <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 500;">✏️ AI 编辑指令视图</h3>
                    <div class="ft__smaller ft__secondary">
                        显示所有配置了编辑指令的预设（编辑指令在 Tab 1 中配置）
                    </div>
                </div>

                <div class="edit-instructions-list">
                    ${presetsWithEditInstruction.length > 0
                        ? presetsWithEditInstruction.map(preset => this.createEditInstructionCard(preset)).join('')
                        : '<div class="ft__secondary" style="padding: 32px; text-align: center;">暂无配置编辑指令的预设<br><br>请前往"提示词预设"标签页为预设添加编辑指令</div>'
                    }
                </div>
            </div>
        `;
    }

    private createEditInstructionCard(preset: PromptTemplate): string {
        const instructionPreview = preset.editInstruction!.length > 100
            ? preset.editInstruction!.substring(0, 100) + '...'
            : preset.editInstruction!;

        return `
            <div class="edit-instruction-card" data-preset-id="${preset.id}" style="
                border: 1px solid var(--b3-border-color);
                border-radius: 4px;
                padding: 12px;
                margin-bottom: 8px;
                background: var(--b3-theme-surface);
            ">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <span style="font-size: 18px; margin-right: 4px;">${preset.icon || '📝'}</span>
                            <span style="font-weight: 500; font-size: 14px;">${preset.name}</span>
                            ${preset.category ? `<span class="b3-chip" style="margin-left: 8px; font-size: 12px;">${preset.category}</span>` : ''}
                            <span style="
                                display: inline-flex;
                                align-items: center;
                                padding: 2px 6px;
                                font-size: 11px;
                                border-radius: 3px;
                                margin-left: 8px;
                                background: ${preset.showDiff ? 'var(--b3-theme-primary-lighter)' : 'var(--b3-theme-surface-light)'};
                                color: ${preset.showDiff ? 'var(--b3-theme-primary)' : 'var(--b3-theme-on-surface-light)'};
                            " title="${preset.showDiff ? '启用差异对比' : '禁用差异对比'}">
                                ${preset.showDiff ? '✅ 显示对比' : '⚪ 不显示'}
                            </span>
                        </div>
                        <div class="ft__smaller" style="color: var(--b3-theme-on-surface);">
                            📝 编辑指令: ${instructionPreview}
                        </div>
                    </div>
                    <div style="display: flex; gap: 4px; margin-left: 12px;">
                        <button class="b3-button b3-button--text edit-instruction-goto-tab1" data-preset-id="${preset.id}" title="前往 Tab 1 编辑完整预设">
                            <svg><use xlink:href="#iconGoto"></use></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    //#endregion

    //#region Event Listeners

    private attachEventListeners(container: HTMLElement): void {
        // Tab switching
        container.querySelectorAll('.prompt-editor-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabId = (e.currentTarget as HTMLElement).dataset.tab as TabType;
                this.switchTab(tabId);
            });
        });

        // Presets tab
        this.attachPresetsListeners(container);

        // System prompt tab
        this.attachSystemPromptListeners(container);

        // Appended prompt tab
        this.attachAppendedPromptListeners(container);

        // Edit instructions tab
        this.attachEditInstructionsListeners(container);
    }

    private attachPresetsListeners(container: HTMLElement): void {
        // Add new preset
        const addBtn = container.querySelector('#add-preset');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.showPresetEditDialog());
        }

        // Export all presets
        const exportAllBtn = container.querySelector('#export-all-presets');
        if (exportAllBtn) {
            exportAllBtn.addEventListener('click', () => this.exportAllPresets());
        }

        // Import presets
        const importBtn = container.querySelector('#import-presets');
        if (importBtn) {
            importBtn.addEventListener('click', () => this.importPresets());
        }

        // Preview preset
        container.querySelectorAll('.preset-preview').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const presetId = (e.currentTarget as HTMLElement).dataset.presetId;
                if (presetId) this.previewPreset(presetId);
            });
        });

        // Edit preset
        container.querySelectorAll('.preset-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const presetId = (e.currentTarget as HTMLElement).dataset.presetId;
                if (presetId) this.showPresetEditDialog(presetId);
            });
        });

        // Export single preset
        container.querySelectorAll('.preset-export').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const presetId = (e.currentTarget as HTMLElement).dataset.presetId;
                if (presetId) this.exportPreset(presetId);
            });
        });

        // Delete preset
        container.querySelectorAll('.preset-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const presetId = (e.currentTarget as HTMLElement).dataset.presetId;
                if (presetId) this.deletePreset(presetId);
            });
        });

        // Apply preset
        container.querySelectorAll('.preset-apply').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const presetId = (e.currentTarget as HTMLElement).dataset.presetId;
                if (presetId) this.applyPreset(presetId);
            });
        });
    }

    // Keep old method for compatibility
    private attachTemplatesListeners(container: HTMLElement): void {
        this.attachPresetsListeners(container);
    }

    private attachSystemPromptListeners(container: HTMLElement): void {
        const editor = container.querySelector('#system-prompt-editor') as HTMLTextAreaElement;
        const lengthDisplay = container.querySelector('#system-prompt-length');

        if (editor && lengthDisplay) {
            editor.addEventListener('input', () => {
                lengthDisplay.textContent = editor.value.length.toString();
            });
        }

        const saveBtn = container.querySelector('#save-system-prompt');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                if (editor) {
                    this.currentSettings.systemPrompt = editor.value;
                    this.onSave({ systemPrompt: editor.value });
                    showMessage("✅ 系统提示词已保存", 2000, "info");
                }
            });
        }

        const cancelBtn = container.querySelector('#cancel-system-prompt');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                if (editor) {
                    editor.value = this.currentSettings.systemPrompt || '';
                }
            });
        }

        const resetBtn = container.querySelector('#reset-system-prompt');
        if (resetBtn && editor) {
            resetBtn.addEventListener('click', () => {
                editor.value = "You are a helpful AI assistant integrated into SiYuan Note. Help users with their notes, writing, and questions.";
                if (lengthDisplay) lengthDisplay.textContent = editor.value.length.toString();
            });
        }

        const loadTemplateBtn = container.querySelector('#load-template-system');
        if (loadTemplateBtn) {
            loadTemplateBtn.addEventListener('click', () => this.showTemplateSelector('system'));
        }
    }

    private attachAppendedPromptListeners(container: HTMLElement): void {
        const editor = container.querySelector('#appended-prompt-editor') as HTMLTextAreaElement;
        const lengthDisplay = container.querySelector('#appended-prompt-length');

        if (editor && lengthDisplay) {
            editor.addEventListener('input', () => {
                lengthDisplay.textContent = editor.value.length.toString();
            });
        }

        const saveBtn = container.querySelector('#save-appended-prompt');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                if (editor) {
                    this.currentSettings.appendedPrompt = editor.value;
                    this.onSave({ appendedPrompt: editor.value });
                    showMessage("✅ 追加提示词已保存", 2000, "info");
                }
            });
        }

        const cancelBtn = container.querySelector('#cancel-appended-prompt');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                if (editor) {
                    editor.value = this.currentSettings.appendedPrompt || '';
                }
            });
        }

        const resetBtn = container.querySelector('#reset-appended-prompt');
        if (resetBtn && editor) {
            resetBtn.addEventListener('click', () => {
                editor.value = "请用清晰的 Markdown 格式回复，确保回答准确、简洁、易于理解。";
                if (lengthDisplay) lengthDisplay.textContent = editor.value.length.toString();
            });
        }

        const loadTemplateBtn = container.querySelector('#load-template-appended');
        if (loadTemplateBtn) {
            loadTemplateBtn.addEventListener('click', () => this.showTemplateSelector('appended'));
        }
    }

    private attachEditInstructionsListeners(container: HTMLElement): void {
        // "Go to Tab 1" button to edit the full preset
        container.querySelectorAll('.edit-instruction-goto-tab1').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const presetId = (e.currentTarget as HTMLElement).dataset.presetId;
                if (presetId) {
                    // Switch to Tab 1 and highlight the preset
                    this.switchTab('presets');
                    // Optional: scroll to and highlight the preset
                    setTimeout(() => {
                        const presetCard = document.querySelector(`.preset-card[data-preset-id="${presetId}"]`);
                        if (presetCard) {
                            presetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            presetCard.classList.add('preset-highlight');
                            setTimeout(() => presetCard.classList.remove('preset-highlight'), 2000);
                        }
                    }, 100);
                }
            });
        });
    }

    //#endregion

    //#region Helper Methods

    private switchTab(tabId: TabType): void {
        this.activeTab = tabId;
        const container = this.dialog?.element.querySelector("#prompt-editor-container");
        if (container) {
            this.renderContent(container as HTMLElement);
        }
    }

    private loadCustomTemplates(): void {
        // For now, custom templates are stored in the active profile
        // In the future, we could have a separate storage for templates
        this.customTemplates = this.configManager.getCustomTemplates();
        console.log(`[PromptEditor] Loaded ${this.customTemplates.length} custom templates`,
            this.customTemplates.map(t => ({ id: t.id, name: t.name })));
    }

    /**
     * Check if a preset is currently active (in use)
     */
    private isActivePreset(preset: PromptTemplate): boolean {
        return preset.systemPrompt === this.currentSettings.systemPrompt &&
               preset.appendedPrompt === this.currentSettings.appendedPrompt;
    }

    private previewTemplate(templateId: string): void {
        const allTemplates = this.configManager.getAllTemplates();
        const template = allTemplates.find(t => t.id === templateId);

        if (!template) return;

        const previewDialog = new Dialog({
            title: `📖 预览模板: ${template.name}`,
            content: `
                <div style="padding: 16px;">
                    <div style="margin-bottom: 16px;">
                        <strong>系统提示词:</strong>
                        <pre style="background: var(--b3-theme-surface-lighter); padding: 12px; border-radius: 4px; white-space: pre-wrap; margin-top: 8px;">${template.systemPrompt}</pre>
                    </div>
                    <div>
                        <strong>追加提示词:</strong>
                        <pre style="background: var(--b3-theme-surface-lighter); padding: 12px; border-radius: 4px; white-space: pre-wrap; margin-top: 8px;">${template.appendedPrompt}</pre>
                    </div>
                </div>
            `,
            width: "600px"
        });
    }

    private applyTemplate(templateId: string): void {
        const allTemplates = this.configManager.getAllTemplates();
        const template = allTemplates.find(t => t.id === templateId);

        if (!template) return;

        this.currentSettings.systemPrompt = template.systemPrompt;
        this.currentSettings.appendedPrompt = template.appendedPrompt;

        this.onSave({
            systemPrompt: template.systemPrompt,
            appendedPrompt: template.appendedPrompt
        });

        showMessage(`✅ 已应用模板: ${template.name}`, 2000, "info");

        // Refresh current view
        const container = this.dialog?.element.querySelector("#prompt-editor-container");
        if (container) {
            this.renderContent(container as HTMLElement);
        }
    }

    private showTemplateEditDialog(templateId?: string): void {
        const isEdit = !!templateId;
        let template: PromptTemplate | undefined;

        if (isEdit) {
            template = this.customTemplates.find(t => t.id === templateId);
            if (!template) {
                showMessage("❌ 模板不存在", 2000, "error");
                return;
            }
        }

        const editDialog = new Dialog({
            title: isEdit ? "✏️ 编辑模板" : "➕ 新建模板",
            content: `
                <div class="template-edit-dialog" style="padding: 16px;">
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">模板名称</label>
                        <input type="text" id="template-name" class="b3-text-field" value="${template?.name || ''}" placeholder="输入模板名称" style="width: 100%;">
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">描述</label>
                        <input type="text" id="template-description" class="b3-text-field" value="${template?.description || ''}" placeholder="简短描述" style="width: 100%;">
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">图标 (emoji)</label>
                        <input type="text" id="template-icon" class="b3-text-field" value="${template?.icon || '📝'}" placeholder="📝" style="width: 100px;">
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">分类</label>
                        <select id="template-category" class="b3-select" style="width: 100%;">
                            <option value="custom" ${template?.category === 'custom' ? 'selected' : ''}>自定义</option>
                            <option value="assistant" ${template?.category === 'assistant' ? 'selected' : ''}>助手</option>
                            <option value="code" ${template?.category === 'code' ? 'selected' : ''}>代码</option>
                            <option value="writing" ${template?.category === 'writing' ? 'selected' : ''}>写作</option>
                            <option value="translation" ${template?.category === 'translation' ? 'selected' : ''}>翻译</option>
                        </select>
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">系统提示词</label>
                        <textarea id="template-system-prompt" class="b3-text-field" rows="6" placeholder="定义 AI 的角色和行为..." style="width: 100%; font-family: 'Consolas', monospace; font-size: 13px;">${template?.systemPrompt || ''}</textarea>
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">追加提示词</label>
                        <textarea id="template-appended-prompt" class="b3-text-field" rows="4" placeholder="输出格式要求、质量控制等..." style="width: 100%; font-family: 'Consolas', monospace; font-size: 13px;">${template?.appendedPrompt || ''}</textarea>
                    </div>

                    <div style="border-top: 1px solid var(--b3-border-color); padding-top: 16px; margin-top: 16px; margin-bottom: 16px;">
                        <div style="margin-bottom: 8px; display: flex; align-items: center;">
                            <span style="font-weight: 500; margin-right: 8px;">✏️ AI 快速编辑配置</span>
                            <span class="ft__smaller ft__secondary">(可选)</span>
                        </div>
                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 8px;">编辑指令</label>
                            <textarea id="template-edit-instruction" class="b3-text-field" rows="2" placeholder="例如: 润色文本、修复语法错误、翻译成中文..." style="width: 100%; font-family: 'Consolas', monospace; font-size: 13px;">${template?.editInstruction || ''}</textarea>
                            <div class="ft__smaller ft__secondary" style="margin-top: 4px;">
                                此预设在 AI 快速编辑弹窗中的编辑指令
                            </div>
                        </div>
                        <div style="display: flex; align-items: center;">
                            <input type="checkbox" id="template-show-diff" ${template?.showDiff ? 'checked' : ''} style="margin-right: 8px;">
                            <label for="template-show-diff">启用差异对比显示</label>
                        </div>
                    </div>

                    <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;">
                        <button class="b3-button b3-button--cancel" id="template-cancel">取消</button>
                        <button class="b3-button b3-button--text" id="template-save">💾 保存</button>
                    </div>
                </div>
            `,
            width: "700px"
        });

        // Event listeners
        const nameInput = editDialog.element.querySelector('#template-name') as HTMLInputElement;
        const descInput = editDialog.element.querySelector('#template-description') as HTMLInputElement;
        const iconInput = editDialog.element.querySelector('#template-icon') as HTMLInputElement;
        const categorySelect = editDialog.element.querySelector('#template-category') as HTMLSelectElement;
        const systemPromptTextarea = editDialog.element.querySelector('#template-system-prompt') as HTMLTextAreaElement;
        const appendedPromptTextarea = editDialog.element.querySelector('#template-appended-prompt') as HTMLTextAreaElement;
        const editInstructionTextarea = editDialog.element.querySelector('#template-edit-instruction') as HTMLTextAreaElement;
        const showDiffCheckbox = editDialog.element.querySelector('#template-show-diff') as HTMLInputElement;
        const saveBtn = editDialog.element.querySelector('#template-save');
        const cancelBtn = editDialog.element.querySelector('#template-cancel');

        saveBtn?.addEventListener('click', () => {
            const name = nameInput?.value.trim();
            const description = descInput?.value.trim();
            const icon = iconInput?.value.trim();
            const category = categorySelect?.value as PromptTemplate['category'];
            const systemPrompt = systemPromptTextarea?.value || '';
            const appendedPrompt = appendedPromptTextarea?.value || '';
            const editInstruction = editInstructionTextarea?.value.trim() || undefined;
            const showDiff = showDiffCheckbox?.checked || false;

            if (!name) {
                showMessage("❌ 请输入模板名称", 2000, "error");
                return;
            }

            if (!systemPrompt) {
                showMessage("❌ 请输入系统提示词", 2000, "error");
                return;
            }

            const newTemplate: PromptTemplate = {
                id: isEdit ? template!.id : `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name,
                description,
                icon: icon || '📝',
                category,
                systemPrompt,
                appendedPrompt,
                isBuiltIn: false,
                editInstruction,
                showDiff
            };

            if (isEdit) {
                // Update existing template
                const index = this.customTemplates.findIndex(t => t.id === templateId);
                if (index !== -1) {
                    this.customTemplates[index] = newTemplate;
                }
            } else {
                // Add new template
                this.customTemplates.push(newTemplate);
            }

            // Save to ConfigManager
            this.configManager.saveTemplate(newTemplate);

            showMessage(`✅ 模板已${isEdit ? '更新' : '创建'}`, 2000, "info");
            editDialog.destroy();

            // Refresh templates tab
            this.switchTab('templates');
        });

        cancelBtn?.addEventListener('click', () => {
            editDialog.destroy();
        });
    }

    private deleteTemplate(templateId: string): void {
        const template = this.customTemplates.find(t => t.id === templateId);
        if (!template) {
            showMessage("❌ 模板不存在", 2000, "error");
            return;
        }

        confirm(
            "确认删除",
            `确定要删除模板"${template.name}"吗？此操作不可撤销。`,
            () => {
                // Confirmed - delete template
                const index = this.customTemplates.findIndex(t => t.id === templateId);
                if (index !== -1) {
                    this.customTemplates.splice(index, 1);
                }

                // Delete from ConfigManager
                this.configManager.deleteTemplate(templateId);

                showMessage("✅ 模板已删除", 2000, "info");

                // Refresh templates tab
                this.switchTab('templates');
            }
        );
    }

    private showTemplateSelector(type: 'system' | 'appended'): void {
        const allTemplates = this.configManager.getAllTemplates();

        const selectorDialog = new Dialog({
            title: type === 'system' ? "📚 选择系统提示词模板" : "📚 选择追加提示词模板",
            content: `
                <div class="template-selector" style="padding: 16px;">
                    <div style="margin-bottom: 16px;">
                        <div class="ft__smaller ft__secondary">
                            选择一个模板来快速填充${type === 'system' ? '系统提示词' : '追加提示词'}
                        </div>
                    </div>

                    <div class="template-selector-list" style="max-height: 400px; overflow-y: auto;">
                        ${allTemplates.map(template => `
                            <div class="template-selector-item" data-template-id="${template.id}" style="
                                border: 1px solid var(--b3-border-color);
                                border-radius: 4px;
                                padding: 12px;
                                margin-bottom: 8px;
                                cursor: pointer;
                                transition: all 0.2s;
                                background: var(--b3-theme-surface);
                            " onmouseover="this.style.background='var(--b3-theme-surface-light)'" onmouseout="this.style.background='var(--b3-theme-surface)'">
                                <div style="display: flex; align-items: center; margin-bottom: 8px;">
                                    <span style="font-size: 20px; margin-right: 8px;">${template.icon || '📝'}</span>
                                    <span style="font-weight: 500;">${template.name}</span>
                                    ${template.isBuiltIn ? '<span class="b3-chip" style="margin-left: 8px; font-size: 12px;">内置</span>' : ''}
                                </div>
                                ${template.description ? `<div class="ft__smaller ft__secondary">${template.description}</div>` : ''}
                            </div>
                        `).join('')}
                    </div>

                    <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
                        <button class="b3-button b3-button--cancel" id="selector-cancel">取消</button>
                    </div>
                </div>
            `,
            width: "600px"
        });

        // Add click handlers to template items
        selectorDialog.element.querySelectorAll('.template-selector-item').forEach(item => {
            item.addEventListener('click', () => {
                const templateId = (item as HTMLElement).dataset.templateId;
                if (!templateId) return;

                const selectedTemplate = allTemplates.find(t => t.id === templateId);
                if (!selectedTemplate) return;

                // Get the appropriate editor
                const editorId = type === 'system' ? 'system-prompt-editor' : 'appended-prompt-editor';
                const editor = this.dialog?.element.querySelector(`#${editorId}`) as HTMLTextAreaElement;
                const lengthDisplay = this.dialog?.element.querySelector(`#${type}-prompt-length`);

                if (editor) {
                    const promptValue = type === 'system' ? selectedTemplate.systemPrompt : selectedTemplate.appendedPrompt;
                    editor.value = promptValue;

                    if (lengthDisplay) {
                        lengthDisplay.textContent = promptValue.length.toString();
                    }

                    showMessage(`✅ 已加载模板: ${selectedTemplate.name}`, 2000, "info");
                    selectorDialog.destroy();
                }
            });
        });

        const cancelBtn = selectorDialog.element.querySelector('#selector-cancel');
        cancelBtn?.addEventListener('click', () => {
            selectorDialog.destroy();
        });
    }

    private showEditInstructionDialog(index?: number): void {
        const isEdit = index !== undefined;
        const currentInstructions = this.currentSettings.editSettings?.customInstructions || [];
        const instruction = isEdit ? currentInstructions[index] : null;

        // Extract text and showDiff from instruction object
        const instructionText = instruction ? (typeof instruction === 'string' ? instruction : instruction.text) : '';
        const showDiff = instruction && typeof instruction === 'object' ? instruction.showDiff : true;

        const editDialog = new Dialog({
            title: isEdit ? "✏️ 编辑 AI 编辑指令" : "➕ 新建 AI 编辑指令",
            content: `
                <div class="edit-instruction-dialog" style="padding: 16px;">
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">指令内容</label>
                        <div class="ft__smaller ft__secondary" style="margin-bottom: 12px;">
                            定义 AI 文本编辑时的具体指令，例如"修正语法错误"、"优化表达"、"翻译成英文"等
                        </div>
                        <textarea
                            id="instruction-content"
                            class="b3-text-field"
                            rows="6"
                            placeholder="例如：修正文本中的语法错误和拼写错误，保持原文风格"
                            style="width: 100%; font-family: 'Consolas', monospace; font-size: 13px;"
                        >${instructionText}</textarea>
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 10px; background: var(--b3-theme-surface); border: 1px solid var(--b3-border-color); border-radius: 4px;">
                            <input type="checkbox" id="instruction-show-diff" ${showDiff ? 'checked' : ''} style="cursor: pointer;">
                            <div>
                                <div style="font-weight: 500;">编辑后显示差异对比</div>
                                <div class="ft__smaller ft__secondary" style="margin-top: 4px;">启用后，AI编辑完成时会并排显示原文和修改建议</div>
                            </div>
                        </label>
                    </div>

                    <div style="margin-bottom: 16px;">
                        <div class="ft__smaller" style="padding: 12px; background: var(--b3-theme-surface-lighter); border-radius: 4px;">
                            <div style="font-weight: 500; margin-bottom: 8px;">💡 编写建议</div>
                            <ul style="margin: 0; padding-left: 20px;">
                                <li>明确具体的编辑目标（修正、优化、翻译等）</li>
                                <li>指定需要保持的风格或格式</li>
                                <li>说明特殊处理要求</li>
                                <li>避免过于宽泛的指令</li>
                            </ul>
                        </div>
                    </div>

                    <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;">
                        <button class="b3-button b3-button--cancel" id="instruction-cancel">取消</button>
                        <button class="b3-button b3-button--text" id="instruction-save">💾 保存</button>
                    </div>
                </div>
            `,
            width: "650px"
        });

        const textarea = editDialog.element.querySelector('#instruction-content') as HTMLTextAreaElement;
        const showDiffCheckbox = editDialog.element.querySelector('#instruction-show-diff') as HTMLInputElement;
        const saveBtn = editDialog.element.querySelector('#instruction-save');
        const cancelBtn = editDialog.element.querySelector('#instruction-cancel');

        saveBtn?.addEventListener('click', () => {
            const content = textarea?.value.trim();
            const shouldShowDiff = showDiffCheckbox?.checked ?? true;

            if (!content) {
                showMessage("❌ 请输入指令内容", 2000, "error");
                return;
            }

            // Get or initialize edit settings
            if (!this.currentSettings.editSettings) {
                this.currentSettings.editSettings = {
                    contextLinesBefore: 5,
                    contextLinesAfter: 3,
                    defaultInstruction: '',
                    maxConcurrentEdits: 1,
                    autoProcessQueue: true,
                    autoShowDiff: true,
                    maxTextLength: 5000,
                    customInstructions: []
                };
            }

            if (!this.currentSettings.editSettings.customInstructions) {
                this.currentSettings.editSettings.customInstructions = [];
            }

            // Create CustomInstruction object
            const newInstruction = {
                text: content,
                showDiff: shouldShowDiff
            };

            if (isEdit) {
                // Update existing instruction
                this.currentSettings.editSettings.customInstructions[index] = newInstruction;
            } else {
                // Add new instruction
                this.currentSettings.editSettings.customInstructions.push(newInstruction);
            }

            // Save to profile
            this.onSave({ editSettings: this.currentSettings.editSettings });

            showMessage(`✅ 指令已${isEdit ? '更新' : '创建'}`, 2000, "info");
            editDialog.destroy();

            // Refresh edit instructions tab
            this.switchTab('editInstructions');
        });

        cancelBtn?.addEventListener('click', () => {
            editDialog.destroy();
        });
    }

    private deleteEditInstruction(index: number): void {
        const currentInstructions = this.currentSettings.editSettings?.customInstructions || [];
        const instruction = currentInstructions[index];

        if (!instruction) {
            showMessage("❌ 指令不存在", 2000, "error");
            return;
        }

        // Handle both old string format and new object format
        const text = typeof instruction === 'string' ? instruction : instruction.text;
        const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;

        confirm(
            "确认删除",
            `确定要删除这条指令吗？\n\n"${preview}"`,
            () => {
                // Confirmed - delete instruction
                if (this.currentSettings.editSettings?.customInstructions) {
                    this.currentSettings.editSettings.customInstructions.splice(index, 1);

                    // Save to profile
                    this.onSave({ editSettings: this.currentSettings.editSettings });

                    showMessage("✅ 指令已删除", 2000, "info");

                    // Refresh edit instructions tab
                    this.switchTab('editInstructions');
                }
            }
        );
    }

    /**
     * Export instructions to JSON file
     */
    private exportInstructions(): void {
        const instructions = this.currentSettings.editSettings?.customInstructions || [];

        if (instructions.length === 0) {
            showMessage("❌ 没有可导出的预设", 2000, "error");
            return;
        }

        // Create export data
        const exportData = {
            version: "1.0",
            exportedAt: Date.now(),
            instructions: instructions
        };

        // Convert to JSON
        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // Create download link
        const a = document.createElement('a');
        a.href = url;
        a.download = `claude-edit-instructions-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showMessage(`✅ 已导出 ${instructions.length} 条预设`, 2000, "info");
    }

    /**
     * Import instructions from JSON file
     */
    private importInstructions(): void {
        // Create file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';

        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                // Validate format
                if (!data.instructions || !Array.isArray(data.instructions)) {
                    showMessage("❌ 无效的JSON格式", 2000, "error");
                    return;
                }

                // Show import dialog with options
                this.showImportDialog(data.instructions);
            } catch (error) {
                console.error('[PromptEditor] Import error:', error);
                showMessage("❌ 导入失败: " + error.message, 3000, "error");
            }
        };

        input.click();
    }

    /**
     * Show import dialog with merge/replace options
     */
    private showImportDialog(newInstructions: any[]): void {
        const currentInstructions = this.currentSettings.editSettings?.customInstructions || [];

        const importDialog = new Dialog({
            title: "📥 导入预设",
            content: `
                <div class="import-instructions-dialog" style="padding: 16px;">
                    <div style="margin-bottom: 16px;">
                        <div style="padding: 12px; background: var(--b3-theme-surface); border: 1px solid var(--b3-border-color); border-radius: 4px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <span>当前预设数量:</span>
                                <strong>${currentInstructions.length}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>待导入预设数量:</span>
                                <strong>${newInstructions.length}</strong>
                            </div>
                        </div>
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">导入方式</label>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <label style="display: flex; align-items: start; gap: 8px; padding: 10px; background: var(--b3-theme-surface); border: 1px solid var(--b3-border-color); border-radius: 4px; cursor: pointer;">
                                <input type="radio" name="import-mode" value="merge" checked style="margin-top: 4px;">
                                <div>
                                    <div style="font-weight: 500;">合并导入</div>
                                    <div class="ft__smaller ft__secondary" style="margin-top: 4px;">将新预设添加到现有预设后面</div>
                                </div>
                            </label>
                            <label style="display: flex; align-items: start; gap: 8px; padding: 10px; background: var(--b3-theme-surface); border: 1px solid var(--b3-border-color); border-radius: 4px; cursor: pointer;">
                                <input type="radio" name="import-mode" value="replace" style="margin-top: 4px;">
                                <div>
                                    <div style="font-weight: 500;">替换导入</div>
                                    <div class="ft__smaller ft__secondary" style="margin-top: 4px;">删除所有现有预设，替换为新预设</div>
                                </div>
                            </label>
                        </div>
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="display: flex; align-items: center; gap: 8px;">
                            <input type="checkbox" id="import-dedupe" checked>
                            <span>自动去重（跳过相同内容的预设）</span>
                        </label>
                    </div>

                    <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;">
                        <button class="b3-button b3-button--cancel" id="import-cancel">取消</button>
                        <button class="b3-button b3-button--text" id="import-confirm">📥 确认导入</button>
                    </div>
                </div>
            `,
            width: "550px"
        });

        const confirmBtn = importDialog.element.querySelector('#import-confirm');
        const cancelBtn = importDialog.element.querySelector('#import-cancel');

        confirmBtn?.addEventListener('click', () => {
            const mode = (importDialog.element.querySelector('input[name="import-mode"]:checked') as HTMLInputElement)?.value || 'merge';
            const dedupe = (importDialog.element.querySelector('#import-dedupe') as HTMLInputElement)?.checked ?? true;

            this.performImport(newInstructions, mode, dedupe);
            importDialog.destroy();
        });

        cancelBtn?.addEventListener('click', () => {
            importDialog.destroy();
        });
    }

    /**
     * Perform the actual import
     */
    private performImport(newInstructions: any[], mode: string, dedupe: boolean): void {
        // Get or initialize edit settings
        if (!this.currentSettings.editSettings) {
            this.currentSettings.editSettings = {
                contextLinesBefore: 5,
                contextLinesAfter: 3,
                defaultInstruction: '',
                maxConcurrentEdits: 1,
                autoProcessQueue: true,
                autoShowDiff: true,
                maxTextLength: 5000,
                customInstructions: []
            };
        }

        if (!this.currentSettings.editSettings.customInstructions) {
            this.currentSettings.editSettings.customInstructions = [];
        }

        let resultInstructions: any[];

        if (mode === 'replace') {
            resultInstructions = [...newInstructions];
        } else {
            // Merge mode
            resultInstructions = [...this.currentSettings.editSettings.customInstructions];

            if (dedupe) {
                // Create set of existing instruction texts for deduplication
                const existingTexts = new Set(
                    resultInstructions.map(instr =>
                        typeof instr === 'string' ? instr : instr.text
                    )
                );

                // Only add new instructions that don't already exist
                newInstructions.forEach(newInstr => {
                    const newText = typeof newInstr === 'string' ? newInstr : newInstr.text;
                    if (!existingTexts.has(newText)) {
                        resultInstructions.push(newInstr);
                    }
                });
            } else {
                // No deduplication, just append all
                resultInstructions.push(...newInstructions);
            }
        }

        // Update settings
        this.currentSettings.editSettings.customInstructions = resultInstructions;

        // Save to profile
        this.onSave({ editSettings: this.currentSettings.editSettings });

        showMessage(`✅ 成功导入 ${newInstructions.length} 条预设`, 2000, "info");

        // Refresh edit instructions tab
        this.switchTab('editInstructions');
    }

    //#endregion

    //#region Preset Methods (Renamed from Template Methods)

    /**
     * Preview a preset
     */
    private previewPreset(presetId: string): void {
        const preset = this.configManager.getAllTemplates().find(t => t.id === presetId);
        if (!preset) return;

        this.previewTemplate(presetId); // Reuse existing method
    }

    /**
     * Apply a preset to current settings
     */
    private applyPreset(presetId: string): void {
        this.applyTemplate(presetId); // Reuse existing method
    }

    /**
     * Show preset edit dialog
     */
    private showPresetEditDialog(presetId?: string): void {
        this.showTemplateEditDialog(presetId); // Reuse existing method
    }

    /**
     * Delete a preset
     */
    private deletePreset(presetId: string): void {
        this.deleteTemplate(presetId); // Reuse existing method
    }

    /**
     * Export a single preset to JSON
     */
    private exportPreset(presetId: string): void {
        const preset = this.configManager.getAllTemplates().find(t => t.id === presetId);
        if (!preset) {
            showMessage("❌ 预设不存在", 2000, "error");
            return;
        }

        const exportData = {
            version: "1.0",
            exportedAt: Date.now(),
            preset: preset
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `preset-${preset.name}-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showMessage(`✅ 已导出预设: ${preset.name}`, 2000, "info");
    }

    /**
     * Export all presets to JSON
     */
    private exportAllPresets(): void {
        const presets = this.configManager.getAllTemplates();
        if (presets.length === 0) {
            showMessage("❌ 没有可导出的预设", 2000, "error");
            return;
        }

        const exportData = {
            version: "1.0",
            exportedAt: Date.now(),
            presets: presets
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `claude-presets-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showMessage(`✅ 已导出 ${presets.length} 个预设`, 2000, "info");
    }

    /**
     * Import presets from JSON file
     */
    private importPresets(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';

        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                let presetsToImport: PromptTemplate[] = [];

                // Handle both single preset and multiple presets format
                if (data.preset) {
                    presetsToImport = [data.preset];
                } else if (data.presets && Array.isArray(data.presets)) {
                    presetsToImport = data.presets;
                } else {
                    showMessage("❌ 无效的JSON格式", 2000, "error");
                    return;
                }

                // Import each preset
                let importedCount = 0;
                presetsToImport.forEach(preset => {
                    // Generate new ID to avoid conflicts
                    const newPreset = {
                        ...preset,
                        id: `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        isBuiltIn: false // All imported presets are user-editable
                    };
                    this.configManager.saveTemplate(newPreset);
                    importedCount++;
                });

                showMessage(`✅ 成功导入 ${importedCount} 个预设`, 2000, "info");

                // Refresh presets tab
                this.loadCustomTemplates();
                this.switchTab('presets');
            } catch (error) {
                console.error('[PromptEditor] Import error:', error);
                showMessage("❌ 导入失败: " + error.message, 3000, "error");
            }
        };

        input.click();
    }

    //#endregion
}
