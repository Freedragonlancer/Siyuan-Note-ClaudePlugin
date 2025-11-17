/**
 * Profile Manager - Profile CRUD Operations Module
 *
 * Handles all profile management operations including:
 * - Creating, duplicating, renaming, deleting profiles
 * - Switching between profiles
 * - Importing/exporting profiles
 * - Refreshing UI after profile changes
 *
 * Separated from SettingsPanelV3 as part of architectural refactoring (Task 1.1).
 *
 * @module ProfileManager
 * @see SettingsPanelV3
 */

import type { ConfigManager } from "../ConfigManager";
import type { ConfigProfile } from "../config-types";
import { SettingsUIBuilder } from "../ui/SettingsUIBuilder";

/**
 * Manager class for profile operations
 */
export class ProfileManager {
    private configManager: ConfigManager;

    constructor(configManager: ConfigManager) {
        this.configManager = configManager;
    }

    /**
     * Switch to a different profile
     */
    switchProfile(profileId: string, container: HTMLElement, onProfileChanged: (profile: ConfigProfile) => void): void {
        const profile = this.configManager.getProfile(profileId);
        if (!profile) {
            console.error('[ProfileManager] Profile not found:', profileId);
            return;
        }

        this.configManager.setActiveProfile(profileId);

        // Refresh UI with new profile settings
        this.refreshSettingsUI(profile, container);

        // Notify parent component
        onProfileChanged(profile);

        console.log('[ProfileManager] Switched to profile:', profile.name);
    }

    /**
     * Refresh settings UI with current profile data
     */
    refreshSettingsUI(profile: ConfigProfile, container: HTMLElement): void {
        const settings = profile.settings;

        // Update description
        const descElem = container.querySelector("#profile-description");
        if (descElem) {
            descElem.textContent = profile.description || '';
        }

        // Update API key
        const apiKeyInput = container.querySelector("#claude-api-key") as HTMLInputElement;
        if (apiKeyInput) {
            apiKeyInput.value = settings.apiKey || '';
        }

        // Update base URL
        const baseURLInput = container.querySelector("#claude-base-url") as HTMLInputElement;
        if (baseURLInput) {
            baseURLInput.value = settings.baseURL || '';
        }

        // Update provider radio
        const hasProxy = !!settings.baseURL;
        const officialRadio = container.querySelector('input[name="api-provider"][value="official"]') as HTMLInputElement;
        const proxyRadio = container.querySelector('input[name="api-provider"][value="proxy"]') as HTMLInputElement;
        if (officialRadio && proxyRadio) {
            officialRadio.checked = !hasProxy;
            proxyRadio.checked = hasProxy;
        }

        // Update proxy section visibility
        const proxySection = container.querySelector("#proxy-url-section") as HTMLElement;
        if (proxySection) {
            proxySection.style.display = hasProxy ? 'block' : 'none';
        }

        // Update model
        const modelSelect = container.querySelector("#claude-model") as HTMLSelectElement;
        if (modelSelect) {
            modelSelect.value = settings.model;
        }

        // Update max tokens
        const maxTokensSlider = container.querySelector("#claude-max-tokens") as HTMLInputElement;
        const maxTokensValue = container.querySelector("#max-tokens-value");
        if (maxTokensSlider) {
            maxTokensSlider.value = String(settings.maxTokens);
        }
        if (maxTokensValue) {
            maxTokensValue.textContent = `${settings.maxTokens} tokens`;
        }

        // Update temperature
        const tempSlider = container.querySelector("#claude-temperature") as HTMLInputElement;
        const tempValue = container.querySelector("#temperature-value");
        if (tempSlider) {
            tempSlider.value = String(settings.temperature);
        }
        if (tempValue) {
            tempValue.textContent = String(settings.temperature);
        }

        // Update delete button state
        const deleteBtn = container.querySelector("#delete-profile-btn") as HTMLButtonElement;
        if (deleteBtn) {
            deleteBtn.disabled = profile.isDefault || false;
        }
    }

    /**
     * Create a new profile
     */
    createNewProfile(currentProfile: ConfigProfile, container: HTMLElement, onProfileChanged: (profile: ConfigProfile) => void): void {
        const name = prompt('请输入新配置的名称:', '新配置');
        if (!name || !name.trim()) return;

        if (this.configManager.profileNameExists(name.trim())) {
            alert('配置名称已存在，请使用其他名称');
            return;
        }

        const newProfile = this.configManager.createProfile(
            name.trim(),
            currentProfile.settings,
            '基于当前配置创建'
        );

        // Switch to new profile
        this.configManager.setActiveProfile(newProfile.id);

        // Refresh selector
        this.refreshProfileSelector(container, newProfile.id);

        // Notify parent
        onProfileChanged(newProfile);

        console.log('[ProfileManager] Created new profile:', name);
    }

    /**
     * Duplicate current profile
     */
    duplicateCurrentProfile(currentProfile: ConfigProfile, container: HTMLElement): void {
        const name = prompt('请输入复制配置的名称:', `${currentProfile.name} (复制)`);
        if (!name || !name.trim()) return;

        if (this.configManager.profileNameExists(name.trim())) {
            alert('配置名称已存在，请使用其他名称');
            return;
        }

        const duplicated = this.configManager.duplicateProfile(currentProfile.id, name.trim());
        if (!duplicated) {
            alert('复制配置失败');
            return;
        }

        // Refresh selector
        this.refreshProfileSelector(container, currentProfile.id);

        console.log('[ProfileManager] Duplicated profile:', name);
    }

    /**
     * Rename current profile
     */
    renameCurrentProfile(currentProfile: ConfigProfile, container: HTMLElement, onProfileChanged: (profile: ConfigProfile) => void): void {
        if (currentProfile.isDefault) {
            alert('默认配置不能重命名');
            return;
        }

        const newName = prompt('请输入新的配置名称:', currentProfile.name);
        if (!newName || !newName.trim()) return;

        if (this.configManager.profileNameExists(newName.trim(), currentProfile.id)) {
            alert('配置名称已存在，请使用其他名称');
            return;
        }

        this.configManager.updateProfile(currentProfile.id, { name: newName.trim() });
        const updatedProfile = this.configManager.getProfile(currentProfile.id)!;

        // Refresh selector
        this.refreshProfileSelector(container, currentProfile.id);

        // Notify parent
        onProfileChanged(updatedProfile);

        console.log('[ProfileManager] Renamed profile to:', newName);
    }

    /**
     * Delete current profile
     */
    deleteCurrentProfile(currentProfile: ConfigProfile, container: HTMLElement, onProfileChanged: (profile: ConfigProfile) => void): void {
        if (currentProfile.isDefault) {
            alert('默认配置不能删除');
            return;
        }

        const confirmed = confirm(`确定要删除配置"${currentProfile.name}"吗？此操作不可恢复。`);
        if (!confirmed) return;

        // Get another profile to switch to
        const profiles = this.configManager.getAllProfiles().filter(p => p.id !== currentProfile.id);
        if (profiles.length === 0) {
            alert('无法删除最后一个配置');
            return;
        }

        const nextProfile = profiles[0];
        const deletedId = currentProfile.id;

        // Switch first, then delete
        this.configManager.setActiveProfile(nextProfile.id);

        const success = this.configManager.deleteProfile(deletedId);
        if (!success) {
            alert('删除配置失败');
            return;
        }

        // Refresh UI
        this.refreshProfileSelector(container, nextProfile.id);
        this.refreshSettingsUI(nextProfile, container);

        // Notify parent
        onProfileChanged(nextProfile);

        console.log('[ProfileManager] Deleted profile');
    }

    /**
     * Import profiles from JSON file
     */
    importProfile(container: HTMLElement): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const jsonData = event.target?.result as string;
                    const result = this.configManager.importProfiles(jsonData);

                    if (result.success) {
                        alert(`成功导入 ${result.imported} 个配置`);
                        this.refreshProfileSelector(container, this.configManager.getActiveProfileId());
                    } else {
                        alert(`导入失败:\n${result.errors.join('\n')}`);
                    }
                } catch (error) {
                    alert(`导入失败: ${error instanceof Error ? error.message : String(error)}`);
                }
            };
            reader.readAsText(file);
        };

        input.click();
    }

    /**
     * Export current profile to JSON file
     */
    exportCurrentProfile(currentProfile: ConfigProfile): void {
        const jsonData = this.configManager.exportProfile(currentProfile.id);
        if (!jsonData) {
            alert('导出失败');
            return;
        }

        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `claude-config-${currentProfile.name}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        console.log('[ProfileManager] Exported profile:', currentProfile.name);
    }

    /**
     * Refresh profile selector dropdown
     */
    refreshProfileSelector(container: HTMLElement, selectedId: string): void {
        const selector = container.querySelector("#profile-selector") as HTMLSelectElement;
        if (!selector) return;

        const profiles = this.configManager.getAllProfiles();
        selector.innerHTML = profiles.map(p => `
            <option value="${SettingsUIBuilder.escapeHtml(p.id)}" ${p.id === selectedId ? 'selected' : ''}>
                ${SettingsUIBuilder.escapeHtml(p.icon || '📋')} ${SettingsUIBuilder.escapeHtml(p.name)}${p.isDefault ? ' (默认)' : ''}
            </option>
        `).join('');
    }
}
