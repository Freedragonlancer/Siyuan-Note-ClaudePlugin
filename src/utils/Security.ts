/**
 * Security Utilities
 * Provides security-related functions for input validation, sanitization, and escaping
 */

/**
 * Security utility class for input validation and sanitization
 */
export class SecurityUtils {
    /**
     * Escape HTML to prevent XSS attacks
     * Enhanced version with comprehensive escaping
     */
    static escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;")
            .replace(/\//g, "&#x2F;");
    }

    /**
     * Sanitize markdown content
     * Removes potentially dangerous HTML while preserving markdown
     */
    static sanitizeMarkdown(markdown: string): string {
        // Remove script tags
        markdown = markdown.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

        // Remove event handlers (onclick, onload, etc.)
        markdown = markdown.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

        // Remove javascript: protocol
        markdown = markdown.replace(/javascript:/gi, '');

        // Remove data: URLs (can be used for XSS)
        markdown = markdown.replace(/data:text\/html[^"'\s]*/gi, '');

        return markdown;
    }

    /**
     * Validate and sanitize SiYuan block ID
     * Block ID format: 14 digits + hyphen + 7 alphanumeric chars
     * Example: 20240107123456-abc1234
     *
     * @throws {Error} If block ID format is invalid
     */
    static sanitizeBlockId(blockId: string): string {
        const blockIdPattern = /^[0-9]{14}-[0-9a-z]{7}$/i;

        if (!blockIdPattern.test(blockId)) {
            throw new Error(`Invalid block ID format: ${blockId}. Expected format: YYYYMMDDHHMMSS-XXXXXXX`);
        }

        return blockId;
    }

    /**
     * Validate multiple block IDs
     * @throws {Error} If any block ID is invalid
     */
    static sanitizeBlockIds(blockIds: string[]): string[] {
        return blockIds.map(id => this.sanitizeBlockId(id));
    }

    /**
     * Escape SQL string (for SQL queries)
     * Note: This is a basic implementation. For complex queries, use parameterized queries.
     */
    static escapeSQLString(str: string): string {
        return str.replace(/'/g, "''");
    }

    /**
     * Validate numeric parameter (for counts, limits, etc.)
     */
    static validateNumericRange(
        value: number,
        min: number,
        max: number,
        paramName: string = 'value'
    ): number {
        if (!Number.isInteger(value)) {
            throw new Error(`${paramName} must be an integer, got: ${value}`);
        }

        if (value < min || value > max) {
            throw new Error(`${paramName} must be between ${min} and ${max}, got: ${value}`);
        }

        return value;
    }

    /**
     * Sanitize file path to prevent directory traversal
     */
    static sanitizeFilePath(filePath: string): string {
        // Remove .. and other potentially dangerous patterns
        return filePath
            .replace(/\.\./g, '')
            .replace(/[<>:"|?*]/g, '')
            .trim();
    }

    /**
     * Validate URL to ensure it's safe
     */
    static validateUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            // Only allow http and https protocols
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }

    /**
     * Sanitize user input by removing potentially dangerous characters
     */
    static sanitizeUserInput(input: string, maxLength: number = 10000): string {
        // Trim and limit length
        let sanitized = input.trim().substring(0, maxLength);

        // Remove null bytes
        sanitized = sanitized.replace(/\0/g, '');

        return sanitized;
    }

    /**
     * Check if string contains potentially dangerous patterns
     */
    static containsDangerousPatterns(input: string): boolean {
        const dangerousPatterns = [
            /<script/i,
            /javascript:/i,
            /on\w+\s*=/i,
            /<iframe/i,
            /<embed/i,
            /<object/i,
            /eval\s*\(/i,
            /expression\s*\(/i
        ];

        return dangerousPatterns.some(pattern => pattern.test(input));
    }

    /**
     * Generate a safe random ID
     */
    static generateSafeId(prefix: string = 'id'): string {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 9);
        return `${prefix}-${timestamp}-${random}`;
    }

    /**
     * Validate email format (basic validation)
     */
    static isValidEmail(email: string): boolean {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailPattern.test(email);
    }

    /**
     * Sanitize HTML attributes
     */
    static sanitizeHtmlAttribute(value: string): string {
        return value
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /**
     * Sanitize text for AI API requests
     * Removes control characters that may cause API errors
     * Preserves normal whitespace (space, tab, newline, carriage return)
     * 
     * Control characters that are removed:
     * - C0 control codes (U+0000-U+001F, except \t, \n, \r)
     * - C1 control codes (U+0080-U+009F)
     * - Unicode replacement character (U+FFFD)
     * - Byte Order Marks (U+FEFF, U+FFFE)
     * - Invisible formatting characters (U+2060-U+2064)
     * 
     * Preserved characters:
     * - ZWJ (U+200D) - needed for emoji combinations (👨‍👩‍👧) and some scripts
     * - ZWNJ (U+200C) - needed for Arabic, Persian, Hindi text
     */
    static sanitizeForAI(text: string): string {
        if (!text) return text;

        return text
            // Remove C0 control characters except tab (0x09), newline (0x0A), carriage return (0x0D)
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
            // Remove C1 control characters (U+0080-U+009F)
            .replace(/[\x80-\x9F]/g, '')
            // Remove Unicode replacement character
            .replace(/\uFFFD/g, '')
            // Remove Byte Order Marks
            .replace(/[\uFEFF\uFFFE]/g, '')
            // Remove invisible formatting characters (but keep ZWJ U+200D and ZWNJ U+200C for emoji/scripts)
            .replace(/[\u2060\u2061\u2062\u2063\u2064]/g, '')
            // Convert line/paragraph separators to newline
            .replace(/[\u2028\u2029]/g, '\n')
            // Collapse 3+ consecutive whitespace chars to 2 spaces (preserve formatting)
            .replace(/[^\S\n\r]{3,}/g, '  ');
    }

    /**
     * Check if text contains potentially problematic characters for AI APIs
     * Useful for diagnostics
     */
    static hasProblematicCharacters(text: string): { hasIssues: boolean; issues: string[] } {
        const issues: string[] = [];

        if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) {
            issues.push('C0 control characters detected');
        }
        if (/[\x80-\x9F]/.test(text)) {
            issues.push('C1 control characters detected');
        }
        if (/\uFFFD/.test(text)) {
            issues.push('Unicode replacement character (encoding error indicator) detected');
        }
        if (/[\uFEFF\uFFFE]/.test(text)) {
            issues.push('Byte Order Mark detected');
        }
        if (/[\u2060-\u2064]/.test(text)) {
            issues.push('Invisible formatting characters detected');
        }

        return {
            hasIssues: issues.length > 0,
            issues
        };
    }
}

// Export convenience functions
export const escapeHtml = SecurityUtils.escapeHtml.bind(SecurityUtils);
export const sanitizeBlockId = SecurityUtils.sanitizeBlockId.bind(SecurityUtils);
export const validateNumericRange = SecurityUtils.validateNumericRange.bind(SecurityUtils);
export const sanitizeForAI = SecurityUtils.sanitizeForAI.bind(SecurityUtils);
export const hasProblematicCharacters = SecurityUtils.hasProblematicCharacters.bind(SecurityUtils);
