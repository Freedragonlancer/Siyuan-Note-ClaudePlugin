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
     * Temporarily pause MutationObserver (e.g., during manual DOM operations)
     */
    private pauseObserver(): void {
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            console.log('[QuickEdit] MutationObserver paused');
        }
    }

    /**
     * Resume MutationObserver after manual operations
     */
    private resumeObserver(): void {
        if (this.mutationObserver) {
            // Re-observe all previously observed containers
            this.observedContainers.forEach(container => {
                this.mutationObserver!.observe(container, {
                    childList: true,
                    subtree: true
                });
            });
            console.log('[QuickEdit] MutationObserver resumed');
        }
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

        // No marked span to clean up (we disabled marking to avoid DOM conflicts)
        block.markedSpan = null;

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

        // 尝试获取文本选择
        let selection = this.getSelection();

        if (!selection) {
            // 无文本选择 → 尝试块选择fallback
            console.log('[QuickEdit] No text selection, trying block selection fallback');
            selection = this.getBlockSelectionFallback();

            if (!selection) {
                // 既无文本选择也无块选择
                showMessage('请先选中要编辑的文本或将光标放在要编辑的块中', 3000);
                return;
            }

            console.log('[QuickEdit] Using block selection fallback');
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

        // FIX Issue #1: Read original block type and subtype to preserve formatting
        const originalBlockType = selection.blockElement.getAttribute('data-type') || undefined;
        const originalBlockSubtype = selection.blockElement.getAttribute('data-subtype') || undefined;

        console.log('[QuickEdit] Original block type info:', {
            type: originalBlockType,
            subtype: originalBlockSubtype,
            blockId: selection.blockId
        });

        // Create inline edit block
        const blockId = `inline-edit-${Date.now()}`;
        const inlineBlock: InlineEditBlock = {
            id: blockId,
            blockId: selection.blockId,
            selectedBlockIds: selection.selectedBlockIds, // ✅ Pass all selected block IDs
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
            originalRange: selection.range.cloneRange(),
            // FIX Issue #1: Store block type for format preservation
            originalBlockType,
            originalBlockSubtype
        };

        this.activeBlocks.set(blockId, inlineBlock);

        // FIX: Don't mark original text to avoid triggering SiYuan's DOM listeners
        // The comparison block is sufficient for visual feedback
        const markedSpan: HTMLSpanElement | null = null;
        inlineBlock.markedSpan = markedSpan;

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

        // UNIFIED FIX: Insert comparison block after the LAST selected block
        // This ensures the preview appears at the end of the selection, not at the beginning
        const lastBlockId = selection.selectedBlockIds?.[selection.selectedBlockIds.length - 1] || selection.blockId;
        const lastBlockElement = document.querySelector(`[data-node-id="${lastBlockId}"]`) as HTMLElement;

        console.log(`[QuickEdit] Inserting comparison block after last selected block: ${lastBlockId}`);

        const blockElement = this.renderer.createComparisonBlock(
            inlineBlock,
            lastBlockElement || selection.blockElement,  // Use last block, fallback to first
            renderOptions,
            null  // No marked span, insert normally
        );

        inlineBlock.element = blockElement;

        // 缩进对齐修复: 计算并应用原文所在行的缩进
        const indentInfo = this.calculateLineIndentWithPrefix(selection.range);
        if (indentInfo.indent > 0) {
            // 对整个比较块应用左边距（视觉对齐）
            blockElement.style.marginLeft = `${indentInfo.indent}px`;

            // 存储缩进前缀字符串，用于后续给AI返回的每一行添加缩进
            inlineBlock.indentPrefix = indentInfo.prefix;

            console.log(`[QuickEdit] Applied ${indentInfo.indent}px indentation (prefix: "${indentInfo.prefix.replace(/\t/g, '\\t')}")`);
        }

        // Mark original selected blocks with red background for visual feedback
        if (inlineBlock.selectedBlockIds && inlineBlock.selectedBlockIds.length > 0) {
            inlineBlock.selectedBlockIds.forEach(blockId => {
                const blockEl = document.querySelector(`[data-node-id="${blockId}"]`);
                if (blockEl) {
                    blockEl.classList.add('quick-edit-original-block');
                }
            });
            console.log(`[QuickEdit] Marked ${inlineBlock.selectedBlockIds.length} blocks with red background`);
        }

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
            let fullResponseWithIndent = ''; // 包含缩进的完整响应（用于验证DOM）
            let chunkCount = 0;
            let totalChars = 0;
            let receivedChunks: string[] = []; // 记录所有原始chunk

            console.log(`[QuickEdit] Starting AI request for block ${block.id}`);
            console.log(`[QuickEdit] Original text length: ${block.originalText.length} chars`);

            // 构建请求：明确要求只返回修改后的文本，不要任何解释
            const userPrompt = `${block.instruction}

原文：
${block.originalText}

重要：只返回修改后的完整文本，不要添加任何前言、说明、解释或格式标记（如"以下是..."、"主要改进："等）。直接输出修改后的文本内容即可。`;

            await this.claudeClient.sendMessage(
                [{ role: 'user', content: userPrompt }],
                // onMessage callback
                (chunk) => {
                    chunkCount++;
                    totalChars += chunk.length;
                    receivedChunks.push(chunk); // 记录原始chunk
                    fullResponse += chunk;

                    // 验证fullResponse长度
                    const expectedLength = receivedChunks.join('').length;
                    if (fullResponse.length !== expectedLength) {
                        console.error(`[QuickEdit] ⚠️ CRITICAL: fullResponse length mismatch at chunk ${chunkCount}!`);
                        console.error(`[QuickEdit] Expected: ${expectedLength}, Got: ${fullResponse.length}`);
                        console.error(`[QuickEdit] Current chunk: "${chunk}"`);
                    }

                    // 如果有缩进前缀，给每一行（除了第一行）添加缩进
                    let processedChunk = chunk;
                    if (block.indentPrefix && block.indentPrefix.length > 0) {
                        // 将换行符后的内容添加缩进
                        processedChunk = chunk.replace(/\n(?!$)/g, '\n' + block.indentPrefix);
                        console.log(`[QuickEdit] Chunk #${chunkCount}: ${chunk.length} chars → ${processedChunk.length} chars (added indent)`);
                    } else {
                        console.log(`[QuickEdit] Chunk #${chunkCount}: ${chunk.length} chars, content: "${chunk.substring(0, 50).replace(/\n/g, '\\n')}..."`);
                    }

                    fullResponseWithIndent += processedChunk;
                    block.suggestedText = fullResponse;

                    if (block.element) {
                        this.renderer.appendStreamingChunk(
                            block.element,
                            processedChunk, // 使用处理后的chunk
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

                    // 验证完整性 - 多层验证
                    console.log(`[QuickEdit] ========== Streaming Complete ==========`);
                    console.log(`[QuickEdit] Total chunks received: ${chunkCount}`);
                    console.log(`[QuickEdit] Total chars (sum): ${totalChars}`);
                    console.log(`[QuickEdit] fullResponse length: ${fullResponse.length}`);
                    console.log(`[QuickEdit] fullResponseWithIndent length: ${fullResponseWithIndent.length}`);

                    // 验证1: fullResponse长度是否等于totalChars
                    if (fullResponse.length !== totalChars) {
                        console.error(`[QuickEdit] ⚠️ WARNING: Response length mismatch!`);
                        console.error(`[QuickEdit] Expected: ${totalChars}, Got: ${fullResponse.length}, Missing: ${totalChars - fullResponse.length} chars`);
                    } else {
                        console.log(`[QuickEdit] ✓ fullResponse length matches totalChars`);
                    }

                    // 验证2: receivedChunks合并后是否等于fullResponse
                    const joinedChunks = receivedChunks.join('');
                    if (joinedChunks.length !== fullResponse.length) {
                        console.error(`[QuickEdit] ⚠️ CRITICAL: Chunk join mismatch!`);
                        console.error(`[QuickEdit] Joined: ${joinedChunks.length}, fullResponse: ${fullResponse.length}`);
                    } else {
                        console.log(`[QuickEdit] ✓ All chunks properly concatenated`);
                    }

                    // 验证3: DOM中的文本
                    if (block.element) {
                        const suggestionContent = block.element.querySelector('[data-content-type="suggestion"]') as HTMLElement;
                        const domText = suggestionContent?.textContent || '';
                        const domTextLength = domText.length;

                        console.log(`[QuickEdit] DOM text length: ${domTextLength}`);

                        if (domTextLength === 0) {
                            console.error('[QuickEdit] ⚠️ CRITICAL: DOM text is empty!');
                        } else {
                            // 比较DOM文本和fullResponseWithIndent
                            const expectedLength = fullResponseWithIndent.length;
                            const diff = Math.abs(domTextLength - expectedLength);

                            if (diff === 0) {
                                console.log(`[QuickEdit] ✓ Perfect match: DOM text = fullResponseWithIndent`);
                            } else if (diff <= 2) {
                                console.log(`[QuickEdit] ✓ Close match: DOM=${domTextLength}, Expected=${expectedLength}, Diff=${diff} (acceptable)`);
                            } else {
                                console.error(`[QuickEdit] ⚠️ DOM text mismatch: DOM=${domTextLength}, Expected=${expectedLength}, Diff=${diff}`);
                                console.error(`[QuickEdit] DOM text preview: "${domText.substring(0, 100).replace(/\n/g, '\\n')}..."`);
                                console.error(`[QuickEdit] Expected preview: "${fullResponseWithIndent.substring(0, 100).replace(/\n/g, '\\n')}..."`);
                            }
                        }

                        this.renderer.completeStreaming(block.element);
                    }

                    // FIX: Save indented text for final application
                    block.suggestedTextWithIndent = fullResponseWithIndent;
                    console.log(`[QuickEdit] ✅ Saved suggestedTextWithIndent (${fullResponseWithIndent.length} chars) for final application`);

                    console.log(`[QuickEdit] ==========================================`);
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
     * FIX Issue #1: Add Markdown formatting based on block type
     * Preserves original block formatting when possible
     */
    private applyMarkdownFormatting(text: string, blockType?: string, blockSubtype?: string): string {
        if (!blockType || !blockSubtype) {
            return text; // No type info, return as-is
        }

        console.log(`[QuickEdit] Applying Markdown formatting: type=${blockType}, subtype=${blockSubtype}`);

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
            // TODO: Future enhancement to preserve list formatting
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
            console.log('[QuickEdit] Selected block IDs:', block.selectedBlockIds);
            console.log('[QuickEdit] Is multi-block selection:', block.selectedBlockIds && block.selectedBlockIds.length > 1);

            // IMPORTANT: Use SiYuan's transaction API for proper undo/redo support
            // Do NOT modify DOM directly - let SiYuan handle all rendering

            // FIX: Use indented text if available (preserves indentation shown in preview)
            let textToApply = block.suggestedTextWithIndent || block.suggestedText;
            console.log(`[QuickEdit] Using ${block.suggestedTextWithIndent ? 'indented' : 'non-indented'} text for application`);

            // FIX Issue #1: Apply Markdown formatting for single-block selections
            const isSingleBlock = !block.selectedBlockIds || block.selectedBlockIds.length === 1;
            if (isSingleBlock && block.originalBlockType) {
                console.log(`[QuickEdit] Single block selection detected, applying Markdown formatting`);
                console.log(`[QuickEdit] Original block type: ${block.originalBlockType}, subtype: ${block.originalBlockSubtype}`);

                textToApply = this.applyMarkdownFormatting(
                    textToApply,
                    block.originalBlockType,
                    block.originalBlockSubtype
                );

                console.log(`[QuickEdit] Formatted text preview: "${textToApply.substring(0, 100)}..."`);
            } else {
                console.log(`[QuickEdit] Multi-block selection or no type info, skipping format preservation`);
            }

            // UNIFIED APPROACH: Split AI-generated content into paragraphs
            // In SiYuan, \n\n separates different blocks (paragraphs)
            // FIX: Support both Unix (\n\n) and Windows (\r\n\r\n) line endings
            const paragraphs = textToApply
                .split(/(?:\r?\n){2,}/)  // Split by 2+ line breaks (supports \n\n and \r\n\r\n)
                .map(p => p.trim())
                .filter(p => p.length > 0);  // Remove empty paragraphs

            console.log(`[QuickEdit] Split content into ${paragraphs.length} paragraph(s)`);

            // Step 1: Insert ALL paragraphs as new blocks after the last selected block
            // This unified approach uses only insertBlock API for consistency
            console.log(`[QuickEdit] Inserting ${paragraphs.length} paragraph(s) after last selected block...`);

            const lastOriginalBlockId = block.selectedBlockIds?.[block.selectedBlockIds.length - 1] || block.blockId;
            let previousID = lastOriginalBlockId;

            for (let i = 0; i < paragraphs.length; i++) {
                const paragraph = paragraphs[i];

                try {
                    const insertResponse = await fetch('/api/block/insertBlock', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            dataType: 'markdown',
                            data: paragraph,
                            previousID: previousID  // Insert after previous block
                        })
                    });

                    const insertResult = await insertResponse.json();
                    if (insertResult.code === 0) {
                        previousID = insertResult.data[0].doOperations[0].id;
                        console.log(`[QuickEdit] Inserted paragraph ${i + 1}/${paragraphs.length} as block ${previousID}`);
                    } else {
                        console.warn(`[QuickEdit] Failed to insert paragraph ${i + 1}:`, insertResult);
                    }
                } catch (error) {
                    console.error(`[QuickEdit] Error inserting paragraph ${i + 1}:`, error);
                }
            }

            console.log('[QuickEdit] ✅ All paragraphs inserted successfully');

            // Step 2: Wait for SiYuan to render all new content
            await new Promise(resolve => setTimeout(resolve, 300));

            // Step 3: Pause observer before UI cleanup
            this.pauseObserver();

            // Step 4: CRITICAL - Remove comparison block BEFORE deleting original blocks
            // This prevents the "Nested comparison block was removed (parent removed)" error
            // because the comparison block is inserted after the last original block
            console.log('[QuickEdit] Removing comparison block before deleting original blocks...');
            if (block.element && document.contains(block.element)) {
                try {
                    this.renderer.removeBlock(block.element);
                    console.log('[QuickEdit] ✅ Removed comparison block');
                } catch (error) {
                    console.warn('[QuickEdit] Failed to remove comparison block:', error);
                }
            }

            // Step 5: Remove red marking from original blocks
            if (block.selectedBlockIds && block.selectedBlockIds.length > 0) {
                block.selectedBlockIds.forEach(blockId => {
                    const blockEl = document.querySelector(`[data-node-id="${blockId}"]`);
                    if (blockEl) {
                        blockEl.classList.remove('quick-edit-original-block');
                    }
                });
                console.log(`[QuickEdit] Removed red marking from ${block.selectedBlockIds.length} blocks`);
            }

            // Step 6: Delete ALL originally selected blocks (including the first one)
            // This unified approach treats all blocks equally
            if (block.selectedBlockIds && block.selectedBlockIds.length > 0) {
                console.log(`[QuickEdit] Deleting ${block.selectedBlockIds.length} original blocks...`);

                // Delete all original blocks
                for (let i = 0; i < block.selectedBlockIds.length; i++) {
                    const blockIdToDelete = block.selectedBlockIds[i];
                    try {
                        const deleteResponse = await fetch('/api/block/deleteBlock', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: blockIdToDelete
                            })
                        });

                        const deleteResult = await deleteResponse.json();
                        if (deleteResult.code === 0) {
                            console.log(`[QuickEdit] Deleted original block ${i + 1}/${block.selectedBlockIds.length}: ${blockIdToDelete}`);
                        } else {
                            console.warn(`[QuickEdit] Failed to delete block ${blockIdToDelete}:`, deleteResult);
                        }
                    } catch (error) {
                        console.error(`[QuickEdit] Error deleting block ${blockIdToDelete}:`, error);
                    }
                }
            }

            // Step 7: Wait longer for SiYuan to complete all async operations
            await new Promise(resolve => setTimeout(resolve, 500));

            // No marked span to clean up anymore (we disabled marking to avoid DOM conflicts)
            block.markedSpan = null;

            // Resume observer after cleanup
            this.resumeObserver();

            // Step 7: Add to plugin history (separate from SiYuan undo)
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

            // Step 8: Final cleanup
            this.cleanupBlock(blockId);

            showMessage('✅ 修改已应用（支持撤销）', 2000);

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

        // Remove red marking from original blocks
        if (block.selectedBlockIds && block.selectedBlockIds.length > 0) {
            block.selectedBlockIds.forEach(blockId => {
                const blockEl = document.querySelector(`[data-node-id="${blockId}"]`);
                if (blockEl) {
                    blockEl.classList.remove('quick-edit-original-block');
                }
            });
            console.log(`[QuickEdit] Removed red marking from ${block.selectedBlockIds.length} blocks`);
        }

        // No marked span to restore (we disabled marking to avoid DOM conflicts)
        block.markedSpan = null;

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
     * 计算选择所在行的前导空白缩进（返回像素值和前缀字符串）
     */
    private calculateLineIndentWithPrefix(range: Range): { indent: number; prefix: string } {
        try {
            // 获取选择开始位置所在的文本节点
            let startNode = range.startContainer;
            let startOffset = range.startOffset;

            // 如果是元素节点，找到对应的文本节点
            if (startNode.nodeType === Node.ELEMENT_NODE) {
                const childNode = startNode.childNodes[startOffset];
                if (childNode && childNode.nodeType === Node.TEXT_NODE) {
                    startNode = childNode;
                    startOffset = 0;
                } else {
                    // 尝试使用第一个文本子节点
                    const textNodes = Array.from(startNode.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
                    if (textNodes.length > 0) {
                        startNode = textNodes[0];
                        startOffset = 0;
                    } else {
                        console.log('[QuickEdit] No text node found for indent calculation');
                        return { indent: 0, prefix: '' };
                    }
                }
            }

            if (startNode.nodeType !== Node.TEXT_NODE) {
                console.log('[QuickEdit] Start node is not text node');
                return { indent: 0, prefix: '' };
            }

            // 获取整个文本内容
            const textContent = startNode.textContent || '';

            // 向前查找到行首（或文本开始）
            let lineStart = startOffset;
            while (lineStart > 0 && textContent[lineStart - 1] !== '\n') {
                lineStart--;
            }

            // 提取行首到选择起点之间的文本
            const linePrefix = textContent.substring(lineStart, startOffset);

            // 计算前导空白
            const match = linePrefix.match(/^[ \t]*/);
            if (!match || match[0].length === 0) {
                console.log('[QuickEdit] No leading whitespace found');
                return { indent: 0, prefix: '' };
            }

            const prefix = match[0]; // 缩进前缀字符串（空格或tab）
            let indent = 0;
            for (const char of prefix) {
                if (char === '\t') {
                    indent += 32; // 1 tab = 32px
                } else if (char === ' ') {
                    indent += 8;  // 1 space = 8px
                }
            }

            console.log(`[QuickEdit] Calculated line indent: ${indent}px from "${prefix.replace(/\t/g, '\\t')}" (linePrefix: "${linePrefix.substring(0, 20)}...")`);
            return { indent, prefix };

        } catch (error) {
            console.error('[QuickEdit] Error calculating line indent:', error);
            return { indent: 0, prefix: '' };
        }
    }

    /**
     * Fallback: Get block selection when no text is selected
     */
    private getBlockSelectionFallback(): InlineEditSelection | null {
        try {
            // 获取当前光标位置
            const selection = window.getSelection();
            if (!selection || !selection.anchorNode) {
                console.log('[QuickEdit] No anchor node in fallback');
                return null;
            }

            // 从光标位置向上查找块元素
            let blockElement = selection.anchorNode as Node;
            let depth = 0;
            const maxDepth = 20;

            while (blockElement && depth < maxDepth) {
                if (blockElement.nodeType === Node.ELEMENT_NODE) {
                    const elem = blockElement as HTMLElement;

                    // 查找SiYuan块
                    if (elem.hasAttribute('data-node-id') ||
                        elem.hasAttribute('data-type') ||
                        elem.classList?.contains('p') ||
                        elem.classList?.contains('li') ||
                        elem.classList?.contains('protyle-wysiwyg')) {

                        // 找到块了，获取整个块的文本
                        const blockId = elem.getAttribute('data-node-id') ||
                                       elem.getAttribute('data-id') ||
                                       `fallback-${Date.now()}`;

                        const text = elem.textContent || '';
                        if (!text.trim()) {
                            console.log('[QuickEdit] Block has no text content in fallback');
                            return null;
                        }

                        // 创建Range覆盖整个块
                        const range = document.createRange();
                        range.selectNodeContents(elem);

                        console.log('[QuickEdit] Found block selection via fallback:', {
                            blockId,
                            tagName: elem.tagName,
                            textLength: text.length
                        });

                        return {
                            text,
                            blockElement: elem,
                            blockId,
                            range,
                            startOffset: 0,
                            endOffset: text.length
                        };
                    }
                }

                if (!blockElement.parentNode) {
                    break;
                }
                blockElement = blockElement.parentNode;
                depth++;
            }

            console.log('[QuickEdit] No block found in fallback at depth', depth);
            return null;

        } catch (error) {
            console.error('[QuickEdit] Error in getBlockSelectionFallback:', error);
            return null;
        }
    }

    /**
     * 从Range中提取所有被选中的块元素
     * 使用cloneContents()获取实际选中的DOM片段，然后根据data-node-id在真实DOM中查找对应块
     */
    private extractBlocksFromRange(range: Range): HTMLElement[] {
        const blockIds: string[] = [];

        try {
            // 克隆选区内容
            const fragment = range.cloneContents();

            // 在片段中查找所有块元素的ID
            const traverse = (node: Node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const elem = node as HTMLElement;

                    // 找到块元素，记录其ID
                    if (elem.hasAttribute('data-node-id')) {
                        const blockId = elem.getAttribute('data-node-id');
                        if (blockId && !blockIds.includes(blockId)) {
                            blockIds.push(blockId);
                        }
                        return; // 不继续深入，避免嵌套块
                    }
                }

                // 继续遍历子节点
                node.childNodes.forEach(child => traverse(child));
            };

            traverse(fragment);

            console.log(`[QuickEdit] extractBlocksFromRange found ${blockIds.length} block IDs in cloned fragment:`, blockIds);

            // 根据ID在真实DOM中查找对应的块元素
            const blocks: HTMLElement[] = [];
            for (const blockId of blockIds) {
                const blockElement = document.querySelector(`[data-node-id="${blockId}"]`) as HTMLElement;
                if (blockElement) {
                    blocks.push(blockElement);
                } else {
                    console.warn(`[QuickEdit] Block with ID ${blockId} not found in document`);
                }
            }

            return blocks;

        } catch (error) {
            console.error('[QuickEdit] Error in extractBlocksFromRange:', error);
            return [];
        }
    }

    /**
     * 查找两个块之间的所有兄弟块（包括起止块）
     * 用于处理Range API无法正确检测跨块选择的情况
     */
    private findBlocksBetween(startBlock: HTMLElement, endBlock: HTMLElement): HTMLElement[] {
        const blocks: HTMLElement[] = [];

        // 如果是同一个块，直接返回
        if (startBlock === endBlock) {
            return [startBlock];
        }

        // 检查两个块是否有共同的父容器
        const startParent = startBlock.parentElement;
        const endParent = endBlock.parentElement;

        if (!startParent || !endParent) {
            console.warn('[QuickEdit] Start or end block has no parent');
            return [startBlock];
        }

        // 如果不是同一个父容器，无法用兄弟遍历
        if (startParent !== endParent) {
            console.warn('[QuickEdit] Blocks have different parents, using commonAncestor method');
            return [];
        }

        // 遍历兄弟节点，收集startBlock到endBlock之间的所有块
        let collecting = false;
        const children = Array.from(startParent.children);

        for (const child of children) {
            const elem = child as HTMLElement;

            // 开始收集
            if (elem === startBlock) {
                collecting = true;
            }

            // 如果正在收集且是块元素，添加到结果
            if (collecting && elem.hasAttribute('data-node-id')) {
                blocks.push(elem);
            }

            // 结束收集
            if (elem === endBlock) {
                break;
            }
        }

        console.log(`[QuickEdit] findBlocksBetween found ${blocks.length} blocks between siblings`);

        return blocks;
    }

    /**
     * 提取Range跨越的所有块的完整文本
     * 用于处理用户拖动选择跨多个段落的情况
     */
    private extractMultiBlockText(range: Range): { text: string; blocks: HTMLElement[] } | null {
        try {
            console.log('[QuickEdit] === Starting multi-block extraction ===');
            console.log('[QuickEdit] Range details:', {
                startContainer: range.startContainer.nodeName,
                startContainerText: range.startContainer.textContent?.substring(0, 50),
                startOffset: range.startOffset,
                endContainer: range.endContainer.nodeName,
                endContainerText: range.endContainer.textContent?.substring(0, 50),
                endOffset: range.endOffset,
                collapsed: range.collapsed
            });

            // 策略1: 尝试从Range的cloneContents中提取块
            console.log('[QuickEdit] Strategy 1: Trying extractBlocksFromRange (cloneContents)...');
            let selectedBlocks = this.extractBlocksFromRange(range);

            // 如果cloneContents方法没找到块，或只找到1个块，尝试其他方法
            if (selectedBlocks.length === 0) {
                console.log('[QuickEdit] Strategy 1 failed - no blocks found in cloned fragment');

                // 策略2: 找到起始和结束块，用兄弟遍历
                console.log('[QuickEdit] Strategy 2: Trying sibling traversal...');
                const startBlock = this.findBlockElement(range.startContainer);
                const endBlock = this.findBlockElement(range.endContainer);

                if (!startBlock || !endBlock) {
                    console.log('[QuickEdit] Could not find start or end block');
                    return null;
                }

                console.log('[QuickEdit] Found blocks:', {
                    startBlock: startBlock.getAttribute('data-node-id'),
                    endBlock: endBlock.getAttribute('data-node-id'),
                    sameBlock: startBlock === endBlock
                });

                // 如果是同一个块，直接返回
                if (startBlock === endBlock) {
                    const text = (startBlock.textContent || '').trim();
                    console.log('[QuickEdit] Same block detected, returning single block');
                    return {
                        text,
                        blocks: [startBlock]
                    };
                }

                // 尝试兄弟遍历
                selectedBlocks = this.findBlocksBetween(startBlock, endBlock);

                // 如果兄弟遍历也失败，使用commonAncestor方法
                if (selectedBlocks.length === 0) {
                    console.log('[QuickEdit] Strategy 2 failed - trying commonAncestor method...');

                    const commonAncestor = range.commonAncestorContainer;
                    console.log('[QuickEdit] Common ancestor:', {
                        nodeType: commonAncestor.nodeName,
                        hasDataNodeId: (commonAncestor as HTMLElement).hasAttribute?.('data-node-id')
                    });

                    const allBlocks = this.findAllBlocksInContainer(commonAncestor);
                    console.log(`[QuickEdit] Found ${allBlocks.length} blocks in common ancestor`);

                    if (allBlocks.length === 0) {
                        console.warn('[QuickEdit] No blocks found in common ancestor');
                        return null;
                    }

                    const startIndex = allBlocks.indexOf(startBlock);
                    const endIndex = allBlocks.indexOf(endBlock);

                    if (startIndex === -1 || endIndex === -1) {
                        console.warn('[QuickEdit] Blocks not found in ancestor list');
                        return null;
                    }

                    selectedBlocks = allBlocks.slice(startIndex, endIndex + 1);
                    console.log(`[QuickEdit] CommonAncestor method found ${selectedBlocks.length} blocks`);
                }
            } else if (selectedBlocks.length === 1) {
                console.log('[QuickEdit] Strategy 1 found only 1 block, verifying if this is correct...');

                // 验证是否真的只选了一个块
                const startBlock = this.findBlockElement(range.startContainer);
                const endBlock = this.findBlockElement(range.endContainer);

                if (startBlock && endBlock && startBlock !== endBlock) {
                    console.log('[QuickEdit] Actually spans multiple blocks, trying strategy 2...');
                    const siblingBlocks = this.findBlocksBetween(startBlock, endBlock);
                    if (siblingBlocks.length > 1) {
                        selectedBlocks = siblingBlocks;
                    }
                }
            }

            console.log('[QuickEdit] Final selected blocks:', selectedBlocks.map(b => ({
                id: b.getAttribute('data-node-id'),
                type: b.getAttribute('data-type'),
                textLength: (b.textContent || '').length
            })));

            // 提取所有块的完整文本内容
            const texts = selectedBlocks
                .map(block => (block.textContent || '').trim())
                .filter(t => t.length > 0);

            const finalText = texts.join('\n\n');

            console.log(`[QuickEdit] ✓ Extracted ${selectedBlocks.length} blocks, total ${finalText.length} chars`);

            return {
                text: finalText,
                blocks: selectedBlocks
            };

        } catch (error) {
            console.error('[QuickEdit] Error in extractMultiBlockText:', error);
            return null;
        }
    }

    /**
     * 在容器内查找所有SiYuan块元素
     */
    private findAllBlocksInContainer(container: Node): HTMLElement[] {
        const blocks: HTMLElement[] = [];

        const traverse = (node: Node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const elem = node as HTMLElement;

                // 找到块元素：有data-node-id属性
                if (elem.hasAttribute('data-node-id')) {
                    blocks.push(elem);
                    // 不继续深入遍历，避免嵌套块重复添加
                    return;
                }
            }

            // 继续遍历子节点
            node.childNodes.forEach(child => traverse(child));
        };

        // 开始遍历
        traverse(container);

        console.log(`[QuickEdit] findAllBlocksInContainer found ${blocks.length} blocks`);

        return blocks;
    }

    /**
     * 从任意节点向上查找所属的SiYuan块元素
     */
    private findBlockElement(node: Node): HTMLElement | null {
        let current: Node | null = node;
        let depth = 0;
        const maxDepth = 20;
        const path: string[] = [];

        while (current && depth < maxDepth) {
            if (current.nodeType === Node.ELEMENT_NODE) {
                const elem = current as HTMLElement;
                path.push(`${elem.tagName}${elem.getAttribute('data-node-id') ? '[' + elem.getAttribute('data-node-id') + ']' : ''}`);

                if (elem.hasAttribute('data-node-id')) {
                    console.log(`[QuickEdit] Found block at depth ${depth}:`, {
                        id: elem.getAttribute('data-node-id'),
                        type: elem.getAttribute('data-type'),
                        tag: elem.tagName,
                        path: path.join(' > ')
                    });
                    return elem;
                }
            } else {
                path.push(`${current.nodeName}`);
            }
            current = current.parentNode;
            depth++;
        }

        console.warn('[QuickEdit] No block found, traversal path:', path.join(' > '));
        return null;
    }

    /**
     * 获取思源笔记中被选中的块元素
     * 思源在用户选中块时会添加 .protyle-wysiwyg--select 类
     * @returns 所有被选中的块元素数组
     */
    private getSelectedBlocks(): HTMLElement[] {
        try {
            // 查询所有带 .protyle-wysiwyg--select 类的块元素
            const selectedElements = document.querySelectorAll('.protyle-wysiwyg--select[data-node-id]');
            const blocks = Array.from(selectedElements) as HTMLElement[];

            console.log(`[QuickEdit] getSelectedBlocks found ${blocks.length} selected blocks`);
            if (blocks.length > 0) {
                console.log('[QuickEdit] Selected block IDs:', blocks.map(b => b.getAttribute('data-node-id')));
            }

            return blocks;
        } catch (error) {
            console.error('[QuickEdit] Error in getSelectedBlocks:', error);
            return [];
        }
    }

    /**
     * Get current selection - 支持两种模式：
     * 模式1（优先）：块选择模式 - 用户通过块图标或块级操作选中的块
     * 模式2（后备）：文本选择模式 - 用户通过鼠标拖选的文本
     */
    private getSelection(): InlineEditSelection | null {
        try {
            console.log('[QuickEdit] === Getting selection ===');

            // 模式1: 块选择模式 - 检查思源的块选择（.protyle-wysiwyg--select）
            const selectedBlocks = this.getSelectedBlocks();

            if (selectedBlocks.length > 0) {
                console.log(`[QuickEdit] ✓ BLOCK SELECTION MODE: Found ${selectedBlocks.length} selected blocks`);

                // 提取所有选中块的文本内容
                const texts = selectedBlocks
                    .map(block => (block.textContent || '').trim())
                    .filter(t => t.length > 0);

                const text = texts.join('\n\n');

                if (!text || !text.trim()) {
                    console.log('[QuickEdit] Selected blocks have no text content');
                    return null;
                }

                // ✅ Extract all block IDs for multi-block selection support
                const selectedBlockIds = selectedBlocks.map(b => b.getAttribute('data-node-id')).filter(Boolean) as string[];

                console.log(`[QuickEdit] Block selection text: ${text.length} chars from ${selectedBlocks.length} blocks`);
                console.log(`[QuickEdit] Block IDs:`, selectedBlockIds);

                // 使用第一个块作为主块元素
                const primaryBlock = selectedBlocks[0];
                const blockId = primaryBlock.getAttribute('data-node-id') || `fallback-${Date.now()}`;

                // 创建一个Range覆盖所有选中的块
                const range = document.createRange();
                range.setStartBefore(selectedBlocks[0]);
                range.setEndAfter(selectedBlocks[selectedBlocks.length - 1]);

                return {
                    text,
                    blockElement: primaryBlock,
                    blockId,
                    selectedBlockIds, // ✅ Pass all block IDs
                    range,
                    startOffset: 0,
                    endOffset: text.length
                };
            }

            // 模式2: 文本选择模式 - 使用 Range API
            console.log('[QuickEdit] Block selection mode found no blocks, trying text selection mode...');

            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
                console.log('[QuickEdit] No window selection or empty rangeCount');
                return null;
            }

            console.log(`[QuickEdit] ✓ TEXT SELECTION MODE: Selection has ${selection.rangeCount} range(s)`);

            let text = '';
            let primaryRange: Range | null = null;
            let extractedBlocks: HTMLElement[] | null = null; // FIX: Store extracted blocks for ID extraction

            if (selection.rangeCount === 1) {
                primaryRange = selection.getRangeAt(0);

                // 尝试多块提取（用于跨块文本选择）
                const multiBlockResult = this.extractMultiBlockText(primaryRange);

                if (multiBlockResult && multiBlockResult.text.trim()) {
                    text = multiBlockResult.text;
                    extractedBlocks = multiBlockResult.blocks; // FIX: Store blocks for later ID extraction
                    console.log(`[QuickEdit] ✓ Multi-block extraction: ${multiBlockResult.blocks.length} blocks, ${text.length} chars`);
                } else {
                    // Fallback：单块文本选择
                    text = primaryRange.toString();
                    if (!text || !text.trim()) {
                        const clonedContents = primaryRange.cloneContents();
                        text = clonedContents.textContent || '';
                    }
                    console.log(`[QuickEdit] Single block text extraction: ${text.length} chars`);
                }
            } else {
                // 多个Range - 合并
                console.log('[QuickEdit] Multiple ranges detected, merging...');
                const allTexts: string[] = [];

                for (let i = 0; i < selection.rangeCount; i++) {
                    const range = selection.getRangeAt(i);
                    let rangeText = range.toString();

                    if (!rangeText || !rangeText.trim()) {
                        const clonedContents = range.cloneContents();
                        rangeText = clonedContents.textContent || '';
                    }

                    if (rangeText) {
                        allTexts.push(rangeText);
                    }
                }

                text = allTexts.join('\n\n');
                primaryRange = selection.getRangeAt(0);
                console.log(`[QuickEdit] Merged ${allTexts.length} ranges into ${text.length} chars`);
            }

            if (!text || !text.trim()) {
                console.log('[QuickEdit] Selection text is empty');
                return null;
            }

            console.log(`[QuickEdit] Text selection final: ${text.length} chars`);

            // 查找包含选区的块元素
            const blockElement = this.findBlockElement(primaryRange!.commonAncestorContainer);

            if (!blockElement) {
                console.log('[QuickEdit] Could not find block element for text selection');
                return null;
            }

            const blockId = blockElement.getAttribute('data-node-id') || `fallback-${Date.now()}`;

            // FIX: Extract block IDs from extracted blocks for multi-block selection support
            let selectedBlockIds: string[] | undefined = undefined;
            if (extractedBlocks && extractedBlocks.length > 0) {
                // Multi-block text selection: extract all block IDs
                selectedBlockIds = extractedBlocks
                    .map(b => b.getAttribute('data-node-id'))
                    .filter(Boolean) as string[];
                console.log(`[QuickEdit] ✅ Extracted ${selectedBlockIds.length} block IDs from multi-block selection`);
            } else {
                // Single block selection: use the primary block ID
                selectedBlockIds = [blockId];
                console.log(`[QuickEdit] Single block selection, using block ID: ${blockId}`);
            }

            console.log('[QuickEdit] Text selection result:', {
                blockId,
                selectedBlockIds,
                tagName: blockElement.tagName,
                textLength: text.length
            });

            return {
                text,
                blockElement,
                blockId,
                selectedBlockIds, // FIX: Add selectedBlockIds to return object
                range: primaryRange!,
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
