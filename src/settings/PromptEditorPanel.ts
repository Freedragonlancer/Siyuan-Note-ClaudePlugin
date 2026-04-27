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
import type { FilterRule } from "../filter/types";
import { BUILTIN_FILTER_TEMPLATES } from "../filter/types";
import { responseFilter } from "../filter";
import { SecurityUtils } from "../utils/Security";

type TabType = "templates" | "system" | "appended" | "quickEditPrompt" | "responseFilters";

// New two-level tab system types
type MainTabType = "presets" | "filters";
type SubTabType = "system" | "appended" | "quickEdit" | "selectionQA";

export class PromptEditorPanel {
    private dialog: Dialog | null = null;
    private configManager: ConfigManager;
    private currentSettings: ClaudeSettings;
    private onSave: (settings: Partial<ClaudeSettings>) => void;
    private onPresetsChanged?: () => void;

    // Legacy tab system (keep for backward compatibility)
    private activeTab: TabType = "templates";
    private customTemplates: PromptTemplate[] = [];

    // New two-level tab system
    private activeMainTab: MainTabType = "presets";
    private activeSubTab: SubTabType = "system";
    private selectedPresetId: string | null = null;
    private presetDraftData: Partial<PromptTemplate> = {};

    // Dual-scope filterRules UI state
    private filterRulesView: 'global' | 'preset' = 'global';
    private selectedPresetForFilters: string | null = null;

    constructor(
        configManager: ConfigManager,
        currentSettings: ClaudeSettings,
        onSave: (settings: Partial<ClaudeSettings>) => void,
        onPresetsChanged?: () => void
    ) {
        this.configManager = configManager;
        this.currentSettings = { ...currentSettings };
        this.onSave = onSave;
        this.onPresetsChanged = onPresetsChanged;

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
                ${this.createMainTabBar()}
                <div class="prompt-editor-body">
                    ${this.createMainTabContent()}
                </div>
            </div>
        `;

        this.attachEventListeners(container);
    }

    private createTabBar(): string {
        const tabs = [
            { id: "presets", label: "提示词预设", icon: "🎨" },
            { id: "system", label: "系统提示词", icon: "🤖" },
            { id: "appended", label: "追加提示词", icon: "📌" },
            { id: "quickEditPrompt", label: "快速编辑模板", icon: "⚡" },
            { id: "responseFilters", label: "响应过滤", icon: "🔧" }
        ];

        return `
            <div class="prompt-editor-tabs">
                ${tabs.map(tab => `
                    <button
                        class="prompt-editor-tab ${this.activeTab === tab.id ? 'active' : ''}"
                        data-tab="${tab.id}"
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
            case "quickEditPrompt":
                return this.createQuickEditPromptTab();
            case "responseFilters":
                return this.createResponseFiltersTab();
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

                <div class="settings-flex-between" style="margin-top: 12px;">
                    <div class="ft__smaller ft__secondary">
                        字符数: <span id="system-prompt-length">${this.currentSettings.systemPrompt?.length || 0}</span>
                    </div>
                    <div class="settings-button-group">
                        <button class="b3-button b3-button--cancel" id="cancel-system-prompt">取消</button>
                        <button class="b3-button b3-button--text" id="save-system-prompt">保存</button>
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

                <div class="settings-flex-between" style="margin-top: 12px;">
                    <div class="ft__smaller ft__secondary">
                        字符数: <span id="appended-prompt-length">${this.currentSettings.appendedPrompt?.length || 0}</span>
                    </div>
                    <div class="settings-button-group">
                        <button class="b3-button b3-button--cancel" id="cancel-appended-prompt">取消</button>
                        <button class="b3-button b3-button--text" id="save-appended-prompt">保存</button>
                    </div>
                </div>
            </div>
        `;
    }

    //#endregion

    //#region Tab 4: Quick Edit Prompt Template

    private createQuickEditPromptTab(): string {
        const defaultTemplate = `{instruction}

原文：
{original}

重要：只返回修改后的完整文本，不要添加任何前言、说明、解释或格式标记（如"以下是..."、"主要改进："等）。直接输出修改后的文本内容即可。`;

        return `
            <div class="tab-content-inner" style="max-width: 900px; margin: 0 auto;">
                <div style="margin-bottom: 20px;">
                    <h4 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 500;">⚡ AI 快速编辑提示词模板</h4>
                    <div class="ft__smaller ft__secondary" style="line-height: 1.6;">
                        自定义快速编辑功能的提示词结构。支持以下占位符：<br>
                        <strong>基础占位符：</strong><br>
                        • <code>{instruction}</code> - 用户输入的编辑指令<br>
                        • <code>{original}</code> - 选中的原始文本<br>
                        <br>
                        <strong>✨ 上下文占位符（新功能）：</strong><br>
                        • <code>{above=5}</code> - 选中内容之前的5行文本<br>
                        • <code>{below=3}</code> - 选中内容之后的3行文本<br>
                        • <code>{above_blocks=2}</code> - 选中块之前的2个SiYuan块<br>
                        • <code>{below_blocks=4}</code> - 选中块之后的4个块<br>
                        • <code>{custom=((blockid 'name'))}</code> - 引用指定块的内容作为上下文<br>
                        <span style="color: var(--b3-theme-primary); font-weight: 500;">💡 使用上下文可以让AI更准确地理解文档结构和内容</span>
                    </div>
                </div>

                <textarea
                    id="quick-edit-prompt-editor"
                    class="b3-text-field"
                    rows="12"
                    style="
                        width: 100%;
                        padding: 12px;
                        border: 1px solid var(--b3-border-color);
                        border-radius: 4px;
                        font-family: 'Consolas', 'Monaco', monospace;
                        font-size: 13px;
                        resize: vertical;
                    "
                    placeholder="${defaultTemplate}"
                >${this.currentSettings.quickEditPromptTemplate || defaultTemplate}</textarea>

                <div style="margin-top: 12px;">
                    <div class="ft__smaller" style="padding: 12px; background: var(--b3-theme-surface-lighter); border-radius: 4px; margin-bottom: 12px;">
                        <div style="font-weight: 500; margin-bottom: 8px;">💡 使用示例</div>
                        <div style="background: var(--b3-theme-background); padding: 8px; border-radius: 4px; font-family: monospace; font-size: 12px; margin-bottom: 8px;">
                            <div style="color: var(--b3-theme-on-surface-light);">// 1. 最简洁版本</div>
                            <div>{instruction}</div>
                            <div style="margin-top: 4px;">{original}</div>
                        </div>
                        <div style="background: var(--b3-theme-background); padding: 8px; border-radius: 4px; font-family: monospace; font-size: 12px; margin-bottom: 8px;">
                            <div style="color: var(--b3-theme-on-surface-light);">// 2. 自定义格式</div>
                            <div>请执行以下操作：{instruction}</div>
                            <div style="margin-top: 4px;">--- 原文内容 ---</div>
                            <div>{original}</div>
                            <div>--- 原文结束 ---</div>
                            <div style="margin-top: 4px;">请直接输出结果，无需解释。</div>
                        </div>
                        <div style="background: var(--b3-theme-background); padding: 8px; border-radius: 4px; font-family: monospace; font-size: 12px; border: 2px solid var(--b3-theme-primary-light);">
                            <div style="color: var(--b3-theme-primary); font-weight: 500;">// 3. ✨ 带上下文的编辑（推荐）</div>
                            <div style="margin-top: 4px;">请根据以下上下文改进选中的文本：</div>
                            <div style="margin-top: 4px; color: var(--b3-theme-primary);">{above=3}</div>
                            <div style="margin-top: 4px; color: var(--b3-theme-success);">{original}</div>
                            <div style="margin-top: 4px; color: var(--b3-theme-primary);">{below=3}</div>
                            <div style="margin-top: 4px;">编辑指令：{instruction}</div>
                            <div style="margin-top: 8px; padding: 8px; background: var(--b3-theme-info-lighter); border-radius: 4px; font-size: 11px; line-height: 1.5;">
                                💡 AI会看到选中内容前后各3行，有助于保持内容连贯性和风格一致性
                            </div>
                        </div>
                    </div>
                </div>

                <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center;">
                    <div class="ft__smaller ft__secondary">
                        字符数: <span id="quick-edit-prompt-length">${(this.currentSettings.quickEditPromptTemplate || defaultTemplate).length}</span>
                    </div>
                    <div class="settings-button-group">
                        <button class="b3-button b3-button--cancel" id="reset-quick-edit-prompt">
                            <svg><use xlink:href="#iconUndo"></use></svg>
                            <span style="margin-left: 4px;">恢复默认</span>
                        </button>
                        <button class="b3-button b3-button--cancel" id="cancel-quick-edit-prompt">取消</button>
                        <button class="b3-button b3-button--text" id="save-quick-edit-prompt">保存</button>
                    </div>
                </div>
            </div>
        `;
    }

    //#endregion

    //#region Tab 5: Response Filters

    private createResponseFiltersTab(): string {
        const view = this.filterRulesView;

        // Get rules based on current view
        let displayRules: FilterRule[] = [];
        let presetName = '';

        if (view === 'global') {
            displayRules = this.currentSettings.filterRules || [];
        } else {
            // Preset view
            if (!this.selectedPresetForFilters) {
                // Auto-select first preset with editInstruction
                const allPresets = this.configManager.getAllTemplates();
                const firstPreset = allPresets.find(p => p.editInstruction);
                this.selectedPresetForFilters = firstPreset?.id || (allPresets[0]?.id || null);
            }

            if (this.selectedPresetForFilters) {
                const preset = this.configManager.getAllTemplates().find((p: PromptTemplate) => p.id === this.selectedPresetForFilters);
                if (preset) {
                    displayRules = preset.filterRules || [];
                    presetName = preset.name;
                }
            }
        }

        return `
            <div class="response-filters-tab" style="padding: 16px;">
                <!-- Scope Toggle Tabs -->
                <div style="margin-bottom: 16px;">
                    <div style="display: flex; gap: 8px; border-bottom: 2px solid var(--b3-border-color); padding-bottom: 8px;">
                        <button class="b3-button ${view === 'global' ? 'b3-button--text' : 'b3-button--cancel'}"
                                data-scope="global"
                                style="flex: 1; ${view === 'global' ? 'border-bottom: 3px solid var(--b3-theme-primary);' : ''}">
                            🌐 全局规则
                        </button>
                        <button class="b3-button ${view === 'preset' ? 'b3-button--text' : 'b3-button--cancel'}"
                                data-scope="preset"
                                style="flex: 1; ${view === 'preset' ? 'border-bottom: 3px solid var(--b3-theme-primary);' : ''}">
                            🎨 预设规则
                        </button>
                    </div>
                </div>

                <!-- Scope Info Box -->
                <div style="margin-bottom: 16px; padding: 12px; background: var(--b3-theme-info-light); border-left: 4px solid var(--b3-theme-primary); border-radius: 4px;">
                    ${view === 'global'
                        ? `<div class="ft__smaller">
                            ℹ️ <strong>全局规则</strong>会应用于所有AI请求（Chat、Quick Edit等），无论使用哪个预设。
                           </div>`
                        : `<div class="ft__smaller">
                            ℹ️ <strong>预设规则</strong>仅在预设"<strong>${this.escapeHtml(presetName)}</strong>"激活时生效。<br>
                            📋 <strong>应用顺序</strong>: 全局规则 → 预设规则 → 最终输出
                           </div>`
                    }
                </div>

                ${view === 'preset' ? this.createPresetSelector() : ''}

                <!-- Built-in Templates -->
                <div style="margin-bottom: 16px; padding: 12px; background: var(--b3-theme-surface-lighter); border-radius: 4px;">
                    <div style="font-weight: 500; margin-bottom: 8px;">📚 内置模板（快速添加）</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        <button class="b3-button b3-button--outline filter-template-add" data-template-id="remove-think-tags" style="font-size: 12px;">
                            ➕ 删除 &lt;think&gt; 标签
                        </button>
                        <button class="b3-button b3-button--outline filter-template-add" data-template-id="remove-thinking-tags" style="font-size: 12px;">
                            ➕ 删除 &lt;thinking&gt; 标签
                        </button>
                        <button class="b3-button b3-button--outline filter-template-add" data-template-id="remove-all-tags" style="font-size: 12px;">
                            ➕ 删除所有 XML 标签
                        </button>
                    </div>
                </div>

                <!-- Current Rules List -->
                <div style="margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <div style="font-weight: 500;">当前规则列表 (${displayRules.length})</div>
                        <button class="b3-button b3-button--outline" id="add-filter-rule">
                            <svg><use xlink:href="#iconAdd"></use></svg>
                            <span style="margin-left: 4px;">添加规则</span>
                        </button>
                    </div>

                    <div id="filter-rules-list" style="display: flex; flex-direction: column; gap: 8px;">
                        ${displayRules.length > 0
                            ? displayRules.map((rule, index) => this.createFilterRuleCard(rule, index, view)).join('')
                            : `<div class="ft__secondary" style="padding: 32px; text-align: center; border: 1px dashed var(--b3-border-color); border-radius: 4px;">
                                暂无${view === 'global' ? '全局' : '预设'}过滤规则<br><br>使用上方模板或添加自定义规则
                               </div>`
                        }
                    </div>
                </div>

                <!-- Tips -->
                <div style="margin-top: 16px;">
                    <div class="ft__smaller" style="padding: 12px; background: var(--b3-theme-surface-lighter); border-radius: 4px;">
                        <div style="font-weight: 500; margin-bottom: 8px;">💡 使用提示</div>
                        <ul style="margin: 0; padding-left: 20px; line-height: 1.8;">
                            <li>使用正则表达式匹配需要过滤的内容模式</li>
                            <li>多条规则按从上到下的顺序依次应用</li>
                            <li>全局规则先执行，然后是预设规则</li>
                            <li>可以禁用规则而不删除，方便调试</li>
                            <li>使用测试面板验证规则效果</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;
    }

    private createPresetSelector(): string {
        const allPresets = this.configManager.getAllTemplates();
        const selectedId = this.selectedPresetForFilters || allPresets[0]?.id;

        if (allPresets.length === 0) {
            return `<div class="ft__secondary" style="padding: 12px; text-align: center;">暂无预设，请先创建预设</div>`;
        }

        return `
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">当前预设:</label>
                <select id="preset-filter-selector" class="b3-select" style="width: 100%;">
                    ${allPresets.map(p => `
                        <option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>
                            ${this.escapeHtml(p.name)} ${p.editInstruction ? '✏️' : ''}
                        </option>
                    `).join('')}
                </select>
            </div>
        `;
    }

    private createFilterRuleCard(rule: any, index: number, scope: 'global' | 'preset'): string {
        const patternPreview = rule.pattern.length > 50
            ? rule.pattern.substring(0, 50) + '...'
            : rule.pattern;

        // Scope badge
        const scopeBadge = scope === 'global'
            ? '<span class="b3-chip" style="font-size: 11px; background: var(--b3-theme-primary-light); color: var(--b3-theme-primary);">🌐 Global</span>'
            : '<span class="b3-chip" style="font-size: 11px; background: var(--b3-theme-success-light); color: var(--b3-theme-success);">🎨 Preset</span>';

        return `
            <div class="filter-rule-card" data-rule-index="${index}" style="
                border: 1px solid var(--b3-border-color);
                border-radius: 4px;
                padding: 12px;
                background: var(--b3-theme-surface);
                transition: all 0.2s;
            ">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <label style="display: inline-flex; align-items: center; cursor: pointer;">
                                <input
                                    type="checkbox"
                                    class="filter-rule-toggle"
                                    data-rule-index="${index}"
                                    ${rule.enabled ? 'checked' : ''}
                                    style="margin-right: 6px; cursor: pointer;"
                                >
                                <span style="font-weight: 500; font-size: 14px;">${this.escapeHtml(rule.name)}</span>
                            </label>
                            ${scopeBadge}
                            ${rule.flags ? `<span class="b3-chip" style="font-size: 11px; background: var(--b3-theme-surface-light);">/${rule.flags}</span>` : ''}
                        </div>
                        <div class="ft__smaller" style="color: var(--b3-theme-on-surface-light); margin-bottom: 4px; font-family: 'Consolas', monospace;">
                            📝 匹配: ${this.escapeHtml(patternPreview)}
                        </div>
                        ${rule.replacement ? `
                        <div class="ft__smaller" style="color: var(--b3-theme-on-surface-light); font-family: 'Consolas', monospace;">
                            ➡️ 替换为: ${this.escapeHtml(rule.replacement.substring(0, 50))}${rule.replacement.length > 50 ? '...' : ''}
                        </div>
                        ` : ''}
                    </div>
                    <div style="display: flex; gap: 4px; margin-left: 12px;">
                        <button class="b3-button b3-button--text filter-rule-edit" data-rule-index="${index}" title="编辑规则">
                            <svg><use xlink:href="#iconEdit"></use></svg>
                        </button>
                        <button class="b3-button b3-button--text filter-rule-test" data-rule-index="${index}" title="测试规则">
                            <svg><use xlink:href="#iconPlay"></use></svg>
                        </button>
                        <button class="b3-button b3-button--text filter-rule-delete" data-rule-index="${index}" title="删除规则">
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
        // ===== New Two-Level Tab System =====

        // Main tab switching (Level 1: Presets | Filters)
        container.querySelectorAll('[data-main-tab]').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabId = (e.currentTarget as HTMLElement).dataset.mainTab as MainTabType;
                this.switchMainTab(tabId);
            });
        });

        // Sub tab switching (Level 2: System | Appended | Quick Edit | Selection Q&A)
        container.querySelectorAll('[data-sub-tab]').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabId = (e.currentTarget as HTMLElement).dataset.subTab as SubTabType;
                this.switchSubTab(tabId);
            });
        });

        // Preset selector dropdown
        const presetSelector = container.querySelector('#preset-selector') as HTMLSelectElement;
        if (presetSelector) {
            presetSelector.addEventListener('change', (e) => {
                this.selectedPresetId = (e.target as HTMLSelectElement).value || null;
                this.presetDraftData = {}; // Clear draft when switching presets
                this.renderContent(container);
            });
        }

        // New preset button
        const newPresetBtn = container.querySelector('#new-preset-btn');
        if (newPresetBtn) {
            newPresetBtn.addEventListener('click', () => this.handleNewPreset());
        }

        // Delete preset button
        const deletePresetBtn = container.querySelector('#delete-preset-btn');
        if (deletePresetBtn) {
            deletePresetBtn.addEventListener('click', () => this.handleDeletePreset());
        }

        // Apply preset button
        const applyPresetBtn = container.querySelector('#apply-preset-btn');
        if (applyPresetBtn) {
            applyPresetBtn.addEventListener('click', () => this.handleApplyPreset());
        }

        // Save sub-tab button
        const saveBtn = container.querySelector('#save-sub-tab-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.handleSaveSubTab(container));
        }

        // Textarea character count update
        const textarea = container.querySelector('textarea');
        if (textarea) {
            const charCountSpan = container.querySelector('#char-count');
            if (charCountSpan) {
                textarea.addEventListener('input', () => {
                    charCountSpan.textContent = textarea.value.length.toString();
                });
            }
        }

        // ===== Legacy Tab System (keep for backward compatibility) =====

        // Old tab switching
        container.querySelectorAll('.prompt-editor-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabId = (e.currentTarget as HTMLElement).dataset.tab as TabType;
                this.switchTab(tabId);
            });
        });

        // Legacy listeners
        this.attachPresetsListeners(container);
        this.attachSystemPromptListeners(container);
        this.attachAppendedPromptListeners(container);
        this.attachQuickEditPromptListeners(container);
        this.attachResponseFiltersListeners(container);
    }

    private attachPresetsListeners(container: HTMLElement): void {
        // Add new preset
        const addBtn = container.querySelector('#add-preset');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.showPresetEditDialog());
        }

        // Export all presets (old button, keep for backward compatibility)
        const exportAllBtn = container.querySelector('#export-all-presets');
        if (exportAllBtn) {
            exportAllBtn.addEventListener('click', () => this.exportAllPresets());
        }

        // Import presets (new button in preset selector)
        const importBtn = container.querySelector('#import-presets-btn');
        if (importBtn) {
            importBtn.addEventListener('click', () => this.importPresets());
        }

        // Export current preset (new button in preset selector)
        const exportCurrentBtn = container.querySelector('#export-current-preset-btn');
        if (exportCurrentBtn) {
            exportCurrentBtn.addEventListener('click', () => this.exportCurrentPreset());
        }

        // Import presets (old button, keep for backward compatibility)
        const importBtnOld = container.querySelector('#import-presets');
        if (importBtnOld) {
            importBtnOld.addEventListener('click', () => this.importPresets());
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

    private attachQuickEditPromptListeners(container: HTMLElement): void {
        const editor = container.querySelector('#quick-edit-prompt-editor') as HTMLTextAreaElement;
        const lengthDisplay = container.querySelector('#quick-edit-prompt-length');

        if (editor && lengthDisplay) {
            editor.addEventListener('input', () => {
                lengthDisplay.textContent = editor.value.length.toString();
            });
        }

        const saveBtn = container.querySelector('#save-quick-edit-prompt');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                if (editor) {
                    this.currentSettings.quickEditPromptTemplate = editor.value;
                    this.onSave({ quickEditPromptTemplate: editor.value });
                    showMessage("✅ 快速编辑提示词模板已保存", 2000, "info");
                }
            });
        }

        const cancelBtn = container.querySelector('#cancel-quick-edit-prompt');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                if (editor) {
                    editor.value = this.currentSettings.quickEditPromptTemplate || `{instruction}

原文：
{original}

重要：只返回修改后的完整文本，不要添加任何前言、说明、解释或格式标记（如"以下是..."、"主要改进："等）。直接输出修改后的文本内容即可。`;
                    if (lengthDisplay) lengthDisplay.textContent = editor.value.length.toString();
                }
            });
        }

        const resetBtn = container.querySelector('#reset-quick-edit-prompt');
        if (resetBtn && editor) {
            resetBtn.addEventListener('click', () => {
                editor.value = `{instruction}

原文：
{original}

重要：只返回修改后的完整文本，不要添加任何前言、说明、解释或格式标记（如"以下是..."、"主要改进："等）。直接输出修改后的文本内容即可。`;
                if (lengthDisplay) lengthDisplay.textContent = editor.value.length.toString();
            });
        }
    }

    private attachResponseFiltersListeners(container: HTMLElement): void {
        // Tab toggle buttons (Global/Preset scope)
        container.querySelectorAll('[data-scope]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const scope = (e.currentTarget as HTMLElement).dataset.scope as 'global' | 'preset';
                if (scope !== this.filterRulesView) {
                    this.filterRulesView = scope;
                    this.switchTab('responseFilters'); // Re-render tab with new scope
                }
            });
        });

        // Preset selector (only visible in preset view)
        const presetSelector = container.querySelector('#preset-filter-selector');
        if (presetSelector) {
            presetSelector.addEventListener('change', (e) => {
                this.selectedPresetForFilters = (e.target as HTMLSelectElement).value;
                this.switchTab('responseFilters'); // Re-render with new preset
            });
        }

        // Add new filter rule (scope-aware)
        const addBtn = container.querySelector('#add-filter-rule');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.showFilterRuleDialog());
        }

        // Add from template (scope-aware)
        container.querySelectorAll('.filter-template-add').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const templateId = (e.currentTarget as HTMLElement).dataset.templateId;
                if (templateId) this.addFilterRuleFromTemplate(templateId);
            });
        });

        // Toggle rule enabled/disabled (scope-aware)
        container.querySelectorAll('.filter-rule-toggle').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const index = parseInt((e.currentTarget as HTMLElement).dataset.ruleIndex || '0');
                this.toggleFilterRule(index, (e.currentTarget as HTMLInputElement).checked);
            });
        });

        // Edit rule (scope-aware)
        container.querySelectorAll('.filter-rule-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt((e.currentTarget as HTMLElement).dataset.ruleIndex || '0');
                this.showFilterRuleDialog(index);
            });
        });

        // Test rule (scope-aware)
        container.querySelectorAll('.filter-rule-test').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt((e.currentTarget as HTMLElement).dataset.ruleIndex || '0');
                this.showFilterRuleTest(index);
            });
        });

        // Delete rule (scope-aware)
        container.querySelectorAll('.filter-rule-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt((e.currentTarget as HTMLElement).dataset.ruleIndex || '0');
                this.deleteFilterRule(index);
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
                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 8px;">输入框提示文本</label>
                            <input type="text" id="template-input-placeholder" class="b3-text-field" placeholder="例如: 输入编辑指令..." style="width: 100%;" value="${this.escapeHtml(template?.inputPlaceholder || '')}" />
                            <div class="ft__smaller ft__secondary" style="margin-top: 4px;">
                                快速编辑输入框中显示的占位符提示文本
                            </div>
                        </div>
                        <div style="display: flex; align-items: center;">
                            <input type="checkbox" id="template-show-diff" ${template?.showDiff ? 'checked' : ''} style="margin-right: 8px;">
                            <label for="template-show-diff">启用差异对比显示</label>
                        </div>
                    </div>

                    <div style="border-top: 1px solid var(--b3-border-color); padding-top: 16px; margin-top: 16px; margin-bottom: 16px;">
                        <div style="margin-bottom: 8px; display: flex; align-items: center;">
                            <span style="font-weight: 500; margin-right: 8px;">💬 Selection Q&A 模板配置</span>
                            <span class="ft__smaller ft__secondary">(可选)</span>
                        </div>
                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 8px;">Selection Q&A 模板</label>
                            <textarea id="template-selection-qa-template" class="b3-text-field" rows="6" placeholder="支持占位符: {selection}, {question}, {above_blocks=n}, {below_blocks=n}, {above=n}, {below=n}, {custom=((blockid 'name'))}" style="width: 100%; font-family: 'Consolas', monospace; font-size: 13px;">${template?.selectionQATemplate || ''}</textarea>
                            <div class="ft__smaller ft__secondary" style="margin-top: 4px;">
                                定义 Selection Q&A 模式下如何构建 AI 请求。留空使用默认格式。<br>
                                支持的占位符：<br>
                                • <code>{selection}</code> - 选中的内容<br>
                                • <code>{question}</code> - 用户问题<br>
                                • <code>{above_blocks=2}</code> - 选中块之前的 2 个块<br>
                                • <code>{below_blocks=2}</code> - 选中块之后的 2 个块<br>
                                • <code>{above=5}</code> - 选中内容之前的 5 行文本<br>
                                • <code>{below=5}</code> - 选中内容之后的 5 行文本<br>
                                • <code>{custom=((blockid 'name'))}</code> - 引用指定块的内容
                            </div>
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
        const inputPlaceholderInput = editDialog.element.querySelector('#template-input-placeholder') as HTMLInputElement;
        const showDiffCheckbox = editDialog.element.querySelector('#template-show-diff') as HTMLInputElement;
        const selectionQATemplateTextarea = editDialog.element.querySelector('#template-selection-qa-template') as HTMLTextAreaElement;
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
            const inputPlaceholder = inputPlaceholderInput?.value.trim() || undefined;
            const showDiff = showDiffCheckbox?.checked || false;
            const selectionQATemplate = selectionQATemplateTextarea?.value.trim() || undefined;

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
                inputPlaceholder,
                showDiff,
                selectionQATemplate
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
     * Export currently selected preset from dropdown
     */
    private exportCurrentPreset(): void {
        if (!this.selectedPresetId) {
            showMessage("❌ 请先选择一个预设", 2000, "error");
            return;
        }

        // Reuse existing exportPreset method
        this.exportPreset(this.selectedPresetId);
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

                // Notify presets changed to refresh UI in QuickEditManager and UnifiedAIPanel
                if (this.onPresetsChanged) {
                    this.onPresetsChanged();
                }

                // Refresh presets tab
                this.loadCustomTemplates();
                const container = this.dialog?.element.querySelector("#prompt-editor-container");
                if (container) {
                    this.renderContent(container as HTMLElement);
                }
            } catch (error) {
                console.error('[PromptEditor] Import error:', error);
                showMessage("❌ 导入失败: " + error.message, 3000, "error");
            }
        };

        input.click();
    }

    //#endregion

    //#region Filter Rule Methods

    /**
     * Show dialog to create or edit a filter rule
     */
    private showFilterRuleDialog(ruleIndex?: number): void {
        // Get filter rules based on current scope
        const scope = this.filterRulesView;
        let filterRules: FilterRule[] = [];
        let targetPreset: any = null;

        if (scope === 'global') {
            filterRules = this.currentSettings.filterRules || [];
        } else {
            // Preset scope
            if (!this.selectedPresetForFilters) {
                showMessage("❌ 请先选择预设", 2000, "error");
                return;
            }
            targetPreset = this.configManager.getAllTemplates().find((p: any) => p.id === this.selectedPresetForFilters);
            if (!targetPreset) {
                showMessage("❌ 预设不存在", 2000, "error");
                return;
            }
            filterRules = targetPreset.filterRules || [];
        }

        const isEdit = ruleIndex !== undefined;
        const rule = isEdit ? filterRules[ruleIndex] : null;

        const dialog = new Dialog({
            title: isEdit ? "✏️ 编辑过滤规则" : "➕ 添加过滤规则",
            content: `
                <div class="filter-rule-dialog" style="padding: 16px;">
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">规则名称</label>
                        <input 
                            type="text" 
                            id="filter-rule-name" 
                            class="b3-text-field" 
                            value="${rule ? this.escapeHtml(rule.name) : ''}" 
                            placeholder="例如：删除思考标签"
                            style="width: 100%;"
                        >
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">正则表达式</label>
                        <textarea 
                            id="filter-rule-pattern" 
                            class="b3-text-field"
                            rows="3"
                            placeholder="例如：<think>.*?</think>"
                            style="width: 100%; font-family: 'Consolas', monospace; font-size: 13px;"
                        >${rule ? this.escapeHtml(rule.pattern) : ''}</textarea>
                        <div class="ft__smaller ft__secondary" style="margin-top: 4px;">
                            支持JavaScript正则表达式语法，点 . 匹配所有字符
                        </div>
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">替换文本</label>
                        <input 
                            type="text" 
                            id="filter-rule-replacement" 
                            class="b3-text-field" 
                            value="${rule ? this.escapeHtml(rule.replacement) : ''}" 
                            placeholder="留空表示删除匹配内容"
                            style="width: 100%; font-family: 'Consolas', monospace; font-size: 13px;"
                        >
                        <div class="ft__smaller ft__secondary" style="margin-top: 4px;">
                            支持捕获组引用（\\1, \\2 等）
                        </div>
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">标志</label>
                        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                                <input type="checkbox" id="flag-g" ${rule?.flags?.includes('g') ? 'checked' : 'checked'} style="cursor: pointer;">
                                <span><code>g</code> - 全局匹配</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                                <input type="checkbox" id="flag-i" ${rule?.flags?.includes('i') ? 'checked' : 'checked'} style="cursor: pointer;">
                                <span><code>i</code> - 忽略大小写</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                                <input type="checkbox" id="flag-s" ${rule?.flags?.includes('s') ? 'checked' : 'checked'} style="cursor: pointer;">
                                <span><code>s</code> - 点匹配换行</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                                <input type="checkbox" id="flag-m" ${rule?.flags?.includes('m') ? 'checked' : ''} style="cursor: pointer;">
                                <span><code>m</code> - 多行模式</span>
                            </label>
                        </div>
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="filter-rule-enabled" ${rule?.enabled !== false ? 'checked' : ''} style="cursor: pointer;">
                            <span style="font-weight: 500;">启用此规则</span>
                        </label>
                    </div>

                    <div style="margin-top: 16px;">
                        <div class="ft__smaller" style="padding: 12px; background: var(--b3-theme-surface-lighter); border-radius: 4px;">
                            <div style="font-weight: 500; margin-bottom: 8px;">💡 示例</div>
                            <div style="background: var(--b3-theme-background); padding: 8px; border-radius: 4px; font-family: monospace; font-size: 12px; margin-bottom: 8px;">
                                <div style="color: var(--b3-theme-on-surface-light);">// 删除 &lt;think&gt; 标签及其内容</div>
                                <div>正则: &lt;think&gt;.*?&lt;/think&gt;</div>
                                <div>替换: (留空)</div>
                                <div>标志: g, i, s</div>
                            </div>
                            <div style="background: var(--b3-theme-background); padding: 8px; border-radius: 4px; font-family: monospace; font-size: 12px;">
                                <div style="color: var(--b3-theme-on-surface-light);">// 替换代码块标记</div>
                                <div>正则: \`\`\`(\w+)</div>
                                <div>替换: [CODE:\\1]</div>
                                <div>标志: g</div>
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;">
                        <button class="b3-button b3-button--cancel" id="filter-rule-cancel">取消</button>
                        <button class="b3-button b3-button--text" id="filter-rule-save">💾 保存</button>
                    </div>
                </div>
            `,
            width: "700px"
        });

        const nameInput = dialog.element.querySelector('#filter-rule-name') as HTMLInputElement;
        const patternInput = dialog.element.querySelector('#filter-rule-pattern') as HTMLTextAreaElement;
        const replacementInput = dialog.element.querySelector('#filter-rule-replacement') as HTMLInputElement;
        const enabledCheckbox = dialog.element.querySelector('#filter-rule-enabled') as HTMLInputElement;
        const flagG = dialog.element.querySelector('#flag-g') as HTMLInputElement;
        const flagI = dialog.element.querySelector('#flag-i') as HTMLInputElement;
        const flagS = dialog.element.querySelector('#flag-s') as HTMLInputElement;
        const flagM = dialog.element.querySelector('#flag-m') as HTMLInputElement;
        const saveBtn = dialog.element.querySelector('#filter-rule-save');
        const cancelBtn = dialog.element.querySelector('#filter-rule-cancel');

        saveBtn?.addEventListener('click', () => {
            const name = nameInput?.value.trim();
            const pattern = patternInput?.value.trim();
            const replacement = replacementInput?.value || '';
            const enabled = enabledCheckbox?.checked !== false;

            if (!name) {
                showMessage("❌ 请输入规则名称", 2000, "error");
                return;
            }

            if (!pattern) {
                showMessage("❌ 请输入正则表达式", 2000, "error");
                return;
            }

            // Build flags string
            let flags = '';
            if (flagG?.checked) flags += 'g';
            if (flagI?.checked) flags += 'i';
            if (flagS?.checked) flags += 's';
            if (flagM?.checked) flags += 'm';

            // Validate regex (including ReDoS protection)
            const validation = responseFilter.validatePattern(pattern, flags);
            if (!validation.valid) {
                showMessage(`❌ ${validation.error}`, 3000, "error");
                return;
            }

            const newRule = {
                id: rule?.id || `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name,
                pattern,
                replacement,
                flags,
                enabled
            };

            // Update rules in the correct scope
            const updatedFilterRules = [...filterRules];

            if (isEdit) {
                updatedFilterRules[ruleIndex!] = newRule;
            } else {
                updatedFilterRules.push(newRule);
            }

            // Save to correct scope
            if (scope === 'global') {
                // Update global settings
                this.currentSettings.filterRules = updatedFilterRules;
                this.onSave({ filterRules: updatedFilterRules });
            } else {
                // Update preset filterRules
                targetPreset.filterRules = updatedFilterRules;
                this.configManager.updateTemplate(targetPreset.id, targetPreset);
            }

            showMessage(`✅ 规则已${isEdit ? '更新' : '添加'} (${scope === 'global' ? '全局' : '预设'})`, 2000, "info");
            dialog.destroy();

            // Refresh response filters tab
            this.switchTab('responseFilters');
        });

        cancelBtn?.addEventListener('click', () => {
            dialog.destroy();
        });
    }

    /**
     * Add a filter rule from built-in template (scope-aware)
     */
    private addFilterRuleFromTemplate(templateId: string): void {
        const template = BUILTIN_FILTER_TEMPLATES.find(t => t.id === templateId);

        if (!template) {
            showMessage("❌ 模板不存在", 2000, "error");
            return;
        }

        // Get filter rules based on current scope
        const scope = this.filterRulesView;
        let filterRules: FilterRule[] = [];
        let targetPreset: any = null;

        if (scope === 'global') {
            filterRules = this.currentSettings.filterRules || [];
        } else {
            // Preset scope
            if (!this.selectedPresetForFilters) {
                showMessage("❌ 请先选择预设", 2000, "error");
                return;
            }
            targetPreset = this.configManager.getAllTemplates().find((p: any) => p.id === this.selectedPresetForFilters);
            if (!targetPreset) {
                showMessage("❌ 预设不存在", 2000, "error");
                return;
            }
            filterRules = targetPreset.filterRules || [];
        }

        // Check if rule already exists
        const exists = filterRules.some(r => r.pattern === template.pattern);

        if (exists) {
            showMessage("⚠️ 相同的规则已存在", 2000, "warning");
            return;
        }

        // Add rule
        const newRule = {
            ...template,
            id: `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };

        const updatedFilterRules = [...filterRules, newRule];

        // Save to correct scope
        if (scope === 'global') {
            this.currentSettings.filterRules = updatedFilterRules;
            this.onSave({ filterRules: updatedFilterRules });
        } else {
            targetPreset.filterRules = updatedFilterRules;
            this.configManager.updateTemplate(targetPreset.id, targetPreset);
        }

        showMessage(`✅ 已添加规则: ${template.name} (${scope === 'global' ? '全局' : '预设'})`, 2000, "info");

        // Refresh response filters tab
        this.switchTab('responseFilters');
    }

    /**
     * Toggle a filter rule on/off (scope-aware)
     */
    private toggleFilterRule(index: number, enabled: boolean): void {
        // Get filter rules based on current scope
        const scope = this.filterRulesView;
        let filterRules: FilterRule[] = [];
        let targetPreset: any = null;

        if (scope === 'global') {
            filterRules = this.currentSettings.filterRules || [];
        } else {
            // Preset scope
            if (!this.selectedPresetForFilters) return;
            targetPreset = this.configManager.getAllTemplates().find((p: any) => p.id === this.selectedPresetForFilters);
            if (!targetPreset) return;
            filterRules = targetPreset.filterRules || [];
        }

        if (index < 0 || index >= filterRules.length) return;

        filterRules[index].enabled = enabled;

        // Save to correct scope
        if (scope === 'global') {
            this.currentSettings.filterRules = filterRules;
            this.onSave({ filterRules });
        } else {
            targetPreset.filterRules = filterRules;
            this.configManager.updateTemplate(targetPreset.id, targetPreset);
        }

        console.log(`[PromptEditor] Filter rule ${index} ${enabled ? 'enabled' : 'disabled'} (${scope})`);
    }

    /**
     * Delete a filter rule (scope-aware)
     */
    private deleteFilterRule(index: number): void {
        // Get filter rules based on current scope
        const scope = this.filterRulesView;
        let filterRules: FilterRule[] = [];
        let targetPreset: any = null;

        if (scope === 'global') {
            filterRules = this.currentSettings.filterRules || [];
        } else {
            // Preset scope
            if (!this.selectedPresetForFilters) return;
            targetPreset = this.configManager.getAllTemplates().find((p: any) => p.id === this.selectedPresetForFilters);
            if (!targetPreset) return;
            filterRules = targetPreset.filterRules || [];
        }

        if (index < 0 || index >= filterRules.length) return;

        const rule = filterRules[index];

        confirm(
            "确认删除",
            `确定要删除规则"${rule.name}"吗？`,
            () => {
                const updatedFilterRules = filterRules.filter((_, i) => i !== index);

                // Save to correct scope
                if (scope === 'global') {
                    this.currentSettings.filterRules = updatedFilterRules;
                    this.onSave({ filterRules: updatedFilterRules });
                } else {
                    targetPreset.filterRules = updatedFilterRules;
                    this.configManager.updateTemplate(targetPreset.id, targetPreset);
                }

                showMessage(`✅ 规则已删除 (${scope === 'global' ? '全局' : '预设'})`, 2000, "info");

                // Refresh response filters tab
                this.switchTab('responseFilters');
            }
        );
    }

    /**
     * Show test dialog for a filter rule (scope-aware)
     */
    private showFilterRuleTest(index: number): void {
        // Get filter rules based on current scope
        const scope = this.filterRulesView;
        let filterRules: FilterRule[] = [];

        if (scope === 'global') {
            filterRules = this.currentSettings.filterRules || [];
        } else {
            // Preset scope
            if (!this.selectedPresetForFilters) return;
            const targetPreset = this.configManager.getAllTemplates().find((p: any) => p.id === this.selectedPresetForFilters);
            if (!targetPreset) return;
            filterRules = targetPreset.filterRules || [];
        }

        if (index < 0 || index >= filterRules.length) return;

        const rule = filterRules[index];

        const testDialog = new Dialog({
            title: `🧪 测试规则: ${rule.name}`,
            content: `
                <div class="filter-rule-test-dialog" style="padding: 16px;">
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">输入测试文本</label>
                        <textarea 
                            id="test-input" 
                            class="b3-text-field"
                            rows="6"
                            placeholder="输入要测试的文本..."
                            style="width: 100%; font-family: 'Consolas', monospace; font-size: 13px;"
                        ><think>这是思考内容</think>这是保留的正文</textarea>
                    </div>

                    <div style="margin-bottom: 16px;">
                        <button class="b3-button b3-button--text" id="run-test" style="width: 100%;">
                            ▶️ 运行测试
                        </button>
                    </div>

                    <div id="test-result-container" style="display: none;">
                        <div style="margin-bottom: 8px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: 500;">过滤结果</label>
                            <div 
                                id="test-output" 
                                style="
                                    padding: 12px; 
                                    background: var(--b3-theme-surface-lighter); 
                                    border-radius: 4px; 
                                    font-family: 'Consolas', monospace; 
                                    font-size: 13px;
                                    white-space: pre-wrap;
                                    word-break: break-word;
                                    min-height: 60px;
                                "
                            ></div>
                        </div>

                        <div style="margin-top: 12px;">
                            <div class="ft__smaller" style="padding: 8px; background: var(--b3-theme-surface); border-radius: 4px;">
                                <div id="test-stats"></div>
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
                        <button class="b3-button b3-button--cancel" id="test-close">关闭</button>
                    </div>
                </div>
            `,
            width: "700px"
        });

        const inputTextarea = testDialog.element.querySelector('#test-input') as HTMLTextAreaElement;
        const runBtn = testDialog.element.querySelector('#run-test');
        const resultContainer = testDialog.element.querySelector('#test-result-container') as HTMLElement;
        const outputDiv = testDialog.element.querySelector('#test-output') as HTMLElement;
        const statsDiv = testDialog.element.querySelector('#test-stats') as HTMLElement;
        const closeBtn = testDialog.element.querySelector('#test-close');

        runBtn?.addEventListener('click', () => {
            const inputText = inputTextarea?.value || '';
            
            try {
                const regex = new RegExp(rule.pattern, rule.flags);
                const outputText = inputText.replace(regex, rule.replacement);
                const matchCount = (inputText.match(regex) || []).length;

                outputDiv.textContent = outputText;
                statsDiv.innerHTML = `
                    <div>✅ 正则表达式有效</div>
                    <div>🎯 匹配次数: ${matchCount}</div>
                    <div>📊 原文长度: ${inputText.length} → 结果长度: ${outputText.length}</div>
                    ${matchCount > 0 ? `<div>🔧 改变了 ${inputText.length - outputText.length} 个字符</div>` : '<div>⚠️ 没有匹配内容</div>'}
                `;

                resultContainer.style.display = 'block';
            } catch (error) {
                outputDiv.textContent = `❌ 错误: ${error.message}`;
                statsDiv.innerHTML = '<div style="color: var(--b3-theme-error);">正则表达式执行失败</div>';
                resultContainer.style.display = 'block';
            }
        });

        closeBtn?.addEventListener('click', () => {
            testDialog.destroy();
        });
    }

    /**
     * Escape HTML to prevent XSS
     */
    private escapeHtml(text: string): string {
        return SecurityUtils.escapeHtml(text);
    }

    //#endregion

    //#region New Two-Level Tab System Methods

    /**
     * Create main tab bar (Level 1: Presets | Filters)
     */
    private createMainTabBar(): string {
        const tabs = [
            { id: "presets", label: "提示词预设", icon: "iconList" },
            { id: "filters", label: "响应过滤", icon: "iconFilter" }
        ];

        return `
            <div class="b3-tab-bar prompt-editor-main-tabs" style="background: var(--b3-theme-background); border-bottom: 1px solid var(--b3-border-color); padding: 0 16px;">
                ${tabs.map(tab => `
                    <div class="b3-tab-bar__item ${this.activeMainTab === tab.id ? 'b3-tab-bar__item--active' : ''}"
                         data-main-tab="${tab.id}"
                         style="display: flex; align-items: center; gap: 6px; padding: 12px 16px; cursor: pointer;">
                        <svg style="width: 16px; height: 16px;"><use xlink:href="#${tab.icon}"></use></svg>
                        <span>${tab.label}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    /**
     * Create main tab content based on active main tab
     */
    private createMainTabContent(): string {
        switch (this.activeMainTab) {
            case "presets":
                return this.createPresetsManagementView();
            case "filters":
                return this.createResponseFiltersTab(); // Existing method
            default:
                return "";
        }
    }

    /**
     * Create presets management view with two-level tab system
     */
    private createPresetsManagementView(): string {
        const allPresets = this.configManager.getAllTemplates();
        const selectedPreset = this.selectedPresetId
            ? allPresets.find(p => p.id === this.selectedPresetId)
            : null;

        // Build preset options for selector
        const presetOptions = allPresets.map(preset =>
            `<option value="${preset.id}" ${this.selectedPresetId === preset.id ? 'selected' : ''}>
                ${preset.icon || '📝'} ${this.escapeHtml(preset.name)}
            </option>`
        ).join('');

        return `
            <div class="presets-management-container">
                ${this.createPresetSelectorSection(presetOptions, selectedPreset)}
                ${this.createSubTabBar()}
                ${this.createSubTabContent(selectedPreset)}
            </div>
        `;
    }

    /**
     * Create preset selector section with action buttons
     */
    private createPresetSelectorSection(presetOptions: string, selectedPreset: PromptTemplate | null): string {
        const activePreset = this.configManager.getAllTemplates().find(p => this.isActivePreset(p));
        const activeIndicator = activePreset
            ? `<div style="margin-top: 12px; padding: 8px 12px; background: var(--b3-theme-primary-lightest); border-left: 3px solid var(--b3-theme-primary); border-radius: 4px;">
                   <span class="ft__smaller">💡 当前使用中的预设: <strong>${activePreset.icon || ''} ${this.escapeHtml(activePreset.name)}</strong></span>
               </div>`
            : '';

        return `
            <div class="preset-selector-section" style="padding: 16px; border-bottom: 1px solid var(--b3-border-color); background: var(--b3-theme-surface);">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px;">
                    <div style="flex: 1; max-width: 400px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">当前编辑预设</label>
                        <select id="preset-selector" class="b3-select" style="width: 100%;">
                            <option value="">-- 选择预设 --</option>
                            ${presetOptions}
                        </select>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="b3-button b3-button--outline" id="new-preset-btn" title="新建预设">
                            <svg class="fn__size200"><use xlink:href="#iconAdd"></use></svg>
                            <span style="margin-left: 4px;">新建</span>
                        </button>
                        <button class="b3-button b3-button--outline" id="delete-preset-btn"
                                ${!selectedPreset || selectedPreset.isBuiltIn ? 'disabled' : ''} title="删除预设">
                            <svg class="fn__size200"><use xlink:href="#iconTrashcan"></use></svg>
                            <span style="margin-left: 4px;">删除</span>
                        </button>
                        <button class="b3-button b3-button--text" id="import-presets-btn" title="从JSON文件导入预设">
                            <svg class="fn__size200"><use xlink:href="#iconUpload"></use></svg>
                            <span style="margin-left: 4px;">导入</span>
                        </button>
                        <button class="b3-button b3-button--text" id="export-current-preset-btn"
                                ${!selectedPreset ? 'disabled' : ''} title="导出当前选中的预设">
                            <svg class="fn__size200"><use xlink:href="#iconDownload"></use></svg>
                            <span style="margin-left: 4px;">导出</span>
                        </button>
                        <button class="b3-button b3-button--text" id="apply-preset-btn"
                                ${!selectedPreset ? 'disabled' : ''} title="应用到当前配置">
                            <svg class="fn__size200"><use xlink:href="#iconCheck"></use></svg>
                            <span style="margin-left: 4px;">应用预设</span>
                        </button>
                    </div>
                </div>
                ${activeIndicator}
            </div>
        `;
    }

    /**
     * Create sub-tab bar (Level 2: System | Appended | Quick Edit | Selection Q&A)
     */
    private createSubTabBar(): string {
        const subTabs = [
            { id: "system", label: "系统提示词" },
            { id: "appended", label: "追加提示词" },
            { id: "quickEdit", label: "快速编辑模版" },
            { id: "selectionQA", label: "Selection Q&A 模版" }
        ];

        return `
            <div class="b3-tab-bar prompt-editor-sub-tabs" style="padding: 0 16px; margin-top: 16px; border-bottom: 2px solid var(--b3-border-color);">
                ${subTabs.map(tab => `
                    <div class="b3-tab-bar__item ${this.activeSubTab === tab.id ? 'b3-tab-bar__item--active' : ''}"
                         data-sub-tab="${tab.id}"
                         style="font-size: 13px; padding: 8px 12px; cursor: pointer; color: ${this.activeSubTab === tab.id ? 'var(--b3-theme-primary)' : 'var(--b3-theme-on-surface-light)'};">
                        ${tab.label}
                    </div>
                `).join('')}
            </div>
        `;
    }

    /**
     * Create sub-tab content based on active sub-tab
     */
    private createSubTabContent(selectedPreset: PromptTemplate | null): string {
        if (!selectedPreset) {
            return `
                <div class="b3-tab-container" style="padding: 40px; text-align: center;">
                    <div class="ft__secondary" style="font-size: 14px;">
                        <svg style="width: 48px; height: 48px; margin-bottom: 16px; opacity: 0.3;"><use xlink:href="#iconInfo"></use></svg>
                        <div>请先选择或创建一个预设</div>
                    </div>
                </div>
            `;
        }

        // Merge draft data with preset data
        const data = { ...selectedPreset, ...this.presetDraftData };

        let content = '';
        switch (this.activeSubTab) {
            case "system":
                content = this.createSystemPromptSubTab(data);
                break;
            case "appended":
                content = this.createAppendedPromptSubTab(data);
                break;
            case "quickEdit":
                content = this.createQuickEditSubTab(data);
                break;
            case "selectionQA":
                content = this.createSelectionQASubTab(data);
                break;
        }

        return `<div class="b3-tab-container" style="padding: 16px;"><div class="sub-tab-content" style="max-width: 900px; margin: 0 auto;">${content}</div></div>`;
    }

    /**
     * Create system prompt sub-tab content
     */
    private createSystemPromptSubTab(preset: PromptTemplate): string {
        const charCount = preset.systemPrompt?.length || 0;
        return `
            <div style="margin-bottom: 12px;">
                <h4 style="margin: 0 0 8px 0; font-size: 15px;">系统提示词</h4>
                <div class="ft__smaller ft__secondary">定义 AI 的角色、行为和回应风格</div>
            </div>
            <textarea
                id="system-prompt-textarea"
                class="b3-text-field"
                rows="12"
                style="width: 100%; font-family: Consolas, monospace; font-size: 13px; resize: vertical;"
                placeholder="You are a helpful assistant...">${this.escapeHtml(preset.systemPrompt || '')}</textarea>
            <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center;">
                <span class="ft__smaller ft__secondary">
                    字符数: <span id="char-count">${charCount}</span>
                </span>
                <button class="b3-button b3-button--text" id="save-sub-tab-btn">
                    <svg class="fn__size200"><use xlink:href="#iconSave"></use></svg>
                    <span style="margin-left: 4px;">保存</span>
                </button>
            </div>
        `;
    }

    /**
     * Create appended prompt sub-tab content
     */
    private createAppendedPromptSubTab(preset: PromptTemplate): string {
        const charCount = preset.appendedPrompt?.length || 0;
        return `
            <div style="margin-bottom: 12px;">
                <h4 style="margin: 0 0 8px 0; font-size: 15px;">追加提示词</h4>
                <div class="ft__smaller ft__secondary">自动附加到每次用户请求末尾的指令</div>
            </div>
            <textarea
                id="appended-prompt-textarea"
                class="b3-text-field"
                rows="8"
                style="width: 100%; font-family: Consolas, monospace; font-size: 13px; resize: vertical;"
                placeholder="请用清晰的 Markdown 格式回复...">${this.escapeHtml(preset.appendedPrompt || '')}</textarea>
            <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center;">
                <span class="ft__smaller ft__secondary">
                    字符数: <span id="char-count">${charCount}</span>
                </span>
                <button class="b3-button b3-button--text" id="save-sub-tab-btn">
                    <svg class="fn__size200"><use xlink:href="#iconSave"></use></svg>
                    <span style="margin-left: 4px;">保存</span>
                </button>
            </div>
        `;
    }

    /**
     * Create quick edit template sub-tab content
     */
    private createQuickEditSubTab(preset: PromptTemplate): string {
        const defaultTemplate = `{instruction}

原文：
{original}

重要：只返回修改后的完整文本，不要添加任何解释或说明。`;
        return `
            <div style="margin-bottom: 12px;">
                <h4 style="margin: 0 0 8px 0; font-size: 15px;">快速编辑模版</h4>
                <div class="ft__smaller ft__secondary">
                    支持占位符: <code>{instruction}</code>, <code>{original}</code>, <code>{above=n}</code>, <code>{below=n}</code>, <code>{above_blocks=n}</code>, <code>{below_blocks=n}</code>, <code>{custom=((blockid 'name'))}</code>
                </div>
            </div>
            <textarea
                id="quick-edit-template-textarea"
                class="b3-text-field"
                rows="10"
                style="width: 100%; font-family: Consolas, monospace; font-size: 13px; resize: vertical;"
                placeholder="${this.escapeHtml(defaultTemplate)}">${this.escapeHtml(preset.editInstruction || '')}</textarea>
            <div style="margin-top: 12px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">输入框提示文本</label>
                <input
                    type="text"
                    id="input-placeholder-input"
                    class="b3-text-field"
                    placeholder="例如: 输入编辑指令..."
                    style="width: 100%;"
                    value="${this.escapeHtml(preset.inputPlaceholder || '')}" />
                <div class="ft__smaller ft__secondary" style="margin-top: 4px;">
                    快速编辑输入框中显示的占位符提示文本
                </div>
            </div>
            <div style="margin-top: 8px;">
                <label style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="show-diff-checkbox" ${preset.showDiff ? 'checked' : ''}>
                    <span>启用差异对比显示</span>
                </label>
            </div>
            <div style="margin-top: 12px; display: flex; justify-content: flex-end;">
                <button class="b3-button b3-button--text" id="save-sub-tab-btn">
                    <svg class="fn__size200"><use xlink:href="#iconSave"></use></svg>
                    <span style="margin-left: 4px;">保存</span>
                </button>
            </div>
        `;
    }

    /**
     * Create Selection Q&A template sub-tab content
     */
    private createSelectionQASubTab(preset: PromptTemplate): string {
        const defaultTemplate = `以下是选中的内容：

{selection}

---

用户问题：{question}`;
        return `
            <div style="margin-bottom: 12px;">
                <h4 style="margin: 0 0 8px 0; font-size: 15px;">Selection Q&A 模版</h4>
                <div class="ft__smaller ft__secondary">
                    支持占位符: <code>{selection}</code>, <code>{question}</code>, <code>{above_blocks=n}</code>, <code>{below_blocks=n}</code>, <code>{above=n}</code>, <code>{below=n}</code>, <code>{custom=((blockid 'name'))}</code>
                </div>
            </div>
            <textarea
                id="selection-qa-template-textarea"
                class="b3-text-field"
                rows="10"
                style="width: 100%; font-family: Consolas, monospace; font-size: 13px; resize: vertical;"
                placeholder="${this.escapeHtml(defaultTemplate)}">${this.escapeHtml(preset.selectionQATemplate || '')}</textarea>
            <div style="margin-top: 12px; display: flex; justify-content: flex-end;">
                <button class="b3-button b3-button--text" id="save-sub-tab-btn">
                    <svg class="fn__size200"><use xlink:href="#iconSave"></use></svg>
                    <span style="margin-left: 4px;">保存</span>
                </button>
            </div>
        `;
    }

    /**
     * Switch main tab (Level 1)
     */
    private switchMainTab(tabId: MainTabType): void {
        this.activeMainTab = tabId;
        const container = this.dialog?.element.querySelector("#prompt-editor-container");
        if (container) {
            this.renderContent(container as HTMLElement);
        }
    }

    /**
     * Switch sub-tab (Level 2)
     */
    private switchSubTab(tabId: SubTabType): void {
        this.activeSubTab = tabId;
        const container = this.dialog?.element.querySelector("#prompt-editor-container");
        if (container) {
            this.renderContent(container as HTMLElement);
        }
    }

    /**
     * Handle new preset creation
     */
    private handleNewPreset(): void {
        const dialog = new Dialog({
            title: "新建预设",
            content: `
                <div style="padding: 16px;">
                    <div style="margin-bottom: 12px;">
                        <label style="display: block; margin-bottom: 8px;">预设名称</label>
                        <input type="text" id="new-preset-name" class="b3-text-field" style="width: 100%;" placeholder="输入预设名称">
                    </div>
                    <div style="margin-bottom: 12px;">
                        <label style="display: block; margin-bottom: 8px;">描述</label>
                        <input type="text" id="new-preset-desc" class="b3-text-field" style="width: 100%;" placeholder="简短描述（可选）">
                    </div>
                    <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
                        <button class="b3-button b3-button--cancel" id="cancel-new">取消</button>
                        <button class="b3-button b3-button--text" id="confirm-new">创建</button>
                    </div>
                </div>
            `,
            width: "400px"
        });

        dialog.element.querySelector('#cancel-new')?.addEventListener('click', () => dialog.destroy());
        dialog.element.querySelector('#confirm-new')?.addEventListener('click', () => {
            const name = (dialog.element.querySelector('#new-preset-name') as HTMLInputElement).value.trim();
            const description = (dialog.element.querySelector('#new-preset-desc') as HTMLInputElement).value.trim();

            if (!name) {
                showMessage("❌ 请输入预设名称", 2000, "error");
                return;
            }

            // Create new preset
            const newPreset: PromptTemplate = {
                id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name,
                description,
                icon: '📝',
                category: 'custom',
                systemPrompt: '',
                appendedPrompt: '',
                isBuiltIn: false
            };

            this.customTemplates.push(newPreset);
            this.configManager.saveCustomTemplates(this.customTemplates);
            this.selectedPresetId = newPreset.id;
            this.presetDraftData = {};

            // Notify presets changed
            if (this.onPresetsChanged) {
                this.onPresetsChanged();
            }

            dialog.destroy();
            const container = this.dialog?.element.querySelector("#prompt-editor-container");
            if (container) {
                this.renderContent(container as HTMLElement);
            }
            showMessage("✅ 预设创建成功", 2000, "info");
        });
    }

    /**
     * Handle preset deletion
     */
    private handleDeletePreset(): void {
        if (!this.selectedPresetId) return;

        const preset = this.customTemplates.find(t => t.id === this.selectedPresetId);
        if (!preset || preset.isBuiltIn) return;

        confirm("确认删除", `确定要删除预设 "${preset.name}" 吗？此操作不可恢复。`, () => {
            const index = this.customTemplates.findIndex(t => t.id === this.selectedPresetId);
            if (index !== -1) {
                this.customTemplates.splice(index, 1);
                this.configManager.saveCustomTemplates(this.customTemplates);
                this.selectedPresetId = null;
                this.presetDraftData = {};

                // Notify presets changed
                if (this.onPresetsChanged) {
                    this.onPresetsChanged();
                }

                const container = this.dialog?.element.querySelector("#prompt-editor-container");
                if (container) {
                    this.renderContent(container as HTMLElement);
                }
                showMessage("✅ 预设已删除", 2000, "info");
            }
        });
    }

    /**
     * Handle preset application to current settings
     */
    private handleApplyPreset(): void {
        if (!this.selectedPresetId) return;

        const preset = this.configManager.getAllTemplates().find(p => p.id === this.selectedPresetId);
        if (!preset) return;

        // Apply preset to current settings
        const updatedSettings: Partial<ClaudeSettings> = {
            systemPrompt: preset.systemPrompt,
            appendedPrompt: preset.appendedPrompt
        };

        this.currentSettings = { ...this.currentSettings, ...updatedSettings };
        this.onSave(updatedSettings);

        const container = this.dialog?.element.querySelector("#prompt-editor-container");
        if (container) {
            this.renderContent(container as HTMLElement);
        }
        showMessage("✅ 预设已应用到当前配置", 2000, "info");
    }

    /**
     * Handle save sub-tab content
     */
    private handleSaveSubTab(container: HTMLElement): void {
        if (!this.selectedPresetId) return;

        const presetIndex = this.customTemplates.findIndex(t => t.id === this.selectedPresetId);
        if (presetIndex === -1) return;

        const preset = this.customTemplates[presetIndex];

        // Get data based on active sub-tab
        switch (this.activeSubTab) {
            case "system":
                const systemTextarea = container.querySelector('#system-prompt-textarea') as HTMLTextAreaElement;
                if (systemTextarea) {
                    preset.systemPrompt = systemTextarea.value;
                }
                break;
            case "appended":
                const appendedTextarea = container.querySelector('#appended-prompt-textarea') as HTMLTextAreaElement;
                if (appendedTextarea) {
                    preset.appendedPrompt = appendedTextarea.value;
                }
                break;
            case "quickEdit":
                const quickEditTextarea = container.querySelector('#quick-edit-template-textarea') as HTMLTextAreaElement;
                const inputPlaceholderInput = container.querySelector('#input-placeholder-input') as HTMLInputElement;
                const showDiffCheckbox = container.querySelector('#show-diff-checkbox') as HTMLInputElement;
                if (quickEditTextarea) {
                    preset.editInstruction = quickEditTextarea.value;
                    preset.inputPlaceholder = inputPlaceholderInput?.value.trim() || undefined;
                    preset.showDiff = showDiffCheckbox?.checked || false;
                }
                break;
            case "selectionQA":
                const selectionQATextarea = container.querySelector('#selection-qa-template-textarea') as HTMLTextAreaElement;
                if (selectionQATextarea) {
                    preset.selectionQATemplate = selectionQATextarea.value;
                }
                break;
        }

        // Save to config manager
        this.configManager.saveCustomTemplates(this.customTemplates);
        this.presetDraftData = {}; // Clear draft after save

        // Notify presets changed
        if (this.onPresetsChanged) {
            this.onPresetsChanged();
        }

        showMessage("✅ 已保存", 2000, "info");
    }

    //#endregion
}
