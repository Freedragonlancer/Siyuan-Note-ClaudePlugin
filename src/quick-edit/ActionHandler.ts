/**
 * Action Handler
 * Handles Quick Edit user actions: accept, reject, insert, retry, cancel
 *
 * Created v0.18.0: Extracted from QuickEditManager
 */

import { showMessage } from 'siyuan';
import type { InlineEditBlock, InlineEditState } from './inline-types';
import type { InlineEditRenderer } from './InlineEditRenderer';
import type { BlockOperations } from './BlockOperations';
import type { EditHistory } from '@/editor/EditHistory';
import type { ClaudeClient } from '@/claude';

/**
 * Dependencies required by ActionHandler
 */
export interface ActionHandlerDependencies {
    /** Renderer for inline edit blocks */
    renderer: InlineEditRenderer;
    /** Block operations for SiYuan API calls */
    blockOps: BlockOperations;
    /** Edit history for undo support */
    history: EditHistory;
    /** Claude client for cancelling requests */
    claudeClient: ClaudeClient;
    /** Get active block by ID */
    getActiveBlock: (blockId: string) => InlineEditBlock | undefined;
    /** Remove active block */
    removeActiveBlock: (blockId: string) => void;
    /** Get keyboard handler for cleanup */
    getKeyboardHandler: (blockId: string) => ((e: KeyboardEvent) => void) | undefined;
    /** Remove keyboard handler */
    removeKeyboardHandler: (blockId: string) => void;
    /** Get active request block ID */
    getActiveRequestBlockId: () => string | null;
    /** Clear active request block ID */
    clearActiveRequestBlockId: () => void;
    /** Set processing flag */
    setProcessing: (processing: boolean) => void;
    /** Pause mutation observer */
    pauseObserver: () => void;
    /** Resume mutation observer */
    resumeObserver: () => void;
    /** Retry callback - re-process the edit */
    onRetry: (block: InlineEditBlock) => Promise<void>;
}

/**
 * Action Handler
 * Processes user actions on Quick Edit blocks
 */
export class ActionHandler {
    private deps: ActionHandlerDependencies;

    constructor(dependencies: ActionHandlerDependencies) {
        this.deps = dependencies;
    }

    /**
     * Cancel the active AI request
     */
    cancelActiveRequest(): void {
        const blockId = this.deps.getActiveRequestBlockId();
        if (!blockId) {
            return;
        }

        const block = this.deps.getActiveBlock(blockId);

        // Cancel ClaudeClient network request
        this.deps.claudeClient.cancelActiveRequest();

        // Cleanup UI using reject logic
        if (block) {
            this.handleReject(blockId);
        }

        // Clear flags
        this.deps.setProcessing(false);
        this.deps.clearActiveRequestBlockId();

        showMessage('⚠️ 已取消快速编辑', 2000, 'info');
    }

    /**
     * Handle accept - Apply AI changes and delete original blocks
     */
    async handleAccept(blockId: string): Promise<void> {
        const block = this.deps.getActiveBlock(blockId);
        if (!block || !block.element) return;

        try {
            // Use indented text if available (preserves indentation shown in preview)
            let textToApply = block.suggestedTextWithIndent || block.suggestedText;

            // Apply Markdown formatting for single-block selections
            const isSingleBlock = !block.selectedBlockIds || block.selectedBlockIds.length === 1;
            if (isSingleBlock && block.originalBlockType) {
                textToApply = this.applyMarkdownFormatting(
                    textToApply,
                    block.originalBlockType,
                    block.originalBlockSubtype
                );
            }

            // Split AI-generated content into paragraphs
            const paragraphs = this.splitIntoParagraphs(textToApply);

            // Step 1: Insert ALL paragraphs as new blocks after the last selected block
            const lastOriginalBlockId = block.selectedBlockIds?.[block.selectedBlockIds.length - 1] || block.blockId;

            // Use BlockOperations for batch insert (auto-detects best method)
            const insertionResults = await this.deps.blockOps.insertMultipleBlocks(paragraphs, lastOriginalBlockId);

            // Report results with detailed feedback
            const successCount = insertionResults.filter(r => r.success).length;
            const failureCount = insertionResults.filter(r => !r.success).length;

            if (failureCount > 0) {
                console.warn(`[ActionHandler] ⚠️ Partial success: ${successCount}/${paragraphs.length} paragraphs inserted`);
                showMessage(`⚠️ 部分插入成功 (${successCount}/${paragraphs.length})`, 5000, 'error');
            }

            // Step 2: Wait for SiYuan to render all new content
            // Adaptive delay based on block count (100ms base + 2ms per block, max 1s)
            const renderDelay = Math.min(100 + (paragraphs.length * 2), 1000);
            await new Promise(resolve => setTimeout(resolve, renderDelay));

            // Step 3: Pause observer before UI cleanup
            this.deps.pauseObserver();

            // Step 4: Remove comparison block BEFORE deleting original blocks
            if (block.element && document.contains(block.element)) {
                try {
                    this.deps.renderer.removeBlock(block.element);
                } catch (error) {
                    console.warn('[ActionHandler] Failed to remove comparison block:', error);
                }
            }

            // Step 5: Remove red marking from original blocks
            this.removeBlockMarking(block.selectedBlockIds);

            // Step 6: Delete ALL originally selected blocks
            if (block.selectedBlockIds && block.selectedBlockIds.length > 0) {
                const results = await this.deps.blockOps.deleteMultipleBlocks(block.selectedBlockIds);
                const failed = results.filter(r => !r.success);

                if (failed.length > 0) {
                    console.error(`[ActionHandler] Failed to delete ${failed.length}/${results.length} blocks:`, failed);
                    showMessage(`部分块删除失败 (${failed.length}/${results.length})`, 5000, 'error');
                }
            }

            // Step 7: Wait for SiYuan to complete all async operations
            const deleteCount = block.selectedBlockIds?.length || 0;
            const deleteDelay = Math.min(200 + (deleteCount * 2), 1000);
            await new Promise(resolve => setTimeout(resolve, deleteDelay));

            // Clear marked span reference
            block.markedSpan = null;

            // Resume observer after cleanup
            this.deps.resumeObserver();

            // Step 8: Add to plugin history (separate from SiYuan undo)
            this.deps.history.addToHistory({
                selection: {
                    id: block.id,
                    blockId: block.blockId,
                    startLine: 0,
                    endLine: 0,
                    selectedText: block.originalText,
                    contextBefore: '',
                    contextAfter: '',
                    timestamp: block.createdAt,
                    status: 'completed'
                },
                originalContent: block.originalText,
                modifiedContent: block.suggestedText,
                blockId: block.blockId,
                applied: true
            });

            // Step 9: Final cleanup
            this.cleanupBlock(blockId);

            showMessage('✅ 修改已应用（支持撤销）', 2000);

        } catch (error) {
            // FIX: Ensure observer is resumed even on error
            this.deps.resumeObserver();

            // FIX: Clean up block state on error to prevent UI inconsistency
            this.removeBlockMarking(block.selectedBlockIds);
            if (block.element && document.contains(block.element)) {
                try {
                    this.deps.renderer.removeBlock(block.element);
                } catch (removeError) {
                    console.warn('[ActionHandler] Failed to remove comparison block on error:', removeError);
                }
            }
            this.cleanupBlock(blockId);

            console.error('[ActionHandler] Failed to apply changes:', error);
            showMessage(
                `应用修改失败: ${error instanceof Error ? error.message : String(error)}`,
                5000,
                'error'
            );
        }
    }

    /**
     * Handle insert - Insert AI content below original WITHOUT deleting original
     */
    async handleInsert(blockId: string): Promise<void> {
        const block = this.deps.getActiveBlock(blockId);
        if (!block || !block.element) return;

        try {
            // Use indented text if available
            let textToApply = block.suggestedTextWithIndent || block.suggestedText;

            // Apply Markdown formatting for single-block selections
            const isSingleBlock = !block.selectedBlockIds || block.selectedBlockIds.length === 1;
            if (isSingleBlock && block.originalBlockType) {
                textToApply = this.applyMarkdownFormatting(
                    textToApply,
                    block.originalBlockType,
                    block.originalBlockSubtype
                );
            }

            // Split content into paragraphs
            const paragraphs = this.splitIntoParagraphs(textToApply);

            // Insert all paragraphs after the last selected block
            const lastOriginalBlockId = block.selectedBlockIds?.[block.selectedBlockIds.length - 1] || block.blockId;

            // Use BlockOperations for batch insert
            const insertionResults = await this.deps.blockOps.insertMultipleBlocks(paragraphs, lastOriginalBlockId);

            // Report results
            const successCount = insertionResults.filter(r => r.success).length;
            const failureCount = insertionResults.filter(r => !r.success).length;

            if (failureCount > 0) {
                console.warn(`[ActionHandler] ⚠️ Partial success: ${successCount}/${paragraphs.length} paragraphs inserted`);
                showMessage(`⚠️ 部分插入成功 (${successCount}/${paragraphs.length})`, 5000, 'error');
            }

            // Wait for SiYuan to render
            const renderDelay = Math.min(100 + (paragraphs.length * 2), 1000);
            await new Promise(resolve => setTimeout(resolve, renderDelay));

            // Pause observer before UI cleanup
            this.deps.pauseObserver();

            // Remove comparison block
            if (block.element && document.contains(block.element)) {
                try {
                    this.deps.renderer.removeBlock(block.element);
                } catch (error) {
                    console.warn('[ActionHandler] Failed to remove comparison block:', error);
                }
            }

            // Remove red marking from original blocks
            this.removeBlockMarking(block.selectedBlockIds);

            // KEY DIFFERENCE: Do NOT delete original blocks in INSERT mode

            // Wait for SiYuan to complete operations
            const completeDelay = Math.min(200 + (paragraphs.length * 2), 1000);
            await new Promise(resolve => setTimeout(resolve, completeDelay));

            block.markedSpan = null;

            // Resume observer
            this.deps.resumeObserver();

            // Add to history
            this.deps.history.addToHistory({
                selection: {
                    id: block.id,
                    blockId: block.blockId,
                    startLine: 0,
                    endLine: 0,
                    selectedText: block.originalText,
                    contextBefore: '',
                    contextAfter: '',
                    timestamp: block.createdAt,
                    status: 'completed'
                },
                originalContent: block.originalText,
                modifiedContent: block.suggestedText,
                blockId: block.blockId,
                applied: true
            });

            // Final cleanup
            this.cleanupBlock(blockId);

            showMessage('✅ AI 内容已插入到下方（原文保留）', 2000);

        } catch (error) {
            // FIX: Ensure observer is resumed even on error
            this.deps.resumeObserver();

            // FIX: Clean up block state on error to prevent UI inconsistency
            this.removeBlockMarking(block.selectedBlockIds);
            if (block.element && document.contains(block.element)) {
                try {
                    this.deps.renderer.removeBlock(block.element);
                } catch (removeError) {
                    console.warn('[ActionHandler] Failed to remove comparison block on error:', removeError);
                }
            }
            this.cleanupBlock(blockId);

            console.error('[ActionHandler] Failed to insert content:', error);
            showMessage(
                `插入失败: ${error instanceof Error ? error.message : String(error)}`,
                5000,
                'error'
            );
        }
    }

    /**
     * Handle reject - Discard AI changes and restore original
     */
    handleReject(blockId: string): void {
        const block = this.deps.getActiveBlock(blockId);
        if (!block || !block.element) return;

        // Remove red marking from original blocks
        this.removeBlockMarking(block.selectedBlockIds);

        // Clear marked span reference
        block.markedSpan = null;

        // Remove comparison block
        this.deps.renderer.removeBlock(block.element);
        this.cleanupBlock(blockId);

        showMessage('已取消修改', 2000);
    }

    /**
     * Handle retry - Re-process the edit with same instruction
     */
    async handleRetry(blockId: string): Promise<void> {
        const block = this.deps.getActiveBlock(blockId);
        if (!block || !block.element) return;

        // Reset block state
        block.suggestedText = '';
        block.state = 'processing' as InlineEditState;

        // Clear suggestion content
        const suggestionContent = block.element.querySelector('[data-content-type="suggestion"]') as HTMLElement;
        if (suggestionContent) {
            suggestionContent.textContent = '';
        }

        // Restart processing via callback
        await this.deps.onRetry(block);
    }

    /**
     * Cleanup a block - remove keyboard handler and active block entry
     */
    private cleanupBlock(blockId: string): void {
        // Remove keyboard handler
        const handler = this.deps.getKeyboardHandler(blockId);
        if (handler) {
            document.removeEventListener('keydown', handler);
            this.deps.removeKeyboardHandler(blockId);
        }

        // Remove from active blocks
        this.deps.removeActiveBlock(blockId);
    }

    /**
     * Split text into paragraphs for SiYuan blocks
     * In SiYuan, \n\n separates different blocks (paragraphs)
     */
    private splitIntoParagraphs(text: string): string[] {
        return text
            .split(/(?:\r?\n){2,}/)  // Split by 2+ line breaks (supports \n\n and \r\n\r\n)
            .map(p => p.trim())
            .filter(p => p.length > 0);
    }

    /**
     * Remove red marking from original blocks
     */
    private removeBlockMarking(blockIds: string[] | undefined): void {
        if (blockIds && blockIds.length > 0) {
            const selector = blockIds.map(id => `[data-node-id="${id}"]`).join(',');
            const blockElements = document.querySelectorAll(selector);
            blockElements.forEach(el => el.classList.remove('quick-edit-original-block'));
        }
    }

    /**
     * Apply Markdown formatting based on block type
     * Preserves original block formatting when possible
     */
    private applyMarkdownFormatting(text: string, blockType?: string, blockSubtype?: string): string {
        if (!blockType || !blockSubtype) {
            return text; // No type info, return as-is
        }

        // Handle headings (h1-h6)
        if (blockType === 'h' && blockSubtype) {
            const headingLevel = blockSubtype; // "h1", "h2", etc.
            const level = parseInt(headingLevel.substring(1)); // Extract number

            if (level >= 1 && level <= 6) {
                const prefix = '#'.repeat(level);
                // For headings, only format the first line (headings should be single-line)
                const firstLine = text.split('\n')[0];
                const restLines = text.split('\n').slice(1);

                if (restLines.length > 0) {
                    // Multi-line content: format first line as heading, rest as paragraphs
                    return `${prefix} ${firstLine}\n\n${restLines.join('\n')}`;
                } else {
                    // Single line: format as heading
                    return `${prefix} ${firstLine}`;
                }
            }
        }

        // Handle list items
        if (blockType === 'l') {
            // Lists are complex - for now, return as-is and let SiYuan handle it
            return text;
        }

        // Handle code blocks
        if (blockType === 'c') {
            // Wrap in code fence
            return `\`\`\`\n${text}\n\`\`\``;
        }

        // Handle quotes
        if (blockType === 'b') {
            // Add quote markers
            return text.split('\n').map(line => `> ${line}`).join('\n');
        }

        // For all other types (paragraphs, etc.), return as-is
        return text;
    }
}
