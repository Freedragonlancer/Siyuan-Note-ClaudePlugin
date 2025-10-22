import {
    Plugin,
    showMessage,
    Dialog,
} from "siyuan";
import "@/index.scss";

import { ClaudeClient, DEFAULT_SETTINGS } from "./claude";
import type { ClaudeSettings } from "./claude";
import { SettingsManager, SettingsPanelV2 } from "./settings";
import { UnifiedAIPanel } from "./sidebar/UnifiedAIPanel";
import { CLAUDE_ICON_SVG } from "./assets/icons";
import {
    TextSelectionManager,
    AIEditProcessor,
    DiffRenderer,
    EditQueue,
    EditHistory
} from "./editor";
import type { TextSelection } from "./editor/types";

const PLUGIN_NAME = "siyuan-plugin-claude-assistant";

export default class ClaudeAssistantPlugin extends Plugin {
    private settingsManager!: SettingsManager;
    private claudeClient!: ClaudeClient;
    private unifiedPanel: UnifiedAIPanel | null = null;
    private dockElement: HTMLElement | null = null;
    private dockModel: any = null;

    // AI Text Editing feature (initialized for UnifiedPanel)
    private textSelectionManager: TextSelectionManager | null = null;
    private aiEditProcessor: AIEditProcessor | null = null;
    private diffRenderer: DiffRenderer | null = null;
    private editQueue: EditQueue | null = null;
    private editHistory: EditHistory | null = null;

    async onload() {
        console.log("Loading Claude Assistant Plugin");

        // Register custom icons
        this.addIcons(CLAUDE_ICON_SVG);
        console.log("Custom Claude icon registered");

        // Initialize settings with callback to update ClaudeClient when async load completes
        this.settingsManager = new SettingsManager(this, (loadedSettings) => {
            console.log("[Plugin] Settings loaded asynchronously, updating ClaudeClient");
            this.claudeClient.updateSettings(loadedSettings);
        });
        const settings = this.settingsManager.getSettings();

        // Initialize Claude client
        this.claudeClient = new ClaudeClient(settings);

        // Initialize AI Text Editing feature
        this.initializeEditFeature(settings);

        // Setup right-click context menu for AI Edit
        this.setupContextMenu();

        // Add commands (non-UI initialization)
        this.addCommand({
            langKey: "openClaude",
            hotkey: "⌥⇧C",
            callback: () => {
                this.toggleDock();
            },
        });

        this.addCommand({
            langKey: "askClaude",
            hotkey: "",
            editorCallback: (protyle) => {
                this.unifiedPanel?.setProtyle(protyle);
                this.toggleDock();
            },
        });

        this.addCommand({
            langKey: "settings",
            hotkey: "",
            callback: () => {
                this.openSettings();
            },
        });

        // AI Text Edit command
        this.addCommand({
            langKey: "aiEdit",
            hotkey: "⌃⇧E",
            editorCallback: (protyle) => {
                this.sendToAIEdit(protyle);
            },
        });

        // Undo last AI edit command
        this.addCommand({
            langKey: "undoAIEdit",
            hotkey: "⌃⇧Z",
            callback: () => {
                this.undoLastAIEdit();
            },
        });

        // Check if API key is configured
        if (!settings.apiKey) {
            setTimeout(() => {
                showMessage("Claude Assistant: Please configure your API key in settings", 5000, "info");
            }, 1000);
        }
    }

    onLayoutReady() {
        console.log("Claude Assistant Plugin layout ready");

        // Add unified dock (sidebar) - 必须在 onLayoutReady 中调用
        const dockResult = this.addDock({
            config: {
                position: "RightBottom",
                size: { width: 400, height: 600 },
                icon: "iconClaudeCode",
                title: "Claude AI",
                show: true,  // 尝试默认显示
            },
            data: {
                plugin: this,
            },
            type: "claude-dock",
            init() {
                const plugin = this.data.plugin;

                // Initialize UnifiedAIPanel with all dependencies
                if (plugin.textSelectionManager && plugin.aiEditProcessor && 
                    plugin.editQueue && plugin.diffRenderer) {
                    plugin.unifiedPanel = new UnifiedAIPanel(
                        plugin.claudeClient,
                        plugin.textSelectionManager,
                        plugin.aiEditProcessor,
                        plugin.editQueue,
                        plugin.diffRenderer,
                        () => plugin.openSettings()
                    );
                    this.element.innerHTML = '';
                    this.element.appendChild(plugin.unifiedPanel.getElement());
                    plugin.dockElement = this.element;

                    console.log("Claude AI unified panel ready");
                }
            },
        });

        // Store dock model for later use
        this.dockModel = dockResult.model;
        console.log("Claude AI dock registered successfully");

        // Add topbar icon - 必须在 onLayoutReady 中调用
        this.addTopBar({
            icon: "iconClaudeCode",
            title: "Claude AI Assistant",
            position: "right",
            callback: () => {
                this.toggleDock();
            }
        });

        console.log("Claude AI Assistant initialized");
    }

    async onunload() {
        console.log("Unloading Claude Assistant Plugin");

        this.unifiedPanel?.destroy();

        // Cancel any ongoing edit requests
        this.editQueue?.cancelAll();
    }

    uninstall() {
        console.log("Uninstalling Claude Assistant Plugin");
        // Clean up if needed
    }

    private toggleDock() {
        // 使用 SiYuan 的 Dock API 来切换 dock 显示
        const win = window as any;
        const layout = win.siyuan?.layout;

        if (!layout) {
            console.error("Claude AI: SiYuan layout not found");
            return;
        }

        // position: "RightBottom" 对应 rightDock
        const dock = layout.rightDock;

        if (!dock) {
            console.error("Claude AI: Right dock not found");
            return;
        }

        // SiYuan 内部使用 插件名+type 作为 key
        const dockType = PLUGIN_NAME + "claude-dock";

        // toggleModel 会自动处理显示/隐藏切换
        dock.toggleModel(dockType);
    }

    private openSettings() {
        const currentSettings = this.settingsManager.getSettings();

        const dialog = new Dialog({
            title: "⚙️ Claude AI 设置",
            content: `<div id="claude-settings-container"></div>`,
            width: "680px",
            height: "auto",
        });

        const container = dialog.element.querySelector("#claude-settings-container");
        if (container) {
            const settingsPanel = new SettingsPanelV2(
                currentSettings,
                async (newSettings) => {
                    console.log("[ClaudePlugin] Settings save callback triggered with:", newSettings);

                    // Validate API key exists
                    if (newSettings.apiKey && newSettings.apiKey.trim() === "") {
                        showMessage("❌ 请输入有效的 API Key", 3000, "error");
                        return;
                    }

                    try {
                        // Save settings (now async)
                        console.log("[ClaudePlugin] Calling settingsManager.saveSettings");
                        await this.settingsManager.saveSettings(newSettings);

                        // Update Claude client
                        console.log("[ClaudePlugin] Updating Claude client");
                        this.claudeClient.updateSettings(this.settingsManager.getSettings());

                        // Show success message
                        showMessage("✅ 设置已保存", 2000, "info");

                        // Close dialog
                        dialog.destroy();
                    } catch (error) {
                        console.error("[ClaudePlugin] Failed to save settings:", error);
                        showMessage("❌ 保存设置失败", 3000, "error");
                    }
                }
            );

            container.appendChild(settingsPanel.getElement());
        }
    }

    /**
     * Initialize AI Text Editing feature
     */
    private initializeEditFeature(settings: ClaudeSettings): void {
        console.log("[AIEdit] Initializing AI text editing feature");

        // Get edit settings or use defaults
        const editSettings = settings.editSettings || DEFAULT_SETTINGS.editSettings!;

        // Initialize managers
        this.textSelectionManager = new TextSelectionManager(editSettings);
        this.aiEditProcessor = new AIEditProcessor(this.claudeClient);
        this.editHistory = new EditHistory();
        this.diffRenderer = new DiffRenderer(this);
        this.diffRenderer.setEditHistory(this.editHistory); // Link history to renderer
        this.editQueue = new EditQueue(
            this.aiEditProcessor,
            this.textSelectionManager,
            editSettings
        );

        console.log("[AIEdit] AI text editing feature initialized");
    }

    /**
     * Send selected text to AI for editing
     */
    private sendToAIEdit(protyle: any): void {
        const selection = this.getEditorSelection(protyle);
        if (!selection) {
            showMessage("请先选择要编辑的文本", 3000, "info");
            return;
        }

        const textSelection = this.createTextSelection(selection);
        this.requestAIEdit(textSelection);  // No instruction → edit mode
    }

    /**
     * Get editor selection information
     */
    private getEditorSelection(protyle: any): {
        blockId: string;
        startLine: number;
        endLine: number;
        selectedText: string;
        contextBefore?: string;
        contextAfter?: string;
        fullBlockContent?: string;
    } | null {
        try {
            // Get the selection from the editor
            const range = protyle?.wysiwyg?.element?.ownerDocument?.getSelection()?.getRangeAt(0);
            if (!range || range.collapsed) {
                return null;
            }

            // Get selected text
            const selectedText = range.toString().trim();
            if (!selectedText) {
                return null;
            }

            // Find the containing block
            let blockElement = range.startContainer.parentElement;
            while (blockElement && !blockElement.getAttribute('data-node-id')) {
                blockElement = blockElement.parentElement;
            }

            if (!blockElement) {
                console.warn("[AIEdit] Could not find block element");
                return null;
            }

            const blockId = blockElement.getAttribute('data-node-id') || '';
            if (!blockId) {
                return null;
            }

            // Calculate line numbers (simplified - treat each line break as a new line)
            const fullText = blockElement.textContent || '';
            const lines = fullText.split('\n');

            // Find start and end lines
            const beforeSelection = fullText.substring(0, fullText.indexOf(selectedText));
            const startLine = beforeSelection.split('\n').length - 1;
            const endLine = startLine + selectedText.split('\n').length - 1;

            // Extract context (lines before and after)
            const allLines = lines;
            const editSettings = this.settingsManager.getSettings().editSettings;
            const contextLinesBefore = editSettings?.contextLinesBefore || 5;
            const contextLinesAfter = editSettings?.contextLinesAfter || 3;

            // Get context before
            const contextBeforeStartLine = Math.max(0, startLine - contextLinesBefore);
            const contextBeforeLines = allLines.slice(contextBeforeStartLine, startLine);
            const contextBefore = contextBeforeLines.join('\n');

            // Get context after
            const contextAfterEndLine = Math.min(allLines.length, endLine + 1 + contextLinesAfter);
            const contextAfterLines = allLines.slice(endLine + 1, contextAfterEndLine);
            const contextAfter = contextAfterLines.join('\n');

            return {
                blockId,
                startLine,
                endLine,
                selectedText,
                contextBefore,
                contextAfter,
                fullBlockContent: fullText
            };

        } catch (error) {
            console.error("[AIEdit] Error getting editor selection:", error);
            return null;
        }
    }

    /**
     * Create TextSelection object from selection data
     */
    private createTextSelection(data: {
        blockId: string;
        startLine: number;
        endLine: number;
        selectedText: string;
        contextBefore?: string;
        contextAfter?: string;
        fullBlockContent?: string;
    }): TextSelection {
        return {
            id: `edit-${Date.now()}`,
            blockId: data.blockId,
            startLine: data.startLine,
            endLine: data.endLine,
            selectedText: data.selectedText,
            contextBefore: data.contextBefore || '',
            contextAfter: data.contextAfter || '',
            timestamp: Date.now(),
            status: 'pending',
            fullBlockContent: data.fullBlockContent
        };
    }

    /**
     * Get block selection information
     */
    private getBlockSelection(blockElement: HTMLElement): {
        blockId: string;
        startLine: number;
        endLine: number;
        selectedText: string;
        fullBlockContent: string;
    } | null {
        const blockId = blockElement.getAttribute('data-node-id');
        if (!blockId) {
            showMessage("无法获取块 ID", 3000, "error");
            return null;
        }

        const textContent = blockElement.textContent?.trim();
        if (!textContent) {
            showMessage("块内容为空", 3000, "info");
            return null;
        }

        const lines = textContent.split('\n');
        return {
            blockId,
            startLine: 0,
            endLine: lines.length - 1,
            selectedText: textContent,
            fullBlockContent: textContent
        };
    }

    /**
     * Unified AI edit request method
     * @param textSelection Text selection object
     * @param instruction Optional editing instruction
     * @param showDiff Whether to show diff comparison
     */
    private requestAIEdit(
        textSelection: TextSelection,
        instruction?: string,
        showDiff: boolean = true
    ): void {
        if (!this.textSelectionManager || !this.editQueue) {
            console.error("[AIEdit] Edit feature not initialized");
            showMessage("AI 编辑功能未初始化", 3000, "error");
            return;
        }

        if (instruction) {
            // Has instruction → process directly
            console.log(`[AIEdit] Processing with instruction: ${instruction}`);
            
            const selection = this.textSelectionManager.addSelection(
                textSelection.blockId,
                textSelection.startLine,
                textSelection.endLine,
                textSelection.selectedText,
                instruction
            );
            
            this.editQueue.enqueue(selection);
            this.unifiedPanel?.addEditSelection(selection);
            this.toggleDock();
            
            showMessage(`已添加到编辑队列: ${instruction}`, 2000, "info");
        } else {
            // No instruction → enter edit mode
            console.log(`[AIEdit] Entering edit mode for selection ${textSelection.id}`);
            
            this.toggleDock();
            this.unifiedPanel?.enterEditMode(textSelection, showDiff);
            
            const lineInfo = textSelection.startLine === textSelection.endLine
                ? `第 ${textSelection.startLine + 1} 行`
                : `第 ${textSelection.startLine + 1}-${textSelection.endLine + 1} 行`;
            showMessage(`已进入编辑模式 (${lineInfo})`, 2000, "info");
        }
    }

    // toggleEditDock removed - now using unified panel

    /**
     * Setup context menu for AI Edit
     */
    private setupContextMenu(): void {
        console.log("[AIEdit] Setting up context menu");

        // Register event handlers with arrow functions to preserve 'this' context
        this.eventBus.on("click-blockicon", (event) => {
            this.onBlockIconClick(event);
        });

        this.eventBus.on("click-editorcontent", (event) => {
            this.onEditorContentClick(event);
        });

        console.log("[AIEdit] Context menu setup complete");
    }

    /**
     * Handle block icon click event (for context menu)
     */
    private onBlockIconClick(event: any): void {
        const detail = event.detail;
        const { menu, protyle, blockElements } = detail;

        console.log("[AIEdit] Block icon clicked");
        console.log("[AIEdit] blockElements:", blockElements);

        // Check if we have any block elements
        if (!blockElements || blockElements.length === 0) {
            console.log("[AIEdit] No block elements");
            return;
        }

        // Get the first block element
        const blockElement = blockElements[0];
        const blockId = blockElement.getAttribute('data-node-id');
        
        console.log("[AIEdit] Block ID:", blockId);

        // Check if block has text content
        const textContent = blockElement.textContent?.trim();
        if (!textContent) {
            console.log("[AIEdit] Block has no text content");
            return;
        }

        console.log("[AIEdit] Block text content (first 100 chars):", textContent.substring(0, 100));

        // Add separator
        menu.addSeparator();

        // Add AI Edit menu item
        menu.addItem({
            icon: "iconEdit",
            label: this.i18n.aiEdit || "发送到 AI 编辑",
            click: () => {
                console.log("[AIEdit] Menu item clicked");
                this.sendBlockToAIEdit(protyle, blockElement);
            }
        });

        // Add custom instruction submenu
        const editSettings = this.settingsManager.getSettings().editSettings;
        if (editSettings?.customInstructions && editSettings.customInstructions.length > 0) {
            const submenus = editSettings.customInstructions.map((instr: any) => ({
                label: instr.text,
                click: () => {
                    console.log("[AIEdit] Submenu item clicked:", instr.text);
                    this.sendBlockToAIEditWithPreset(protyle, blockElement, instr);
                }
            }));

            menu.addItem({
                icon: "iconList",
                label: "预设指令编辑...",
                type: "submenu",
                submenu: submenus
            });
        }

        console.log("[AIEdit] Menu items added");
    }

    /**
     * Handle editor content click event
     */
    private onEditorContentClick(event: any): void {
        const detail = event.detail;
        const { protyle, event: mouseEvent } = detail;

        // Check if it's a right-click (context menu)
        if (mouseEvent.button !== 2) {
            return;
        }

        const selection = protyle?.wysiwyg?.element?.ownerDocument?.getSelection();
        if (selection && selection.toString().trim()) {
            console.log("[AIEdit] Text selected on right-click:", selection.toString().substring(0, 50));
        }
    }

    /**
     * Undo the last AI edit
     */
    private async undoLastAIEdit(): Promise<void> {
        if (!this.diffRenderer || !this.editHistory) {
            console.error("[AIEdit] Edit features not initialized");
            showMessage("编辑功能未初始化", 3000, "error");
            return;
        }

        try {
            const success = await this.diffRenderer.undoLastEdit();

            if (success) {
                showMessage("✅ 已撤销上次 AI 编辑", 2000, "info");
            } else {
                showMessage("没有可撤销的编辑", 2000, "info");
            }
        } catch (error) {
            console.error("[AIEdit] Error undoing edit:", error);
            showMessage("撤销编辑失败", 3000, "error");
        }
    }

    /**
     * Send entire block to AI edit (when text selection is not available)
     */
    private sendBlockToAIEdit(protyle: any, blockElement: HTMLElement): void {
        const blockSelection = this.getBlockSelection(blockElement);
        if (!blockSelection) return;

        const textSelection = this.createTextSelection(blockSelection);
        this.requestAIEdit(textSelection);  // No instruction → edit mode
    }

    /**
     * Send entire block to AI edit with preset instruction
     */
    private sendBlockToAIEditWithPreset(protyle: any, blockElement: HTMLElement, preset: any): void {
        const blockSelection = this.getBlockSelection(blockElement);
        if (!blockSelection) return;

        const textSelection = this.createTextSelection(blockSelection);

        if (preset.showDiff) {
            // Has instruction and showDiff → process directly
            this.requestAIEdit(textSelection, preset.text, true);
        } else {
            // No showDiff → enter edit mode with pre-filled instruction
            if (!this.unifiedPanel) return;
            
            this.toggleDock();
            this.unifiedPanel.enterEditMode(textSelection, false);
            
            // Pre-fill the instruction in textarea
            setTimeout(() => {
                const textarea = document.querySelector('#claude-input') as HTMLTextAreaElement;
                if (textarea) {
                    textarea.value = preset.text;
                }
            }, 100);
            
            showMessage(`已进入编辑模式: ${preset.text}`, 2000, "info");
        }
    }
}
