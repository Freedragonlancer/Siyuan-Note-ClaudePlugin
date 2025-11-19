import {
    Plugin,
    showMessage,
    Dialog,
} from "siyuan";
import "@/index.scss";

import { ClaudeClient, DEFAULT_SETTINGS } from "./claude";
import type { ClaudeSettings } from "./claude";
import { SettingsManager, SettingsPanelV3, ConfigManager, PromptEditorPanel } from "./settings";
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
import type { DockModel, BlockIconEvent, ContentMenuEvent } from "@/types/siyuan";
import { KeyboardShortcutFormatter } from "./utils/KeyboardShortcutFormatter";
import { Logger, LogLevel } from "./utils/Logger";
import { IS_DEV, getDefaultLogLevel } from "./config/environment";

const PLUGIN_NAME = "siyuan-plugin-claude-assistant";

export default class ClaudeAssistantPlugin extends Plugin {
    private settingsManager!: SettingsManager;
    private configManager!: ConfigManager;
    private claudeClient!: ClaudeClient;
    private unifiedPanel: UnifiedAIPanel | null = null;
    private dockElement: HTMLElement | null = null;
    private dockModel: DockModel | null = null;
    private topbarElement: HTMLElement | null = null;

    // AI Text Editing feature (initialized for UnifiedPanel)
    private textSelectionManager: TextSelectionManager | null = null;
    private aiEditProcessor: AIEditProcessor | null = null;
    private diffRenderer: DiffRenderer | null = null;
    private editQueue: EditQueue | null = null;
    private editHistory: EditHistory | null = null;

    // Quick Edit Mode
    private quickEditManager: QuickEditManager | null = null;

    // Event handlers for cleanup
    private blockIconHandler: ((event: CustomEvent<BlockIconEvent>) => void) | null = null;
    private contentMenuHandler: ((event: CustomEvent<ContentMenuEvent>) => void) | null = null;

    // Initialization promise to track when onload completes
    private initializationComplete: Promise<void> | null = null;
    private initializationResolver: (() => void) | null = null;

    async onload() {
        // Configure Logger based on environment
        const logLevel = IS_DEV ? LogLevel.DEBUG : LogLevel.WARN;
        Logger.configure({
            level: logLevel,
            prefix: '[ClaudePlugin]',
            enableTimestamp: IS_DEV,
            enableStackTrace: IS_DEV,
        });

        Logger.info("Loading Claude Assistant Plugin", {
            environment: IS_DEV ? 'development' : 'production',
            logLevel: getDefaultLogLevel(),
        });

        // Load i18n manually if not provided by SiYuan
        // This fixes "Cannot read properties of undefined (reading 'local-plugintopunpin')" error
        if (!this.i18n || Object.keys(this.i18n).length === 0) {
            console.log('[Plugin] i18n not loaded by SiYuan, loading manually...');
            try {
                // Get current language from SiYuan config (fallback to en_US)
                const lang = (window as any).siyuan?.config?.lang || 'en_US';
                console.log(`[Plugin] Loading i18n for language: ${lang}`);

                // Try to load i18n file using plugin's loadData method
                const i18nPath = `i18n/${lang}.json`;
                const i18nData = await this.loadData(i18nPath);

                if (i18nData) {
                    this.i18n = typeof i18nData === 'string' ? JSON.parse(i18nData) : i18nData;
                    console.log(`[Plugin] Successfully loaded i18n from ${i18nPath} (${Object.keys(this.i18n).length} keys)`);
                } else {
                    console.warn(`[Plugin] i18n file ${i18nPath} not found, using empty object`);
                    this.i18n = {};
                }
            } catch (error) {
                console.error('[Plugin] Failed to load i18n manually:', error);
                // Fallback to empty object to prevent undefined errors
                this.i18n = {};
                console.warn('[Plugin] Using empty i18n object as fallback');
            }
        } else {
            console.log(`[Plugin] i18n already loaded by SiYuan (${Object.keys(this.i18n).length} keys)`);
        }

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
            console.log("[Plugin] Settings loaded asynchronously from file");

            // Update ClaudeClient if already initialized
            if (this.claudeClient) {
                this.claudeClient.updateSettings(loadedSettings);
                console.log("[Plugin] Updated ClaudeClient with loaded settings");

                // Refresh UI badge if UnifiedAIPanel is already initialized
                if (this.unifiedPanel && typeof this.unifiedPanel.updateProviderInfoBadge === 'function') {
                    this.unifiedPanel.updateProviderInfoBadge();
                    console.log("[Plugin] Refreshed UnifiedAIPanel provider badge");
                }
            }

            // Sync to ConfigManager only on first migration (not every load)
            const migrationDone = localStorage.getItem('claude-settings-sync-done');
            if (!migrationDone && loadedSettings.apiKey) {
                console.log("[Plugin] First-time sync: SettingsManager → ConfigManager");
                const activeProfile = this.configManager.getActiveProfile();
                this.configManager.updateProfile(activeProfile.id, {
                    settings: { ...activeProfile.settings, ...loadedSettings }
                });
                localStorage.setItem('claude-settings-sync-done', 'true');
            }
        });

        // Get initial settings from cache (file load continues in background)
        // The callback above will update ClaudeClient when async file load completes
        let settings: ClaudeSettings;

        try {
            // Get cached settings immediately (may be defaults if first load)
            const cachedSettings = this.settingsManager.getSettings();
            console.log("[Plugin] Using cached settings for initialization:", { hasApiKey: !!cachedSettings.apiKey });

            // Get active profile from ConfigManager
            const activeProfile = this.configManager.getActiveProfile();

            // Use cached settings if available, otherwise use ConfigManager defaults
            settings = cachedSettings.apiKey ? cachedSettings : activeProfile.settings;

            // Migrate quickEditPromptTemplate from EditSettings to ClaudeSettings
            settings = this.migrateQuickEditPromptTemplate(settings);
        } catch (error) {
            console.error("[Plugin] Error during settings initialization, using defaults:", error);
            // Fallback to defaults if anything fails
            settings = this.configManager.getActiveProfile().settings;
        }

        // Initialize Claude client with ConfigManager for preset-level filterRules
        this.claudeClient = new ClaudeClient(settings, this.configManager);
        this.claudeClient.setPlugin(this); // Set plugin instance for file storage access
        console.log("[Plugin] ClaudeClient initialized with plugin reference");

        // Migrate quickEditPromptTemplate to default preset (new two-level tab system)
        await this.migrateQuickEditToDefaultPreset();
        console.log("[Plugin] QuickEdit template migration check completed");

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
            hotkey: settings.keyboardShortcuts?.openClaude || "⌥⇧C",
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

        // [REMOVED] AI Text Edit command - 功能已统一到 QuickEdit

        // Undo last AI edit command
        this.addCommand({
            langKey: "undoAIEdit",
            hotkey: settings.keyboardShortcuts?.undoAIEdit || "⌃⇧Z",
            callback: () => {
                this.undoLastAIEdit();
            },
        });

        // Quick Edit command
        this.addCommand({
            langKey: "quickEdit",
            hotkey: settings.keyboardShortcuts?.quickEdit || "⌃⇧Q",
            callback: () => {
                this.triggerQuickEdit();
            },
        });

        // Signal that initialization is complete
        if (this.initializationResolver) {
            this.initializationResolver();
            console.log("[Plugin] ✅ Initialization complete");
        }
    }

    onLayoutReady() {
        // Ensure i18n is initialized (defensive check for edge cases)
        if (!this.i18n || typeof this.i18n !== 'object') {
            console.warn("[Plugin] i18n not initialized in onLayoutReady, using empty object");
            this.i18n = {};
        }

        // CRITICAL: Clean DOM FIRST - ensures any leftover elements from incomplete unload are removed
        // This is the real protection against duplicate UI elements
        this.cleanupTopbarIconsSync();

        console.log("Claude Assistant Plugin layout ready");

        // Double-check: topbar should be null after cleanup
        if (this.topbarElement) {
            console.error("[Plugin] ⚠️  Topbar still exists after cleanup! Forcing reset...");
            this.topbarElement = null;
        }

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
                const element = this.element;  // Capture element reference before async context

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
                            element.innerHTML = '';
                            element.appendChild(plugin.unifiedPanel.getElement());
                            plugin.dockElement = element;

                            // Ensure provider badge reflects current state (in case settings loaded after initial render)
                            setTimeout(() => {
                                if (plugin.unifiedPanel && plugin.claudeClient.isConfigured()) {
                                    plugin.unifiedPanel.updateProviderInfoBadge();
                                    console.log("[Dock] Refreshed provider badge after panel initialization");
                                }
                            }, 200);

                            console.log("[Dock] ✅ Claude AI unified panel ready");
                        } else {
                            console.error("[Dock] ❌ Missing required dependencies, cannot initialize panel");
                            element.innerHTML = '<div style="padding: 20px; color: orange;">缺少必要组件，请重启插件</div>';
                        }
                    } catch (error) {
                        console.error("[Dock] ❌ Failed to initialize UnifiedAIPanel:", error);
                        element.innerHTML = '<div style="padding: 20px; color: red;">初始化失败: ' + (error as Error).message + '</div>';
                    }
                })();
            },
        });

        // Store dock model for later use
        this.dockModel = dockResult.model;
        console.log("Claude AI dock registered successfully");

        // Add topbar icon - 必须在 onLayoutReady 中调用
        this.topbarElement = this.addTopBar({
            icon: "iconClaudeCode",
            title: "Claude AI Assistant",
            position: "right",
            callback: () => {
                this.toggleDock();
            }
        });

        console.log("Claude AI Assistant initialized");
    }

    onunload() {
        console.log("[Plugin] 🧹 Starting unload sequence...");

        // CRITICAL: Clean DOM FIRST with synchronous cleanup
        this.cleanupTopbarIconsSync();

        // Verify cleanup succeeded
        const remainingElements = document.querySelectorAll('[aria-label*="Claude AI Assistant"]');
        if (remainingElements.length > 0) {
            console.error(`[Plugin] ⚠️ Failed to remove ${remainingElements.length} topbar elements`);
        } else {
            console.log("[Plugin] ✅ Topbar cleanup verified");
        }

        // Reset instance state to allow re-initialization
        this.topbarElement = null;
        this.dockElement = null;
        this.dockModel = null;

        // Clean up event listeners to prevent memory leaks
        if (this.blockIconHandler) {
            this.eventBus.off("click-blockicon", this.blockIconHandler);
            this.blockIconHandler = null;
        }
        if (this.contentMenuHandler) {
            this.eventBus.off("open-menu-content", this.contentMenuHandler);
            this.contentMenuHandler = null;
        }

        // Cleanup UI components
        if (this.unifiedPanel) {
            try {
                this.unifiedPanel.destroy();
                console.log("[Plugin] Unified panel destroyed");
            } catch (error) {
                console.error("[Plugin] Error destroying unified panel:", error);
            }
        }

        // Cancel any ongoing edit requests
        if (this.editQueue) {
            try {
                this.editQueue.cancelAll();
                console.log("[Plugin] Edit queue cancelled");
            } catch (error) {
                console.error("[Plugin] Error cancelling edit queue:", error);
            }
        }

        console.log("[Plugin] ✅ Unload complete");
    }

    /**
     * Synchronous, aggressive cleanup of topbar icons
     * CRITICAL: Must be synchronous to ensure complete cleanup before reload
     */
    private cleanupTopbarIconsSync(): void {
        try {
            console.log("[Plugin] Starting synchronous topbar cleanup...");

            // Strategy: Use multiple selectors to ensure we catch all possible icon locations
            const selectors = [
                'svg[data-icon="iconClaudeCode"]',
                '.toolbar__item:has(svg[data-icon="iconClaudeCode"])',
                '[aria-label*="Claude AI Assistant"]',
                '[xlink\\:href="#iconClaudeCode"]'
            ];

            let removedCount = 0;

            selectors.forEach(selector => {
                try {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        console.log(`[Plugin] Found ${elements.length} element(s) matching: ${selector}`);
                        elements.forEach(el => {
                            // Find the toolbar item parent
                            const toolbarItem = el.closest('.toolbar__item') || el;
                            toolbarItem.remove();
                            removedCount++;
                        });
                    }
                } catch (err) {
                    console.warn(`[Plugin] Failed to remove elements with selector ${selector}:`, err);
                }
            });

            // Force null the reference
            this.topbarElement = null;

            if (removedCount > 0) {
                console.log(`[Plugin] ✅ Removed ${removedCount} topbar element(s)`);
            } else {
                console.log("[Plugin] ✅ No topbar elements to remove");
            }

            console.log("[Plugin] ✅ Synchronous topbar cleanup complete");
        } catch (error) {
            console.error("[Plugin] ❌ Critical error during topbar cleanup:", error);
            // Don't throw - continue with unload even if cleanup fails
        }
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
        // Create custom content with header and settings container
        const customContent = `
            <div class="claude-settings-dialog-wrapper">
                <div class="claude-settings-dialog-header">
                    <div class="dialog-header-title">
                        <svg class="dialog-header-icon" style="width: 18px; height: 18px;"><use xlink:href="#iconSettings"></use></svg>
                        <span>Claude AI 设置</span>
                    </div>
                    <div class="dialog-header-actions">
                        <button class="b3-button b3-button--cancel" id="claude-settings-cancel">
                            取消
                        </button>
                        <button class="b3-button b3-button--text" id="claude-settings-save">
                            保存设置
                        </button>
                    </div>
                </div>
                <div id="claude-settings-container"></div>
            </div>
        `;

        const dialog = new Dialog({
            title: "", // Use custom header instead
            content: customContent,
            width: "900px",
            height: "70vh",
            disableClose: false,
        });

        const container = dialog.element.querySelector("#claude-settings-container");
        const cancelButton = dialog.element.querySelector("#claude-settings-cancel");
        const saveButton = dialog.element.querySelector("#claude-settings-save");

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
                        
                        // Update provider info badge in dock after Claude client is updated
                        if (this.unifiedPanel) {
                            setTimeout(() => {
                                this.unifiedPanel.updateProviderInfoBadge();
                                console.log("[ClaudePlugin] Provider badge updated after settings save");
                            }, 100);
                        }

                        // Show success message (dialog will be closed by save button handler)
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

            // Attach event listeners to header buttons
            if (cancelButton) {
                cancelButton.addEventListener("click", () => {
                    console.log("[ClaudePlugin] Cancel button clicked");
                    dialog.destroy();
                });
            }

            if (saveButton) {
                saveButton.addEventListener("click", async () => {
                    console.log("[ClaudePlugin] Save button clicked");
                    // Trigger the save functionality from settings panel (with explicit close)
                    await settingsPanel.triggerSaveAndClose();
                    
                    // Close dialog after successful save
                    dialog.destroy();
                });
            }
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

                    // Refresh presets in QuickEditManager and UnifiedAIPanel
                    if (this.quickEditManager) {
                        this.quickEditManager.refreshPresets();
                        console.log("[ClaudePlugin] QuickEditManager presets refreshed");
                    }
                    if (this.unifiedPanel) {
                        this.unifiedPanel.refreshPresetSelector();
                        console.log("[ClaudePlugin] UnifiedAIPanel presets refreshed");
                    }

                    console.log("[ClaudePlugin] ✅ Prompt settings updated successfully (QuickEditManager will use ClaudeClient settings)");
                } catch (error) {
                    console.error("[ClaudePlugin] Failed to save prompt settings:", error);
                    showMessage("❌ 保存提示词失败", 3000, "error");
                }
            },
            () => {
                // onPresetsChanged callback - refresh presets when they are created/updated/deleted
                console.log("[ClaudePlugin] Presets changed, refreshing UI...");
                if (this.quickEditManager) {
                    this.quickEditManager.refreshPresets();
                    console.log("[ClaudePlugin] QuickEditManager presets refreshed");
                }
                if (this.unifiedPanel) {
                    this.unifiedPanel.refreshPresetSelector();
                    console.log("[ClaudePlugin] UnifiedAIPanel presets refreshed");
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

    // [REMOVED] sendToAIEdit() - 功能已统一到 QuickEdit
    // [REMOVED] getEditorSelection() - 仅被已删除的方法使用
    // [REMOVED] createTextSelection() - 仅被已删除的方法使用
    // [REMOVED] getBlockSelection() - 仅被已删除的块菜单功能使用
    // [REMOVED] requestAIEdit() - 功能已统一到 QuickEdit

    // toggleEditDock removed - now using unified panel

    /**
     * Setup context menu for AI Edit
     */
    private setupContextMenu(): void {
        console.log("[AIEdit] Setting up context menu");

        // Register event handlers with arrow functions to preserve 'this' context
        // Store references for cleanup in onunload()

        // Block icon click - for block-level operations
        this.blockIconHandler = (event) => {
            this.onBlockIconClick(event);
        };
        this.eventBus.on("click-blockicon", this.blockIconHandler);

        // Editor content menu - for text selection operations
        this.contentMenuHandler = (event) => {
            this.onEditorContentMenu(event);
        };
        this.eventBus.on("open-menu-content", this.contentMenuHandler);

        console.log("[AIEdit] Context menu setup complete");
    }

    /**
     * Handle block icon click event (for context menu)
     */
    private onBlockIconClick(event: CustomEvent<BlockIconEvent>): void {
        const detail = event.detail;
        const { menu, blockElements } = detail;
        // Note: protyle is provided by SiYuan but not in BlockIconEvent type definition
        const protyle = (detail as any).protyle;

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

        // Check if there is text selection - if yes, defer to content menu
        // (Content menu provides better UX with keyboard shortcut hint)
        const selection = protyle?.wysiwyg?.element?.ownerDocument?.getSelection();
        if (selection && !selection.isCollapsed && selection.toString().trim()) {
            console.log("[AIEdit] Text selected, deferring to content menu");
            return;
        }

        // Add separator
        menu.addSeparator();

        // Add "Quick Edit" menu item with platform-aware shortcut display
        const quickEditShortcut = KeyboardShortcutFormatter.format(
            this.settingsManager.getSettings().keyboardShortcuts?.quickEdit || "⌃⇧Q"
        );
        menu.addItem({
            icon: "iconFlash",
            label: (this.i18n && typeof this.i18n.quickEdit === 'string' && this.i18n.quickEdit.trim())
                ? this.i18n.quickEdit
                : "AI 快速编辑",
            accelerator: quickEditShortcut,
            click: () => {
                console.log("[QuickEdit] 'Quick Edit' clicked from block menu");
                this.triggerQuickEdit();
            }
        });

        // [REMOVED] "编辑整个块" menu item - 功能与 dock 的"已选中X个块"重复
        // [REMOVED] Custom instruction submenu - 默认不显示且功能未启用

        console.log("[AIEdit] Menu items added");
    }

    /**
     * Handle editor content menu event (right-click on selected text)
     */
    private onEditorContentMenu(event: CustomEvent<ContentMenuEvent>): void {
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

        // Add "Quick Edit" menu item with platform-aware keyboard shortcut hint
        // Format shortcut based on platform: Windows shows "Ctrl+Shift+Q", macOS shows "⌃⇧Q"
        const quickEditShortcut = KeyboardShortcutFormatter.format(
            this.settingsManager.getSettings().keyboardShortcuts?.quickEdit || "⌃⇧Q"
        );
        menu.addItem({
            icon: "iconFlash",
            label: (this.i18n && typeof this.i18n.quickEdit === 'string' && this.i18n.quickEdit.trim())
                ? this.i18n.quickEdit
                : "AI 快速编辑",
            accelerator: quickEditShortcut,
            click: () => {
                console.log("[QuickEdit] 'Quick Edit' clicked from context menu");
                this.triggerQuickEdit();
            }
        });

        console.log("[AIEdit] Quick Edit menu item added for text selection");
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

    // [REMOVED] sendBlockToAIEdit() - 功能与 dock 的"已选中X个块"重复
    // [REMOVED] sendBlockToAIEditWithPreset() - Custom instruction 功能未启用

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

    /**
     * Migrate global quickEditPromptTemplate to default preset's editInstruction
     * This ensures the new two-level tab UI can display the previously saved template
     */
    private async migrateQuickEditToDefaultPreset(): Promise<void> {
        try {
            const settings = this.claudeClient.getSettings();

            // Check if global quickEditPromptTemplate exists and has content
            if (settings.quickEditPromptTemplate && settings.quickEditPromptTemplate.trim()) {
                console.log('[Migration] Found global quickEditPromptTemplate:',
                    settings.quickEditPromptTemplate.substring(0, 50) + '...');

                // Get all presets
                const allPresets = this.configManager.getAllTemplates();
                const defaultPreset = allPresets.find(p => p.id === 'default');

                if (defaultPreset) {
                    // Only migrate if default preset doesn't already have editInstruction
                    if (!defaultPreset.editInstruction || defaultPreset.editInstruction.trim() === '') {
                        // Migrate the template
                        defaultPreset.editInstruction = settings.quickEditPromptTemplate;

                        // Save updated presets
                        this.configManager.saveCustomTemplates(allPresets);

                        console.log('[Migration] ✅ Successfully migrated quickEditPromptTemplate to default preset');
                        showMessage('✅ 已迁移快速编辑模板配置到默认预设', 3000, 'info');
                    } else {
                        console.log('[Migration] ⏭️  Default preset already has editInstruction, skipping migration');
                    }
                } else {
                    console.warn('[Migration] ⚠️  Default preset not found, cannot migrate');
                }
            } else {
                console.log('[Migration] ℹ️  No global quickEditPromptTemplate found, skipping migration');
            }
        } catch (error) {
            console.error('[Migration] ❌ Error during quickEditPromptTemplate migration:', error);
        }
    }
}
