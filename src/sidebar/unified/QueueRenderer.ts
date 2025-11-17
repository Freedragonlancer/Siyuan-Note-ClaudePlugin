/**
 * Queue Renderer - Edit queue UI rendering and management for UnifiedAIPanel
 *
 * Handles queue UI updates, item rendering, state persistence, and controls.
 * Extracted as part of architectural refactoring (Task 2.1 Phase 7).
 *
 * @module QueueRenderer
 * @see UnifiedAIPanel
 */

import type { TextSelection } from "../../editor/types";
import type { TextSelectionManager } from "../../editor/TextSelectionManager";
import type { EditQueue } from "../../editor/EditQueue";
import { SecurityUtils } from "../../utils/Security";
import { UnifiedPanelHelpers } from "./UnifiedPanelHelpers";

export interface QueueRendererContext {
    element: HTMLElement;
    textSelectionManager: TextSelectionManager;
    editQueue: EditQueue;
    queueState: {
        expanded: boolean;
        queueSize: number;
        processingCount: number;
    };
}

/**
 * Utility class for rendering and managing edit queue UI
 */
export class QueueRenderer {
    /**
     * Refresh the entire queue UI
     */
    static refreshQueueUI(context: QueueRendererContext): void {
        const queueDetails = context.element.querySelector("#claude-queue-details") as HTMLElement;
        const queueCountSpan = context.element.querySelector("#queue-count");
        const queueStatsSpan = context.element.querySelector("#queue-stats");

        if (!queueDetails) return;

        const selections = context.textSelectionManager.getAllSelections();
        const queueStats = context.editQueue.getStatistics();

        // Update count
        if (queueCountSpan) {
            queueCountSpan.textContent = `编辑队列 (${selections.length})`;
        }

        // Update stats
        if (queueStatsSpan) {
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
                        // (Could be enhanced with actual scrolling implementation)
                    }
                });
            });
        }

        // Show/hide queue controls
        const pauseBtn = context.element.querySelector("#queue-pause-btn") as HTMLElement;
        const clearBtn = context.element.querySelector("#queue-clear-btn") as HTMLElement;

        if (pauseBtn && clearBtn) {
            const hasItems = selections.length > 0;
            pauseBtn.style.display = hasItems ? "block" : "none";
            clearBtn.style.display = hasItems ? "block" : "none";
        }

        // Update pause button icon
        this.updatePauseButtonIcon(context);

        // Update state
        context.queueState.queueSize = selections.length;
        context.queueState.processingCount = queueStats.processing;
    }

    /**
     * Create HTML for a single queue item
     */
    static createQueueItem(selection: TextSelection): string {
        const statusIcon = UnifiedPanelHelpers.getQueueItemStatusIcon(selection.status);
        const lineInfo = `第 ${selection.startLine + 1}-${selection.endLine + 1} 行`;
        const preview = UnifiedPanelHelpers.truncate(selection.selectedText, 40);

        return `
            <div class="b3-list-item" data-selection-id="${selection.id}" style="padding: 6px; margin-bottom: 2px; cursor: pointer; font-size: 12px;">
                <div class="fn__flex" style="align-items: center; gap: 6px;">
                    <span>${statusIcon}</span>
                    <div class="fn__flex-column" style="flex: 1;">
                        <span class="ft__smaller">${lineInfo}</span>
                        <span class="ft__smaller ft__secondary">${SecurityUtils.escapeHtml(preview)}</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Toggle queue expansion state
     */
    static toggleQueueExpansion(context: QueueRendererContext): void {
        const newState = !context.queueState.expanded;
        this.setQueueExpanded(context, newState);
    }

    /**
     * Set queue expansion state
     */
    static setQueueExpanded(context: QueueRendererContext, expanded: boolean): void {
        context.queueState.expanded = expanded;

        const queueDetails = context.element.querySelector("#claude-queue-details") as HTMLElement;
        const queueToggle = context.element.querySelector("#claude-queue-toggle") as HTMLElement;

        if (queueDetails) {
            queueDetails.style.display = expanded ? "block" : "none";
        }

        if (queueToggle) {
            queueToggle.textContent = expanded ? "▼" : "▶";
        }

        this.saveQueueState(context);
    }

    /**
     * Toggle queue pause/resume
     */
    static toggleQueuePause(context: QueueRendererContext): void {
        if (context.editQueue.isPaused()) {
            context.editQueue.resumeQueue();
        } else {
            context.editQueue.pauseQueue();
        }

        this.updatePauseButtonIcon(context);
        this.refreshQueueUI(context);
    }

    /**
     * Update pause button icon based on queue state
     */
    static updatePauseButtonIcon(context: QueueRendererContext): void {
        const pauseBtn = context.element.querySelector("#queue-pause-btn") as HTMLButtonElement;
        if (!pauseBtn) return;

        if (context.editQueue.isPaused()) {
            pauseBtn.innerHTML = '<svg><use xlink:href="#iconPlay"></use></svg>';
            pauseBtn.title = '恢复队列';
        } else {
            pauseBtn.innerHTML = '<svg><use xlink:href="#iconPause"></use></svg>';
            pauseBtn.title = '暂停队列';
        }
    }

    /**
     * Clear all items from the edit queue
     */
    static clearEditQueue(context: QueueRendererContext): void {
        const confirmed = confirm('确定要清空所有编辑任务吗？');
        if (!confirmed) return;

        context.editQueue.cancelAll();
        context.textSelectionManager.clearAll();

        this.refreshQueueUI(context);
    }

    /**
     * Load queue state from localStorage
     */
    static loadQueueState(context: QueueRendererContext): void {
        try {
            const saved = localStorage.getItem('claude-queue-state');
            if (saved) {
                const state = JSON.parse(saved);
                context.queueState.expanded = state.expanded ?? true;
            }
        } catch (error) {
            console.warn('[QueueRenderer] Failed to load queue state:', error);
        }
    }

    /**
     * Save queue state to localStorage
     */
    static saveQueueState(context: QueueRendererContext): void {
        try {
            localStorage.setItem('claude-queue-state', JSON.stringify({
                expanded: context.queueState.expanded
            }));
        } catch (error) {
            console.warn('[QueueRenderer] Failed to save queue state:', error);
        }
    }
}
