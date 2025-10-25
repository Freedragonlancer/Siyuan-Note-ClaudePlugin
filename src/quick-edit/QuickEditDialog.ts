/**
 * Quick Edit Dialog - Floating dialog for instant AI text editing
 */

import type { Plugin } from 'siyuan';
import type {
    QuickEditState,
    QuickEditRequest,
    QuickEditResponse,
    DialogPosition,
    StateChangeCallback
} from './types';
import type { CustomInstruction, EditSettings, EditResult } from '@/editor/types';
import { DiffRenderer } from '@/editor/DiffRenderer';

export class QuickEditDialog {
    private plugin: Plugin;
    private element: HTMLElement | null = null;
    private state: QuickEditState;
    private settings: EditSettings;
    private diffRenderer: DiffRenderer;

    // Current request data
    private currentRequest: QuickEditRequest | null = null;
    private currentResponse: QuickEditResponse | null = null;

    // Callbacks
    private onSendCallback?: (request: QuickEditRequest) => void;
    private onApplyCallback?: (response: QuickEditResponse) => void;
    private onRejectCallback?: () => void;
    private onRetryCallback?: (request: QuickEditRequest) => void;
    private onStateChangeCallback?: StateChangeCallback;

    constructor(
        plugin: Plugin,
        settings: EditSettings
    ) {
        this.plugin = plugin;
        this.state = 'idle' as QuickEditState;
        this.settings = settings;
        this.diffRenderer = new DiffRenderer();
    }

    /**
     * Show dialog at cursor position
     */
    public show(selectedText?: string, blockId?: string): void {
        if (this.element) {
            this.close();
        }

        this.element = this.createDialog(selectedText);
        document.body.appendChild(this.element);

        // Position dialog near cursor
        const position = this.calculatePosition();
        this.element.style.left = `${position.x}px`;
        this.element.style.top = `${position.y}px`;

        // Focus on instruction input if no preset selected
        this.focusDefaultInput();

        this.setState('editing' as QuickEditState);
    }

    /**
     * Close dialog
     */
    public close(): void {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }

        this.currentRequest = null;
        this.currentResponse = null;
        this.setState('idle' as QuickEditState);
    }

    /**
     * Update settings
     */
    public updateSettings(settings: EditSettings): void {
        this.settings = settings;
    }

    /**
     * Show processing state
     */
    public showProcessing(): void {
        this.setState('processing' as QuickEditState);

        if (!this.element) return;

        // Disable inputs and show loading
        const sendBtn = this.element.querySelector('#qe-send-btn') as HTMLButtonElement;
        const loadingIndicator = this.element.querySelector('#qe-loading') as HTMLElement;

        if (sendBtn) sendBtn.disabled = true;
        if (loadingIndicator) loadingIndicator.style.display = 'block';
    }

    /**
     * Show diff review
     */
    public showDiffReview(response: QuickEditResponse): void {
        this.currentResponse = response;
        this.setState('reviewing' as QuickEditState);

        if (!this.element) return;

        // Hide input section, show diff section
        const inputSection = this.element.querySelector('#qe-input-section') as HTMLElement;
        const diffSection = this.element.querySelector('#qe-diff-section') as HTMLElement;
        const actionsSection = this.element.querySelector('#qe-actions-section') as HTMLElement;
        const loadingIndicator = this.element.querySelector('#qe-loading') as HTMLElement;

        if (inputSection) inputSection.style.display = 'none';
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (diffSection) {
            diffSection.style.display = 'block';
            const diffContainer = diffSection.querySelector('#qe-diff-container') as HTMLElement;
            if (diffContainer) {
                this.diffRenderer.renderDiff(
                    response.result.original,
                    response.result.modified,
                    diffContainer
                );
            }
        }
        if (actionsSection) actionsSection.style.display = 'flex';
    }

    /**
     * Show error message
     */
    public showError(error: Error): void {
        this.setState('error' as QuickEditState);

        if (!this.element) return;

        const loadingIndicator = this.element.querySelector('#qe-loading') as HTMLElement;
        const errorContainer = this.element.querySelector('#qe-error') as HTMLElement;
        const sendBtn = this.element.querySelector('#qe-send-btn') as HTMLButtonElement;

        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (sendBtn) sendBtn.disabled = false;
        if (errorContainer) {
            errorContainer.textContent = error.message;
            errorContainer.style.display = 'block';
        }
    }

    /**
     * Set callbacks
     */
    public setCallbacks(callbacks: {
        onSend?: (request: QuickEditRequest) => void;
        onApply?: (response: QuickEditResponse) => void;
        onReject?: () => void;
        onRetry?: (request: QuickEditRequest) => void;
        onStateChange?: StateChangeCallback;
    }): void {
        this.onSendCallback = callbacks.onSend;
        this.onApplyCallback = callbacks.onApply;
        this.onRejectCallback = callbacks.onReject;
        this.onRetryCallback = callbacks.onRetry;
        this.onStateChangeCallback = callbacks.onStateChange;
    }

    /**
     * Create dialog element
     */
    private createDialog(selectedText?: string): HTMLElement {
        const dialog = document.createElement('div');
        dialog.className = 'quick-edit-dialog';

        // Get instruction options HTML
        const instructionOptions = this.settings.customInstructions
            .map((inst, idx) => `<option value="${idx}">${inst.text}</option>`)
            .join('');

        dialog.innerHTML = `
            <div class="quick-edit-dialog__header">
                <span class="quick-edit-dialog__title">快速编辑</span>
                <button class="b3-button b3-button--outline fn__size200" id="qe-close-btn" title="关闭 (Esc)">
                    <svg><use xlink:href="#iconClose"></use></svg>
                </button>
            </div>

            <div class="quick-edit-dialog__body">
                <!-- Input Section -->
                <div id="qe-input-section" class="qe-section">
                    <!-- Instruction Selection -->
                    <div class="qe-field">
                        <label class="qe-label">编辑指令</label>
                        <div class="qe-instruction-row">
                            <select class="b3-select" id="qe-instruction-select">
                                <option value="custom">自定义指令</option>
                                ${instructionOptions}
                            </select>
                            <input
                                type="text"
                                class="b3-text-field"
                                id="qe-custom-instruction"
                                placeholder="输入自定义指令..."
                                value="${this.settings.quickEditDefaultInstruction}"
                            />
                        </div>
                    </div>

                    <!-- Context Toggle -->
                    <div class="qe-field">
                        <label class="qe-checkbox">
                            <input
                                type="checkbox"
                                id="qe-context-toggle"
                                ${this.settings.quickEditShowContextByDefault ? 'checked' : ''}
                            />
                            <span>包含上下文</span>
                        </label>
                    </div>

                    <!-- Text Input -->
                    <div class="qe-field">
                        <label class="qe-label">待编辑文本</label>
                        <textarea
                            class="b3-text-field qe-textarea"
                            id="qe-text-input"
                            placeholder="输入或粘贴要编辑的文本..."
                            rows="8"
                        >${selectedText || ''}</textarea>
                    </div>

                    <!-- Error Display -->
                    <div id="qe-error" class="qe-error" style="display: none;"></div>

                    <!-- Loading Indicator -->
                    <div id="qe-loading" class="qe-loading" style="display: none;">
                        <div class="qe-loading__spinner"></div>
                        <span>AI 处理中...</span>
                    </div>

                    <!-- Send Button -->
                    <div class="qe-field">
                        <button class="b3-button b3-button--text" id="qe-send-btn">
                            <svg><use xlink:href="#iconSend"></use></svg> 发送 (Enter)
                        </button>
                    </div>
                </div>

                <!-- Diff Section (initially hidden) -->
                <div id="qe-diff-section" class="qe-section" style="display: none;">
                    <div class="qe-field">
                        <label class="qe-label">修改对比</label>
                        <div id="qe-diff-container" class="qe-diff-container"></div>
                    </div>
                </div>

                <!-- Action Buttons (initially hidden) -->
                <div id="qe-actions-section" class="qe-actions" style="display: none;">
                    <button class="b3-button b3-button--outline" id="qe-reject-btn">
                        <svg><use xlink:href="#iconClose"></use></svg> 拒绝
                    </button>
                    <button class="b3-button b3-button--outline" id="qe-retry-btn">
                        <svg><use xlink:href="#iconRefresh"></use></svg> 重新生成
                    </button>
                    <button class="b3-button b3-button--text" id="qe-apply-btn">
                        <svg><use xlink:href="#iconCheck"></use></svg> 应用
                    </button>
                </div>

                ${this.settings.quickEditShowKeyboardHints ? `
                <div class="qe-keyboard-hints">
                    <span>Enter: 发送</span>
                    <span>Esc: 关闭</span>
                </div>
                ` : ''}
            </div>
        `;

        this.bindDialogEvents(dialog);

        return dialog;
    }

    /**
     * Bind event listeners to dialog
     */
    private bindDialogEvents(dialog: HTMLElement): void {
        // Close button
        const closeBtn = dialog.querySelector('#qe-close-btn') as HTMLButtonElement;
        closeBtn?.addEventListener('click', () => this.close());

        // Instruction select change
        const instructionSelect = dialog.querySelector('#qe-instruction-select') as HTMLSelectElement;
        const customInstructionInput = dialog.querySelector('#qe-custom-instruction') as HTMLInputElement;

        instructionSelect?.addEventListener('change', (e) => {
            const value = (e.target as HTMLSelectElement).value;
            if (value === 'custom') {
                customInstructionInput.disabled = false;
                customInstructionInput.value = this.settings.quickEditDefaultInstruction;
                customInstructionInput.focus();
            } else {
                const idx = parseInt(value);
                customInstructionInput.disabled = true;
                customInstructionInput.value = this.settings.customInstructions[idx]?.text || '';
            }
        });

        // Send button
        const sendBtn = dialog.querySelector('#qe-send-btn') as HTMLButtonElement;
        sendBtn?.addEventListener('click', () => this.handleSend());

        // Apply button
        const applyBtn = dialog.querySelector('#qe-apply-btn') as HTMLButtonElement;
        applyBtn?.addEventListener('click', () => this.handleApply());

        // Reject button
        const rejectBtn = dialog.querySelector('#qe-reject-btn') as HTMLButtonElement;
        rejectBtn?.addEventListener('click', () => this.handleReject());

        // Retry button
        const retryBtn = dialog.querySelector('#qe-retry-btn') as HTMLButtonElement;
        retryBtn?.addEventListener('click', () => this.handleRetry());

        // Keyboard shortcuts
        dialog.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.close();
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                if (this.state === 'editing') {
                    this.handleSend();
                }
            }
        });

        // Click outside to close
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                this.close();
            }
        });
    }

    /**
     * Handle send action
     */
    private handleSend(): void {
        if (!this.element) return;

        const textInput = this.element.querySelector('#qe-text-input') as HTMLTextAreaElement;
        const customInstruction = this.element.querySelector('#qe-custom-instruction') as HTMLInputElement;
        const contextToggle = this.element.querySelector('#qe-context-toggle') as HTMLInputElement;
        const errorContainer = this.element.querySelector('#qe-error') as HTMLElement;

        const text = textInput.value.trim();
        const instruction = customInstruction.value.trim();
        const includeContext = contextToggle.checked;

        // Validation
        if (!text) {
            if (errorContainer) {
                errorContainer.textContent = '请输入要编辑的文本';
                errorContainer.style.display = 'block';
            }
            return;
        }

        if (!instruction) {
            if (errorContainer) {
                errorContainer.textContent = '请输入编辑指令';
                errorContainer.style.display = 'block';
            }
            return;
        }

        // Hide error
        if (errorContainer) {
            errorContainer.style.display = 'none';
        }

        // Create request
        this.currentRequest = {
            id: Date.now().toString(),
            text,
            instruction,
            includeContext,
            timestamp: Date.now()
        };

        // Trigger callback
        if (this.onSendCallback) {
            this.onSendCallback(this.currentRequest);
        }
    }

    /**
     * Handle apply action
     */
    private handleApply(): void {
        if (this.currentResponse && this.onApplyCallback) {
            this.onApplyCallback(this.currentResponse);
        }

        if (this.settings.quickEditAutoCloseAfterApply) {
            this.close();
        }
    }

    /**
     * Handle reject action
     */
    private handleReject(): void {
        if (this.onRejectCallback) {
            this.onRejectCallback();
        }
        this.close();
    }

    /**
     * Handle retry action
     */
    private handleRetry(): void {
        if (this.currentRequest && this.onRetryCallback) {
            // Reset to editing state
            this.setState('editing' as QuickEditState);

            if (this.element) {
                const inputSection = this.element.querySelector('#qe-input-section') as HTMLElement;
                const diffSection = this.element.querySelector('#qe-diff-section') as HTMLElement;
                const actionsSection = this.element.querySelector('#qe-actions-section') as HTMLElement;

                if (inputSection) inputSection.style.display = 'block';
                if (diffSection) diffSection.style.display = 'none';
                if (actionsSection) actionsSection.style.display = 'none';
            }

            this.onRetryCallback(this.currentRequest);
        }
    }

    /**
     * Calculate dialog position near cursor
     */
    private calculatePosition(): DialogPosition {
        const selection = window.getSelection();
        let x = window.innerWidth / 2 - (this.settings.quickEditDialogWidth / 2);
        let y = 100;
        let adjusted = false;

        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // Position below selection
            x = rect.left;
            y = rect.bottom + 10;

            // Adjust if outside viewport
            if (x + this.settings.quickEditDialogWidth > window.innerWidth) {
                x = window.innerWidth - this.settings.quickEditDialogWidth - 20;
                adjusted = true;
            }

            if (x < 20) {
                x = 20;
                adjusted = true;
            }

            if (y + this.settings.quickEditDialogMaxHeight > window.innerHeight) {
                y = rect.top - this.settings.quickEditDialogMaxHeight - 10;
                if (y < 20) {
                    y = 20;
                }
                adjusted = true;
            }
        }

        return { x, y, adjusted };
    }

    /**
     * Focus on default input field
     */
    private focusDefaultInput(): void {
        if (!this.element) return;

        const instructionSelect = this.element.querySelector('#qe-instruction-select') as HTMLSelectElement;
        const customInstruction = this.element.querySelector('#qe-custom-instruction') as HTMLInputElement;

        if (instructionSelect?.value === 'custom') {
            customInstruction?.focus();
        }
    }

    /**
     * Set state and trigger callback
     */
    private setState(newState: QuickEditState): void {
        const oldState = this.state;
        this.state = newState;

        if (this.onStateChangeCallback) {
            this.onStateChangeCallback(oldState, newState);
        }
    }

    /**
     * Get current state
     */
    public getState(): QuickEditState {
        return this.state;
    }
}
