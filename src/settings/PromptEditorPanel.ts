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
            { id: "templates", label: "📚 预设模板", icon: "📚" },
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
            case "templates":
                return this.createTemplatesTab();
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

    //#region Tab 1: Templates Management

    private createTemplatesTab(): string {
        const builtInTemplates = this.configManager.getBuiltInTemplates();
        const customTemplates = this.customTemplates;

        return `
            <div class="templates-tab" style="padding: 16px;">
                <div style="margin-bottom: 24px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h3 style="margin: 0; font-size: 16px; font-weight: 500;">📚 内置模板</h3>
                        <span class="ft__smaller ft__secondary">${builtInTemplates.length} 个模板</span>
                    </div>
                    <div class="template-list built-in">
                        ${builtInTemplates.map(template => this.createTemplateCard(template, false)).join('')}
                    </div>
                </div>

                <div class="fn__hr" style="margin: 24px 0;"></div>

                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h3 style="margin: 0; font-size: 16px; font-weight: 500;">✨ 自定义模板</h3>
                        <button class="b3-button b3-button--outline" id="add-custom-template">
                            <svg><use xlink:href="#iconAdd"></use></svg>
                            <span style="margin-left: 4px;">新建模板</span>
                        </button>
                    </div>
                    <div class="template-list custom">
                        ${customTemplates.length > 0
                            ? customTemplates.map(template => this.createTemplateCard(template, true)).join('')
                            : '<div class="ft__secondary" style="padding: 32px; text-align: center;">暂无自定义模板，点击上方按钮创建</div>'
                        }
                    </div>
                </div>
            </div>
        `;
    }

    private createTemplateCard(template: PromptTemplate, isCustom: boolean): string {
        return `
            <div class="template-card" data-template-id="${template.id}" style="
                border: 1px solid var(--b3-border-color);
                border-radius: 4px;
                padding: 12px;
                margin-bottom: 8px;
                background: var(--b3-theme-surface);
            ">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; margin-bottom: 8px;">
                            <span style="font-size: 20px; margin-right: 8px;">${template.icon || '📝'}</span>
                            <span style="font-weight: 500; font-size: 14px;">${template.name}</span>
                            ${template.category ? `<span class="b3-chip" style="margin-left: 8px; font-size: 12px;">${template.category}</span>` : ''}
                        </div>
                        ${template.description ? `<div class="ft__smaller ft__secondary" style="margin-bottom: 8px;">${template.description}</div>` : ''}
                        <div class="ft__smaller" style="color: var(--b3-theme-on-surface-light);">
                            系统提示词: ${template.systemPrompt.substring(0, 80)}${template.systemPrompt.length > 80 ? '...' : ''}
                        </div>
                    </div>
                    <div style="display: flex; gap: 4px; margin-left: 12px;">
                        <button class="b3-button b3-button--text template-preview" data-template-id="${template.id}" title="预览">
                            <svg><use xlink:href="#iconEye"></use></svg>
                        </button>
                        ${isCustom ? `
                            <button class="b3-button b3-button--text template-edit" data-template-id="${template.id}" title="编辑">
                                <svg><use xlink:href="#iconEdit"></use></svg>
                            </button>
                            <button class="b3-button b3-button--text template-delete" data-template-id="${template.id}" title="删除">
                                <svg><use xlink:href="#iconTrashcan"></use></svg>
                            </button>
                        ` : ''}
                        <button class="b3-button b3-button--outline template-apply" data-template-id="${template.id}" title="应用到当前配置">
                            应用
                        </button>
                    </div>
                </div>
            </div>
        `;
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
        const presetInstructions = this.currentSettings.editSettings?.customInstructions || [];

        return `
            <div class="edit-instructions-tab" style="padding: 16px;">
                <div style="margin-bottom: 16px;">
                    <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 500;">✏️ AI 编辑指令管理</h3>
                    <div class="ft__smaller ft__secondary">
                        管理 AI 文本编辑功能的预设指令模板
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <button class="b3-button b3-button--outline" id="add-edit-instruction">
                        <svg><use xlink:href="#iconAdd"></use></svg>
                        <span style="margin-left: 4px;">新建指令</span>
                    </button>
                </div>

                <div class="edit-instructions-list">
                    ${presetInstructions.length > 0
                        ? presetInstructions.map((instr, index) => this.createEditInstructionCard(instr, index)).join('')
                        : '<div class="ft__secondary" style="padding: 32px; text-align: center;">暂无自定义指令，点击上方按钮创建</div>'
                    }
                </div>
            </div>
        `;
    }

    private createEditInstructionCard(instruction: string, index: number): string {
        const preview = instruction.length > 100 ? instruction.substring(0, 100) + '...' : instruction;

        return `
            <div class="edit-instruction-card" data-index="${index}" style="
                border: 1px solid var(--b3-border-color);
                border-radius: 4px;
                padding: 12px;
                margin-bottom: 8px;
                background: var(--b3-theme-surface);
            ">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <div class="ft__smaller" style="color: var(--b3-theme-on-surface);">${preview}</div>
                    </div>
                    <div style="display: flex; gap: 4px; margin-left: 12px;">
                        <button class="b3-button b3-button--text edit-instruction-edit" data-index="${index}" title="编辑">
                            <svg><use xlink:href="#iconEdit"></use></svg>
                        </button>
                        <button class="b3-button b3-button--text edit-instruction-delete" data-index="${index}" title="删除">
                            <svg><use xlink:href="#iconTrashcan"></use></svg>
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

        // Templates tab
        this.attachTemplatesListeners(container);

        // System prompt tab
        this.attachSystemPromptListeners(container);

        // Appended prompt tab
        this.attachAppendedPromptListeners(container);

        // Edit instructions tab
        this.attachEditInstructionsListeners(container);
    }

    private attachTemplatesListeners(container: HTMLElement): void {
        // Add custom template
        const addBtn = container.querySelector('#add-custom-template');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.showTemplateEditDialog());
        }

        // Preview template
        container.querySelectorAll('.template-preview').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const templateId = (e.currentTarget as HTMLElement).dataset.templateId;
                if (templateId) this.previewTemplate(templateId);
            });
        });

        // Edit template
        container.querySelectorAll('.template-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const templateId = (e.currentTarget as HTMLElement).dataset.templateId;
                if (templateId) this.showTemplateEditDialog(templateId);
            });
        });

        // Delete template
        container.querySelectorAll('.template-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const templateId = (e.currentTarget as HTMLElement).dataset.templateId;
                if (templateId) this.deleteTemplate(templateId);
            });
        });

        // Apply template
        container.querySelectorAll('.template-apply').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const templateId = (e.currentTarget as HTMLElement).dataset.templateId;
                if (templateId) this.applyTemplate(templateId);
            });
        });
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
        const addBtn = container.querySelector('#add-edit-instruction');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.showEditInstructionDialog());
        }

        container.querySelectorAll('.edit-instruction-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt((e.currentTarget as HTMLElement).dataset.index || '0');
                this.showEditInstructionDialog(index);
            });
        });

        container.querySelectorAll('.edit-instruction-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt((e.currentTarget as HTMLElement).dataset.index || '0');
                this.deleteEditInstruction(index);
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
        const saveBtn = editDialog.element.querySelector('#template-save');
        const cancelBtn = editDialog.element.querySelector('#template-cancel');

        saveBtn?.addEventListener('click', () => {
            const name = nameInput?.value.trim();
            const description = descInput?.value.trim();
            const icon = iconInput?.value.trim();
            const category = categorySelect?.value as PromptTemplate['category'];
            const systemPrompt = systemPromptTextarea?.value || '';
            const appendedPrompt = appendedPromptTextarea?.value || '';

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
                isBuiltIn: false
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
        const instruction = isEdit ? currentInstructions[index] : '';

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
                        >${instruction}</textarea>
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
        const saveBtn = editDialog.element.querySelector('#instruction-save');
        const cancelBtn = editDialog.element.querySelector('#instruction-cancel');

        saveBtn?.addEventListener('click', () => {
            const content = textarea?.value.trim();

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

            if (isEdit) {
                // Update existing instruction
                this.currentSettings.editSettings.customInstructions[index] = content;
            } else {
                // Add new instruction
                this.currentSettings.editSettings.customInstructions.push(content);
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

        const preview = instruction.length > 50 ? instruction.substring(0, 50) + '...' : instruction;

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

    //#endregion
}
