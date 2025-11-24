/**
 * 快捷键验证工具
 * 提供格式验证和冲突检测功能
 */

export interface ValidationResult {
    /**
     * 是否有效
     */
    valid: boolean;

    /**
     * 验证类型：format（格式错误）、conflict（冲突）、valid（有效）
     */
    type: 'format' | 'conflict' | 'valid';

    /**
     * 错误或警告消息
     */
    message?: string;

    /**
     * 冲突的快捷键归属（如果是冲突）
     */
    conflictWith?: string;

    /**
     * 建议的替代快捷键
     */
    suggestions?: string[];
}

/**
 * 快捷键验证器
 * 支持格式验证、冲突检测、建议生成
 */
export class ShortcutValidator {
    // SiYuan 系统保留快捷键
    private readonly SIYUAN_RESERVED_SHORTCUTS = [
        'Ctrl+S',      // 保存
        'Ctrl+N',      // 新建文档
        'Ctrl+F',      // 搜索
        'Ctrl+P',      // 快速跳转
        'Ctrl+H',      // 替换
        'Ctrl+Z',      // 撤销
        'Ctrl+Y',      // 重做
        'Ctrl+X',      // 剪切
        'Ctrl+C',      // 复制
        'Ctrl+V',      // 粘贴
        'Ctrl+A',      // 全选
        'Ctrl+B',      // 加粗
        'Ctrl+I',      // 斜体
        'Ctrl+U',      // 下划线
        'Ctrl+E',      // 代码块
        'Ctrl+K',      // 插入链接
        'Ctrl+D',      // 删除当前行
        'Ctrl+L',      // 选中当前行
        'Ctrl+/',      // 切换注释
        'Ctrl+[',      // 减少缩进
        'Ctrl+]',      // 增加缩进
        'Alt+Up',      // 上移行
        'Alt+Down',    // 下移行
        'Shift+Alt+Up',   // 向上复制行
        'Shift+Alt+Down', // 向下复制行
    ];

    // 插件内部快捷键定义（用于检测插件内部冲突）
    private pluginShortcuts: Map<string, string> = new Map();

    /**
     * 设置插件快捷键（用于冲突检测）
     * @param shortcuts 快捷键映射 { 'quickEdit': 'Ctrl+Shift+Q', ... }
     */
    public setPluginShortcuts(shortcuts: Record<string, string>): void {
        this.pluginShortcuts.clear();
        for (const [name, shortcut] of Object.entries(shortcuts)) {
            if (shortcut) {
                this.pluginShortcuts.set(shortcut, name);
            }
        }
    }

    /**
     * 验证快捷键
     * @param shortcut 快捷键字符串（如 "Ctrl+Shift+Q"）
     * @param excludeName 排除的快捷键名称（检测冲突时排除自身）
     * @returns 验证结果
     */
    public validate(shortcut: string, excludeName?: string): ValidationResult {
        // 1. 格式验证
        const formatResult = this.validateFormat(shortcut);
        if (!formatResult.valid) {
            return formatResult;
        }

        // 2. 系统快捷键冲突检测
        const systemConflict = this.checkSystemConflict(shortcut);
        if (systemConflict) {
            return {
                valid: false,
                type: 'conflict',
                message: `与 SiYuan 系统快捷键冲突（${systemConflict}）`,
                conflictWith: 'SiYuan 系统',
                suggestions: this.generateSuggestions(shortcut),
            };
        }

        // 3. 插件内部冲突检测
        const pluginConflict = this.checkPluginConflict(shortcut, excludeName);
        if (pluginConflict) {
            return {
                valid: false,
                type: 'conflict',
                message: `与插件内其他快捷键冲突（${pluginConflict}）`,
                conflictWith: pluginConflict,
                suggestions: this.generateSuggestions(shortcut),
            };
        }

        // 4. 通过所有验证
        return {
            valid: true,
            type: 'valid',
            message: '✓ 快捷键可用',
        };
    }

    /**
     * 验证快捷键格式
     * @param shortcut 快捷键字符串
     * @returns 验证结果
     */
    private validateFormat(shortcut: string): ValidationResult {
        if (!shortcut || shortcut.trim() === '') {
            return {
                valid: false,
                type: 'format',
                message: '快捷键不能为空',
            };
        }

        // 检查格式：必须是 "Modifier+Key" 形式
        const parts = shortcut.split('+').map(p => p.trim());

        if (parts.length < 2) {
            return {
                valid: false,
                type: 'format',
                message: '快捷键必须包含修饰键（Ctrl/Alt/Shift）+ 主键',
                suggestions: ['Ctrl+Shift+Q', 'Alt+Shift+C', 'Ctrl+Alt+E'],
            };
        }

        // 检查修饰键
        const modifiers = parts.slice(0, -1);
        const validModifiers = ['Ctrl', 'Alt', 'Shift', 'Cmd', 'Command'];

        for (const mod of modifiers) {
            if (!validModifiers.includes(mod)) {
                return {
                    valid: false,
                    type: 'format',
                    message: `无效的修饰键：${mod}（仅支持 Ctrl、Alt、Shift）`,
                };
            }
        }

        // 检查主键
        const mainKey = parts[parts.length - 1];
        if (!mainKey || mainKey.length === 0) {
            return {
                valid: false,
                type: 'format',
                message: '缺少主键（字母、数字或功能键）',
            };
        }

        // 主键不能是修饰键
        if (validModifiers.includes(mainKey)) {
            return {
                valid: false,
                type: 'format',
                message: '主键不能是修饰键本身',
                suggestions: ['Ctrl+Shift+Q', 'Alt+E', 'Ctrl+Alt+Space'],
            };
        }

        return {
            valid: true,
            type: 'valid',
        };
    }

    /**
     * 检测与 SiYuan 系统快捷键的冲突
     * @param shortcut 快捷键字符串
     * @returns 冲突的功能名称，无冲突返回 null
     */
    private checkSystemConflict(shortcut: string): string | null {
        const normalized = this.normalizeShortcut(shortcut);

        for (const reserved of this.SIYUAN_RESERVED_SHORTCUTS) {
            if (this.normalizeShortcut(reserved) === normalized) {
                return this.getSystemFunctionName(reserved);
            }
        }

        return null;
    }

    /**
     * 检测与插件内部快捷键的冲突
     * @param shortcut 快捷键字符串
     * @param excludeName 排除的快捷键名称
     * @returns 冲突的快捷键名称，无冲突返回 null
     */
    private checkPluginConflict(shortcut: string, excludeName?: string): string | null {
        const normalized = this.normalizeShortcut(shortcut);

        for (const [pluginShortcut, name] of this.pluginShortcuts.entries()) {
            if (name === excludeName) {
                continue; // 排除自身
            }

            if (this.normalizeShortcut(pluginShortcut) === normalized) {
                return this.getPluginFunctionName(name);
            }
        }

        return null;
    }

    /**
     * 规范化快捷键字符串（用于比较）
     * 统一格式：Ctrl+Alt+Shift+Key（按字母顺序）
     */
    private normalizeShortcut(shortcut: string): string {
        const parts = shortcut.split('+').map(p => p.trim());

        const modifiers: string[] = [];
        let mainKey = '';

        for (const part of parts) {
            if (['Ctrl', 'Control', 'Cmd', 'Command'].includes(part)) {
                modifiers.push('Ctrl');
            } else if (['Alt', 'Option'].includes(part)) {
                modifiers.push('Alt');
            } else if (part === 'Shift') {
                modifiers.push('Shift');
            } else {
                mainKey = part.toUpperCase();
            }
        }

        // 去重并排序
        const uniqueModifiers = Array.from(new Set(modifiers)).sort();

        return [...uniqueModifiers, mainKey].join('+');
    }

    /**
     * 生成替代建议
     */
    private generateSuggestions(conflictingShortcut: string): string[] {
        const suggestions: string[] = [];
        const parts = conflictingShortcut.split('+');
        const mainKey = parts[parts.length - 1];

        // 建议1：添加更多修饰键
        if (!conflictingShortcut.includes('Shift')) {
            suggestions.push(`Ctrl+Shift+${mainKey}`);
        }
        if (!conflictingShortcut.includes('Alt')) {
            suggestions.push(`Alt+Shift+${mainKey}`);
        }

        // 建议2：更换主键
        const alternativeKeys = ['Q', 'W', 'E', 'J', 'K', 'L'];
        const currentModifiers = parts.slice(0, -1).join('+');
        for (const key of alternativeKeys) {
            if (key !== mainKey) {
                suggestions.push(`${currentModifiers}+${key}`);
                if (suggestions.length >= 3) break;
            }
        }

        return suggestions.slice(0, 3); // 最多返回 3 个建议
    }

    /**
     * 获取系统功能名称
     */
    private getSystemFunctionName(shortcut: string): string {
        const functionNames: Record<string, string> = {
            'Ctrl+S': '保存',
            'Ctrl+N': '新建文档',
            'Ctrl+F': '搜索',
            'Ctrl+P': '快速跳转',
            'Ctrl+H': '替换',
            'Ctrl+Z': '撤销',
            'Ctrl+Y': '重做',
            'Ctrl+B': '加粗',
            'Ctrl+I': '斜体',
            'Ctrl+K': '插入链接',
        };

        return functionNames[shortcut] || shortcut;
    }

    /**
     * 获取插件功能名称
     */
    private getPluginFunctionName(name: string): string {
        const functionNames: Record<string, string> = {
            'quickEdit': 'AI 快速编辑',
            'undoAIEdit': '撤销 AI 编辑',
            'openClaude': '打开 Claude AI 面板',
        };

        return functionNames[name] || name;
    }
}
