/**
 * Block Operations
 * Handles all SiYuan API operations for block manipulation
 */

export interface BlockInsertResult {
    success: boolean;
    blockId?: string;
    index?: number;
    error?: Error;
}

export interface BlockDeleteResult {
    success: boolean;
    blockId: string;
    error?: Error;
}

export interface BlockUpdateResult {
    success: boolean;
    blockId: string;
    error?: Error;
}

export class BlockOperations {
    private siyuanVersion: string | null = null;
    private versionChecked: boolean = false;

    /**
     * Detect SiYuan version for API capability detection
     * @returns SiYuan version string (e.g., "3.2.1")
     */
    async detectSiyuanVersion(): Promise<string> {
        if (this.siyuanVersion) {
            return this.siyuanVersion;
        }

        try {
            const response = await fetch('/api/system/version');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            this.siyuanVersion = data.data || 'unknown';
            this.versionChecked = true;
            console.log(`[BlockOperations] Detected SiYuan version: ${this.siyuanVersion}`);
            return this.siyuanVersion;
        } catch (error) {
            console.warn('[BlockOperations] Failed to detect SiYuan version, assuming older version:', error);
            this.siyuanVersion = 'unknown';
            this.versionChecked = true;
            return 'unknown';
        }
    }

    /**
     * Check if SiYuan version supports batch insert API
     * @returns true if batch insert is supported (v3.2.1+)
     */
    async supportsBatchInsert(): Promise<boolean> {
        if (!this.versionChecked) {
            await this.detectSiyuanVersion();
        }

        if (!this.siyuanVersion || this.siyuanVersion === 'unknown') {
            return false;
        }

        try {
            const versionParts = this.siyuanVersion.split('.').map(Number);
            const [major, minor, patch] = versionParts;

            // Check if version >= 3.2.1
            if (major > 3) return true;
            if (major === 3 && minor > 2) return true;
            if (major === 3 && minor === 2 && patch >= 1) return true;

            return false;
        } catch (error) {
            console.warn('[BlockOperations] Failed to parse version, assuming batch API not available');
            return false;
        }
    }

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
     * Insert multiple blocks using batch API (SiYuan v3.2.1+)
     * @param paragraphs Array of paragraph content
     * @param afterBlockId ID of the block to insert after
     * @returns Array of insert results
     */
    private async batchInsertBlocks(
        paragraphs: string[],
        afterBlockId: string
    ): Promise<BlockInsertResult[]> {
        try {
            const response = await fetch('/api/block/insertBlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dataType: 'markdown',
                    data: paragraphs.join('\n\n'), // Join with double newline for paragraph separation
                    previousID: afterBlockId
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.code === 0 && result.data) {
                // Extract all inserted block IDs from the result
                const insertedBlocks: BlockInsertResult[] = [];

                if (result.data[0]?.doOperations) {
                    result.data[0].doOperations.forEach((op: any, index: number) => {
                        if (op.id) {
                            insertedBlocks.push({
                                success: true,
                                blockId: op.id,
                                index
                            });
                        }
                    });
                }

                // If we got results, return them
                if (insertedBlocks.length > 0) {
                    console.log(`[BlockOperations] Batch inserted ${insertedBlocks.length} blocks`);
                    return insertedBlocks;
                }

                // Fallback if parsing failed
                throw new Error('Failed to parse batch insert results');
            } else {
                throw new Error(result.msg || 'Batch insert failed');
            }
        } catch (error) {
            console.error('[BlockOperations] Batch insert failed, falling back to sequential:', error);
            // Fall back to sequential insertion
            return this.sequentialInsertBlocks(paragraphs, afterBlockId);
        }
    }

    /**
     * Insert multiple blocks sequentially (fallback for older SiYuan versions)
     * @param paragraphs Array of paragraph content
     * @param afterBlockId ID of the block to insert after
     * @returns Array of insert results
     */
    private async sequentialInsertBlocks(
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
     * Insert multiple blocks in sequence (auto-detects best method)
     * @param paragraphs Array of paragraph content
     * @param afterBlockId ID of the block to insert after
     * @returns Array of insert results
     */
    async insertMultipleBlocks(
        paragraphs: string[],
        afterBlockId: string
    ): Promise<BlockInsertResult[]> {
        // Check if batch API is available
        const supportsBatch = await this.supportsBatchInsert();

        if (supportsBatch && paragraphs.length > 10) {
            // Use batch API for better performance (only for 10+ blocks to avoid overhead)
            console.log(`[BlockOperations] Using batch insert API for ${paragraphs.length} blocks`);
            return this.batchInsertBlocks(paragraphs, afterBlockId);
        } else {
            // Fall back to sequential insertion
            if (!supportsBatch) {
                console.log(`[BlockOperations] Batch API not available, using sequential insert for ${paragraphs.length} blocks`);
            } else {
                console.log(`[BlockOperations] Using sequential insert for ${paragraphs.length} blocks (< 10 blocks)`);
            }
            return this.sequentialInsertBlocks(paragraphs, afterBlockId);
        }
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
     * Delete multiple blocks using transactions API (batch delete)
     * @param blockIds Array of block IDs to delete
     * @returns Array of delete results
     */
    private async batchDeleteBlocks(blockIds: string[]): Promise<BlockDeleteResult[]> {
        try {
            // Use transactions API for batch delete
            const transactions = blockIds.map(id => ({
                action: 'delete',
                id: id
            }));

            const response = await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session: Date.now().toString(),
                    transactions: transactions
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.code === 0) {
                // All deletions successful
                console.log(`[BlockOperations] Batch deleted ${blockIds.length} blocks`);
                return blockIds.map(blockId => ({
                    success: true,
                    blockId
                }));
            } else {
                throw new Error(result.msg || 'Batch delete failed');
            }
        } catch (error) {
            console.error('[BlockOperations] Batch delete failed, falling back to parallel delete:', error);
            // Fall back to parallel deletion
            return this.parallelDeleteBlocks(blockIds);
        }
    }

    /**
     * Delete multiple blocks in parallel (fallback)
     * @param blockIds Array of block IDs to delete
     * @returns Array of delete results
     */
    private async parallelDeleteBlocks(blockIds: string[]): Promise<BlockDeleteResult[]> {
        const deletePromises = blockIds.map(id => this.deleteBlock(id));
        return await Promise.all(deletePromises);
    }

    /**
     * Delete multiple blocks (auto-detects best method)
     * @param blockIds Array of block IDs to delete
     * @returns Array of delete results
     */
    async deleteMultipleBlocks(blockIds: string[]): Promise<BlockDeleteResult[]> {
        if (blockIds.length === 0) {
            return [];
        }

        // Use batch delete for 10+ blocks
        if (blockIds.length > 10) {
            console.log(`[BlockOperations] Using batch delete for ${blockIds.length} blocks`);
            return this.batchDeleteBlocks(blockIds);
        } else {
            console.log(`[BlockOperations] Using parallel delete for ${blockIds.length} blocks`);
            return this.parallelDeleteBlocks(blockIds);
        }
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
