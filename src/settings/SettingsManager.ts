import type { ClaudeSettings } from "../claude";
import { DEFAULT_SETTINGS } from "../claude";
import type { ISiYuanPlugin } from "@/types/siyuan";
import { Logger } from "../utils/Logger";

const STORAGE_KEY = "claude-assistant-settings";
const STORAGE_FILE = "settings.json";

const logger = Logger.createScoped('SettingsManager');

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
                logger.error('Async file load failed', error);
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
            const fileData = await this.plugin.loadData(STORAGE_FILE);

            if (fileData) {
                // Check if fileData is already an object or a string
                let parsed: any;
                if (typeof fileData === 'string') {
                    parsed = JSON.parse(fileData);
                } else if (typeof fileData === 'object') {
                    parsed = fileData;
                } else {
                    logger.warn('Unexpected data type from file', typeof fileData);
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

                // Notify callback that settings have been loaded
                if (this.onSettingsLoadedCallback) {
                    this.onSettingsLoadedCallback(this.settings);
                }
            }
        } catch (error) {
            logger.error('Failed to load from file system', error);
        }
    }

    /**
     * Synchronous loading from memory caches
     */
    private loadSettings(): ClaudeSettings {
        // Try global variable
        try {
            if (typeof window !== 'undefined' && (window as any).__CLAUDE_SETTINGS__) {
                return {
                    ...DEFAULT_SETTINGS,
                    ...(window as any).__CLAUDE_SETTINGS__,
                };
            }
        } catch (error) {
            // Silent fallback to next storage
        }

        // Try sessionStorage
        try {
            const sessionStored = sessionStorage.getItem(STORAGE_KEY);
            if (sessionStored) {
                const parsed = JSON.parse(sessionStored);
                return {
                    ...DEFAULT_SETTINGS,
                    ...parsed,
                };
            }
        } catch (error) {
            // Silent fallback to next storage
        }

        // Try localStorage
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                return {
                    ...DEFAULT_SETTINGS,
                    ...parsed,
                };
            }
        } catch (error) {
            // Silent fallback to defaults
        }

        logger.info('No stored settings found, using defaults');
        return {
            apiKey: "",
            ...DEFAULT_SETTINGS,
        };
    }

    async saveSettings(settings: Partial<ClaudeSettings>) {
        // FIX Critical 1.5: Save old settings for rollback in case of failure
        const oldSettings = { ...this.settings };
        const newSettings = { ...this.settings, ...settings };

        try {
            const serialized = JSON.stringify(newSettings, null, 2);

            // FIX Critical 1.5: Save to all storages BEFORE updating in-memory state
            // This ensures atomicity - either all succeed or none succeed

            // Save to memory storages
            localStorage.setItem(STORAGE_KEY, serialized);
            sessionStorage.setItem(STORAGE_KEY, serialized);

            // Save to file system using SiYuan plugin API (most likely to fail)
            if (this.plugin && typeof this.plugin.saveData === 'function') {
                await this.plugin.saveData(STORAGE_FILE, serialized);
                logger.info('Settings saved to file system');
            } else {
                logger.warn('Plugin instance not available, file save skipped');
            }

            // FIX Critical 1.5: Only update in-memory settings after all saves succeed
            this.settings = newSettings;

            // Save to global variable (safe to do after memory update)
            if (typeof window !== 'undefined') {
                (window as any).__CLAUDE_SETTINGS__ = this.settings;
            }

        } catch (error) {
            // FIX Critical 1.5: Rollback localStorage/sessionStorage on failure
            logger.error('Failed to save settings, rolling back', error);
            try {
                const oldSerialized = JSON.stringify(oldSettings, null, 2);
                localStorage.setItem(STORAGE_KEY, oldSerialized);
                sessionStorage.setItem(STORAGE_KEY, oldSerialized);
                logger.info('Rolled back to previous settings');
            } catch (rollbackError) {
                logger.error('Failed to rollback settings', rollbackError);
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
