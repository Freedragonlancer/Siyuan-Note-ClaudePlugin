/**
 * Preset Manager - Preset selection and synchronization for UnifiedAIPanel
 *
 * Handles preset selector population, event subscription, and persistence.
 * Extracted as part of architectural refactoring (Task 2.1 Phase 6).
 *
 * @module PresetManager
 * @see UnifiedAIPanel
 */

import type { ClaudeClient } from "../../claude/ClaudeClient";
import type { PresetEvent } from "../../settings/PresetEventBus";

export interface PresetManagerContext {
    element: HTMLElement;
    claudeClient: ClaudeClient;
    activeChatPresetId: string;
    onPresetChange: (presetId: string) => void;
}

/**
 * Utility class for managing preset selection and synchronization
 */
export class PresetManager {
    private static readonly MAX_POPULATE_RETRIES = 5;

    /**
     * Populate preset selector dropdown with available presets
     * Includes retry logic for initialization timing issues
     */
    static populatePresetSelector(
        context: PresetManagerContext,
        retryCount: number = 0
    ): void {
        const selector = context.element.querySelector('#claude-preset-selector') as HTMLSelectElement;
        if (!selector) return;

        // Get config manager from claude client
        const configManager = (context.claudeClient as any).configManager;
        if (!configManager || !configManager.getAllTemplates) {
            // Retry if ConfigManager not ready yet (initialization timing issue)
            if (retryCount < this.MAX_POPULATE_RETRIES) {
                console.warn(`[PresetManager] ConfigManager not ready, retrying (${retryCount + 1}/${this.MAX_POPULATE_RETRIES})...`);
                setTimeout(() => this.populatePresetSelector(context, retryCount + 1), 100);
                return;
            }
            console.warn('[PresetManager] ConfigManager not available after retries, using default preset only');
            return;
        }

        // Get all templates
        const templates = configManager.getAllTemplates();
        if (!templates || templates.length === 0) {
            // Retry if templates not loaded yet
            if (retryCount < this.MAX_POPULATE_RETRIES) {
                console.warn(`[PresetManager] No presets found, retrying (${retryCount + 1}/${this.MAX_POPULATE_RETRIES})...`);
                setTimeout(() => this.populatePresetSelector(context, retryCount + 1), 100);
                return;
            }
            console.warn('[PresetManager] No presets found after retries');
            return;
        }

        // Clear existing options
        selector.innerHTML = '';

        // Add templates as options
        templates.forEach((template: any) => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = `${template.icon || '📝'} ${template.name}`;
            selector.appendChild(option);
        });

        // Set current selection
        selector.value = context.activeChatPresetId;
        console.log('[PresetManager] Preset selector populated, active preset:', context.activeChatPresetId);
    }

    /**
     * Subscribe to preset events for automatic UI synchronization
     * Eliminates manual refresh requirements
     * 
     * @returns Unsubscribe function
     */
    static subscribeToPresetEvents(context: PresetManagerContext): (() => void) | null {
        const configManager = (context.claudeClient as any).configManager;
        if (!configManager || !configManager.getEventBus) {
            console.warn('[PresetManager] ConfigManager or event bus not available');
            return null;
        }

        const eventBus = configManager.getEventBus();

        // Subscribe to all preset change events
        const unsubscribe = eventBus.subscribeAll(async (event: PresetEvent) => {
            console.log(`[PresetManager] Preset event received: ${event.type} (${event.presetId})`);

            // Auto-refresh preset selector when any change occurs
            switch (event.type) {
                case 'created':
                case 'updated':
                case 'deleted':
                case 'imported':
                    this.populatePresetSelector(context);
                    console.log(`[PresetManager] Auto-refreshed preset selector after ${event.type} event`);
                    break;
                case 'selected':
                    // Update preset selection and sync UI
                    if (event.presetId) {
                        context.onPresetChange(event.presetId);

                        // Update dropdown UI to match
                        const selector = context.element.querySelector('#claude-preset-selector') as HTMLSelectElement;
                        if (selector) {
                            selector.value = event.presetId;
                        }

                        // Persist to localStorage and file storage
                        await this.savePresetSelection(context.claudeClient, event.presetId)
                            .catch(err => console.error('[PresetManager] Preset save failed:', err));

                        console.log(`[PresetManager] Preset selection changed to: ${event.presetId}`);
                    }
                    break;
            }
        });

        console.log('[PresetManager] Subscribed to preset events for automatic UI sync');
        return unsubscribe;
    }

    /**
     * Save preset selection to localStorage and file storage
     */
    static async savePresetSelection(claudeClient: ClaudeClient, presetId: string): Promise<void> {
        try {
            // Save to localStorage (fast, synchronous)
            localStorage.setItem('claude-ai-dock-preset-id', presetId);

            // Save to file storage (reliable, async)
            const plugin = claudeClient.plugin;

            if (plugin && typeof plugin.saveData === 'function') {
                try {
                    await plugin.saveData('ai-dock-preset.json', { presetId });
                    console.log(`[PresetManager] ✅ Saved preset to file storage: ${presetId}`);
                } catch (err) {
                    console.warn('[PresetManager] ❌ Failed to save preset to file storage:', err);
                }
            } else {
                console.warn('[PresetManager] ⚠️ Cannot save to file storage - plugin not available');
            }
        } catch (error) {
            console.warn('[PresetManager] Failed to save preset:', error);
        }
    }

    /**
     * Load preset selection from file storage and localStorage
     * Priority: file storage > localStorage > 'default'
     * 
     * @param timeoutMs - Timeout for file loading (default: 3000ms)
     * @returns The saved preset ID or 'default' if none found
     */
    static async loadPresetSelection(
        claudeClient: ClaudeClient,
        timeoutMs: number = 3000
    ): Promise<string> {
        const plugin = claudeClient.plugin;
        let filePresetId: string | null = null;
        let localStoragePresetId: string | null = null;

        // Try loading from file storage first (most reliable)
        if (plugin && typeof plugin.loadData === 'function') {
            try {
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error('File load timeout')), timeoutMs);
                });

                const loadPromise = plugin.loadData('ai-dock-preset.json') as Promise<{ presetId: string } | null>;
                const stored = await Promise.race([loadPromise, timeoutPromise]);

                if (stored && typeof stored === 'object' && stored.presetId) {
                    filePresetId = stored.presetId;
                    console.log(`[PresetManager] ✅ Loaded preset from file: ${filePresetId}`);
                }
            } catch (error) {
                if (error instanceof Error && error.message === 'File load timeout') {
                    console.warn('[PresetManager] ⏱️ File load timed out, using localStorage');
                } else {
                    console.warn('[PresetManager] ❌ Failed to load preset from file:', error);
                }
            }
        } else {
            console.warn('[PresetManager] ⚠️ Cannot load from file storage - plugin not available');
        }

        // Fallback to localStorage
        try {
            localStoragePresetId = localStorage.getItem('claude-ai-dock-preset-id');
        } catch (error) {
            console.warn('[PresetManager] Failed to load preset from localStorage:', error);
        }

        // Use file storage if available, otherwise localStorage
        const resultPresetId = filePresetId ?? localStoragePresetId ?? 'default';

        // Sync localStorage with file storage value (file storage takes precedence)
        if (filePresetId && filePresetId !== localStoragePresetId) {
            try {
                localStorage.setItem('claude-ai-dock-preset-id', filePresetId);
            } catch (error) {
                console.warn('[PresetManager] Failed to sync localStorage:', error);
            }
        }

        console.log(`[PresetManager] Final loaded preset: ${resultPresetId}`);
        return resultPresetId;
    }

    /**
     * Notify preset selection to PresetEventBus
     * (Synchronize with Settings Panel and other components)
     */
    static notifyPresetSelection(claudeClient: ClaudeClient, presetId: string): void {
        // Don't notify for default preset (avoid unnecessary events)
        if (!presetId || presetId === 'default') {
            console.log('[PresetManager] No custom preset to notify (using default)');
            return;
        }

        try {
            // Get ConfigManager and PresetEventBus
            const configManager = (claudeClient as any).configManager;
            if (!configManager || !configManager.getEventBus) {
                console.warn('[PresetManager] ConfigManager or event bus not available');
                return;
            }

            const eventBus = configManager.getEventBus();
            const preset = configManager.getTemplateById?.(presetId);

            // Publish 'selected' event to notify other components
            eventBus.publish({
                type: 'selected',
                presetId: presetId,
                preset: preset,
                timestamp: Date.now(),
                source: 'PresetManager.notifyPresetSelection'
            });

            console.log(`[PresetManager] Notified preset selection: ${presetId}`);
        } catch (error) {
            console.warn('[PresetManager] Failed to notify preset selection:', error);
        }
    }
}
