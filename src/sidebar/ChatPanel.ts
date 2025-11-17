import type { Message } from "../claude";
import type { ClaudeClient } from "../claude/ClaudeClient";
import type { IProtyle } from "../types/siyuan";
import { EditorHelper } from "../editor";
import { marked } from "marked";
import hljs from "highlight.js";
import DOMPurify from "dompurify";

/**
 * Chat Panel UI for Claude conversations
 */
export class ChatPanel {
    private element: HTMLElement;
    private claudeClient: ClaudeClient;
    private messages: Message[] = [];
    private currentProtyle: IProtyle | null = null;
    private isStreaming: boolean = false;
    private onSettingsCallback?: () => void;

    constructor(claudeClient: ClaudeClient, onSettings?: () => void) {
        this.claudeClient = claudeClient;
        this.onSettingsCallback = onSettings;
        this.configureMarkdown();
        this.element = this.createPanel();
    }

    private configureMarkdown() {
        // Configure marked.js
        marked.setOptions({
            highlight: function(code, lang) {
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

    private createPanel(): HTMLElement {
        const container = document.createElement("div");
        container.className = "claude-chat-panel fn__flex-column";
        container.style.cssText = "height: 100%; display: flex; flex-direction: column;";

        container.innerHTML = `
            <div class="claude-chat-header" style="padding: 8px; border-bottom: 1px solid var(--b3-border-color); flex-shrink: 0;">
                <div class="fn__flex" style="align-items: center; justify-content: space-between;">
                    <span style="font-weight: 500;">Claude AI Assistant</span>
                    <div class="fn__flex" style="gap: 4px;">
                        <button class="b3-button b3-button--outline fn__size200" id="claude-settings-btn" title="Settings">
                            <svg><use xlink:href="#iconSettings"></use></svg>
                        </button>
                        <button class="b3-button b3-button--outline fn__size200" id="claude-use-selection" title="Use selected text as context">
                            <svg><use xlink:href="#iconSelect"></use></svg>
                        </button>
                        <button class="b3-button b3-button--outline fn__size200" id="claude-clear-chat" title="Clear conversation">
                            <svg><use xlink:href="#iconTrashcan"></use></svg>
                        </button>
                    </div>
                </div>
            </div>

            <div class="claude-messages" id="claude-messages" style="flex: 1; overflow-y: auto; padding: 8px;">
                <div class="ft__secondary" style="text-align: center; padding: 20px;">
                    Start a conversation with Claude or select text and click the select button above.
                </div>
            </div>

            <div class="claude-input-area" style="flex-shrink: 0; padding: 8px; border-top: 1px solid var(--b3-border-color);">
                <div class="fn__flex-column" style="gap: 8px;">
                    <textarea class="b3-text-field" id="claude-input"
                              placeholder="Ask Claude anything..."
                              rows="3"
                              style="resize: vertical; min-height: 60px;"></textarea>
                    <div class="fn__flex" style="justify-content: space-between; align-items: center;">
                        <div class="ft__smaller ft__secondary" id="claude-context-info"></div>
                        <div class="fn__flex" style="gap: 8px;">
                            <button class="b3-button b3-button--outline" id="claude-insert-btn" title="Insert response at cursor" style="display: none;">
                                Insert
                            </button>
                            <button class="b3-button b3-button--outline" id="claude-replace-btn" title="Replace selected text" style="display: none;">
                                Replace
                            </button>
                            <button class="b3-button b3-button--text" id="claude-send-btn">
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.attachEventListeners(container);
        return container;
    }

    private attachEventListeners(container: HTMLElement) {
        const input = container.querySelector("#claude-input") as HTMLTextAreaElement;
        const sendBtn = container.querySelector("#claude-send-btn") as HTMLButtonElement;
        const settingsBtn = container.querySelector("#claude-settings-btn");
        const clearBtn = container.querySelector("#claude-clear-chat");
        const useSelectionBtn = container.querySelector("#claude-use-selection");
        const insertBtn = container.querySelector("#claude-insert-btn");
        const replaceBtn = container.querySelector("#claude-replace-btn");

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
    }

    private async sendMessage() {
        const input = this.element.querySelector("#claude-input") as HTMLTextAreaElement;
        const sendBtn = this.element.querySelector("#claude-send-btn") as HTMLButtonElement;
        const userMessage = input.value.trim();

        if (!userMessage || this.isStreaming) {
            return;
        }

        if (!this.claudeClient.isConfigured()) {
            this.addSystemMessage("Please configure your Claude API key in settings first.");
            return;
        }

        // Add user message
        this.messages.push({ role: "user", content: userMessage });
        this.addMessageToUI("user", userMessage);

        // Clear input
        input.value = "";

        // Disable send button
        this.isStreaming = true;
        sendBtn.disabled = true;
        sendBtn.textContent = "Sending...";

        // Create assistant message container
        const assistantMessageId = this.createStreamingMessage();

        // Send to Claude
        let fullResponse = "";
        await this.claudeClient.sendMessage(
            this.messages,
            (chunk) => {
                fullResponse += chunk;
                this.updateStreamingMessage(assistantMessageId, fullResponse);
            },
            (error) => {
                this.addSystemMessage(`Error: ${error.message}`);
                this.isStreaming = false;
                sendBtn.disabled = false;
                sendBtn.textContent = "Send";
            },
            () => {
                this.messages.push({ role: "assistant", content: fullResponse });
                this.isStreaming = false;
                sendBtn.disabled = false;
                sendBtn.textContent = "Send";
                this.updateActionButtons();

                // Remove the streaming message and add final one with actions
                const streamingMsg = document.getElementById(assistantMessageId);
                if (streamingMsg) {
                    streamingMsg.remove();
                }
                this.addMessageToUI("assistant", fullResponse);
            }
        );
    }

    private addMessageToUI(role: "user" | "assistant" | "system", content: string) {
        const messagesContainer = this.element.querySelector("#claude-messages");
        if (!messagesContainer) return;

        // Remove welcome message if exists
        const welcome = messagesContainer.querySelector(".ft__secondary");
        if (welcome) welcome.remove();

        const messageDiv = document.createElement("div");
        messageDiv.className = `claude-message claude-message-${role}`;
        messageDiv.style.cssText = `
            margin-bottom: 12px;
            padding: 8px 12px;
            border-radius: 4px;
            background: ${role === "user" ? "var(--b3-list-hover)" : "transparent"};
            ${role === "system" ? "color: var(--b3-theme-error); font-size: 12px;" : ""}
            position: relative;
        `;

        // Header with role label and action buttons
        const headerDiv = document.createElement("div");
        headerDiv.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;";

        const roleLabel = document.createElement("div");
        roleLabel.className = "ft__smaller ft__secondary";
        roleLabel.textContent = role === "user" ? "You" : role === "assistant" ? "Claude" : "System";

        headerDiv.appendChild(roleLabel);

        // Add action buttons for assistant messages
        if (role === "assistant") {
            const actionsDiv = document.createElement("div");
            actionsDiv.className = "claude-message-actions";
            actionsDiv.style.cssText = "display: flex; gap: 4px; opacity: 0; transition: opacity 0.2s;";

            const copyBtn = document.createElement("button");
            copyBtn.className = "b3-button b3-button--text fn__size200";
            copyBtn.title = "Copy message";
            copyBtn.innerHTML = `<svg><use xlink:href="#iconCopy"></use></svg>`;
            copyBtn.onclick = () => this.copyMessage(content);

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

        // Use markdown rendering for assistant messages, plain text for others
        if (role === "assistant") {
            contentDiv.innerHTML = this.renderMarkdown(content);
        } else {
            contentDiv.textContent = content;
        }

        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);
        messagesContainer.appendChild(messageDiv);

        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    private addSystemMessage(message: string) {
        this.addMessageToUI("system", message);
    }

    private createStreamingMessage(): string {
        const messagesContainer = this.element.querySelector("#claude-messages");
        if (!messagesContainer) return "";

        const messageId = `streaming-${Date.now()}`;
        const messageDiv = document.createElement("div");
        messageDiv.id = messageId;
        messageDiv.className = "claude-message claude-message-assistant";
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
        messagesContainer.appendChild(messageDiv);

        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        return messageId;
    }

    private updateStreamingMessage(messageId: string, content: string) {
        const messageDiv = this.element.querySelector(`#${messageId}`);
        if (!messageDiv) return;

        const contentDiv = messageDiv.querySelector(".claude-message-content");
        if (contentDiv) {
            // Render markdown with a cursor at the end
            contentDiv.innerHTML = this.renderMarkdown(content) + '<span class="claude-cursor">▋</span>';
        }

        // Remove typing indicator once content starts arriving
        if (content.length > 0) {
            const typingIndicator = messageDiv.querySelector(".claude-typing-indicator");
            if (typingIndicator) {
                typingIndicator.remove();
            }
        }

        // Scroll to bottom
        const messagesContainer = this.element.querySelector("#claude-messages");
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    private clearChat() {
        this.messages = [];
        const messagesContainer = this.element.querySelector("#claude-messages");
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="ft__secondary" style="text-align: center; padding: 20px;">
                    Start a conversation with Claude or select text and click the select button above.
                </div>
            `;
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

    private getLastAssistantMessage(): string {
        for (let i = this.messages.length - 1; i >= 0; i--) {
            if (this.messages[i].role === "assistant") {
                return this.messages[i].content;
            }
        }
        return "";
    }

    private insertLastResponse() {
        const lastResponse = this.getLastAssistantMessage();
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
        const lastResponse = this.getLastAssistantMessage();
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

        const hasResponse = this.getLastAssistantMessage().length > 0;

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

        // Find the last user message
        let lastUserIndex = -1;
        for (let i = this.messages.length - 1; i >= 0; i--) {
            if (this.messages[i].role === "user") {
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

        // Re-render the chat UI
        const messagesContainer = this.element.querySelector("#claude-messages");
        if (messagesContainer) {
            messagesContainer.innerHTML = "";
            for (const msg of this.messages) {
                this.addMessageToUI(msg.role as any, msg.content);
            }
        }

        // Disable send button
        const sendBtn = this.element.querySelector("#claude-send-btn") as HTMLButtonElement;
        this.isStreaming = true;
        sendBtn.disabled = true;
        sendBtn.textContent = "Regenerating...";

        // Create assistant message container
        const assistantMessageId = this.createStreamingMessage();

        // Send to Claude
        let fullResponse = "";
        await this.claudeClient.sendMessage(
            this.messages,
            (chunk) => {
                fullResponse += chunk;
                this.updateStreamingMessage(assistantMessageId, fullResponse);
            },
            (error) => {
                this.addSystemMessage(`Error: ${error.message}`);
                this.isStreaming = false;
                sendBtn.disabled = false;
                sendBtn.textContent = "Send";
            },
            () => {
                this.messages.push({ role: "assistant", content: fullResponse });
                this.isStreaming = false;
                sendBtn.disabled = false;
                sendBtn.textContent = "Send";
                this.updateActionButtons();

                // Remove the streaming message and add final one with actions
                const streamingMsg = document.getElementById(assistantMessageId);
                if (streamingMsg) {
                    streamingMsg.remove();
                }
                this.addMessageToUI("assistant", fullResponse);
            }
        );
    }

    setProtyle(protyle: IProtyle) {
        this.currentProtyle = protyle;
    }

    getElement(): HTMLElement {
        return this.element;
    }

    destroy() {
        this.element.remove();
    }
}
