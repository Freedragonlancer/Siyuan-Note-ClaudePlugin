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
import type { DockModel } from "@/types/siyuan";
import { KeyboardShortcutFormatter } from "./utils/KeyboardShortcutFormatter";
import { Logger, LogLevel } from "./utils/Logger";

const PLUGIN_NAME = "siyuan-plugin-claude-assistant";

export default class ClaudeAssistantPlugin extends Plugin {
    private settingsManager!: SettingsManager;
    private configManager!: ConfigManager;
    private claudeClient!: ClaudeClient;
    private unifiedPanel: UnifiedAIPanel | null = null;
    private dockElement: HTMLElement | null = null;
    private dockModel: DockModel | null = null;
    private topbarElement: HTMLElement | null = null;
    private layoutReadyCalled: boolean = false; // Prevent duplicate onLayoutReady calls

    // AI Text Editing feature (initialized for UnifiedPanel)
    private textSelectionManager: TextSelectionManager | null = null;
    private aiEditProcessor: AIEditProcessor | null = null;
    private diffRenderer: DiffRenderer | null = null;
    private editQueue: EditQueue | null = null;
    private editHistory: EditHistory | null = null;

    // Quick Edit Mode
    private quickEditManager: QuickEditManager | null = null;

    // Event handlers for cleanup
    private blockIconHandler: ((event: any) => void) | null = null;
    private contentMenuHandler: ((event: any) => void) | null = null;

    // Initialization promise to track when onload completes
    private initializationComplete: Promise<void> | null = null;
    private initializationResolver: (() => void) | null = null;

    async onload() {
        // Configure global Logger
        const isDev = process.env.NODE_ENV === 'development';
        Logger.configure({
            level: isDev ? LogLevel.DEBUG : LogLevel.WARN,
            prefix: '[Claude]',
            enableTimestamp: false
        });

        const logger = Logger.createScoped('Plugin');
        logger.info('Loading Claude Assistant Plugin v0.10.0');

        // Create initialization promise
        this.initializationComplete = new Promise<void>((resolve) => {
            this.initializationResolver = resolve;
        });

        // Register custom icons
        this.addIcons(CLAUDE_ICON_SVG);
        logger.debug('Custom Claude icon registered');

        // Initialize ConfigManager (new configuration system)
        this.configManager = new ConfigManager(this);
        logger.debug('ConfigManager initialized');

        // Migrate old settings to config system if needed
        this.migrateOldSettings();

        // Initialize settings with callback to update ClaudeClient when async load completes
        this.settingsManager = new SettingsManager(this, (loadedSettings) => {
            logger.debug('Settings loaded asynchronously, updating ClaudeClient');
            if (this.claudeClient) {
                this.claudeClient.updateSettings(loadedSettings);
            } else {
                logger.debug('ClaudeClient not yet initialized, will use loaded settings on init');
            }
        });

        // Wait for async settings load to complete before proceeding
        // The SettingsManager exposes a waitForLoad() promise that ensures file loading is complete
        let settings: ClaudeSettings;

        try {
            await this.settingsManager.waitForLoad();
            logger.debug('Settings async load complete');

            // Get settings from SettingsManager (which has now loaded from file)
            const loadedSettings = this.settingsManager.getSettings();
            logger.debug('Loaded settings from SettingsManager', { hasApiKey: !!loadedSettings.apiKey });

            // Sync loaded settings to ConfigManager active profile if needed
            const activeProfile = this.configManager.getActiveProfile();

            // Only update ConfigManager if the loaded settings have an API key
            // (indicates they are real saved settings, not just defaults)
            if (loadedSettings.apiKey) {
                logger.debug('Syncing loaded settings to ConfigManager');
                this.configManager.updateProfile(activeProfile.id, {
                    settings: { ...activeProfile.settings, ...loadedSettings }
                });
            } else {
                logger.debug('No saved settings found, using ConfigManager defaults');
            }

            // Use the loaded settings for initialization
            settings = loadedSettings.apiKey ? loadedSettings : activeProfile.settings;

            // Migrate quickEditPromptTemplate from EditSettings to ClaudeSettings
            settings = this.migrateQuickEditPromptTemplate(settings);
        } catch (error) {
            logger.error('Error during settings load, using defaults', error);
            // Fallback to defaults if anything fails
            settings = this.configManager.getActiveProfile().settings;
        }

        // Initialize Claude client with ConfigManager for preset-level filterRules
        this.claudeClient = new ClaudeClient(settings, this.configManager);
        this.claudeClient.setPlugin(this); // Set plugin instance for file storage access
        logger.debug('ClaudeClient initialized with plugin reference');

        // Migrate quickEditPromptTemplate to default preset (new two-level tab system)
        await this.migrateQuickEditToDefaultPreset();
        logger.debug('QuickEdit template migration check completed');

        // Initialize AI Text Editing feature
        try {
            this.initializeEditFeature(settings);
            logger.debug('Edit feature initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize edit feature', error);
            // Continue anyway, we can still show the panel even if edit features fail
        }

        // Setup right-click context menu for AI Edit
        try {
            this.setupContextMenu();
            logger.debug('Context menu setup complete');
        } catch (error) {
            logger.error('Failed to setup context menu', error);
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

        // Check if API key is configured
        if (!settings.apiKey) {
            setTimeout(() => {
                showMessage("Claude Assistant: Please configure your API key in settings", 5000, "info");
            }, 1000);
        }

        // Signal that initialization is complete
        if (this.initializationResolver) {
            this.initializationResolver();
            logger.info('Initialization complete');
        }
    }

    onLayoutReady() {
        // Prevent duplicate onLayoutReady calls
        if (this.layoutReadyCalled) {
            logger.warn('onLayoutReady already called, skipping duplicate call');
            return;
        }
        this.layoutReadyCalled = true;

        // Check if topbar already exists
        if (this.topbarElement) {
            logger.warn('Topbar already exists, skipping addTopBar');
            return;
        }

        // Clean up any existing Claude icons in DOM (防止残留)
        const existingIcons = document.querySelectorAll('svg[data-icon="iconClaudeCode"]');
        if (existingIcons.length > 0) {
            logger.warn(`Found ${existingIcons.length} existing topbar icons, cleaning up`);
            existingIcons.forEach(icon => {
                const item = icon.closest('.toolbar__item');
                if (item) {
                    item.remove();
                }
            });
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

                // Wait for plugin initialization to complete
                (async () => {
                    try {
                        if (plugin.initializationComplete) {
                            await plugin.initializationComplete;
                        }

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
                        } else {
                            logger.error('Missing required dependencies for dock panel');
                            this.element.innerHTML = '<div style="padding: 20px; color: orange;">缺少必要组件，请重启插件</div>';
                        }
                    } catch (error) {
                        logger.error('Failed to initialize UnifiedAIPanel', error);
                        this.element.innerHTML = '<div style="padding: 20px; color: red;">初始化失败: ' + (error as Error).message + '</div>';
                    }
                })();
            },
        });

        // Store dock model for later use
        this.dockModel = dockResult.model;

        // Add topbar icon - 必须在 onLayoutReady 中调用
        this.topbarElement = this.addTopBar({
            icon: "iconClaudeCode",
            title: "Claude AI Assistant",
            position: "right",
            callback: () => {
                this.toggleDock();
            }
        });
    }

    async onunload() {

        // Clean up event listeners to prevent memory leaks
        if (this.blockIconHandler) {
            this.eventBus.off("click-blockicon", this.blockIconHandler);
            this.blockIconHandler = null;
        }
        if (this.contentMenuHandler) {
            this.eventBus.off("open-menu-content", this.contentMenuHandler);
            this.contentMenuHandler = null;
        }

        // Clean up topbar icon to prevent duplicates on reload (enhanced multi-strategy cleanup)
        if (this.topbarElement) {
            try {
                // Strategy 1: Find and remove all Claude icons by data-icon attribute
                const existingIcons = document.querySelectorAll('svg[data-icon="iconClaudeCode"]');
                existingIcons.forEach(icon => {
                    const item = icon.closest('.toolbar__item');
                    if (item) {
                        item.remove();
                    }
                });

                // Strategy 2: Try direct element removal
                try {
                    this.topbarElement.remove();
                } catch (err) {
                    // Silent fallback
                }

                // Strategy 3: Use multiple selectors as fallback
                const fallbackSelectors = [
                    '.toolbar__item[aria-label*="Claude"]',
                    '[data-type="plugin-topbar"]'
                ];

                fallbackSelectors.forEach(selector => {
                    const items = document.querySelectorAll(selector);
                    items.forEach(item => {
                        // Check if this item contains our icon
                        if (item.querySelector('[xlink\\:href="#iconClaudeCode"]') ||
                            item.querySelector('svg[data-icon="iconClaudeCode"]')) {
                            item.remove();
                        }
                    });
                });

                this.topbarElement = null;
            } catch (error) {
                logger.error('Error during topbar cleanup', error);
            }
        }

        // Cleanup UI components
        if (this.unifiedPanel) {
            try {
                this.unifiedPanel.destroy();
            } catch (error) {
                logger.error('Error destroying unified panel', error);
            }
        }

        // Cancel any ongoing edit requests
        if (this.editQueue) {
            try {
                this.editQueue.cancelAll();
            } catch (error) {
                logger.error('Error cancelling edit queue', error);
            }
        }
    }

    uninstall() {
        // Clean up if needed
    }

    private toggleDock() {
        // 使用 SiYuan 的 Dock API 来切换 dock 显示
        const win = window as any;
        const layout = win.siyuan?.layout;

        if (!layout) {
            logger.error('SiYuan layout not found');
            return;
        }

        // position: "RightBottom" 对应 rightDock
        const dock = layout.rightDock;

        if (!dock) {
            logger.error('Right dock not found');
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
                        await this.settingsManager.saveSettings(newSettings);

                        // Update Claude client
                        this.claudeClient.updateSettings(this.configManager.getActiveProfile().settings);

                        // Show success message and close dialog
                        showMessage("✅ 设置已保存", 2000, "info");
                        dialog.destroy();
                    } catch (error) {
                        logger.error('Failed to save settings', error);
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
                    dialog.destroy();
                });
            }

            if (saveButton) {
                saveButton.addEventListener("click", async () => {
                    // Trigger the save functionality from settings panel
                    settingsPanel.triggerSave();
                });
            }
        }
    }

    /**
     * Open Prompt Editor Panel
     */
    private async openPromptEditor(): Promise<void> {
        // Ensure templates are loaded before opening editor
        await this.configManager.waitForInit();

        const activeProfile = this.configManager.getActiveProfile();
        const promptEditor = new PromptEditorPanel(
            this.configManager,
            activeProfile.settings,
            async (newSettings) => {
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
                    }
                    if (this.unifiedPanel) {
                        this.unifiedPanel.refreshPresetSelector();
                    }
                } catch (error) {
                    logger.error('Failed to save prompt settings', error);
                    showMessage("❌ 保存提示词失败", 3000, "error");
                }
            },
            () => {
                // onPresetsChanged callback - refresh presets when they are created/updated/deleted
                if (this.quickEditManager) {
                    this.quickEditManager.refreshPresets();
                }
                if (this.unifiedPanel) {
                    this.unifiedPanel.refreshPresetSelector();
                }
            }
        );

        promptEditor.open();
    }

    /**
     * Initialize AI Text Editing feature
     */
    private initializeEditFeature(settings: ClaudeSettings): void {
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

        // Initialize Quick Edit Manager
        this.quickEditManager = new QuickEditManager(
            this,
            this.claudeClient,
            this.editHistory,
            editSettings,
            this.configManager
        );
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
    }

    /**
     * Handle block icon click event (for context menu)
     */
    private onBlockIconClick(event: any): void {
        const detail = event.detail;
        const { menu, protyle, blockElements } = detail;

        // Check if we have any block elements
        if (!blockElements || blockElements.length === 0) {
            return;
        }

        // Get the first block element
        const blockElement = blockElements[0];

        // Check if block has text content
        const textContent = blockElement.textContent?.trim();
        if (!textContent) {
            return;
        }

        // Check if there is text selection - if yes, defer to content menu
        // (Content menu provides better UX with keyboard shortcut hint)
        const selection = protyle?.wysiwyg?.element?.ownerDocument?.getSelection();
        if (selection && !selection.isCollapsed && selection.toString().trim()) {
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
                this.triggerQuickEdit();
            }
        });

        // [REMOVED] "编辑整个块" menu item - 功能与 dock 的"已选中X个块"重复
        // [REMOVED] Custom instruction submenu - 默认不显示且功能未启用
    }

    /**
     * Handle editor content menu event (right-click on selected text)
     */
    private onEditorContentMenu(event: any): void {
        const detail = event.detail;
        const { menu, range, protyle } = detail;

        // Check if there's a text selection
        if (!range || range.collapsed) {
            return;
        }

        const selectedText = range.toString().trim();
        if (!selectedText) {
            return;
        }

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
                this.triggerQuickEdit();
            }
        });
    }

    /**
     * Undo the last AI edit
     */
    private async undoLastAIEdit(): Promise<void> {
        if (!this.diffRenderer || !this.editHistory) {
            logger.error('Edit features not initialized');
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
            logger.error('Error undoing edit', error);
            showMessage("撤销编辑失败", 3000, "error");
        }
    }

    /**
     * Trigger Quick Edit dialog
     */
    private triggerQuickEdit(): void {
        if (!this.quickEditManager) {
            logger.error('Quick Edit Manager not initialized');
            showMessage("快速编辑功能未初始化", 3000, "error");
            return;
        }

        try {
            this.quickEditManager.trigger();
        } catch (error) {
            logger.error('Error triggering quick edit', error);
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
                return;
            }

            // Check if there are existing profiles
            const existingProfiles = this.configManager.getAllProfiles();
            if (existingProfiles.length > 1) {
                // Multiple profiles exist, assume migration done
                localStorage.setItem('claude-migration-v3-done', 'true');
                return;
            }

            // Try to load old settings
            const oldSettingsKey = 'claude-assistant-settings';
            const oldSettingsData = localStorage.getItem(oldSettingsKey);

            if (!oldSettingsData) {
                localStorage.setItem('claude-migration-v3-done', 'true');
                return;
            }

            // Parse old settings
            const oldSettings = JSON.parse(oldSettingsData);

            // Get default profile
            const defaultProfile = this.configManager.getActiveProfile();

            // Merge old settings into default profile
            this.configManager.updateProfile(defaultProfile.id, {
                settings: { ...defaultProfile.settings, ...oldSettings }
            });

            logger.info('Migrated old settings to config system');

            // Mark migration as done
            localStorage.setItem('claude-migration-v3-done', 'true');

        } catch (error) {
            logger.error('Error during migration', error);
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
                return settings;
            }

            // Check if EditSettings has quickEditPromptTemplate
            if (settings.editSettings?.quickEditPromptTemplate) {
                settings.quickEditPromptTemplate = settings.editSettings.quickEditPromptTemplate;

                // Clean up old field (optional, but keeps data clean)
                delete settings.editSettings.quickEditPromptTemplate;

                // Save migrated settings
                this.settingsManager.saveSettings(settings).catch(err => {
                    logger.error('Failed to save migrated settings', err);
                });

                logger.info('Migrated quickEditPromptTemplate to ClaudeSettings');
            }

            return settings;
        } catch (error) {
            logger.error('Error during quickEditPromptTemplate migration', error);
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

                        logger.info('Migrated quickEditPromptTemplate to default preset');
                        showMessage('✅ 已迁移快速编辑模板配置到默认预设', 3000, 'info');
                    }
                } else {
                    logger.warn('Default preset not found, cannot migrate');
                }
            }
        } catch (error) {
            logger.error('Error during quickEditPromptTemplate migration', error);
        }
    }
}
