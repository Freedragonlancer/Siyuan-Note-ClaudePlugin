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
import type { ConfigManager } from '@/settings/ConfigManager';
import type { FilterRule } from '@/settings/config-types';
import { ContextExtractor } from './ContextExtractor';
import { EditorHelper } from '@/editor/EditorHelper';

/**
 * FIX Phase 5: Fetch with timeout protection
 * Wraps fetch call with a timeout to prevent indefinite hangs
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 10000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeoutMs}ms`);
        }
        throw error;
    }
}

export class QuickEditManager {
    private plugin: Plugin;
    private claudeClient: ClaudeClient;
    private history: EditHistory;
    private settings: EditSettings;
    private configManager: ConfigManager;

    // Inline edit components
    private renderer: InlineEditRenderer;
    private inputPopup: InstructionInputPopup;
    private processor: AIEditProcessor;
    private contextExtractor: ContextExtractor;

    // Active inline edits
    private activeBlocks: Map<string, InlineEditBlock> = new Map();
    
    // Request cancellation and concurrency control
    private activeRequestBlockId: string | null = null;
    private isProcessing: boolean = false;

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
        editSettings: EditSettings,
        configManager: ConfigManager
    ) {
        this.plugin = plugin;
        this.claudeClient = claudeClient;
        this.history = history;
        this.settings = editSettings;
        this.configManager = configManager;

        // Initialize components
        this.renderer = new InlineEditRenderer();
        // Use unified presets from ConfigManager (Tab 1)
        const presets = this.configManager.getAllTemplates();
        this.inputPopup = new InstructionInputPopup(presets, this.configManager);
        this.processor = new AIEditProcessor(claudeClient);
        this.contextExtractor = new ContextExtractor(new EditorHelper());

        // Setup popup callbacks
        this.inputPopup.setCallbacks({
            onSubmit: (instruction) => this.handleInstructionSubmit(instruction),
            onCancel: () => {
                this.pendingSelection = null;
            },
            onPresetSwitch: (presetId) => this.handlePresetSwitch(presetId)
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
    }

    /**
     * Temporarily pause MutationObserver (e.g., during manual DOM operations)
     */
    private pauseObserver(): void {
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            // Clear observed containers to prevent memory leak
            this.observedContainers.clear();
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
        }
    }

    /**
     * FIX 1.5: Start observing a container for DOM changes
     */
    private observeContainer(container: HTMLElement): void {
        if (!this.mutationObserver || this.observedContainers.has(container)) {
            return;
        }

        // FIX Critical 1.1: Verify container still exists in DOM before observing
        if (!document.contains(container)) {
            console.warn('[QuickEdit] Container no longer in DOM, skipping observation');
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
        }
    }

    /**
     * FIX 1.5: Handle when a comparison block is removed externally (e.g., by SiYuan undo)
     */
    private handleBlockRemovedByExternal(blockId: string): void {
        const block = this.activeBlocks.get(blockId);
        if (!block) return;

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

        // 并发保护：防止多个同时进行的编辑
        if (this.isProcessing) {
            console.warn('[QuickEdit] Rejected: another Quick Edit is already in progress');
            showMessage('⚠️ 已有一个快速编辑正在进行中，请等待完成', 2000, 'info');
            return;
        }

        // 尝试获取文本选择
        let selection = this.getSelection();

        if (!selection) {
            // 无文本选择 → 尝试块选择fallback
            selection = this.getBlockSelectionFallback();

            if (!selection) {
                // 既无文本选择也无块选择
                showMessage('请先选中要编辑的文本或将光标放在要编辑的块中', 3000);
                return;
            }
        }

        // FIX 1.2: Store selection in instance property instead of window
        this.pendingSelection = selection;

        // Show instruction input popup
        const rect = selection.range.getBoundingClientRect();
        const position = {
            x: rect.left,
            y: rect.bottom + 10,
            placement: 'below' as const,
            anchorRect: {
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                right: rect.right,
                width: rect.width,
                height: rect.height
            }
        };

        this.inputPopup.show(position, this.settings.quickEditDefaultInstruction);
    }

    /**
     * Cancel the currently active Quick Edit request
     */
    public cancelActiveRequest(): void {
        if (!this.activeRequestBlockId) {
            return;
        }

        const blockId = this.activeRequestBlockId;
        const block = this.activeBlocks.get(blockId);

        // 取消 ClaudeClient 的网络请求
        this.claudeClient.cancelActiveRequest();

        // 清理 UI（使用 reject 的清理逻辑）
        if (block) {
            this.handleReject(blockId);
        }

        // 清理标志
        this.isProcessing = false;
        this.activeRequestBlockId = null;

        showMessage('⚠️ 已取消快速编辑', 2000, 'info');
    }

    /**
     * Handle instruction submit
     */
    private async handleInstructionSubmit(instruction: string): Promise<void> {
        // 设置处理中标志，防止并发
        this.isProcessing = true;

        // Use instance property instead of window
        const selection = this.pendingSelection;
        if (!selection) {
            console.error('[QuickEdit] No selection found');
            this.isProcessing = false;
            return;
        }

        // Clear immediately to prevent reuse
        this.pendingSelection = null;

        // ✨ Phase 2.1: 清除选中状态，移除灰色遮罩
        // 清除文本选中
        const windowSelection = window.getSelection();
        if (windowSelection) {
            windowSelection.removeAllRanges();
        }

        // 清除块选中状态
        const selectedBlocks = document.querySelectorAll('.protyle-wysiwyg--select');
        selectedBlocks.forEach(el => el.classList.remove('protyle-wysiwyg--select'));

        // FIX Issue #1: Read original block type and subtype to preserve formatting
        const originalBlockType = selection.blockElement.getAttribute('data-type') || undefined;
        const originalBlockSubtype = selection.blockElement.getAttribute('data-subtype') || undefined;

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

        // 设置活动请求ID，用于取消功能
        this.activeRequestBlockId = blockId;

        // Don't mark original text to avoid triggering SiYuan's DOM listeners
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

        // FIX High 2.1: Add null safety checks for DOM elements
        if (!lastBlockElement && !selection.blockElement) {
            console.error(`[QuickEdit] ❌ Cannot find block element for ${lastBlockId} or fallback, aborting`);
            this.activeBlocks.delete(blockId);
            return;
        }

        const targetElement = lastBlockElement || selection.blockElement;

        const blockElement = this.renderer.createComparisonBlock(
            inlineBlock,
            targetElement,
            renderOptions,
            null  // No marked span, insert normally
        );

        // FIX High 2.1: Verify comparison block was created successfully
        if (!blockElement) {
            console.error(`[QuickEdit] ❌ Failed to create comparison block, aborting`);
            this.activeBlocks.delete(blockId);
            return;
        }

        inlineBlock.element = blockElement;

        // 缩进对齐修复: 计算并应用原文所在行的缩进
        const indentInfo = this.calculateLineIndentWithPrefix(selection.range);
        if (indentInfo.indent > 0) {
            // 对整个比较块应用左边距（视觉对齐）
            blockElement.style.marginLeft = `${indentInfo.indent}px`;

            // 存储缩进前缀字符串，用于后续给AI返回的每一行添加缩进
            inlineBlock.indentPrefix = indentInfo.prefix;
        }

        // FIX High 2.4: Mark original selected blocks with red background (optimized DOM query)
        if (inlineBlock.selectedBlockIds && inlineBlock.selectedBlockIds.length > 0) {
            // Use querySelectorAll once instead of N querySelector calls (O(1) vs O(N))
            const selector = inlineBlock.selectedBlockIds.map(id => `[data-node-id="${id}"]`).join(',');
            const blockElements = document.querySelectorAll(selector);
            blockElements.forEach(el => el.classList.add('quick-edit-original-block'));
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
            // FIX Critical 1.3: Use array accumulation instead of string concatenation for O(n) performance
            let fullResponseChunks: string[] = []; // Original chunks without indent
            let fullResponseWithIndentChunks: string[] = []; // Chunks with indent
            let chunkCount = 0;
            let totalChars = 0;

            // 构建请求：使用可配置的提示词模板（从 ClaudeClient 获取）
            const claudeSettings = this.claudeClient.getSettings();
            const template = claudeSettings.quickEditPromptTemplate || `{instruction}

原文：
{original}

重要：只返回修改后的完整文本，不要添加任何前言、说明、解释或格式标记（如"以下是..."、"主要改进："等）。直接输出修改后的文本内容即可。`;

            // ✨ 处理上下文占位符 {above=x}, {below=x}, {above_blocks=x}, {below_blocks=x}
            let processedTemplate = template;
            try {
                if (this.contextExtractor.hasPlaceholders(template)) {
                    processedTemplate = await this.contextExtractor.processTemplate(template, block.selectedBlockIds || []);
                }
            } catch (error) {
                console.error(`[QuickEdit] Error processing context placeholders:`, error);
                processedTemplate = template;
            }

            // 替换占位符构建用户消息
            let userPrompt = processedTemplate
                .replace('{instruction}', block.instruction)
                .replace('{original}', block.originalText);

            // 统一提示词管线：自动附加 appendedPrompt
            const appendedPrompt = this.claudeClient.getAppendedPrompt();
            if (appendedPrompt && appendedPrompt.trim()) {
                userPrompt += '\n\n' + appendedPrompt;
            }

            // 获取当前预设 ID，用于获取预设级别的 filterRules
            const currentPresetId = this.getCurrentPresetId();

            // 获取 filterRules（全局 + 预设）
            const filterRules: FilterRule[] = this.claudeClient.getFilterRules(currentPresetId) || [];

            // DEBUG: 诊断过滤规则加载
            console.log('[QuickEdit] DEBUG filterRules:', JSON.stringify(filterRules, null, 2));
            console.log('[QuickEdit] DEBUG filterRules source:', currentPresetId
                ? `Global + Preset (${currentPresetId})`
                : 'Global only');
            console.log('[QuickEdit] DEBUG preset ID:', currentPresetId);

            await this.claudeClient.sendMessage(
                [{ role: 'user', content: userPrompt }],
                // onMessage callback
                (chunk) => {
                    // 检测是否是过滤后的替换消息
                    const FILTER_MARKER = '[FILTERED_REPLACE]';
                    if (chunk.startsWith(FILTER_MARKER)) {
                        // 这是过滤后的完整内容，需要替换之前的所有内容
                        const filteredContent = chunk.substring(FILTER_MARKER.length);

                        // 重置计数器以匹配过滤后的内容
                        totalChars = filteredContent.length;
                        chunkCount = 1; // 现在只有1个chunk（过滤后的完整内容）
                        
                        // 清空之前的内容
                        fullResponseChunks = [filteredContent];
                        
                        // 处理缩进
                        let processedContent = filteredContent;
                        if (block.indentPrefix && block.indentPrefix.length > 0) {
                            processedContent = filteredContent.replace(/\n(?!$)/g, '\n' + block.indentPrefix);
                        }
                        fullResponseWithIndentChunks = [processedContent];
                        
                        // 更新 block.suggestedText
                        block.suggestedText = filteredContent;
                        
                        // 清空并重新渲染整个内容
                        if (block.element) {
                            this.renderer.replaceStreamingContent(block.element, processedContent);
                        }
                        
                        return; // 处理完毕，不继续执行后面的逻辑
                    }
                    
                    // 正常的流式 chunk 处理
                    chunkCount++;
                    totalChars += chunk.length;

                    // FIX Critical 1.3: O(1) array push instead of O(n) string concatenation
                    fullResponseChunks.push(chunk);

                    // 如果有缩进前缀，给每一行（除了第一行）添加缩进
                    let processedChunk = chunk;
                    if (block.indentPrefix && block.indentPrefix.length > 0) {
                        processedChunk = chunk.replace(/\n(?!$)/g, '\n' + block.indentPrefix);
                    }

                    fullResponseWithIndentChunks.push(processedChunk);

                    // Update block.suggestedText periodically (every 10 chunks)
                    if (chunkCount % 10 === 0) {
                        block.suggestedText = fullResponseChunks.join('');
                    }

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

                    // 清理处理状态
                    this.isProcessing = false;
                    this.activeRequestBlockId = null;

                    // Remove red marking from original blocks on error
                    if (block.selectedBlockIds && block.selectedBlockIds.length > 0) {
                        const selector = block.selectedBlockIds.map(id => `[data-node-id="${id}"]`).join(',');
                        const blockElements = document.querySelectorAll(selector);
                        blockElements.forEach(el => el.classList.remove('quick-edit-original-block'));
                    }

                    if (block.element) {
                        this.renderer.showError(block.element, error.message);
                        // 显示重试/拒绝按钮，隐藏取消按钮
                        this.renderer.showReviewButtons(block.element);
                    }

                    console.error('[QuickEdit] Error:', error);
                    showMessage(`❌ 快速编辑失败: ${error.message}`, 3000, 'error');
                },
                // onComplete callback
                () => {
                    block.state = 'reviewing' as InlineEditState;
                    block.updatedAt = Date.now();

                    // Join all chunks once at the end (O(n) instead of O(n²))
                    const fullResponse = fullResponseChunks.join('');
                    const fullResponseWithIndent = fullResponseWithIndentChunks.join('');

                    // Validate response length
                    if (fullResponse.length !== totalChars) {
                        console.error(`[QuickEdit] Response length mismatch: expected ${totalChars}, got ${fullResponse.length}`);
                    }

                    // Validate DOM text
                    if (block.element) {
                        const suggestionContent = block.element.querySelector('[data-content-type="suggestion"]') as HTMLElement;
                        const domText = suggestionContent?.textContent || '';

                        if (domText.length === 0) {
                            console.error('[QuickEdit] CRITICAL: DOM text is empty!');
                        } else {
                            const diff = Math.abs(domText.length - fullResponseWithIndent.length);
                            if (diff > 2) {
                                console.error(`[QuickEdit] DOM text mismatch: DOM=${domText.length}, Expected=${fullResponseWithIndent.length}, Diff=${diff}`);
                            }
                        }

                        this.renderer.completeStreaming(block.element);
                    }

                    // Save final joined responses
                    block.suggestedText = fullResponse;
                    block.suggestedTextWithIndent = fullResponseWithIndent;

                    // 清理处理状态
                    this.isProcessing = false;
                    this.activeRequestBlockId = null;
                },
                "QuickEdit",  // feature
                filterRules    // filterRules
            );

        } catch (error) {
            // 清理处理状态
            this.isProcessing = false;
            this.activeRequestBlockId = null;

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
                } else if (action === 'insert') {
                    this.handleInsert(blockId);
                } else if (action === 'reject') {
                    this.handleReject(blockId);
                } else if (action === 'retry') {
                    this.handleRetry(blockId);
                } else if (action === 'cancel') {
                    this.cancelActiveRequest();
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
            } else if (e.key === 'i' && e.ctrlKey) {
                e.preventDefault();
                this.handleInsert(blockId);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                // Check block state: cancel if processing/streaming, reject if reviewing
                const block = this.activeBlocks.get(blockId);
                if (block?.state === 'processing' || block?.state === 'streaming') {
                    // Cancel in-progress request
                    this.cancelActiveRequest();
                } else {
                    // Reject completed suggestion
                    this.handleReject(blockId);
                }
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
            // IMPORTANT: Use SiYuan's transaction API for proper undo/redo support
            // Do NOT modify DOM directly - let SiYuan handle all rendering

            // FIX: Use indented text if available (preserves indentation shown in preview)
            let textToApply = block.suggestedTextWithIndent || block.suggestedText;

            // FIX Issue #1: Apply Markdown formatting for single-block selections
            const isSingleBlock = !block.selectedBlockIds || block.selectedBlockIds.length === 1;
            if (isSingleBlock && block.originalBlockType) {
                textToApply = this.applyMarkdownFormatting(
                    textToApply,
                    block.originalBlockType,
                    block.originalBlockSubtype
                );
            }

            // UNIFIED APPROACH: Split AI-generated content into paragraphs
            // In SiYuan, \n\n separates different blocks (paragraphs)
            // FIX: Support both Unix (\n\n) and Windows (\r\n\r\n) line endings
            const paragraphs = textToApply
                .split(/(?:\r?\n){2,}/)  // Split by 2+ line breaks (supports \n\n and \r\n\r\n)
                .map(p => p.trim())
                .filter(p => p.length > 0);  // Remove empty paragraphs

            // Step 1: Insert ALL paragraphs as new blocks after the last selected block
            // This unified approach uses only insertBlock API for consistency
            const lastOriginalBlockId = block.selectedBlockIds?.[block.selectedBlockIds.length - 1] || block.blockId;
            let previousID = lastOriginalBlockId;

            // FIX High 2.3: Track insertion results for better error handling
            const insertionResults: Array<{ success: boolean; index: number; error?: any }> = [];

            for (let i = 0; i < paragraphs.length; i++) {
                const paragraph = paragraphs[i];

                try {
                    const insertResponse = await fetchWithTimeout('/api/block/insertBlock', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            dataType: 'markdown',
                            data: paragraph,
                            previousID: previousID  // Insert after previous block
                        })
                    });

                    // FIX High 2.3: Check response status before parsing JSON
                    if (!insertResponse.ok) {
                        throw new Error(`HTTP ${insertResponse.status}: ${insertResponse.statusText}`);
                    }

                    const insertResult = await insertResponse.json();
                    if (insertResult.code === 0) {
                        previousID = insertResult.data[0].doOperations[0].id;
                        insertionResults.push({ success: true, index: i });
                    } else {
                        console.warn(`[QuickEdit] Failed to insert paragraph ${i + 1}:`, insertResult);
                        insertionResults.push({ success: false, index: i, error: insertResult });
                    }
                } catch (error) {
                    console.error(`[QuickEdit] Error inserting paragraph ${i + 1}:`, error);
                    insertionResults.push({ success: false, index: i, error });
                }
            }

            // FIX High 2.3: Report results with detailed feedback
            const successCount = insertionResults.filter(r => r.success).length;
            const failureCount = insertionResults.filter(r => !r.success).length;

            if (failureCount > 0) {
                console.warn(`[QuickEdit] ⚠️ Partial success: ${successCount}/${paragraphs.length} paragraphs inserted`);
                showMessage(`⚠️ 部分插入成功 (${successCount}/${paragraphs.length})`, 5000, 'error');
            }

            // Step 2: Wait for SiYuan to render all new content
            await new Promise(resolve => setTimeout(resolve, 300));

            // Step 3: Pause observer before UI cleanup
            this.pauseObserver();

            // Step 4: CRITICAL - Remove comparison block BEFORE deleting original blocks
            // This prevents the "Nested comparison block was removed (parent removed)" error
            // because the comparison block is inserted after the last original block
            if (block.element && document.contains(block.element)) {
                try {
                    this.renderer.removeBlock(block.element);
                } catch (error) {
                    console.warn('[QuickEdit] Failed to remove comparison block:', error);
                }
            }

            // Step 5: Remove red marking from original blocks
            // FIX High 2.4: Use querySelectorAll once instead of N querySelector calls
            if (block.selectedBlockIds && block.selectedBlockIds.length > 0) {
                const selector = block.selectedBlockIds.map(id => `[data-node-id="${id}"]`).join(',');
                const blockElements = document.querySelectorAll(selector);
                blockElements.forEach(el => el.classList.remove('quick-edit-original-block'));
            }

            // Step 6: Delete ALL originally selected blocks (including the first one)
            // This unified approach treats all blocks equally
            // FIX Critical 1.2: Use Promise.all for safer concurrent deletion with error handling
            if (block.selectedBlockIds && block.selectedBlockIds.length > 0) {
                // Delete all blocks concurrently with individual error handling
                const deletePromises = block.selectedBlockIds.map(async (blockIdToDelete, i) => {
                    try {
                        const deleteResponse = await fetchWithTimeout('/api/block/deleteBlock', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: blockIdToDelete
                            })
                        });

                        const deleteResult = await deleteResponse.json();
                        if (deleteResult.code === 0) {
                            return { success: true, blockId: blockIdToDelete };
                        } else {
                            console.warn(`[QuickEdit] Failed to delete block ${blockIdToDelete}:`, deleteResult);
                            return { success: false, blockId: blockIdToDelete, error: deleteResult };
                        }
                    } catch (error) {
                        console.error(`[QuickEdit] Error deleting block ${blockIdToDelete}:`, error);
                        return { success: false, blockId: blockIdToDelete, error };
                    }
                });

                // Wait for all deletions to complete
                const results = await Promise.all(deletePromises);
                const failed = results.filter(r => !r.success);

                if (failed.length > 0) {
                    console.error(`[QuickEdit] Failed to delete ${failed.length}/${results.length} blocks:`, failed);
                    showMessage(`部分块删除失败 (${failed.length}/${results.length})`, 5000, 'error');
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
     * Handle insert - Insert AI content below original text WITHOUT deleting original
     * Similar to handleAccept but skips the deletion step
     */
    private async handleInsert(blockId: string): Promise<void> {
        const block = this.activeBlocks.get(blockId);
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
            const paragraphs = textToApply
                .split(/(?:\r?\n){2,}/)
                .map(p => p.trim())
                .filter(p => p.length > 0);

            // Insert all paragraphs after the last selected block
            const lastOriginalBlockId = block.selectedBlockIds?.[block.selectedBlockIds.length - 1] || block.blockId;
            let previousID = lastOriginalBlockId;

            const insertionResults: Array<{ success: boolean; index: number; error?: any }> = [];

            for (let i = 0; i < paragraphs.length; i++) {
                const paragraph = paragraphs[i];

                try {
                    const insertResponse = await fetchWithTimeout('/api/block/insertBlock', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            dataType: 'markdown',
                            data: paragraph,
                            previousID: previousID
                        })
                    });

                    if (!insertResponse.ok) {
                        throw new Error(`HTTP ${insertResponse.status}: ${insertResponse.statusText}`);
                    }

                    const insertResult = await insertResponse.json();
                    if (insertResult.code === 0) {
                        previousID = insertResult.data[0].doOperations[0].id;
                        insertionResults.push({ success: true, index: i });
                    } else {
                        console.warn(`[QuickEdit] Failed to insert paragraph ${i + 1}:`, insertResult);
                        insertionResults.push({ success: false, index: i, error: insertResult });
                    }
                } catch (error) {
                    console.error(`[QuickEdit] Error inserting paragraph ${i + 1}:`, error);
                    insertionResults.push({ success: false, index: i, error });
                }
            }

            // Report results
            const successCount = insertionResults.filter(r => r.success).length;
            const failureCount = insertionResults.filter(r => !r.success).length;

            if (failureCount > 0) {
                console.warn(`[QuickEdit] ⚠️ Partial success: ${successCount}/${paragraphs.length} paragraphs inserted`);
                showMessage(`⚠️ 部分插入成功 (${successCount}/${paragraphs.length})`, 5000, 'error');
            }

            // Wait for SiYuan to render
            await new Promise(resolve => setTimeout(resolve, 300));

            // Pause observer before UI cleanup
            this.pauseObserver();

            // Remove comparison block
            if (block.element && document.contains(block.element)) {
                try {
                    this.renderer.removeBlock(block.element);
                } catch (error) {
                    console.warn('[QuickEdit] Failed to remove comparison block:', error);
                }
            }

            // Remove red marking from original blocks
            if (block.selectedBlockIds && block.selectedBlockIds.length > 0) {
                const selector = block.selectedBlockIds.map(id => `[data-node-id="${id}"]`).join(',');
                const blockElements = document.querySelectorAll(selector);
                blockElements.forEach(el => el.classList.remove('quick-edit-original-block'));
            }

            // ✨ KEY DIFFERENCE: Do NOT delete original blocks in INSERT mode

            // Wait for SiYuan to complete operations
            await new Promise(resolve => setTimeout(resolve, 500));

            block.markedSpan = null;

            // Resume observer
            this.resumeObserver();

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

            // Final cleanup
            this.cleanupBlock(blockId);

            showMessage('✅ AI 内容已插入到下方（原文保留）', 2000);

        } catch (error) {
            console.error('[QuickEdit] Failed to insert content:', error);
            showMessage(
                `插入失败: ${error instanceof Error ? error.message : String(error)}`,
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

        // FIX High 2.4: Remove red marking from original blocks (optimized DOM query)
        if (block.selectedBlockIds && block.selectedBlockIds.length > 0) {
            const selector = block.selectedBlockIds.map(id => `[data-node-id="${id}"]`).join(',');
            const blockElements = document.querySelectorAll(selector);
            blockElements.forEach(el => el.classList.remove('quick-edit-original-block'));
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
                        return { indent: 0, prefix: '' };
                    }
                }
            }

            if (startNode.nodeType !== Node.TEXT_NODE) {
                return { indent: 0, prefix: '' };
            }

            // 获取整个文本内容
            const textContent = startNode.textContent || '';

            // FIX High 2.2: 向前查找到行首，支持 Windows CRLF (\r\n) 和 Unix LF (\n)
            let lineStart = startOffset;
            while (lineStart > 0) {
                const prevChar = textContent[lineStart - 1];
                // Stop at both \n and \r to handle CRLF correctly
                if (prevChar === '\n' || prevChar === '\r') {
                    break;
                }
                lineStart--;
            }

            // 提取行首到选择起点之间的文本
            const linePrefix = textContent.substring(lineStart, startOffset);

            // 计算前导空白
            const match = linePrefix.match(/^[ \t]*/);
            if (!match || match[0].length === 0) {
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
                            return null;
                        }

                        // 创建Range覆盖整个块
                        const range = document.createRange();
                        range.selectNodeContents(elem);

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


        return blocks;
    }

    /**
     * 提取Range跨越的所有块的完整文本
     * 用于处理用户拖动选择跨多个段落的情况
     */
    private extractMultiBlockText(range: Range): { text: string; blocks: HTMLElement[] } | null {
        try {
            // 策略1: 尝试从Range的cloneContents中提取块
            let selectedBlocks = this.extractBlocksFromRange(range);

            // 如果cloneContents方法没找到块，或只找到1个块，尝试其他方法
            if (selectedBlocks.length === 0) {

                // 策略2: 找到起始和结束块，用兄弟遍历
                const startBlock = this.findBlockElement(range.startContainer);
                const endBlock = this.findBlockElement(range.endContainer);

                if (!startBlock || !endBlock) {
                    return null;
                }

                // 如果是同一个块，直接返回
                if (startBlock === endBlock) {
                    const text = (startBlock.textContent || '').trim();
                    return {
                        text,
                        blocks: [startBlock]
                    };
                }

                // 尝试兄弟遍历
                selectedBlocks = this.findBlocksBetween(startBlock, endBlock);

                // 如果兄弟遍历也失败，使用commonAncestor方法
                if (selectedBlocks.length === 0) {

                    const commonAncestor = range.commonAncestorContainer;

                    const allBlocks = this.findAllBlocksInContainer(commonAncestor);

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
                }
            } else if (selectedBlocks.length === 1) {

                // 验证是否真的只选了一个块
                const startBlock = this.findBlockElement(range.startContainer);
                const endBlock = this.findBlockElement(range.endContainer);

                if (startBlock && endBlock && startBlock !== endBlock) {
                    const siblingBlocks = this.findBlocksBetween(startBlock, endBlock);
                    if (siblingBlocks.length > 1) {
                        selectedBlocks = siblingBlocks;
                    }
                }
            }

            // 提取所有块的完整文本内容
            const texts = selectedBlocks
                .map(block => (block.textContent || '').trim())
                .filter(t => t.length > 0);

            const finalText = texts.join('\n\n');


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

            if (blocks.length > 0) {
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
    
            // 模式1: 块选择模式 - 检查思源的块选择（.protyle-wysiwyg--select）
            const selectedBlocks = this.getSelectedBlocks();

            if (selectedBlocks.length > 0) {

                // 提取所有选中块的文本内容
                const texts = selectedBlocks
                    .map(block => (block.textContent || '').trim())
                    .filter(t => t.length > 0);

                const text = texts.join('\n\n');

                if (!text || !text.trim()) {
                        return null;
                }

                // ✅ Extract all block IDs for multi-block selection support
                const selectedBlockIds = selectedBlocks.map(b => b.getAttribute('data-node-id')).filter(Boolean) as string[];


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

            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
                return null;
            }


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
                } else {
                    // Fallback：单块文本选择
                    text = primaryRange.toString();
                    if (!text || !text.trim()) {
                        const clonedContents = primaryRange.cloneContents();
                        text = clonedContents.textContent || '';
                    }
                }
            } else {
                // 多个Range - 合并
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
            }

            if (!text || !text.trim()) {
                return null;
            }


            // 查找包含选区的块元素
            const blockElement = this.findBlockElement(primaryRange!.commonAncestorContainer);

            if (!blockElement) {
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
            } else {
                // Single block selection: use the primary block ID
                selectedBlockIds = [blockId];
            }

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
     * Handle preset switch (global configuration change)
     */
    private handlePresetSwitch(presetId: string): void {

        const preset = this.configManager.getAllTemplates().find(t => t.id === presetId);
        if (!preset) {
            console.error(`[QuickEdit] Preset ${presetId} not found`);
            showMessage('❌ 预设不存在', 2000, 'error');
            return;
        }

        // Apply preset to current configuration (global switch)
        const activeProfile = this.configManager.getActiveProfile();
        this.configManager.updateProfile(activeProfile.id, {
            settings: {
                ...activeProfile.settings,
                systemPrompt: preset.systemPrompt,
                appendedPrompt: preset.appendedPrompt
            }
        });

        // Update Claude client with new settings
        this.claudeClient.updateSettings(this.configManager.getActiveProfile().settings);

        showMessage(`✅ 已切换到预设: ${preset.name}`, 2000, 'info');
    }

    /**
     * Update settings
     */
    public updateSettings(settings: EditSettings): void {
        this.settings = settings;
        // Use unified presets from ConfigManager (Tab 1)
        const presets = this.configManager.getAllTemplates();
        this.inputPopup = new InstructionInputPopup(presets, this.configManager);
    }

    /**
     * Cleanup - FIX: Proper cleanup of all resources
     */
    public destroy(): void {

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

    }

    /**
     * Get currently active preset ID from localStorage
     * Used to fetch preset-level filterRules
     */
    private getCurrentPresetId(): string | undefined {
        try {
            const lastPresetId = localStorage.getItem('claude-quick-edit-last-preset-index');
            if (!lastPresetId || lastPresetId === 'custom') {
                return undefined;
            }

            // Verify preset exists in ConfigManager
            const allTemplates = this.configManager.getAllTemplates();
            const preset = allTemplates.find((t: any) => t.id === lastPresetId);

            return preset ? lastPresetId : undefined;
        } catch (error) {
            console.warn('[QuickEdit] Failed to get current preset ID:', error);
            return undefined;
        }
    }
}
