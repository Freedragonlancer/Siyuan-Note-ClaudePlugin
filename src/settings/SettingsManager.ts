import type { ClaudeSettings } from "../claude";
import { DEFAULT_SETTINGS } from "../claude";
import type { ISiYuanPlugin } from "@/types/siyuan";

const STORAGE_KEY = "claude-assistant-settings";
const STORAGE_FILE = "settings.json";

/**
 * Manages plugin settings storage and retrieval
 */
export class SettingsManager {
    private settings: ClaudeSettings;
    private plugin: ISiYuanPlugin | null = null; // Reference to SiYuan plugin instance
    private onSettingsLoadedCallback?: (settings: ClaudeSettings) => void;
    private loadPromise: Promise<void>;

    constructor(plugin?: ISiYuanPlugin, onLoaded?: (settings: ClaudeSettings) => void) {
        this.plugin = plugin;
        this.onSettingsLoadedCallback = onLoaded;
        // Load synchronously from cache first
        this.settings = this.loadSettings();

        // Then try to load from file asynchronously
        if (plugin) {
            this.loadPromise = this.loadFromFileAsync().catch(error => {
                console.error("[SettingsManager] Async file load failed:", error);
            });
        } else {
            // No plugin, resolve immediately
            this.loadPromise = Promise.resolve();
        }
    }

    /**
     * Wait for async settings load to complete
     * @returns Promise that resolves when settings are fully loaded from file
     */
    async waitForLoad(): Promise<void> {
        return this.loadPromise;
    }

    /**
     * Async method to load from file system and update settings
     */
    private async loadFromFileAsync(): Promise<void> {
        if (!this.plugin || typeof this.plugin.loadData !== 'function') {
            return;
        }

        try {
            console.log("[SettingsManager] Attempting to load from file:", STORAGE_FILE);
            const fileData = await this.plugin.loadData(STORAGE_FILE);
            
            if (fileData) {
                console.log("[SettingsManager] ✅ Found settings in file system");
                console.log("[SettingsManager] File data type:", typeof fileData);
                
                // Check if fileData is already an object or a string
                let parsed: any;
                if (typeof fileData === 'string') {
                    console.log("[SettingsManager] Parsing JSON string");
                    parsed = JSON.parse(fileData);
                } else if (typeof fileData === 'object') {
                    console.log("[SettingsManager] Data already parsed as object");
                    parsed = fileData;
                } else {
                    console.warn("[SettingsManager] Unexpected data type:", typeof fileData);
                    return;
                }
                
                // Update current settings with deep merge for providers
                this.settings = {
                    ...DEFAULT_SETTINGS,
                    ...parsed,
                    providers: {
                        ...DEFAULT_SETTINGS.providers,
                        ...parsed.providers,
                    },
                };
                
                // DEBUG: Verify deep merge worked
                console.log('[SettingsManager] DEBUG - After deep merge, providers keys:', Object.keys(this.settings.providers));
                console.log('[SettingsManager] DEBUG - moonshot config exists:', !!this.settings.providers.moonshot);
                if (this.settings.providers.moonshot) {
                    console.log('[SettingsManager] DEBUG - moonshot apiKey exists:', !!this.settings.providers.moonshot.apiKey);
                    console.log('[SettingsManager] DEBUG - moonshot model:', this.settings.providers.moonshot.model);
                }
                
                // Save to memory caches (deep merged settings, not raw parsed)
                const serialized = JSON.stringify(this.settings);
                localStorage.setItem(STORAGE_KEY, serialized);
                sessionStorage.setItem(STORAGE_KEY, serialized);
                if (typeof window !== 'undefined') {
                    (window as any).__CLAUDE_SETTINGS__ = this.settings;
                }
                
                console.log("[SettingsManager] ✅ Settings loaded from file and cached");
                
                // Notify callback that settings have been loaded
                if (this.onSettingsLoadedCallback) {
                    console.log("[SettingsManager] 🔔 Notifying callback of loaded settings");
                    this.onSettingsLoadedCallback(this.settings);
                }
            } else {
                console.log("[SettingsManager] No data found in file");
            }
        } catch (error) {
            console.error("[SettingsManager] Failed to load from file system:", error);
        }
    }

    /**
     * Synchronous loading from memory caches
     */
    private loadSettings(): ClaudeSettings {
        console.log("[SettingsManager] Loading settings from cache...");
    
        
        // Try global variable
        try {
            if (typeof window !== 'undefined' && (window as any).__CLAUDE_SETTINGS__) {
                console.log("[SettingsManager] Found in window.__CLAUDE_SETTINGS__");
                const cached = (window as any).__CLAUDE_SETTINGS__;
                return {
                    ...DEFAULT_SETTINGS,
                    ...cached,
                    providers: {
                        ...DEFAULT_SETTINGS.providers,
                        ...cached.providers,
                    },
                };
            }
        } catch (error) {
            console.error("[SettingsManager] Failed to load from global variable:", error);
        }
        
        // Try sessionStorage
        try {
            const sessionStored = sessionStorage.getItem(STORAGE_KEY);
            if (sessionStored) {
                console.log("[SettingsManager] Found in sessionStorage");
                const parsed = JSON.parse(sessionStored);
                return {
                    ...DEFAULT_SETTINGS,
                    ...parsed,
                    providers: {
                        ...DEFAULT_SETTINGS.providers,
                        ...parsed.providers,
                    },
                };
            }
        } catch (error) {
            console.error("[SettingsManager] Failed to load from sessionStorage:", error);
        }

        // Try localStorage
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            console.log("[SettingsManager] Checking localStorage:", STORAGE_KEY);
            
            if (stored) {
                console.log("[SettingsManager] Found in localStorage");
                const parsed = JSON.parse(stored);
                
                const merged = {
                    ...DEFAULT_SETTINGS,
                    ...parsed,
                    providers: {
                        ...DEFAULT_SETTINGS.providers,
                        ...parsed.providers,
                    },
                };
                
                // DEBUG: Log localStorage deep merge result
                console.log('[SettingsManager] DEBUG (localStorage) - Parsed providers keys:', parsed.providers ? Object.keys(parsed.providers) : 'no providers');
                console.log('[SettingsManager] DEBUG (localStorage) - After deep merge, providers keys:', Object.keys(merged.providers));
                console.log('[SettingsManager] DEBUG (localStorage) - moonshot exists:', !!merged.providers.moonshot);
                
                return merged;
            } else {
                console.log("[SettingsManager] localStorage is empty");
            }
        } catch (error) {
            console.error("[SettingsManager] Failed to load from localStorage:", error);
        }

        console.log("[SettingsManager] No stored settings found, using defaults");
        return {
            apiKey: "",
            ...DEFAULT_SETTINGS,
        };
    }

    async saveSettings(settings: Partial<ClaudeSettings>) {
        console.log("[SettingsManager] Saving settings:", settings);

        // FIX Critical 1.5: Save old settings for rollback in case of failure
        const oldSettings = { ...this.settings };
        const newSettings = { ...this.settings, ...settings };
        console.log("[SettingsManager] Merged settings:", newSettings);

        try {
            const serialized = JSON.stringify(newSettings, null, 2);
            console.log("[SettingsManager] Serialized settings (length:", serialized.length, ")");

            // FIX Critical 1.5: Save to all storages BEFORE updating in-memory state
            // This ensures atomicity - either all succeed or none succeed

            // Save to memory storages
            localStorage.setItem(STORAGE_KEY, serialized);
            sessionStorage.setItem(STORAGE_KEY, serialized);

            // Save to file system using SiYuan plugin API (most likely to fail)
            if (this.plugin && typeof this.plugin.saveData === 'function') {
                console.log("[SettingsManager] Saving to plugin data file:", STORAGE_FILE);
                await this.plugin.saveData(STORAGE_FILE, serialized);
                console.log("[SettingsManager] ✅ Settings saved to file system");
            } else {
                console.warn("[SettingsManager] ⚠️ Plugin instance not available, file save skipped");
            }

            // FIX Critical 1.5: Only update in-memory settings after all saves succeed
            this.settings = newSettings;

            // Save to global variable (safe to do after memory update)
            if (typeof window !== 'undefined') {
                (window as any).__CLAUDE_SETTINGS__ = this.settings;
            }

            console.log("[SettingsManager] ✅ Settings saved successfully");

        } catch (error) {
            // FIX Critical 1.5: Rollback localStorage/sessionStorage on failure
            console.error("[SettingsManager] ❌ Failed to save settings, rolling back:", error);
            try {
                const oldSerialized = JSON.stringify(oldSettings, null, 2);
                localStorage.setItem(STORAGE_KEY, oldSerialized);
                sessionStorage.setItem(STORAGE_KEY, oldSerialized);
                console.log("[SettingsManager] ✅ Rolled back to previous settings");
            } catch (rollbackError) {
                console.error("[SettingsManager] ❌ Failed to rollback settings:", rollbackError);
            }
            throw error;
        }
    }

    getSettings(): ClaudeSettings {
        return { ...this.settings };
    }

    clearSettings() {
        this.settings = {
            apiKey: "",
            ...DEFAULT_SETTINGS,
        };
        localStorage.removeItem(STORAGE_KEY);
    }
}
