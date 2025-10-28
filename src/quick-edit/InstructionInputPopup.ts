/**
 * Instruction Input Popup - Lightweight floating input for edit instructions
 */

import type { PopupPosition } from './inline-types';
import type { PromptTemplate } from '@/settings/config-types';
import type { ConfigManager } from '@/settings/ConfigManager';

export class InstructionInputPopup {
    private element: HTMLElement | null = null;
    private presets: PromptTemplate[];
    private configManager: ConfigManager;
    private onSubmitCallback?: (instruction: string) => void;
    private onCancelCallback?: () => void;
    private onPresetSwitchCallback?: (presetId: string) => void;

    // localStorage key for remembering last selected preset
    private static readonly LAST_PRESET_KEY = 'claude-quick-edit-last-preset-index';

    constructor(presets: PromptTemplate[], configManager: ConfigManager) {
        this.presets = presets;
        this.configManager = configManager;
    }

    /**
     * Show popup at position
     */
    public show(position: PopupPosition, defaultInstruction: string = ''): void {
        if (this.element) {
            this.close();
        }

        // Try to load last selected preset (now stored as ID, not index)
        const lastPresetId = this.getLastPresetIndex(); // method name kept for compatibility
        let instructionToUse = defaultInstruction;
        let presetIdToUse = 'custom';

        // If there's a last selected preset and it's still valid
        if (lastPresetId && lastPresetId !== 'custom') {
            const preset = this.presets.find(p => p.id === lastPresetId);
            if (preset && preset.editInstruction) {
                instructionToUse = preset.editInstruction;
                presetIdToUse = lastPresetId;
                console.log(`[InstructionInputPopup] Using last selected preset ${preset.name}: ${instructionToUse.substring(0, 30)}...`);
            } else {
                console.warn(`[InstructionInputPopup] Last preset ID ${lastPresetId} not found or has no editInstruction`);
            }
        }

        this.element = this.createPopup(instructionToUse, presetIdToUse);
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
        onPresetSwitch?: (presetId: string) => void;
    }): void {
        this.onSubmitCallback = callbacks.onSubmit;
        this.onCancelCallback = callbacks.onCancel;
        this.onPresetSwitchCallback = callbacks.onPresetSwitch;
    }

    /**
     * Check if preset is currently active
     */
    private isActivePreset(preset: PromptTemplate): boolean {
        const currentSettings = this.configManager.getActiveProfile().settings;
        return preset.systemPrompt === currentSettings.systemPrompt &&
               preset.appendedPrompt === currentSettings.appendedPrompt;
    }

    /**
     * Create popup element
     */
    private createPopup(defaultInstruction: string, presetId: string = 'custom'): HTMLElement {
        const popup = document.createElement('div');
        popup.className = 'instruction-input-popup';

        // Filter presets with editInstruction for dropdown (第一个功能)
        const presetsWithEditInstruction = this.presets.filter(p => p.editInstruction && p.editInstruction.trim());
        const options = presetsWithEditInstruction
            .map((preset, idx) => {
                const shortcut = idx < 9 ? ` [${idx + 1}]` : '';
                return `<option value="${preset.id}">${this.escapeHtml(preset.editInstruction!)}${shortcut}</option>`;
            })
            .join('');

        // Generate quick access buttons for first 5 presets (第二个功能 - 全局切换)
        let presetsContent = '';
        if (this.presets.length > 0) {
            const quickAccessButtons = this.presets
                .slice(0, 5)
                .map((preset, idx) => {
                    const isActive = this.isActivePreset(preset);
                    const shortText = preset.name.length > 12
                        ? preset.name.substring(0, 12) + '...'
                        : preset.name;

                    const activeClass = isActive ? ' preset-btn--active' : '';
                    const activeBadge = isActive ? '<span class="preset-btn__badge">✓</span>' : '';
                    const activeStatus = isActive ? ' (当前使用)' : '';
                    const tooltip = `${this.escapeHtml(preset.name)}${activeStatus}\n${preset.description || ''}\n\n点击切换到此配置`;

                    return `
                        <button class="preset-btn${activeClass}" data-preset-id="${preset.id}" title="${tooltip}" type="button">
                            <span class="preset-btn__icon">${preset.icon || '📝'}</span>
                            <span class="preset-btn__text">${this.escapeHtml(shortText)}</span>
                            ${activeBadge}
                        </button>
                    `;
                })
                .join('');
            presetsContent = quickAccessButtons;
        } else {
            presetsContent = '<div class="preset-empty-hint">暂无预设，可在设置中添加</div>';
        }

        // Always show presets section with clearer label
        const shortcutsSection = `
            <div class="preset-shortcuts">
                <div class="preset-shortcuts__label">📌 预设快速选择:</div>
                <div class="preset-shortcuts__buttons">
                    ${presetsContent}
                </div>
            </div>
        `;

        popup.innerHTML = `
            <div class="popup-header">
                <span>编辑指令</span>
                <button class="popup-close" title="关闭 (Esc)">
                    <svg><use xlink:href="#iconClose"></use></svg>
                </button>
            </div>
            <div class="popup-body">
                <select class="b3-select" id="instruction-preset">
                    <option value="custom">自定义指令</option>
                    ${options}
                </select>
                ${shortcutsSection}
                <input
                    type="text"
                    class="b3-text-field"
                    id="instruction-input"
                    placeholder="输入编辑指令..."
                    value="${defaultInstruction}"
                />
                <div class="popup-actions">
                    <button class="b3-button b3-button--outline popup-cancel" title="取消 (Esc)">
                        <svg><use xlink:href="#iconClose"></use></svg>
                        <span>取消</span>
                    </button>
                    <button class="b3-button b3-button--text popup-confirm" title="确认 (Enter)">
                        <svg><use xlink:href="#iconCheck"></use></svg>
                        <span>确认</span>
                    </button>
                </div>
                <div class="popup-hint">快捷键: 1-9 选择预设 | Enter 确认 | Esc 取消</div>
            </div>
        `;

        // Bind events
        const closeBtn = popup.querySelector('.popup-close') as HTMLButtonElement;
        const cancelBtn = popup.querySelector('.popup-cancel') as HTMLButtonElement;
        const confirmBtn = popup.querySelector('.popup-confirm') as HTMLButtonElement;
        const presetSelect = popup.querySelector('#instruction-preset') as HTMLSelectElement;
        const input = popup.querySelector('#instruction-input') as HTMLInputElement;

        // Set default selected preset
        if (presetSelect) {
            presetSelect.value = presetId;
        }

        // Bind quick access preset buttons (全局切换配置)
        const presetBtns = popup.querySelectorAll('.preset-btn') as NodeListOf<HTMLButtonElement>;
        presetBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const presetId = btn.getAttribute('data-preset-id');
                if (presetId && this.onPresetSwitchCallback) {
                    // Trigger global preset switch
                    this.onPresetSwitchCallback(presetId);
                    // Don't close popup, user may still want to edit instruction
                }
            });
        });

        closeBtn?.addEventListener('click', () => this.handleCancel());
        cancelBtn?.addEventListener('click', () => this.handleCancel());
        confirmBtn?.addEventListener('click', () => this.handleSubmit(input.value));

        presetSelect?.addEventListener('change', (e) => {
            const value = (e.target as HTMLSelectElement).value;
            // Save the selected preset immediately
            this.savePresetIndex(value);
            if (value !== 'custom') {
                // Find preset by ID and fill editInstruction to input
                const preset = this.presets.find(p => p.id === value);
                if (preset && preset.editInstruction) {
                    input.value = preset.editInstruction;
                }
            }
        });

        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSubmit(input.value);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.handleCancel();
            }
        });

        // Global keyboard shortcuts for the popup
        const globalKeyHandler = (e: KeyboardEvent) => {
            // Ignore if typing in input
            if (document.activeElement === input && e.key !== 'Escape') {
                return;
            }

            // Esc - cancel
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.handleCancel();
            }
            // Enter - confirm (when not in input field)
            else if (e.key === 'Enter' && document.activeElement !== input) {
                e.preventDefault();
                e.stopPropagation();
                this.handleSubmit(input.value);
            }
            // Number keys 1-9 - select preset from dropdown
            else if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
                const idx = parseInt(e.key) - 1;
                const presetsWithEditInstruction = this.presets.filter(p => p.editInstruction && p.editInstruction.trim());
                if (idx < presetsWithEditInstruction.length) {
                    e.preventDefault();
                    e.stopPropagation();
                    const preset = presetsWithEditInstruction[idx];
                    presetSelect.value = preset.id;
                    // Save the selected preset
                    this.savePresetIndex(preset.id);
                    input.value = preset.editInstruction!;
                    input.focus();
                    input.select();
                }
            }
        };

        document.addEventListener('keydown', globalKeyHandler);

        // Clean up event listener when popup closes
        const originalRemove = popup.remove.bind(popup);
        popup.remove = () => {
            document.removeEventListener('keydown', globalKeyHandler);
            originalRemove();
        };

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
            // Save the currently selected preset index before closing
            if (this.element) {
                const presetSelect = this.element.querySelector('#instruction-preset') as HTMLSelectElement;
                if (presetSelect) {
                    this.savePresetIndex(presetSelect.value);
                }
            }
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

    /**
     * Get last selected preset index from localStorage
     */
    private getLastPresetIndex(): string | null {
        try {
            return localStorage.getItem(InstructionInputPopup.LAST_PRESET_KEY);
        } catch (error) {
            console.warn('[InstructionInputPopup] Failed to read last preset from localStorage:', error);
            return null;
        }
    }

    /**
     * Save selected preset index to localStorage
     */
    private savePresetIndex(index: string): void {
        try {
            localStorage.setItem(InstructionInputPopup.LAST_PRESET_KEY, index);
            console.log(`[InstructionInputPopup] Saved last preset index: ${index}`);
        } catch (error) {
            console.warn('[InstructionInputPopup] Failed to save last preset to localStorage:', error);
        }
    }
}
