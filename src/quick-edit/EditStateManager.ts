/**
 * Edit State Manager
 * Manages state for active Quick Edit sessions
 */

import type { InlineEditBlock } from './inline-types';

export class EditStateManager {
    /** Map of active edit blocks (blockId -> InlineEditBlock) */
    private activeBlocks: Map<string, InlineEditBlock> = new Map();

    /** Currently processing flag (prevents concurrent edits) */
    private isProcessing: boolean = false;

    /** Keyboard event handlers (blockId -> handler) */
    private keyboardHandlers: Map<string, (e: KeyboardEvent) => void> = new Map();

    /** Mutation observer for DOM changes */
    private mutationObserver: MutationObserver | null = null;

    /** Observed containers (to avoid duplicate observations) */
    private observedContainers: Set<HTMLElement> = new Set();

    /**
     * Check if currently processing an edit
     */
    isCurrentlyProcessing(): boolean {
        return this.isProcessing;
    }

    /**
     * Set processing state
     */
    setProcessing(processing: boolean): void {
        this.isProcessing = processing;
    }

    /**
     * Get active block by ID
     */
    getActiveBlock(blockId: string): InlineEditBlock | undefined {
        return this.activeBlocks.get(blockId);
    }

    /**
     * Add active block
     */
    addActiveBlock(blockId: string, block: InlineEditBlock): void {
        this.activeBlocks.set(blockId, block);
    }

    /**
     * Remove active block
     */
    removeActiveBlock(blockId: string): void {
        this.activeBlocks.delete(blockId);
    }

    /**
     * Get all active blocks
     */
    getAllActiveBlocks(): Map<string, InlineEditBlock> {
        return this.activeBlocks;
    }

    /**
     * Clear all active blocks
     */
    clearAllActiveBlocks(): void {
        this.activeBlocks.clear();
    }

    /**
     * Register keyboard handler for a block
     */
    registerKeyboardHandler(blockId: string, handler: (e: KeyboardEvent) => void): void {
        this.keyboardHandlers.set(blockId, handler);
        document.addEventListener('keydown', handler);
    }

    /**
     * Unregister keyboard handler for a block
     */
    unregisterKeyboardHandler(blockId: string): void {
        const handler = this.keyboardHandlers.get(blockId);
        if (handler) {
            document.removeEventListener('keydown', handler);
            this.keyboardHandlers.delete(blockId);
        }
    }

    /**
     * Clear all keyboard handlers
     */
    clearAllKeyboardHandlers(): void {
        this.keyboardHandlers.forEach((handler) => {
            document.removeEventListener('keydown', handler);
        });
        this.keyboardHandlers.clear();
    }

    /**
     * Setup DOM mutation observer to detect block removals
     */
    setupDOMObserver(onBlockRemoved: (blockId: string) => void): void {
        this.mutationObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
                    // Check if any removed node is an active comparison block
                    mutation.removedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node as HTMLElement;
                            // Check if this is a comparison block or contains one
                            const isComparisonBlock = element.classList?.contains('quick-edit-comparison-block');
                            const containsComparisonBlock = element.querySelector?.('.quick-edit-comparison-block');

                            if (isComparisonBlock || containsComparisonBlock) {
                                // Find block ID from element or data attribute
                                const blockId = element.getAttribute('data-block-id');
                                if (blockId && this.activeBlocks.has(blockId)) {
                                    console.log(`[EditStateManager] Detected external removal of block ${blockId}`);
                                    onBlockRemoved(blockId);
                                }
                            }
                        }
                    });
                }
            }
        });

        // Observe document body for changes
        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('[EditStateManager] DOM observer started');
    }

    /**
     * Observe a specific container for changes
     */
    observeContainer(container: HTMLElement): void {
        if (this.observedContainers.has(container)) {
            return; // Already observing
        }

        if (!this.mutationObserver) {
            console.warn('[EditStateManager] Cannot observe container: observer not initialized');
            return;
        }

        this.mutationObserver.observe(container, {
            childList: true,
            subtree: true
        });

        this.observedContainers.add(container);
        console.log('[EditStateManager] Observing container:', container);
    }

    /**
     * Pause DOM observer (temporarily disable)
     */
    pauseObserver(): void {
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
        }
    }

    /**
     * Resume DOM observer
     */
    resumeObserver(): void {
        if (this.mutationObserver) {
            this.mutationObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    /**
     * Cleanup all state
     */
    destroy(): void {
        // Clear keyboard handlers
        this.clearAllKeyboardHandlers();

        // Clear active blocks
        this.clearAllActiveBlocks();

        // Disconnect observer
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }

        this.observedContainers.clear();
        this.isProcessing = false;

        console.log('[EditStateManager] Destroyed');
    }
}
