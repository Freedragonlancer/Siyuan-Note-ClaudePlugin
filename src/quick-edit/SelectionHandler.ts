/**
 * Selection Handler
 * Handles text selection extraction and validation in SiYuan editor
 *
 * Refactored v0.18.0: Made IProtyle optional, supports standalone usage
 */

import type { InlineEditSelection } from './inline-types';
import type { IProtyle } from '../types/siyuan';

/**
 * Extended selection result with additional metadata
 */
export interface ExtendedSelection extends InlineEditSelection {
    /** All selected block elements (for multi-block operations) */
    selectedBlockElements?: HTMLElement[];
    /** Whether this is a multi-block selection */
    isMultiBlock?: boolean;
}

export class SelectionHandler {
    /**
     * Get current selection from SiYuan editor
     * Works with or without IProtyle - uses window.getSelection() as fallback
     *
     * @param protyle Optional SiYuan editor instance
     * @returns Selection object or null if no valid selection
     */
    getSelection(protyle?: IProtyle): ExtendedSelection | null {
        // Get selection from protyle if available, otherwise use window
        let selection: Selection | null = null;

        if (protyle?.wysiwyg?.element) {
            selection = protyle.wysiwyg.element.ownerDocument?.getSelection() ?? null;
        } else {
            selection = window.getSelection();
        }

        if (!selection || selection.rangeCount === 0) {
            // No text selection, try block selection fallback
            return this.getBlockSelectionFallback();
        }

        const range = selection.getRangeAt(0);
        const selectedText = range.toString().trim();

        if (!selectedText) {
            // Empty text selection, try block selection fallback
            return this.getBlockSelectionFallback();
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
            // Multi-block text selection
            const multiBlockResult = this.extractMultiBlockText(range);
            if (multiBlockResult && multiBlockResult.text.trim()) {
                const blockIds = multiBlockResult.blocks
                    .map(b => b.getAttribute('data-node-id'))
                    .filter((id): id is string => !!id);

                const text = multiBlockResult.text;
                return {
                    text,
                    range,
                    blockId: blockIds[0],
                    blockElement: multiBlockResult.blocks[0],
                    selectedBlockIds: blockIds,
                    selectedBlockElements: multiBlockResult.blocks,
                    isMultiBlock: true,
                    startOffset: 0,
                    endOffset: text.length
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
            isMultiBlock: false,
            startOffset: 0,
            endOffset: selectedText.length
        };
    }

    /**
     * Fallback: Try to get block-level selection (blocks with protyle-wysiwyg--select class)
     * This is used when no text is selected but blocks are selected via block icon
     */
    private getBlockSelectionFallback(): ExtendedSelection | null {
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

        if (texts.length === 0 || blockIds.length === 0) {
            return null;
        }

        // Create a range covering all selected blocks
        const firstBlock = selectedBlocks[0];
        const lastBlock = selectedBlocks[selectedBlocks.length - 1];
        const range = document.createRange();
        range.setStartBefore(firstBlock);
        range.setEndAfter(lastBlock);

        const text = texts.join('\n\n');
        return {
            text,
            range,
            blockId: blockIds[0],
            blockElement: firstBlock,
            selectedBlockIds: blockIds,
            selectedBlockElements: selectedBlocks,
            isMultiBlock: selectedBlocks.length > 1,
            startOffset: 0,
            endOffset: text.length
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
     * Uses multiple strategies for robust extraction
     */
    private extractMultiBlockText(range: Range): { text: string; blocks: HTMLElement[] } | null {
        try {
            // Strategy 1: Try extracting blocks from cloned range contents
            let selectedBlocks = this.extractBlocksFromRange(range);

            // If cloneContents didn't find blocks, try sibling traversal
            if (selectedBlocks.length === 0) {
                const startBlock = this.findBlockElement(range.startContainer);
                const endBlock = this.findBlockElement(range.endContainer);

                if (!startBlock || !endBlock) {
                    return null;
                }

                // Same block - just return it
                if (startBlock === endBlock) {
                    const text = (startBlock.textContent || '').trim();
                    return { text, blocks: [startBlock] };
                }

                // Try sibling traversal
                selectedBlocks = this.findBlocksBetween(startBlock, endBlock);

                // If sibling traversal failed, use common ancestor method
                if (selectedBlocks.length === 0) {
                    const commonAncestor = range.commonAncestorContainer;
                    const allBlocks = this.findAllBlocksInContainer(commonAncestor);

                    if (allBlocks.length === 0) {
                        return null;
                    }

                    const startIndex = allBlocks.indexOf(startBlock);
                    const endIndex = allBlocks.indexOf(endBlock);

                    if (startIndex === -1 || endIndex === -1) {
                        return null;
                    }

                    selectedBlocks = allBlocks.slice(startIndex, endIndex + 1);
                }
            } else if (selectedBlocks.length === 1) {
                // Verify if it's really just one block
                const startBlock = this.findBlockElement(range.startContainer);
                const endBlock = this.findBlockElement(range.endContainer);

                if (startBlock && endBlock && startBlock !== endBlock) {
                    const siblingBlocks = this.findBlocksBetween(startBlock, endBlock);
                    if (siblingBlocks.length > 1) {
                        selectedBlocks = siblingBlocks;
                    }
                }
            }

            if (selectedBlocks.length === 0) {
                return null;
            }

            // Extract text from all blocks
            const texts = selectedBlocks
                .map(block => (block.textContent || '').trim())
                .filter(t => t.length > 0);

            return {
                text: texts.join('\n\n'),
                blocks: selectedBlocks
            };
        } catch (error) {
            console.error('[SelectionHandler] Failed to extract multi-block text:', error);
            return null;
        }
    }

    /**
     * Extract blocks from a range using cloneContents
     * This gets the actual selected DOM and finds corresponding real blocks
     */
    private extractBlocksFromRange(range: Range): HTMLElement[] {
        const blockIds: string[] = [];

        try {
            const fragment = range.cloneContents();

            // Traverse the fragment to find all block IDs
            const traverse = (node: Node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const elem = node as HTMLElement;
                    if (elem.hasAttribute('data-node-id')) {
                        const blockId = elem.getAttribute('data-node-id');
                        if (blockId && !blockIds.includes(blockId)) {
                            blockIds.push(blockId);
                        }
                        return; // Don't traverse nested blocks
                    }
                }
                node.childNodes.forEach(child => traverse(child));
            };

            traverse(fragment);

            // Find the actual DOM elements for these block IDs
            const blocks: HTMLElement[] = [];
            for (const blockId of blockIds) {
                const blockElement = document.querySelector(`[data-node-id="${blockId}"]`) as HTMLElement;
                if (blockElement) {
                    blocks.push(blockElement);
                }
            }

            return blocks;
        } catch (error) {
            console.error('[SelectionHandler] Error in extractBlocksFromRange:', error);
            return [];
        }
    }

    /**
     * Find all blocks between start and end block (inclusive) using sibling traversal
     */
    private findBlocksBetween(startBlock: HTMLElement, endBlock: HTMLElement): HTMLElement[] {
        // Same block case
        if (startBlock === endBlock) {
            return [startBlock];
        }

        const startParent = startBlock.parentElement;
        const endParent = endBlock.parentElement;

        if (!startParent || !endParent) {
            return [];
        }

        // Different parents - can't use sibling traversal
        if (startParent !== endParent) {
            return [];
        }

        // Traverse siblings from start to end
        const blocks: HTMLElement[] = [];
        let collecting = false;
        const children = Array.from(startParent.children);

        for (const child of children) {
            const elem = child as HTMLElement;

            if (elem === startBlock) {
                collecting = true;
            }

            if (collecting && elem.hasAttribute('data-node-id')) {
                blocks.push(elem);
            }

            if (elem === endBlock) {
                break;
            }
        }

        return blocks;
    }

    /**
     * Find all block elements in a container
     */
    private findAllBlocksInContainer(container: Node): HTMLElement[] {
        const blocks: HTMLElement[] = [];

        const traverse = (node: Node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const elem = node as HTMLElement;
                if (elem.hasAttribute('data-node-id')) {
                    blocks.push(elem);
                    return; // Don't traverse nested blocks
                }
            }
            node.childNodes.forEach(child => traverse(child));
        };

        traverse(container);
        return blocks;
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
     * Public method: Extract blocks from a range
     * Uses multiple strategies for robust extraction
     */
    public getBlocksFromRange(range: Range): HTMLElement[] {
        // Try cloneContents first (more accurate)
        let blocks = this.extractBlocksFromRange(range);
        if (blocks.length > 0) {
            return blocks;
        }

        // Fallback to start/end traversal
        const startBlock = this.findBlockElement(range.startContainer);
        const endBlock = this.findBlockElement(range.endContainer);

        if (!startBlock) return [];
        if (!endBlock) return [startBlock];
        if (startBlock === endBlock) return [startBlock];

        return this.findBlocksBetween(startBlock, endBlock);
    }

    /**
     * Public method: Find the block element containing a node
     */
    public getBlockForNode(node: Node): HTMLElement | null {
        return this.findBlockElement(node);
    }
}
