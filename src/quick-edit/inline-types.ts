/**
 * TypeScript interfaces for Inline Edit Mode
 * Real-time in-document AI text editing with side-by-side comparison
 */

import type { EditResult } from '@/editor/types';

/**
 * Inline Edit state machine
 */
export enum InlineEditState {
    /** No active inline edit */
    IDLE = 'idle',
    /** Waiting for user to input instruction */
    INPUT_INSTRUCTION = 'input_instruction',
    /** AI is processing the request */
    PROCESSING = 'processing',
    /** Streaming AI response */
    STREAMING = 'streaming',
    /** Showing comparison, waiting for user confirmation */
    REVIEWING = 'reviewing',
    /** Applying changes */
    APPLYING = 'applying',
    /** Error occurred */
    ERROR = 'error'
}

/**
 * Inline edit block data
 */
export interface InlineEditBlock {
    /** Unique block ID */
    id: string;

    /** SiYuan block ID where edit is happening (primary block, first of selected blocks) */
    blockId: string;

    /** All selected block IDs (for multi-block selection) */
    selectedBlockIds?: string[];

    /** Original text */
    originalText: string;

    /** AI suggested text (may be partial during streaming) */
    suggestedText: string;

    /** AI suggested text with indentation preserved (for final application) - FIX: Added to preserve indent */
    suggestedTextWithIndent?: string;

    /** Editing instruction */
    instruction: string;

    /** Current state */
    state: InlineEditState;

    /** DOM element of the inline comparison block */
    element: HTMLElement | null;

    /** Position info for restoration */
    position: {
        /** Start offset in block content */
        startOffset: number;
        /** End offset in block content */
        endOffset: number;
    };

    /** Timestamp */
    createdAt: number;
    updatedAt: number;

    /** Error message if state is ERROR */
    error?: string;

    /** Whether editing is locked */
    locked: boolean;

    /** PHASE 4: Marked text span element (Cursor-style inline marking) */
    markedSpan?: HTMLSpanElement | null;

    /** PHASE 4: Original selection range for restoration */
    originalRange?: Range | null;

    /** 缩进前缀字符串（空格或tab），用于给AI返回的每一行添加缩进 */
    indentPrefix?: string;

    /** 原始块类型信息（用于保留块格式） - FIX Issue #1 */
    originalBlockType?: string;       // data-type attribute (e.g., "h", "l", "p", "c")
    originalBlockSubtype?: string;    // data-subtype attribute (e.g., "h1", "h2", "u", "o")
}

/**
 * Inline edit block rendering options
 */
export interface InlineBlockRenderOptions {
    /** Show line-by-line accept checkboxes */
    showLineByLineAccept: boolean;

    /** Show progress indicator */
    showProgress: boolean;

    /** Enable typing animation for streaming */
    enableTypingAnimation: boolean;

    /** Hide original text block (Cursor-style: only show suggestion) */
    hideOriginal?: boolean;

    /** Custom colors */
    colors: {
        original: string;      // Background color for original text
        suggestion: string;    // Background color for suggested text
    };
}

/**
 * Instruction input popup position
 */
export interface PopupPosition {
    x: number;
    y: number;
    /** Whether to show above or below the trigger point */
    placement: 'above' | 'below';
    /** Optional: anchor element rect for smart positioning */
    anchorRect?: {
        top: number;
        bottom: number;
        left: number;
        right: number;
        width: number;
        height: number;
    };
}

/**
 * Inline edit settings (extends EditSettings)
 */
export interface InlineEditSettings {
    /** Enable inline edit mode */
    enabled: boolean;

    /** Show line-by-line accept option */
    showLineByLineAccept: boolean;

    /** Show progress indicator during streaming */
    showProgressIndicator: boolean;

    /** Enable typing animation effect */
    enableTypingAnimation: boolean;

    /** Auto-accept changes when AI completes (skip review) */
    autoAcceptOnComplete: boolean;

    /** Lock editing during AI processing */
    lockEditingDuringProcess: boolean;

    /** Original text background color */
    originalTextColor: string;

    /** Suggested text background color */
    suggestionTextColor: string;

    /** Animation speed (ms per character) */
    typingAnimationSpeed: number;
}

/**
 * Default inline edit settings
 */
export const DEFAULT_INLINE_EDIT_SETTINGS: InlineEditSettings = {
    enabled: true,
    showLineByLineAccept: false,
    showProgressIndicator: true,
    enableTypingAnimation: true,
    autoAcceptOnComplete: false,
    lockEditingDuringProcess: true,
    originalTextColor: 'rgba(239, 68, 68, 0.1)',   // Light red
    suggestionTextColor: 'rgba(34, 197, 94, 0.1)', // Light green
    typingAnimationSpeed: 20  // 20ms per character
};

/**
 * Text selection info for inline edit
 */
export interface InlineEditSelection {
    /** Selected text */
    text: string;

    /** Block element containing the selection */
    blockElement: HTMLElement;

    /** Block ID (primary block, first of selection) */
    blockId: string;

    /** All selected block IDs (for multi-block selection) - FIX: Added for consistency with block selection mode */
    selectedBlockIds?: string[];

    /** Selection range in the block */
    range: Range;

    /** Start and end offsets */
    startOffset: number;
    endOffset: number;

    /** Context before and after (optional) */
    contextBefore?: string;
    contextAfter?: string;
}

/**
 * Inline edit event types
 */
export enum InlineEditEventType {
    BLOCK_CREATED = 'block_created',
    INSTRUCTION_INPUT = 'instruction_input',
    PROCESSING_STARTED = 'processing_started',
    STREAMING_CHUNK = 'streaming_chunk',
    STREAMING_COMPLETE = 'streaming_complete',
    USER_ACCEPTED = 'user_accepted',
    USER_REJECTED = 'user_rejected',
    USER_RETRY = 'user_retry',
    BLOCK_REMOVED = 'block_removed',
    ERROR_OCCURRED = 'error_occurred'
}

/**
 * Inline edit event
 */
export interface InlineEditEvent {
    type: InlineEditEventType;
    block: InlineEditBlock;
    data?: any;
    timestamp: number;
}

/**
 * Callback function types
 */
export type InlineEditEventCallback = (event: InlineEditEvent) => void;
export type StreamingChunkCallback = (chunk: string, totalLength: number) => void;
export type InlineEditActionCallback = (blockId: string, action: 'accept' | 'reject' | 'retry') => void;

/**
 * Line-by-line diff data
 */
export interface LineDiff {
    /** Line number (0-indexed) */
    lineNumber: number;

    /** Original line text */
    original: string;

    /** Suggested line text */
    suggested: string;

    /** Diff type */
    type: 'equal' | 'delete' | 'insert' | 'modify';

    /** User's choice for this line */
    accepted: boolean | null;  // null = not decided yet
}
