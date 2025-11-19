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
import { Logger } from "@/utils/Logger";
import type { ISiYuanPlugin } from "@/types/siyuan";
import { getPresetEventBus, type PresetEventBus } from "./PresetEventBus";

const PROFILES_STORAGE_KEY = "claude-assistant-profiles";
const ACTIVE_PROFILE_KEY = "claude-assistant-active-profile";
const CONFIG_VERSION = "1.1.0"; // v1.1.0: Added preset-level filterRules support

/**
 * ConfigManager
 * Central manager for configuration profiles
 */
export class ConfigManager {
    private plugin: ISiYuanPlugin | null = null; // Reference to SiYuan plugin instance
    private profiles: Map<string, ConfigProfile> = new Map();
    private activeProfileId: string = "";
    private promptTemplates: Map<string, PromptTemplate> = new Map();
    private templatesLoadPromise: Promise<void> | null = null; // null = loaded, non-null = loading
    private logger = Logger.createScoped('ConfigManager');
    private eventBus: PresetEventBus = getPresetEventBus(); // Event bus for preset synchronization

    constructor(plugin?: ISiYuanPlugin) {
        this.plugin = plugin;

        // Initialize built-in templates
        BUILTIN_TEMPLATES.forEach(template => {
            this.promptTemplates.set(template.id, template);
        });

        // FIX Critical 1.2: Improved error handling for template loading
        // Store promise to allow waiting for completion
        this.templatesLoadPromise = this.loadTemplates().catch(error => {
            this.logger.error('CRITICAL: Failed to load templates in constructor:', error);
            // Show notification to user about the critical failure
            if (typeof window !== 'undefined' && window.siyuan && window.siyuan.showMessage) {
                window.siyuan.showMessage('Failed to load custom templates', 3000, 'error');
            }
            // Re-throw to allow caller to handle if they're waiting
            return Promise.reject(error);
        });

        // Load profiles from storage
        this.loadProfiles();

        this.logger.info('ConfigManager initialized');
    }

    /**
     * Wait for async initialization to complete (if needed)
     * FIX Critical 1.2: Added timeout protection with proper cleanup
     */
    async waitForInit(timeoutMs: number = 5000): Promise<void> {
        // If templates are already loaded (promise is null), return immediately
        if (!this.templatesLoadPromise) {
            return;
        }

        // Add timeout protection with proper cleanup
        let timeoutHandle: NodeJS.Timeout;
        const timeoutPromise = new Promise<void>((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error('Template loading timeout')), timeoutMs);
        });

        try {
            // Wait for loading to complete with timeout
            await Promise.race([this.templatesLoadPromise, timeoutPromise]);
        } catch (error) {
            this.logger.error('waitForInit failed:', error);
            // Force-complete the promise to prevent future waits from blocking
            this.templatesLoadPromise = null;
            throw error;
        } finally {
            // Always cleanup the timeout handle
            clearTimeout(timeoutHandle!);
        }
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
            customTemplates: this.getCustomTemplates(),
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
            customTemplates: this.getCustomTemplates(),
            metadata: {
                exportedBy: 'Claude Assistant Plugin',
                notes: `Exported ${this.profiles.size} profile(s) and ${this.getCustomTemplates().length} custom template(s)`
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

            // Version compatibility check
            const supportedVersions = ['1.0.0', '1.1.0'];
            if (!supportedVersions.includes(parsed.version)) {
                console.warn(`[ConfigManager] Config version ${parsed.version} may not be fully compatible. Supported: ${supportedVersions.join(', ')}`);
                // Continue anyway - attempt to import with best effort
            }

            // Import each profile
            for (const profileData of parsed.profiles) {
                try {
                    // Validate profile data
                    if (!profileData.name || !profileData.settings) {
                        result.errors.push(`Invalid profile data: ${profileData.name || 'unknown'}`);
                        continue;
                    }

                    // Validate ClaudeSettings structure
                    const settings = profileData.settings;
                    if (!settings.model || typeof settings.maxTokens !== 'number' || typeof settings.temperature !== 'number') {
                        result.errors.push(`Invalid settings in profile: ${profileData.name}`);
                        continue;
                    }

                    // Validate global filterRules if present
                    if (settings.filterRules && Array.isArray(settings.filterRules)) {
                        settings.filterRules = settings.filterRules.filter(rule => {
                            if (!rule.id || !rule.pattern || typeof rule.enabled !== 'boolean') {
                                console.warn(`[ConfigManager] Removing invalid filterRule in profile: ${profileData.name}`, rule);
                                return false;
                            }
                            return true;
                        });
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

            // Import custom templates (if present)
            if (parsed.customTemplates && Array.isArray(parsed.customTemplates)) {
                let templatesImported = 0;

                for (const templateData of parsed.customTemplates) {
                    try {
                        // Skip built-in templates (should never be in export, but safety check)
                        if (templateData.isBuiltIn) {
                            console.log(`[ConfigManager] Skipping built-in template: ${templateData.name}`);
                            continue;
                        }

                        // Validate template data
                        if (!templateData.id || !templateData.name || !templateData.systemPrompt) {
                            result.errors.push(`Invalid template data: ${templateData.name || 'unknown'}`);
                            continue;
                        }

                        // Validate filterRules if present
                        if (templateData.filterRules && Array.isArray(templateData.filterRules)) {
                            for (const rule of templateData.filterRules) {
                                if (!rule.id || !rule.pattern || typeof rule.enabled !== 'boolean') {
                                    result.errors.push(`Invalid filterRule in template: ${templateData.name}`);
                                    console.warn('[ConfigManager] Invalid filterRule:', rule);
                                    // Remove invalid filterRules
                                    templateData.filterRules = templateData.filterRules.filter(r => r.id && r.pattern && typeof r.enabled === 'boolean');
                                    break;
                                }
                            }
                        }

                        // Check for ID conflicts with existing custom templates
                        const existingTemplate = this.promptTemplates.get(templateData.id);
                        if (existingTemplate && !existingTemplate.isBuiltIn) {
                            // Regenerate ID for imported template to avoid conflict
                            const oldId = templateData.id;
                            templateData.id = `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                            console.log(`[ConfigManager] Template ID conflict, regenerated: ${oldId} → ${templateData.id}`);
                        }

                        // Save imported template (this will publish created/updated event via saveTemplate)
                        this.saveTemplate(templateData);
                        templatesImported++;

                        // Also publish 'imported' event for bulk import tracking
                        this.eventBus.publish({
                            type: 'imported',
                            presetId: templateData.id,
                            preset: templateData,
                            timestamp: Date.now(),
                            source: 'ConfigManager.importProfiles'
                        });

                        console.log(`[ConfigManager] Imported template: ${templateData.name}`);
                    } catch (err) {
                        result.errors.push(`Failed to import template: ${templateData.name || 'unknown'}`);
                        console.error('[ConfigManager] Template import error:', err);
                    }
                }

                if (templatesImported > 0) {
                    console.log(`[ConfigManager] Successfully imported ${templatesImported} custom template(s)`);
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
     * Get template by ID
     */
    getTemplateById(id: string): PromptTemplate | undefined {
        return this.promptTemplates.get(id);
    }

    /**
     * Get event bus instance for subscribing to preset events
     */
    getEventBus(): PresetEventBus {
        return this.eventBus;
    }

    /**
     * Add or update a custom template
     */
    saveTemplate(template: PromptTemplate): void {
        const isUpdate = this.promptTemplates.has(template.id);
        this.promptTemplates.set(template.id, template);
        this.saveTemplates();

        // Publish event for UI synchronization
        this.eventBus.publish({
            type: isUpdate ? 'updated' : 'created',
            presetId: template.id,
            preset: template,
            timestamp: Date.now(),
            source: 'ConfigManager.saveTemplate'
        });

        this.logger.debug(`Preset ${isUpdate ? 'updated' : 'created'}: ${template.name} (${template.id})`);
    }

    /**
     * Save multiple custom templates at once
     */
    saveCustomTemplates(templates: PromptTemplate[]): void {
        // Clear existing custom templates (keep built-ins)
        const builtInTemplates = this.getBuiltInTemplates();
        this.promptTemplates.clear();

        // Re-add built-in templates
        builtInTemplates.forEach(template => {
            this.promptTemplates.set(template.id, template);
        });

        // Add all provided custom templates
        templates.forEach(template => {
            if (!template.isBuiltIn) {
                this.promptTemplates.set(template.id, template);
            }
        });

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

            // Publish delete event for UI synchronization
            this.eventBus.publish({
                type: 'deleted',
                presetId: id,
                preset: template, // Include deleted template data
                timestamp: Date.now(),
                source: 'ConfigManager.deleteTemplate'
            });

            this.logger.debug(`Preset deleted: ${template.name} (${id})`);
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

            console.log(`[ConfigManager] Saving ${customTemplates.length} custom template(s)`,
                customTemplates.map(t => ({ id: t.id, name: t.name })));

            localStorage.setItem('claude-assistant-custom-templates', serialized);
            console.log('[ConfigManager] ✅ Saved to localStorage');

            // Also save via plugin API if available
            if (this.plugin && typeof this.plugin.saveData === 'function') {
                this.plugin.saveData('custom-templates.json', serialized)
                    .then(() => {
                        console.log('[ConfigManager] ✅ Saved to file system');
                    })
                    .catch((error: Error) => {
                        console.error('[ConfigManager] ❌ Failed to save custom templates to file:', error);
                    });
            } else {
                console.warn('[ConfigManager] ⚠️ Plugin saveData not available, only saved to localStorage');
            }

            console.log(`[ConfigManager] ✅ Saved ${customTemplates.length} custom template(s) total`);
        } catch (error) {
            console.error('[ConfigManager] ❌ Failed to save custom templates:', error);
            throw error; // Re-throw to alert caller
        }
    }

    /**
     * Load custom templates from storage (async)
     */
    private async loadTemplates(): Promise<void> {
        // If already loading, wait for it to complete
        if (this.templatesLoadPromise) {
            console.log('[ConfigManager] Templates loading in progress, waiting...');
            await this.templatesLoadPromise;
            return;
        }

        // Start loading (promise will be null when complete)
        this.templatesLoadPromise = this._loadTemplatesImpl();
        try {
            await this.templatesLoadPromise;
        } finally {
            // Mark as complete by nulling the promise
            this.templatesLoadPromise = null;
        }
    }

    private async _loadTemplatesImpl(): Promise<void> {
        try {
            console.log('[ConfigManager] Loading custom templates...');

            // Try localStorage first
            let stored = localStorage.getItem('claude-assistant-custom-templates');

            // If not in localStorage, try loading from file system
            if (!stored && this.plugin && typeof this.plugin.loadData === 'function') {
                console.log('[ConfigManager] localStorage empty, trying file system...');
                try {
                    const fileData = await this.plugin.loadData('custom-templates.json');
                    if (fileData) {
                        console.log(`[ConfigManager] Found templates in file system, type: ${typeof fileData}`);

                        // Check if fileData is already an object or a string
                        if (typeof fileData === 'string') {
                            stored = fileData;
                        } else if (typeof fileData === 'object') {
                            // Already parsed, convert back to string for consistency
                            stored = JSON.stringify(fileData);
                            console.log('[ConfigManager] fileData was already an object, converted to string');
                        }

                        // Cache to localStorage for faster access next time
                        if (stored) {
                            localStorage.setItem('claude-assistant-custom-templates', stored);
                            console.log('[ConfigManager] ✅ Cached to localStorage');
                        }
                    }
                } catch (fileError) {
                    console.log('[ConfigManager] No templates file found, starting fresh');
                }
            }

            if (stored) {
                console.log(`[ConfigManager] Found stored templates (${stored.length} chars)`);
                const customTemplates: PromptTemplate[] = JSON.parse(stored);
                console.log(`[ConfigManager] Parsed ${customTemplates.length} template(s)`,
                    customTemplates.map(t => ({ id: t.id, name: t.name, hasEditInstruction: !!t.editInstruction })));

                let loadedCount = 0;
                customTemplates.forEach(template => {
                    if (!template.isBuiltIn) {
                        this.promptTemplates.set(template.id, template);
                        loadedCount++;
                    } else {
                        console.warn(`[ConfigManager] Skipping built-in template: ${template.id}`);
                    }
                });
                console.log(`[ConfigManager] ✅ Loaded ${loadedCount} custom template(s) into Map`);
                console.log(`[ConfigManager] Total templates in Map: ${this.promptTemplates.size}`);
            } else {
                console.log('[ConfigManager] No stored templates found');
            }

            // Run migration for v1.1.0: Add filterRules field to existing templates
            this.migrateToV1_1_0();
        } catch (error) {
            console.error('[ConfigManager] ❌ Failed to load custom templates:', error);
            throw error;
        }
    }

    /**
     * Migration for v1.1.0: Add filterRules field to existing presets
     * Ensures backward compatibility with older config versions
     */
    private migrateToV1_1_0(): void {
        try {
            let migrationCount = 0;

            // Iterate through all templates and add filterRules if missing
            this.promptTemplates.forEach((template, id) => {
                // Skip built-in templates (they don't need migration)
                if (template.isBuiltIn) {
                    return;
                }

                // Add filterRules if it doesn't exist
                if (!template.filterRules) {
                    template.filterRules = [];
                    this.promptTemplates.set(id, template);
                    migrationCount++;
                }
            });

            // Save migrated templates to storage if any were updated
            if (migrationCount > 0) {
                this.saveTemplates();
                console.log(`[ConfigManager] ✅ Migrated ${migrationCount} template(s) to v1.1.0 (added filterRules)`);
            } else {
                console.log('[ConfigManager] No templates needed migration to v1.1.0');
            }
        } catch (error) {
            console.error('[ConfigManager] ❌ Migration to v1.1.0 failed:', error);
            // Don't throw - migration failure shouldn't block template loading
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
