/**
 * Manages text selections for AI editing
 */

import {
    TextSelection,
    ITextSelectionManager,
    EditSettings,
    DEFAULT_EDIT_SETTINGS,
    EditEvent,
    EditEventType,
    EditEventCallback
} from './types';

export class TextSelectionManager implements ITextSelectionManager {
    private selections: Map<string, TextSelection> = new Map();
    private settings: EditSettings;
    private eventListeners: Set<EditEventCallback> = new Set();
    private idCounter: number = 0;

    constructor(settings: Partial<EditSettings> = {}) {
        this.settings = { ...DEFAULT_EDIT_SETTINGS, ...settings };
    }

    /**
     * Add a new text selection to the manager
     */
    addSelection(
        blockId: string,
        startLine: number,
        endLine: number,
        selectedText: string,
        instruction?: string
    ): TextSelection {
        const id = this.generateId();

        // Extract context around the selection
        const { contextBefore, contextAfter, fullBlockContent } = this.extractContext(
            blockId,
            { startLine, endLine },
            this.settings
        );

        const selection: TextSelection = {
            id,
            blockId,
            startLine,
            endLine,
            selectedText,
            contextBefore,
            contextAfter,
            timestamp: Date.now(),
            status: 'pending',
            customInstruction: instruction,
            fullBlockContent
        };

        this.selections.set(id, selection);

        // Emit event
        this.emitEvent({
            type: EditEventType.SELECTION_ADDED,
            selection,
            timestamp: Date.now()
        });

        console.log(`[AIEdit] Added selection ${id} from block ${blockId}`);
        return selection;
    }

    /**
     * Get a selection by ID
     */
    getSelection(id: string): TextSelection | undefined {
        return this.selections.get(id);
    }

    /**
     * Get all selections
     */
    getAllSelections(): TextSelection[] {
        return Array.from(this.selections.values())
            .sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Get selections by status
     */
    getSelectionsByStatus(status: TextSelection['status']): TextSelection[] {
        return this.getAllSelections().filter(s => s.status === status);
    }

    /**
     * Update selection status
     */
    updateStatus(id: string, status: TextSelection['status'], errorMessage?: string): void {
        const selection = this.selections.get(id);
        if (selection) {
            selection.status = status;
            if (errorMessage) {
                selection.errorMessage = errorMessage;
            }

            // Emit appropriate event
            const eventType = status === 'error'
                ? EditEventType.EDIT_ERROR
                : status === 'completed'
                ? EditEventType.EDIT_COMPLETED
                : EditEventType.EDIT_STARTED;

            this.emitEvent({
                type: eventType,
                selection,
                timestamp: Date.now()
            });

            console.log(`[AIEdit] Updated selection ${id} status to ${status}`);
        }
    }

    /**
     * Update selection with edit result
     */
    updateEditResult(id: string, editResult: any): void {
        const selection = this.selections.get(id);
        if (selection) {
            selection.editResult = editResult;
            selection.status = 'completed';

            this.emitEvent({
                type: EditEventType.EDIT_COMPLETED,
                selection,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Remove a selection
     */
    removeSelection(id: string): boolean {
        const selection = this.selections.get(id);
        if (selection) {
            this.selections.delete(id);
            console.log(`[AIEdit] Removed selection ${id}`);
            return true;
        }
        return false;
    }

    /**
     * Clear all selections
     */
    clearAll(): void {
        const count = this.selections.size;
        this.selections.clear();

        this.emitEvent({
            type: EditEventType.QUEUE_CLEARED,
            timestamp: Date.now()
        });

        console.log(`[AIEdit] Cleared all ${count} selections`);
    }

    /**
     * Clear completed selections
     */
    clearCompleted(): number {
        const completed = this.getSelectionsByStatus('completed');
        let removed = 0;

        for (const selection of completed) {
            if (this.removeSelection(selection.id)) {
                removed++;
            }
        }

        console.log(`[AIEdit] Cleared ${removed} completed selections`);
        return removed;
    }

    /**
     * Extract context around a selection with smart context extraction
     */
    extractContext(
        blockId: string,
        lineRange: { startLine: number; endLine: number },
        settings: EditSettings
    ): { contextBefore: string; contextAfter: string; fullBlockContent: string } {
        try {
            // Get block content from SiYuan
            const blockContent = this.getBlockContent(blockId);
            if (!blockContent) {
                return {
                    contextBefore: '',
                    contextAfter: '',
                    fullBlockContent: ''
                };
            }

            const lines = blockContent.split('\n');
            const totalLines = lines.length;

            // Smart context extraction
            let contextStartLine = Math.max(0, lineRange.startLine - settings.contextLinesBefore);
            let contextEndLine = Math.min(totalLines - 1, lineRange.endLine + settings.contextLinesAfter);

            if (settings.smartContextExtraction) {
                // Extend context to include complete sentences/paragraphs
                contextStartLine = this.findSentenceStart(lines, contextStartLine);
                contextEndLine = this.findSentenceEnd(lines, contextEndLine);
            }

            // Extract context
            const contextBefore = lines
                .slice(contextStartLine, lineRange.startLine)
                .join('\n')
                .trim();

            const contextAfter = lines
                .slice(lineRange.endLine + 1, contextEndLine + 1)
                .join('\n')
                .trim();

            return {
                contextBefore,
                contextAfter,
                fullBlockContent: blockContent
            };

        } catch (error) {
            console.error(`[AIEdit] Error extracting context for block ${blockId}:`, error);
            return {
                contextBefore: '',
                contextAfter: '',
                fullBlockContent: ''
            };
        }
    }

    /**
     * Get block content from SiYuan
     */
    private getBlockContent(blockId: string): string {
        try {
            // Try to get block element
            const blockElement = document.querySelector(`[data-node-id="${blockId}"]`);
            if (blockElement) {
                // Get the content element within the block
                const contentElement = blockElement.querySelector('.protyle-wysiwyg__embed, .p, .h1, .h2, .h3, .h4, .h5, .h6, [contenteditable="true"]');
                if (contentElement) {
                    return contentElement.textContent || '';
                }
                return blockElement.textContent || '';
            }

            // Fallback: try to get from protyle if available
            const protyle = (window as any).siyuan?.protyle;
            if (protyle?.model?.editor?.protyle?.block?.id === blockId) {
                return protyle.model.editor.protyle.wysiwyg.element.textContent || '';
            }

            console.warn(`[AIEdit] Could not find block content for ${blockId}`);
            return '';
        } catch (error) {
            console.error(`[AIEdit] Error getting block content:`, error);
            return '';
        }
    }

    /**
     * Find the start of a sentence/paragraph
     */
    private findSentenceStart(lines: string[], lineIndex: number): number {
        // Look backwards for an empty line or start of document
        for (let i = lineIndex; i >= 0; i--) {
            if (lines[i].trim() === '' || i === 0) {
                return i === 0 ? 0 : i + 1;
            }
            // Check for sentence endings
            if (lines[i].match(/[.!?。！？]\s*$/)) {
                return Math.min(i + 1, lineIndex);
            }
        }
        return lineIndex;
    }

    /**
     * Find the end of a sentence/paragraph
     */
    private findSentenceEnd(lines: string[], lineIndex: number): number {
        // Look forward for an empty line or end of document
        for (let i = lineIndex; i < lines.length; i++) {
            if (lines[i].trim() === '' || i === lines.length - 1) {
                return i === lines.length - 1 ? i : i - 1;
            }
            // Check for sentence endings
            if (lines[i].match(/[.!?。！？]\s*$/)) {
                return i;
            }
        }
        return lineIndex;
    }

    /**
     * Generate unique ID
     */
    private generateId(): string {
        return `edit_${Date.now()}_${++this.idCounter}`;
    }

    /**
     * Add event listener
     */
    addEventListener(callback: EditEventCallback): void {
        this.eventListeners.add(callback);
    }

    /**
     * Remove event listener
     */
    removeEventListener(callback: EditEventCallback): void {
        this.eventListeners.delete(callback);
    }

    /**
     * Emit event to all listeners
     */
    private emitEvent(event: EditEvent): void {
        this.eventListeners.forEach(callback => {
            try {
                callback(event);
            } catch (error) {
                console.error('[AIEdit] Error in event listener:', error);
            }
        });
    }

    /**
     * Update settings
     */
    updateSettings(settings: Partial<EditSettings>): void {
        this.settings = { ...this.settings, ...settings };
        console.log('[AIEdit] Settings updated:', this.settings);
    }

    /**
     * Get current settings
     */
    getSettings(): EditSettings {
        return { ...this.settings };
    }

    /**
     * Get statistics
     */
    getStatistics(): {
        total: number;
        pending: number;
        processing: number;
        completed: number;
        error: number;
        cancelled: number;
    } {
        const selections = this.getAllSelections();
        return {
            total: selections.length,
            pending: selections.filter(s => s.status === 'pending').length,
            processing: selections.filter(s => s.status === 'processing').length,
            completed: selections.filter(s => s.status === 'completed').length,
            error: selections.filter(s => s.status === 'error').length,
            cancelled: selections.filter(s => s.status === 'cancelled').length
        };
    }
}