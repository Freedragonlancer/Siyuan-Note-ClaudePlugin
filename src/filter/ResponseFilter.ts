/**
 * AI 响应内容过滤引擎
 * 用于根据正则规则过滤和替换 AI 返回的内容
 */

import type { FilterRule, FilterResult } from "./types";

/**
 * 正则表达式超时保护（毫秒）
 * 防止 ReDoS 攻击
 */
const REGEX_TIMEOUT_MS = 1000;

/**
 * 危险的正则表达式模式（可能导致 ReDoS）
 * 这些模式包含嵌套量词或重复的捕获组，可能导致指数级回溯
 */
const DANGEROUS_PATTERNS = [
    /(\+|\*|\{[0-9,]+\})\1/,  // 嵌套量词: (a+)+, (a*)*
    /\([^)]*(\+|\*).*\)\1/,   // 捕获组后跟量词: (a+)+
    /(\+|\*).*(\+|\*)/,       // 多个连续量词: a+.*b+
];

/**
 * ResponseFilter 类
 * 负责应用过滤规则到 AI 响应文本
 */
export class ResponseFilter {
    /** 已编译的正则表达式缓存 */
    private regexCache: Map<string, RegExp> = new Map();

    /**
     * 应用所有启用的过滤规则
     * @param text 原始文本
     * @param rules 过滤规则列表
     * @returns 过滤结果
     */
    applyFilters(text: string, rules?: FilterRule[]): FilterResult {
        if (!rules || rules.length === 0) {
            return {
                filteredText: text,
                changed: false,
                appliedRulesCount: 0,
                originalLength: text.length,
                filteredLength: text.length
            };
        }

        const originalLength = text.length;
        let currentText = text;
        let appliedCount = 0;

        // 按顺序应用所有启用的规则
        for (const rule of rules) {
            if (!rule.enabled) {
                console.log(`[ResponseFilter] DEBUG skipping disabled rule: ${rule.name}`);
                continue;
            }

            try {
                // DEBUG: 诊断规则应用
                console.log(`[ResponseFilter] DEBUG applying rule: ${rule.name}`);
                console.log(`[ResponseFilter] DEBUG   pattern: ${rule.pattern}`);
                console.log(`[ResponseFilter] DEBUG   flags: ${rule.flags}`);
                console.log(`[ResponseFilter] DEBUG   replacement: ${rule.replacement}`);
                console.log(`[ResponseFilter] DEBUG   text length: ${currentText.length}`);
                console.log(`[ResponseFilter] DEBUG   text preview: ${currentText.substring(0, 100)}`);

                const beforeText = currentText;  // 保存应用前的文本
                currentText = this.applyRule(currentText, rule);

                // 如果发生改变，计数器加一
                const changed = currentText !== beforeText;
                console.log(`[ResponseFilter] DEBUG   changed: ${changed}`);
                if (changed) {
                    console.log(`[ResponseFilter] DEBUG   length: ${beforeText.length} → ${currentText.length}`);
                    appliedCount++;
                }
            } catch (error) {
                console.error(`[ResponseFilter] Error applying rule "${rule.name}":`, error);
                // 继续应用其他规则，不中断整个过滤流程
            }
        }

        return {
            filteredText: currentText,
            changed: currentText !== text,
            appliedRulesCount: appliedCount,
            originalLength,
            filteredLength: currentText.length
        };
    }

    /**
     * 应用单条规则
     * @param text 文本
     * @param rule 规则
     * @returns 处理后的文本
     */
    applyRule(text: string, rule: FilterRule): string {
        try {
            // ReDoS 防护：检测危险模式
            const validation = this.validatePattern(rule.pattern, rule.flags);
            if (!validation.valid) {
                console.warn(`[ResponseFilter] Skipping dangerous pattern in rule "${rule.name}": ${validation.error}`);
                return text; // 返回原文，不应用规则
            }

            const regex = this.getRegex(rule.pattern, rule.flags);

            // 直接使用 replace，原生支持 $1, $2 等捕获组引用
            // 不使用函数形式，因为函数形式会阻止捕获组替换
            const result = text.replace(regex, rule.replacement);

            return result;
        } catch (error) {
            console.error(`[ResponseFilter] Failed to apply rule "${rule.name}":`, error);
            throw error;
        }
    }

    /**
     * 获取或创建正则表达式（带缓存）
     * @param pattern 正则模式
     * @param flags 正则标志
     * @returns 正则表达式对象
     */
    private getRegex(pattern: string, flags: string): RegExp {
        const cacheKey = `${pattern}::${flags}`;

        if (this.regexCache.has(cacheKey)) {
            return this.regexCache.get(cacheKey)!;
        }

        try {
            const regex = new RegExp(pattern, flags);
            this.regexCache.set(cacheKey, regex);
            return regex;
        } catch (error) {
            throw new Error(`Invalid regex pattern: ${pattern} with flags: ${flags}`);
        }
    }

    /**
     * 检测正则表达式是否包含危险模式（可能导致 ReDoS）
     * @param pattern 正则模式
     * @returns 是否包含危险模式
     */
    private isDangerousPattern(pattern: string): boolean {
        for (const dangerousRegex of DANGEROUS_PATTERNS) {
            if (dangerousRegex.test(pattern)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 验证正则表达式是否有效且安全
     * @param pattern 正则模式
     * @param flags 正则标志
     * @returns 是否有效且安全
     */
    validatePattern(pattern: string, flags: string): { valid: boolean; error?: string } {
        try {
            // 检查是否包含危险模式
            if (this.isDangerousPattern(pattern)) {
                return {
                    valid: false,
                    error: "正则表达式包含危险模式（可能导致性能问题），请简化表达式"
                };
            }

            // 尝试编译正则表达式
            new RegExp(pattern, flags);
            return { valid: true };
        } catch (error) {
            return {
                valid: false,
                error: error instanceof Error ? error.message : "无效的正则表达式"
            };
        }
    }

    /**
     * 测试单条规则（用于 UI 预览）
     * @param text 测试文本
     * @param rule 规则
     * @returns 处理后的文本和错误信息
     */
    testRule(text: string, rule: FilterRule): { result: string; error?: string } {
        try {
            const validation = this.validatePattern(rule.pattern, rule.flags);
            if (!validation.valid) {
                return {
                    result: text,
                    error: validation.error || "无效的正则表达式"
                };
            }

            const result = this.applyRule(text, rule);
            return { result };
        } catch (error) {
            return {
                result: text,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * 清空正则缓存
     */
    clearCache(): void {
        this.regexCache.clear();
    }
}

/**
 * 全局单例实例
 */
export const responseFilter = new ResponseFilter();
