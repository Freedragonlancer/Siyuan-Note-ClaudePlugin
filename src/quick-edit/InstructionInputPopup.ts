/**
 * Instruction Input Popup - Lightweight floating input for edit instructions
 */

import type { PopupPosition } from './inline-types';
import type { CustomInstruction } from '@/editor/types';

export class InstructionInputPopup {
    private element: HTMLElement | null = null;
    private customInstructions: CustomInstruction[];
    private onSubmitCallback?: (instruction: string) => void;
    private onCancelCallback?: () => void;

    constructor(customInstructions: CustomInstruction[]) {
        this.customInstructions = customInstructions;
    }

    /**
     * Show popup at position
     */
    public show(position: PopupPosition, defaultInstruction: string = ''): void {
        if (this.element) {
            this.close();
        }

        this.element = this.createPopup(defaultInstruction);
        document.body.appendChild(this.element);

        // Position
        this.element.style.left = `${position.x}px`;
        this.element.style.top = `${position.y}px`;

        // Focus input
        const input = this.element.querySelector('#instruction-input') as HTMLInputElement;
        if (input) {
            input.focus();
            input.select();
        }
    }

    /**
     * Close popup
     */
    public close(): void {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }

    /**
     * Set callbacks
     */
    public setCallbacks(callbacks: {
        onSubmit?: (instruction: string) => void;
        onCancel?: () => void;
    }): void {
        this.onSubmitCallback = callbacks.onSubmit;
        this.onCancelCallback = callbacks.onCancel;
    }

    /**
     * Create popup element
     */
    private createPopup(defaultInstruction: string): HTMLElement {
        const popup = document.createElement('div');
        popup.className = 'instruction-input-popup';

        // FIX 1.4: Escape HTML in instruction options
        const options = this.customInstructions
            .map((inst, idx) => `<option value="${idx}">${this.escapeHtml(inst.text)}</option>`)
            .join('');

        popup.innerHTML = `
            <div class="popup-header">
                <span>编辑指令</span>
                <button class="popup-close" title="取消 (Esc)">
                    <svg><use xlink:href="#iconClose"></use></svg>
                </button>
            </div>
            <div class="popup-body">
                <select class="b3-select" id="instruction-preset">
                    <option value="custom">自定义指令</option>
                    ${options}
                </select>
                <input
                    type="text"
                    class="b3-text-field"
                    id="instruction-input"
                    placeholder="输入编辑指令..."
                    value="${defaultInstruction}"
                />
                <div class="popup-hint">Enter 发送 | Esc 取消</div>
            </div>
        `;

        // Bind events
        const closeBtn = popup.querySelector('.popup-close') as HTMLButtonElement;
        const presetSelect = popup.querySelector('#instruction-preset') as HTMLSelectElement;
        const input = popup.querySelector('#instruction-input') as HTMLInputElement;

        closeBtn?.addEventListener('click', () => this.handleCancel());

        presetSelect?.addEventListener('change', (e) => {
            const value = (e.target as HTMLSelectElement).value;
            if (value !== 'custom') {
                const idx = parseInt(value);
                input.value = this.customInstructions[idx]?.text || '';
            }
        });

        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleSubmit(input.value);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.handleCancel();
            }
        });

        // Click outside to close
        popup.addEventListener('click', (e) => {
            if (e.target === popup) {
                this.handleCancel();
            }
        });

        return popup;
    }

    /**
     * Handle submit
     */
    private handleSubmit(instruction: string): void {
        if (instruction.trim() && this.onSubmitCallback) {
            this.onSubmitCallback(instruction.trim());
        }
        this.close();
    }

    /**
     * Handle cancel
     */
    private handleCancel(): void {
        if (this.onCancelCallback) {
            this.onCancelCallback();
        }
        this.close();
    }

    /**
     * FIX 1.4: Escape HTML for safe rendering
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
