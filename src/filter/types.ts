/**
 * AI 响应内容过滤规则类型定义
 */

/**
 * 单条过滤规则接口
 */
export interface FilterRule {
    /** 唯一标识符 */
    id: string;

    /** 规则名称（用于 UI 显示） */
    name: string;

    /** 正则表达式模式字符串 */
    pattern: string;

    /** 替换文本（空字符串表示删除，支持捕获组 $1, $2 等） */
    replacement: string;

    /** 正则标志 (g=全局, i=忽略大小写, s=点匹配换行, m=多行) */
    flags: string;

    /** 是否启用此规则 */
    enabled: boolean;
}

/**
 * 过滤结果接口
 */
export interface FilterResult {
    /** 过滤后的文本 */
    filteredText: string;

    /** 是否发生了改变 */
    changed: boolean;

    /** 应用的规则数量 */
    appliedRulesCount: number;

    /** 原始长度 */
    originalLength: number;

    /** 过滤后长度 */
    filteredLength: number;
}

/**
 * 过滤规则作用域类型
 */
export type FilterRuleScope = 'global' | 'preset';

/**
 * 带作用域信息的过滤规则（用于 UI 显示）
 */
export interface FilterRuleWithScope extends FilterRule {
    /** 规则作用域 */
    scope: FilterRuleScope;

    /** 预设 ID（仅当 scope === 'preset' 时） */
    presetId?: string;

    /** 预设名称（用于 UI 显示） */
    presetName?: string;
}

/**
 * 内置过滤规则模板
 */
export const BUILTIN_FILTER_TEMPLATES: FilterRule[] = [
    {
        id: "remove-think-tags",
        name: "删除 <think> 标签",
        pattern: "<think>.*?</think>",
        replacement: "",
        flags: "gis",
        enabled: true
    },
    {
        id: "remove-thinking-tags",
        name: "删除 <thinking> 标签",
        pattern: "<thinking>.*?</thinking>",
        replacement: "",
        flags: "gis",
        enabled: true
    },
    {
        id: "remove-all-xml-tags",
        name: "删除所有 XML 标签",
        pattern: "<[^>]+>.*?</[^>]+>",
        replacement: "",
        flags: "gis",
        enabled: false
    },
    {
        id: "remove-code-block-wrapper",
        name: "删除代码块标记（保留内容）",
        pattern: "```(?:\\w+)?\\n?([\\s\\S]*?)```",
        replacement: "$1",
        flags: "g",
        enabled: false
    }
];
