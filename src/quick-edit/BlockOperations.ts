/**
 * Block Operations
 * Handles all SiYuan API operations for block manipulation
 */

export interface BlockInsertResult {
    success: boolean;
    blockId?: string;
    index?: number;
    error?: any;
}

export interface BlockDeleteResult {
    success: boolean;
    blockId: string;
    error?: any;
}

export interface BlockUpdateResult {
    success: boolean;
    blockId: string;
    error?: any;
}

export class BlockOperations {
    /**
     * Insert a new block after a specified block
     * @param content Block content (markdown)
     * @param previousID ID of the block to insert after
     * @returns Insert result with new block ID
     */
    async insertBlock(content: string, previousID: string): Promise<BlockInsertResult> {
        try {
            const response = await fetch('/api/block/insertBlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dataType: 'markdown',
                    data: content,
                    previousID
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.code === 0 && result.data && result.data[0]?.doOperations?.[0]?.id) {
                return {
                    success: true,
                    blockId: result.data[0].doOperations[0].id
                };
            } else {
                return {
                    success: false,
                    error: result
                };
            }
        } catch (error) {
            console.error('[BlockOperations] Insert block failed:', error);
            return {
                success: false,
                error
            };
        }
    }

    /**
     * Insert multiple blocks in sequence
     * @param paragraphs Array of paragraph content
     * @param afterBlockId ID of the block to insert after
     * @returns Array of insert results
     */
    async insertMultipleBlocks(
        paragraphs: string[],
        afterBlockId: string
    ): Promise<BlockInsertResult[]> {
        const results: BlockInsertResult[] = [];
        let previousID = afterBlockId;

        for (let i = 0; i < paragraphs.length; i++) {
            const paragraph = paragraphs[i];

            const insertResult = await this.insertBlock(paragraph, previousID);

            if (insertResult.success && insertResult.blockId) {
                // Update previousID for next insertion
                previousID = insertResult.blockId;
                results.push({
                    success: true,
                    blockId: insertResult.blockId,
                    index: i
                });
            } else {
                // Log failure but continue (don't break the chain)
                console.warn(`[BlockOperations] Failed to insert paragraph ${i + 1}:`, insertResult.error);
                results.push({
                    success: false,
                    index: i,
                    error: insertResult.error
                });
                // Don't update previousID - skip failed insertion
            }
        }

        return results;
    }

    /**
     * Delete a block
     * @param blockId Block ID to delete
     * @returns Delete result
     */
    async deleteBlock(blockId: string): Promise<BlockDeleteResult> {
        try {
            const response = await fetch('/api/block/deleteBlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: blockId })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            return {
                success: result.code === 0,
                blockId,
                error: result.code !== 0 ? result : undefined
            };
        } catch (error) {
            console.error(`[BlockOperations] Delete block ${blockId} failed:`, error);
            return {
                success: false,
                blockId,
                error
            };
        }
    }

    /**
     * Delete multiple blocks
     * @param blockIds Array of block IDs to delete
     * @returns Array of delete results
     */
    async deleteMultipleBlocks(blockIds: string[]): Promise<BlockDeleteResult[]> {
        const deletePromises = blockIds.map(id => this.deleteBlock(id));
        return await Promise.all(deletePromises);
    }

    /**
     * Update a block's content
     * @param blockId Block ID to update
     * @param content New content (markdown)
     * @returns Update result
     */
    async updateBlock(blockId: string, content: string): Promise<BlockUpdateResult> {
        try {
            const response = await fetch('/api/block/updateBlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dataType: 'markdown',
                    data: content,
                    id: blockId
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            return {
                success: result.code === 0,
                blockId,
                error: result.code !== 0 ? result : undefined
            };
        } catch (error) {
            console.error(`[BlockOperations] Update block ${blockId} failed:`, error);
            return {
                success: false,
                blockId,
                error
            };
        }
    }

    /**
     * Apply markdown formatting based on block type
     * Preserves original block formatting when possible
     */
    applyMarkdownFormatting(text: string, blockType?: string, blockSubtype?: string): string {
        if (!blockType || !blockSubtype) {
            return text; // No type info, return as-is
        }

        // Handle headings (h1-h6)
        if (blockType === 'NodeHeading') {
            const match = blockSubtype.match(/h(\d)/);
            if (match) {
                const level = parseInt(match[1], 10);
                const prefix = '#'.repeat(level);
                // Remove existing heading markers if present
                const cleanText = text.replace(/^#+\s*/, '');
                return `${prefix} ${cleanText}`;
            }
        }

        // Handle list items
        if (blockType === 'NodeListItem') {
            if (blockSubtype === 'u') {
                // Unordered list
                const cleanText = text.replace(/^[-*+]\s*/, '');
                return `- ${cleanText}`;
            } else if (blockSubtype === 'o') {
                // Ordered list
                const cleanText = text.replace(/^\d+\.\s*/, '');
                return `1. ${cleanText}`;
            } else if (blockSubtype === 't') {
                // Task list
                const cleanText = text.replace(/^[-*]\s*\[[x ]\]\s*/, '');
                return `- [ ] ${cleanText}`;
            }
        }

        // Handle blockquotes
        if (blockType === 'NodeBlockquote') {
            const cleanText = text.replace(/^>\s*/, '');
            return `> ${cleanText}`;
        }

        // Handle code blocks
        if (blockType === 'NodeCodeBlock') {
            // Extract language if present
            const lines = text.split('\n');
            if (lines[0].startsWith('```')) {
                // Already formatted
                return text;
            } else {
                // Add code block markers
                return `\`\`\`\n${text}\n\`\`\``;
            }
        }

        // Default: return as-is
        return text;
    }
}
