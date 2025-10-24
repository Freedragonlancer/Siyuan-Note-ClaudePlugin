/**
 * Claude API types and interfaces
 */

import type { EditSettings } from "../editor/types";

export interface ClaudeSettings {
    apiKey: string;
    baseURL: string;
    model: string;
    maxTokens: number;
    temperature: number;
    systemPrompt: string;
    appendedPrompt: string; // Prompt appended to end of each request

    // AI Text Editing settings
    editSettings?: EditSettings;
}

export interface Message {
    role: "user" | "assistant";
    content: string;
}

export interface StreamChunk {
    type: "content_block_delta" | "message_delta" | "message_stop";
    delta?: {
        type: string;
        text?: string;
    };
}

export type MessageCallback = (chunk: string) => void;
export type ErrorCallback = (error: Error) => void;
export type CompleteCallback = () => void;
