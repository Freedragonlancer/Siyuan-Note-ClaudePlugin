/**
 * Quick Edit Coordinator - Orchestrates inline edit workflow
 *
 * Refactored v0.18.0: Renamed from QuickEditManager
 * - Delegates selection handling to SelectionHandler
 * - Delegates prompt building to PromptBuilder
 * - Delegates state management to EditStateManager
 * - Delegates actions to ActionHandler
 * - Delegates AI requests to AIRequestHandler
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
import { InstructionHistoryManager } from './InstructionHistoryManager';
import { AIEditProcessor } from '@/editor/AIEditProcessor';
import { EditHistory } from '@/editor/EditHistory';
import { ClaudeClient } from '@/claude';
import type { ConfigManager } from '@/settings/ConfigManager';
import { ContextExtractor } from './ContextExtractor';
import { EditorHelper } from '@/editor/EditorHelper';
import { SimpleCache } from '@/utils/Performance';
import { Logger } from '@/utils/Logger';
import { PresetSelectionManager } from '@/settings/PresetSelectionManager';
import type { PresetEvent } from '@/settings/PresetEventBus';
import { BlockOperations } from './BlockOperations';
import { SelectionHandler } from './SelectionHandler';
import { PromptBuilder } from './PromptBuilder';
import { EditStateManager } from './EditStateManager';
import { ActionHandler } from './ActionHandler';
import { AIRequestHandler } from './AIRequestHandler';

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

export class QuickEditCoordinator {
    private plugin: Plugin;
    private claudeClient: ClaudeClient;
    private history: EditHistory;
    private settings: EditSettings;
    private configManager: ConfigManager;

    // Inline edit components
    private renderer: InlineEditRenderer;
    private inputPopup: InstructionInputPopup;
    private historyManager: InstructionHistoryManager;
    private processor: AIEditProcessor;
    private contextExtractor: ContextExtractor;
    private blockOps: BlockOperations;
    private selectionHandler: SelectionHandler;
    private promptBuilder: PromptBuilder;
    private stateManager: EditStateManager;
    private actionHandler: ActionHandler;
    private aiRequestHandler: AIRequestHandler;

    // Preset selection management (NEW v0.9.0 - unified preset selection)
    private presetSelectionManager: PresetSelectionManager;
    private presetEventUnsubscribe: (() => void) | null = null;

    // FIX Critical 1.1: DOM query cache to reduce repeated queries
    private domCache: SimpleCache<any>;
    private logger = Logger.createScoped('QuickEdit');

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

        // FIX Critical 1.1: Initialize DOM cache (1 second TTL, max 50 entries)
        this.domCache = new SimpleCache(1000, 50);

        // Initialize BlockOperations for optimized bulk operations
        this.blockOps = new BlockOperations();

        // Initialize SelectionHandler for text/block selection extraction
        this.selectionHandler = new SelectionHandler();

        // Initialize EditStateManager for centralized state management
        this.stateManager = new EditStateManager();

        // NEW v0.9.0: Initialize PresetSelectionManager
        this.presetSelectionManager = new PresetSelectionManager(plugin, configManager);
        // Initialize asynchronously (non-blocking)
        this.presetSelectionManager.init().catch((error) => {
            this.logger.warn('Failed to initialize PresetSelectionManager:', error);
        });

        // Initialize instruction history manager
        this.historyManager = new InstructionHistoryManager(plugin);
        // Initialize asynchronously (non-blocking)
        this.historyManager.init().catch((error) => {
            this.logger.warn('Failed to initialize InstructionHistoryManager:', error);
        });

        // Initialize components
        this.renderer = new InlineEditRenderer();
        // Use unified presets from ConfigManager (Tab 1)
        const presets = this.configManager.getAllTemplates();
        // NEW v0.9.0: Pass PresetSelectionManager and InstructionHistoryManager to InstructionInputPopup
        this.inputPopup = new InstructionInputPopup(presets, this.configManager, this.presetSelectionManager, this.historyManager);
        this.processor = new AIEditProcessor(claudeClient);
        this.contextExtractor = new ContextExtractor(new EditorHelper());

        // Initialize PromptBuilder with dependencies for Quick Edit workflow
        this.promptBuilder = new PromptBuilder(this.contextExtractor);
        this.promptBuilder.setDependencies(this.configManager, this.claudeClient);

        // Initialize ActionHandler with dependencies (using stateManager)
        this.actionHandler = new ActionHandler({
            renderer: this.renderer,
            blockOps: this.blockOps,
            history: this.history,
            claudeClient: this.claudeClient,
            getActiveBlock: (blockId) => this.stateManager.getActiveBlock(blockId),
            removeActiveBlock: (blockId) => this.stateManager.removeActiveBlock(blockId),
            getKeyboardHandler: (blockId) => this.stateManager.getKeyboardHandler(blockId),
            removeKeyboardHandler: (blockId) => this.stateManager.unregisterKeyboardHandler(blockId),
            getActiveRequestBlockId: () => this.stateManager.getActiveRequestBlockId(),
            clearActiveRequestBlockId: () => this.stateManager.setActiveRequestBlockId(null),
            setProcessing: (p) => this.stateManager.setProcessing(p),
            pauseObserver: () => this.stateManager.pauseObserver(),
            resumeObserver: () => this.stateManager.resumeObserver(),
            onRetry: (block) => this.processInlineEdit(block)
        });

        // Initialize AIRequestHandler with dependencies (using stateManager)
        // v0.19.0: Added selectionHandler for multimodal image extraction
        this.aiRequestHandler = new AIRequestHandler({
            renderer: this.renderer,
            promptBuilder: this.promptBuilder,
            claudeClient: this.claudeClient,
            configManager: this.configManager,
            settings: this.settings,
            selectionHandler: this.selectionHandler,  // v0.19.0: For image extraction
            getCurrentPresetId: () => this.getCurrentPresetId(),
            setProcessing: (p) => this.stateManager.setProcessing(p),
            setActiveRequestBlockId: (id) => this.stateManager.setActiveRequestBlockId(id),
            onAccept: (blockId) => this.actionHandler.handleAccept(blockId),
            onInsert: (blockId) => this.actionHandler.handleInsert(blockId)
        });

        // Setup popup callbacks
        this.inputPopup.setCallbacks({
            onSubmit: (instruction) => this.handleInstructionSubmit(instruction),
            onCancel: () => {
                this.stateManager.setPendingSelection(null);
            },
            onPresetSwitch: (presetId) => this.handlePresetSwitch(presetId)
        });

        // FIX 1.5: Setup MutationObserver to detect DOM changes
        this.setupDOMObserver();

        // NEW v0.9.0: Subscribe to preset events for automatic UI refresh
        this.subscribeToPresetEvents();

        this.logger.info('QuickEditManager initialized');
    }

    /**
     * FIX 1.5: Setup MutationObserver to detect when comparison blocks are removed
     * Now delegates to stateManager for observer management
     */
    private setupDOMObserver(): void {
        this.stateManager.setupDOMObserver((blockId) => {
            this.handleBlockRemovedByExternal(blockId);
        });
    }

    /**
     * Start observing a container for DOM changes
     */
    private observeContainer(container: HTMLElement): void {
        this.stateManager.observeContainer(container);
    }

    /**
     * FIX 1.5: Handle when a comparison block is removed externally (e.g., by SiYuan undo)
     */
    private handleBlockRemovedByExternal(blockId: string): void {
        const block = this.stateManager.getActiveBlock(blockId);
        if (!block) return;

        // No marked span to clean up (we disabled marking to avoid DOM conflicts)
        block.markedSpan = null;

        // Clean up event listeners and references
        this.cleanupBlock(blockId);

        // Optionally notify user
        showMessage('⚠️ AI 编辑已被撤销操作移除', 2000, 'info');
    }

    /**
     * NEW v0.9.0: Subscribe to preset events for automatic UI synchronization
     * Eliminates manual refresh requirements
     */
    private subscribeToPresetEvents(): void {
        const eventBus = this.configManager.getEventBus();

        // Subscribe to all preset change events
        this.presetEventUnsubscribe = eventBus.subscribeAll((event: PresetEvent) => {
            this.logger.debug(`Preset event received: ${event.type} (${event.presetId})`);

            // Auto-refresh presets in UI when any change occurs
            switch (event.type) {
                case 'created':
                case 'updated':
                case 'deleted':
                case 'imported':
                    this.refreshPresets();
                    this.logger.debug(`Auto-refreshed presets after ${event.type} event`);
                    break;
                case 'selected':
                    // Selection changes don't require preset list refresh
                    this.logger.debug(`Preset selection changed to: ${event.presetId}`);
                    break;
            }
        });

        this.logger.info('Subscribed to preset events for automatic UI sync');
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
        if (this.stateManager.isCurrentlyProcessing()) {
            console.warn('[QuickEdit] Rejected: another Quick Edit is already in progress');
            showMessage('⚠️ 已有一个快速编辑正在进行中，请等待完成', 2000, 'info');
            return;
        }

        // 使用 SelectionHandler 获取文本/块选择 (已内置 fallback 逻辑)
        const selection = this.selectionHandler.getSelection();

        if (!selection) {
            // 既无文本选择也无块选择
            showMessage('请先选中要编辑的文本或将光标放在要编辑的块中', 3000);
            return;
        }

        // FIX 1.2: Store selection in stateManager instead of instance property
        this.stateManager.setPendingSelection(selection);

        // Refresh presets to ensure we have the latest data (including custom templates)
        // This is critical for first-time load when ConfigManager is still loading templates
        this.refreshPresets();

        // Show instruction input popup
        // FIX: 使用块元素位置而非 Range.getBoundingClientRect()，避免滚动导致的位置错误
        let popupPosition: { x: number; y: number; placement: 'below' | 'above'; anchorRect: DOMRect };

        try {
            // 优先使用块元素的位置（更稳定）
            const blockRect = selection.blockElement.getBoundingClientRect();

            // 如果块元素可见（在视口内），使用块元素位置
            if (blockRect.top >= 0 && blockRect.top < window.innerHeight) {
                popupPosition = {
                    x: blockRect.left,
                    y: blockRect.bottom + 10,
                    placement: 'below' as const,
                    anchorRect: {
                        top: blockRect.top,
                        bottom: blockRect.bottom,
                        left: blockRect.left,
                        right: blockRect.right,
                        width: blockRect.width,
                        height: blockRect.height
                    } as DOMRect
                };
            } else {
                // 块不可见，使用 Range 位置作为回退
                const rect = selection.range.getBoundingClientRect();
                popupPosition = {
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
                    } as DOMRect
                };
            }
        } catch (error) {
            console.error('[QuickEdit] Error calculating popup position:', error);
            // 使用屏幕中心作为最后的回退
            popupPosition = {
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
                placement: 'below' as const,
                anchorRect: {
                    top: 0,
                    bottom: 0,
                    left: 0,
                    right: 0,
                    width: 0,
                    height: 0
                } as DOMRect
            };
        }

        // Don't pass quickEditDefaultInstruction - let popup handle defaults via preset system
        // NEW v0.9.0: show() is now async, but fire-and-forget for UI responsiveness
        this.inputPopup.show(popupPosition, '').catch((error) => {
            this.logger.error('Failed to show instruction popup:', error);
        });
    }

    /**
     * Cancel the currently active Quick Edit request
     * Delegates to ActionHandler for the actual cancellation logic
     */
    public cancelActiveRequest(): void {
        this.actionHandler.cancelActiveRequest();
    }

    /**
     * Handle instruction submit
     */
    private async handleInstructionSubmit(instruction: string): Promise<void> {
        // 设置处理中标志，防止并发
        this.stateManager.setProcessing(true);

        // Use stateManager for selection
        const selection = this.stateManager.getPendingSelection();
        if (!selection) {
            console.error('[QuickEdit] No selection found');
            this.stateManager.setProcessing(false);
            return;
        }

        // Clear immediately to prevent reuse
        this.stateManager.setPendingSelection(null);

        // ✨ Phase 2.1: 清除选中状态，移除灰色遮罩
        // 清除文本选中
        const windowSelection = window.getSelection();
        if (windowSelection) {
            windowSelection.removeAllRanges();
        }

        // 清除块选中状态 - FIX Critical 1.1: Use cached query
        const cacheKey = 'selected-blocks';
        let selectedBlocks = this.domCache.get(cacheKey);
        if (!selectedBlocks) {
            selectedBlocks = document.querySelectorAll('.protyle-wysiwyg--select');
            this.domCache.set(cacheKey, selectedBlocks);
        }
        selectedBlocks.forEach((el: Element) => el.classList.remove('protyle-wysiwyg--select'));
        // Invalidate cache after modification
        this.domCache.delete(cacheKey);

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

        this.stateManager.addActiveBlock(blockId, inlineBlock);

        // 设置活动请求ID，用于取消功能
        this.stateManager.setActiveRequestBlockId(blockId);

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

        // FIX v5: 在正确的容器中查找块元素
        // 思源在多个位置存储 data-node-id（面包屑、正文等），必须在 .protyle-wysiwyg 中查找
        let lastBlockElement: HTMLElement | null = null;

        // 尝试查找目标块（最多重试3次）
        for (let attempt = 1; attempt <= 3; attempt++) {
            // FIX: 必须在 .protyle-wysiwyg 容器内查找，避免找到面包屑等其他元素
            lastBlockElement = document.querySelector(`.protyle-wysiwyg [data-node-id="${lastBlockId}"]`) as HTMLElement;

            if (lastBlockElement) {
                break;
            }

            // 如果第一次查找失败，尝试滚动到选中的块元素
            if (attempt === 1 && selection.blockElement && document.contains(selection.blockElement)) {
                // FIX Performance: 使用 RAF 避免强制重排
                await new Promise<void>(resolve => {
                    requestAnimationFrame(() => {
                        selection.blockElement.scrollIntoView({
                            behavior: 'smooth',
                            block: 'center'
                        });
                        // 等待滚动和渲染完成
                        setTimeout(resolve, 300);
                    });
                });
            } else if (attempt === 2) {
                // 第二次尝试：等待更长时间
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // FIX High 2.1: Add null safety checks for DOM elements
        if (!lastBlockElement && !selection.blockElement) {
            console.error(`[QuickEdit] ❌ Cannot find block element for ${lastBlockId} or fallback after 3 attempts, aborting`);
            this.stateManager.removeActiveBlock(blockId);
            this.stateManager.setProcessing(false);
            this.stateManager.setActiveRequestBlockId(null);
            showMessage('❌ 无法定位目标块，请重试或刷新页面', 5000, 'error');
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
            this.stateManager.removeActiveBlock(blockId);
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

        // 确保预览区块在可见区域
        requestAnimationFrame(() => {
            blockElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });

        // Start AI processing (using new AIRequestHandler)
        await this.aiRequestHandler.processEdit(inlineBlock);
    }

    /**
     * Process inline edit with AI
     * @deprecated Phase 4: Use aiRequestHandler.processEdit() instead. Kept for ActionHandler retry callback.
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

            // Build prompt using PromptBuilder (Refactored v0.18.0)
            const currentPresetId = await this.getCurrentPresetId();
            const promptResult = await this.promptBuilder.buildQuickEditPrompt({
                instruction: block.instruction,
                originalText: block.originalText,
                blockIds: block.selectedBlockIds || [],
                presetId: currentPresetId || undefined
            });

            const { userPrompt, systemPrompt: presetSystemPrompt, filterRules } = promptResult;

            // Diagnostic logging for request parameters
            this.logger.debug(`Request params - UserPrompt: ${userPrompt.length} chars, FilterRules: ${filterRules.length}, SystemPrompt: ${presetSystemPrompt ? 'preset' : 'global'}, Preset: ${promptResult.presetName || 'none'}`);

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
                    this.stateManager.setProcessing(false);
                    this.stateManager.setActiveRequestBlockId(null);

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

                        // Check auto action setting - read from ConfigManager for live updates
                        const currentProfile = this.configManager.getActiveProfile();
                        const autoAction = currentProfile?.settings?.editSettings?.quickEditAutoAction || 'preview';

                        if (autoAction === 'preview') {
                            // Default: show review buttons
                            this.renderer.completeStreaming(block.element);
                        } else {
                            // Auto mode: show hint, then auto-apply
                            this.renderer.completeStreamingAutoMode(block.element, autoAction);

                            // Delay to let user see the result, then auto-apply
                            setTimeout(() => {
                                if (autoAction === 'replace') {
                                    this.actionHandler.handleAccept(block.id);
                                } else if (autoAction === 'insert') {
                                    this.actionHandler.handleInsert(block.id);
                                }
                            }, 500);
                        }
                    }

                    // Save final joined responses
                    block.suggestedText = fullResponse;
                    block.suggestedTextWithIndent = fullResponseWithIndent;

                    // 清理处理状态
                    this.stateManager.setProcessing(false);
                    this.stateManager.setActiveRequestBlockId(null);
                },
                "QuickEdit",         // feature
                filterRules,         // filterRules
                presetSystemPrompt   // FIX: systemPrompt - 优先使用 preset 的 systemPrompt，否则使用全局的
            );

        } catch (error) {
            // 清理处理状态
            this.stateManager.setProcessing(false);
            this.stateManager.setActiveRequestBlockId(null);

            block.state = 'error' as InlineEditState;
            block.error = error instanceof Error ? error.message : String(error);

            // FIX: Remove block marking on error (consistent with onError callback)
            if (block.selectedBlockIds && block.selectedBlockIds.length > 0) {
                const selector = block.selectedBlockIds.map(id => `[data-node-id="${id}"]`).join(',');
                const blockElements = document.querySelectorAll(selector);
                blockElements.forEach(el => el.classList.remove('quick-edit-original-block'));
            }

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
                    this.actionHandler.handleAccept(blockId);
                } else if (action === 'insert') {
                    this.actionHandler.handleInsert(blockId);
                } else if (action === 'reject') {
                    this.actionHandler.handleReject(blockId);
                } else if (action === 'retry') {
                    this.actionHandler.handleRetry(blockId);
                } else if (action === 'cancel') {
                    this.actionHandler.cancelActiveRequest();
                }
            });
        });

        // FIX 1.1: Store keyboard handler for cleanup (using stateManager)
        const keyHandler = (e: KeyboardEvent) => {
            // Only handle if this block is still active
            if (!this.stateManager.getActiveBlock(blockId)) return;

            // Only handle if block element or descendants have focus
            const block = this.stateManager.getActiveBlock(blockId);
            if (!block?.element || !block.element.contains(document.activeElement as Node)) {
                return; // Don't interfere with other elements
            }

            if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault();
                this.actionHandler.handleAccept(blockId);
            } else if (e.key === 'i' && e.ctrlKey) {
                e.preventDefault();
                this.actionHandler.handleInsert(blockId);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                // Check block state: cancel if processing/streaming, reject if reviewing
                const currentBlock = this.stateManager.getActiveBlock(blockId);
                if (currentBlock?.state === 'processing' || currentBlock?.state === 'streaming') {
                    // Cancel in-progress request
                    this.actionHandler.cancelActiveRequest();
                } else {
                    // Reject completed suggestion
                    this.actionHandler.handleReject(blockId);
                }
            } else if (e.key === 'r' && e.ctrlKey) {
                e.preventDefault();
                this.actionHandler.handleRetry(blockId);
            }
        };

        this.stateManager.registerKeyboardHandler(blockId, keyHandler);
    }

    /**
     * FIX 1.1: Clean up block and its event listeners
     * Now delegates to stateManager for state cleanup
     */
    private cleanupBlock(blockId: string): void {
        // Remove keyboard handler via stateManager
        this.stateManager.unregisterKeyboardHandler(blockId);

        // Remove from active blocks via stateManager
        this.stateManager.removeActiveBlock(blockId);
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
     * Handle preset switch (global configuration change)
     * NEW v0.9.0: Now uses PresetSelectionManager
     */
    private handlePresetSwitch(presetId: string): void {
        const preset = this.configManager.getTemplateById(presetId);
        if (!preset) {
            this.logger.error(`Preset ${presetId} not found`);
            showMessage('❌ 预设不存在', 2000, 'error');
            return;
        }

        // Save preset selection (async, but fire-and-forget for UI responsiveness)
        this.presetSelectionManager.setCurrentPreset(presetId).catch((error) => {
            this.logger.error('Failed to save preset selection:', error);
        });

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
        // NEW v0.9.0: Pass PresetSelectionManager to InstructionInputPopup
        this.inputPopup = new InstructionInputPopup(presets, this.configManager, this.presetSelectionManager);
    }

    /**
     * Refresh presets list in input popup
     * Call this when presets are added/updated/deleted
     */
    public refreshPresets(): void {
        const presets = this.configManager.getAllTemplates();
        this.inputPopup.updatePresets(presets);
        console.log('[QuickEditCoordinator] Presets refreshed, count:', presets.length);
    }

    /**
     * Cleanup - FIX: Proper cleanup of all resources
     */
    public destroy(): void {

        // Clear all typing animations
        this.renderer.cleanup();

        // Close popup
        this.inputPopup.close();

        // FIX Critical 1.1: Improved cleanup order to prevent memory leaks

        // Step 1: Remove all active blocks from DOM before destroying state
        const activeBlocks = this.stateManager.getAllActiveBlocks();
        activeBlocks.forEach((block) => {
            if (block.element) {
                this.renderer.removeBlock(block.element);
            }
        });

        // Step 2: Destroy state manager (handles observer, handlers, blocks, selection)
        if (this.stateManager) {
            this.stateManager.destroy();
        }

        // Step 3: Destroy DOM cache
        if (this.domCache) {
            this.domCache.destroy();
        }

        // Step 4: Unsubscribe from preset events (NEW v0.9.0)
        if (this.presetEventUnsubscribe) {
            this.presetEventUnsubscribe();
            this.presetEventUnsubscribe = null;
        }

        // Step 5: Cleanup history manager
        if (this.historyManager) {
            this.historyManager.destroy();
        }

        this.logger.info('QuickEditManager destroyed, all resources cleaned up');
    }


    /**
     * Get currently active preset ID
     * NEW v0.9.0: Simplified using PresetSelectionManager
     *
     * @returns Current preset ID or undefined if no preset selected
     */
    private async getCurrentPresetId(): Promise<string | undefined> {
        try {
            const presetId = await this.presetSelectionManager.getCurrentPresetId();
            return presetId ?? undefined;
        } catch (error) {
            this.logger.error('Failed to get current preset ID:', error);
            return undefined;
        }
    }
}
