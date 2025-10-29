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
        compareBlock.setAttribute('unselectable', 'on'); // IE compatibility

        // Prevent text selection using CSS
        compareBlock.style.userSelect = 'none';
        compareBlock.style.webkitUserSelect = 'none';
        compareBlock.style.mozUserSelect = 'none';
        compareBlock.style.msUserSelect = 'none';

        // Build HTML structure - 移除所有多余空白和缩进
        compareBlock.innerHTML = `<div class="inline-edit-block__container"><div class="inline-edit-block__loading" style="display: ${block.state === 'processing' ? 'flex' : 'none'};"><div class="loading-spinner"></div><span>AI 思考中...</span></div>${options.showProgress ? `<div class="inline-edit-block__progress" style="display: none;"><span class="progress-text">已接收 <span class="progress-count">0</span> 字符</span></div>` : ''}${!options.hideOriginal ? `<div class="inline-edit-block__original" style="display: none;"><div class="block-label">原文（保留）</div><div class="block-content" data-content-type="original">${this.escapeHtml(block.originalText)}</div></div>` : ''}<div class="inline-edit-block__suggestion" style="display: none;"><div class="block-label">AI 建议</div><div class="block-content" data-content-type="suggestion"></div></div><div class="inline-edit-block__error" style="display: none;"><svg class="error-icon"><use xlink:href="#iconClose"></use></svg><span class="error-message"></span></div><div class="inline-edit-block__toolbar" style="display: none;"><div class="toolbar-actions"><button class="b3-button b3-button--outline toolbar-btn toolbar-btn--cancel" data-action="cancel" style="display: none;"><svg><use xlink:href="#iconClose"></use></svg><span>取消</span><span class="shortcut">Esc</span></button><button class="b3-button b3-button--outline toolbar-btn" data-action="reject"><svg><use xlink:href="#iconClose"></use></svg><span>拒绝</span><span class="shortcut">Esc</span></button><button class="b3-button b3-button--outline toolbar-btn" data-action="retry"><svg><use xlink:href="#iconRefresh"></use></svg><span>重试</span><span class="shortcut">Ctrl+R</span></button><button class="b3-button b3-button--outline toolbar-btn toolbar-btn--insert" data-action="insert"><svg><use xlink:href="#iconDown"></use></svg><span>插入到下方</span><span class="shortcut">Ctrl+I</span></button><button class="b3-button b3-button--text toolbar-btn toolbar-btn--primary" data-action="accept"><svg><use xlink:href="#iconCheck"></use></svg><span>接受替换</span><span class="shortcut">Tab</span></button></div></div></div>`;

        // Apply custom colors
        const originalBlock = compareBlock.querySelector('.inline-edit-block__original') as HTMLElement;
        const suggestionBlock = compareBlock.querySelector('.inline-edit-block__suggestion') as HTMLElement;

        if (originalBlock) {
            originalBlock.style.backgroundColor = options.colors.original;
        }
        if (suggestionBlock) {
            suggestionBlock.style.backgroundColor = options.colors.suggestion;
        }

        // FIX: Insert comparison block after the block's content
        // Find the last content element in the block (usually the paragraph text)
        const contentElement = containerElement.querySelector('[contenteditable="true"]') || containerElement;

        // Insert after the content element, before any IAL or other metadata
        if (contentElement.nextElementSibling) {
            containerElement.insertBefore(compareBlock, contentElement.nextElementSibling);
        } else {
            containerElement.appendChild(compareBlock);
        }

        // Prevent text selection on the comparison block
        compareBlock.addEventListener('selectstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });

        compareBlock.addEventListener('mousedown', (e) => {
            // Allow button clicks, but prevent text selection
            if ((e.target as HTMLElement).closest('button')) {
                return; // Allow button clicks
            }
            // Don't prevent default for buttons, but do for text selection
            const target = e.target as HTMLElement;
            if (!target.matches('button, button *, svg, svg *')) {
                e.preventDefault();
            }
        });

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

        // Show cancel button (allow user to cancel during streaming)
        this.showCancelButton(blockElement);
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

        if (!suggestionContent) {
            console.error('[InlineEditRenderer] Suggestion content element not found - chunk may be lost!');
            return;
        }

        // 智能处理第一个chunk：只移除开头的换行符，保留缩进（空格和制表符）
        const currentText = suggestionContent.textContent || '';
        const isFirstChunk = currentText.length === 0;

        // 只移除开头的换行符 \n 和 \r，保留空格和tab缩进
        let processedChunk = chunk;
        if (isFirstChunk) {
            processedChunk = chunk.replace(/^[\r\n]+/, '');
        }

        // Streaming完整性验证：记录每个chunk
        const blockId = blockElement.getAttribute('data-inline-edit-id');

        // CRITICAL FIX: 禁用打字动画以避免chunk丢失
        // 打字动画在streaming场景下会导致chunk冲突，因为新chunk到达时
        // 上一个chunk的动画可能还没完成，clearTimeout后剩余字符会丢失
        // Streaming本身已经有渐进显示的视觉效果，不需要额外的打字动画
        const useTypingAnimation = false; // 强制禁用，无论enableTyping设置如何

        if (useTypingAnimation && enableTyping) {
            // Typing animation (已禁用)
            this.typeText(suggestionContent, processedChunk, typingSpeed);
        } else {
            // Direct append - 唯一安全的方式
            const newText = currentText + processedChunk;
            suggestionContent.textContent = newText;

            // 验证文本确实被添加
            const verifyText = suggestionContent.textContent || '';
            if (verifyText.length !== newText.length) {
                console.error(`[InlineEditRenderer] Text length mismatch! Expected: ${newText.length}, Actual: ${verifyText.length}`);
                console.error(`[InlineEditRenderer] newText: "${newText}"`);
                console.error(`[InlineEditRenderer] verifyText: "${verifyText}"`);
            }
        }

        // Update progress
        this.updateProgress(blockElement, suggestionContent.textContent?.length || 0);
    }

    /**
     * Replace streaming content with filtered content
     * Used when response filter is applied after streaming completes
     */
    public replaceStreamingContent(
        blockElement: HTMLElement,
        newContent: string
    ): void {
        const suggestionContent = blockElement.querySelector(
            '[data-content-type="suggestion"]'
        ) as HTMLElement;

        if (!suggestionContent) {
            console.error('[InlineEditRenderer] Suggestion content element not found - cannot replace content!');
            return;
        }

        const oldLength = suggestionContent.textContent?.length || 0;
        
        // 清空并替换为新内容
        suggestionContent.textContent = newContent;
        
        const blockId = blockElement.getAttribute('data-inline-edit-id');
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

        // Show review buttons (hide cancel button)
        this.showReviewButtons(blockElement);
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
     * Show toolbar with cancel button (during processing/streaming)
     */
    public showCancelButton(blockElement: HTMLElement): void {
        const toolbar = blockElement.querySelector('.inline-edit-block__toolbar') as HTMLElement;
        const cancelBtn = blockElement.querySelector('[data-action="cancel"]') as HTMLElement;
        const otherBtns = blockElement.querySelectorAll('[data-action="reject"], [data-action="retry"], [data-action="insert"], [data-action="accept"]');

        if (toolbar) {
            toolbar.style.display = 'flex';
        }
        if (cancelBtn) {
            cancelBtn.style.display = 'inline-flex';
        }
        otherBtns.forEach((btn: HTMLElement) => {
            btn.style.display = 'none';
        });
    }

    /**
     * Show toolbar with review buttons (after completion), hide cancel button
     */
    public showReviewButtons(blockElement: HTMLElement): void {
        const toolbar = blockElement.querySelector('.inline-edit-block__toolbar') as HTMLElement;
        const cancelBtn = blockElement.querySelector('[data-action="cancel"]') as HTMLElement;
        const otherBtns = blockElement.querySelectorAll('[data-action="reject"], [data-action="retry"], [data-action="insert"], [data-action="accept"]');

        if (toolbar) {
            toolbar.style.display = 'flex';
        }
        if (cancelBtn) {
            cancelBtn.style.display = 'none';
        }
        otherBtns.forEach((btn: HTMLElement) => {
            btn.style.display = 'inline-flex';
        });
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
