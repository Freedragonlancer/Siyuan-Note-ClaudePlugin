import {
    Plugin,
    showMessage,
    Dialog,
} from "siyuan";
import "@/index.scss";

import { ClaudeClient, DEFAULT_SETTINGS } from "./claude";
import type { ClaudeSettings } from "./claude";
import { SettingsManager, SettingsPanelV2, SettingsPanelV3, ConfigManager, PromptEditorPanel } from "./settings";
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
import { QuickEditManager } from "./quick-edit";

const PLUGIN_NAME = "siyuan-plugin-claude-assistant";

export default class ClaudeAssistantPlugin extends Plugin {
    private settingsManager!: SettingsManager;
    private configManager!: ConfigManager;
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

    // Quick Edit Mode
    private quickEditManager: QuickEditManager | null = null;

    // Initialization promise to track when onload completes
    private initializationComplete: Promise<void> | null = null;
    private initializationResolver: (() => void) | null = null;

    async onload() {
        console.log("Loading Claude Assistant Plugin");

        // Create initialization promise
        this.initializationComplete = new Promise<void>((resolve) => {
            this.initializationResolver = resolve;
        });

        // Register custom icons
        this.addIcons(CLAUDE_ICON_SVG);
        console.log("Custom Claude icon registered");

        // Initialize ConfigManager (new configuration system)
        this.configManager = new ConfigManager(this);
        console.log("[Plugin] ConfigManager initialized");

        // Migrate old settings to config system if needed
        this.migrateOldSettings();

        // Initialize settings with callback to update ClaudeClient when async load completes
        this.settingsManager = new SettingsManager(this, (loadedSettings) => {
            console.log("[Plugin] Settings loaded asynchronously, updating ClaudeClient");
            if (this.claudeClient) {
                this.claudeClient.updateSettings(loadedSettings);
            } else {
                console.log("[Plugin] ClaudeClient not yet initialized, will use loaded settings on init");
            }
        });

        // FIX: Wait for async settings load to complete before proceeding
        // The SettingsManager constructor starts an async file load that needs to complete
        // before we access settings, otherwise we'll get defaults and overwrite saved data
        let settings: ClaudeSettings;

        try {
            await new Promise<void>(resolve => setTimeout(resolve, 100));
            console.log("[Plugin] Waited for settings async load");

            // Get settings from SettingsManager (which has now loaded from file)
            const loadedSettings = this.settingsManager.getSettings();
            console.log("[Plugin] Loaded settings from SettingsManager:", { hasApiKey: !!loadedSettings.apiKey });

            // Sync loaded settings to ConfigManager active profile if needed
            const activeProfile = this.configManager.getActiveProfile();

            // Only update ConfigManager if the loaded settings have an API key
            // (indicates they are real saved settings, not just defaults)
            if (loadedSettings.apiKey) {
                console.log("[Plugin] Syncing loaded settings to ConfigManager");
                this.configManager.updateProfile(activeProfile.id, {
                    settings: { ...activeProfile.settings, ...loadedSettings }
                });
            } else {
                console.log("[Plugin] No saved settings found, using ConfigManager defaults");
            }

            // Use the loaded settings for initialization
            settings = loadedSettings.apiKey ? loadedSettings : activeProfile.settings;

            // Migrate quickEditPromptTemplate from EditSettings to ClaudeSettings
            settings = this.migrateQuickEditPromptTemplate(settings);
        } catch (error) {
            console.error("[Plugin] Error during settings load, using defaults:", error);
            // Fallback to defaults if anything fails
            settings = this.configManager.getActiveProfile().settings;
        }

        // Initialize Claude client
        this.claudeClient = new ClaudeClient(settings);
        console.log("[Plugin] ClaudeClient initialized");

        // Initialize AI Text Editing feature
        try {
            this.initializeEditFeature(settings);
            console.log("[Plugin] Edit feature initialized successfully");
        } catch (error) {
            console.error("[Plugin] ❌ Failed to initialize edit feature:", error);
            // Continue anyway, we can still show the panel even if edit features fail
        }

        // Setup right-click context menu for AI Edit
        try {
            this.setupContextMenu();
            console.log("[Plugin] Context menu setup complete");
        } catch (error) {
            console.error("[Plugin] ❌ Failed to setup context menu:", error);
        }

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

        // Quick Edit command
        this.addCommand({
            langKey: "quickEdit",
            hotkey: "⌃⇧Q",
            callback: () => {
                this.triggerQuickEdit();
            },
        });

        // Check if API key is configured
        if (!settings.apiKey) {
            setTimeout(() => {
                showMessage("Claude Assistant: Please configure your API key in settings", 5000, "info");
            }, 1000);
        }

        // Signal that initialization is complete
        if (this.initializationResolver) {
            this.initializationResolver();
            console.log("[Plugin] ✅ Initialization complete");
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

                console.log("[Dock] Initializing dock panel...");

                // Wait for plugin initialization to complete
                (async () => {
                    try {
                        if (plugin.initializationComplete) {
                            console.log("[Dock] Waiting for plugin initialization...");
                            await plugin.initializationComplete;
                            console.log("[Dock] Plugin initialization complete, proceeding...");
                        }

                        console.log("[Dock] Dependencies check:", {
                            textSelectionManager: !!plugin.textSelectionManager,
                            aiEditProcessor: !!plugin.aiEditProcessor,
                            editQueue: !!plugin.editQueue,
                            diffRenderer: !!plugin.diffRenderer,
                            claudeClient: !!plugin.claudeClient
                        });

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

                            console.log("[Dock] ✅ Claude AI unified panel ready");
                        } else {
                            console.error("[Dock] ❌ Missing required dependencies, cannot initialize panel");
                            this.element.innerHTML = '<div style="padding: 20px; color: orange;">缺少必要组件，请重启插件</div>';
                        }
                    } catch (error) {
                        console.error("[Dock] ❌ Failed to initialize UnifiedAIPanel:", error);
                        this.element.innerHTML = '<div style="padding: 20px; color: red;">初始化失败: ' + (error as Error).message + '</div>';
                    }
                })();
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
        const dialog = new Dialog({
            title: "⚙️ Claude AI 设置",
            content: `<div id="claude-settings-container"></div>`,
            width: "720px",
            height: "auto",
        });

        const container = dialog.element.querySelector("#claude-settings-container");
        if (container) {
            const settingsPanel = new SettingsPanelV3(
                this.configManager,
                async (newSettings) => {
                    console.log("[ClaudePlugin] Settings save callback triggered with:", newSettings);

                    // Validate API key exists
                    if (newSettings.apiKey && newSettings.apiKey.trim() === "") {
                        showMessage("❌ 请输入有效的 API Key", 3000, "error");
                        return;
                    }

                    try {
                        // Get current active profile
                        const activeProfile = this.configManager.getActiveProfile();

                        // Update profile settings
                        this.configManager.updateProfile(activeProfile.id, {
                            settings: { ...activeProfile.settings, ...newSettings }
                        });

                        // Sync to SettingsManager for backward compatibility
                        console.log("[ClaudePlugin] Calling settingsManager.saveSettings");
                        await this.settingsManager.saveSettings(newSettings);

                        // Update Claude client
                        console.log("[ClaudePlugin] Updating Claude client");
                        this.claudeClient.updateSettings(this.configManager.getActiveProfile().settings);

                        // Show success message
                        showMessage("✅ 设置已保存", 2000, "info");
                    } catch (error) {
                        console.error("[ClaudePlugin] Failed to save settings:", error);
                        showMessage("❌ 保存设置失败", 3000, "error");
                    }
                },
                () => {
                    // Open Prompt Editor Panel
                    this.openPromptEditor();
                }
            );

            settingsPanel.open(dialog);
            container.appendChild(settingsPanel.getElement());
        }
    }

    /**
     * Open Prompt Editor Panel
     */
    private async openPromptEditor(): Promise<void> {
        console.log("[ClaudePlugin] Opening Prompt Editor Panel");

        // Ensure templates are loaded before opening editor
        await this.configManager.waitForInit();
        console.log("[ClaudePlugin] ConfigManager initialization complete");

        const activeProfile = this.configManager.getActiveProfile();
        const promptEditor = new PromptEditorPanel(
            this.configManager,
            activeProfile.settings,
            async (newSettings) => {
                console.log("[ClaudePlugin] Prompt Editor save callback triggered");

                try {
                    // Update profile settings
                    this.configManager.updateProfile(activeProfile.id, {
                        settings: { ...activeProfile.settings, ...newSettings }
                    });

                    // Sync to SettingsManager for backward compatibility
                    await this.settingsManager.saveSettings({ ...activeProfile.settings, ...newSettings });

                    // Update Claude client (QuickEditManager will automatically get new settings from ClaudeClient)
                    this.claudeClient.updateSettings(this.configManager.getActiveProfile().settings);

                    console.log("[ClaudePlugin] ✅ Prompt settings updated successfully (QuickEditManager will use ClaudeClient settings)");
                } catch (error) {
                    console.error("[ClaudePlugin] Failed to save prompt settings:", error);
                    showMessage("❌ 保存提示词失败", 3000, "error");
                }
            }
        );

        promptEditor.open();
    }

    /**
     * Initialize AI Text Editing feature
     */
    private initializeEditFeature(settings: ClaudeSettings): void {
        console.log("[AIEdit] Initializing AI text editing feature");

        // Get edit settings or use defaults
        const editSettings = settings.editSettings || DEFAULT_SETTINGS.editSettings!;
        console.log("[AIEdit] Using editSettings:", editSettings ? "loaded" : "ERROR: undefined");

        // Initialize managers
        console.log("[AIEdit] Creating TextSelectionManager...");
        this.textSelectionManager = new TextSelectionManager(editSettings);

        console.log("[AIEdit] Creating AIEditProcessor...");
        this.aiEditProcessor = new AIEditProcessor(this.claudeClient);

        console.log("[AIEdit] Creating EditHistory...");
        this.editHistory = new EditHistory();

        console.log("[AIEdit] Creating DiffRenderer...");
        this.diffRenderer = new DiffRenderer(this);
        this.diffRenderer.setEditHistory(this.editHistory); // Link history to renderer

        console.log("[AIEdit] Creating EditQueue...");
        this.editQueue = new EditQueue(
            this.aiEditProcessor,
            this.textSelectionManager,
            editSettings
        );

        // Initialize Quick Edit Manager
        console.log("[AIEdit] Creating QuickEditManager...");
        this.quickEditManager = new QuickEditManager(
            this,
            this.claudeClient,
            this.editHistory,
            editSettings,
            this.configManager
        );

        console.log("[AIEdit] ✅ AI text editing feature initialized");
        console.log("[QuickEdit] ✅ Quick Edit Manager initialized");
    }

    /**
     * Send selected text to AI for editing
     */
    private sendToAIEdit(protyle: any): void {
        const selection = this.getEditorSelection(protyle);
        if (!selection) {
            showMessage(this.i18n.noTextSelected, 3000, "info");
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

            showMessage(`${this.i18n.aiEditQueued}: ${instruction}`, 2000, "info");
        } else {
            // No instruction → enter edit mode
            console.log(`[AIEdit] Entering edit mode for selection ${textSelection.id}`);

            this.toggleDock();
            this.unifiedPanel?.enterEditMode(textSelection, showDiff);

            const lineInfo = textSelection.startLine === textSelection.endLine
                ? `${textSelection.startLine + 1}`
                : `${textSelection.startLine + 1}-${textSelection.endLine + 1}`;
            showMessage(`${this.i18n.enterEditMode} (Line ${lineInfo})`, 2000, "info");
        }
    }

    // toggleEditDock removed - now using unified panel

    /**
     * Setup context menu for AI Edit
     */
    private setupContextMenu(): void {
        console.log("[AIEdit] Setting up context menu");

        // Register event handlers with arrow functions to preserve 'this' context

        // Block icon click - for block-level operations
        this.eventBus.on("click-blockicon", (event) => {
            this.onBlockIconClick(event);
        });

        // Editor content menu - for text selection operations
        this.eventBus.on("open-menu-content", (event) => {
            this.onEditorContentMenu(event);
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

        // Add "Quick Edit" menu item
        menu.addItem({
            icon: "iconFlash",
            label: this.i18n.quickEdit || "AI 快速编辑",
            click: () => {
                console.log("[QuickEdit] 'Quick Edit' clicked from block menu");
                this.triggerQuickEdit();
            }
        });

        // Add AI Edit menu item
        menu.addItem({
            icon: "iconEdit",
            label: this.i18n.aiEditBlock,
            click: () => {
                console.log("[AIEdit] Edit block menu item clicked");
                this.sendBlockToAIEdit(protyle, blockElement);
            }
        });

        // Add custom instruction submenu
        const editSettings = this.settingsManager.getSettings().editSettings;
        if (editSettings?.customInstructions && editSettings.customInstructions.length > 0) {
            const submenus = editSettings.customInstructions.map((instr: any) => ({
                icon: instr.icon || "iconEdit",
                label: instr.text,
                click: () => {
                    console.log("[AIEdit] Block preset instruction clicked:", instr.text);
                    this.sendBlockToAIEditWithPreset(protyle, blockElement, instr);
                }
            }));

            menu.addItem({
                icon: "iconList",
                label: this.i18n.aiEditPresets,
                type: "submenu",
                submenu: submenus
            });
        }

        console.log("[AIEdit] Menu items added");
    }

    /**
     * Handle editor content menu event (right-click on selected text)
     */
    private onEditorContentMenu(event: any): void {
        const detail = event.detail;
        const { menu, range, protyle } = detail;

        console.log("[AIEdit] Editor content menu opened");

        // Check if there's a text selection
        if (!range || range.collapsed) {
            console.log("[AIEdit] No text selected, skipping menu");
            return;
        }

        const selectedText = range.toString().trim();
        if (!selectedText) {
            console.log("[AIEdit] Selected text is empty, skipping menu");
            return;
        }

        console.log("[AIEdit] Text selected (first 50 chars):", selectedText.substring(0, 50));

        // Add separator
        menu.addSeparator();

        // Add "Quick Edit" menu item
        menu.addItem({
            icon: "iconFlash",
            label: this.i18n.quickEdit || "AI 快速编辑",
            click: () => {
                console.log("[QuickEdit] 'Quick Edit' clicked from context menu");
                this.triggerQuickEdit();
            }
        });

        // Add "Send to AI Edit" menu item
        menu.addItem({
            icon: "iconEdit",
            label: this.i18n.aiEdit,
            click: () => {
                console.log("[AIEdit] 'Send to AI Edit' clicked from context menu");
                this.sendToAIEdit(protyle);
            }
        });

        // Add custom instruction submenu
        const editSettings = this.settingsManager.getSettings().editSettings;
        if (editSettings?.customInstructions && editSettings.customInstructions.length > 0) {
            const submenus = editSettings.customInstructions.map((instr: any) => ({
                icon: instr.icon || "iconEdit",
                label: instr.text,
                click: () => {
                    console.log("[AIEdit] Preset instruction clicked:", instr.text);
                    const selection = this.getEditorSelection(protyle);
                    if (selection) {
                        const textSelection = this.createTextSelection(selection);
                        this.requestAIEdit(textSelection, instr.text, instr.showDiff !== false);
                    }
                }
            }));

            menu.addItem({
                icon: "iconList",
                label: this.i18n.aiEditPresets,
                type: "submenu",
                submenu: submenus
            });
        }

        console.log("[AIEdit] Context menu items added for text selection");
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
     * Trigger Quick Edit dialog
     */
    private triggerQuickEdit(): void {
        if (!this.quickEditManager) {
            console.error("[QuickEdit] Quick Edit Manager not initialized");
            showMessage("快速编辑功能未初始化", 3000, "error");
            return;
        }

        try {
            this.quickEditManager.trigger();
        } catch (error) {
            console.error("[QuickEdit] Error triggering quick edit:", error);
            showMessage("打开快速编辑失败", 3000, "error");
        }
    }

    /**
     * Send entire block to AI edit (when text selection is not available)
     */
    private sendBlockToAIEdit(protyle: any, blockElement: HTMLElement): void {
        console.log('[AIEdit] sendBlockToAIEdit called');
        const blockSelection = this.getBlockSelection(blockElement);
        if (!blockSelection) {
            console.log('[AIEdit] getBlockSelection returned null');
            return;
        }

        console.log('[AIEdit] Block selection:', blockSelection);
        const textSelection = this.createTextSelection(blockSelection);
        console.log('[AIEdit] Text selection created:', textSelection);
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

            showMessage(`${this.i18n.enterEditMode}: ${preset.text}`, 2000, "info");
        }
    }

    /**
     * Migrate old settings to new config system
     * This runs once on first load after upgrade
     */
    private migrateOldSettings(): void {
        try {
            // Check if migration has already been done
            const migrationDone = localStorage.getItem('claude-migration-v3-done');
            if (migrationDone === 'true') {
                console.log('[Migration] Already migrated to config system');
                return;
            }

            // Check if there are existing profiles
            const existingProfiles = this.configManager.getAllProfiles();
            if (existingProfiles.length > 1) {
                // Multiple profiles exist, assume migration done
                console.log('[Migration] Multiple profiles found, skipping migration');
                localStorage.setItem('claude-migration-v3-done', 'true');
                return;
            }

            // Try to load old settings
            const oldSettingsKey = 'claude-assistant-settings';
            const oldSettingsData = localStorage.getItem(oldSettingsKey);

            if (!oldSettingsData) {
                console.log('[Migration] No old settings found');
                localStorage.setItem('claude-migration-v3-done', 'true');
                return;
            }

            console.log('[Migration] Found old settings, starting migration...');

            // Parse old settings
            const oldSettings = JSON.parse(oldSettingsData);

            // Get default profile
            const defaultProfile = this.configManager.getActiveProfile();

            // Merge old settings into default profile
            this.configManager.updateProfile(defaultProfile.id, {
                settings: { ...defaultProfile.settings, ...oldSettings }
            });

            console.log('[Migration] Successfully migrated old settings to default profile');

            // Mark migration as done
            localStorage.setItem('claude-migration-v3-done', 'true');

        } catch (error) {
            console.error('[Migration] Error during migration:', error);
            // Don't block plugin loading on migration failure
        }
    }

    /**
     * Migrate quickEditPromptTemplate from EditSettings to ClaudeSettings
     * This ensures backward compatibility after moving the field
     */
    private migrateQuickEditPromptTemplate(settings: ClaudeSettings): ClaudeSettings {
        try {
            // Check if ClaudeSettings already has quickEditPromptTemplate
            if (settings.quickEditPromptTemplate) {
                console.log('[Migration] quickEditPromptTemplate already exists in ClaudeSettings, no migration needed');
                return settings;
            }

            // Check if EditSettings has quickEditPromptTemplate
            if (settings.editSettings?.quickEditPromptTemplate) {
                console.log('[Migration] ✅ Migrating quickEditPromptTemplate from EditSettings to ClaudeSettings');
                settings.quickEditPromptTemplate = settings.editSettings.quickEditPromptTemplate;

                // Clean up old field (optional, but keeps data clean)
                delete settings.editSettings.quickEditPromptTemplate;

                // Save migrated settings
                this.settingsManager.saveSettings(settings).catch(err => {
                    console.error('[Migration] Failed to save migrated settings:', err);
                });

                console.log('[Migration] ✅ quickEditPromptTemplate migration completed');
            } else {
                console.log('[Migration] No quickEditPromptTemplate to migrate');
            }

            return settings;
        } catch (error) {
            console.error('[Migration] Error during quickEditPromptTemplate migration:', error);
            return settings; // Return original settings on error
        }
    }
}
