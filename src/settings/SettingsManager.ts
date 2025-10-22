import type { ClaudeSettings } from "../claude";
import { DEFAULT_SETTINGS } from "../claude";

const STORAGE_KEY = "claude-assistant-settings";
const STORAGE_FILE = "settings.json";

/**
 * Manages plugin settings storage and retrieval
 */
export class SettingsManager {
    private settings: ClaudeSettings;
    private plugin: any = null; // Reference to SiYuan plugin instance
    private onSettingsLoadedCallback?: (settings: ClaudeSettings) => void;

    constructor(plugin?: any, onLoaded?: (settings: ClaudeSettings) => void) {
        this.plugin = plugin;
        this.onSettingsLoadedCallback = onLoaded;
        // Load synchronously from cache first
        this.settings = this.loadSettings();
        
        // Then try to load from file asynchronously
        if (plugin) {
            this.loadFromFileAsync().catch(error => {
                console.error("[SettingsManager] Async file load failed:", error);
            });
        }
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
                
                // Update current settings
                this.settings = {
                    ...DEFAULT_SETTINGS,
                    ...parsed,
                };
                
                // Save to memory caches
                const serialized = JSON.stringify(parsed);
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
                return {
                    ...DEFAULT_SETTINGS,
                    ...(window as any).__CLAUDE_SETTINGS__,
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
                return {
                    ...DEFAULT_SETTINGS,
                    ...parsed,
                };
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
        this.settings = { ...this.settings, ...settings };
        console.log("[SettingsManager] Merged settings:", this.settings);

        try {
            const serialized = JSON.stringify(this.settings, null, 2);
            console.log("[SettingsManager] Serialized settings (length:", serialized.length, ")");
            
            // Save to memory storages
            localStorage.setItem(STORAGE_KEY, serialized);
            sessionStorage.setItem(STORAGE_KEY, serialized);
            
            // Save to global variable
            if (typeof window !== 'undefined') {
                (window as any).__CLAUDE_SETTINGS__ = this.settings;
            }
            
            // Save to file system using SiYuan plugin API
            if (this.plugin && typeof this.plugin.saveData === 'function') {
                console.log("[SettingsManager] Saving to plugin data file:", STORAGE_FILE);
                await this.plugin.saveData(STORAGE_FILE, serialized);
                console.log("[SettingsManager] ✅ Settings saved to file system");
            } else {
                console.warn("[SettingsManager] ⚠️ Plugin instance not available, file save skipped");
            }
            
            console.log("[SettingsManager] ✅ Settings saved successfully");
            
        } catch (error) {
            console.error("[SettingsManager] Failed to save settings:", error);
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
