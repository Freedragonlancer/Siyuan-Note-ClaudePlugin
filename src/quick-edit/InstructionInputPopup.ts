/**
 * Instruction Input Popup - Lightweight floating input for edit instructions
 */

import type { PopupPosition } from './inline-types';
import type { PromptTemplate } from '@/settings/config-types';
import type { ConfigManager } from '@/settings/ConfigManager';
import { showMessage } from 'siyuan';

export class InstructionInputPopup {
    private element: HTMLElement | null = null;
    private isVisible: boolean = false;  // FIX Phase 6: Track visibility to prevent duplicate opens
    private presets: PromptTemplate[];
    private configManager: ConfigManager;
    private onSubmitCallback?: (instruction: string) => void;
    private onCancelCallback?: () => void;
    private onPresetSwitchCallback?: (presetId: string) => void;
    private currentSelectedPresetId: string = 'custom'; // Track currently selected preset in the popup

    // localStorage key for fast synchronous access (synced from file storage)
    private static readonly LAST_PRESET_KEY = 'claude-quick-edit-last-preset-index';
    // File storage key for persistent preset selection across SiYuan restarts
    private static readonly LAST_PRESET_FILE = 'quick-edit-last-preset.json';

    constructor(presets: PromptTemplate[], configManager: ConfigManager) {
        this.presets = presets;
        this.configManager = configManager;

        // Load last preset from file storage to localStorage (async, non-blocking)
        this.loadLastPresetFromFile().catch(() => {
            // Silently handle - file not existing is expected on first use
        });
    }

    /**
     * Load last preset ID from file storage to localStorage cache
     * Called once during initialization
     */
    private async loadLastPresetFromFile(): Promise<void> {
        try {
            const plugin = (this.configManager as any).plugin;
            if (!plugin || typeof plugin.loadData !== 'function') {
                return;
            }

            const fileData = await plugin.loadData(InstructionInputPopup.LAST_PRESET_FILE);
            if (fileData && fileData.presetId) {
                // Sync to localStorage cache
                localStorage.setItem(InstructionInputPopup.LAST_PRESET_KEY, fileData.presetId);
            }
        } catch (error) {
            // First time use, no file storage yet
        }
    }

    /**
     * Show popup at position
     */
    public show(position: PopupPosition, defaultInstruction: string = ''): void {

        // FIX Phase 6: Prevent duplicate opens
        if (this.isVisible) {
            console.warn('[InstructionInputPopup] Already visible, ignoring duplicate show() call');
            return;
        }

        if (this.element) {
            this.close();
        }

        this.isVisible = true;

        // Try to load last selected preset (now stored as ID, not index)
        const lastPresetId = this.getLastPresetIndex(); // method name kept for compatibility
        let instructionToUse = defaultInstruction; // Keep empty - user will type instruction
        let presetIdToUse = 'custom';

        // If there's a last selected preset and it's still valid
        if (lastPresetId && lastPresetId !== 'custom') {
            const preset = this.presets.find(p => p.id === lastPresetId);
            if (preset) {
                // Don't fill editInstruction (full template) into input field
                // Just remember the preset ID for placeholder and button highlighting
                presetIdToUse = lastPresetId;
                instructionToUse = ''; // Keep empty for user input
            } else {
                console.warn(`[InstructionInputPopup] Preset ${lastPresetId} not found, clearing saved preset`);
                // Clean up invalid preset ID
                localStorage.removeItem(InstructionInputPopup.LAST_PRESET_KEY);
            }
        } else if (!lastPresetId) {
            // First time use: auto-select the first available preset
            const firstPreset = this.presets.find(p => p.editInstruction && p.editInstruction.trim());
            if (firstPreset) {
                presetIdToUse = firstPreset.id;
                instructionToUse = ''; // Keep empty for user input
                // Save to localStorage to remember for next time
                this.savePresetIndex(firstPreset.id);
            }
        }

        // Store the selected preset ID for button highlighting
        this.currentSelectedPresetId = presetIdToUse;

        this.element = this.createPopup(instructionToUse, presetIdToUse);

        // Set initial position first (before adding to DOM to avoid flash)
        this.element.style.left = `${position.x}px`;
        this.element.style.top = `${position.y}px`;

        document.body.appendChild(this.element);

        // FIX Performance: 使用 RAF 批处理布局读取和样式更新
        requestAnimationFrame(() => {
            // Force browser to calculate dimensions by accessing offsetHeight
            // This ensures getBoundingClientRect() returns accurate values
            void this.element.offsetHeight;

            // Get popup dimensions for debugging
            const popupRect = this.element.getBoundingClientRect();

            // Calculate safe position with boundary detection
            const safePosition = this.calculateSafePosition(position, this.element);

            // Update position if adjusted
            if (safePosition.x !== position.x || safePosition.y !== position.y) {
                this.element.style.left = `${safePosition.x}px`;
                this.element.style.top = `${safePosition.y}px`;
            }
        });

        // Focus input (can happen immediately)
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
        this.isVisible = false;  // FIX Phase 6: Reset visibility flag
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
     * Calculate safe position with smart boundary protection
     * - Auto-flips to show above selection if insufficient space below
     * - Considers HiDPI scaling (uses CSS pixels)
     * - Prevents cutoff by screen edges
     *
     * @param position - Requested position with anchor rect
     * @param element - Popup element (must be in DOM to get dimensions)
     * @returns Adjusted position
     */
    private calculateSafePosition(position: PopupPosition, element: HTMLElement): { x: number; y: number } {
        const BOTTOM_MARGIN = 50;  // Reasonable margin for taskbar
        const TOP_MARGIN = 20;      // Margin from top
        const LEFT_MARGIN = 20;     // Margin from left
        const RIGHT_MARGIN = 20;    // Margin from right
        const SPACING = 10;         // Space between selection and popup

        // Get popup dimensions (CSS pixels, HiDPI compatible)
        const popupRect = element.getBoundingClientRect();
        const popupHeight = popupRect.height;
        const popupWidth = popupRect.width;

        // Get viewport dimensions (CSS pixels, HiDPI compatible)
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;


        let safeX = position.x;
        let safeY = position.y;
        let placement = position.placement;

        // Smart vertical positioning with auto-flip
        if (position.anchorRect) {
            const anchorTop = position.anchorRect.top;
            const anchorBottom = position.anchorRect.bottom;
            const anchorHeight = position.anchorRect.height;

            // Calculate available space above and below selection
            const spaceBelow = viewportHeight - anchorBottom - BOTTOM_MARGIN;
            const spaceAbove = anchorTop - TOP_MARGIN;


            // Check if we should flip to above
            if (placement === 'below' && spaceBelow < popupHeight + SPACING) {
                // Not enough space below
                if (spaceAbove > popupHeight + SPACING) {
                    // Enough space above, flip to above
                    safeY = anchorTop - popupHeight - SPACING;
                    placement = 'above';
                } else {
                    // Not enough space above either, use the larger space
                    if (spaceAbove > spaceBelow) {
                        // Show above, but may be clipped
                        safeY = Math.max(TOP_MARGIN, anchorTop - popupHeight - SPACING);
                        placement = 'above';
                    } else {
                        // Show below, but may be clipped
                        safeY = anchorBottom + SPACING;
                    }
                }
            } else {
            }
        }

        // Ensure we don't go below viewport bottom
        const bottomEdge = safeY + popupHeight;
        const maxBottomY = viewportHeight - BOTTOM_MARGIN;
        if (bottomEdge > maxBottomY) {
            safeY = Math.max(TOP_MARGIN, maxBottomY - popupHeight);
        }

        // Ensure we don't go above viewport top
        if (safeY < TOP_MARGIN) {
            safeY = TOP_MARGIN;
        }

        // Horizontal positioning
        const rightEdge = safeX + popupWidth;
        const maxRightX = viewportWidth - RIGHT_MARGIN;

        if (rightEdge > maxRightX) {
            safeX = Math.max(LEFT_MARGIN, maxRightX - popupWidth);
        }

        if (safeX < LEFT_MARGIN) {
            safeX = LEFT_MARGIN;
        }


        return { x: safeX, y: safeY };
    }

    /**
     * Create popup element
     */
    private createPopup(defaultInstruction: string, presetId: string = 'custom'): HTMLElement {
        const popup = document.createElement('div');
        popup.className = 'instruction-input-popup';

        // Determine placeholder text based on preset
        let placeholderText = '输入编辑指令...'; // Default fallback
        if (presetId !== 'custom') {
            const selectedPreset = this.presets.find(p => p.id === presetId);
            if (selectedPreset?.inputPlaceholder) {
                placeholderText = selectedPreset.inputPlaceholder;
            }
        }

        // Generate dropdown options - simplified to show preset names only
        const presetsWithEditInstruction = this.presets.filter(p => p.editInstruction && p.editInstruction.trim());
        const options = presetsWithEditInstruction
            .map((preset, idx) => {
                const shortcut = idx < 9 ? ` [${idx + 1}]` : '';
                const selected = preset.id === presetId ? ' selected' : '';
                return `<option value="${preset.id}"${selected}>${this.escapeHtml(preset.name)}${shortcut}</option>`;
            })
            .join('');

        // Generate quick access buttons for first 5 presets (第二个功能 - 全局切换)
        let presetsContent = '';
        if (this.presets.length > 0) {
            const quickAccessButtons = this.presets
                .slice(0, 5)
                .map((preset, idx) => {
                    // Check if this preset is the one currently selected in the popup
                    const isSelected = preset.id === presetId;
                    // Check if this preset is globally active (optional indicator)
                    const isGloballyActive = this.isActivePreset(preset);

                    const shortText = preset.name.length > 12
                        ? preset.name.substring(0, 12) + '...'
                        : preset.name;

                    // Use selected state for highlighting, not globally active
                    const activeClass = isSelected ? ' preset-btn--active' : '';
                    const activeBadge = isSelected ? '<span class="preset-btn__badge">✓</span>' : '';
                    const globalActiveHint = isGloballyActive && !isSelected ? ' 🌍' : '';
                    const tooltip = `${this.escapeHtml(preset.name)}${globalActiveHint}\n${preset.description || ''}\n\n点击切换到此配置`;

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
                ${presetsWithEditInstruction.length > 5 ? `
                <div style="margin-bottom: 8px;">
                    <label style="display: block; margin-bottom: 4px; font-size: 12px; color: var(--b3-theme-on-surface-light);">更多预设</label>
                    <select class="b3-select" id="instruction-preset">
                        ${options}
                    </select>
                </div>
                ` : ''}
                ${shortcutsSection}
                <input
                    type="text"
                    class="b3-text-field"
                    id="instruction-input"
                    placeholder="${this.escapeHtml(placeholderText)}"
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

        // Set default selected preset (only if dropdown exists)
        if (presetSelect && presetId !== 'custom') {
            presetSelect.value = presetId;
        }

        // Bind quick access preset buttons (global switch + fill instruction)
        const presetBtns = popup.querySelectorAll('.preset-btn') as NodeListOf<HTMLButtonElement>;
        presetBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const presetId = btn.getAttribute('data-preset-id');
                if (presetId) {
                    // Save selected preset
                    this.savePresetIndex(presetId);
                    // Update current selected preset ID for button highlighting
                    this.currentSelectedPresetId = presetId;

                    // Trigger global preset switch
                    if (this.onPresetSwitchCallback) {
                        this.onPresetSwitchCallback(presetId);
                    }

                    // Update UI immediately: fill instruction, update placeholder, refresh indicators
                    this.applyPresetToInput(presetId, input);
                    this.syncDropdownSelection(presetId);
                    this.refreshActiveIndicators();

                    // Don't close popup, user may still want to edit instruction
                }
            });
        });

        closeBtn?.addEventListener('click', () => this.handleCancel());
        cancelBtn?.addEventListener('click', () => this.handleCancel());
        confirmBtn?.addEventListener('click', () => this.handleSubmit(input.value));

        presetSelect?.addEventListener('change', (e) => {
            const value = (e.target as HTMLSelectElement).value;

            // Save the selected preset ID
            this.savePresetIndex(value);
            // Update current selected preset ID for button highlighting
            this.currentSelectedPresetId = value;

            // Trigger preset switch (global config + fill instruction)
            if (this.onPresetSwitchCallback) {
                this.onPresetSwitchCallback(value);
            }

            // Update UI immediately
            this.applyPresetToInput(value, input);
            this.refreshActiveIndicators();
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
                    // Update current selected preset ID for button highlighting
                    this.currentSelectedPresetId = preset.id;
                    // Refresh button indicators
                    this.refreshActiveIndicators();
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
        let trimmedInstruction = instruction.trim();

        // If input is empty, use the input's placeholder as default instruction
        if (!trimmedInstruction) {
            // Read placeholder directly from input element (already set during popup creation)
            const input = this.element?.querySelector('#instruction-input') as HTMLInputElement;
            if (input?.placeholder && input.placeholder !== '输入编辑指令...') {
                trimmedInstruction = input.placeholder.trim();
            }

            // If still empty (default placeholder or no placeholder), show error
            if (!trimmedInstruction) {
                showMessage('请输入编辑指令或选择预设', 2000, 'info');
                return;
            }
        }

        // Validate: callback must exist
        if (!this.onSubmitCallback) {
            console.error('[InstructionInputPopup] No submit callback registered');
            this.close();
            return;
        }

        // FIX: Save the currently selected preset ID before closing
        // Use currentSelectedPresetId instead of dropdown (which may not exist if <=5 presets)
        if (this.currentSelectedPresetId && this.currentSelectedPresetId !== 'custom') {
            this.savePresetIndex(this.currentSelectedPresetId);
        }

        // Call callback with instruction (either user input or placeholder)
        this.onSubmitCallback(trimmedInstruction);

        // Only close after successful submission
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
     * Get last selected preset ID from localStorage cache (synchronous)
     * File storage is loaded to localStorage in constructor
     */
    private getLastPresetIndex(): string | null {
        try {
            return localStorage.getItem(InstructionInputPopup.LAST_PRESET_KEY);
        } catch (error) {
            console.warn('[InstructionInputPopup] Failed to read last preset:', error);
            return null;
        }
    }

    /**
     * Save selected preset ID to both localStorage (sync) and file storage (async)
     */
    private savePresetIndex(index: string): void {
        try {
            // Save to localStorage immediately (fast)
            localStorage.setItem(InstructionInputPopup.LAST_PRESET_KEY, index);

            // Save to file storage async (persistent across restarts)
            const plugin = (this.configManager as any).plugin;
            if (plugin && typeof plugin.saveData === 'function') {
                plugin.saveData(InstructionInputPopup.LAST_PRESET_FILE, { presetId: index })
                    .catch((err: Error) => {
                        console.warn('[InstructionInputPopup] Failed to save preset to file storage:', err);
                    });
            }
        } catch (error) {
            console.warn('[InstructionInputPopup] Failed to save last preset:', error);
        }
    }

    /**
     * Apply preset to input field (clear value and update placeholder)
     * Note: editInstruction stores the full template, not a short instruction,
     * so we don't fill it into the input field. User inputs their own instruction.
     */
    private applyPresetToInput(presetId: string, input: HTMLInputElement): void {
        const preset = this.presets.find(p => p.id === presetId);
        if (!preset) return;

        // Clear input value - user will type their own instruction
        // The preset's editInstruction (full template) will be used when submitting
        input.value = '';

        // Update placeholder
        if (preset.inputPlaceholder) {
            input.placeholder = preset.inputPlaceholder;
        } else {
            input.placeholder = '输入编辑指令...';
        }

        // Focus input for user to type
        input.focus();
    }

    /**
     * Refresh active indicators on preset buttons
     * Uses currentSelectedPresetId to determine which button should be highlighted
     * FIX Performance: 使用 RAF 批处理 DOM 操作，避免强制重排
     */
    private refreshActiveIndicators(): void {
        if (!this.element) return;

        // 使用 RAF 批处理所有 DOM 操作
        requestAnimationFrame(() => {
            if (!this.element) return;

            const buttons = this.element.querySelectorAll('.preset-btn') as NodeListOf<HTMLButtonElement>;
            buttons.forEach(btn => {
                const presetId = btn.getAttribute('data-preset-id');

                // Check if this button matches the currently selected preset
                if (presetId === this.currentSelectedPresetId) {
                    // Add active class
                    btn.classList.add('preset-btn--active');

                    // Add checkmark badge if not exists
                    if (!btn.querySelector('.preset-btn__badge')) {
                        const badge = document.createElement('span');
                        badge.className = 'preset-btn__badge';
                        badge.textContent = '✓';
                        btn.appendChild(badge);
                    }
                } else {
                    // Remove active class
                    btn.classList.remove('preset-btn--active');

                    // Remove checkmark badge if exists
                    const badge = btn.querySelector('.preset-btn__badge');
                    if (badge) {
                        badge.remove();
                    }
                }
            });
        });
    }

    /**
     * Sync dropdown selection with current preset
     */
    private syncDropdownSelection(presetId: string): void {
        if (!this.element) return;

        const dropdown = this.element.querySelector('#instruction-preset') as HTMLSelectElement;
        if (dropdown && presetId !== 'custom') {
            dropdown.value = presetId;
        }
    }

    /**
     * Update presets list dynamically
     * Call this when presets are added/updated in settings
     */
    public updatePresets(presets: PromptTemplate[]): void {
        this.presets = presets;

        // If popup is currently visible, update the preset selector
        if (this.isVisible && this.element) {
            const selector = this.element.querySelector('#instruction-preset') as HTMLSelectElement;
            if (selector) {
                const currentValue = selector.value;

                // Rebuild options (simplified - no "custom" option)
                const presetsWithEditInstruction = this.presets.filter(p => p.editInstruction && p.editInstruction.trim());
                selector.innerHTML = presetsWithEditInstruction
                    .map((preset, idx) => {
                        const shortcut = idx < 9 ? ` [${idx + 1}]` : '';
                        const selected = preset.id === currentValue ? ' selected' : '';
                        return `<option value="${preset.id}"${selected}>${this.escapeHtml(preset.name)}${shortcut}</option>`;
                    })
                    .join('');

                // Restore selection if the preset still exists
                const presetStillExists = this.presets.some(p => p.id === currentValue);
                if (presetStillExists) {
                    selector.value = currentValue;
                } else {
                    // Preset was deleted, select first preset if available
                    if (presetsWithEditInstruction.length > 0) {
                        selector.value = presetsWithEditInstruction[0].id;
                    }
                }
            }

            // Refresh button indicators
            this.refreshActiveIndicators();
        }
    }

    /**
     * Helper method to escape HTML attributes
     */
    private escapeAttr(text: string): string {
        return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
}
