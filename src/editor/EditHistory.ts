/**
 * Edit History - Tracks and manages edit history for undo functionality
 */

import type { TextSelection, EditResult } from './types';

export interface HistoryEntry {
    id: string;
    selection: TextSelection;
    originalContent: string;
    modifiedContent: string;
    blockId: string;
    timestamp: number;
    applied: boolean;
}

export class EditHistory {
    private history: HistoryEntry[] = [];
    private maxHistorySize: number = 50;

    /**
     * Add an edit to history
     */
    addToHistory(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): HistoryEntry {
        const historyEntry: HistoryEntry = {
            ...entry,
            id: this.generateId(),
            timestamp: Date.now()
        };

        this.history.unshift(historyEntry);

        // Trim history if it exceeds max size
        if (this.history.length > this.maxHistorySize) {
            this.history = this.history.slice(0, this.maxHistorySize);
        }

        console.log(`[EditHistory] Added entry ${historyEntry.id} to history (total: ${this.history.length})`);
        return historyEntry;
    }

    /**
     * Get most recent applied edit
     */
    getLastAppliedEdit(): HistoryEntry | null {
        for (const entry of this.history) {
            if (entry.applied) {
                return entry;
            }
        }
        return null;
    }

    /**
     * Get entry by ID
     */
    getEntry(id: string): HistoryEntry | undefined {
        return this.history.find(entry => entry.id === id);
    }

    /**
     * Get all history entries
     */
    getAllHistory(): HistoryEntry[] {
        return [...this.history];
    }

    /**
     * Get history for specific block
     */
    getBlockHistory(blockId: string): HistoryEntry[] {
        return this.history.filter(entry => entry.blockId === blockId);
    }

    /**
     * Mark an entry as applied
     */
    markAsApplied(id: string): boolean {
        const entry = this.history.find(e => e.id === id);
        if (entry) {
            entry.applied = true;
            console.log(`[EditHistory] Marked entry ${id} as applied`);
            return true;
        }
        return false;
    }

    /**
     * Clear history
     */
    clearHistory(): void {
        const count = this.history.length;
        this.history = [];
        console.log(`[EditHistory] Cleared ${count} history entries`);
    }

    /**
     * Remove specific entry
     */
    removeEntry(id: string): boolean {
        const index = this.history.findIndex(e => e.id === id);
        if (index !== -1) {
            this.history.splice(index, 1);
            console.log(`[EditHistory] Removed entry ${id}`);
            return true;
        }
        return false;
    }

    /**
     * Get statistics
     */
    getStatistics(): {
        total: number;
        applied: number;
        unapplied: number;
    } {
        const applied = this.history.filter(e => e.applied).length;
        return {
            total: this.history.length,
            applied,
            unapplied: this.history.length - applied
        };
    }

    /**
     * Export history to JSON
     */
    exportHistory(): string {
        return JSON.stringify(this.history, null, 2);
    }

    /**
     * Import history from JSON
     */
    importHistory(json: string): boolean {
        try {
            const imported = JSON.parse(json);
            if (Array.isArray(imported)) {
                this.history = imported;
                console.log(`[EditHistory] Imported ${imported.length} history entries`);
                return true;
            }
        } catch (error) {
            console.error('[EditHistory] Failed to import history:', error);
        }
        return false;
    }

    /**
     * Generate unique ID
     */
    private generateId(): string {
        return `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Set maximum history size
     */
    setMaxHistorySize(size: number): void {
        this.maxHistorySize = Math.max(1, Math.min(size, 100));

        // Trim current history if needed
        if (this.history.length > this.maxHistorySize) {
            this.history = this.history.slice(0, this.maxHistorySize);
        }

        console.log(`[EditHistory] Max history size set to ${this.maxHistorySize}`);
    }
}
