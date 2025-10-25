/**
 * Inline Edit Renderer - Renders comparison blocks in the document
 */

import type {
    InlineEditBlock,
    InlineBlockRenderOptions,
    InlineEditState,
    LineDiff,
    StreamingChunkCallback
} from './inline-types';
import * as DiffMatchPatch from 'diff-match-patch';

export class InlineEditRenderer {
    private dmp: DiffMatchPatch.diff_match_patch;
    private typingTimers: Map<string, number> = new Map();

    constructor() {
        this.dmp = new DiffMatchPatch.diff_match_patch();
    }

    /**
     * Create and insert inline comparison block
     */
    public createComparisonBlock(
        block: InlineEditBlock,
        containerElement: HTMLElement,
        options: InlineBlockRenderOptions,
        insertAfterElement?: HTMLElement | null
    ): HTMLElement {
        const compareBlock = document.createElement('div');
        compareBlock.className = 'inline-edit-block';
        compareBlock.setAttribute('data-inline-edit-id', block.id);
        compareBlock.setAttribute('contenteditable', 'false');

        // Build HTML structure - 移除所有多余空白和缩进
        compareBlock.innerHTML = `<div class="inline-edit-block__container"><div class="inline-edit-block__loading" style="display: ${block.state === 'processing' ? 'flex' : 'none'};"><div class="loading-spinner"></div><span>AI 思考中...</span></div>${options.showProgress ? `<div class="inline-edit-block__progress" style="display: none;"><span class="progress-text">已接收 <span class="progress-count">0</span> 字符</span></div>` : ''}${!options.hideOriginal ? `<div class="inline-edit-block__original" style="display: none;"><div class="block-label">原文（删除）</div><div class="block-content" data-content-type="original">${this.escapeHtml(block.originalText)}</div></div>` : ''}<div class="inline-edit-block__suggestion" style="display: none;"><div class="block-label">AI 建议</div><div class="block-content" data-content-type="suggestion"></div></div><div class="inline-edit-block__error" style="display: none;"><svg class="error-icon"><use xlink:href="#iconClose"></use></svg><span class="error-message"></span></div><div class="inline-edit-block__toolbar" style="display: none;"><div class="toolbar-actions"><button class="b3-button b3-button--outline toolbar-btn" data-action="reject"><svg><use xlink:href="#iconClose"></use></svg><span>拒绝</span><span class="shortcut">Esc</span></button><button class="b3-button b3-button--outline toolbar-btn" data-action="retry"><svg><use xlink:href="#iconRefresh"></use></svg><span>重试</span><span class="shortcut">Ctrl+R</span></button><button class="b3-button b3-button--text toolbar-btn toolbar-btn--primary" data-action="accept"><svg><use xlink:href="#iconCheck"></use></svg><span>接受</span><span class="shortcut">Tab</span></button></div></div></div>`;

        // Apply custom colors
        const originalBlock = compareBlock.querySelector('.inline-edit-block__original') as HTMLElement;
        const suggestionBlock = compareBlock.querySelector('.inline-edit-block__suggestion') as HTMLElement;

        if (originalBlock) {
            originalBlock.style.backgroundColor = options.colors.original;
        }
        if (suggestionBlock) {
            suggestionBlock.style.backgroundColor = options.colors.suggestion;
        }

        // PHASE 4 FIX: Insert comparison block right after marked text
        if (insertAfterElement && insertAfterElement.parentNode) {
            // Insert as next sibling of the marked span
            console.log('[InlineEditRenderer] Inserting comparison block after marked span');
            console.log('[InlineEditRenderer] Marked span parent:', insertAfterElement.parentNode.nodeName);
            console.log('[InlineEditRenderer] Next sibling:', insertAfterElement.nextSibling);
            insertAfterElement.parentNode.insertBefore(compareBlock, insertAfterElement.nextSibling);
        } else {
            // Fallback: append to container
            console.log('[InlineEditRenderer] Fallback: appending to container');
            containerElement.appendChild(compareBlock);
        }

        return compareBlock;
    }

    /**
     * Show loading state
     */
    public showLoading(blockElement: HTMLElement): void {
        const loading = blockElement.querySelector('.inline-edit-block__loading') as HTMLElement;
        if (loading) {
            loading.style.display = 'flex';
        }
    }

    /**
     * Hide loading state and show comparison
     */
    public hideLoading(blockElement: HTMLElement): void {
        const loading = blockElement.querySelector('.inline-edit-block__loading') as HTMLElement;
        const original = blockElement.querySelector('.inline-edit-block__original') as HTMLElement;
        const suggestion = blockElement.querySelector('.inline-edit-block__suggestion') as HTMLElement;

        if (loading) {
            loading.style.display = 'none';
        }
        // Only show original if it exists (hideOriginal might be true)
        if (original) {
            original.style.display = 'block';
        }
        if (suggestion) {
            suggestion.style.display = 'block';
        }
    }

    /**
     * Start streaming AI suggestion
     */
    public startStreaming(blockElement: HTMLElement, enableTyping: boolean): void {
        this.hideLoading(blockElement);

        // Show progress if enabled
        const progress = blockElement.querySelector('.inline-edit-block__progress') as HTMLElement;
        if (progress) {
            progress.style.display = 'flex';
        }
    }

    /**
     * Append streaming chunk to suggestion
     */
    public appendStreamingChunk(
        blockElement: HTMLElement,
        chunk: string,
        enableTyping: boolean,
        typingSpeed: number = 20
    ): void {
        const suggestionContent = blockElement.querySelector(
            '[data-content-type="suggestion"]'
        ) as HTMLElement;

        if (!suggestionContent) return;

        // 修复空行问题：如果是第一次添加内容，trim开头的空白
        const currentText = suggestionContent.textContent || '';
        const isFirstChunk = currentText.length === 0;
        const processedChunk = isFirstChunk ? chunk.trimStart() : chunk;

        if (enableTyping) {
            // Typing animation
            this.typeText(suggestionContent, processedChunk, typingSpeed);
        } else {
            // Direct append
            suggestionContent.textContent = currentText + processedChunk;
        }

        // Update progress
        this.updateProgress(blockElement, suggestionContent.textContent?.length || 0);
    }

    /**
     * Complete streaming and show toolbar
     */
    public completeStreaming(blockElement: HTMLElement): void {
        // Hide progress
        const progress = blockElement.querySelector('.inline-edit-block__progress') as HTMLElement;
        if (progress) {
            progress.style.display = 'none';
        }

        // Show toolbar
        this.showToolbar(blockElement);
    }

    /**
     * Show action toolbar
     */
    public showToolbar(blockElement: HTMLElement): void {
        const toolbar = blockElement.querySelector('.inline-edit-block__toolbar') as HTMLElement;
        if (toolbar) {
            toolbar.style.display = 'flex';
        }
    }

    /**
     * Hide action toolbar
     */
    public hideToolbar(blockElement: HTMLElement): void {
        const toolbar = blockElement.querySelector('.inline-edit-block__toolbar') as HTMLElement;
        if (toolbar) {
            toolbar.style.display = 'none';
        }
    }

    /**
     * Show error message
     */
    public showError(blockElement: HTMLElement, errorMessage: string): void {
        const loading = blockElement.querySelector('.inline-edit-block__loading') as HTMLElement;
        const errorBlock = blockElement.querySelector('.inline-edit-block__error') as HTMLElement;
        const errorMsg = blockElement.querySelector('.error-message') as HTMLElement;

        if (loading) {
            loading.style.display = 'none';
        }

        if (errorBlock && errorMsg) {
            errorMsg.textContent = errorMessage;
            errorBlock.style.display = 'flex';
        }
    }

    /**
     * Remove comparison block from DOM
     */
    public removeBlock(blockElement: HTMLElement): void {
        blockElement.remove();
    }

    /**
     * Lock editing in block
     */
    public lockBlock(blockElement: HTMLElement): void {
        blockElement.setAttribute('contenteditable', 'false');
        blockElement.style.pointerEvents = 'none';
        blockElement.style.opacity = '0.7';
    }

    /**
     * Unlock editing in block
     */
    public unlockBlock(blockElement: HTMLElement): void {
        blockElement.removeAttribute('contenteditable');
        blockElement.style.pointerEvents = 'auto';
        blockElement.style.opacity = '1';
    }

    /**
     * Update progress indicator
     */
    private updateProgress(blockElement: HTMLElement, characterCount: number): void {
        const progressCount = blockElement.querySelector('.progress-count') as HTMLElement;
        if (progressCount) {
            progressCount.textContent = characterCount.toString();
        }
    }

    /**
     * Typing animation effect
     */
    private typeText(element: HTMLElement, text: string, speed: number): void {
        const blockId = element.closest('[data-inline-edit-id]')?.getAttribute('data-inline-edit-id');
        if (!blockId) return;

        // Clear existing timer
        const existingTimer = this.typingTimers.get(blockId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Add text character by character
        let currentIndex = 0;
        const currentText = element.textContent || '';

        const type = () => {
            if (currentIndex < text.length) {
                element.textContent = currentText + text.substring(0, currentIndex + 1);
                currentIndex++;

                const timer = window.setTimeout(type, speed);
                this.typingTimers.set(blockId, timer);
            } else {
                this.typingTimers.delete(blockId);
            }
        };

        type();
    }

    /**
     * Compute line-by-line diff
     */
    public computeLineDiff(original: string, suggested: string): LineDiff[] {
        const originalLines = original.split('\n');
        const suggestedLines = suggested.split('\n');

        const diffs = this.dmp.diff_main(original, suggested);
        this.dmp.diff_cleanupSemantic(diffs);

        // Map diffs to lines (simplified version)
        const lineDiffs: LineDiff[] = [];
        const maxLines = Math.max(originalLines.length, suggestedLines.length);

        for (let i = 0; i < maxLines; i++) {
            const origLine = originalLines[i] || '';
            const suggLine = suggestedLines[i] || '';

            let type: LineDiff['type'] = 'equal';
            if (i >= originalLines.length) {
                type = 'insert';
            } else if (i >= suggestedLines.length) {
                type = 'delete';
            } else if (origLine !== suggLine) {
                type = 'modify';
            }

            lineDiffs.push({
                lineNumber: i,
                original: origLine,
                suggested: suggLine,
                type,
                accepted: null
            });
        }

        return lineDiffs;
    }

    /**
     * Escape HTML for safe rendering
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Cleanup timers
     */
    public cleanup(): void {
        this.typingTimers.forEach(timer => clearTimeout(timer));
        this.typingTimers.clear();
    }
}
