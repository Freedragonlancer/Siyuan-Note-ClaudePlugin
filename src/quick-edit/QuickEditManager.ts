/**
 * Quick Edit Manager - Manages inline edit workflow (REFACTORED)
 * Now supports in-document real-time comparison editing
 */

import type { Plugin } from 'siyuan';
import { showMessage } from 'siyuan';
import type { EditSettings } from '@/editor/types';
import type {
    InlineEditBlock,
    InlineEditSelection,
    InlineEditState,
    InlineBlockRenderOptions
} from './inline-types';
import { InlineEditRenderer } from './InlineEditRenderer';
import { InstructionInputPopup } from './InstructionInputPopup';
import { AIEditProcessor } from '@/editor/AIEditProcessor';
import { EditHistory } from '@/editor/EditHistory';
import { ClaudeClient } from '@/claude';

export class QuickEditManager {
    private plugin: Plugin;
    private claudeClient: ClaudeClient;
    private history: EditHistory;
    private settings: EditSettings;

    // Inline edit components
    private renderer: InlineEditRenderer;
    private inputPopup: InstructionInputPopup;
    private processor: AIEditProcessor;

    // Active inline edits
    private activeBlocks: Map<string, InlineEditBlock> = new Map();

    // FIX 1.1: Store keyboard handlers for cleanup
    private keyboardHandlers: Map<string, (e: KeyboardEvent) => void> = new Map();

    // FIX 1.2: Replace global window state with instance property
    private pendingSelection: InlineEditSelection | null = null;

    // FIX 1.5: MutationObserver to detect when blocks are removed by SiYuan undo/redo
    private mutationObserver: MutationObserver | null = null;
    private observedContainers: Set<HTMLElement> = new Set();

    constructor(
        plugin: Plugin,
        claudeClient: ClaudeClient,
        history: EditHistory,
        editSettings: EditSettings
    ) {
        this.plugin = plugin;
        this.claudeClient = claudeClient;
        this.history = history;
        this.settings = editSettings;

        // Initialize components
        this.renderer = new InlineEditRenderer();
        this.inputPopup = new InstructionInputPopup(editSettings.customInstructions);
        this.processor = new AIEditProcessor(claudeClient);

        // Setup popup callbacks
        this.inputPopup.setCallbacks({
            onSubmit: (instruction) => this.handleInstructionSubmit(instruction),
            onCancel: () => {
                console.log('[QuickEdit] Instruction input cancelled');
                // FIX 1.2: Clear pending selection on cancel
                this.pendingSelection = null;
            }
        });

        // FIX 1.5: Setup MutationObserver to detect DOM changes
        this.setupDOMObserver();
    }

    /**
     * FIX 1.5: Setup MutationObserver to detect when comparison blocks are removed
     */
    private setupDOMObserver(): void {
        this.mutationObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                // Check for removed nodes
                mutation.removedNodes.forEach((removedNode) => {
                    if (removedNode.nodeType === Node.ELEMENT_NODE) {
                        const removedElement = removedNode as HTMLElement;

                        // Check if the removed node is one of our comparison blocks
                        const blockId = removedElement.getAttribute('data-inline-edit-id');
                        if (blockId && this.activeBlocks.has(blockId)) {
                            console.warn(`[QuickEdit] Comparison block ${blockId} was removed from DOM (likely by SiYuan undo/redo)`);
                            this.handleBlockRemovedByExternal(blockId);
                        }

                        // Also check if any of our comparison blocks are children of the removed node
                        const nestedBlocks = removedElement.querySelectorAll('[data-inline-edit-id]');
                        nestedBlocks.forEach((nestedBlock) => {
                            const nestedBlockId = nestedBlock.getAttribute('data-inline-edit-id');
                            if (nestedBlockId && this.activeBlocks.has(nestedBlockId)) {
                                console.warn(`[QuickEdit] Nested comparison block ${nestedBlockId} was removed (parent removed)`);
                                this.handleBlockRemovedByExternal(nestedBlockId);
                            }
                        });
                    }
                });
            });
        });

        console.log('[QuickEdit] MutationObserver initialized');
    }

    /**
     * FIX 1.5: Start observing a container for DOM changes
     */
    private observeContainer(container: HTMLElement): void {
        if (!this.mutationObserver || this.observedContainers.has(container)) {
            return;
        }

        // Find the nearest stable parent (protyle content or block parent)
        let observeTarget: HTMLElement | null = container;

        // Try to find the protyle content container (more stable)
        while (observeTarget && !observeTarget.classList.contains('protyle-content')) {
            observeTarget = observeTarget.parentElement;
        }

        // If not found, use the block's parent
        if (!observeTarget) {
            observeTarget = container.parentElement;
        }

        if (observeTarget) {
            this.mutationObserver.observe(observeTarget, {
                childList: true,
                subtree: true
            });

            this.observedContainers.add(observeTarget);
            console.log('[QuickEdit] Started observing container for DOM changes');
        }
    }

    /**
     * FIX 1.5: Handle when a comparison block is removed externally (e.g., by SiYuan undo)
     */
    private handleBlockRemovedByExternal(blockId: string): void {
        const block = this.activeBlocks.get(blockId);
        if (!block) return;

        console.log('[QuickEdit] Cleaning up externally removed block:', blockId);

        // PHASE 4: Also clean up marked text if it exists
        if (block.markedSpan && block.markedSpan.parentNode) {
            this.unmarkOriginalText(block.markedSpan);
        }

        // Clean up event listeners and references
        this.cleanupBlock(blockId);

        // Optionally notify user
        showMessage('⚠️ AI 编辑已被撤销操作移除', 2000, 'info');
    }

    /**
     * PHASE 4: Mark original text with span for Cursor-style inline diff
     */
    private markOriginalText(range: Range, blockId: string): HTMLSpanElement {
        try {
            // Create marked span
            const span = document.createElement('span');
            span.className = 'inline-edit-marked-text';
            span.setAttribute('data-inline-edit-id', blockId);
            span.setAttribute('contenteditable', 'false');

            // Surround the selection with the span
            range.surroundContents(span);

            console.log('[QuickEdit] Marked original text with span');
            return span;
        } catch (error) {
            // surroundContents can fail if the range partially selects a non-Text node
            console.warn('[QuickEdit] surroundContents failed, using fallback method');

            // Fallback: extract contents and wrap them
            const span = document.createElement('span');
            span.className = 'inline-edit-marked-text';
            span.setAttribute('data-inline-edit-id', blockId);
            span.setAttribute('contenteditable', 'false');

            const fragment = range.extractContents();
            span.appendChild(fragment);
            range.insertNode(span);

            return span;
        }
    }

    /**
     * PHASE 4: Remove marked text span and restore original
     */
    private unmarkOriginalText(span: HTMLSpanElement): void {
        if (!span || !span.parentNode) return;

        try {
            const parent = span.parentNode;

            // Create a document fragment to hold the child nodes
            const fragment = document.createDocumentFragment();

            // Move all child nodes into the fragment
            while (span.firstChild) {
                fragment.appendChild(span.firstChild);
            }

            // Replace the span with the fragment
            parent.replaceChild(fragment, span);

            // Normalize the parent to merge adjacent text nodes
            if (parent.normalize) {
                parent.normalize();
            }

            console.log('[QuickEdit] Unmarked original text and normalized DOM');
        } catch (error) {
            console.error('[QuickEdit] Failed to unmark text:', error);
        }
    }

    /**
     * PHASE 4: Replace marked text with new content
     */
    private replaceMarkedText(span: HTMLSpanElement, newText: string): void {
        if (!span || !span.parentNode) return;

        try {
            // Create text node with new content
            const textNode = document.createTextNode(newText);

            // Replace span with new text
            span.parentNode.replaceChild(textNode, span);

            console.log('[QuickEdit] Replaced marked text with AI suggestion');
        } catch (error) {
            console.error('[QuickEdit] Failed to replace marked text:', error);
        }
    }

    /**
     * Trigger inline edit
     */
    public trigger(): void {
        if (!this.settings.quickEditEnabled) {
            console.warn('[QuickEdit] Inline edit is disabled');
            return;
        }

        // Get selection
        const selection = this.getSelection();
        if (!selection) {
            showMessage('请先选中要编辑的文本', 3000);
            return;
        }

        // FIX 1.2: Store selection in instance property instead of window
        this.pendingSelection = selection;

        // Show instruction input popup
        const rect = selection.range.getBoundingClientRect();
        const position = {
            x: rect.left,
            y: rect.bottom + 10,
            placement: 'below' as const
        };

        this.inputPopup.show(position, this.settings.quickEditDefaultInstruction);
    }

    /**
     * Handle instruction submit
     */
    private async handleInstructionSubmit(instruction: string): Promise<void> {
        // FIX 1.2: Use instance property instead of window
        const selection = this.pendingSelection;
        if (!selection) {
            console.error('[QuickEdit] No selection found');
            return;
        }

        // Clear immediately to prevent reuse
        this.pendingSelection = null;

        // Create inline edit block
        const blockId = `inline-edit-${Date.now()}`;
        const inlineBlock: InlineEditBlock = {
            id: blockId,
            blockId: selection.blockId,
            originalText: selection.text,
            suggestedText: '',
            instruction,
            state: 'processing' as InlineEditState,
            element: null,
            position: {
                startOffset: selection.startOffset,
                endOffset: selection.endOffset
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            locked: true,
            // PHASE 4: Store range for text marking
            originalRange: selection.range.cloneRange()
        };

        this.activeBlocks.set(blockId, inlineBlock);

        // PHASE 4: Mark the original text in document
        let markedSpan: HTMLSpanElement | null = null;
        try {
            markedSpan = this.markOriginalText(selection.range, blockId);
            inlineBlock.markedSpan = markedSpan;
        } catch (error) {
            console.warn('[QuickEdit] Failed to mark original text:', error);
            // Continue anyway, just without visual marking
        }

        // Render comparison block in document
        const renderOptions: InlineBlockRenderOptions = {
            showLineByLineAccept: false,
            showProgress: this.settings.quickEditShowProgressIndicator !== false,
            enableTypingAnimation: this.settings.quickEditEnableTypingAnimation !== false,
            hideOriginal: true, // Cursor-style: only show AI suggestion, not duplicate original
            colors: {
                original: this.settings.quickEditOriginalTextColor || 'rgba(239, 68, 68, 0.1)',
                suggestion: this.settings.quickEditSuggestionTextColor || 'rgba(34, 197, 94, 0.1)'
            }
        };

        // PHASE 4 FIX: Insert comparison block right after marked text
        const insertContainer = markedSpan ? markedSpan.parentElement : selection.blockElement;
        const blockElement = this.renderer.createComparisonBlock(
            inlineBlock,
            insertContainer!,
            renderOptions,
            markedSpan  // Pass marked span to insert after it
        );

        inlineBlock.element = blockElement;

        // FIX 1.5: Start observing the container for DOM changes
        this.observeContainer(selection.blockElement);

        // Bind action buttons
        this.bindActionButtons(blockElement, blockId);

        // Start AI processing
        await this.processInlineEdit(inlineBlock);
    }

    /**
     * Process inline edit with AI
     */
    private async processInlineEdit(block: InlineEditBlock): Promise<void> {
        if (!block.element) return;

        try {
            this.renderer.showLoading(block.element);

            // Create TextSelection for processor
            const textSelection = {
                id: block.id,
                blockId: block.blockId,
                startLine: 0,
                endLine: 0,
                selectedText: block.originalText,
                contextBefore: '',
                contextAfter: '',
                timestamp: block.createdAt,
                status: 'processing' as const,
                customInstruction: block.instruction
            };

            // Call AI with streaming
            this.renderer.startStreaming(
                block.element,
                this.settings.quickEditEnableTypingAnimation !== false
            );

            block.state = 'streaming' as InlineEditState;

            // Use streaming API
            let fullResponse = '';
            await this.claudeClient.sendMessage(
                [{ role: 'user', content: block.instruction + '\n\n' + block.originalText }],
                // onMessage callback
                (chunk) => {
                    fullResponse += chunk;
                    block.suggestedText = fullResponse;

                    if (block.element) {
                        this.renderer.appendStreamingChunk(
                            block.element,
                            chunk,
                            this.settings.quickEditEnableTypingAnimation !== false,
                            20
                        );
                    }
                },
                // onError callback
                (error) => {
                    block.state = 'error' as InlineEditState;
                    block.error = error.message;

                    if (block.element) {
                        this.renderer.showError(block.element, error.message);
                    }

                    console.error('[QuickEdit] Error:', error);
                },
                // onComplete callback
                () => {
                    block.state = 'reviewing' as InlineEditState;
                    block.updatedAt = Date.now();

                    if (block.element) {
                        this.renderer.completeStreaming(block.element);
                    }

                    console.log('[QuickEdit] Streaming complete');
                }
            );

        } catch (error) {
            block.state = 'error' as InlineEditState;
            block.error = error instanceof Error ? error.message : String(error);

            if (block.element) {
                this.renderer.showError(block.element, block.error);
            }

            console.error('[QuickEdit] Processing error:', error);
        }
    }

    /**
     * Bind action buttons
     */
    private bindActionButtons(blockElement: HTMLElement, blockId: string): void {
        const buttons = blockElement.querySelectorAll('[data-action]');

        buttons.forEach(button => {
            button.addEventListener('click', (e) => {
                const action = (e.currentTarget as HTMLElement).getAttribute('data-action');
                if (action === 'accept') {
                    this.handleAccept(blockId);
                } else if (action === 'reject') {
                    this.handleReject(blockId);
                } else if (action === 'retry') {
                    this.handleRetry(blockId);
                }
            });
        });

        // FIX 1.1: Store keyboard handler for cleanup
        const keyHandler = (e: KeyboardEvent) => {
            // Only handle if this block is still active
            if (!this.activeBlocks.has(blockId)) return;

            // Only handle if block element or descendants have focus
            const block = this.activeBlocks.get(blockId);
            if (!block?.element || !block.element.contains(document.activeElement as Node)) {
                return; // Don't interfere with other elements
            }

            if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault();
                this.handleAccept(blockId);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.handleReject(blockId);
            } else if (e.key === 'r' && e.ctrlKey) {
                e.preventDefault();
                this.handleRetry(blockId);
            }
        };

        this.keyboardHandlers.set(blockId, keyHandler);
        document.addEventListener('keydown', keyHandler);
    }

    /**
     * FIX 1.1: Clean up block and its event listeners
     */
    private cleanupBlock(blockId: string): void {
        // Remove keyboard handler
        const handler = this.keyboardHandlers.get(blockId);
        if (handler) {
            document.removeEventListener('keydown', handler);
            this.keyboardHandlers.delete(blockId);
        }

        // Remove from active blocks
        this.activeBlocks.delete(blockId);
    }

    /**
     * Handle accept
     * FIX 1.3: Implement real block update via SiYuan Kernel API
     * PHASE 4: Also handle marked text replacement
     */
    private async handleAccept(blockId: string): Promise<void> {
        const block = this.activeBlocks.get(blockId);
        if (!block || !block.element) return;

        try {
            console.log('[QuickEdit] Applying changes to block:', block.blockId);

            // PHASE 4: If we have marked text, replace it directly (faster, more Cursor-like)
            if (block.markedSpan && block.markedSpan.parentNode) {
                this.replaceMarkedText(block.markedSpan, block.suggestedText);
                block.markedSpan = null; // Clear reference
            }

            // Update SiYuan block via Kernel API
            const response = await fetch('/api/block/updateBlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: block.blockId,
                    data: block.suggestedText,
                    dataType: 'markdown'
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.msg || 'Failed to update block');
            }

            console.log('[QuickEdit] Block updated successfully');

            // Add to history
            this.history.addToHistory({
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

            // Clean up
            this.renderer.removeBlock(block.element);
            this.cleanupBlock(blockId);

            showMessage('✅ 修改已应用', 2000);

        } catch (error) {
            console.error('[QuickEdit] Failed to apply changes:', error);
            showMessage(
                `应用修改失败: ${error instanceof Error ? error.message : String(error)}`,
                5000,
                'error'
            );
        }
    }

    /**
     * Handle reject
     * PHASE 4: Also handle marked text restoration
     */
    private handleReject(blockId: string): void {
        const block = this.activeBlocks.get(blockId);
        if (!block || !block.element) return;

        console.log('[QuickEdit] Rejected');

        // PHASE 4: Restore marked text to normal
        if (block.markedSpan && block.markedSpan.parentNode) {
            this.unmarkOriginalText(block.markedSpan);
            block.markedSpan = null;
        }

        // Remove block
        this.renderer.removeBlock(block.element);
        this.cleanupBlock(blockId);

        showMessage('已取消修改', 2000);
    }

    /**
     * Handle retry
     */
    private async handleRetry(blockId: string): Promise<void> {
        const block = this.activeBlocks.get(blockId);
        if (!block || !block.element) return;

        console.log('[QuickEdit] Retrying...');

        // Reset block state
        block.suggestedText = '';
        block.state = 'processing' as InlineEditState;

        // Clear suggestion content
        const suggestionContent = block.element.querySelector('[data-content-type="suggestion"]') as HTMLElement;
        if (suggestionContent) {
            suggestionContent.textContent = '';
        }

        // Restart processing
        await this.processInlineEdit(block);
    }

    /**
     * Get current selection
     */
    private getSelection(): InlineEditSelection | null {
        try {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
                return null;
            }

            const text = selection.toString().trim();
            if (!text) {
                return null;
            }

            const range = selection.getRangeAt(0);

            // Find containing block element
            let blockElement = range.commonAncestorContainer as Node;
            while (blockElement && blockElement.nodeType !== Node.ELEMENT_NODE) {
                blockElement = blockElement.parentNode!;
            }

            while (blockElement && !(blockElement as HTMLElement).hasAttribute('data-node-id')) {
                blockElement = (blockElement as HTMLElement).parentElement!;
            }

            if (!blockElement) {
                return null;
            }

            const blockId = (blockElement as HTMLElement).getAttribute('data-node-id') || '';

            return {
                text,
                blockElement: blockElement as HTMLElement,
                blockId,
                range,
                startOffset: 0,
                endOffset: text.length
            };

        } catch (error) {
            console.error('[QuickEdit] Error getting selection:', error);
            return null;
        }
    }

    /**
     * Update settings
     */
    public updateSettings(settings: EditSettings): void {
        this.settings = settings;
        this.inputPopup = new InstructionInputPopup(settings.customInstructions);
    }

    /**
     * Cleanup - FIX: Proper cleanup of all resources
     */
    public destroy(): void {
        console.log('[QuickEdit] Destroying QuickEditManager');

        // Clear all typing animations
        this.renderer.cleanup();

        // Close popup
        this.inputPopup.close();

        // Remove all keyboard handlers
        this.keyboardHandlers.forEach((handler, blockId) => {
            document.removeEventListener('keydown', handler);
        });
        this.keyboardHandlers.clear();

        // Remove all active blocks from DOM
        this.activeBlocks.forEach((block) => {
            if (block.element) {
                this.renderer.removeBlock(block.element);
            }
        });
        this.activeBlocks.clear();

        // Clear pending selection
        this.pendingSelection = null;

        // FIX 1.5: Disconnect MutationObserver
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
        this.observedContainers.clear();

        console.log('[QuickEdit] Cleanup complete');
    }
}
