/**
 * Configuration Manager
 *
 * Manages multiple configuration profiles, including CRUD operations,
 * active profile switching, and import/export functionality.
 */

import type { ClaudeSettings } from "../claude";
import { DEFAULT_SETTINGS } from "../claude";
import type {
    ConfigProfile,
    ConfigManagerState,
    ConfigExport,
    PromptTemplate
} from "./config-types";
import { BUILTIN_TEMPLATES } from "./config-types";

const PROFILES_STORAGE_KEY = "claude-assistant-profiles";
const ACTIVE_PROFILE_KEY = "claude-assistant-active-profile";
const CONFIG_VERSION = "1.0.0";

/**
 * ConfigManager
 * Central manager for configuration profiles
 */
export class ConfigManager {
    private plugin: any = null; // Reference to SiYuan plugin instance
    private profiles: Map<string, ConfigProfile> = new Map();
    private activeProfileId: string = "";
    private promptTemplates: Map<string, PromptTemplate> = new Map();

    constructor(plugin?: any) {
        this.plugin = plugin;

        // Initialize built-in templates
        BUILTIN_TEMPLATES.forEach(template => {
            this.promptTemplates.set(template.id, template);
        });

        // Load custom templates from storage
        this.loadTemplates();

        // Load profiles from storage
        this.loadProfiles();
    }

    //#region Profile CRUD Operations

    /**
     * Create a new profile
     */
    createProfile(name: string, baseSettings?: ClaudeSettings, description?: string): ConfigProfile {
        const id = `profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const now = Date.now();

        const profile: ConfigProfile = {
            id,
            name,
            description: description || ``,
            icon: '📋',
            isDefault: false,
            createdAt: now,
            updatedAt: now,
            settings: baseSettings ? { ...baseSettings } : {
                apiKey: "",
                ...DEFAULT_SETTINGS
            }
        };

        this.profiles.set(id, profile);
        this.saveProfiles();

        console.log(`[ConfigManager] Created profile: ${name} (${id})`);
        return profile;
    }

    /**
     * Update an existing profile
     */
    updateProfile(id: string, updates: Partial<Omit<ConfigProfile, 'id' | 'createdAt'>>): boolean {
        const profile = this.profiles.get(id);
        if (!profile) {
            console.error(`[ConfigManager] Profile not found: ${id}`);
            return false;
        }

        const updatedProfile: ConfigProfile = {
            ...profile,
            ...updates,
            id: profile.id, // Preserve ID
            createdAt: profile.createdAt, // Preserve creation time
            updatedAt: Date.now()
        };

        this.profiles.set(id, updatedProfile);
        this.saveProfiles();

        console.log(`[ConfigManager] Updated profile: ${id}`);
        return true;
    }

    /**
     * Delete a profile
     */
    deleteProfile(id: string): boolean {
        const profile = this.profiles.get(id);
        if (!profile) {
            console.error(`[ConfigManager] Profile not found: ${id}`);
            return false;
        }

        // Cannot delete default profile
        if (profile.isDefault) {
            console.warn(`[ConfigManager] Cannot delete default profile: ${id}`);
            return false;
        }

        // Cannot delete active profile without switching
        if (this.activeProfileId === id) {
            console.warn(`[ConfigManager] Cannot delete active profile. Switch to another profile first.`);
            return false;
        }

        this.profiles.delete(id);
        this.saveProfiles();

        console.log(`[ConfigManager] Deleted profile: ${id}`);
        return true;
    }

    /**
     * Get a specific profile
     */
    getProfile(id: string): ConfigProfile | undefined {
        return this.profiles.get(id);
    }

    /**
     * Get all profiles
     */
    getAllProfiles(): ConfigProfile[] {
        return Array.from(this.profiles.values()).sort((a, b) => {
            // Default profile first
            if (a.isDefault) return -1;
            if (b.isDefault) return 1;
            // Then by creation time
            return b.createdAt - a.createdAt;
        });
    }

    /**
     * Duplicate a profile
     */
    duplicateProfile(id: string, newName?: string): ConfigProfile | null {
        const sourceProfile = this.profiles.get(id);
        if (!sourceProfile) {
            console.error(`[ConfigManager] Profile not found: ${id}`);
            return null;
        }

        const name = newName || `${sourceProfile.name} (复制)`;
        const duplicated = this.createProfile(
            name,
            sourceProfile.settings,
            sourceProfile.description
        );

        return duplicated;
    }

    //#endregion

    //#region Active Profile Management

    /**
     * Set the active profile
     */
    setActiveProfile(id: string): boolean {
        const profile = this.profiles.get(id);
        if (!profile) {
            console.error(`[ConfigManager] Profile not found: ${id}`);
            return false;
        }

        this.activeProfileId = id;
        this.saveActiveProfile();

        console.log(`[ConfigManager] Switched to profile: ${profile.name} (${id})`);
        return true;
    }

    /**
     * Get the currently active profile
     */
    getActiveProfile(): ConfigProfile {
        if (this.activeProfileId && this.profiles.has(this.activeProfileId)) {
            return this.profiles.get(this.activeProfileId)!;
        }

        // Fallback: find default or first profile
        const defaultProfile = Array.from(this.profiles.values()).find(p => p.isDefault);
        if (defaultProfile) {
            this.activeProfileId = defaultProfile.id;
            return defaultProfile;
        }

        // Last resort: create a default profile
        console.warn('[ConfigManager] No profiles found, creating default profile');
        const newDefault = this.createDefaultProfile();
        this.activeProfileId = newDefault.id;
        return newDefault;
    }

    /**
     * Get active profile ID
     */
    getActiveProfileId(): string {
        return this.activeProfileId;
    }

    //#endregion

    //#region Import/Export

    /**
     * Export a single profile to JSON
     */
    exportProfile(id: string): string | null {
        const profile = this.profiles.get(id);
        if (!profile) {
            console.error(`[ConfigManager] Profile not found: ${id}`);
            return null;
        }

        const exportData: ConfigExport = {
            version: CONFIG_VERSION,
            exportedAt: Date.now(),
            profiles: [profile],
            metadata: {
                exportedBy: 'Claude Assistant Plugin',
                notes: `Exported profile: ${profile.name}`
            }
        };

        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Export all profiles to JSON
     */
    exportAllProfiles(): string {
        const exportData: ConfigExport = {
            version: CONFIG_VERSION,
            exportedAt: Date.now(),
            profiles: this.getAllProfiles(),
            metadata: {
                exportedBy: 'Claude Assistant Plugin',
                notes: `Exported ${this.profiles.size} profile(s)`
            }
        };

        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Import profiles from JSON
     */
    importProfiles(jsonData: string): { success: boolean; imported: number; errors: string[] } {
        const result = {
            success: false,
            imported: 0,
            errors: [] as string[]
        };

        try {
            const parsed: ConfigExport = JSON.parse(jsonData);

            // Validate format
            if (!parsed.version || !parsed.profiles || !Array.isArray(parsed.profiles)) {
                result.errors.push('Invalid config format');
                return result;
            }

            // Import each profile
            for (const profileData of parsed.profiles) {
                try {
                    // Validate profile data
                    if (!profileData.name || !profileData.settings) {
                        result.errors.push(`Invalid profile data: ${profileData.name || 'unknown'}`);
                        continue;
                    }

                    // Generate new ID to avoid conflicts
                    const newId = `profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    const importedProfile: ConfigProfile = {
                        ...profileData,
                        id: newId,
                        isDefault: false, // Imported profiles are never default
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };

                    this.profiles.set(newId, importedProfile);
                    result.imported++;

                    console.log(`[ConfigManager] Imported profile: ${importedProfile.name}`);
                } catch (err) {
                    result.errors.push(`Failed to import profile: ${profileData.name || 'unknown'}`);
                    console.error('[ConfigManager] Import error:', err);
                }
            }

            if (result.imported > 0) {
                this.saveProfiles();
                result.success = true;
            }

        } catch (err) {
            result.errors.push(`JSON parse error: ${err instanceof Error ? err.message : String(err)}`);
            console.error('[ConfigManager] Import error:', err);
        }

        return result;
    }

    //#endregion

    //#region Storage

    /**
     * Load profiles from storage
     */
    private loadProfiles(): void {
        try {
            // Try to load from localStorage
            const stored = localStorage.getItem(PROFILES_STORAGE_KEY);
            const activeStored = localStorage.getItem(ACTIVE_PROFILE_KEY);

            if (stored) {
                const parsed: ConfigProfile[] = JSON.parse(stored);
                parsed.forEach(profile => {
                    this.profiles.set(profile.id, profile);
                });
                console.log(`[ConfigManager] Loaded ${this.profiles.size} profile(s) from localStorage`);
            }

            if (activeStored) {
                this.activeProfileId = activeStored;
            }

            // If no profiles exist, create default
            if (this.profiles.size === 0) {
                console.log('[ConfigManager] No profiles found, creating default');
                this.createDefaultProfile();
            }

            // Ensure we have an active profile
            this.getActiveProfile();

        } catch (error) {
            console.error('[ConfigManager] Failed to load profiles:', error);
            // Create default profile on error
            this.createDefaultProfile();
        }
    }

    /**
     * Save profiles to storage
     */
    private saveProfiles(): void {
        try {
            const profiles = Array.from(this.profiles.values());
            const serialized = JSON.stringify(profiles, null, 2);

            localStorage.setItem(PROFILES_STORAGE_KEY, serialized);

            // Also save via plugin API if available
            if (this.plugin && typeof this.plugin.saveData === 'function') {
                this.plugin.saveData('profiles.json', serialized).catch((error: Error) => {
                    console.error('[ConfigManager] Failed to save profiles to file:', error);
                });
            }

            console.log(`[ConfigManager] Saved ${this.profiles.size} profile(s)`);
        } catch (error) {
            console.error('[ConfigManager] Failed to save profiles:', error);
        }
    }

    /**
     * Save active profile ID
     */
    private saveActiveProfile(): void {
        try {
            localStorage.setItem(ACTIVE_PROFILE_KEY, this.activeProfileId);

            if (this.plugin && typeof this.plugin.saveData === 'function') {
                this.plugin.saveData('active-profile.json', JSON.stringify({
                    activeProfileId: this.activeProfileId,
                    timestamp: Date.now()
                })).catch((error: Error) => {
                    console.error('[ConfigManager] Failed to save active profile to file:', error);
                });
            }
        } catch (error) {
            console.error('[ConfigManager] Failed to save active profile:', error);
        }
    }

    //#endregion

    //#region Template Management

    /**
     * Get all prompt templates (built-in + custom)
     */
    getAllTemplates(): PromptTemplate[] {
        return Array.from(this.promptTemplates.values());
    }

    /**
     * Get built-in templates only
     */
    getBuiltInTemplates(): PromptTemplate[] {
        return Array.from(this.promptTemplates.values()).filter(t => t.isBuiltIn);
    }

    /**
     * Get custom templates only
     */
    getCustomTemplates(): PromptTemplate[] {
        return Array.from(this.promptTemplates.values()).filter(t => !t.isBuiltIn);
    }

    /**
     * Add or update a custom template
     */
    saveTemplate(template: PromptTemplate): void {
        this.promptTemplates.set(template.id, template);
        this.saveTemplates();
    }

    /**
     * Delete a custom template
     */
    deleteTemplate(id: string): boolean {
        const template = this.promptTemplates.get(id);
        if (!template || template.isBuiltIn) {
            return false; // Cannot delete built-in templates
        }
        const deleted = this.promptTemplates.delete(id);
        if (deleted) {
            this.saveTemplates();
        }
        return deleted;
    }

    /**
     * Save custom templates to storage
     */
    private saveTemplates(): void {
        try {
            const customTemplates = this.getCustomTemplates();
            const serialized = JSON.stringify(customTemplates, null, 2);

            localStorage.setItem('claude-assistant-custom-templates', serialized);

            // Also save via plugin API if available
            if (this.plugin && typeof this.plugin.saveData === 'function') {
                this.plugin.saveData('custom-templates.json', serialized).catch((error: Error) => {
                    console.error('[ConfigManager] Failed to save custom templates to file:', error);
                });
            }

            console.log(`[ConfigManager] Saved ${customTemplates.length} custom template(s)`);
        } catch (error) {
            console.error('[ConfigManager] Failed to save custom templates:', error);
        }
    }

    /**
     * Load custom templates from storage
     */
    private loadTemplates(): void {
        try {
            const stored = localStorage.getItem('claude-assistant-custom-templates');

            if (stored) {
                const customTemplates: PromptTemplate[] = JSON.parse(stored);
                customTemplates.forEach(template => {
                    if (!template.isBuiltIn) {
                        this.promptTemplates.set(template.id, template);
                    }
                });
                console.log(`[ConfigManager] Loaded ${customTemplates.length} custom template(s)`);
            }
        } catch (error) {
            console.error('[ConfigManager] Failed to load custom templates:', error);
        }
    }

    //#endregion

    //#region Utility Methods

    /**
     * Create the default profile
     */
    createDefaultProfile(): ConfigProfile {
        const id = 'profile-default';
        const now = Date.now();

        const profile: ConfigProfile = {
            id,
            name: '默认配置',
            description: '默认的插件配置',
            icon: '⚙️',
            isDefault: true,
            createdAt: now,
            updatedAt: now,
            settings: {
                apiKey: "",
                ...DEFAULT_SETTINGS
            }
        };

        this.profiles.set(id, profile);
        this.activeProfileId = id;
        this.saveProfiles();
        this.saveActiveProfile();

        console.log('[ConfigManager] Created default profile');
        return profile;
    }

    /**
     * Check if a profile name already exists
     */
    profileNameExists(name: string, excludeId?: string): boolean {
        return Array.from(this.profiles.values()).some(p =>
            p.name === name && p.id !== excludeId
        );
    }

    //#endregion
}
