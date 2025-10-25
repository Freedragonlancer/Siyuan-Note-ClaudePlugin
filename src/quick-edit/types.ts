/**
 * TypeScript interfaces for Quick Edit Mode
 * Lightweight, instant AI text editing via floating dialog
 */

import type { EditResult, DiffPatch } from '@/editor/types';

/**
 * Quick Edit Dialog state machine
 */
export enum QuickEditState {
    /** Dialog is closed or idle */
    IDLE = 'idle',
    /** User is editing/inputting text and instruction */
    EDITING = 'editing',
    /** AI is processing the request */
    PROCESSING = 'processing',
    /** Showing diff review (waiting for user action) */
    REVIEWING = 'reviewing',
    /** Applying changes to editor */
    APPLYING = 'applying',
    /** Error occurred */
    ERROR = 'error'
}

/**
 * Quick Edit Request data
 */
export interface QuickEditRequest {
    /** Unique request ID */
    id: string;

    /** Text to be edited */
    text: string;

    /** Editing instruction (from preset or custom input) */
    instruction: string;

    /** Whether to include context */
    includeContext: boolean;

    /** Context before text (if enabled) */
    contextBefore?: string;

    /** Context after text (if enabled) */
    contextAfter?: string;

    /** SiYuan block ID (if editing selected text in editor) */
    blockId?: string;

    /** Selection range in block (if applicable) */
    selectionRange?: {
        startOffset: number;
        endOffset: number;
    };

    /** Timestamp when request was created */
    timestamp: number;
}

/**
 * Quick Edit Response data
 */
export interface QuickEditResponse {
    /** Request ID this response corresponds to */
    requestId: string;

    /** Edit result from AI */
    result: EditResult;

    /** Timestamp when response was received */
    timestamp: number;
}

/**
 * Quick Edit Settings (extends EditSettings)
 */
export interface QuickEditSettings {
    /** Whether quick edit mode is enabled */
    enabled: boolean;

    /** Hotkey for triggering quick edit dialog (default: Ctrl+Shift+Q) */
    hotkey: string;

    /** Default instruction to use (from customInstructions) */
    defaultInstruction: string;

    /** Whether to show context by default */
    showContextByDefault: boolean;

    /** Dialog width in pixels */
    dialogWidth: number;

    /** Dialog max height in pixels */
    dialogMaxHeight: number;

    /** Show loading animation during processing */
    showLoadingAnimation: boolean;

    /** Auto-close dialog after applying edit */
    autoCloseAfterApply: boolean;

    /** Show keyboard shortcuts hint in dialog */
    showKeyboardHints: boolean;
}

/**
 * Default Quick Edit Settings
 */
export const DEFAULT_QUICK_EDIT_SETTINGS: QuickEditSettings = {
    enabled: true,
    hotkey: 'Ctrl+Shift+Q',
    defaultInstruction: '请优化这段文本，使其更加清晰、准确和易读。保持原意不变。',
    showContextByDefault: true,
    dialogWidth: 600,
    dialogMaxHeight: 700,
    showLoadingAnimation: true,
    autoCloseAfterApply: true,
    showKeyboardHints: true
};

/**
 * Quick Edit Dialog position
 */
export interface DialogPosition {
    /** X coordinate (pixels from left) */
    x: number;

    /** Y coordinate (pixels from top) */
    y: number;

    /** Whether position was adjusted to fit viewport */
    adjusted: boolean;
}

/**
 * Quick Edit Event types
 */
export enum QuickEditEventType {
    DIALOG_OPENED = 'dialog_opened',
    DIALOG_CLOSED = 'dialog_closed',
    REQUEST_SENT = 'request_sent',
    RESPONSE_RECEIVED = 'response_received',
    EDIT_APPLIED = 'edit_applied',
    EDIT_REJECTED = 'edit_rejected',
    RETRY_REQUESTED = 'retry_requested',
    ERROR_OCCURRED = 'error_occurred'
}

/**
 * Quick Edit Event
 */
export interface QuickEditEvent {
    type: QuickEditEventType;
    request?: QuickEditRequest;
    response?: QuickEditResponse;
    error?: Error;
    timestamp: number;
}

/**
 * Callback function types
 */
export type QuickEditEventCallback = (event: QuickEditEvent) => void;
export type StateChangeCallback = (oldState: QuickEditState, newState: QuickEditState) => void;
