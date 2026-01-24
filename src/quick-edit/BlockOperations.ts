/**
 * Block Operations
 * Handles all SiYuan API operations for block manipulation
 */

import { withRetry, isRetryableError, type RetryConfig } from '@/utils/RetryHelper';

/** Default retry config for block operations */
const BLOCK_RETRY_CONFIG: Partial<RetryConfig> = {
    maxRetries: 2,
    baseDelay: 100,
    maxDelay: 1000,
    backoffMultiplier: 2
};

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
     * Insert a new block after a specified block with automatic retry on transient failures
     * @param content Block content (markdown)
     * @param previousID ID of the block to insert after
     * @param enableRetry Whether to enable retry (default: true)
     * @returns Insert result with new block ID
     */
    async insertBlock(content: string, previousID: string, enableRetry: boolean = true): Promise<BlockInsertResult> {
        const doInsert = async (): Promise<BlockInsertResult> => {
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
                // Non-zero code or missing data - application error, not retryable
                return {
                    success: false,
                    error: new Error(result.msg || 'Insert failed: no block ID returned')
                };
            }
        };

        try {
            if (enableRetry) {
                return await withRetry(doInsert, BLOCK_RETRY_CONFIG, isRetryableError);
            }
            return await doInsert();
        } catch (error) {
            console.error('[BlockOperations] Insert block failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error : new Error(String(error))
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

                // If we got results, check if the count matches expected
                if (insertedBlocks.length > 0) {
                    console.log(`[BlockOperations] Batch inserted ${insertedBlocks.length} blocks`);

                    // CRITICAL FIX: Verify that all paragraphs were inserted as separate blocks
                    // If SiYuan merged them into fewer blocks, we need to fall back to sequential
                    if (insertedBlocks.length < paragraphs.length) {
                        console.warn(`[BlockOperations] Batch insert created ${insertedBlocks.length} blocks but expected ${paragraphs.length}. Falling back to sequential.`);
                        // Delete the incorrectly merged block(s) first
                        const blockIdsToDelete = insertedBlocks.map(b => b.blockId).filter(id => id !== undefined) as string[];
                        console.log(`[BlockOperations] Deleting ${blockIdsToDelete.length} incorrectly merged blocks:`, blockIdsToDelete);

                        if (blockIdsToDelete.length > 0) {
                            const deleteResults = await this.deleteMultipleBlocks(blockIdsToDelete);
                            const failedDeletes = deleteResults.filter(r => !r.success);

                            if (failedDeletes.length > 0) {
                                console.error(`[BlockOperations] CRITICAL: Failed to delete ${failedDeletes.length} merged blocks. This may cause duplicate content!`, failedDeletes);
                                // Wait longer and retry once
                                await new Promise(resolve => setTimeout(resolve, 500));
                                const retryResults = await this.deleteMultipleBlocks(failedDeletes.map(r => r.blockId));
                                const stillFailed = retryResults.filter(r => !r.success);
                                if (stillFailed.length > 0) {
                                    console.error(`[BlockOperations] Retry also failed for ${stillFailed.length} blocks`);
                                }
                            } else {
                                console.log(`[BlockOperations] Successfully deleted ${deleteResults.length} merged blocks`);
                            }
                        }

                        // Wait for SiYuan to process the deletion before inserting new blocks
                        await new Promise(resolve => setTimeout(resolve, 200));

                        // Fall back to sequential insertion
                        console.log(`[BlockOperations] Starting sequential fallback insert for ${paragraphs.length} paragraphs`);
                        return this.sequentialInsertBlocks(paragraphs, afterBlockId);
                    }

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

        // DISABLED: Batch insert API merges paragraphs into single block (SiYuan API limitation)
        // Always use sequential insert for reliability until SiYuan fixes this behavior
        if (false && supportsBatch && paragraphs.length > 10) {
            // Use batch API for better performance (only for 10+ blocks to avoid overhead)
            console.log(`[BlockOperations] Using batch insert API for ${paragraphs.length} blocks`);
            return this.batchInsertBlocks(paragraphs, afterBlockId);
        } else {
            // Always use sequential insertion for reliability
            console.log(`[BlockOperations] Using sequential insert for ${paragraphs.length} blocks`);
            return this.sequentialInsertBlocks(paragraphs, afterBlockId);
        }
    }

    /**
     * Delete a block with automatic retry on transient failures
     * @param blockId Block ID to delete
     * @param enableRetry Whether to enable retry (default: true)
     * @returns Delete result
     */
    async deleteBlock(blockId: string, enableRetry: boolean = true): Promise<BlockDeleteResult> {
        const doDelete = async (): Promise<BlockDeleteResult> => {
            const response = await fetch('/api/block/deleteBlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: blockId })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.code !== 0) {
                // Non-zero code from API - this is an application error, not retryable
                return {
                    success: false,
                    blockId,
                    error: new Error(result.msg || `API error code: ${result.code}`)
                };
            }

            return {
                success: true,
                blockId
            };
        };

        try {
            if (enableRetry) {
                return await withRetry(doDelete, BLOCK_RETRY_CONFIG, isRetryableError);
            }
            return await doDelete();
        } catch (error) {
            console.error(`[BlockOperations] Delete block ${blockId} failed:`, error);
            return {
                success: false,
                blockId,
                error: error instanceof Error ? error : new Error(String(error))
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
     * Uses Promise.allSettled for resilient partial failure handling
     * @param blockIds Array of block IDs to delete
     * @returns Array of delete results
     */
    private async parallelDeleteBlocks(blockIds: string[]): Promise<BlockDeleteResult[]> {
        const deletePromises = blockIds.map(id => this.deleteBlock(id));
        const settledResults = await Promise.allSettled(deletePromises);

        const results = settledResults.map((result, index) => {
            if (result.status === 'fulfilled') {
                return result.value;
            }
            // Handle rejected promise - create error result
            console.error(`[BlockOperations] Delete failed for block ${blockIds[index]}:`, result.reason);
            return {
                success: false,
                blockId: blockIds[index],
                error: result.reason instanceof Error ? result.reason : new Error(String(result.reason))
            };
        });

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;
        if (failCount > 0) {
            console.warn(`[BlockOperations] Parallel delete completed: ${successCount} success, ${failCount} failed`);
        }
        return results;
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

        // DISABLED: Batch delete via /api/transactions may not actually delete blocks
        // Always use parallel delete for reliability
        // if (blockIds.length > 10) {
        //     console.log(`[BlockOperations] Using batch delete for ${blockIds.length} blocks`);
        //     return this.batchDeleteBlocks(blockIds);
        // }

        console.log(`[BlockOperations] Using parallel delete for ${blockIds.length} blocks`);
        return this.parallelDeleteBlocks(blockIds);
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
     * Get block's markdown content via API
     * @param blockId - Target block ID
     * @returns Markdown content or null if failed
     */
    async getBlockMarkdown(blockId: string): Promise<string | null> {
        try {
            const response = await fetch('/api/block/getBlockKramdown', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: blockId })
            });

            if (!response.ok) return null;

            const result = await response.json();
            if (result.code === 0 && result.data) {
                let kramdown = result.data.kramdown || null;
                if (kramdown) {
                    // Remove kramdown block attributes like {: id="..." updated="..." ...}
                    kramdown = kramdown.replace(/\{:\s*id="[^"]*"[^}]*\}/g, '').trim();
                }
                return kramdown;
            }
            return null;
        } catch (error) {
            console.error(`[BlockOperations] Get block markdown ${blockId} failed:`, error);
            return null;
        }
    }

    /**
     * Update a portion of a block's content (partial replacement)
     * @param blockId - Target block ID
     * @param fullMarkdown - Original full block markdown
     * @param newPartialContent - New content to replace the selected portion
     * @param startOffset - Start offset in markdown
     * @param endOffset - End offset in markdown
     */
    async updateBlockPartial(
        blockId: string,
        fullMarkdown: string,
        newPartialContent: string,
        startOffset: number,
        endOffset: number
    ): Promise<BlockUpdateResult> {
        // Construct new full content by replacing the specified range
        const newFullContent =
            fullMarkdown.substring(0, startOffset) +
            newPartialContent +
            fullMarkdown.substring(endOffset);

        console.log(`[BlockOperations] Partial update: replacing [${startOffset}:${endOffset}] in block ${blockId}`);

        // Use existing updateBlock to apply the change
        return this.updateBlock(blockId, newFullContent);
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

    /**
     * Save an image to SiYuan assets (v0.19.0 multimodal output)
     * @param base64Data Base64-encoded image data (without data URL prefix)
     * @param mimeType MIME type of the image (e.g., 'image/png')
     * @param fileName Optional file name (auto-generated if not provided)
     * @returns Asset path (e.g., 'assets/ai-image-xxx.png') or null if failed
     */
    async saveImageAsAsset(base64Data: string, mimeType: string, fileName?: string): Promise<string | null> {
        try {
            // Generate a unique filename if not provided
            const ext = mimeType.split('/')[1] || 'png';
            const finalFileName = fileName || `ai-image-${Date.now()}.${ext}`;

            // Convert base64 to Blob
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: mimeType });

            // Create FormData for upload
            const formData = new FormData();
            formData.append('file[]', blob, finalFileName);
            // assetsDirPath not specified - will use default assets folder

            // Upload to SiYuan using /api/asset/upload
            const response = await fetch('/api/asset/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.code === 0 && result.data?.succMap) {
                // Return the asset path from succMap
                const assetPath = result.data.succMap[finalFileName];
                console.log(`[BlockOperations] Image saved to assets: ${assetPath}`);
                return assetPath;
            } else {
                throw new Error(result.msg || 'Upload failed');
            }
        } catch (error) {
            console.error('[BlockOperations] Failed to save image as asset:', error);
            return null;
        }
    }

    /**
     * Insert an image block after a specified block
     * @param assetPath Path to the asset (e.g., 'assets/image.png')
     * @param afterBlockId ID of the block to insert after
     * @param altText Optional alt text for the image
     * @returns Insert result with new block ID
     */
    async insertImageBlock(assetPath: string, afterBlockId: string, altText?: string): Promise<BlockInsertResult> {
        const markdown = `![${altText || 'AI Generated Image'}](${assetPath})`;
        return this.insertBlock(markdown, afterBlockId);
    }
}
