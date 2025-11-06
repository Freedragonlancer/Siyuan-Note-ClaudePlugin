/**
 * Built-in Filter Middleware Implementations
 */

import type { FilterMiddleware, FilterContext } from './FilterPipeline';
import type { FilterRule } from './types';
import { responseFilter } from './ResponseFilter';

/**
 * Regex Filter Middleware
 * Wraps existing regex-based filter for use in pipeline
 */
export class RegexFilterMiddleware implements FilterMiddleware {
    readonly name = 'RegexFilter';
    private rules: FilterRule[];

    constructor(rules: FilterRule[]) {
        this.rules = rules;
    }

    process(response: string, context: FilterContext): string {
        if (this.rules.length === 0) {
            return response;
        }

        return responseFilter(response, this.rules);
    }

    validate(): boolean | string {
        if (!Array.isArray(this.rules)) {
            return 'Rules must be an array';
        }

        for (const rule of this.rules) {
            if (!rule.pattern || typeof rule.pattern !== 'string') {
                return `Invalid rule: pattern must be a non-empty string`;
            }

            // Test regex validity
            try {
                new RegExp(rule.pattern, rule.flags || '');
            } catch (error) {
                return `Invalid regex pattern "${rule.pattern}": ${error instanceof Error ? error.message : String(error)}`;
            }
        }

        return true;
    }

    /**
     * Update filter rules
     */
    setRules(rules: FilterRule[]): void {
        this.rules = rules;
    }
}

/**
 * Code Block Normalizer Middleware
 * Ensures code blocks have consistent formatting
 */
export class CodeBlockNormalizerMiddleware implements FilterMiddleware {
    readonly name = 'CodeBlockNormalizer';

    process(response: string): string {
        // Normalize code block markers (ensure newlines before/after)
        let normalized = response.replace(/([^\n])```/g, '$1\n```');
        normalized = normalized.replace(/```([^\n])/g, '```\n$1');

        // Remove empty code blocks
        normalized = normalized.replace(/```[\w]*\n\s*\n```/g, '');

        return normalized;
    }
}

/**
 * Markdown Link Fixer Middleware
 * Fixes malformed markdown links
 */
export class MarkdownLinkFixerMiddleware implements FilterMiddleware {
    readonly name = 'MarkdownLinkFixer';

    process(response: string): string {
        // Fix links with missing closing brackets
        let fixed = response.replace(/\[([^\]]+)\]\(([^)]+)(?!\))/g, '[$1]($2)');

        // Fix links with extra spaces
        fixed = fixed.replace(/\[\s+([^\]]+)\s+\]\(\s*([^)]+)\s*\)/g, '[$1]($2)');

        return fixed;
    }
}

/**
 * Whitespace Trimmer Middleware
 * Removes excessive whitespace while preserving intentional formatting
 */
export class WhitespaceTrimmerMiddleware implements FilterMiddleware {
    readonly name = 'WhitespaceTrimmer';
    private maxConsecutiveBlankLines: number;

    constructor(maxConsecutiveBlankLines: number = 2) {
        this.maxConsecutiveBlankLines = maxConsecutiveBlankLines;
    }

    process(response: string): string {
        // Remove trailing whitespace from each line
        let trimmed = response.replace(/[ \t]+$/gm, '');

        // Limit consecutive blank lines
        const pattern = new RegExp(`(\\n\\s*){${this.maxConsecutiveBlankLines + 1},}`, 'g');
        trimmed = trimmed.replace(pattern, '\n'.repeat(this.maxConsecutiveBlankLines + 1));

        // Trim start and end
        trimmed = trimmed.trim();

        return trimmed;
    }
}

/**
 * Custom Function Middleware
 * Allows users to provide a custom transformation function
 */
export class CustomFunctionMiddleware implements FilterMiddleware {
    readonly name: string;
    private transformFn: (response: string, context: FilterContext) => string | Promise<string>;

    constructor(
        name: string,
        transformFn: (response: string, context: FilterContext) => string | Promise<string>
    ) {
        this.name = name;
        this.transformFn = transformFn;
    }

    async process(response: string, context: FilterContext): Promise<string> {
        return await this.transformFn(response, context);
    }
}

/**
 * Conditional Middleware
 * Only applies middleware if condition is met
 */
export class ConditionalMiddleware implements FilterMiddleware {
    readonly name: string;
    private middleware: FilterMiddleware;
    private condition: (context: FilterContext) => boolean;

    constructor(
        middleware: FilterMiddleware,
        condition: (context: FilterContext) => boolean
    ) {
        this.name = `Conditional(${middleware.name})`;
        this.middleware = middleware;
        this.condition = condition;
    }

    async process(response: string, context: FilterContext): Promise<string> {
        if (this.condition(context)) {
            return await this.middleware.process(response, context);
        }
        return response;
    }
}

/**
 * Preset-Specific Middleware
 * Only applies to specific presets
 */
export class PresetSpecificMiddleware extends ConditionalMiddleware {
    constructor(middleware: FilterMiddleware, allowedPresetIds: string[]) {
        super(
            middleware,
            (context) => !context.presetId || allowedPresetIds.includes(context.presetId)
        );
    }
}
