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
import { isChatMessage, isEditMessage, DEFAULT_UNIFIED_PANEL_CONFIG } from "./unified-types";
import { TextSelectionManager } from "../editor/TextSelectionManager";
import { AIEditProcessor } from "../editor/AIEditProcessor";
import { EditQueue } from "../editor/EditQueue";
import { DiffRenderer } from "../editor/DiffRenderer";
import { EditorHelper } from "../editor";
import { marked } from "marked";
import hljs from "highlight.js";
import DOMPurify from "dompurify";

export class UnifiedAIPanel {
    // Core dependencies
    private element: HTMLElement;
    private claudeClient: ClaudeClient;
    private currentProtyle: any = null;

    // Chat state
    private messages: UnifiedMessage[] = [];
    private isStreaming: boolean = false;

    // Edit state
    private textSelectionManager: TextSelectionManager;
    private aiEditProcessor: AIEditProcessor;
    private editQueue: EditQueue;
    private diffRenderer: DiffRenderer;
    private editQueueState: EditQueueState = {
        expanded: false,
        queueSize: 0,
        processingCount: 0
    };

    // Edit mode state
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
        this.onSettingsCallback = onSettings;
        this.config = { ...DEFAULT_UNIFIED_PANEL_CONFIG, ...config };

        // Configure markdown
        this.configureMarkdown();

        // Create UI
        this.element = this.createPanel();

        // Setup event listeners
        this.attachEventListeners();

        // Listen to edit events
        this.textSelectionManager.addEventListener((event) => this.handleEditEvent(event));

        // Load queue state from localStorage
        this.loadQueueState();
    }

    //#region Markdown Configuration
    private configureMarkdown() {
        marked.setOptions({
            highlight: function (code, lang) {
                if (lang && hljs.getLanguage(lang)) {
                    try {
                        return hljs.highlight(code, { language: lang }).value;
                    } catch (err) {
                        console.error("Highlight error:", err);
                    }
                }
                return hljs.highlightAuto(code).value;
            },
            breaks: true,
            gfm: true,
        });
    }

    private renderMarkdown(content: string): string {
        const rawHtml = marked.parse(content) as string;
        return DOMPurify.sanitize(rawHtml, {
            ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'span'],
            ALLOWED_ATTR: ['href', 'class', 'target', 'rel'],
        });
    }
    //#endregion

    //#region Panel Creation
    private createPanel(): HTMLElement {
        const container = document.createElement("div");
        container.className = "claude-unified-panel fn__flex-column";
        container.style.cssText = "height: 100%; display: flex; flex-direction: column;";

        container.innerHTML = `
            <!-- Compact Header -->
            <div class="claude-unified-header" style="padding: 4px 6px; border-bottom: 1px solid var(--b3-border-color); flex-shrink: 0;">
                <div class="fn__flex" style="align-items: center; justify-content: flex-end; gap: 3px;">
                    <button class="b3-button b3-button--text" id="claude-settings-btn" title="设置" style="padding: 2px 4px;">
                        <svg class="fn__size200"><use xlink:href="#iconSettings"></use></svg>
                    </button>
                    <button class="b3-button b3-button--text" id="claude-use-selection" title="使用选中文本" style="padding: 2px 4px;">
                        <svg class="fn__size200"><use xlink:href="#iconSelect"></use></svg>
                    </button>
                    <button class="b3-button b3-button--text" id="claude-clear-chat" title="清空对话" style="padding: 2px 4px;">
                        <svg class="fn__size200"><use xlink:href="#iconTrashcan"></use></svg>
                    </button>
                </div>
            </div>

            <!-- Collapsible Edit Queue Region -->
            <div class="claude-queue-region" id="claude-queue-region" style="flex-shrink: 0; border-bottom: 1px solid var(--b3-border-color); display: ${this.config.showEditQueue ? 'block' : 'none'};">
                <!-- Queue Summary (Always Visible) - Compact Single Line -->
                <div class="claude-queue-summary" id="claude-queue-summary" style="padding: 4px 8px; cursor: pointer; background: var(--b3-list-hover);">
                    <div class="fn__flex" style="align-items: center; justify-content: space-between;">
                        <div class="fn__flex" style="align-items: center; gap: 6px; font-size: 12px;">
                            <span class="claude-queue-toggle" id="claude-queue-toggle" style="font-size: 10px;">▶</span>
                            <span style="font-weight: 500;">📝</span>
                            <span class="ft__secondary" id="queue-count">编辑队列 (0)</span>
                            <span class="ft__secondary" id="queue-stats" style="font-size: 11px; opacity: 0.7;">处理中: 0</span>
                        </div>
                        <div class="fn__flex" style="align-items: center; gap: 4px;">
                            <button class="b3-button b3-button--text" id="queue-pause-btn" title="暂停队列" style="display: none; padding: 1px 3px;">
                                <svg class="fn__size200"><use xlink:href="#iconPause"></use></svg>
                            </button>
                            <button class="b3-button b3-button--text" id="queue-clear-btn" title="清空队列" style="display: none; padding: 1px 3px;">
                                <svg class="fn__size200"><use xlink:href="#iconTrashcan"></use></svg>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Queue Details (Collapsible) -->
                <div class="claude-queue-details" id="claude-queue-details" style="max-height: 150px; overflow-y: auto; padding: 6px; display: none;">
                    <div class="ft__secondary" style="text-align: center; padding: 8px; font-size: 12px;">
                        选择文本并右键发送到 AI 编辑
                    </div>
                </div>
            </div>

            <!-- Messages Container -->
            <div class="claude-messages" id="claude-messages" style="flex: 1; overflow-y: auto; padding: 6px;">

            </div>

            <!-- Compact Input Area -->
            <div class="claude-input-area" style="flex-shrink: 0; padding: 6px; border-top: 1px solid var(--b3-border-color);">
                <div class="fn__flex-column" style="gap: 6px;">
                    <textarea class="b3-text-field" id="claude-input"
                              placeholder="Ask Claude anything..."
                              rows="3"
                              style="resize: vertical; min-height: 54px; font-size: 13px;"></textarea>
                    <div class="fn__flex" style="justify-content: space-between; align-items: center;">
                        <div class="ft__smaller ft__secondary" id="claude-context-info" style="font-size: 11px;"></div>
                        <div class="fn__flex" style="gap: 6px;">
                            <button class="b3-button b3-button--outline b3-button--small" id="claude-insert-btn" title="Insert response at cursor" style="display: none; padding: 2px 8px;">
                                Insert
                            </button>
                            <button class="b3-button b3-button--outline b3-button--small" id="claude-replace-btn" title="Replace selected text" style="display: none; padding: 2px 8px;">
                                Replace
                            </button>
                            <button class="b3-button b3-button--text" id="claude-send-btn" style="padding: 3px 10px;">
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

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
        const useSelectionBtn = this.element.querySelector("#claude-use-selection");
        const insertBtn = this.element.querySelector("#claude-insert-btn");
        const replaceBtn = this.element.querySelector("#claude-replace-btn");

        // Queue controls
        const queueSummary = this.element.querySelector("#claude-queue-summary");
        const queueToggle = this.element.querySelector("#claude-queue-toggle");
        const queuePauseBtn = this.element.querySelector("#queue-pause-btn");
        const queueClearBtn = this.element.querySelector("#queue-clear-btn");

        // Chat event listeners
        sendBtn?.addEventListener("click", () => this.sendMessage());
        input?.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        settingsBtn?.addEventListener("click", () => {
            if (this.onSettingsCallback) {
                this.onSettingsCallback();
            }
        });
        clearBtn?.addEventListener("click", () => this.clearChat());
        useSelectionBtn?.addEventListener("click", () => this.useSelectedText());
        insertBtn?.addEventListener("click", () => this.insertLastResponse());
        replaceBtn?.addEventListener("click", () => this.replaceSelectedText());

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
    }
    //#endregion

    //#region Chat Functionality
    private async sendMessage() {
        const input = this.element.querySelector("#claude-input") as HTMLTextAreaElement;
        const sendBtn = this.element.querySelector("#claude-send-btn") as HTMLButtonElement;
        const userMessage = input.value.trim();

        if (!userMessage || this.isStreaming) {
            return;
        }

        // Handle edit mode
        if (this.isEditMode && this.editModeSelection) {
            await this.processEditModeRequest(userMessage);
            return;
        }

        if (!this.claudeClient.isConfigured()) {
            this.addSystemMessage("Please configure your Claude API key in settings first.");
            return;
        }

        // Create chat message
        const chatMessage: ChatMessage = {
            id: `chat-${Date.now()}`,
            type: 'chat',
            role: 'user',
            content: userMessage,
            timestamp: Date.now()
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
        const apiMessages = this.messages.filter(isChatMessage).map(m => ({
            role: m.role,
            content: m.content
        }));

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
                this.updateActionButtons();

                // Remove streaming message and add final one
                const streamingMsg = document.getElementById(streamingMsgId);
                if (streamingMsg) {
                    streamingMsg.remove();
                }
                this.addChatMessageToUI(assistantMessage);
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

    private addChatMessageToUI(message: ChatMessage) {
        if (!this.messagesContainer) return;

        // Remove welcome message if exists
        const welcome = this.messagesContainer.querySelector(".ft__secondary");
        if (welcome) welcome.remove();

        const messageDiv = document.createElement("div");
        messageDiv.className = `claude-message claude-message-chat claude-message-${message.role}`;
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
        roleLabel.textContent = message.role === "user" ? "You" : "Claude";

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

        // Use markdown rendering for assistant messages
        if (message.role === "assistant") {
            contentDiv.innerHTML = this.renderMarkdown(message.content);
        } else {
            contentDiv.textContent = message.content;
        }

        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);
        this.messagesContainer.appendChild(messageDiv);

        // Scroll to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    private createStreamingChatMessage(): string {
        if (!this.messagesContainer) return "";

        const messageId = `streaming-${Date.now()}`;
        const messageDiv = document.createElement("div");
        messageDiv.id = messageId;
        messageDiv.className = "claude-message claude-message-chat claude-message-assistant";
        messageDiv.style.cssText = `
            margin-bottom: 12px;
            padding: 8px 12px;
            border-radius: 4px;
        `;

        const headerDiv = document.createElement("div");
        headerDiv.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;";

        const roleLabel = document.createElement("div");
        roleLabel.className = "ft__smaller ft__secondary";
        roleLabel.textContent = "Claude";

        const typingIndicator = document.createElement("span");
        typingIndicator.className = "claude-typing-indicator ft__smaller ft__secondary";
        typingIndicator.textContent = "typing...";
        typingIndicator.style.cssText = "animation: pulse 1.5s ease-in-out infinite;";

        headerDiv.appendChild(roleLabel);
        headerDiv.appendChild(typingIndicator);

        const contentDiv = document.createElement("div");
        contentDiv.className = "claude-message-content";
        contentDiv.innerHTML = '<span class="claude-cursor">▋</span>';

        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);
        this.messagesContainer.appendChild(messageDiv);

        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

        return messageId;
    }

    private updateStreamingMessage(messageId: string, content: string) {
        const messageDiv = this.element.querySelector(`#${messageId}`);
        if (!messageDiv) return;

        const contentDiv = messageDiv.querySelector(".claude-message-content");
        if (contentDiv) {
            // Render markdown with cursor
            contentDiv.innerHTML = this.renderMarkdown(content) + '<span class="claude-cursor">▋</span>';
        }

        // Remove typing indicator once content starts
        if (content.length > 0) {
            const typingIndicator = messageDiv.querySelector(".claude-typing-indicator");
            if (typingIndicator) {
                typingIndicator.remove();
            }
        }

        // Scroll to bottom
        if (this.messagesContainer) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }

    private addSystemMessage(message: string) {
        if (!this.messagesContainer) return;

        const messageDiv = document.createElement("div");
        messageDiv.className = "claude-message claude-message-system";
        messageDiv.style.cssText = `
            margin-bottom: 12px;
            padding: 8px 12px;
            border-radius: 4px;
            color: var(--b3-theme-error);
            font-size: 12px;
        `;
        messageDiv.textContent = message;

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
                        Start a conversation with Claude or select text and click the select button above.
                    </div>
                `;
            }
        }

        this.updateActionButtons();
    }

    private useSelectedText() {
        const selectedText = EditorHelper.getSelectedText(this.currentProtyle);
        if (!selectedText) {
            this.addSystemMessage("No text selected. Please select some text in the editor first.");
            return;
        }

        const input = this.element.querySelector("#claude-input") as HTMLTextAreaElement;
        const contextInfo = this.element.querySelector("#claude-context-info");

        if (input) {
            input.value = `Context: ${selectedText}\n\n`;
            input.focus();
        }

        if (contextInfo) {
            contextInfo.textContent = `Using ${selectedText.length} characters as context`;
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

    private insertLastResponse() {
        const lastResponse = this.getLastChatAssistantMessage();
        if (!lastResponse) {
            this.addSystemMessage("No response to insert.");
            return;
        }

        const success = EditorHelper.insertTextAtCursor(lastResponse, this.currentProtyle);
        if (success) {
            this.addSystemMessage("Response inserted at cursor position.");
        } else {
            this.addSystemMessage("Failed to insert response. Please click in the editor first.");
        }
    }

    private replaceSelectedText() {
        const lastResponse = this.getLastChatAssistantMessage();
        if (!lastResponse) {
            this.addSystemMessage("No response to use for replacement.");
            return;
        }

        if (!EditorHelper.hasSelection()) {
            this.addSystemMessage("No text selected. Please select text to replace.");
            return;
        }

        const success = EditorHelper.replaceSelectedText(lastResponse, this.currentProtyle);
        if (success) {
            this.addSystemMessage("Selected text replaced with response.");
        } else {
            this.addSystemMessage("Failed to replace text.");
        }
    }

    private updateActionButtons() {
        const insertBtn = this.element.querySelector("#claude-insert-btn") as HTMLElement;
        const replaceBtn = this.element.querySelector("#claude-replace-btn") as HTMLElement;

        const hasResponse = this.getLastChatAssistantMessage().length > 0;

        if (insertBtn) {
            insertBtn.style.display = hasResponse ? "block" : "none";
        }

        if (replaceBtn) {
            replaceBtn.style.display = hasResponse ? "block" : "none";
        }
    }

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
                this.updateActionButtons();

                // Remove streaming message and add final one
                const streamingMsg = document.getElementById(streamingMsgId);
                if (streamingMsg) {
                    streamingMsg.remove();
                }
                this.addChatMessageToUI(assistantMessage);
            }
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
        switch (status) {
            case 'queued': return '⏸ 队列中';
            case 'processing': return '⏳ 处理中';
            case 'completed': return '✓ 完成';
            case 'error': return '❌ 错误';
            case 'applied': return '✅ 已应用';
            case 'rejected': return '⊘ 已拒绝';
            default: return status;
        }
    }

    private refreshQueueUI() {
        const queueDetails = this.element.querySelector("#claude-queue-details") as HTMLElement;
        const queueCountSpan = this.element.querySelector("#queue-count");
        const queueStatsSpan = this.element.querySelector("#queue-stats");

        if (!queueDetails) return;

        const selections = this.textSelectionManager.getAllSelections();
        const queueStats = this.editQueue.getStatistics();

        // Update count
        if (queueCountSpan) {
            queueCountSpan.textContent = `编辑队列 (${selections.length})`;
        }

        // Update stats
        if (queueStatsSpan) {
            const managerStats = this.textSelectionManager.getStatistics();
            queueStatsSpan.textContent = `处理中: ${queueStats.processing}`;

            if (queueStats.isPaused) {
                queueStatsSpan.textContent += ' (已暂停)';
            }
        }

        // Update list
        if (selections.length === 0) {
            queueDetails.innerHTML = `
                <div class="ft__secondary" style="text-align: center; padding: 12px;">
                    选择文本并右键发送到 AI 编辑
                </div>
            `;
        } else {
            queueDetails.innerHTML = selections.map(s => this.createQueueItem(s)).join('');

            // Bind click events
            selections.forEach(selection => {
                const item = queueDetails.querySelector(`[data-selection-id="${selection.id}"]`);
                item?.addEventListener('click', () => {
                    if (selection.status === 'completed' && selection.editResult) {
                        // Scroll to the edit message in the stream
                        const editMsg = this.messages.find(m =>
                            isEditMessage(m) && m.selection.id === selection.id
                        );
                        if (editMsg) {
                            // Auto-scroll to this message
                            // (Implementation could be enhanced)
                        }
                    }
                });
            });
        }

        // Show/hide queue controls
        const pauseBtn = this.element.querySelector("#queue-pause-btn") as HTMLElement;
        const clearBtn = this.element.querySelector("#queue-clear-btn") as HTMLElement;

        if (pauseBtn && clearBtn) {
            const hasItems = selections.length > 0;
            pauseBtn.style.display = hasItems ? "block" : "none";
            clearBtn.style.display = hasItems ? "block" : "none";
        }

        // Update pause button icon
        this.updatePauseButtonIcon();

        // Update state
        this.editQueueState.queueSize = selections.length;
        this.editQueueState.processingCount = queueStats.processing;
    }

    private createQueueItem(selection: TextSelection): string {
        const statusIcon = this.getQueueItemStatusIcon(selection.status);
        const lineInfo = `第 ${selection.startLine + 1}-${selection.endLine + 1} 行`;
        const preview = this.truncate(selection.selectedText, 40);

        return `
            <div class="b3-list-item" data-selection-id="${selection.id}" style="padding: 6px; margin-bottom: 2px; cursor: pointer; font-size: 12px;">
                <div class="fn__flex" style="align-items: center; gap: 6px;">
                    <span>${statusIcon}</span>
                    <div class="fn__flex-column" style="flex: 1;">
                        <span class="ft__smaller">${lineInfo}</span>
                        <span class="ft__smaller ft__secondary">${this.escapeHtml(preview)}</span>
                    </div>
                </div>
            </div>
        `;
    }

    private getQueueItemStatusIcon(status: TextSelection['status']): string {
        switch (status) {
            case 'pending': return '⏸';
            case 'processing': return '⏳';
            case 'completed': return '✓';
            case 'error': return '❌';
            case 'cancelled': return '⊘';
            default: return '?';
        }
    }

    private toggleQueueExpansion() {
        const newState = !this.editQueueState.expanded;
        this.setQueueExpanded(newState);
    }

    private setQueueExpanded(expanded: boolean) {
        this.editQueueState.expanded = expanded;

        const queueDetails = this.element.querySelector("#claude-queue-details") as HTMLElement;
        const queueToggle = this.element.querySelector("#claude-queue-toggle") as HTMLElement;

        if (queueDetails) {
            queueDetails.style.display = expanded ? "block" : "none";
        }

        if (queueToggle) {
            queueToggle.textContent = expanded ? "▼" : "▶";
        }

        this.saveQueueState();
    }

    private toggleQueuePause() {
        if (this.editQueue.isPaused()) {
            this.editQueue.resumeQueue();
        } else {
            this.editQueue.pauseQueue();
        }

        this.updatePauseButtonIcon();
        this.refreshQueueUI();
    }

    private updatePauseButtonIcon() {
        const pauseBtn = this.element.querySelector("#queue-pause-btn") as HTMLButtonElement;
        if (!pauseBtn) return;

        if (this.editQueue.isPaused()) {
            pauseBtn.innerHTML = '<svg><use xlink:href="#iconPlay"></use></svg>';
            pauseBtn.title = '恢复队列';
        } else {
            pauseBtn.innerHTML = '<svg><use xlink:href="#iconPause"></use></svg>';
            pauseBtn.title = '暂停队列';
        }
    }

    private clearEditQueue() {
        const confirmed = confirm('确定要清空所有编辑任务吗？');
        if (!confirmed) return;

        this.editQueue.cancelAll();
        this.textSelectionManager.clearAll();

        this.refreshQueueUI();
    }
    //#endregion

    //#region State Persistence
    private loadQueueState() {
        try {
            const saved = localStorage.getItem('claude-queue-state');
            if (saved) {
                const state = JSON.parse(saved);
                this.editQueueState.expanded = state.expanded ?? true;
            }
        } catch (error) {
            console.warn('[UnifiedAIPanel] Failed to load queue state:', error);
        }
    }

    private saveQueueState() {
        try {
            localStorage.setItem('claude-queue-state', JSON.stringify({
                expanded: this.editQueueState.expanded
            }));
        } catch (error) {
            console.warn('[UnifiedAIPanel] Failed to save queue state:', error);
        }
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
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    //#endregion

    //#region Public API
    setProtyle(protyle: any) {
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
        this.element.remove();
    }

    /**
     * Add a new text selection to the edit queue
     * Called from plugin's sendToAIEdit method
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
