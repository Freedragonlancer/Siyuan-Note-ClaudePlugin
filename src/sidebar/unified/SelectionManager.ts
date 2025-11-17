/**
 * Selection Manager - Block selection utilities for UnifiedAIPanel
 *
 * Provides utility functions for working with SiYuan's block selection system.
 * Extracted as part of architectural refactoring (Task 2.1 Phase 5).
 *
 * @module SelectionManager
 * @see UnifiedAIPanel
 */

/**
 * Utility class for managing block selections in SiYuan editor
 */
export class SelectionManager {
    /**
     * Get currently selected blocks from the SiYuan editor
     * Returns array of DOM elements with data-node-id attribute
     */
    static getSelectedBlocks(): Element[] {
        // Query all selected blocks in the SiYuan editor
        const selectedBlocks = document.querySelectorAll('.protyle-wysiwyg--select[data-node-id]');
        return Array.from(selectedBlocks);
    }

    /**
     * Extract block IDs from selected elements
     */
    static extractBlockIds(selectedBlocks: Element[]): string[] {
        return selectedBlocks
            .map(block => block.getAttribute('data-node-id'))
            .filter(id => id !== null) as string[];
    }

    /**
     * Extract text content from selected blocks
     */
    static extractBlockText(selectedBlocks: Element[]): string {
        const texts = selectedBlocks
            .map(block => (block.textContent || '').trim())
            .filter(text => text.length > 0);

        return texts.join('\n\n');
    }

    /**
     * Clear all DOM selection states
     * Removes both text selection and block selection classes
     */
    static clearDOMSelection(): void {
        // 1a. Clear text selection (window.getSelection)
        const windowSelection = window.getSelection();
        if (windowSelection) {
            windowSelection.removeAllRanges();
        }

        // 1b. Clear block selection (SiYuan's block selection)
        const selectedBlocks = document.querySelectorAll('.protyle-wysiwyg--select[data-node-id]');
        selectedBlocks.forEach(block => {
            block.classList.remove('protyle-wysiwyg--select');
        });
    }

    /**
     * Update mode badge UI based on selection state
     */
    static updateModeBadge(
        badgeElement: HTMLElement | null,
        mode: 'selectionQA' | 'freeChat',
        blockCount?: number
    ): void {
        if (!badgeElement) return;

        if (mode === 'selectionQA' && blockCount !== undefined && blockCount > 0) {
            // Show selection badge
            badgeElement.textContent = `📝 已选中 ${blockCount} 个块`;
            badgeElement.classList.remove('fading-out');
            badgeElement.style.display = 'inline-block';
        } else {
            // Hide badge in free chat mode with fade-out animation
            if (badgeElement.style.display !== 'none') {
                badgeElement.classList.add('fading-out');
                // Wait for animation to complete before hiding
                setTimeout(() => {
                    badgeElement.style.display = 'none';
                    badgeElement.classList.remove('fading-out');
                }, 300); // Match CSS animation duration
            }
        }
    }

    /**
     * Check if selection has changed by comparing block IDs
     */
    static hasSelectionChanged(
        currentBlockIds: string[] | null,
        newBlockIds: string[]
    ): boolean {
        if (!currentBlockIds) return newBlockIds.length > 0;
        if (currentBlockIds.length !== newBlockIds.length) return true;

        return JSON.stringify(currentBlockIds) !== JSON.stringify(newBlockIds);
    }

    /**
     * Create selection state object from blocks
     */
    static createSelectionState(selectedBlocks: Element[]): {
        blockIds: string[];
        text: string;
        timestamp: number;
    } | null {
        if (selectedBlocks.length === 0) return null;

        const blockIds = this.extractBlockIds(selectedBlocks);
        const text = this.extractBlockText(selectedBlocks);

        return {
            blockIds,
            text,
            timestamp: Date.now()
        };
    }
}
