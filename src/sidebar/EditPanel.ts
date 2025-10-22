/**
 * Edit Panel - UI for managing AI text editing queue
 */

import type {
    TextSelection,
    EditEvent,
    EditSettings
} from "../editor/types";
import { TextSelectionManager } from "../editor/TextSelectionManager";
import { DiffRenderer } from "../editor/DiffRenderer";
import { EditQueue } from "../editor/EditQueue";

export class EditPanel {
    private element: HTMLElement;
    private manager: TextSelectionManager;
    private queue: EditQueue;
    private renderer: DiffRenderer;
    private selectedId: string | null = null;

    constructor(
        manager: TextSelectionManager,
        queue: EditQueue,
        renderer: DiffRenderer
    ) {
        this.manager = manager;
        this.queue = queue;
        this.renderer = renderer;

        this.element = this.createPanel();
        this.bindEvents();

        // Listen to edit events
        this.manager.addEventListener((event) => this.handleEditEvent(event));
    }

    /**
     * Create the main panel element
     */
    private createPanel(): HTMLElement {
        const container = document.createElement("div");
        container.className = "claude-edit-panel fn__flex-column";
        container.style.cssText = "height: 100%; display: flex; flex-direction: column;";

        container.innerHTML = `
            <div class="claude-edit-header" style="padding: 8px; border-bottom: 1px solid var(--b3-border-color); flex-shrink: 0;">
                <div class="fn__flex" style="align-items: center; justify-content: space-between;">
                    <span style="font-weight: 500;">AI 文本编辑队列</span>
                    <div class="fn__flex" style="gap: 4px;">
                        <button class="b3-button b3-button--outline fn__size200" id="edit-pause-btn" title="暂停队列">
                            <svg><use xlink:href="#iconPause"></use></svg>
                        </button>
                        <button class="b3-button b3-button--outline fn__size200" id="edit-clear-btn" title="清空队列">
                            <svg><use xlink:href="#iconTrashcan"></use></svg>
                        </button>
                    </div>
                </div>
                <div class="ft__smaller ft__secondary" id="edit-queue-stats" style="margin-top: 4px;">
                    队列：0 | 处理中：0
                </div>
            </div>

            <div class="claude-edit-list" id="edit-list" style="flex: 1; overflow-y: auto; padding: 8px;">
                <div class="ft__secondary" style="text-align: center; padding: 20px;">
                    选择文本并右键发送到 AI 编辑
                </div>
            </div>

            <div class="claude-edit-diff" id="edit-diff-container" style="flex-shrink: 0; max-height: 50%; overflow-y: auto; padding: 8px; border-top: 1px solid var(--b3-border-color); display: none;">
                <!-- Diff view will be inserted here -->
            </div>

            <div class="claude-edit-actions" id="edit-actions" style="flex-shrink: 0; padding: 8px; border-top: 1px solid var(--b3-border-color); display: none;">
                <div class="fn__flex" style="gap: 8px; justify-content: flex-end;">
                    <button class="b3-button b3-button--outline" id="edit-reject-btn">
                        <svg><use xlink:href="#iconClose"></use></svg> 拒绝
                    </button>
                    <button class="b3-button b3-button--outline" id="edit-regenerate-btn">
                        <svg><use xlink:href="#iconRefresh"></use></svg> 重新生成
                    </button>
                    <button class="b3-button b3-button--text" id="edit-apply-btn">
                        <svg><use xlink:href="#iconCheck"></use></svg> 应用修改
                    </button>
                </div>
            </div>
        `;

        return container;
    }

    /**
     * Bind event listeners
     */
    private bindEvents(): void {
        // Pause/Resume button
        const pauseBtn = this.element.querySelector('#edit-pause-btn') as HTMLButtonElement;
        pauseBtn?.addEventListener('click', () => this.togglePause());

        // Clear button
        const clearBtn = this.element.querySelector('#edit-clear-btn') as HTMLButtonElement;
        clearBtn?.addEventListener('click', () => this.clearAll());

        // Apply button
        const applyBtn = this.element.querySelector('#edit-apply-btn') as HTMLButtonElement;
        applyBtn?.addEventListener('click', () => this.applyCurrentEdit());

        // Reject button
        const rejectBtn = this.element.querySelector('#edit-reject-btn') as HTMLButtonElement;
        rejectBtn?.addEventListener('click', () => this.rejectCurrentEdit());

        // Regenerate button
        const regenerateBtn = this.element.querySelector('#edit-regenerate-btn') as HTMLButtonElement;
        regenerateBtn?.addEventListener('click', () => this.regenerateCurrentEdit());
    }

    /**
     * Handle edit events from manager
     */
    private handleEditEvent(event: EditEvent): void {
        console.log(`[EditPanel] Received event: ${event.type}`);

        switch (event.type) {
            case 'selection_added' as any:
            case 'edit_started' as any:
            case 'edit_completed' as any:
            case 'edit_error' as any:
                this.refreshList();
                this.updateStats();
                break;

            case 'queue_paused' as any:
            case 'queue_resumed' as any:
            case 'queue_cleared' as any:
                this.updateStats();
                break;
        }
    }

    /**
     * Refresh the list of selections
     */
    private refreshList(): void {
        const listContainer = this.element.querySelector('#edit-list') as HTMLElement;
        if (!listContainer) return;

        const selections = this.manager.getAllSelections();

        if (selections.length === 0) {
            listContainer.innerHTML = `
                <div class="ft__secondary" style="text-align: center; padding: 20px;">
                    选择文本并右键发送到 AI 编辑
                </div>
            `;
            return;
        }

        listContainer.innerHTML = selections.map(selection =>
            this.createSelectionItem(selection)
        ).join('');

        // Bind click events
        selections.forEach(selection => {
            const item = listContainer.querySelector(`[data-selection-id="${selection.id}"]`);
            item?.addEventListener('click', () => this.selectItem(selection.id));
        });
    }

    /**
     * Create HTML for a single selection item
     */
    private createSelectionItem(selection: TextSelection): string {
        const statusIcon = this.getStatusIcon(selection.status);
        const statusClass = `edit-status-${selection.status}`;
        const lineInfo = `第 ${selection.startLine + 1}-${selection.endLine + 1} 行`;
        const preview = this.truncate(selection.selectedText, 50);

        return `
            <div class="b3-list-item ${statusClass}" data-selection-id="${selection.id}" style="padding: 8px; margin-bottom: 4px; cursor: pointer; border-left: 3px solid var(--b3-theme-primary);">
                <div class="fn__flex" style="align-items: center; gap: 8px;">
                    <span>${statusIcon}</span>
                    <div class="fn__flex-column" style="flex: 1;">
                        <div class="fn__flex" style="justify-content: space-between;">
                            <span class="ft__smaller">${lineInfo}</span>
                            <span class="ft__smaller ft__secondary">${this.formatTimestamp(selection.timestamp)}</span>
                        </div>
                        <div class="ft__smaller ft__secondary" style="margin-top: 2px;">${this.escapeHtml(preview)}</div>
                        ${selection.errorMessage ? `<div class="ft__error" style="margin-top: 2px;">${this.escapeHtml(selection.errorMessage)}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Get status icon
     */
    private getStatusIcon(status: TextSelection['status']): string {
        switch (status) {
            case 'pending':
                return '⏸';
            case 'processing':
                return '<span class="fn__loading">⏳</span>';
            case 'completed':
                return '✓';
            case 'error':
                return '❌';
            case 'cancelled':
                return '⊘';
            default:
                return '?';
        }
    }

    /**
     * Select an item and show diff
     */
    private selectItem(id: string): void {
        this.selectedId = id;
        const selection = this.manager.getSelection(id);

        if (!selection) {
            console.warn(`[EditPanel] Selection ${id} not found`);
            return;
        }

        // Show diff if completed
        if (selection.status === 'completed' && selection.editResult) {
            this.showDiff(selection);
        }
    }

    /**
     * Show diff view for a selection
     */
    private showDiff(selection: TextSelection): void {
        if (!selection.editResult) return;

        const diffContainer = this.element.querySelector('#edit-diff-container') as HTMLElement;
        const actionsContainer = this.element.querySelector('#edit-actions') as HTMLElement;

        if (!diffContainer || !actionsContainer) return;

        // Clear container
        diffContainer.innerHTML = '';

        // Render diff with highlighting
        this.renderer.renderDiff(
            selection.editResult.original,
            selection.editResult.modified,
            diffContainer
        );

        // Also add inline highlighted diff
        const inlineDiff = this.renderer.createInlineDiffView(selection.editResult.diff);
        diffContainer.appendChild(inlineDiff);

        // Show containers
        diffContainer.style.display = 'block';
        actionsContainer.style.display = 'block';
    }

    /**
     * Hide diff view
     */
    private hideDiff(): void {
        const diffContainer = this.element.querySelector('#edit-diff-container') as HTMLElement;
        const actionsContainer = this.element.querySelector('#edit-actions') as HTMLElement;

        if (diffContainer) diffContainer.style.display = 'none';
        if (actionsContainer) actionsContainer.style.display = 'none';

        this.selectedId = null;
    }

    /**
     * Apply current edit
     */
    private async applyCurrentEdit(): Promise<void> {
        if (!this.selectedId) return;

        const selection = this.manager.getSelection(this.selectedId);
        if (!selection || !selection.editResult) return;

        try {
            await this.renderer.applyChanges(selection);
            console.log(`[EditPanel] Applied changes for selection ${this.selectedId}`);

            // Remove from list and hide diff
            this.manager.removeSelection(this.selectedId);
            this.hideDiff();
            this.refreshList();
            this.updateStats();

            // Show success message
            (window as any).siyuan?.showMessage?.('✅ 已应用 AI 修改');

        } catch (error) {
            console.error('[EditPanel] Error applying changes:', error);
            (window as any).siyuan?.showMessage?.('❌ 应用修改失败', 3000, 'error');
        }
    }

    /**
     * Reject current edit
     */
    private rejectCurrentEdit(): void {
        if (!this.selectedId) return;

        const selection = this.manager.getSelection(this.selectedId);
        if (!selection) return;

        this.renderer.rejectChanges(selection);

        // Remove from list and hide diff
        this.manager.removeSelection(this.selectedId);
        this.hideDiff();
        this.refreshList();
        this.updateStats();

        console.log(`[EditPanel] Rejected changes for selection ${this.selectedId}`);
    }

    /**
     * Regenerate current edit
     */
    private async regenerateCurrentEdit(): Promise<void> {
        if (!this.selectedId) return;

        const selection = this.manager.getSelection(this.selectedId);
        if (!selection) return;

        // Re-queue the selection
        selection.status = 'pending';
        selection.editResult = undefined;
        selection.errorMessage = undefined;

        this.hideDiff();
        this.queue.enqueue(selection);

        console.log(`[EditPanel] Regenerating selection ${this.selectedId}`);
    }

    /**
     * Toggle pause/resume queue
     */
    private togglePause(): void {
        if (this.queue.isPaused()) {
            this.queue.resumeQueue();
        } else {
            this.queue.pauseQueue();
        }

        this.updatePauseButton();
        this.updateStats();
    }

    /**
     * Update pause button state
     */
    private updatePauseButton(): void {
        const pauseBtn = this.element.querySelector('#edit-pause-btn') as HTMLButtonElement;
        if (!pauseBtn) return;

        if (this.queue.isPaused()) {
            pauseBtn.innerHTML = '<svg><use xlink:href="#iconPlay"></use></svg>';
            pauseBtn.title = '恢复队列';
        } else {
            pauseBtn.innerHTML = '<svg><use xlink:href="#iconPause"></use></svg>';
            pauseBtn.title = '暂停队列';
        }
    }

    /**
     * Clear all selections
     */
    private clearAll(): void {
        const confirmed = confirm('确定要清空所有编辑任务吗？');
        if (!confirmed) return;

        this.queue.cancelAll();
        this.manager.clearAll();
        this.hideDiff();
        this.refreshList();
        this.updateStats();

        console.log('[EditPanel] Cleared all selections');
    }

    /**
     * Update statistics display
     */
    private updateStats(): void {
        const statsElement = this.element.querySelector('#edit-queue-stats') as HTMLElement;
        if (!statsElement) return;

        const queueStats = this.queue.getStatistics();
        const managerStats = this.manager.getStatistics();

        statsElement.textContent = `队列：${queueStats.queued} | 处理中：${queueStats.processing} | 已完成：${managerStats.completed} | 错误：${managerStats.error}`;

        if (queueStats.isPaused) {
            statsElement.textContent += ' (已暂停)';
        }
    }

    /**
     * Utility: Truncate text
     */
    private truncate(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    /**
     * Utility: Format timestamp
     */
    private formatTimestamp(timestamp: number): string {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();

        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;

        return date.toLocaleString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Utility: Escape HTML
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Get the panel element
     */
    getElement(): HTMLElement {
        return this.element;
    }

    /**
     * Destroy the panel
     */
    destroy(): void {
        console.log('[EditPanel] Destroying panel');
        // Cleanup if needed
    }
}
