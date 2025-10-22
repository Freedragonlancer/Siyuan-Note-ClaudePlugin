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
        this.diffRenderer = new DiffRenderer();
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
        if (!this.textSelectionManager || !this.editQueue) {
            console.error("[AIEdit] Edit feature not initialized");
            showMessage("AI 编辑功能未初始化", 3000, "error");
            return;
        }

        try {
            // Get the selected text and block info
            const selection = this.getEditorSelection(protyle);

            if (!selection) {
                showMessage("请先选择要编辑的文本", 3000, "info");
                return;
            }

            // Add to selection manager
            const textSelection = this.textSelectionManager.addSelection(
                selection.blockId,
                selection.startLine,
                selection.endLine,
                selection.selectedText
            );

            console.log(`[AIEdit] Added selection ${textSelection.id} to queue`);

            // Notify unified panel and open dock
            this.unifiedPanel?.addEditSelection(textSelection);
            this.toggleDock();

            showMessage(`已添加到编辑队列 (${selection.startLine + 1}-${selection.endLine + 1} 行)`, 2000, "info");

        } catch (error) {
            console.error("[AIEdit] Error sending to AI edit:", error);
            showMessage("添加编辑任务失败", 3000, "error");
        }
    }

    /**
     * Get editor selection information
     */
    private getEditorSelection(protyle: any): {
        blockId: string;
        startLine: number;
        endLine: number;
        selectedText: string;
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

            return {
                blockId,
                startLine,
                endLine,
                selectedText
            };

        } catch (error) {
            console.error("[AIEdit] Error getting editor selection:", error);
            return null;
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
            const submenus = editSettings.customInstructions.map((instruction: string) => ({
                label: instruction,
                click: () => {
                    console.log("[AIEdit] Submenu item clicked:", instruction);
                    this.sendBlockToAIEditWithInstruction(protyle, blockElement, instruction);
                }
            }));

            menu.addItem({
                icon: "iconList",
                label: "AI Edit with...",
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
     * Send to AI edit with custom instruction
     */
    private sendToAIEditWithInstruction(protyle: any, instruction: string): void {
        if (!this.textSelectionManager || !this.editQueue) {
            console.error("[AIEdit] Edit feature not initialized");
            showMessage("AI 编辑功能未初始化", 3000, "error");
            return;
        }

        try {
            const selection = this.getEditorSelection(protyle);

            if (!selection) {
                showMessage("请先选择要编辑的文本", 3000, "info");
                return;
            }

            // Add to selection manager with custom instruction
            const textSelection = this.textSelectionManager.addSelection(
                selection.blockId,
                selection.startLine,
                selection.endLine,
                selection.selectedText,
                instruction  // Pass custom instruction
            );

            console.log(`[AIEdit] Added selection ${textSelection.id} with instruction: ${instruction}`);

            // Notify unified panel and open dock
            this.unifiedPanel?.addEditSelection(textSelection);
            this.toggleDock();

            showMessage(`已添加到编辑队列: ${instruction}`, 2000, "info");

        } catch (error) {
            console.error("[AIEdit] Error sending to AI edit:", error);
            showMessage("添加编辑任务失败", 3000, "error");
        }
    }

    /**
     * Send entire block to AI edit (when text selection is not available)
     */
    private sendBlockToAIEdit(protyle: any, blockElement: HTMLElement): void {
        if (!this.textSelectionManager || !this.editQueue) {
            console.error("[AIEdit] Edit feature not initialized");
            showMessage("AI 编辑功能未初始化", 3000, "error");
            return;
        }

        try {
            const blockId = blockElement.getAttribute('data-node-id');
            if (!blockId) {
                showMessage("无法获取块 ID", 3000, "error");
                return;
            }

            const textContent = blockElement.textContent?.trim();
            if (!textContent) {
                showMessage("块内容为空", 3000, "info");
                return;
            }

            console.log(`[AIEdit] Sending entire block ${blockId} to AI edit`);

            // Send entire block as selection (line 0 to end)
            const lines = textContent.split('\n');
            const textSelection = this.textSelectionManager.addSelection(
                blockId,
                0,
                lines.length - 1,
                textContent
            );

            console.log(`[AIEdit] Added block selection ${textSelection.id} to queue`);

            // Notify unified panel and open dock
            this.unifiedPanel?.addEditSelection(textSelection);
            this.toggleDock();

            showMessage(`已添加到编辑队列 (整个块，共 ${lines.length} 行)`, 2000, "info");

        } catch (error) {
            console.error("[AIEdit] Error sending block to AI edit:", error);
            showMessage("添加编辑任务失败", 3000, "error");
        }
    }

    /**
     * Send entire block to AI edit with custom instruction
     */
    private sendBlockToAIEditWithInstruction(protyle: any, blockElement: HTMLElement, instruction: string): void {
        if (!this.textSelectionManager || !this.editQueue) {
            console.error("[AIEdit] Edit feature not initialized");
            showMessage("AI 编辑功能未初始化", 3000, "error");
            return;
        }

        try {
            const blockId = blockElement.getAttribute('data-node-id');
            if (!blockId) {
                showMessage("无法获取块 ID", 3000, "error");
                return;
            }

            const textContent = blockElement.textContent?.trim();
            if (!textContent) {
                showMessage("块内容为空", 3000, "info");
                return;
            }

            console.log(`[AIEdit] Sending entire block ${blockId} with instruction: ${instruction}`);

            // Send entire block with custom instruction
            const lines = textContent.split('\n');
            const textSelection = this.textSelectionManager.addSelection(
                blockId,
                0,
                lines.length - 1,
                textContent,
                instruction
            );

            console.log(`[AIEdit] Added block selection ${textSelection.id} with instruction`);

            // Notify unified panel and open dock
            this.unifiedPanel?.addEditSelection(textSelection);
            this.toggleDock();

            showMessage(`已添加到编辑队列: ${instruction}`, 2000, "info");

        } catch (error) {
            console.error("[AIEdit] Error sending block to AI edit:", error);
            showMessage("添加编辑任务失败", 3000, "error");
        }
    }
}
