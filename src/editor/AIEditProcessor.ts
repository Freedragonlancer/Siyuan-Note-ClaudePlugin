/**
 * AI Edit Processor - Handles AI-powered text editing requests
 */

import { ClaudeClient } from '../claude';
import type {
    TextSelection,
    EditResult,
    DiffPatch,
    IAIEditProcessor
} from './types';
import * as DiffMatchPatch from 'diff-match-patch';

export class AIEditProcessor implements IAIEditProcessor {
    private client: ClaudeClient;
    private dmp: DiffMatchPatch.diff_match_patch;
    private activeRequests: Map<string, AbortController> = new Map();

    constructor(claudeClient: ClaudeClient) {
        this.client = claudeClient;
        this.dmp = new DiffMatchPatch.diff_match_patch();
    }

    /**
     * Process a text selection with AI
     */
    async processSelection(
        selection: TextSelection,
        instruction?: string
    ): Promise<EditResult> {
        console.log(`[AIEdit] Processing selection ${selection.id}`);

        try {
            // Build the prompt with context
            const prompt = this.buildPrompt(
                selection,
                instruction || "请优化以下文本，保持格式一致"
            );

            // Create abort controller for this request
            const abortController = new AbortController();
            this.activeRequests.set(selection.id, abortController);

            // Call Claude API (using simple non-streaming for now)
            const startTime = Date.now();
            const response = await this.client.sendMessageSimple([
                { role: "user", content: prompt }
            ]);
            const processingTime = Date.now() - startTime;

            console.log(`[AIEdit] AI response received in ${processingTime}ms for selection ${selection.id}`);

            // Parse the response
            const editResult = this.parseAIResponse(response, selection.selectedText);

            // Cleanup
            this.activeRequests.delete(selection.id);

            return editResult;

        } catch (error) {
            this.activeRequests.delete(selection.id);
            console.error(`[AIEdit] Error processing selection ${selection.id}:`, error);
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    /**
     * Build a formatted prompt for AI with context tags
     */
    buildPrompt(selection: TextSelection, instruction: string): string {
        const parts: string[] = [];

        // Add context before if available
        if (selection.contextBefore && selection.contextBefore.trim()) {
            parts.push('<上文信息>');
            parts.push(selection.contextBefore);
            parts.push('</上文信息>');
            parts.push('');
        }

        // Add the text to edit
        parts.push('<待编辑文本>');
        parts.push(selection.selectedText);
        parts.push('</待编辑文本>');
        parts.push('');

        // Add context after if available
        if (selection.contextAfter && selection.contextAfter.trim()) {
            parts.push('<下文信息>');
            parts.push(selection.contextAfter);
            parts.push('</下文信息>');
            parts.push('');
        }

        // Add editing instruction
        parts.push('<编辑指令>');
        parts.push(instruction);
        parts.push('只输出修改后的「待编辑文本」部分的内容，保持格式一致，不要输出上文和下文。');
        parts.push('</编辑指令>');

        const finalPrompt = parts.join('\n');

        console.log(`[AIEdit] Built prompt for selection ${selection.id}:`, {
            hasContextBefore: !!selection.contextBefore,
            hasContextAfter: !!selection.contextAfter,
            textLength: selection.selectedText.length,
            instruction
        });

        return finalPrompt;
    }

    /**
     * Parse AI response and generate diff
     */
    parseAIResponse(response: string, original: string): EditResult {
        // Clean up the response
        let modified = response.trim();

        // Remove markdown code blocks if present
        modified = modified.replace(/^```[\w]*\n/, '').replace(/\n```$/, '');

        // Remove any XML-style tags that might be in the response
        modified = modified.replace(/<[^>]+>/g, '');

        modified = modified.trim();

        // Generate diff patches using diff-match-patch
        const diffs = this.dmp.diff_main(original, modified);
        this.dmp.diff_cleanupSemantic(diffs);

        // Convert to our DiffPatch format
        const patches: DiffPatch[] = diffs.map(([operation, text]) => {
            let type: 'equal' | 'delete' | 'insert';
            if (operation === DiffMatchPatch.DIFF_EQUAL) {
                type = 'equal';
            } else if (operation === DiffMatchPatch.DIFF_DELETE) {
                type = 'delete';
            } else {
                type = 'insert';
            }

            return {
                type,
                value: text
            };
        });

        console.log(`[AIEdit] Generated ${patches.length} diff patches`);

        return {
            original,
            modified,
            diff: patches,
            completedAt: Date.now()
        };
    }

    /**
     * Cancel an ongoing edit request
     */
    cancelEdit(selectionId: string): void {
        const controller = this.activeRequests.get(selectionId);
        if (controller) {
            controller.abort();
            this.activeRequests.delete(selectionId);
            console.log(`[AIEdit] Cancelled edit request for selection ${selectionId}`);
        }
    }

    /**
     * Check if a selection is being processed
     */
    isProcessing(selectionId: string): boolean {
        return this.activeRequests.has(selectionId);
    }

    /**
     * Get number of active requests
     */
    getActiveRequestCount(): number {
        return this.activeRequests.size;
    }

    /**
     * Cancel all active requests
     */
    cancelAll(): void {
        const count = this.activeRequests.size;
        this.activeRequests.forEach(controller => controller.abort());
        this.activeRequests.clear();
        console.log(`[AIEdit] Cancelled ${count} active requests`);
    }
}
