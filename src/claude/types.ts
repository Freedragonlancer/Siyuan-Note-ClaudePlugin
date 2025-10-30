/**
 * Claude API types and interfaces
 */

import type { EditSettings } from "../editor/types";
import type { FilterRule } from "../filter";

export interface ClaudeSettings {
    apiKey: string;
    baseURL: string;
    model: string;
    maxTokens: number;
    temperature: number;
    systemPrompt: string;
    appendedPrompt: string; // Prompt appended to end of each request

    // Quick Edit prompt template
    // Placeholders: {instruction} - user instruction, {original} - original text
    quickEditPromptTemplate?: string;

    // Response Filter Rules (global, applies to all requests)
    filterRules?: FilterRule[];

    // AI Request Logging
    enableRequestLogging?: boolean;        // 是否启用AI请求日志 (默认false)
    requestLogPath?: string;                // 日志保存路径 (用户自定义)
    requestLogIncludeResponse?: boolean;    // 是否记录响应内容 (默认true)

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
