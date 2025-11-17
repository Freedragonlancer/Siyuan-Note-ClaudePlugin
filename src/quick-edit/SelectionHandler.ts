/**
 * Selection Handler
 * Handles text selection extraction and validation in SiYuan editor
 */

import type { InlineEditSelection } from './inline-types';
import type { IProtyle } from '../types/siyuan';

export class SelectionHandler {
    /**
     * Get current selection from SiYuan editor
     * @param protyle SiYuan editor instance
     * @returns Selection object or null if no valid selection
     */
    getSelection(protyle: IProtyle): InlineEditSelection | null {
        if (!protyle?.wysiwyg?.element) {
            console.warn('[SelectionHandler] Protyle or wysiwyg element not found');
            return null;
        }

        const selection = protyle.wysiwyg.element.ownerDocument?.getSelection();
        if (!selection || selection.rangeCount === 0) {
            console.warn('[SelectionHandler] No selection found');
            return null;
        }

        const range = selection.getRangeAt(0);
        const selectedText = range.toString().trim();

        if (!selectedText) {
            console.warn('[SelectionHandler] Empty selection');
            // Try block selection fallback
            return this.getBlockSelectionFallback(protyle);
        }

        // Find containing block
        const blockElement = this.findBlockElement(range.startContainer);
        if (!blockElement) {
            console.warn('[SelectionHandler] No block element found for selection');
            return null;
        }

        const blockId = blockElement.getAttribute('data-node-id');
        if (!blockId) {
            console.warn('[SelectionHandler] Block element has no data-node-id');
            return null;
        }

        // Check for multi-block selection
        const startBlock = this.findBlockElement(range.startContainer);
        const endBlock = this.findBlockElement(range.endContainer);

        if (startBlock && endBlock && startBlock !== endBlock) {
            // Multi-block selection
            const multiBlockResult = this.extractMultiBlockText(range);
            if (multiBlockResult) {
                const blockIds = multiBlockResult.blocks.map(b => b.getAttribute('data-node-id')).filter((id): id is string => !!id);
                return {
                    text: multiBlockResult.text,
                    range,
                    blockId: blockIds[0],
                    blockElement: multiBlockResult.blocks[0],
                    selectedBlockIds: blockIds,
                    selectedBlockElements: multiBlockResult.blocks,
                    isMultiBlock: true
                };
            }
        }

        // Single block selection
        return {
            text: selectedText,
            range,
            blockId,
            blockElement,
            selectedBlockIds: [blockId],
            selectedBlockElements: [blockElement],
            isMultiBlock: false
        };
    }

    /**
     * Fallback: Try to get block-level selection (no text selection)
     */
    private getBlockSelectionFallback(protyle: IProtyle): InlineEditSelection | null {
        const selectedBlocks = this.getSelectedBlocks();
        if (selectedBlocks.length === 0) {
            return null;
        }

        // Get text from all selected blocks
        const texts: string[] = [];
        const blockIds: string[] = [];

        for (const block of selectedBlocks) {
            const blockId = block.getAttribute('data-node-id');
            if (!blockId) continue;

            const text = block.textContent?.trim();
            if (text) {
                texts.push(text);
                blockIds.push(blockId);
            }
        }

        if (texts.length === 0) {
            return null;
        }

        // Create a fake range
        const firstBlock = selectedBlocks[0];
        const range = document.createRange();
        range.selectNodeContents(firstBlock);

        return {
            text: texts.join('\n\n'),
            range,
            blockId: blockIds[0],
            blockElement: firstBlock,
            selectedBlockIds: blockIds,
            selectedBlockElements: selectedBlocks,
            isMultiBlock: selectedBlocks.length > 1
        };
    }

    /**
     * Get selected blocks (blocks with 'protyle-wysiwyg--select' class)
     */
    private getSelectedBlocks(): HTMLElement[] {
        const selectedBlocks = document.querySelectorAll('.protyle-wysiwyg--select[data-node-id]');
        return Array.from(selectedBlocks) as HTMLElement[];
    }

    /**
     * Extract text and blocks from a multi-block range
     */
    private extractMultiBlockText(range: Range): { text: string; blocks: HTMLElement[] } | null {
        try {
            const startBlock = this.findBlockElement(range.startContainer);
            const endBlock = this.findBlockElement(range.endContainer);

            if (!startBlock || !endBlock) {
                return null;
            }

            let blocks: HTMLElement[];
            if (startBlock === endBlock) {
                blocks = [startBlock];
            } else {
                blocks = this.findBlocksBetween(startBlock, endBlock);
            }

            if (blocks.length === 0) {
                return null;
            }

            // Extract text from blocks
            const blockTexts: string[] = [];
            for (const block of blocks) {
                const blockText = block.textContent?.trim();
                if (blockText) {
                    blockTexts.push(blockText);
                }
            }

            return {
                text: blockTexts.join('\n\n'),
                blocks
            };
        } catch (error) {
            console.error('[SelectionHandler] Failed to extract multi-block text:', error);
            return null;
        }
    }

    /**
     * Find all blocks between start and end block (inclusive)
     */
    private findBlocksBetween(startBlock: HTMLElement, endBlock: HTMLElement): HTMLElement[] {
        const blocks: HTMLElement[] = [startBlock];
        let currentBlock = startBlock;

        // Find common container
        const container = this.findCommonContainer(startBlock, endBlock);
        if (!container) {
            return [startBlock, endBlock];
        }

        // Get all blocks in container
        const allBlocks = this.findAllBlocksInContainer(container);

        const startIndex = allBlocks.indexOf(startBlock);
        const endIndex = allBlocks.indexOf(endBlock);

        if (startIndex === -1 || endIndex === -1) {
            return [startBlock, endBlock];
        }

        // Return blocks from start to end (inclusive)
        return allBlocks.slice(startIndex, endIndex + 1);
    }

    /**
     * Find common container for two blocks
     */
    private findCommonContainer(block1: HTMLElement, block2: HTMLElement): Node | null {
        // Simple implementation: use document body
        // Can be optimized to find closest common ancestor
        return document.body;
    }

    /**
     * Find all blocks in a container
     */
    private findAllBlocksInContainer(container: Node): HTMLElement[] {
        if (container.nodeType !== Node.ELEMENT_NODE) {
            return [];
        }

        const blocks = (container as HTMLElement).querySelectorAll('[data-node-id][data-type]');
        return Array.from(blocks) as HTMLElement[];
    }

    /**
     * Find the containing block element for a node
     */
    private findBlockElement(node: Node): HTMLElement | null {
        let current: Node | null = node;

        while (current) {
            if (current.nodeType === Node.ELEMENT_NODE) {
                const element = current as HTMLElement;
                // SiYuan blocks have data-node-id attribute
                if (element.hasAttribute('data-node-id')) {
                    return element;
                }
            }
            current = current.parentNode;
        }

        return null;
    }

    /**
     * Extract blocks from a range
     */
    extractBlocksFromRange(range: Range): HTMLElement[] {
        const startBlock = this.findBlockElement(range.startContainer);
        const endBlock = this.findBlockElement(range.endContainer);

        if (!startBlock) return [];
        if (!endBlock) return [startBlock];
        if (startBlock === endBlock) return [startBlock];

        return this.findBlocksBetween(startBlock, endBlock);
    }
}
