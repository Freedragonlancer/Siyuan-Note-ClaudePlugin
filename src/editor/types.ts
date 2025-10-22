/**
 * TypeScript interfaces for AI-powered text editing feature
 */

/**
 * Represents a text selection for AI editing
 */
export interface TextSelection {
    /** Unique identifier for this selection */
    id: string;

    /** SiYuan block ID where the selection is located */
    blockId: string;

    /** Start line number in the block (0-indexed) */
    startLine: number;

    /** End line number in the block (0-indexed, inclusive) */
    endLine: number;

    /** The actual selected text */
    selectedText: string;

    /** Text context before the selection */
    contextBefore: string;

    /** Text context after the selection */
    contextAfter: string;

    /** Timestamp when selection was created */
    timestamp: number;

    /** Current processing status */
    status: 'pending' | 'processing' | 'completed' | 'error' | 'cancelled';

    /** AI-generated edit result */
    editResult?: EditResult;

    /** Error message if status is 'error' */
    errorMessage?: string;

    /** Custom instruction provided for this specific edit */
    customInstruction?: string;

    /** The entire block content (for reference) */
    fullBlockContent?: string;
}

/**
 * Result of AI text editing
 */
export interface EditResult {
    /** Original text */
    original: string;

    /** Modified text by AI */
    modified: string;

    /** Diff patches between original and modified */
    diff: DiffPatch[];

    /** Timestamp when edit was completed */
    completedAt: number;

    /** Token usage statistics */
    usage?: {
        inputTokens: number;
        outputTokens: number;
    };
}

/**
 * Represents a single diff patch
 */
export interface DiffPatch {
    /** Type of change */
    type: 'equal' | 'delete' | 'insert';

    /** The text value for this patch */
    value: string;

    /** Line number where this patch starts (optional) */
    lineNumber?: number;
}

/**
 * Settings for text editing feature
 */
export interface EditSettings {
    /** Number of lines to include before selection for context (default: 5) */
    contextLinesBefore: number;

    /** Number of lines to include after selection for context (default: 3) */
    contextLinesAfter: number;

    /** Default instruction template for AI edits */
    defaultInstruction: string;

    /** Maximum concurrent AI edit requests (default: 1) */
    maxConcurrentEdits: number;

    /** Whether to automatically process queue (default: true) */
    autoProcessQueue: boolean;

    /** Show diff view automatically after edit (default: true) */
    autoShowDiff: boolean;

    /** Preserve original formatting (default: true) */
    preserveFormatting: boolean;

    /** Maximum text length for a single edit (characters) */
    maxTextLength: number;

    /** Timeout for AI requests in milliseconds (default: 30000) */
    requestTimeout: number;

    /** Enable smart context extraction (default: true) */
    smartContextExtraction: boolean;

    /** Custom instruction templates for quick selection */
    customInstructions: string[];
}

/**
 * Preset custom instructions for quick selection
 */
export const PRESET_INSTRUCTIONS = [
    "润色优化文本",
    "翻译为英文",
    "翻译为中文",
    "简化表达，使其更易理解",
    "扩展详细说明，增加更多细节",
    "修正语法和拼写错误",
    "改为更正式的语气",
    "改为更口语化的表达",
    "重写为列表格式",
    "添加代码注释",
    "代码重构优化",
    "解释这段代码的功能",
];

/**
 * Default settings for text editing
 */
export const DEFAULT_EDIT_SETTINGS: EditSettings = {
    contextLinesBefore: 5,
    contextLinesAfter: 3,
    defaultInstruction: "请优化这段文本，使其更加清晰、准确和易读。保持原意不变。",
    maxConcurrentEdits: 1,
    autoProcessQueue: true,
    autoShowDiff: true,
    preserveFormatting: true,
    maxTextLength: 5000,
    requestTimeout: 30000,
    smartContextExtraction: true,
    customInstructions: PRESET_INSTRUCTIONS
};

/**
 * Event types for text editing feature
 */
export enum EditEventType {
    SELECTION_ADDED = 'selection_added',
    EDIT_STARTED = 'edit_started',
    EDIT_COMPLETED = 'edit_completed',
    EDIT_ERROR = 'edit_error',
    EDIT_APPLIED = 'edit_applied',
    EDIT_REJECTED = 'edit_rejected',
    QUEUE_PAUSED = 'queue_paused',
    QUEUE_RESUMED = 'queue_resumed',
    QUEUE_CLEARED = 'queue_cleared'
}

/**
 * Event emitted by the text editing system
 */
export interface EditEvent {
    type: EditEventType;
    selection?: TextSelection;
    error?: Error;
    timestamp: number;
}

/**
 * Callback function types
 */
export type EditEventCallback = (event: EditEvent) => void;
export type ProgressCallback = (progress: number, message: string) => void;

/**
 * Interface for managing text selections
 */
export interface ITextSelectionManager {
    addSelection(blockId: string, startLine: number, endLine: number, selectedText: string, instruction?: string): TextSelection;
    getSelection(id: string): TextSelection | undefined;
    getAllSelections(): TextSelection[];
    updateStatus(id: string, status: TextSelection['status'], errorMessage?: string): void;
    removeSelection(id: string): boolean;
    clearAll(): void;
}

/**
 * Interface for AI edit processing
 */
export interface IAIEditProcessor {
    processSelection(selection: TextSelection, instruction?: string): Promise<EditResult>;
    buildPrompt(selection: TextSelection, instruction: string): string;
    parseAIResponse(response: string, original: string): EditResult;
    cancelEdit(selectionId: string): void;
}

/**
 * Interface for diff rendering
 */
export interface IDiffRenderer {
    renderDiff(original: string, modified: string, container: HTMLElement): void;
    applyChanges(selection: TextSelection): Promise<boolean>;
    rejectChanges(selection: TextSelection): void;
    highlightDifferences(element: HTMLElement, patches: DiffPatch[]): void;
}

/**
 * Interface for edit queue management
 */
export interface IEditQueue {
    enqueue(selection: TextSelection): void;
    dequeue(): TextSelection | undefined;
    processNext(): Promise<void>;
    pauseQueue(): void;
    resumeQueue(): void;
    isProcessing(): boolean;
    isPaused(): boolean;
    getQueueSize(): number;
    clearQueue(): void;
}

/**
 * Block information from SiYuan
 */
export interface BlockInfo {
    id: string;
    content: string;
    type: string;
    parentId?: string;
    previousId?: string;
    nextId?: string;
}

/**
 * Selection range in editor
 */
export interface SelectionRange {
    startOffset: number;
    endOffset: number;
    startContainer: Node;
    endContainer: Node;
}