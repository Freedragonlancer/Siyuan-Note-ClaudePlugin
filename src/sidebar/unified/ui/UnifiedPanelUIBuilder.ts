/**
 * Unified Panel UI Builder - Pure HTML Generation Module
 *
 * Responsible for generating all HTML content for the UnifiedAIPanel.
 * Separated as part of architectural refactoring (Task 2.1).
 *
 * @module UnifiedPanelUIBuilder
 * @see UnifiedAIPanel
 */

import type { UnifiedPanelConfig } from '../../unified-types';
import { SecurityUtils } from '../../../utils/Security';

/**
 * Utility class for building Unified AI Panel UI HTML
 */
export class UnifiedPanelUIBuilder {
    /**
     * Create main panel container with all sections
     */
    static createPanel(config: UnifiedPanelConfig): HTMLElement {
        const container = document.createElement("div");
        container.className = "claude-unified-panel fn__flex-column";
        container.style.cssText = "height: 100%; display: flex; flex-direction: column;";

        container.innerHTML = `
            <!-- Compact Header -->
            <div class="claude-unified-header" style="padding: 4px 6px; border-bottom: 1px solid var(--b3-border-color); flex-shrink: 0;">
                <div class="fn__flex" style="align-items: center; justify-content: space-between; gap: 6px;">
                    <div class="fn__flex" style="align-items: center; gap: 6px; flex: 1;">
                        <select class="b3-select" id="claude-preset-selector" title="选择预设" style="max-width: 150px; font-size: 12px;">
                            <option value="default">默认</option>
                        </select>
                        <span id="claude-mode-badge" class="claude-mode-badge" style="display: none; font-size: 11px; padding: 2px 8px; background: var(--b3-theme-primary-lighter); color: var(--b3-theme-primary); border-radius: 10px; white-space: nowrap;">📝 已选中 0 个块</span>
                    </div>
                    <div class="fn__flex" style="align-items: center; gap: 3px;">
                        <div class="provider-info-badge" data-provider-badge style="display: inline-flex; align-items: center; padding: 4px 10px; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 12px; font-size: 11px; font-weight: 500; color: var(--b3-theme-on-surface); white-space: nowrap;">
                            <span class="provider-text">Loading...</span>
                        </div>
                        <button class="b3-button b3-button--text" id="claude-settings-btn" title="设置" style="padding: 2px 4px;">
                            <svg class="fn__size200"><use xlink:href="#iconSettings"></use></svg>
                        </button>
                        <button class="b3-button b3-button--text" id="claude-clear-chat" title="清空对话" style="padding: 2px 4px;">
                            <svg class="fn__size200"><use xlink:href="#iconTrashcan"></use></svg>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Collapsible Edit Queue Region -->
            <div class="claude-queue-region" id="claude-queue-region" style="flex-shrink: 0; border-bottom: 1px solid var(--b3-border-color); display: ${config.showEditQueue ? 'block' : 'none'};">
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

        return container;
    }

    /**
     * Create HTML for a single queue item
     */
    static createQueueItem(
        id: string,
        index: number,
        text: string,
        instruction: string,
        statusIcon: string
    ): string {
        const truncatedText = this.truncate(text, 60);
        const truncatedInstruction = this.truncate(instruction, 80);

        return `
            <div class="claude-queue-item" data-queue-id="${id}" style="padding: 6px; margin: 4px 0; background: var(--b3-theme-background); border: 1px solid var(--b3-border-color); border-radius: 4px; font-size: 12px; cursor: pointer;">
                <div class="fn__flex" style="align-items: flex-start; gap: 6px;">
                    <span style="font-weight: 600; color: var(--b3-theme-primary);">#${index + 1}</span>
                    <div style="flex: 1; overflow: hidden;">
                        <div class="ft__secondary" style="margin-bottom: 2px;">
                            <span>${statusIcon}</span>
                            <span class="ft__smaller" style="opacity: 0.8;">${SecurityUtils.escapeHtml(truncatedInstruction)}</span>
                        </div>
                        <div class="ft__smaller" style="color: var(--b3-theme-on-surface-light); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${SecurityUtils.escapeHtml(truncatedText)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Create HTML for streaming chat message (initial empty state)
     */
    static createStreamingChatMessage(messageId: string): string {
        return `
            <div class="claude-message claude-message--assistant" data-message-id="${messageId}" style="padding: 8px; margin-bottom: 8px; background: var(--b3-theme-background); border-radius: 6px;">
                <div class="claude-message__header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <div style="font-size: 11px; color: var(--b3-theme-on-surface-light); font-weight: 500;">
                        🤖 Assistant
                    </div>
                    <div class="claude-message__actions" style="display: none; gap: 4px;">
                        <button class="b3-button b3-button--text b3-button--small claude-copy-message" title="Copy message" style="padding: 2px 4px;">
                            <svg class="fn__size200"><use xlink:href="#iconCopy"></use></svg>
                        </button>
                        <button class="b3-button b3-button--text b3-button--small claude-regenerate-message" title="Regenerate" style="padding: 2px 4px;">
                            <svg class="fn__size200"><use xlink:href="#iconRefresh"></use></svg>
                        </button>
                    </div>
                </div>
                <div class="claude-message__content" style="font-size: 13px; line-height: 1.6;">
                    <span class="claude-typing-cursor" style="display: inline-block; width: 8px; height: 14px; background: var(--b3-theme-primary); margin-left: 2px; animation: blink 1s infinite;">

</span>
                </div>
            </div>
        `;
    }

    /**
     * Create HTML for edit mode UI
     */
    static createEditModeUI(selectionText: string, showDiff: boolean): string {
        const preview = this.truncate(selectionText, 100);

        return `
            <div class="claude-edit-mode-info" style="padding: 8px; background: var(--b3-theme-primary-lightest); border-radius: 6px; margin-bottom: 8px;">
                <div class="fn__flex-column" style="gap: 6px;">
                    <div style="font-size: 12px; font-weight: 500; color: var(--b3-theme-primary);">
                        ✏️ 编辑模式
                    </div>
                    <div class="ft__secondary" style="font-size: 11px;">
                        选中文本预览:
                    </div>
                    <div class="preview-content" style="padding: 6px; background: var(--b3-theme-background); border-radius: 4px; font-size: 12px; max-height: 80px; overflow-y: auto; white-space: pre-wrap; word-break: break-word;">
                        ${SecurityUtils.escapeHtml(preview)}${selectionText.length > 100 ? '...' : ''}
                    </div>
                    <div class="fn__flex" style="align-items: center; gap: 6px; font-size: 11px;">
                        <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                            <input type="checkbox" class="b3-checkbox" id="edit-mode-show-diff" ${showDiff ? 'checked' : ''}>
                            <span>显示对比差异</span>
                        </label>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Truncate text to specified length
     */
    private static truncate(text: string, maxLength: number): string {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }
}
