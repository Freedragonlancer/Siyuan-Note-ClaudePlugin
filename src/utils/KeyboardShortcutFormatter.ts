/**
 * Cross-platform keyboard shortcut formatter
 * Converts macOS symbol format (⌃⇧Q) to platform-specific text format (Ctrl+Shift+Q on Windows/Linux)
 *
 * @example
 * // On Windows
 * KeyboardShortcutFormatter.format("⌃⇧Q")  // → "Ctrl+Shift+Q"
 *
 * // On macOS
 * KeyboardShortcutFormatter.format("⌃⇧Q")  // → "⌃⇧Q"
 */
export class KeyboardShortcutFormatter {
    /**
     * Detect if current platform is macOS
     * Uses both navigator (browser) and process (Node.js) for detection
     */
    private static isMac(): boolean {
        // Browser environment (SiYuan plugin runs in Electron)
        if (typeof navigator !== 'undefined') {
            return /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
        }

        // Node.js environment (fallback for build/test)
        if (typeof process !== 'undefined' && process.platform) {
            return process.platform === 'darwin';
        }

        // Default to non-Mac if detection fails (Windows has larger user base)
        return false;
    }

    /**
     * Convert macOS symbol format to current platform format
     *
     * @param macShortcut - macOS symbol format (e.g., "⌃⇧Q", "⌥⇧C")
     * @returns Platform-specific format
     *          - macOS: "⌃⇧Q" (unchanged)
     *          - Windows/Linux: "Ctrl+Shift+Q"
     *
     * @example
     * format("⌃⇧Q")   // Windows → "Ctrl+Shift+Q", macOS → "⌃⇧Q"
     * format("⌥⇧C")   // Windows → "Alt+Shift+C",  macOS → "⌥⇧C"
     * format("⌘S")    // Windows → "Cmd+S",        macOS → "⌘S"
     */
    static format(macShortcut: string): string {
        if (!macShortcut) {
            return '';
        }

        // macOS: keep original symbol format
        if (this.isMac()) {
            return macShortcut;
        }

        // Windows/Linux: convert symbols to text
        return macShortcut
            .replace(/⌃/g, 'Ctrl+')   // Control key
            .replace(/⇧/g, 'Shift+')  // Shift key
            .replace(/⌥/g, 'Alt+')    // Option/Alt key
            .replace(/⌘/g, 'Cmd+')    // Command key (rare on Windows, but support it)
            .replace(/\+\+/g, '+');   // Fix double + if any
    }

    /**
     * Convert text format to macOS symbol format (for saving to config)
     *
     * @param textShortcut - Text format (e.g., "Ctrl+Shift+Q")
     * @returns macOS symbol format (e.g., "⌃⇧Q")
     *
     * @example
     * toMacFormat("Ctrl+Shift+Q")  // → "⌃⇧Q"
     * toMacFormat("Alt+Shift+C")   // → "⌥⇧C"
     */
    static toMacFormat(textShortcut: string): string {
        if (!textShortcut) {
            return '';
        }

        return textShortcut
            .replace(/Ctrl\+/gi, '⌃')
            .replace(/Shift\+/gi, '⇧')
            .replace(/Alt\+/gi, '⌥')
            .replace(/Cmd\+/gi, '⌘');
    }

    /**
     * Get platform-friendly display text with both formats (for tooltips/help text)
     *
     * @param macShortcut - macOS symbol format
     * @returns Friendly display format
     *          - macOS: "⌃⇧Q"
     *          - Windows/Linux: "⌃⇧Q (Ctrl+Shift+Q)"
     *
     * @example
     * // On Windows
     * getFriendlyDisplay("⌃⇧Q")  // → "⌃⇧Q (Ctrl+Shift+Q)"
     *
     * // On macOS
     * getFriendlyDisplay("⌃⇧Q")  // → "⌃⇧Q"
     */
    static getFriendlyDisplay(macShortcut: string): string {
        if (!macShortcut) {
            return '';
        }

        // macOS: show symbol only
        if (this.isMac()) {
            return macShortcut;
        }

        // Windows/Linux: show both symbol and text
        const textFormat = this.format(macShortcut);

        // If conversion resulted in same string, show only once
        if (textFormat === macShortcut) {
            return macShortcut;
        }

        return `${macShortcut} (${textFormat})`;
    }

    /**
     * Get current platform name (for debugging)
     * @returns "macOS", "Windows", or "Linux"
     */
    static getPlatformName(): string {
        if (this.isMac()) {
            return 'macOS';
        }

        if (typeof process !== 'undefined' && process.platform) {
            return process.platform === 'win32' ? 'Windows' : 'Linux';
        }

        return 'Windows'; // Default assumption
    }
}
