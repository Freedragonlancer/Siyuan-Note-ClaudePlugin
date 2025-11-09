/**
 * Instruction History Manager - Terminal-style command history for AI Quick Edit
 *
 * Features:
 * - FIFO queue with max 30 entries
 * - Dual-layer persistence (localStorage + file storage)
 * - Deduplication (skip consecutive identical entries)
 * - Up/Down arrow key navigation support
 */

import type { Plugin } from 'siyuan';

const STORAGE_KEY = 'claude-instruction-history';
const FILE_PATH = '/data/storage/siyuan-plugin-claude-assistant/instruction-history.json';
const MAX_HISTORY_SIZE = 30;
const INIT_TIMEOUT = 3000; // 3s timeout for initialization

export interface HistoryEntry {
    text: string;
    timestamp: number;
}

export class InstructionHistoryManager {
    private history: HistoryEntry[] = [];
    private plugin: Plugin;
    private initialized: boolean = false;
    private initPromise: Promise<void> | null = null;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    /**
     * Initialize history manager - load from storage
     * Call this once during plugin startup
     */
    public async init(): Promise<void> {
        // Prevent duplicate initialization
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this.loadHistory();
        return this.initPromise;
    }

    /**
     * Wait for initialization to complete
     */
    public async waitForInit(): Promise<void> {
        if (this.initialized) return;
        if (this.initPromise) {
            await this.initPromise;
        }
    }

    /**
     * Add new instruction to history
     * - Skips if identical to last entry (deduplication)
     * - Enforces FIFO queue with max 30 items
     */
    public async addEntry(text: string): Promise<void> {
        await this.waitForInit();

        const trimmed = text.trim();
        if (!trimmed) {
            return; // Skip empty entries
        }

        // Deduplication: Skip if identical to last entry
        const lastEntry = this.history[this.history.length - 1];
        if (lastEntry && lastEntry.text === trimmed) {
            console.log('[InstructionHistory] Skipping duplicate entry');
            return;
        }

        // Create new entry
        const entry: HistoryEntry = {
            text: trimmed,
            timestamp: Date.now()
        };

        // Add to end (newest)
        this.history.push(entry);

        // FIFO: Remove oldest if exceeds max size
        if (this.history.length > MAX_HISTORY_SIZE) {
            this.history.shift(); // Remove first (oldest) entry
            console.log(`[InstructionHistory] FIFO limit enforced, removed oldest entry (total: ${this.history.length})`);
        }

        // Persist to storage
        await this.saveHistory();
    }

    /**
     * Get all history entries (oldest to newest)
     */
    public getHistory(): HistoryEntry[] {
        return [...this.history];
    }

    /**
     * Get entry by index (0 = oldest, length-1 = newest)
     */
    public getEntry(index: number): HistoryEntry | null {
        if (index < 0 || index >= this.history.length) {
            return null;
        }
        return this.history[index];
    }

    /**
     * Get total number of history entries
     */
    public getSize(): number {
        return this.history.length;
    }

    /**
     * Clear all history
     */
    public async clearHistory(): Promise<void> {
        await this.waitForInit();

        this.history = [];
        await this.saveHistory();
        console.log('[InstructionHistory] History cleared');
    }

    /**
     * Navigate history for Up/Down arrow key support
     * @param currentIndex Current browsing index (-1 if not browsing)
     * @param direction 'up' (older) or 'down' (newer)
     * @returns New index and entry text, or null if at boundary
     */
    public navigate(
        currentIndex: number,
        direction: 'up' | 'down'
    ): { index: number; text: string } | null {
        if (this.history.length === 0) {
            return null;
        }

        let newIndex: number;

        if (direction === 'up') {
            // Navigate to older entries (towards index 0)
            if (currentIndex === -1) {
                // Start from newest (end of array)
                newIndex = this.history.length - 1;
            } else if (currentIndex > 0) {
                newIndex = currentIndex - 1;
            } else {
                // Already at oldest (index 0), can't go further
                return null;
            }
        } else {
            // Navigate to newer entries (towards end of array)
            if (currentIndex === -1 || currentIndex >= this.history.length - 1) {
                // Already at newest or not browsing, can't go further
                return null;
            } else {
                newIndex = currentIndex + 1;
            }
        }

        const entry = this.history[newIndex];
        if (!entry) {
            return null;
        }

        return {
            index: newIndex,
            text: entry.text
        };
    }

    /**
     * Load history from storage (dual-layer: localStorage + file)
     */
    private async loadHistory(): Promise<void> {
        try {
            // Layer 1: Try localStorage first (fast)
            const localData = localStorage.getItem(STORAGE_KEY);
            if (localData) {
                const parsed = JSON.parse(localData);
                if (Array.isArray(parsed)) {
                    this.history = this.validateAndFixHistory(parsed);
                    console.log(`[InstructionHistory] Loaded ${this.history.length} entries from localStorage`);
                    this.initialized = true;

                    // Background sync from file (non-blocking)
                    this.loadFromFile().catch(err => {
                        console.warn('[InstructionHistory] Background file sync failed:', err);
                    });

                    return;
                }
            }

            // Layer 2: Load from file if localStorage empty
            await this.loadFromFile();
            this.initialized = true;

        } catch (error) {
            console.error('[InstructionHistory] Failed to load history:', error);
            this.history = [];
            this.initialized = true;
        }
    }

    /**
     * Load history from file storage
     */
    private async loadFromFile(): Promise<void> {
        try {
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('File load timeout')), INIT_TIMEOUT);
            });

            const loadPromise = fetch('/api/file/getFile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: FILE_PATH })
            });

            const response = await Promise.race([loadPromise, timeoutPromise]);

            if (response.ok) {
                const text = await response.text();
                const parsed = JSON.parse(text);
                if (Array.isArray(parsed)) {
                    this.history = this.validateAndFixHistory(parsed);
                    console.log(`[InstructionHistory] Loaded ${this.history.length} entries from file`);

                    // Sync back to localStorage
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.history));
                }
            }
        } catch (error) {
            // File might not exist yet (first run), this is normal
            if (error instanceof Error && error.message !== 'File load timeout') {
                console.log('[InstructionHistory] No existing history file (first run)');
            }
        }
    }

    /**
     * Save history to storage (dual-layer: localStorage + file)
     */
    private async saveHistory(): Promise<void> {
        const data = JSON.stringify(this.history);

        // Layer 1: Save to localStorage (synchronous, fast)
        try {
            localStorage.setItem(STORAGE_KEY, data);
        } catch (error) {
            console.warn('[InstructionHistory] Failed to save to localStorage:', error);
        }

        // Layer 2: Save to file (asynchronous, reliable)
        try {
            await fetch('/api/file/putFile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: FILE_PATH,
                    file: new Blob([data], { type: 'application/json' }),
                    isDir: false
                })
            });
        } catch (error) {
            console.warn('[InstructionHistory] Failed to save to file:', error);
        }
    }

    /**
     * Validate and fix history data structure
     * Removes invalid entries and enforces size limit
     */
    private validateAndFixHistory(data: any[]): HistoryEntry[] {
        const valid: HistoryEntry[] = [];

        for (const item of data) {
            if (
                item &&
                typeof item === 'object' &&
                typeof item.text === 'string' &&
                typeof item.timestamp === 'number'
            ) {
                valid.push({
                    text: item.text,
                    timestamp: item.timestamp
                });
            }
        }

        // Enforce size limit (keep newest MAX_HISTORY_SIZE entries)
        if (valid.length > MAX_HISTORY_SIZE) {
            return valid.slice(-MAX_HISTORY_SIZE);
        }

        return valid;
    }

    /**
     * Cleanup resources
     */
    public destroy(): void {
        this.history = [];
        this.initialized = false;
        this.initPromise = null;
    }
}
