import type { IProtyle } from '../types/siyuan';

/**
 * Helper class for interacting with SiYuan's Protyle editor
 */
export class EditorHelper {
    /**
     * Get the currently selected text in the active editor
     */
    static getSelectedText(protyle?: IProtyle): string {
        try {
            if (protyle?.wysiwyg?.element) {
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    const selectedText = selection.toString().trim();
                    if (selectedText) {
                        return selectedText;
                    }
                }
            }

            // Fallback to general selection
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                return selection.toString().trim();
            }
        } catch (error) {
            console.error("Error getting selected text:", error);
        }

        return "";
    }

    /**
     * Replace the currently selected text with new content
     */
    static replaceSelectedText(newText: string, protyle?: IProtyle): boolean {
        try {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
                return false;
            }

            const range = selection.getRangeAt(0);
            range.deleteContents();

            // Insert new text
            const textNode = document.createTextNode(newText);
            range.insertNode(textNode);

            // Move cursor to end of inserted text
            range.setStartAfter(textNode);
            range.setEndAfter(textNode);
            selection.removeAllRanges();
            selection.addRange(range);

            return true;
        } catch (error) {
            console.error("Error replacing selected text:", error);
            return false;
        }
    }

    /**
     * Insert text at the current cursor position
     */
    static insertTextAtCursor(text: string, protyle?: IProtyle): boolean {
        try {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
                return false;
            }

            const range = selection.getRangeAt(0);
            const textNode = document.createTextNode(text);
            range.insertNode(textNode);

            // Move cursor to end of inserted text
            range.setStartAfter(textNode);
            range.setEndAfter(textNode);
            selection.removeAllRanges();
            selection.addRange(range);

            return true;
        } catch (error) {
            console.error("Error inserting text at cursor:", error);
            return false;
        }
    }

    /**
     * Get the entire content of the current document
     */
    static getDocumentContent(protyle?: IProtyle): string {
        try {
            if (protyle?.wysiwyg?.element) {
                return protyle.wysiwyg.element.textContent || "";
            }

            // Fallback: try to find the editor element
            const editorElement = document.querySelector(".protyle-wysiwyg");
            if (editorElement) {
                return editorElement.textContent || "";
            }
        } catch (error) {
            console.error("Error getting document content:", error);
        }

        return "";
    }

    /**
     * Check if there's any text selected
     */
    static hasSelection(): boolean {
        const selection = window.getSelection();
        return !!(selection && selection.toString().trim().length > 0);
    }

    /**
     * Get the current cursor position info
     */
    static getCursorInfo(): { hasSelection: boolean; selectedText: string } {
        const selection = window.getSelection();
        const selectedText = selection ? selection.toString().trim() : "";

        return {
            hasSelection: selectedText.length > 0,
            selectedText: selectedText,
        };
    }
}
