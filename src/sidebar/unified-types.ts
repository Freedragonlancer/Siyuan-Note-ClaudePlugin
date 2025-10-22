/**
 * Unified Message Types for Combined Chat and Edit Panel
 *
 * This module defines the type system for a unified AI panel that handles
 * both conversational chat and AI-powered text editing in a single interface.
 */

import type { EditResult, TextSelection } from "../editor/types";

/**
 * Base message interface with common properties
 */
export interface BaseMessage {
    /** Unique identifier for the message */
    id: string;

    /** Timestamp when the message was created */
    timestamp: number;
}

/**
 * Chat message for conversational interactions
 */
export interface ChatMessage extends BaseMessage {
    type: 'chat';

    /** Role of the message sender */
    role: 'user' | 'assistant';

    /** Text content of the message */
    content: string;

    /** Whether this message is currently being streamed */
    streaming?: boolean;
}

/**
 * Edit message for AI text editing operations
 */
export interface EditMessage extends BaseMessage {
    type: 'edit';

    /** The text selection being edited */
    selection: TextSelection;

    /** Current status of the edit operation */
    status: 'queued' | 'processing' | 'completed' | 'error' | 'applied' | 'rejected';

    /** Edit result when processing is complete */
    result?: EditResult;

    /** Error message if status is 'error' */
    errorMessage?: string;

    /** Custom instruction used for this edit */
    instruction?: string;
}

/**
 * Union type for all message types in the unified panel
 */
export type UnifiedMessage = ChatMessage | EditMessage;

/**
 * Type guard to check if a message is a chat message
 */
export function isChatMessage(message: UnifiedMessage): message is ChatMessage {
    return message.type === 'chat';
}

/**
 * Type guard to check if a message is an edit message
 */
export function isEditMessage(message: UnifiedMessage): message is EditMessage {
    return message.type === 'edit';
}

/**
 * State of the edit queue region (collapsible area)
 */
export interface EditQueueState {
    /** Whether the queue details are expanded */
    expanded: boolean;

    /** Number of items in the queue */
    queueSize: number;

    /** Number of items currently processing */
    processingCount: number;
}

/**
 * Configuration for the unified panel
 */
export interface UnifiedPanelConfig {
    /** Whether to show the edit queue region by default */
    showEditQueue: boolean;

    /** Whether to auto-expand queue when new edit is added */
    autoExpandQueue: boolean;

    /** Maximum number of messages to keep in history */
    maxHistorySize: number;

    /** Whether to persist chat history to localStorage */
    persistChatHistory: boolean;
}

/**
 * Default configuration for unified panel
 */
export const DEFAULT_UNIFIED_PANEL_CONFIG: UnifiedPanelConfig = {
    showEditQueue: true,
    autoExpandQueue: true,
    maxHistorySize: 100,
    persistChatHistory: true
};
