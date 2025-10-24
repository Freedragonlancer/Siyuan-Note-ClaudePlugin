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
    private plugin?: any;

    constructor(plugin?: any) {
        this.plugin = plugin;
    }

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

            const modifiedText = selection.editResult.modified;

            // Use SiYuan's transaction API for safe block updates
            try {
                // First, get the current block content to understand its structure
                const getResponse = await fetch('/api/block/getBlockKramdown', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        id: selection.blockId
                    })
                });

                const getResult = await getResponse.json();
                if (getResult.code !== 0) {
                    console.warn(`[AIEdit] Failed to get block kramdown:`, getResult);
                    throw new Error(`Failed to get block content: ${getResult.msg || 'Unknown error'}`);
                }

                // Convert modified text to kramdown format
                // For simple text blocks, we can wrap it appropriately
                const kramdown = modifiedText;

                // Update block using proper transaction
                const updateResponse = await fetch('/api/block/updateBlock', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        dataType: 'markdown',
                        data: kramdown,
                        id: selection.blockId
                    })
                });

                const updateResult = await updateResponse.json();

                if (updateResult.code === 0) {
                    // Add to history after successful update
                    if (this.editHistory) {
                        this.editHistory.addToHistory({
                            selection,
                            originalContent: selection.selectedText,
                            modifiedContent: modifiedText,
                            blockId: selection.blockId,
                            applied: true
                        });
                    }

                    console.log(`[AIEdit] Successfully applied changes via kernel API for selection ${selection.id}`);

                    // Wait a bit for SiYuan to process the update
                    await new Promise(resolve => setTimeout(resolve, 100));

                    return true;
                } else {
                    console.warn(`[AIEdit] Kernel API returned error:`, updateResult);
                    throw new Error(`API error: ${updateResult.msg || 'Unknown error'}`);
                }
            } catch (apiError) {
                console.warn(`[AIEdit] Kernel API failed, falling back to DOM:`, apiError);
                return await this.applyChangesViaDom(selection);
            }

        } catch (error) {
            console.error(`[AIEdit] Error applying changes:`, error);
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    /**
     * Fallback method to apply changes via DOM manipulation
     * WARNING: This method is deprecated and may cause issues. Use API method instead.
     */
    private async applyChangesViaDom(selection: TextSelection): Promise<boolean> {
        console.warn('[AIEdit] Using DOM fallback method - this may cause index rebuild issues!');

        if (!selection.editResult) {
            return false;
        }

        // Get the block element
        const blockElement = document.querySelector(`[data-node-id="${selection.blockId}"]`) as HTMLElement;
        if (!blockElement) {
            throw new Error(`Block ${selection.blockId} not found in DOM`);
        }

        try {
            // Use input event to trigger SiYuan's internal update mechanism
            // This is safer than direct text manipulation
            const modifiedText = selection.editResult.modified;

            // Find the protyle instance
            const protyle = (window as any).siyuan?.ws?.app?.plugins?.[0]?.protyle;
            if (!protyle) {
                console.warn('[AIEdit] Could not find protyle instance');
            }

            // Get editable content
            const editableDiv = blockElement.querySelector('[contenteditable="true"]');
            if (!editableDiv) {
                throw new Error(`No editable content found in block ${selection.blockId}`);
            }

            // Store original for history
            const originalContent = editableDiv.textContent || '';

            // Clear and set new content
            editableDiv.textContent = '';
            const textNode = document.createTextNode(modifiedText);
            editableDiv.appendChild(textNode);

            // Create a proper input event
            const event = new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: modifiedText
            });
            editableDiv.dispatchEvent(event);

            // Also trigger change event
            const changeEvent = new Event('change', { bubbles: true });
            editableDiv.dispatchEvent(changeEvent);

            // Add to history
            if (this.editHistory) {
                this.editHistory.addToHistory({
                    selection,
                    originalContent,
                    modifiedContent: modifiedText,
                    blockId: selection.blockId,
                    applied: true
                });
            }

            // Wait for SiYuan to process
            await new Promise(resolve => setTimeout(resolve, 200));

            console.log(`[AIEdit] Applied changes via DOM (fallback) for selection ${selection.id}`);
            console.warn('[AIEdit] Please note: DOM method may cause data consistency issues');

            return true;

        } catch (error) {
            console.error('[AIEdit] DOM fallback failed:', error);
            throw error;
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

            // Use SiYuan API to restore original content
            const response = await fetch('/api/block/updateBlock', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    dataType: 'markdown',
                    data: lastEdit.originalContent,
                    id: lastEdit.blockId
                })
            });

            const result = await response.json();

            if (result.code === 0) {
                // Remove from history
                this.editHistory.removeEntry(lastEdit.id);

                // Wait for SiYuan to process
                await new Promise(resolve => setTimeout(resolve, 100));

                console.log(`[AIEdit] Successfully undone edit ${lastEdit.id}`);
                return true;
            } else {
                console.error(`[AIEdit] Failed to undo via API:`, result);
                // Try DOM fallback
                return await this.undoViaDom(lastEdit);
            }

        } catch (error) {
            console.error(`[AIEdit] Error undoing edit:`, error);
            // Try DOM fallback
            return await this.undoViaDom(lastEdit);
        }
    }

    /**
     * Fallback method to undo via DOM
     */
    private async undoViaDom(lastEdit: any): Promise<boolean> {
        console.warn('[AIEdit] Using DOM fallback for undo');

        try {
            const blockElement = document.querySelector(`[data-node-id="${lastEdit.blockId}"]`);
            if (!blockElement) {
                throw new Error(`Block ${lastEdit.blockId} not found`);
            }

            const contentElement = blockElement.querySelector('[contenteditable="true"]');
            if (!contentElement) {
                throw new Error(`Editable content not found in block ${lastEdit.blockId}`);
            }

            // Restore original content
            contentElement.textContent = lastEdit.originalContent;

            // Trigger proper input event
            const event = new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: lastEdit.originalContent
            });
            contentElement.dispatchEvent(event);

            // Remove from history
            if (this.editHistory) {
                this.editHistory.removeEntry(lastEdit.id);
            }

            await new Promise(resolve => setTimeout(resolve, 200));

            console.log(`[AIEdit] Undone edit ${lastEdit.id} via DOM fallback`);
            return true;

        } catch (error) {
            console.error(`[AIEdit] DOM undo fallback failed:`, error);
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
