/**
 * Unified Panel Helpers - Utility Functions Module
 *
 * Pure utility functions for UnifiedAIPanel.
 * Extracted as part of architectural refactoring (Task 2.1 Phase 3).
 *
 * @module UnifiedPanelHelpers
 * @see UnifiedAIPanel
 */

import type { TextSelection } from '../../editor/types';
import type { EditMessage } from '../unified-types';

/**
 * Utility class for UnifiedAIPanel helper functions
 */
export class UnifiedPanelHelpers {
    /**
     * Get short model name for display
     * Maps full model names to abbreviated versions for UI badges
     */
    static getShortModelName(fullModelName: string): string {
        if (!fullModelName) return '';

        // Map common model patterns to short names
        const patterns: [RegExp, string][] = [
            // Claude models
            [/claude-3-5-sonnet/, 'Sonnet 3.5'],
            [/claude-sonnet-4/, 'Sonnet 4'],
            [/claude-3-opus/, 'Opus 3'],
            [/claude-3-haiku/, 'Haiku 3'],
            [/claude-2/, 'Claude 2'],

            // OpenAI models - GPT-5.1 Series (Latest)
            [/gpt-5\.1-chat-latest/, 'GPT-5.1 Chat'],
            [/gpt-5\.1-codex-mini/, 'GPT-5.1 Codex Mini'],
            [/gpt-5\.1-codex/, 'GPT-5.1 Codex'],
            [/gpt-5\.1/, 'GPT-5.1'],
            [/gpt-5/, 'GPT-5'],

            // OpenAI models - GPT-4o Series
            [/gpt-4o-mini/, 'GPT-4o Mini'],
            [/gpt-4o/, 'GPT-4o'],
            [/gpt-4-turbo/, 'GPT-4 Turbo'],
            [/gpt-4/, 'GPT-4'],
            [/gpt-3\.5-turbo/, 'GPT-3.5'],

            // OpenAI o-Series Reasoning Models
            [/o4-mini/, 'o4 Mini'],
            [/o3-mini/, 'o3 Mini'],
            [/o3/, 'o3'],
            [/o1-preview/, 'o1 Preview'],
            [/o1-mini/, 'o1 Mini'],
            [/o1/, 'o1'],

            // Gemini models
            [/gemini-2\.5-pro/, '2.5 Pro'],
            [/gemini-2\.5-flash/, '2.5 Flash'],
            [/gemini-2\.0-flash/, '2.0 Flash'],
            [/gemini-1\.5-pro/, '1.5 Pro'],
            [/gemini-1\.5-flash/, '1.5 Flash'],

            // xAI models
            [/grok-2/, 'Grok 2'],
            [/grok-/, 'Grok'],

            // DeepSeek models
            [/deepseek-chat/, 'Chat'],
            [/deepseek-coder/, 'Coder'],

            // Kimi (Moonshot) models
            [/kimi-k2-0905/, 'K2 0905'],
            [/kimi-k2-0711/, 'K2 0711'],
            [/kimi-k2-thinking-turbo/, 'K2 Thinking Turbo'],
            [/kimi-k2-thinking/, 'K2 Thinking'],
            [/moonshot-v1-128k/, 'V1 128K'],
            [/moonshot-v1-32k/, 'V1 32K'],
            [/moonshot-v1-8k/, 'V1 8K']
        ];

        for (const [pattern, shortName] of patterns) {
            if (pattern.test(fullModelName)) {
                return shortName;
            }
        }

        // Fallback: return first 20 chars if no pattern matches
        return fullModelName.length > 20
            ? fullModelName.substring(0, 20) + '...'
            : fullModelName;
    }

    /**
     * Get status icon for queue items
     */
    static getQueueItemStatusIcon(status: TextSelection['status']): string {
        switch (status) {
            case 'pending': return '⏸';
            case 'processing': return '⏳';
            case 'completed': return '✓';
            case 'error': return '❌';
            case 'cancelled': return '⊘';
            default: return '?';
        }
    }

    /**
     * Get status text for edit messages
     */
    static getEditStatusText(status: EditMessage['status']): string {
        switch (status) {
            case 'queued': return '⏸ 队列中';
            case 'processing': return '⏳ 处理中';
            case 'completed': return '✓ 完成';
            case 'error': return '❌ 错误';
            case 'applied': return '✅ 已应用';
            case 'rejected': return '⊘ 已拒绝';
            default: return status;
        }
    }

    /**
     * Get provider badge colors by provider type
     */
    static getProviderBadgeColors(providerType: string): { bg: string; border: string } {
        const colors: Record<string, { bg: string; border: string }> = {
            'anthropic': { bg: 'rgba(99, 102, 241, 0.1)', border: 'rgba(99, 102, 241, 0.3)' },
            'openai': { bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.3)' },
            'gemini': { bg: 'rgba(251, 146, 60, 0.1)', border: 'rgba(251, 146, 60, 0.3)' },
            'xai': { bg: 'rgba(236, 72, 153, 0.1)', border: 'rgba(236, 72, 153, 0.3)' },
            'deepseek': { bg: 'rgba(6, 182, 212, 0.1)', border: 'rgba(6, 182, 212, 0.3)' },
            'moonshot': { bg: 'rgba(138, 43, 226, 0.1)', border: 'rgba(138, 43, 226, 0.3)' }
        };

        return colors[providerType] || colors['anthropic']; // Default to Claude color
    }

    /**
     * Truncate text to specified length with ellipsis
     */
    static truncate(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
}
