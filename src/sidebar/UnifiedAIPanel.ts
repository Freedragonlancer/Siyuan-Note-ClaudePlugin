/**
 * Unified AI Panel - Combined Chat and Edit Interface
 *
 * This panel integrates both conversational chat with Claude and AI-powered
 * text editing in a single interface with collapsible queue region.
 */

import type { ClaudeClient } from "../claude/ClaudeClient";
import type {
    UnifiedMessage,
    ChatMessage,
    EditMessage,
    EditQueueState,
    UnifiedPanelConfig
} from "./unified-types";
import type { TextSelection, EditEvent } from "../editor/types";
import type { IProtyle } from "../types/siyuan";
import { isChatMessage, isEditMessage, DEFAULT_UNIFIED_PANEL_CONFIG } from "./unified-types";
import { TextSelectionManager } from "../editor/TextSelectionManager";
import { AIEditProcessor } from "../editor/AIEditProcessor";
import { EditQueue } from "../editor/EditQueue";
import { DiffRenderer } from "../editor/DiffRenderer";
import { EditorHelper } from "../editor";
import { ContextExtractor } from "../quick-edit/ContextExtractor";
import { DEFAULT_SELECTION_QA_TEMPLATE } from "../settings/config-types";
import { SecurityUtils } from "../utils/Security";
import { UnifiedPanelUIBuilder } from "./unified/ui/UnifiedPanelUIBuilder";
import { UnifiedPanelHelpers } from "./unified/UnifiedPanelHelpers";
import { MessageRenderer } from "./unified/MessageRenderer";
import { SelectionManager } from "./unified/SelectionManager";
import { PresetManager } from "./unified/PresetManager";
import { QueueRenderer } from "./unified/QueueRenderer";
import type { PresetEvent } from "../settings/PresetEventBus";
import { marked } from "marked";
import hljs from "highlight.js";
import DOMPurify from "dompurify";
// Multimodal support (v0.19.0)
import type { ImageContent, ImageMediaType, ContentBlock } from "../claude/types";
import { createImageContent, detectMediaType, parseDataUrl, createMultimodalMessage } from "../claude/types";
import { BlockOperations } from "../quick-edit/BlockOperations";

export class UnifiedAIPanel {
    // Core dependencies
    private element: HTMLElement;
    private claudeClient: ClaudeClient;
    private currentProtyle: IProtyle | null = null;

    // Chat state
    private messages: UnifiedMessage[] = [];
    private isStreaming: boolean = false;
    private activeChatPresetId: string = 'default'; // Active preset for chat

    // Multimodal state (v0.19.0) - pending images for next message
    private pendingImages: Array<{
        id: string;
        dataUrl: string;
        base64: string;
        mediaType: ImageMediaType;
        fileName: string;
    }> = [];

    // Block operations for saving AI-generated images (v0.19.0)
    private blockOperations: BlockOperations;

    // Edit state
    private textSelectionManager: TextSelectionManager;
    private aiEditProcessor: AIEditProcessor;
    private editQueue: EditQueue;
    private diffRenderer: DiffRenderer;
    private contextExtractor: ContextExtractor;
    private editQueueState: EditQueueState = {
        expanded: false,
        queueSize: 0,
        processingCount: 0
    };

    // Panel mode state (for automatic mode switching)
    private panelMode: 'freeChat' | 'selectionQA' = 'freeChat';
    private currentSelection: {
        blockIds: string[];
        text: string;
        timestamp: number;
    } | null = null;
    private selectionCheckInterval: number | null = null;

    // Legacy edit mode state (kept for Edit Queue functionality)
    private isEditMode: boolean = false;
    private editModeSelection: TextSelection | null = null;
    private editModeShowDiff: boolean = true;

    // Configuration
    private config: UnifiedPanelConfig;
    private onSettingsCallback?: () => void;

    // UI References
    private queueRegion?: HTMLElement;
    private messagesContainer?: HTMLElement;
    private diffContainer?: HTMLElement;

    // Preset event subscription (NEW v0.9.0)
    private presetEventUnsubscribe: (() => void) | null = null;

    // Preset selector population retry counter
    private populateSelectorRetries = 0;
    private readonly MAX_POPULATE_RETRIES = 3;

    // Initialization flag to prevent event loops during startup
    private isInitializing: boolean = true;

    constructor(
        claudeClient: ClaudeClient,
        textSelectionManager: TextSelectionManager,
        aiEditProcessor: AIEditProcessor,
        editQueue: EditQueue,
        diffRenderer: DiffRenderer,
        onSettings?: () => void,
        config?: Partial<UnifiedPanelConfig>
    ) {
        this.claudeClient = claudeClient;
        this.textSelectionManager = textSelectionManager;
        this.aiEditProcessor = aiEditProcessor;
        this.editQueue = editQueue;
        this.diffRenderer = diffRenderer;
        this.contextExtractor = new ContextExtractor(new EditorHelper());
        this.blockOperations = new BlockOperations();  // v0.19.0: For saving AI-generated images
        this.onSettingsCallback = onSettings;
        this.config = { ...DEFAULT_UNIFIED_PANEL_CONFIG, ...config };

        // Configure markdown
        this.configureMarkdown();

        // Create UI
        this.element = this.createPanel();

        // Initialize preset loading asynchronously (deferred)
        // Set to 'default' initially, will be updated after file storage loads
        this.activeChatPresetId = 'default';

        // Load persisted AI Dock preset selection asynchronously
        this.loadAIDockPresetSelection()
            .then((presetId) => {
                this.activeChatPresetId = presetId;
                console.log('[UnifiedAIPanel] Constructor - active preset loaded:', presetId);

                // Update UI after preset loaded
                const selector = this.element.querySelector('#claude-preset-selector') as HTMLSelectElement;
                if (selector) {
                    selector.value = presetId;
                }

                // ONLY notify if not initializing (prevents event loop during startup)
                if (!this.isInitializing) {
                    this.notifyAIDockPresetSelection(presetId);
                }
            })
            .catch((error) => {
                console.warn('[UnifiedAIPanel] Failed to load AI Dock preset:', error);
            })
            .finally(() => {
                // Clear initialization flag after preset loading completes
                this.isInitializing = false;
                console.log('[UnifiedAIPanel] Initialization complete, event notifications enabled');
            });

        // Populate preset selector
        this.populatePresetSelector();

        // NEW v0.9.0: Subscribe to preset events for automatic UI refresh
        this.subscribeToPresetEvents();

        // Setup event listeners
        this.attachEventListeners();

        // Listen to edit events
        this.textSelectionManager.addEventListener((event) => this.handleEditEvent(event));

        // Load queue state from localStorage
        this.loadQueueState();

        // Start selection monitoring for automatic mode switching
        this.startSelectionMonitoring();

        // Initialize provider info badge
        setTimeout(() => this.updateProviderInfoBadge(), 100);
    }

    //#region Selection Monitoring & Mode Switching

    /**
     * Start monitoring for block selection changes every 300ms
     */
    private startSelectionMonitoring(): void {
        if (this.selectionCheckInterval !== null) {
            return; // Already monitoring
        }

        // Check every 300ms
        this.selectionCheckInterval = window.setInterval(() => {
            this.checkAndUpdateSelection();
        }, 300);

        console.log('[UnifiedAIPanel] Selection monitoring started');
    }

    /**
     * Stop selection monitoring
     */
    private stopSelectionMonitoring(): void {
        if (this.selectionCheckInterval !== null) {
            clearInterval(this.selectionCheckInterval);
            this.selectionCheckInterval = null;
            console.log('[UnifiedAIPanel] Selection monitoring stopped');
        }
    }

    /**
     * Get currently selected blocks from the editor
     */
    private getSelectedBlocks(): Element[] {
        return SelectionManager.getSelectedBlocks();
    }

    /**
     * Check for selection changes and update mode accordingly
     */
    private checkAndUpdateSelection(): void {
        const selectedBlocks = this.getSelectedBlocks();

        if (selectedBlocks.length > 0) {
            // Extract block IDs and text content using SelectionManager
            const blockIds = SelectionManager.extractBlockIds(selectedBlocks);
            const text = SelectionManager.extractBlockText(selectedBlocks);

            // Check if selection changed
            const selectionChanged = SelectionManager.hasSelectionChanged(
                this.currentSelection?.blockIds || null,
                blockIds
            );

            if (selectionChanged) {
                this.currentSelection = {
                    blockIds,
                    text,
                    timestamp: Date.now()
                };

                this.switchToSelectionQAMode();
            }
        } else {
            // No selection - switch to free chat if we had a selection before
            if (this.currentSelection) {
                this.currentSelection = null;
                this.switchToFreeChatMode();
            }
        }
    }

    /**
     * Switch to Selection Q&A mode
     */
    private switchToSelectionQAMode(): void {
        if (this.panelMode === 'selectionQA') {
            // Already in this mode, just update UI
            this.updateModeUI();
            return;
        }

        this.panelMode = 'selectionQA';
        this.updateModeUI();
        console.log('[UnifiedAIPanel] Switched to Selection Q&A mode');
    }

    /**
     * Switch to Free Chat mode
     */
    private switchToFreeChatMode(): void {
        if (this.panelMode === 'freeChat') {
            // Already in this mode
            return;
        }

        this.panelMode = 'freeChat';
        this.updateModeUI();
        console.log('[UnifiedAIPanel] Switched to Free Chat mode');
    }

    /**
     * Update UI to reflect current mode
     */
    private updateModeUI(): void {
        const modeBadge = this.element.querySelector('#claude-mode-badge') as HTMLElement;
        const blockCount = this.currentSelection?.blockIds.length;
        
        SelectionManager.updateModeBadge(modeBadge, this.panelMode, blockCount);
    }

    /**
     * Clear current selection (called when user cancels or completes an action)
     */
    private clearCurrentSelection(): void {
        // Store selection info before clearing (for user feedback)
        const blockCount = this.currentSelection?.blockIds.length || 0;

        // ===== STEP 1: Clear DOM Selection States =====
        
        SelectionManager.clearDOMSelection();

        // ===== STEP 2: Update Internal State =====

        // Clear internal state
        this.currentSelection = null;

        // Switch to Free Chat mode (updates mode badge)
        this.switchToFreeChatMode();

        // ===== STEP 3: User Feedback =====

        // Show toast message with block count
        if (blockCount > 0) {
            this.addSystemMessage(`✅ 已取消选择 (${blockCount} 个块)`);
        } else {
            this.addSystemMessage(`✅ 已取消选择`);
        }

        console.log('[UnifiedAIPanel] Selection cleared successfully');
    }

    //#endregion

    //#region Markdown Configuration
    private configureMarkdown() {
        MessageRenderer.configureMarkdown();
    }

    private renderMarkdown(content: string): string {
        return MessageRenderer.renderMarkdown(content);
    }
    //#endregion

    //#region Panel Creation
    private createPanel(): HTMLElement {
        const container = UnifiedPanelUIBuilder.createPanel(this.config);

        // Store references
        this.queueRegion = container.querySelector("#claude-queue-region") as HTMLElement;
        this.messagesContainer = container.querySelector("#claude-messages") as HTMLElement;

        return container;
    }

    //#endregion

    //#region Event Listeners
    private attachEventListeners() {
        const input = this.element.querySelector("#claude-input") as HTMLTextAreaElement;
        const sendBtn = this.element.querySelector("#claude-send-btn") as HTMLButtonElement;
        const settingsBtn = this.element.querySelector("#claude-settings-btn");
        const clearBtn = this.element.querySelector("#claude-clear-chat");
        const presetSelector = this.element.querySelector("#claude-preset-selector") as HTMLSelectElement;

        // Queue controls
        const queueSummary = this.element.querySelector("#claude-queue-summary");
        const queueToggle = this.element.querySelector("#claude-queue-toggle");
        const queuePauseBtn = this.element.querySelector("#queue-pause-btn");
        const queueClearBtn = this.element.querySelector("#queue-clear-btn");

        // Chat event listeners
        sendBtn?.addEventListener("click", () => this.sendMessage());
        input?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                if (e.ctrlKey || e.metaKey) {
                    // Ctrl+Enter: Insert newline at cursor position
                    e.preventDefault();
                    const textarea = e.target as HTMLTextAreaElement;
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    const value = textarea.value;

                    // Insert newline at cursor position
                    textarea.value = value.substring(0, start) + '\n' + value.substring(end);

                    // Move cursor after the newline
                    textarea.selectionStart = textarea.selectionEnd = start + 1;
                } else if (!e.shiftKey) {
                    // Plain Enter: Send message
                    e.preventDefault();
                    this.sendMessage();
                }
            }
        });

        settingsBtn?.addEventListener("click", () => {
            if (this.onSettingsCallback) {
                this.onSettingsCallback();
            }
        });
        presetSelector?.addEventListener("change", async () => {
            this.activeChatPresetId = presetSelector.value;
            console.log(`[UnifiedAIPanel] Switched to preset: ${this.activeChatPresetId}`);

            // Persist AI Dock preset selection to localStorage and file storage
            await this.saveAIDockPresetSelection(this.activeChatPresetId)
                .catch(err => console.error('[UnifiedAIPanel] Preset save failed:', err));
        });
        clearBtn?.addEventListener("click", () => this.clearChat());

        // Queue event listeners
        queueSummary?.addEventListener("click", () => this.toggleQueueExpansion());
        queueToggle?.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleQueueExpansion();
        });
        queuePauseBtn?.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleQueuePause();
        });
        queueClearBtn?.addEventListener("click", (e) => {
            e.stopPropagation();
            this.clearEditQueue();
        });

        // Image upload event listeners (v0.19.0)
        this.attachImageEventListeners();
    }

    /**
     * Attach image upload event listeners (v0.19.0)
     */
    private attachImageEventListeners(): void {
        const input = this.element.querySelector("#claude-input") as HTMLTextAreaElement;
        const imageUploadBtn = this.element.querySelector("#claude-image-upload-btn");
        const imageFileInput = this.element.querySelector("#claude-image-file-input") as HTMLInputElement;
        const imagePreviewArea = this.element.querySelector("#claude-image-preview-area");

        // Click image upload button -> trigger file input
        imageUploadBtn?.addEventListener("click", () => {
            imageFileInput?.click();
        });

        // Handle file selection
        imageFileInput?.addEventListener("change", async () => {
            const files = imageFileInput.files;
            if (files && files.length > 0) {
                for (const file of Array.from(files)) {
                    await this.handleImageFile(file);
                }
                // Reset file input for next selection
                imageFileInput.value = '';
            }
        });

        // Handle clipboard paste on textarea
        input?.addEventListener("paste", async (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault(); // Prevent default paste behavior for images
                    const file = item.getAsFile();
                    if (file) {
                        await this.handleImageFile(file);
                    }
                }
            }
        });

        // Handle drag and drop on input area
        const inputArea = this.element.querySelector(".claude-input-area");
        inputArea?.addEventListener("dragover", (e) => {
            e.preventDefault();
            (inputArea as HTMLElement).style.background = 'var(--b3-theme-primary-lightest)';
        });

        inputArea?.addEventListener("dragleave", (e) => {
            e.preventDefault();
            (inputArea as HTMLElement).style.background = '';
        });

        inputArea?.addEventListener("drop", async (e: DragEvent) => {
            e.preventDefault();
            (inputArea as HTMLElement).style.background = '';

            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                for (const file of Array.from(files)) {
                    if (file.type.startsWith('image/')) {
                        await this.handleImageFile(file);
                    }
                }
            }
        });

        // Handle remove button clicks on preview images (event delegation)
        imagePreviewArea?.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('claude-image-remove-btn')) {
                const imageId = target.dataset.imageId;
                if (imageId) {
                    this.removeImage(imageId);
                }
            }
        });
    }

    /**
     * Handle an image file: convert to base64 and add to pending images
     */
    private async handleImageFile(file: File): Promise<void> {
        // Validate file type
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            console.warn(`[UnifiedAIPanel] Unsupported image type: ${file.type}`);
            this.addSystemMessage(`不支持的图片格式: ${file.type}。请使用 JPEG, PNG, GIF 或 WebP。`, 'warning');
            return;
        }

        // Check file size (limit to 4MB)
        const maxSize = 4 * 1024 * 1024; // 4MB
        if (file.size > maxSize) {
            console.warn(`[UnifiedAIPanel] Image too large: ${file.size} bytes`);
            this.addSystemMessage(`图片太大 (${(file.size / 1024 / 1024).toFixed(2)} MB)。请使用小于 4MB 的图片。`, 'warning');
            return;
        }

        try {
            // Read file as data URL
            const dataUrl = await this.readFileAsDataURL(file);
            const parsed = parseDataUrl(dataUrl);

            if (!parsed) {
                throw new Error('Failed to parse data URL');
            }

            // Create pending image entry
            const imageEntry = {
                id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                dataUrl: dataUrl,
                base64: parsed.data,
                mediaType: parsed.mediaType,
                fileName: file.name
            };

            this.pendingImages.push(imageEntry);
            this.updateImagePreviewArea();

            console.log(`[UnifiedAIPanel] Added image: ${file.name} (${parsed.mediaType})`);
        } catch (error) {
            console.error('[UnifiedAIPanel] Failed to process image:', error);
            this.addSystemMessage('图片处理失败，请重试。', 'error');
        }
    }

    /**
     * Read file as data URL (Promise wrapper)
     */
    private readFileAsDataURL(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    /**
     * Remove an image from pending images
     */
    private removeImage(imageId: string): void {
        const index = this.pendingImages.findIndex(img => img.id === imageId);
        if (index !== -1) {
            this.pendingImages.splice(index, 1);
            this.updateImagePreviewArea();
        }
    }

    /**
     * Update the image preview area UI
     */
    private updateImagePreviewArea(): void {
        const previewArea = this.element.querySelector("#claude-image-preview-area") as HTMLElement;
        if (!previewArea) return;

        if (this.pendingImages.length === 0) {
            previewArea.style.display = 'none';
            previewArea.innerHTML = '';
            return;
        }

        previewArea.style.display = 'flex';
        previewArea.innerHTML = this.pendingImages.map(img =>
            UnifiedPanelUIBuilder.createImagePreviewItem(img.id, img.dataUrl, img.fileName)
        ).join('');
    }

    /**
     * Clear all pending images
     */
    private clearPendingImages(): void {
        this.pendingImages = [];
        this.updateImagePreviewArea();
    }

    //#endregion

    //#region Chat Functionality
    private async sendMessage() {
        const input = this.element.querySelector("#claude-input") as HTMLTextAreaElement;
        const sendBtn = this.element.querySelector("#claude-send-btn") as HTMLButtonElement;
        const userMessage = input.value.trim();

        // Allow sending with just images (no text required if images are present)
        if ((!userMessage && this.pendingImages.length === 0) || this.isStreaming) {
            return;
        }

        // Handle edit mode (legacy Edit Queue functionality)
        if (this.isEditMode && this.editModeSelection) {
            await this.processEditModeRequest(userMessage);
            return;
        }

        if (!this.claudeClient.isConfigured()) {
            this.addSystemMessage("AI provider not configured. Please check settings or wait for initialization to complete.");
            return;
        }

        // Prepare content based on mode
        let content = userMessage;
        let isSelectionQA = false;

        // If in Selection Q&A mode, use template with context extraction
        if (this.panelMode === 'selectionQA' && this.currentSelection) {
            isSelectionQA = true;

            // Get active preset
            const configManager = (this.claudeClient as any).configManager;
            let activePreset: any = null;
            if (configManager && configManager.getTemplateById) {
                // NEW v0.9.0: Use getTemplateById() instead of find() for better performance
                activePreset = configManager.getTemplateById(this.activeChatPresetId);
            }

            // Get Selection Q&A template from preset (fallback to default)
            let template = activePreset?.selectionQATemplate || DEFAULT_SELECTION_QA_TEMPLATE;

            // Process context placeholders (if template contains them)
            try {
                if (this.contextExtractor.hasPlaceholders(template)) {
                    template = await this.contextExtractor.processTemplate(
                        template,
                        this.currentSelection.blockIds
                    );
                }
            } catch (error) {
                console.error('[UnifiedAIPanel] Error processing context placeholders:', error);
                // Fall back to template without context extraction
            }

            // Replace content placeholders
            content = template
                .replace(/{selection}/g, this.currentSelection.text)
                .replace(/{question}/g, userMessage);
        }

        // Create chat message (store original user message for display)
        const chatMessage: ChatMessage = {
            id: `chat-${Date.now()}`,
            type: 'chat',
            role: 'user',
            content: userMessage || '(Image)',  // Display original message to user
            timestamp: Date.now(),
            isSelectionQA: isSelectionQA,  // Mark as Selection Q&A message
            // Store images for UI display (v0.19.0)
            images: this.pendingImages.length > 0 ? this.pendingImages.map(img => ({
                dataUrl: img.dataUrl,
                fileName: img.fileName
            })) : undefined
        };

        this.messages.push(chatMessage);
        this.addChatMessageToUI(chatMessage);

        // Clear input
        input.value = "";

        // Disable send button
        this.isStreaming = true;
        sendBtn.disabled = true;
        sendBtn.textContent = "Sending...";

        // Create streaming message
        const streamingMsgId = this.createStreamingChatMessage();

        // Send to Claude
        let fullResponse = "";

        // Capture pending images before clearing
        const messageImages = [...this.pendingImages];
        const hasImages = messageImages.length > 0;

        // Build API messages - use enriched content for the last message if in Selection Q&A mode
        const apiMessages = this.messages.filter(isChatMessage).map((m, index, arr) => {
            const isLastUserMessage = index === arr.length - 1 && m.role === 'user';

            // Determine the text content for this message
            let textContent = m.content;
            if (isSelectionQA && isLastUserMessage) {
                textContent = content; // Use selection-enriched content
            }

            // For the last user message with images, create multimodal content
            if (isLastUserMessage && hasImages) {
                // Convert pending images to ImageContent blocks
                const imageContents: ImageContent[] = messageImages.map(img =>
                    createImageContent(img.base64, img.mediaType)
                );

                // Return multimodal message
                return createMultimodalMessage(m.role, textContent, imageContents);
            }

            // Regular text-only message
            return {
                role: m.role,
                content: textContent
            };
        });

        // Clear pending images after building messages
        if (hasImages) {
            this.clearPendingImages();
        }

        // Get active preset
        const configManager = (this.claudeClient as any).configManager;
        let activePreset: any = null;
        if (configManager && configManager.getTemplateById) {
            // NEW v0.9.0: Use getTemplateById() instead of find() for better performance
            activePreset = configManager.getTemplateById(this.activeChatPresetId);
        }

        // Get system prompt from preset (fallback to global if not set)
        const systemPrompt = activePreset?.systemPrompt || this.claudeClient.getSystemPrompt();

        // Append the appended prompt to the last user message (only for non-selection messages)
        const appendedPrompt = activePreset?.appendedPrompt || this.claudeClient.getAppendedPrompt();
        if (appendedPrompt && apiMessages.length > 0 && !isSelectionQA) {
            const lastMessage = apiMessages[apiMessages.length - 1];
            if (lastMessage.role === 'user') {
                lastMessage.content += '\n\n' + appendedPrompt;
            }
        }

        // Get filter rules for active preset
        const filterRules = this.claudeClient.getFilterRules(this.activeChatPresetId);

        // Diagnostic logging
        console.log(`[UnifiedAIPanel] Sending message - Preset: ${activePreset?.name ?? 'default'} (${this.activeChatPresetId})`);
        console.log(`[UnifiedAIPanel] SystemPrompt: ${systemPrompt?.length ?? 0} chars, Messages: ${apiMessages.length}, FilterRules: ${filterRules?.length ?? 0}`);

        // v0.19.0: Track AI-generated images during response
        let generatedImages: Array<{ base64: string; mimeType: string; fileName?: string }> = [];

        await this.claudeClient.sendMessage(
            apiMessages,
            (chunk) => {
                fullResponse += chunk;
                this.updateStreamingMessage(streamingMsgId, fullResponse);
            },
            (error) => {
                this.addSystemMessage(`Error: ${error.message}`);
                this.isStreaming = false;
                sendBtn.disabled = false;
                sendBtn.textContent = "Send";
            },
            () => {
                const assistantMessage: ChatMessage = {
                    id: `chat-${Date.now()}`,
                    type: 'chat',
                    role: 'assistant',
                    content: fullResponse,
                    timestamp: Date.now(),
                    isSelectionQA: isSelectionQA,  // Mark as Selection Q&A message
                    // v0.19.0: Include AI-generated images
                    generatedImages: generatedImages.length > 0 ? generatedImages : undefined
                };

                this.messages.push(assistantMessage);
                this.isStreaming = false;
                sendBtn.disabled = false;
                sendBtn.textContent = "Send";

                // Remove streaming message and add final one
                const streamingMsg = document.getElementById(streamingMsgId);
                if (streamingMsg) {
                    streamingMsg.remove();
                }

                // Add message to UI with action buttons if in Selection Q&A mode
                this.addChatMessageToUI(assistantMessage, isSelectionQA);
            },
            "Chat",
            filterRules,
            systemPrompt,
            // v0.19.0: Capture AI-generated images
            (images) => {
                generatedImages = images;
                console.log(`[UnifiedAIPanel] Received ${images.length} generated images from AI`);
            }
        );
    }

    /**
     * Process edit mode request with user instruction
     * @param instruction User's editing instruction
     */
    private async processEditModeRequest(instruction: string): Promise<void> {
        if (!this.editModeSelection) return;

        const input = this.element.querySelector("#claude-input") as HTMLTextAreaElement;
        const sendBtn = this.element.querySelector("#claude-send-btn") as HTMLButtonElement;

        // Clear input
        input.value = "";

        // Update selection with instruction
        this.editModeSelection.customInstruction = instruction;
        
        // Add to selection manager
        const selection = this.textSelectionManager.addSelection(
            this.editModeSelection.blockId,
            this.editModeSelection.startLine,
            this.editModeSelection.endLine,
            this.editModeSelection.selectedText,
            instruction
        );

        // Add to edit queue for processing
        this.editQueue.enqueue(selection);
        
        // Update UI
        this.addEditSelection(selection);

        // Exit edit mode
        this.exitEditMode();

        // Restore button
        sendBtn.disabled = false;
        sendBtn.textContent = '发送';
    }

    private addChatMessageToUI(message: ChatMessage, isSelectionQA: boolean = false) {
        if (!this.messagesContainer) return;

        // Remove welcome message if exists
        const welcome = this.messagesContainer.querySelector(".ft__secondary");
        if (welcome) welcome.remove();

        const messageDiv = document.createElement("div");
        messageDiv.className = `claude-message claude-message-chat claude-message-${message.role}`;
        messageDiv.setAttribute("data-message-id", message.id);  // Add message ID for deletion
        messageDiv.style.cssText = `
            margin-bottom: 12px;
            padding: 8px 12px;
            border-radius: 4px;
            background: ${message.role === "user" ? "var(--b3-list-hover)" : "transparent"};
            position: relative;
        `;

        // Header with role label and action buttons
        const headerDiv = document.createElement("div");
        headerDiv.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;";

        const roleLabel = document.createElement("div");
        roleLabel.className = "ft__smaller ft__secondary";
        roleLabel.textContent = message.role === "user" ? "You" : this.claudeClient.getProviderName();

        headerDiv.appendChild(roleLabel);

        // Add action buttons for assistant messages
        if (message.role === "assistant") {
            const actionsDiv = document.createElement("div");
            actionsDiv.className = "claude-message-actions";
            actionsDiv.style.cssText = "display: flex; gap: 4px; opacity: 0; transition: opacity 0.2s;";

            const copyBtn = document.createElement("button");
            copyBtn.className = "b3-button b3-button--text fn__size200";
            copyBtn.title = "Copy message";
            copyBtn.innerHTML = `<svg><use xlink:href="#iconCopy"></use></svg>`;
            copyBtn.onclick = () => this.copyMessage(message.content);

            const regenerateBtn = document.createElement("button");
            regenerateBtn.className = "b3-button b3-button--text fn__size200";
            regenerateBtn.title = "Regenerate response";
            regenerateBtn.innerHTML = `<svg><use xlink:href="#iconRefresh"></use></svg>`;
            regenerateBtn.onclick = () => this.regenerateLastResponse();

            actionsDiv.appendChild(copyBtn);
            actionsDiv.appendChild(regenerateBtn);
            headerDiv.appendChild(actionsDiv);

            // Show actions on hover
            messageDiv.addEventListener("mouseenter", () => {
                actionsDiv.style.opacity = "1";
            });
            messageDiv.addEventListener("mouseleave", () => {
                actionsDiv.style.opacity = "0";
            });
        }

        const contentDiv = document.createElement("div");
        contentDiv.className = "claude-message-content";

        // Render images first if present (v0.19.0 multimodal support)
        if (message.images && message.images.length > 0) {
            const imagesHtml = message.images.map(img =>
                UnifiedPanelUIBuilder.createMessageImage(img.dataUrl, img.fileName || 'Image')
            ).join('');
            contentDiv.innerHTML = imagesHtml;
        }

        // Render AI-generated images with save buttons (v0.19.0 multimodal output)
        if (message.generatedImages && message.generatedImages.length > 0) {
            const generatedImagesDiv = document.createElement("div");
            generatedImagesDiv.className = "claude-generated-images";
            generatedImagesDiv.style.cssText = "display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;";

            message.generatedImages.forEach((img, index) => {
                const imageWrapper = document.createElement("div");
                imageWrapper.className = "claude-generated-image-wrapper";
                imageWrapper.style.cssText = "position: relative; display: inline-block;";

                const imgElement = document.createElement("img");
                imgElement.src = `data:${img.mimeType};base64,${img.base64}`;
                imgElement.alt = img.fileName || `AI Generated Image ${index + 1}`;
                imgElement.style.cssText = "max-width: 300px; max-height: 300px; border-radius: 4px; cursor: pointer;";
                imgElement.onclick = () => {
                    // Open image in new tab for full view
                    const win = window.open();
                    if (win) {
                        win.document.write(`<img src="data:${img.mimeType};base64,${img.base64}" style="max-width: 100%;">`);
                    }
                };

                const saveBtn = document.createElement("button");
                saveBtn.className = "b3-button b3-button--text fn__size200";
                saveBtn.style.cssText = "position: absolute; bottom: 4px; right: 4px; background: rgba(0,0,0,0.6); color: white; border-radius: 4px; padding: 2px 6px;";
                saveBtn.title = "保存到思源笔记";
                saveBtn.innerHTML = `<svg><use xlink:href="#iconDownload"></use></svg>`;
                saveBtn.onclick = async (e) => {
                    e.stopPropagation();
                    saveBtn.disabled = true;
                    saveBtn.innerHTML = '...';
                    const assetPath = await this.blockOperations.saveImageAsAsset(img.base64, img.mimeType, img.fileName);
                    if (assetPath) {
                        saveBtn.innerHTML = `<svg><use xlink:href="#iconCheck"></use></svg>`;
                        saveBtn.title = `已保存: ${assetPath}`;
                    } else {
                        saveBtn.innerHTML = `<svg><use xlink:href="#iconClose"></use></svg>`;
                        saveBtn.title = "保存失败";
                        saveBtn.disabled = false;
                    }
                };

                imageWrapper.appendChild(imgElement);
                imageWrapper.appendChild(saveBtn);
                generatedImagesDiv.appendChild(imageWrapper);
            });

            contentDiv.appendChild(generatedImagesDiv);
        }

        // Use markdown rendering for assistant messages
        if (message.role === "assistant") {
            contentDiv.innerHTML += this.renderMarkdown(message.content);
        } else {
            // For user messages, add text after images
            const textSpan = document.createElement("span");
            textSpan.textContent = message.content;
            contentDiv.appendChild(textSpan);
        }

        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);

        // Add Selection Q&A action buttons if applicable
        if (message.role === "assistant" && isSelectionQA && this.currentSelection) {
            const qaActionsDiv = document.createElement("div");
            qaActionsDiv.className = "claude-qa-actions";
            qaActionsDiv.style.cssText = "display: flex; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--b3-border-color);";

            const replaceBtn = document.createElement("button");
            replaceBtn.className = "b3-button b3-button--outline";
            replaceBtn.innerHTML = `<svg class="fn__size200"><use xlink:href="#iconReplace"></use></svg><span style="margin-left: 4px;">替换</span>`;
            replaceBtn.title = "Replace selected blocks with this response";
            replaceBtn.onclick = () => this.handleReplaceSelection(message.content);

            const insertBtn = document.createElement("button");
            insertBtn.className = "b3-button b3-button--outline";
            insertBtn.innerHTML = `<svg class="fn__size200"><use xlink:href="#iconDown"></use></svg><span style="margin-left: 4px;">插入</span>`;
            insertBtn.title = "Insert response below selected blocks";
            insertBtn.onclick = () => this.handleInsertBelow(message.content);

            // Button 3: [继续] - Keep conversation (NEW)
            const continueBtn = document.createElement("button");
            continueBtn.className = "b3-button b3-button--outline";
            continueBtn.innerHTML = `<svg class="fn__size200"><use xlink:href="#iconCheck"></use></svg><span style="margin-left: 4px;">继续</span>`;
            continueBtn.title = "Keep conversation and clear selection";
            continueBtn.onclick = () => {
                // Edge Case 1: If AI is still streaming, show confirmation
                if (this.isStreaming) {
                    const confirmed = confirm('AI 正在生成回复，确定要取消吗？');
                    if (!confirmed) return;

                    // Cancel streaming if possible
                    if (this.claudeClient && typeof (this.claudeClient as any).cancelActiveRequest === 'function') {
                        (this.claudeClient as any).cancelActiveRequest();
                    }
                }

                // Edge Case 2: If user typed long message, show confirmation
                const input = this.element.querySelector("#claude-input") as HTMLTextAreaElement;
                if (input && input.value.trim().length > 50) {
                    const confirmed = confirm('你已输入较长内容，取消将清空输入，确定继续吗？');
                    if (!confirmed) return;

                    // Clear input if user confirmed
                    input.value = '';
                }

                // Clear selection only, keep conversation
                this.clearCurrentSelection();
            };

            // Button 4: [取消] - Clear response (MODIFIED)
            const cancelBtn = document.createElement("button");
            cancelBtn.className = "b3-button b3-button--cancel";
            cancelBtn.innerHTML = `<svg class="fn__size200"><use xlink:href="#iconClose"></use></svg><span style="margin-left: 4px;">取消</span>`;
            cancelBtn.title = "Clear selection and delete AI response";
            cancelBtn.onclick = () => {
                // Edge Case 1: If AI is still streaming, show confirmation
                if (this.isStreaming) {
                    const confirmed = confirm('AI 正在生成回复，确定要取消吗？');
                    if (!confirmed) return;

                    // Cancel streaming if possible
                    if (this.claudeClient && typeof (this.claudeClient as any).cancelActiveRequest === 'function') {
                        (this.claudeClient as any).cancelActiveRequest();
                    }
                }

                // Edge Case 2: If user typed long message, show confirmation
                const input = this.element.querySelector("#claude-input") as HTMLTextAreaElement;
                if (input && input.value.trim().length > 50) {
                    const confirmed = confirm('你已输入较长内容，取消将清空输入，确定继续吗？');
                    if (!confirmed) return;

                    // Clear input if user confirmed
                    input.value = '';
                }

                // Clear response and selection
                this.clearLastQAResponse();
                this.clearCurrentSelection();
            };

            // Visual separator between action buttons and cancel buttons
            const separator = document.createElement("div");
            separator.style.cssText = "width: 1px; height: 24px; background: var(--b3-border-color); margin: 0 4px;";

            qaActionsDiv.appendChild(replaceBtn);
            qaActionsDiv.appendChild(insertBtn);
            qaActionsDiv.appendChild(separator);
            qaActionsDiv.appendChild(continueBtn);
            qaActionsDiv.appendChild(cancelBtn);

            messageDiv.appendChild(qaActionsDiv);
        }

        this.messagesContainer.appendChild(messageDiv);

        // Scroll to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    private createStreamingChatMessage(): string {
        if (!this.messagesContainer) return "";
        const providerName = this.claudeClient.getProviderName();
        return MessageRenderer.createStreamingMessageDOM(this.messagesContainer, providerName);
    }

    private updateStreamingMessage(messageId: string, content: string) {
        MessageRenderer.updateStreamingMessage(this.element, messageId, content);
    }

    private addSystemMessage(message: string) {
        if (!this.messagesContainer) return;

        const messageDiv = document.createElement("div");
        messageDiv.className = "claude-message claude-message-system";
        messageDiv.innerHTML = UnifiedPanelUIBuilder.createSystemMessage(message, 'info');

        this.messagesContainer.appendChild(messageDiv);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    private clearChat() {
        // Only clear chat messages, keep edit messages
        this.messages = this.messages.filter(isEditMessage);

        if (this.messagesContainer) {
            // Re-render all messages
            this.messagesContainer.innerHTML = "";
            this.messages.forEach(msg => {
                if (isEditMessage(msg)) {
                    this.addEditMessageToUI(msg);
                }
            });

            if (this.messages.length === 0) {
                this.messagesContainer.innerHTML = `
                    <div class="ft__secondary" style="text-align: center; padding: 20px;">
                        Start a conversation with ${this.claudeClient.getProviderName()} or select text and click the select button above.
                    </div>
                `;
            }
        }
    }

    private getLastChatAssistantMessage(): string {
        for (let i = this.messages.length - 1; i >= 0; i--) {
            const msg = this.messages[i];
            if (isChatMessage(msg) && msg.role === "assistant") {
                return msg.content;
            }
        }
        return "";
    }

    /**
     * Clear the last Selection Q&A AI response only
     */
    private clearLastQAResponse(): void {
        // Find the last assistant message marked as Selection Q&A
        let lastQAResponseIndex = -1;
        for (let i = this.messages.length - 1; i >= 0; i--) {
            const msg = this.messages[i];
            if (isChatMessage(msg) && msg.role === 'assistant' && msg.isSelectionQA) {
                lastQAResponseIndex = i;
                break;
            }
        }

        if (lastQAResponseIndex === -1) {
            // No QA response to clear - silent return
            console.log('[UnifiedAIPanel] No QA response found to clear');
            return;
        }

        const messageToRemove = this.messages[lastQAResponseIndex];

        // Remove from messages array
        this.messages.splice(lastQAResponseIndex, 1);

        // Remove from DOM
        if (this.messagesContainer) {
            const element = this.messagesContainer.querySelector(
                `[data-message-id="${messageToRemove.id}"]`
            );
            element?.remove();
        }

        this.addSystemMessage("✅ 已清除 AI 答复");
        console.log('[UnifiedAIPanel] Cleared QA response');
    }


    // updateActionButtons() removed - no longer needed with new Selection Q&A design

    private copyMessage(content: string) {
        navigator.clipboard.writeText(content).then(() => {
            this.addSystemMessage("✅ Message copied to clipboard");
        }).catch((err) => {
            console.error("Failed to copy:", err);
            this.addSystemMessage("❌ Failed to copy message");
        });
    }

    private async regenerateLastResponse() {
        if (this.isStreaming) {
            this.addSystemMessage("Please wait for the current response to complete");
            return;
        }

        // Find the last user chat message
        let lastUserIndex = -1;
        for (let i = this.messages.length - 1; i >= 0; i--) {
            const msg = this.messages[i];
            if (isChatMessage(msg) && msg.role === "user") {
                lastUserIndex = i;
                break;
            }
        }

        if (lastUserIndex === -1) {
            this.addSystemMessage("No message to regenerate");
            return;
        }

        // Remove all messages after the last user message
        this.messages = this.messages.slice(0, lastUserIndex + 1);

        // Re-render
        if (this.messagesContainer) {
            this.messagesContainer.innerHTML = "";
            this.messages.forEach(msg => {
                if (isChatMessage(msg)) {
                    this.addChatMessageToUI(msg);
                } else if (isEditMessage(msg)) {
                    this.addEditMessageToUI(msg);
                }
            });
        }

        // Send new request
        const sendBtn = this.element.querySelector("#claude-send-btn") as HTMLButtonElement;
        this.isStreaming = true;
        sendBtn.disabled = true;
        sendBtn.textContent = "Regenerating...";

        const streamingMsgId = this.createStreamingChatMessage();

        let fullResponse = "";
        const apiMessages = this.messages.filter(isChatMessage).map(m => ({
            role: m.role,
            content: m.content
        }));

        // Get active preset
        const configManager = (this.claudeClient as any).configManager;
        let activePreset: any = null;
        if (configManager && configManager.getTemplateById) {
            // NEW v0.9.0: Use getTemplateById() instead of find() for better performance
            activePreset = configManager.getTemplateById(this.activeChatPresetId);
        }

        // Get system prompt from preset (fallback to global if not set)
        const systemPrompt = activePreset?.systemPrompt || this.claudeClient.getSystemPrompt();

        // Append the appended prompt to the last user message
        const appendedPrompt = activePreset?.appendedPrompt || this.claudeClient.getAppendedPrompt();
        if (appendedPrompt && apiMessages.length > 0) {
            const lastMessage = apiMessages[apiMessages.length - 1];
            if (lastMessage.role === 'user') {
                lastMessage.content += '\n\n' + appendedPrompt;
            }
        }

        // Get filter rules for active preset
        const filterRules = this.claudeClient.getFilterRules(this.activeChatPresetId);

        // Diagnostic logging
        console.log(`[UnifiedAIPanel] Sending message - Preset: ${activePreset?.name ?? 'default'} (${this.activeChatPresetId})`);
        console.log(`[UnifiedAIPanel] SystemPrompt: ${systemPrompt?.length ?? 0} chars, Messages: ${apiMessages.length}, FilterRules: ${filterRules?.length ?? 0}`);

        await this.claudeClient.sendMessage(
            apiMessages,
            (chunk) => {
                fullResponse += chunk;
                this.updateStreamingMessage(streamingMsgId, fullResponse);
            },
            (error) => {
                this.addSystemMessage(`Error: ${error.message}`);
                this.isStreaming = false;
                sendBtn.disabled = false;
                sendBtn.textContent = "Send";
            },
            () => {
                const assistantMessage: ChatMessage = {
                    id: `chat-${Date.now()}`,
                    type: 'chat',
                    role: 'assistant',
                    content: fullResponse,
                    timestamp: Date.now()
                };

                this.messages.push(assistantMessage);
                this.isStreaming = false;
                sendBtn.disabled = false;
                sendBtn.textContent = "Send";

                // Remove streaming message and add final one
                const streamingMsg = document.getElementById(streamingMsgId);
                if (streamingMsg) {
                    streamingMsg.remove();
                }
                this.addChatMessageToUI(assistantMessage);
            },
            "Chat",
            filterRules,
            systemPrompt
        );
    }
    //#endregion

    //#region Edit Queue Functionality
    private handleEditEvent(event: EditEvent): void {
        console.log(`[UnifiedAIPanel] Edit event: ${event.type}`);

        // Update queue UI
        this.refreshQueueUI();

        // If edit completed, add to message stream
        if (event.type === 'edit_completed' as any && event.selection) {
            this.addEditCompletedMessage(event.selection);
        }

        // Auto-expand queue if configured
        if (this.config.autoExpandQueue && event.type === 'selection_added' as any) {
            this.setQueueExpanded(true);
        }
    }

    private addEditCompletedMessage(selection: TextSelection) {
        const editMessage: EditMessage = {
            id: `edit-${selection.id}`,
            type: 'edit',
            selection: selection,
            status: 'completed',
            result: selection.editResult,
            timestamp: Date.now()
        };

        this.messages.push(editMessage);
        this.addEditMessageToUI(editMessage);
    }

    private addEditMessageToUI(message: EditMessage) {
        if (!this.messagesContainer) return;

        const messageDiv = document.createElement("div");
        messageDiv.className = "claude-message claude-message-edit";
        messageDiv.setAttribute("data-status", message.status);
        messageDiv.setAttribute("data-message-id", message.id);
        messageDiv.style.cssText = `
            margin-bottom: 8px;
            padding: 10px;
            border-radius: 4px;
            border-left: 3px solid var(--b3-theme-primary);
            background: var(--b3-theme-surface);
        `;

        // Header with toggle
        const headerDiv = document.createElement("div");
        headerDiv.className = "claude-edit-header";
        headerDiv.style.cssText = "display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;";

        const leftDiv = document.createElement("div");
        leftDiv.style.cssText = "display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;";

        // Collapse indicator
        const collapseIcon = document.createElement("span");
        collapseIcon.className = "claude-edit-collapse-icon";
        collapseIcon.textContent = "▶";
        collapseIcon.style.cssText = "font-size: 10px; transition: transform 0.2s; display: inline-block; flex-shrink: 0;";

        const titleDiv = document.createElement("div");
        titleDiv.className = "ft__smaller";
        titleDiv.style.cssText = "font-weight: 500; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";

        // Show preview text for collapsed state
        const previewText = message.selection.selectedText.substring(0, 25).trim();
        const previewSuffix = message.selection.selectedText.length > 25 ? "..." : "";
        titleDiv.innerHTML = `📝 L${message.selection.startLine + 1}-${message.selection.endLine + 1} <span class="ft__secondary" style="font-weight: normal;">${previewText}${previewSuffix}</span>`;

        const statusSpan = document.createElement("span");
        statusSpan.className = "ft__smaller ft__secondary";
        statusSpan.style.cssText = "flex-shrink: 0; margin-left: 8px;";
        statusSpan.textContent = this.getEditStatusText(message.status);

        leftDiv.appendChild(collapseIcon);
        leftDiv.appendChild(titleDiv);
        headerDiv.appendChild(leftDiv);
        headerDiv.appendChild(statusSpan);

        // Content container (collapsible)
        const contentDiv = document.createElement("div");
        contentDiv.className = "claude-edit-content";
        contentDiv.style.cssText = "display: none; margin-top: 8px;";

        // Diff view (if completed)
        if (message.status === 'completed' && message.result) {
            const diffContainerDiv = document.createElement("div");
            diffContainerDiv.className = "claude-edit-diff-inline";
            diffContainerDiv.style.cssText = "margin: 8px 0; padding: 8px; background: var(--b3-theme-background); border-radius: 4px; max-height: 250px; overflow-y: auto;";

            this.diffRenderer.renderDiff(
                message.result.original,
                message.result.modified,
                diffContainerDiv
            );
            contentDiv.appendChild(diffContainerDiv);
        } else if (message.status === 'error' && message.errorMessage) {
            const errorDiv = document.createElement("div");
            errorDiv.className = "ft__error";
            errorDiv.style.cssText = "margin: 8px 0; padding: 8px; background: var(--b3-theme-error-lighter); border-radius: 4px;";
            errorDiv.textContent = "❌ " + message.errorMessage;
            contentDiv.appendChild(errorDiv);
        } else if (message.status === 'processing') {
            const processingDiv = document.createElement("div");
            processingDiv.className = "ft__secondary";
            processingDiv.style.cssText = "margin: 8px 0; padding: 8px; text-align: center;";
            processingDiv.innerHTML = `<span class="fn__loading" style="display: inline-block;"></span> 正在处理...`;
            contentDiv.appendChild(processingDiv);
        }

        // Actions
        const actionsDiv = document.createElement("div");
        actionsDiv.className = "fn__flex";
        actionsDiv.style.cssText = "gap: 8px; justify-content: flex-end; margin-top: 8px;";

        if (message.status === 'completed') {
            const rejectBtn = document.createElement("button");
            rejectBtn.className = "b3-button b3-button--outline b3-button--small";
            rejectBtn.innerHTML = `<svg class="fn__size200"><use xlink:href="#iconClose"></use></svg><span style="margin-left: 4px;">拒绝</span>`;
            rejectBtn.onclick = (e) => {
                e.stopPropagation();
                this.rejectEdit(message);
            };

            const regenerateBtn = document.createElement("button");
            regenerateBtn.className = "b3-button b3-button--outline b3-button--small";
            regenerateBtn.innerHTML = `<svg class="fn__size200"><use xlink:href="#iconRefresh"></use></svg><span style="margin-left: 4px;">重新生成</span>`;
            regenerateBtn.onclick = (e) => {
                e.stopPropagation();
                this.regenerateEdit(message);
            };

            const applyBtn = document.createElement("button");
            applyBtn.className = "b3-button b3-button--text b3-button--small";
            applyBtn.innerHTML = `<svg class="fn__size200"><use xlink:href="#iconCheck"></use></svg><span style="margin-left: 4px;">应用修改</span>`;
            applyBtn.onclick = (e) => {
                e.stopPropagation();
                this.applyEdit(message);
            };

            actionsDiv.appendChild(rejectBtn);
            actionsDiv.appendChild(regenerateBtn);
            actionsDiv.appendChild(applyBtn);
        } else if (message.status === 'error') {
            const retryBtn = document.createElement("button");
            retryBtn.className = "b3-button b3-button--outline b3-button--small";
            retryBtn.innerHTML = `<svg class="fn__size200"><use xlink:href="#iconRefresh"></use></svg><span style="margin-left: 4px;">重试</span>`;
            retryBtn.onclick = (e) => {
                e.stopPropagation();
                this.regenerateEdit(message);
            };
            actionsDiv.appendChild(retryBtn);
        }

        if (actionsDiv.childNodes.length > 0) {
            contentDiv.appendChild(actionsDiv);
        }

        // Toggle collapse/expand
        let isExpanded = false;
        headerDiv.onclick = () => {
            isExpanded = !isExpanded;
            contentDiv.style.display = isExpanded ? "block" : "none";
            collapseIcon.style.transform = isExpanded ? "rotate(90deg)" : "rotate(0deg)";
        };

        // Auto-expand for processing and error status
        if (message.status === 'processing' || message.status === 'error') {
            isExpanded = true;
            contentDiv.style.display = "block";
            collapseIcon.style.transform = "rotate(90deg)";
        }

        // Auto-minimize for applied/rejected
        if (message.status === 'applied' || message.status === 'rejected') {
            messageDiv.style.opacity = "0.6";
            messageDiv.style.marginBottom = "4px";
        }

        // Assemble
        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);

        this.messagesContainer.appendChild(messageDiv);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }


    private async applyEdit(message: EditMessage) {
        if (!message.result) return;

        try {
            await this.diffRenderer.applyChanges(message.selection);
            message.status = 'applied';

            // Update UI
            this.refreshMessagesUI();

            // Show success
            this.addSystemMessage("✅ 已应用 AI 修改");

        } catch (error) {
            console.error('[UnifiedAIPanel] Error applying edit:', error);
            this.addSystemMessage("❌ 应用修改失败");
        }
    }

    private rejectEdit(message: EditMessage) {
        this.diffRenderer.rejectChanges(message.selection);
        message.status = 'rejected';

        // Update UI
        this.refreshMessagesUI();

        this.addSystemMessage("已拒绝修改");
    }

    private async regenerateEdit(message: EditMessage) {
        // Reset selection and re-queue
        message.selection.status = 'pending';
        message.selection.editResult = undefined;
        message.selection.errorMessage = undefined;
        message.status = 'queued';

        this.editQueue.enqueue(message.selection);

        // Update UI
        this.refreshMessagesUI();
        this.refreshQueueUI();
    }

    private getEditStatusText(status: EditMessage['status']): string {
        return UnifiedPanelHelpers.getEditStatusText(status);
    }

    private refreshQueueUI() {
        const context = {
            element: this.element,
            textSelectionManager: this.textSelectionManager,
            editQueue: this.editQueue,
            queueState: this.editQueueState
        };
        QueueRenderer.refreshQueueUI(context);
    }

    private createQueueItem(selection: TextSelection): string {
        return QueueRenderer.createQueueItem(selection);
    }

    private getQueueItemStatusIcon(status: TextSelection['status']): string {
        return UnifiedPanelHelpers.getQueueItemStatusIcon(status);
    }

    private toggleQueueExpansion() {
        const context = {
            element: this.element,
            textSelectionManager: this.textSelectionManager,
            editQueue: this.editQueue,
            queueState: this.editQueueState
        };
        QueueRenderer.toggleQueueExpansion(context);
    }

    private setQueueExpanded(expanded: boolean) {
        const context = {
            element: this.element,
            textSelectionManager: this.textSelectionManager,
            editQueue: this.editQueue,
            queueState: this.editQueueState
        };
        QueueRenderer.setQueueExpanded(context, expanded);
    }

    private toggleQueuePause() {
        const context = {
            element: this.element,
            textSelectionManager: this.textSelectionManager,
            editQueue: this.editQueue,
            queueState: this.editQueueState
        };
        QueueRenderer.toggleQueuePause(context);
    }

    private updatePauseButtonIcon() {
        const context = {
            element: this.element,
            textSelectionManager: this.textSelectionManager,
            editQueue: this.editQueue,
            queueState: this.editQueueState
        };
        QueueRenderer.updatePauseButtonIcon(context);
    }

    private clearEditQueue() {
        const context = {
            element: this.element,
            textSelectionManager: this.textSelectionManager,
            editQueue: this.editQueue,
            queueState: this.editQueueState
        };
        QueueRenderer.clearEditQueue(context);
    }
    //#endregion

    //#region State Persistence
    private loadQueueState() {
        const context = {
            element: this.element,
            textSelectionManager: this.textSelectionManager,
            editQueue: this.editQueue,
            queueState: this.editQueueState
        };
        QueueRenderer.loadQueueState(context);
    }

    private saveQueueState() {
        const context = {
            element: this.element,
            textSelectionManager: this.textSelectionManager,
            editQueue: this.editQueue,
            queueState: this.editQueueState
        };
        QueueRenderer.saveQueueState(context);
    }

    /**
     * Save AI Dock preset selection to localStorage and file storage
     * @param presetId - The preset ID to save
     */
    private async saveAIDockPresetSelection(presetId: string): Promise<void> {
        return PresetManager.savePresetSelection(this.claudeClient, presetId);
    }

    /**
     * Load AI Dock preset selection from file storage and localStorage
     * Priority: file storage > localStorage > 'default'
     * @param timeoutMs - Timeout for file loading (default: 3000ms)
     * @returns The saved preset ID or 'default' if none found
     */
    private async loadAIDockPresetSelection(timeoutMs: number = 3000): Promise<string> {
        return PresetManager.loadPresetSelection(this.claudeClient, timeoutMs);
    }

    /**
     * Notify AI Dock preset selection to PresetEventBus
     * (Synchronize with Settings Panel and other components)
     *
     * @param presetId - The preset ID to notify
     */
    private notifyAIDockPresetSelection(presetId: string): void {
        PresetManager.notifyPresetSelection(this.claudeClient, presetId);
    }
    //#endregion

    //#region Utilities
    private refreshMessagesUI() {
        if (!this.messagesContainer) return;

        this.messagesContainer.innerHTML = "";
        this.messages.forEach(msg => {
            if (isChatMessage(msg)) {
                this.addChatMessageToUI(msg);
            } else if (isEditMessage(msg)) {
                this.addEditMessageToUI(msg);
            }
        });

        // No empty state message needed
    }

    private truncate(text: string, maxLength: number): string {
        return UnifiedPanelHelpers.truncate(text, maxLength);
    }

    private escapeHtml(text: string): string {
        return SecurityUtils.escapeHtml(text);
    }

    /**
     * Get short model name for display in badge
     */
    private getShortModelName(fullModelName: string): string {
        return UnifiedPanelHelpers.getShortModelName(fullModelName);
    }

    /**
     * Update provider info badge with current AI provider and model
     * Called on initialization and after settings changes
     */
    updateProviderInfoBadge(): void {
        const badge = this.element.querySelector('[data-provider-badge] .provider-text');
        if (!badge) {
            console.warn('[UnifiedAIPanel] Provider info badge not found');
            return;
        }

        try {
            const providerName = this.claudeClient.getProviderDisplayName();
            const settings = this.claudeClient.getSettings();
            const modelName = this.getShortModelName(settings.model || '');
            
            // Format: "Provider ModelName" (e.g., "Claude Sonnet 4", "GPT-4o")
            badge.textContent = modelName 
                ? `${providerName} ${modelName}`
                : providerName;

            // Optional: Update badge color based on provider
            const badgeContainer = badge.parentElement;
            if (badgeContainer) {
                const colors: Record<string, { bg: string; border: string }> = {
                    'anthropic': { bg: 'rgba(99, 102, 241, 0.1)', border: 'rgba(99, 102, 241, 0.3)' },
                    'openai': { bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.3)' },
                    'gemini': { bg: 'rgba(251, 146, 60, 0.1)', border: 'rgba(251, 146, 60, 0.3)' },
                    'xai': { bg: 'rgba(236, 72, 153, 0.1)', border: 'rgba(236, 72, 153, 0.3)' },
                    'deepseek': { bg: 'rgba(6, 182, 212, 0.1)', border: 'rgba(6, 182, 212, 0.3)' },
                    'moonshot': { bg: 'rgba(138, 43, 226, 0.1)', border: 'rgba(138, 43, 226, 0.3)' }  // Purple for Kimi
                };

                const providerType = this.claudeClient.getActiveProvider();
                const color = colors[providerType] || colors['anthropic']; // Default to Claude color
                
                badgeContainer.style.background = color.bg;
                badgeContainer.style.borderColor = color.border;
            }

            console.log(`[UnifiedAIPanel] Updated provider badge: ${badge.textContent}`);
        } catch (error) {
            console.error('[UnifiedAIPanel] Error updating provider badge:', error);
            badge.textContent = 'Unknown';
        }
    }

    /**
     * Populate preset selector with available templates
     * Includes retry mechanism for initialization timing issues
     */
    private populatePresetSelector(): void {
        const context = {
            element: this.element,
            claudeClient: this.claudeClient,
            activeChatPresetId: this.activeChatPresetId,
            onPresetChange: (presetId: string) => { this.activeChatPresetId = presetId; }
        };
        PresetManager.populatePresetSelector(context, this.populateSelectorRetries);
        this.populateSelectorRetries = 0; // Reset counter after call
    }

    /**
     * Refresh preset selector (call when presets change)
     */
    refreshPresetSelector(): void {
        this.populatePresetSelector();
    }

    /**
     * Subscribe to preset events for automatic UI synchronization (NEW v0.9.0)
     * Eliminates manual refresh requirements
     */
    private subscribeToPresetEvents(): void {
        const context = {
            element: this.element,
            claudeClient: this.claudeClient,
            activeChatPresetId: this.activeChatPresetId,
            onPresetChange: (presetId: string) => { this.activeChatPresetId = presetId; }
        };
        this.presetEventUnsubscribe = PresetManager.subscribeToPresetEvents(context);
    }
    //#endregion

    //#region Selection Q&A Action Handlers

    /**
     * Replace selected blocks with AI response
     */
    private async handleReplaceSelection(content: string): Promise<void> {
        if (!this.currentSelection || this.currentSelection.blockIds.length === 0) {
            this.addSystemMessage("❌ No selection found");
            return;
        }

        try {
            const blockIds = this.currentSelection.blockIds;
            const firstBlockId = blockIds[0];
            const lastBlockId = blockIds[blockIds.length - 1];

            // Step 1: Insert new block after the selection
            const insertResponse = await fetch('/api/block/insertBlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dataType: 'markdown',
                    data: content,
                    nextID: lastBlockId  // Insert after last selected block
                })
            });

            if (!insertResponse.ok) {
                throw new Error(`Failed to insert block: ${insertResponse.statusText}`);
            }

            const insertResult = await insertResponse.json();
            console.log('[UnifiedAIPanel] Inserted new block:', insertResult);

            // Step 2: Delete all selected blocks
            for (const blockId of blockIds) {
                const deleteResponse = await fetch('/api/block/deleteBlock', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: blockId })
                });

                if (!deleteResponse.ok) {
                    console.warn(`[UnifiedAIPanel] Failed to delete block ${blockId}`);
                }
            }

            this.addSystemMessage(`✅ 已替换 ${blockIds.length} 个块`);
            this.clearCurrentSelection();

        } catch (error) {
            console.error('[UnifiedAIPanel] Error replacing selection:', error);
            this.addSystemMessage(`❌ 替换失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Insert AI response below selected blocks
     */
    private async handleInsertBelow(content: string): Promise<void> {
        if (!this.currentSelection || this.currentSelection.blockIds.length === 0) {
            this.addSystemMessage("❌ No selection found");
            return;
        }

        try {
            const blockIds = this.currentSelection.blockIds;
            const lastBlockId = blockIds[blockIds.length - 1];

            // Insert new block after the last selected block
            const insertResponse = await fetch('/api/block/insertBlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dataType: 'markdown',
                    data: content,
                    nextID: lastBlockId  // Insert after last block
                })
            });

            if (!insertResponse.ok) {
                throw new Error(`Failed to insert block: ${insertResponse.statusText}`);
            }

            const result = await insertResponse.json();
            console.log('[UnifiedAIPanel] Inserted block below selection:', result);

            this.addSystemMessage(`✅ 已在选中块下方插入内容`);
            this.clearCurrentSelection();

        } catch (error) {
            console.error('[UnifiedAIPanel] Error inserting below selection:', error);
            this.addSystemMessage(`❌ 插入失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    //#endregion

    //#region Public API
    setProtyle(protyle: IProtyle) {
        this.currentProtyle = protyle;
    }

    /**
     * Enter edit mode with selected text
     * @param textSelection The text selection to edit
     * @param showDiff Whether to show diff comparison
     */
    public enterEditMode(textSelection: TextSelection, showDiff: boolean = true): void {
        this.isEditMode = true;
        this.editModeSelection = textSelection;
        this.editModeShowDiff = showDiff;
        
        // Update UI to show edit mode
        this.showEditModeUI();
    }

    /**
     * Exit edit mode and return to normal chat
     */
    public exitEditMode(): void {
        this.isEditMode = false;
        this.editModeSelection = null;
        
        // Restore normal chat UI
        this.restoreNormalUI();
    }

    /**
     * Show edit mode UI with text preview
     */
    private showEditModeUI(): void {
        if (!this.editModeSelection) return;

        const inputArea = this.element.querySelector('.claude-input-area') as HTMLElement;
        if (!inputArea) return;

        // Create preview container if not exists
        let previewContainer = this.element.querySelector('.edit-mode-preview') as HTMLElement;
        if (!previewContainer) {
            previewContainer = document.createElement('div');
            previewContainer.className = 'edit-mode-preview';
            inputArea.insertBefore(previewContainer, inputArea.firstChild);
        }

        // Show text preview (first 100 characters)
        const preview = this.editModeSelection.selectedText.substring(0, 100);
        const truncated = this.editModeSelection.selectedText.length > 100 ? '...' : '';
        
        previewContainer.innerHTML = `
            <div class="edit-mode-header">
                <span class="edit-mode-icon">✏️</span>
                <span class="edit-mode-title">编辑模式</span>
                <button class="edit-mode-close" data-action="exit-edit-mode">×</button>
            </div>
            <div class="edit-mode-text-preview">
                <strong>选中文本预览：</strong>
                <div class="preview-content">${this.escapeHtml(preview)}${truncated}</div>
            </div>
            <div class="edit-mode-options">
                <label>
                    <input type="checkbox" class="edit-mode-diff-checkbox" ${this.editModeShowDiff ? 'checked' : ''} />
                    显示对比差异
                </label>
            </div>
        `;

        // Update input placeholder
        const textarea = this.element.querySelector('#claude-input') as HTMLTextAreaElement;
        if (textarea) {
            textarea.placeholder = '请输入编辑指令，然后按发送...';
            textarea.focus();
        }

        // Update send button text
        const sendButton = this.element.querySelector('#claude-send-btn') as HTMLElement;
        if (sendButton) {
            sendButton.textContent = '编辑文本';
        }

        // Attach event listeners
        const closeBtn = previewContainer.querySelector('.edit-mode-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.exitEditMode());
        }

        const diffCheckbox = previewContainer.querySelector('.edit-mode-diff-checkbox') as HTMLInputElement;
        if (diffCheckbox) {
            diffCheckbox.addEventListener('change', (e) => {
                this.editModeShowDiff = (e.target as HTMLInputElement).checked;
            });
        }
    }

    /**
     * Restore normal chat UI
     */
    private restoreNormalUI(): void {
        // Remove preview container
        const previewContainer = this.element.querySelector('.edit-mode-preview');
        if (previewContainer) {
            previewContainer.remove();
        }

        // Restore input placeholder
        const textarea = this.element.querySelector('#claude-input') as HTMLTextAreaElement;
        if (textarea) {
            textarea.placeholder = '输入消息...';
        }

        // Restore send button text
        const sendButton = this.element.querySelector('.unified-send-btn') as HTMLElement;
        if (sendButton) {
            sendButton.textContent = '发送';
        }
    }

    getElement(): HTMLElement {
        return this.element;
    }

    destroy() {
        // Stop selection monitoring
        this.stopSelectionMonitoring();

        // Unsubscribe from preset events (NEW v0.9.0)
        if (this.presetEventUnsubscribe) {
            this.presetEventUnsubscribe();
            this.presetEventUnsubscribe = null;
        }

        // Remove element
        this.element.remove();
    }

    /**
     * Add a new text selection to the edit queue
     * Called from edit queue when processing selections
     */
    addEditSelection(selection: TextSelection) {
        // Selection is already managed by TextSelectionManager
        // Just refresh UI
        this.refreshQueueUI();

        // Auto-expand if configured
        if (this.config.autoExpandQueue) {
            this.setQueueExpanded(true);
        }
    }
    //#endregion
}
