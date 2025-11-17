import type { ISiYuanPlugin } from '@/types/siyuan';
import type { PromptTemplate } from './config-types';
import type { IConfigManager } from '../claude/types';
import { Logger } from '@/utils/Logger';
import { getPresetEventBus, type PresetEvent } from './PresetEventBus';

/**
 * Storage keys for preset selection
 */
const STORAGE_KEYS = {
    LAST_PRESET: 'lastSelectedPresetId',
    FILE_KEY: 'lastPresetFile'
} as const;

/**
 * PresetSelectionManager - Unified preset selection state management
 *
 * Purpose:
 * - Centralize preset selection logic (previously scattered across components)
 * - Ensure consistent persistence (localStorage + file storage)
 * - Automatic event publishing for UI synchronization
 * - Validation to prevent selecting non-existent presets
 *
 * Features:
 * - Dual-layer persistence (fast localStorage + reliable file storage)
 * - Automatic event bus integration
 * - Preset existence validation
 * - Async initialization with timeout protection
 *
 * Usage:
 * ```typescript
 * const manager = new PresetSelectionManager(plugin, configManager);
 * await manager.init();
 *
 * // Get current preset
 * const currentId = await manager.getCurrentPresetId();
 *
 * // Set preset (validates + persists + publishes event)
 * await manager.setCurrentPreset('my-preset-id');
 *
 * // Subscribe to selection changes
 * manager.onSelectionChange((presetId) => {
 *     console.log('Selection changed to:', presetId);
 * });
 * ```
 */
export class PresetSelectionManager {
    private plugin: ISiYuanPlugin | null;
    private configManager: IConfigManager | null;
    private logger = Logger.createScoped('PresetSelection');
    private eventBus = getPresetEventBus();
    private currentPresetId: string | null = null;
    private initialized = false;
    private initPromise: Promise<void> | null = null;

    constructor(plugin?: ISiYuanPlugin, configManager?: IConfigManager) {
        this.plugin = plugin ?? null;
        this.configManager = configManager ?? null;
    }

    /**
     * Initialize manager (load persisted selection)
     *
     * @param timeoutMs - Timeout for file loading (default: 3000ms)
     */
    public async init(timeoutMs: number = 3000): Promise<void> {
        if (this.initialized) {
            return;
        }

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this._init(timeoutMs);
        return this.initPromise;
    }

    private async _init(timeoutMs: number): Promise<void> {
        this.logger.debug('Initializing PresetSelectionManager');

        try {
            // Try loading from file storage first (most reliable)
            const filePresetId = await this._loadFromFile(timeoutMs);

            // Fallback to localStorage
            const localStoragePresetId = this._loadFromLocalStorage();

            // Use file storage if available, otherwise localStorage
            this.currentPresetId = filePresetId ?? localStoragePresetId;

            this.logger.debug(`Initialized with preset: ${this.currentPresetId ?? 'none'}`);

            // Sync localStorage with file storage value (file storage takes precedence)
            if (filePresetId && filePresetId !== localStoragePresetId) {
                this._saveToLocalStorage(filePresetId);
                this.logger.debug(`Synced localStorage: ${localStoragePresetId} → ${filePresetId}`);
            }

            this.initialized = true;

        } catch (error) {
            this.logger.warn('Failed to initialize, using localStorage fallback:', error);
            this.currentPresetId = this._loadFromLocalStorage();
            this.initialized = true;
        }
    }

    /**
     * Get current preset ID
     *
     * @param waitForInit - Wait for initialization if not ready (default: true)
     * @returns Current preset ID or null
     */
    public async getCurrentPresetId(waitForInit: boolean = true): Promise<string | null> {
        if (waitForInit && !this.initialized) {
            await this.init();
        }
        return this.currentPresetId;
    }

    /**
     * Set current preset (with validation and persistence)
     *
     * @param presetId - Preset ID to set
     * @param validate - Validate preset exists (default: true)
     * @returns Success boolean
     */
    public async setCurrentPreset(presetId: string | null, validate: boolean = true): Promise<boolean> {
        // Ensure initialized
        if (!this.initialized) {
            await this.init();
        }

        // Validate preset exists (if configManager available)
        if (validate && presetId && this.configManager) {
            const preset = this.configManager.getTemplateById(presetId);
            if (!preset) {
                this.logger.warn(`Cannot select non-existent preset: ${presetId}`);
                return false;
            }
        }

        const previousPresetId = this.currentPresetId;
        this.currentPresetId = presetId;

        // Persist to both storages
        this._saveToLocalStorage(presetId);
        await this._saveToFile(presetId);

        this.logger.debug(`Preset selection changed: ${previousPresetId} → ${presetId}`);

        // Publish selection event
        if (presetId) {
            const preset = this.configManager?.getTemplateById(presetId);
            this.eventBus.publish({
                type: 'selected',
                presetId: presetId,
                preset: preset,
                timestamp: Date.now(),
                source: 'PresetSelectionManager'
            });
        }

        return true;
    }

    /**
     * Subscribe to selection changes
     *
     * @param callback - Callback function receiving new preset ID
     * @returns Unsubscribe function
     */
    public onSelectionChange(callback: (presetId: string | null, preset?: PromptTemplate) => void): () => void {
        return this.eventBus.subscribe('selected', (event: PresetEvent) => {
            callback(event.presetId, event.preset);
        });
    }

    /**
     * Clear current selection
     */
    public async clearSelection(): Promise<void> {
        await this.setCurrentPreset(null, false);
    }

    /**
     * Notify current preset selection (publish event without saving)
     *
     * Use this when:
     * - Component loads preset from storage and wants to synchronize UI
     * - You want to broadcast current state without persistence
     *
     * This method publishes a 'selected' PresetEvent without modifying storage.
     * Useful for synchronizing UI state after initialization.
     */
    public notifyCurrentPreset(): void {
        if (!this.currentPresetId) {
            this.logger.debug('No preset to notify (currentPresetId is null)');
            return;
        }

        const preset = this.configManager?.getTemplateById(this.currentPresetId);
        this.eventBus.publish({
            type: 'selected',
            presetId: this.currentPresetId,
            preset: preset,
            timestamp: Date.now(),
            source: 'PresetSelectionManager.notifyCurrentPreset'
        });

        this.logger.debug(`Notified current preset: ${this.currentPresetId}`);
    }

    // ============ Private Methods ============

    /**
     * Load from localStorage (fast, synchronous)
     */
    private _loadFromLocalStorage(): string | null {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.LAST_PRESET);
            if (stored) {
                this.logger.debug(`Loaded from localStorage: ${stored}`);
                return stored;
            }
        } catch (error) {
            this.logger.warn('Failed to load from localStorage:', error);
        }
        return null;
    }

    /**
     * Save to localStorage (fast, synchronous)
     */
    private _saveToLocalStorage(presetId: string | null): void {
        try {
            if (presetId) {
                localStorage.setItem(STORAGE_KEYS.LAST_PRESET, presetId);
            } else {
                localStorage.removeItem(STORAGE_KEYS.LAST_PRESET);
            }
        } catch (error) {
            this.logger.warn('Failed to save to localStorage:', error);
        }
    }

    /**
     * Load from file storage (reliable, async)
     */
    private async _loadFromFile(timeoutMs: number): Promise<string | null> {
        if (!this.plugin) {
            this.logger.debug('No plugin instance, skipping file storage load');
            return null;
        }

        try {
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('File load timeout')), timeoutMs);
            });

            const loadPromise = this.plugin.loadData(STORAGE_KEYS.FILE_KEY) as Promise<string | null>;

            const stored = await Promise.race([loadPromise, timeoutPromise]);

            if (stored && typeof stored === 'string') {
                this.logger.debug(`Loaded from file: ${stored}`);
                return stored;
            }
        } catch (error) {
            if (error instanceof Error && error.message === 'File load timeout') {
                this.logger.warn('File load timed out, using localStorage');
            } else {
                this.logger.warn('Failed to load from file:', error);
            }
        }
        return null;
    }

    /**
     * Save to file storage (reliable, async)
     */
    private async _saveToFile(presetId: string | null): Promise<void> {
        if (!this.plugin) {
            return;
        }

        try {
            if (presetId) {
                await this.plugin.saveData(STORAGE_KEYS.FILE_KEY, presetId);
            }
        } catch (error) {
            this.logger.warn('Failed to save to file:', error);
        }
    }

    /**
     * Reset manager state (useful for testing)
     */
    public reset(): void {
        this.currentPresetId = null;
        this.initialized = false;
        this.initPromise = null;
        this._saveToLocalStorage(null);
    }

    /**
     * Get initialization status
     */
    public isInitialized(): boolean {
        return this.initialized;
    }
}
