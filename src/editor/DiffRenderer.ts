/**
 * Diff Renderer - Renders diff comparisons and handles apply/reject actions
 */

import type {
    TextSelection,
    DiffPatch,
    IDiffRenderer
} from './types';
import type { EditHistory, HistoryEntry } from './EditHistory';

export class DiffRenderer implements IDiffRenderer {
    private editHistory?: EditHistory;

    /**
     * Set edit history instance for undo functionality
     */
    setEditHistory(history: EditHistory): void {
        this.editHistory = history;
    }
    /**
     * Render diff comparison in a container
     */
    renderDiff(original: string, modified: string, container: HTMLElement): void {
        container.innerHTML = '';
        container.className = 'ai-edit-diff-container';

        // Create header
        const header = document.createElement('div');
        header.className = 'ai-edit-diff-header';
        header.innerHTML = `
            <div class="ai-edit-diff-title">
                <svg class="ai-edit-icon"><use xlink:href="#iconEdit"></use></svg>
                <span>AI 编辑建议</span>
            </div>
        `;
        container.appendChild(header);

        // Create diff view container
        const diffView = document.createElement('div');
        diffView.className = 'ai-edit-diff-view';

        // Create two-column layout
        const originalColumn = document.createElement('div');
        originalColumn.className = 'ai-edit-diff-column ai-edit-diff-original';
        originalColumn.innerHTML = `
            <div class="ai-edit-diff-column-header">原文</div>
            <div class="ai-edit-diff-content">${this.escapeHtml(original)}</div>
        `;

        const modifiedColumn = document.createElement('div');
        modifiedColumn.className = 'ai-edit-diff-column ai-edit-diff-modified';
        modifiedColumn.innerHTML = `
            <div class="ai-edit-diff-column-header">修改建议</div>
            <div class="ai-edit-diff-content">${this.escapeHtml(modified)}</div>
        `;

        diffView.appendChild(originalColumn);
        diffView.appendChild(modifiedColumn);
        container.appendChild(diffView);
    }

    /**
     * Highlight differences in an element using diff patches
     */
    highlightDifferences(element: HTMLElement, patches: DiffPatch[]): void {
        const highlightedHtml = patches.map(patch => {
            const escapedText = this.escapeHtml(patch.value);

            switch (patch.type) {
                case 'delete':
                    return `<span class="ai-edit-diff-delete">${escapedText}</span>`;
                case 'insert':
                    return `<span class="ai-edit-diff-insert">${escapedText}</span>`;
                case 'equal':
                default:
                    return escapedText;
            }
        }).join('');

        element.innerHTML = highlightedHtml;
    }

    /**
     * Apply AI changes to the original block
     */
    async applyChanges(selection: TextSelection): Promise<boolean> {
        if (!selection.editResult) {
            console.error(`[AIEdit] No edit result available for selection ${selection.id}`);
            return false;
        }

        try {
            console.log(`[AIEdit] Applying changes for selection ${selection.id}`);

            // Get the block element
            const blockElement = document.querySelector(`[data-node-id="${selection.blockId}"]`);
            if (!blockElement) {
                throw new Error(`Block ${selection.blockId} not found`);
            }

            // Get the editable content element
            const contentElement = blockElement.querySelector('[contenteditable="true"]');
            if (!contentElement) {
                throw new Error(`Editable content not found in block ${selection.blockId}`);
            }

            // Get current content (for history)
            const originalContent = contentElement.textContent || '';
            const lines = originalContent.split('\n');

            // Replace the selected lines with modified text
            const modifiedLines = selection.editResult.modified.split('\n');

            let newContent: string;
            // Validate line range
            if (selection.startLine < 0 || selection.endLine >= lines.length) {
                console.warn(`[AIEdit] Invalid line range: ${selection.startLine}-${selection.endLine}`);
                // Fallback: replace entire content
                newContent = selection.editResult.modified;
                contentElement.textContent = newContent;
            } else {
                // Replace specific lines
                const newLines = [
                    ...lines.slice(0, selection.startLine),
                    ...modifiedLines,
                    ...lines.slice(selection.endLine + 1)
                ];
                newContent = newLines.join('\n');
                contentElement.textContent = newContent;
            }

            // Add to history before applying
            if (this.editHistory) {
                this.editHistory.addToHistory({
                    selection,
                    originalContent,
                    modifiedContent: newContent,
                    blockId: selection.blockId,
                    applied: true
                });
            }

            // Trigger SiYuan's update mechanism
            const inputEvent = new Event('input', { bubbles: true, cancelable: true });
            contentElement.dispatchEvent(inputEvent);

            console.log(`[AIEdit] Successfully applied changes for selection ${selection.id}`);
            return true;

        } catch (error) {
            console.error(`[AIEdit] Error applying changes:`, error);
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    /**
     * Undo the last applied edit
     */
    async undoLastEdit(): Promise<boolean> {
        if (!this.editHistory) {
            console.error('[AIEdit] Edit history not available');
            return false;
        }

        const lastEdit = this.editHistory.getLastAppliedEdit();
        if (!lastEdit) {
            console.warn('[AIEdit] No edits to undo');
            return false;
        }

        try {
            console.log(`[AIEdit] Undoing edit ${lastEdit.id}`);

            // Get the block element
            const blockElement = document.querySelector(`[data-node-id="${lastEdit.blockId}"]`);
            if (!blockElement) {
                throw new Error(`Block ${lastEdit.blockId} not found`);
            }

            // Get the editable content element
            const contentElement = blockElement.querySelector('[contenteditable="true"]');
            if (!contentElement) {
                throw new Error(`Editable content not found in block ${lastEdit.blockId}`);
            }

            // Restore original content
            contentElement.textContent = lastEdit.originalContent;

            // Trigger SiYuan's update mechanism
            const inputEvent = new Event('input', { bubbles: true, cancelable: true });
            contentElement.dispatchEvent(inputEvent);

            // Remove from history
            this.editHistory.removeEntry(lastEdit.id);

            console.log(`[AIEdit] Successfully undone edit ${lastEdit.id}`);
            return true;

        } catch (error) {
            console.error(`[AIEdit] Error undoing edit:`, error);
            return false;
        }
    }

    /**
     * Reject AI changes (no-op, just for logging)
     */
    rejectChanges(selection: TextSelection): void {
        console.log(`[AIEdit] Rejected changes for selection ${selection.id}`);
        // Nothing to do - original text remains unchanged
    }

    /**
     * Create a diff view element that can be inserted into the DOM
     */
    createDiffView(selection: TextSelection): HTMLElement | null {
        if (!selection.editResult) {
            return null;
        }

        const container = document.createElement('div');
        this.renderDiff(
            selection.editResult.original,
            selection.editResult.modified,
            container
        );

        return container;
    }

    /**
     * Create inline diff view with highlighted changes
     */
    createInlineDiffView(patches: DiffPatch[]): HTMLElement {
        const container = document.createElement('div');
        container.className = 'ai-edit-inline-diff';

        const content = document.createElement('div');
        content.className = 'ai-edit-inline-diff-content';
        this.highlightDifferences(content, patches);

        container.appendChild(content);
        return container;
    }

    /**
     * Escape HTML to prevent XSS
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Generate statistics about the diff
     */
    getDiffStats(patches: DiffPatch[]): {
        additions: number;
        deletions: number;
        unchanged: number;
    } {
        let additions = 0;
        let deletions = 0;
        let unchanged = 0;

        for (const patch of patches) {
            const length = patch.value.length;
            switch (patch.type) {
                case 'insert':
                    additions += length;
                    break;
                case 'delete':
                    deletions += length;
                    break;
                case 'equal':
                    unchanged += length;
                    break;
            }
        }

        return { additions, deletions, unchanged };
    }

    /**
     * Check if there are actual changes (not just equal patches)
     */
    hasChanges(patches: DiffPatch[]): boolean {
        return patches.some(patch => patch.type !== 'equal');
    }
}
