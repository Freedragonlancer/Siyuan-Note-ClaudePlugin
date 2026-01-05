/**
 * UI Constants
 * Centralized location for UI-related constants to ensure single source of truth
 */

/**
 * Quick Edit Auto-Action Options
 * Used in settings panel and InstructionInputPopup
 */
export const QUICK_EDIT_AUTO_ACTIONS = [
    { value: 'preview', label: '预览确认（默认）', title: '显示预览，手动确认' },
    { value: 'replace', label: '自动替换原文', title: '完成后直接替换原文' },
    { value: 'insert', label: '自动插入到下方', title: '完成后插入到原文下方' },
] as const;

export type QuickEditAutoAction = typeof QUICK_EDIT_AUTO_ACTIONS[number]['value'];

/**
 * Reasoning Effort Options (for xAI Grok)
 * Used in provider settings
 */
export const REASONING_EFFORT_OPTIONS = [
    { value: 'low', label: 'Low (快速)', description: '快速响应' },
    { value: 'high', label: 'High (深度)', description: '深度推理' },
] as const;

export type ReasoningEffort = typeof REASONING_EFFORT_OPTIONS[number]['value'];

/**
 * Status Icons for queue/edit items
 * Used in EditPanel, QueueRenderer, etc.
 */
export const STATUS_ICONS = {
    pending: '⏸',
    processing: '⏳',
    completed: '✓',
    error: '❌',
    cancelled: '⊘',
    applied: '✅',
    rejected: '⊘',
} as const;

/**
 * Status Labels (Chinese)
 * Used in queue displays and status messages
 */
export const STATUS_LABELS = {
    pending: '待处理',
    queued: '队列中',
    processing: '处理中',
    completed: '完成',
    error: '错误',
    cancelled: '已取消',
    applied: '已应用',
    rejected: '已拒绝',
} as const;

/**
 * Default Preset Icon
 * Used when a preset doesn't have a custom icon
 */
export const DEFAULT_PRESET_ICON = '📝';

/**
 * Quick Edit Action Labels (Chinese)
 * Used in inline edit renderer and confirmation dialogs
 */
export const QUICK_EDIT_ACTION_LABELS = {
    preview: '预览',
    replace: '替换',
    insert: '插入',
    accept: '接受',
    reject: '拒绝',
    retry: '重试',
} as const;

/**
 * Provider Badge Colors
 * Used in UI for visual distinction of providers
 */
export const PROVIDER_BADGE_COLORS = {
    anthropic: { bg: '#F5E6D3', border: '#D4A574' },
    openai: { bg: '#E8F5E9', border: '#81C784' },
    gemini: { bg: '#E3F2FD', border: '#64B5F6' },
    xai: { bg: '#FCE4EC', border: '#F48FB1' },
    deepseek: { bg: '#E8EAF6', border: '#9FA8DA' },
    moonshot: { bg: '#FFF3E0', border: '#FFB74D' },
    custom: { bg: '#F5F5F5', border: '#BDBDBD' },
} as const;
