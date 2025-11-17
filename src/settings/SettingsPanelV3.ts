/**
 * Settings Panel V3 - Streamlined Configuration Management (Coordinator)
 *
 * Refactored to coordinator pattern as part of Task 1.1 architectural improvement.
 *
 * This coordinator delegates responsibilities to specialized modules:
 * - SettingsUIBuilder: HTML generation
 * - ProfileManager: Profile CRUD operations
 * - PresetInfoLoader: Preset information loading
 * - SettingsPersistence: Save/load/test operations
 * - SettingsEventHandler: Event handling coordination
 *
 * Reduced from 1788 lines → ~220 lines.
 *
 * @module SettingsPanelV3
 * @see SettingsUIBuilder
 * @see ProfileManager
 * @see PresetInfoLoader
 * @see SettingsPersistence
 * @see SettingsEventHandler
 */

import type { ClaudeSettings } from "../claude";
import type { ConfigManager } from "./ConfigManager";
import type { ConfigProfile } from "./config-types";
import { Dialog } from "siyuan";

// Modular components (Task 1.1 refactoring)
import { SettingsUIBuilder } from "./ui/SettingsUIBuilder";
import { ProfileManager } from "./managers/ProfileManager";
import { PresetInfoLoader } from "./managers/PresetInfoLoader";
import { SettingsPersistence } from "./managers/SettingsPersistence";
import { SettingsEventHandler } from "./ui/SettingsEventHandler";

/**
 * Settings Panel V3 - Main Coordinator Class
 *
 * Acts as a facade coordinating between UI, business logic, and data modules.
 */
export class SettingsPanelV3 {
    private element: HTMLElement;
    private container: HTMLElement | null = null;
    private dialog: Dialog | null = null;

    // Configuration
    private configManager: ConfigManager;
    private currentProfile: ConfigProfile;

    // Callbacks
    private onSave: (settings: Partial<ClaudeSettings>) => void;
    private onOpenPromptEditor: () => void;

    // Modular components (Task 1.1 refactoring)
    private profileManager: ProfileManager;
    private presetInfoLoader: PresetInfoLoader;
    private settingsPersistence: SettingsPersistence;
    private eventHandler: SettingsEventHandler;

    constructor(
        configManager: ConfigManager,
        onSave: (settings: Partial<ClaudeSettings>) => void,
        onOpenPromptEditor: () => void
    ) {
        this.configManager = configManager;
        this.currentProfile = configManager.getActiveProfile();
        this.onSave = onSave;
        this.onOpenPromptEditor = onOpenPromptEditor;

        // Initialize modular components
        this.profileManager = new ProfileManager(configManager);
        this.presetInfoLoader = new PresetInfoLoader(configManager);
        this.settingsPersistence = new SettingsPersistence(configManager);
        this.eventHandler = new SettingsEventHandler(
            this.profileManager,
            this.settingsPersistence,
            this.currentProfile
        );

        this.element = this.createPanel();
    }

    /**
     * Create the main settings panel
     */
    private createPanel(): HTMLElement {
        console.log("[SettingsPanelV3] Creating panel...");
        const container = document.createElement("div");
        container.className = "claude-settings-panel-v3-with-nav";

        console.log("[SettingsPanelV3] Current profile:", this.currentProfile);

        // Generate HTML using SettingsUIBuilder
        const profiles = this.configManager.getAllProfiles();
        const activeProfileId = this.configManager.getActiveProfileId();

        const navigationBar = SettingsUIBuilder.createNavigationBar();
        const profileSection = SettingsUIBuilder.createProfileManagementSection(
            profiles,
            activeProfileId,
            this.currentProfile
        );
        const connectionSection = SettingsUIBuilder.createConnectionSection(this.currentProfile);
        const promptEditorSection = SettingsUIBuilder.createPromptEditorSection();
        const keyboardShortcutsSection = SettingsUIBuilder.createKeyboardShortcutsSection(this.currentProfile);
        const loggingSection = SettingsUIBuilder.createLoggingSection(this.currentProfile);

        console.log("[SettingsPanelV3] Sections created, profile section length:", profileSection.length);

        container.innerHTML = `
            ${navigationBar}
            <div class="settings-content">
                <div class="settings-content-scroll">
                    <div class="settings-section active" id="section-profile">
                        ${profileSection}
                    </div>
                    <div class="settings-section" id="section-connection">
                        ${connectionSection}
                    </div>
                    <div class="settings-section" id="section-prompt">
                        ${promptEditorSection}
                    </div>
                    <div class="settings-section" id="section-shortcuts">
                        ${keyboardShortcutsSection}
                    </div>
                    <div class="settings-section" id="section-logging">
                        ${loggingSection}
                    </div>
                </div>
            </div>
        `;

        console.log("[SettingsPanelV3] HTML set, container innerHTML length:", container.innerHTML.length);

        // Store container reference for triggerSave() method
        this.container = container;

        // Attach event listeners using SettingsEventHandler
        this.attachEventListeners(container);

        console.log("[SettingsPanelV3] Event listeners attached");
        return container;
    }

    /**
     * Attach all event listeners (delegates to SettingsEventHandler)
     */
    private attachEventListeners(container: HTMLElement): void {
        this.eventHandler.attachEventListeners(container, {
            onProfileChanged: (profile) => {
                this.currentProfile = profile;
                this.eventHandler.setCurrentProfile(profile);
                // Reload preset info when profile changes
                this.presetInfoLoader.loadPresetInfo(this.currentProfile, container);
            },
            onOpenPromptEditor: () => {
                this.onOpenPromptEditor();
            },
            onSave: () => {
                this.triggerSave();
            },
        });

        // Load preset information asynchronously
        this.presetInfoLoader.loadPresetInfo(this.currentProfile, container);
    }

    /**
     * Save settings (delegates to SettingsPersistence)
     *
     * @param container - Settings panel container element
     * @param closeAfterSave - Whether to close dialog after saving
     */
    private saveSettings(container: HTMLElement, closeAfterSave: boolean = true): void {
        const updates = this.settingsPersistence.saveSettings(
            this.currentProfile,
            container,
            this.onSave
        );

        console.log('[SettingsPanelV3] Settings saved, closing:', closeAfterSave);

        // Only close if explicitly requested (e.g., from Save button)
        if (closeAfterSave) {
            this.close();
        }
    }

    //#region Public API

    /**
     * Get the panel HTML element
     */
    getElement(): HTMLElement {
        return this.element;
    }

    /**
     * Open the settings panel in a dialog
     */
    open(dialog: Dialog): void {
        this.dialog = dialog;
    }

    /**
     * Close the settings panel dialog
     */
    close(): void {
        if (this.dialog) {
            this.dialog.destroy();
            this.dialog = null;
        }
    }

    /**
     * Trigger save action from external components (e.g., title bar button)
     * This allows the title bar Save button to trigger the save workflow
     */
    triggerSave(): void {
        if (this.container) {
            // Auto-save from provider switching - don't close dialog
            this.saveSettings(this.container, false);
        } else {
            console.error("[SettingsPanelV3] Cannot save: container not initialized");
        }
    }

    /**
     * Trigger save action and prepare for dialog close
     * Used by Save button to save settings without closing dialog
     * (dialog will be closed by button handler in index.ts)
     */
    async triggerSaveAndClose(): Promise<void> {
        if (this.container) {
            // Save from explicit Save button - but don't close dialog here
            // The dialog will be closed by the button handler in index.ts
            this.saveSettings(this.container, false);
        } else {
            console.error("[SettingsPanelV3] Cannot save: container not initialized");
        }
    }

    //#endregion
}
