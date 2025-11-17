/**
 * Preset Info Loader - Preset Information Management Module
 *
 * Handles loading and displaying preset information in the settings panel:
 * - Loading Quick Edit and AI Dock presets from localStorage
 * - Updating preset info cards
 * - Calculating filter rule statistics
 *
 * Separated from SettingsPanelV3 as part of architectural refactoring (Task 1.1).
 *
 * @module PresetInfoLoader
 * @see SettingsPanelV3
 */

import type { ConfigManager } from "../ConfigManager";
import type { PromptTemplate, ConfigProfile } from "../config-types";
import { SettingsUIBuilder } from "../ui/SettingsUIBuilder";

/**
 * Manager class for loading and displaying preset information
 */
export class PresetInfoLoader {
    private configManager: ConfigManager;
    private quickEditPreset: PromptTemplate | null = null;
    private aiDockPreset: PromptTemplate | null = null;

    constructor(configManager: ConfigManager) {
        this.configManager = configManager;
    }

    /**
     * Load preset information asynchronously
     * This method fetches the current active presets for Quick Edit and AI Dock,
     * then updates the UI cards with preset details
     */
    async loadPresetInfo(currentProfile: ConfigProfile, container: HTMLElement): Promise<void> {
        try {
            console.log('[PresetInfoLoader] Loading preset info...');

            // Get Quick Edit preset from localStorage (PresetSelectionManager uses 'lastSelectedPresetId')
            // NOTE: PresetSelectionManager stores preset ID (not index), aligned since v0.9.0
            const quickEditPresetId = localStorage.getItem('lastSelectedPresetId') || 'default';
            console.log('[PresetInfoLoader] Quick Edit preset ID from localStorage:', quickEditPresetId);

            // Validate preset exists before using it
            const preset = this.configManager.getTemplateById(quickEditPresetId);
            this.quickEditPreset = preset || this.configManager.getTemplateById('default');
            console.log('[PresetInfoLoader] Quick Edit preset loaded:', this.quickEditPreset?.name || 'default');

            // Get AI Dock preset from localStorage (UnifiedAIPanel persists to 'claude-ai-dock-preset-id')
            // NOTE: AI Dock now persists selection, aligned with Quick Edit persistence pattern
            const aiDockPresetId = localStorage.getItem('claude-ai-dock-preset-id') || 'default';
            console.log('[PresetInfoLoader] AI Dock preset ID from localStorage:', aiDockPresetId);

            // Validate preset exists before using it
            const aiDockPreset = this.configManager.getTemplateById(aiDockPresetId);
            this.aiDockPreset = aiDockPreset || this.configManager.getTemplateById('default');
            console.log('[PresetInfoLoader] AI Dock preset loaded:', this.aiDockPreset?.name || 'default');

            // Update the UI
            this.updatePresetCards(currentProfile, container);
        } catch (error) {
            console.error("[PresetInfoLoader] Failed to load preset info:", error);
            // Display error in cards
            this.displayErrorState(container);
        }
    }

    /**
     * Update preset info with loaded preset data (List version)
     */
    updatePresetCards(currentProfile: ConfigProfile, container: HTMLElement): void {
        // Update Quick Edit content
        const quickEditContent = container.querySelector("#quick-edit-preset-card");
        if (quickEditContent && this.quickEditPreset) {
            const preset = this.quickEditPreset;
            const icon = SettingsUIBuilder.escapeHtml(preset.icon || '📝');
            const name = SettingsUIBuilder.escapeHtml(preset.name);
            const filterCount = (preset.filterRules || []).filter(r => r.enabled).length;

            quickEditContent.innerHTML = `
                <span style="font-size: 18px; margin-right: 8px;">${icon}</span>
                <span style="font-weight: 500;">${name}</span>
                ${filterCount > 0 ? `<span style="margin-left: 8px; font-size: 11px; color: var(--b3-theme-primary); background: var(--b3-theme-primary-lightest); padding: 2px 6px; border-radius: 3px;">🔧 ${filterCount}</span>` : ''}
            `;
        }

        // Update AI Dock content
        const aiDockContent = container.querySelector("#ai-dock-preset-card");
        if (aiDockContent && this.aiDockPreset) {
            const preset = this.aiDockPreset;
            const icon = SettingsUIBuilder.escapeHtml(preset.icon || '💬');
            const name = SettingsUIBuilder.escapeHtml(preset.name);
            const filterCount = (preset.filterRules || []).filter(r => r.enabled).length;

            aiDockContent.innerHTML = `
                <span style="font-size: 18px; margin-right: 8px;">${icon}</span>
                <span style="font-weight: 500;">${name}</span>
                ${filterCount > 0 ? `<span style="margin-left: 8px; font-size: 11px; color: var(--b3-theme-primary); background: var(--b3-theme-primary-lightest); padding: 2px 6px; border-radius: 3px;">🔧 ${filterCount}</span>` : ''}
            `;
        }

        // Update filter stats
        const stats = this.getFilterRuleStats(currentProfile);
        const statsInline = container.querySelector("#filter-stats-inline");
        if (statsInline) {
            statsInline.innerHTML = `
                📊 过滤规则:
                <span class="stat-badge">全局 <strong>${stats.enabledGlobalCount}</strong></span> ·
                <span class="stat-badge">Quick Edit <strong>${stats.enabledQuickEditCount}</strong></span> ·
                <span class="stat-badge">AI Dock <strong>${stats.enabledAIDockCount}</strong></span>
            `;
        }
    }

    /**
     * Get filter rule statistics
     * Returns count of enabled rules for global, Quick Edit, and AI Dock
     */
    private getFilterRuleStats(currentProfile: ConfigProfile): {
        enabledGlobalCount: number;
        enabledQuickEditCount: number;
        enabledAIDockCount: number;
    } {
        const globalRules = currentProfile.settings.filterRules || [];
        const enabledGlobalCount = globalRules.filter(r => r.enabled).length;

        const quickEditRules = this.quickEditPreset?.filterRules || [];
        const enabledQuickEditCount = quickEditRules.filter(r => r.enabled).length;

        const aiDockRules = this.aiDockPreset?.filterRules || [];
        const enabledAIDockCount = aiDockRules.filter(r => r.enabled).length;

        return { enabledGlobalCount, enabledQuickEditCount, enabledAIDockCount };
    }

    /**
     * Display error state in preset cards
     */
    private displayErrorState(container: HTMLElement): void {
        const quickEditCard = container.querySelector("#quick-edit-preset-card");
        const aiDockCard = container.querySelector("#ai-dock-preset-card");

        if (quickEditCard) {
            quickEditCard.innerHTML = `
                <div class="preset-label" style="font-size: 12px; color: var(--b3-theme-on-surface-light); margin-bottom: 8px;">⚡ Quick Edit 当前激活</div>
                <div style="color: var(--b3-theme-error);">加载失败</div>
            `;
        }
        if (aiDockCard) {
            aiDockCard.innerHTML = `
                <div class="preset-label" style="font-size: 12px; color: var(--b3-theme-on-surface-light); margin-bottom: 8px;">💬 AI 对话当前激活</div>
                <div style="color: var(--b3-theme-error);">加载失败</div>
            `;
        }
    }

    /**
     * Get loaded Quick Edit preset (for external access)
     */
    getQuickEditPreset(): PromptTemplate | null {
        return this.quickEditPreset;
    }

    /**
     * Get loaded AI Dock preset (for external access)
     */
    getAIDockPreset(): PromptTemplate | null {
        return this.aiDockPreset;
    }
}
