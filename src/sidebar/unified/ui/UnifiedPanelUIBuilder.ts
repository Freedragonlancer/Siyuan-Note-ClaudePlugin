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
                    <!-- Image Preview Area (initially hidden) -->
                    <div class="claude-image-preview-area" id="claude-image-preview-area" style="display: none; flex-wrap: wrap; gap: 6px; padding: 6px; background: var(--b3-theme-background-light); border-radius: 6px; max-height: 120px; overflow-y: auto;">
                        <!-- Image previews will be inserted here -->
                    </div>
                    <!-- Text Input with Image Upload Button -->
                    <div class="fn__flex" style="gap: 6px; align-items: flex-start;">
                        <div style="flex: 1;">
                            <textarea class="b3-text-field" id="claude-input"
                                      placeholder="Ask Claude anything... (Ctrl+V to paste image)"
                                      rows="3"
                                      style="resize: vertical; min-height: 54px; font-size: 13px; width: 100%;"></textarea>
                        </div>
                        <div class="fn__flex-column" style="gap: 4px;">
                            <button class="b3-button b3-button--text" id="claude-image-upload-btn" title="上传图片" style="padding: 4px;">
                                <svg class="fn__size200" style="width: 16px; height: 16px;">
                                    <use xlink:href="#iconImage"></use>
                                </svg>
                            </button>
                            <input type="file" id="claude-image-file-input" accept="image/jpeg,image/png,image/gif,image/webp" multiple style="display: none;">
                        </div>
                    </div>
                    <div class="fn__flex" style="justify-content: space-between; align-items: center; gap: 8px;">
                        <div class="fn__flex" style="align-items: center; gap: 8px; flex: 1; min-width: 0; overflow: hidden;">
                            <div class="provider-info-badge" data-provider-badge style="display: inline-flex; align-items: center; padding: 2px 8px; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 10px; font-size: 10px; font-weight: 500; color: var(--b3-theme-on-surface); white-space: nowrap; overflow: hidden; flex-shrink: 1; min-width: 60px;">
                                <span class="provider-text" style="overflow: hidden; text-overflow: ellipsis;">Loading...</span>
                            </div>
                            <div class="ft__smaller ft__secondary" id="claude-context-info" style="font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></div>
                        </div>
                        <div class="fn__flex" style="gap: 6px; flex-shrink: 0;">
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
     * Create provider info badge HTML
     */
    static createProviderBadge(providerName: string, modelName: string): string {
        return `
            <span class="provider-icon" style="margin-right: 4px;">🤖</span>
            <span class="provider-text">${SecurityUtils.escapeHtml(providerName)}</span>
            <span class="model-badge" style="margin-left: 6px; padding: 2px 6px; background: rgba(255, 255, 255, 0.1); border-radius: 8px; font-size: 10px;">
                ${SecurityUtils.escapeHtml(modelName)}
            </span>
        `;
    }

    /**
     * Create system message HTML
     */
    static createSystemMessage(message: string, type: 'info' | 'error' | 'warning' = 'info'): string {
        const colors = {
            info: 'var(--b3-theme-primary)',
            error: 'var(--b3-theme-error)',
            warning: 'var(--b3-theme-warning)'
        };

        const icons = {
            info: 'ℹ️',
            error: '❌',
            warning: '⚠️'
        };

        return `
            <div class="claude-system-message" style="padding: 8px; margin-bottom: 8px; background: var(--b3-theme-background-light); border-left: 3px solid ${colors[type]}; border-radius: 4px;">
                <div style="font-size: 12px; color: var(--b3-theme-on-surface);">
                    <span style="margin-right: 6px;">${icons[type]}</span>
                    <span>${SecurityUtils.escapeHtml(message)}</span>
                </div>
            </div>
        `;
    }

    /**
     * Create empty queue placeholder HTML
     */
    static createEmptyQueueMessage(): string {
        return `
            <div class="ft__secondary" style="text-align: center; padding: 12px;">
                选择文本并右键发送到 AI 编辑
            </div>
        `;
    }

    /**
     * Create mode badge HTML
     */
    static createModeBadge(blockCount: number): string {
        return `📝 已选中 ${blockCount} 个块`;
    }

    /**
     * Create preset selector option HTML
     */
    static createPresetOption(
        presetId: string,
        presetName: string,
        icon: string = '📝',
        selected: boolean = false
    ): string {
        const escapedId = SecurityUtils.escapeHtml(presetId);
        const escapedName = SecurityUtils.escapeHtml(presetName);
        const escapedIcon = SecurityUtils.escapeHtml(icon);

        return `<option value="${escapedId}" ${selected ? 'selected' : ''}>${escapedIcon} ${escapedName}</option>`;
    }

    /**
     * Create image preview item HTML for the upload preview area
     * @param imageId Unique identifier for the image
     * @param dataUrl Base64 data URL of the image for preview
     * @param fileName Original file name (for tooltip)
     */
    static createImagePreviewItem(imageId: string, dataUrl: string, fileName: string): string {
        const escapedFileName = SecurityUtils.escapeHtml(fileName);
        return `
            <div class="claude-image-preview-item" data-image-id="${imageId}" style="position: relative; display: inline-block;">
                <img src="${dataUrl}" alt="${escapedFileName}" title="${escapedFileName}"
                     style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid var(--b3-border-color); cursor: pointer;"
                     onclick="this.parentElement.querySelector('.claude-image-fullscreen').style.display='flex'">
                <button class="claude-image-remove-btn" data-image-id="${imageId}" title="移除图片"
                        style="position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; border-radius: 50%; background: var(--b3-theme-error); color: white; border: none; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; padding: 0; line-height: 1;">
                    ×
                </button>
                <!-- Fullscreen overlay (initially hidden) -->
                <div class="claude-image-fullscreen" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.9); z-index: 10000; align-items: center; justify-content: center; cursor: pointer;" onclick="this.style.display='none'">
                    <img src="${dataUrl}" alt="${escapedFileName}" style="max-width: 90%; max-height: 90%; object-fit: contain;">
                </div>
            </div>
        `;
    }

    /**
     * Create HTML for rendering an image in a chat message
     * @param dataUrl Base64 data URL or image URL
     * @param altText Alt text for the image
     */
    static createMessageImage(dataUrl: string, altText: string = 'Image'): string {
        const escapedAlt = SecurityUtils.escapeHtml(altText);
        return `
            <div class="claude-message-image" style="margin: 8px 0;">
                <img src="${dataUrl}" alt="${escapedAlt}"
                     style="max-width: 100%; max-height: 300px; border-radius: 6px; cursor: pointer; border: 1px solid var(--b3-border-color);"
                     onclick="window.open('${dataUrl}', '_blank')">
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
