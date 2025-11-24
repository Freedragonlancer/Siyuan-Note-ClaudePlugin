/**
 * 键盘快捷键录制工具
 * 提供轻量级的按键录制功能，无需外部依赖
 */

export type RecordingState = 'idle' | 'recording';

export interface KeyboardRecorderOptions {
    /**
     * 录制完成时的回调函数
     * @param shortcut 格式化后的快捷键字符串（如 "Ctrl+Shift+Q"）
     */
    onRecorded?: (shortcut: string) => void;

    /**
     * 实时预览回调（按下修饰键时触发）
     * @param preview 当前按键预览（如 "Ctrl+Shift+..."）
     */
    onPreview?: (preview: string) => void;

    /**
     * 录制状态变化回调
     */
    onStateChange?: (state: RecordingState) => void;
}

/**
 * 键盘快捷键录制器
 * 使用原生 keydown 事件实现，支持实时预览和自动格式化
 */
export class KeyboardRecorder {
    private state: RecordingState = 'idle';
    private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
    private options: KeyboardRecorderOptions;
    private targetElement: HTMLElement | Document = document;

    // 需要过滤的修饰键（不作为主键）
    private readonly MODIFIER_KEYS = ['Control', 'Alt', 'Shift', 'Meta'];

    constructor(options: KeyboardRecorderOptions = {}) {
        this.options = options;
    }

    /**
     * 开始录制快捷键
     * @param targetElement 监听的目标元素（默认为 document）
     */
    public startRecording(targetElement?: HTMLElement): void {
        if (this.state === 'recording') {
            return; // 已经在录制中
        }

        this.targetElement = targetElement || document;
        this.state = 'recording';
        this.options.onStateChange?.('recording');

        // 创建 keydown 事件处理器
        this.keydownHandler = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            // 收集修饰键
            const modifiers: string[] = [];
            if (e.ctrlKey || e.metaKey) modifiers.push('Ctrl');
            if (e.altKey) modifiers.push('Alt');
            if (e.shiftKey) modifiers.push('Shift');

            // 如果按下的是修饰键本身，只显示预览
            if (this.MODIFIER_KEYS.includes(e.key)) {
                const preview = modifiers.length > 0 ? `${modifiers.join('+')}+...` : '...';
                this.options.onPreview?.(preview);
                return;
            }

            // 如果没有修饰键，不允许录制（快捷键必须包含修饰键）
            if (modifiers.length === 0) {
                this.options.onPreview?.('请按下修饰键（Ctrl/Alt/Shift）+ 字母/数字键');
                return;
            }

            // 获取主键
            const mainKey = this.normalizeKey(e.key);
            if (!mainKey) {
                // 无效的主键
                return;
            }

            // 格式化快捷键字符串
            const shortcut = [...modifiers, mainKey].join('+');

            // 停止录制并触发回调
            this.stopRecording();
            this.options.onRecorded?.(shortcut);
        };

        // 绑定事件
        this.targetElement.addEventListener('keydown', this.keydownHandler as EventListener, true);
    }

    /**
     * 停止录制
     */
    public stopRecording(): void {
        if (this.state === 'idle') {
            return;
        }

        // 移除事件监听
        if (this.keydownHandler) {
            this.targetElement.removeEventListener('keydown', this.keydownHandler as EventListener, true);
            this.keydownHandler = null;
        }

        this.state = 'idle';
        this.options.onStateChange?.('idle');
    }

    /**
     * 获取当前录制状态
     */
    public getState(): RecordingState {
        return this.state;
    }

    /**
     * 规范化按键名称
     * @param key 原始按键名
     * @returns 规范化后的按键名（大写字母或特殊键名）
     */
    private normalizeKey(key: string): string | null {
        // 字母键：统一转大写
        if (key.length === 1 && /[a-zA-Z0-9]/.test(key)) {
            return key.toUpperCase();
        }

        // 特殊键映射
        const specialKeys: Record<string, string> = {
            'ArrowUp': 'Up',
            'ArrowDown': 'Down',
            'ArrowLeft': 'Left',
            'ArrowRight': 'Right',
            ' ': 'Space',
            'Escape': 'Esc',
            'Enter': 'Enter',
            'Tab': 'Tab',
            'Backspace': 'Backspace',
            'Delete': 'Delete',
            'Insert': 'Insert',
            'Home': 'Home',
            'End': 'End',
            'PageUp': 'PageUp',
            'PageDown': 'PageDown',
        };

        if (key in specialKeys) {
            return specialKeys[key];
        }

        // F1-F12
        if (/^F\d{1,2}$/.test(key)) {
            return key;
        }

        // 其他键不支持
        return null;
    }

    /**
     * 销毁录制器
     */
    public destroy(): void {
        this.stopRecording();
    }
}
