/**
 * Message Renderer - Markdown rendering and streaming updates
 *
 * Handles markdown parsing, syntax highlighting, and streaming message updates.
 * Extracted as part of architectural refactoring (Task 2.1 Phase 4).
 *
 * @module MessageRenderer
 * @see UnifiedAIPanel
 */

import { marked } from "marked";
import hljs from "highlight.js";
import DOMPurify from "dompurify";

/**
 * Utility class for rendering messages with markdown support
 */
export class MessageRenderer {
    private static configured = false;

    /**
     * Configure marked.js for markdown parsing
     * Should be called once during initialization
     */
    static configureMarkdown(): void {
        if (this.configured) return;

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

        this.configured = true;
    }

    /**
     * Render markdown content to sanitized HTML
     * Uses DOMPurify to prevent XSS attacks
     */
    static renderMarkdown(content: string): string {
        const rawHtml = marked.parse(content) as string;
        return DOMPurify.sanitize(rawHtml, {
            ALLOWED_TAGS: [
                'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre', 'a',
                'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
                'div', 'span'
            ],
            ALLOWED_ATTR: ['href', 'class', 'target', 'rel'],
        });
    }

    /**
     * Update streaming message content with cursor
     * Renders markdown and adds blinking cursor during streaming
     */
    static updateStreamingMessage(
        container: HTMLElement,
        messageId: string,
        content: string
    ): void {
        const messageDiv = container.querySelector(`#${messageId}`);
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
        const messagesContainer = container.querySelector("#claude-messages") as HTMLElement;
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    /**
     * Finalize streaming message (remove cursor, add actions)
     * Called when streaming is complete
     */
    static finalizeStreamingMessage(
        container: HTMLElement,
        messageId: string,
        finalContent: string
    ): void {
        const messageDiv = container.querySelector(`#${messageId}`);
        if (!messageDiv) return;

        const contentDiv = messageDiv.querySelector(".claude-message-content");
        if (contentDiv) {
            // Render final markdown without cursor
            contentDiv.innerHTML = this.renderMarkdown(finalContent);
        }

        // Show action buttons
        const actionsDiv = messageDiv.querySelector(".claude-message__actions") as HTMLElement;
        if (actionsDiv) {
            actionsDiv.style.display = 'flex';
        }

        // Remove typing indicator if still present
        const typingIndicator = messageDiv.querySelector(".claude-typing-indicator");
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    /**
     * Create a streaming message placeholder in the DOM
     * Returns the message ID for updates
     */
    static createStreamingMessageDOM(
        messagesContainer: HTMLElement,
        providerName: string
    ): string {
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
        roleLabel.textContent = providerName;

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
}
