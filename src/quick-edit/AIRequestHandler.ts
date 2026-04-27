/**
 * AI Request Handler
 * Handles AI request processing for Quick Edit
 *
 * Created v0.18.0: Extracted from QuickEditManager
 * v0.19.0: Added multimodal image support
 */

import { showMessage } from 'siyuan';
import type { InlineEditBlock, InlineEditState } from './inline-types';
import type { InlineEditRenderer } from './InlineEditRenderer';
import type { PromptBuilder } from './PromptBuilder';
import type { ClaudeClient } from '@/claude';
import type { ConfigManager } from '@/settings/ConfigManager';
import type { EditSettings } from '@/editor/types';
import type { SelectionHandler } from './SelectionHandler';
import type { ImageContent, Message, ContentBlock } from '@/claude/types';
import { createMultimodalMessage } from '@/claude/types';
import { Logger } from '@/utils/Logger';

/**
 * Auto action type for Quick Edit
 */
export type QuickEditAutoAction = 'preview' | 'replace' | 'insert';

/**
 * Dependencies required by AIRequestHandler
 */
export interface AIRequestHandlerDependencies {
    /** Renderer for inline edit blocks */
    renderer: InlineEditRenderer;
    /** Prompt builder for constructing AI prompts */
    promptBuilder: PromptBuilder;
    /** Claude client for AI requests */
    claudeClient: ClaudeClient;
    /** Config manager for settings */
    configManager: ConfigManager;
    /** Edit settings */
    settings: EditSettings;
    /** Selection handler for image extraction (v0.19.0) */
    selectionHandler?: SelectionHandler;
    /** Get current preset ID */
    getCurrentPresetId: () => Promise<string | null>;
    /** Set processing flag */
    setProcessing: (processing: boolean) => void;
    /** Set active request block ID */
    setActiveRequestBlockId: (blockId: string | null) => void;
    /** Handle accept action (for auto-action) */
    onAccept: (blockId: string) => Promise<void>;
    /** Handle insert action (for auto-action) */
    onInsert: (blockId: string) => Promise<void>;
}

/**
 * AI Request Handler
 * Processes Quick Edit requests with AI streaming
 */
export class AIRequestHandler {
    private deps: AIRequestHandlerDependencies;
    private logger = Logger.createScoped('AIRequest');

    constructor(dependencies: AIRequestHandlerDependencies) {
        this.deps = dependencies;
    }

    /**
     * Process inline edit with AI
     * @param block The inline edit block to process
     */
    async processEdit(block: InlineEditBlock): Promise<void> {
        if (!block.element) return;

        try {
            this.deps.renderer.showLoading(block.element);

            // Start streaming mode
            this.deps.renderer.startStreaming(
                block.element,
                this.deps.settings.quickEditEnableTypingAnimation !== false
            );

            block.state = 'streaming' as InlineEditState;

            // Use array accumulation for O(n) performance
            let fullResponseChunks: string[] = [];
            let fullResponseWithIndentChunks: string[] = [];
            let chunkCount = 0;
            let totalChars = 0;

            // Build prompt using PromptBuilder
            const currentPresetId = await this.deps.getCurrentPresetId();
            const promptResult = await this.deps.promptBuilder.buildQuickEditPrompt({
                instruction: block.instruction,
                originalText: block.originalText,
                blockIds: block.selectedBlockIds || [],
                presetId: currentPresetId || undefined
            });

            const { userPrompt, systemPrompt: presetSystemPrompt, filterRules } = promptResult;

            // v0.19.0: Extract images from selected blocks for multimodal support
            let extractedImages: ImageContent[] = [];
            if (this.deps.selectionHandler && block.selectedBlockIds && block.selectedBlockIds.length > 0) {
                try {
                    // Get block elements from DOM
                    const blockElements: HTMLElement[] = [];
                    for (const blockId of block.selectedBlockIds) {
                        const element = document.querySelector(`.protyle-wysiwyg [data-node-id="${blockId}"]`) as HTMLElement;
                        if (element) {
                            blockElements.push(element);
                        }
                    }

                    // Extract images from selected blocks
                    if (blockElements.length > 0 && this.deps.selectionHandler.hasImagesInBlocks(blockElements)) {
                        extractedImages = await this.deps.selectionHandler.extractImagesFromBlocks(blockElements);
                        this.logger.info(`Extracted ${extractedImages.length} images from selected blocks`);
                    }
                } catch (error) {
                    this.logger.warn('Failed to extract images from blocks:', error);
                    // Continue without images
                }
            }

            // Build message - multimodal if images present, otherwise text-only
            let messages: Message[];
            if (extractedImages.length > 0) {
                // Create multimodal message with images + text
                messages = [createMultimodalMessage('user', userPrompt, extractedImages)];
                this.logger.debug(`Sending multimodal request with ${extractedImages.length} images`);
            } else {
                // Text-only message
                messages = [{ role: 'user', content: userPrompt }];
            }

            // Diagnostic logging
            this.logger.debug(
                `Request params - UserPrompt: ${userPrompt.length} chars, ` +
                `FilterRules: ${filterRules.length}, ` +
                `SystemPrompt: ${presetSystemPrompt ? 'preset' : 'global'}, ` +
                `Preset: ${promptResult.presetName || 'none'}, ` +
                `Images: ${extractedImages.length}`
            );

            await this.deps.claudeClient.sendMessage(
                messages,
                // onMessage callback
                (chunk) => {
                    const result = this.handleStreamChunk(
                        chunk,
                        block,
                        fullResponseChunks,
                        fullResponseWithIndentChunks,
                        chunkCount
                    );
                    // Update counters based on result
                    chunkCount = result.chunkCount;
                    totalChars = result.totalChars;
                },
                // onError callback
                (error) => {
                    this.handleError(block, error);
                },
                // onComplete callback
                () => {
                    this.handleComplete(block, fullResponseChunks, fullResponseWithIndentChunks, totalChars);
                },
                "QuickEdit",         // feature
                filterRules,         // filterRules
                presetSystemPrompt,  // systemPrompt
                undefined,           // onGeneratedImages
                {
                    thinkingMode: block.thinkingSettings?.enabled,
                    thinkingBudget: block.thinkingSettings?.budget,
                    reasoningEffort: block.thinkingSettings?.effort,
                }
            );

        } catch (error) {
            // Clean up processing state
            this.deps.setProcessing(false);
            this.deps.setActiveRequestBlockId(null);

            block.state = 'error' as InlineEditState;
            block.error = error instanceof Error ? error.message : String(error);

            if (block.element) {
                this.deps.renderer.showError(block.element, block.error);
            }

            console.error('[AIRequestHandler] Processing error:', error);
        }
    }

    /**
     * Handle a streaming chunk
     * @returns Updated counters for chunkCount and totalChars
     */
    private handleStreamChunk(
        chunk: string,
        block: InlineEditBlock,
        fullResponseChunks: string[],
        fullResponseWithIndentChunks: string[],
        chunkCount: number
    ): { chunkCount: number; totalChars: number } {
        // Check for filtered replace marker
        const FILTER_MARKER = '[FILTERED_REPLACE]';
        if (chunk.startsWith(FILTER_MARKER)) {
            const filteredContent = chunk.substring(FILTER_MARKER.length);

            // Clear and replace content
            fullResponseChunks.length = 0;
            fullResponseChunks.push(filteredContent);

            // Process indent
            let processedContent = filteredContent;
            if (block.indentPrefix && block.indentPrefix.length > 0) {
                processedContent = filteredContent.replace(/\n(?!$)/g, '\n' + block.indentPrefix);
            }
            fullResponseWithIndentChunks.length = 0;
            fullResponseWithIndentChunks.push(processedContent);

            // Update block
            block.suggestedText = filteredContent;

            // Replace UI content
            if (block.element) {
                this.deps.renderer.replaceStreamingContent(block.element, processedContent);
            }

            // Reset counters for filtered replace
            return { chunkCount: 1, totalChars: filteredContent.length };
        }

        // Normal streaming chunk
        fullResponseChunks.push(chunk);

        // Add indent prefix to each line (except first)
        let processedChunk = chunk;
        if (block.indentPrefix && block.indentPrefix.length > 0) {
            processedChunk = chunk.replace(/\n(?!$)/g, '\n' + block.indentPrefix);
        }

        fullResponseWithIndentChunks.push(processedChunk);

        // Calculate new counters
        const newChunkCount = chunkCount + 1;
        const newTotalChars = fullResponseChunks.reduce((acc, c) => acc + c.length, 0);

        // Update suggestedText periodically
        if (newChunkCount % 10 === 0) {
            block.suggestedText = fullResponseChunks.join('');
        }

        // Append to UI
        if (block.element) {
            this.deps.renderer.appendStreamingChunk(
                block.element,
                processedChunk,
                this.deps.settings.quickEditEnableTypingAnimation !== false,
                20
            );
        }

        return { chunkCount: newChunkCount, totalChars: newTotalChars };
    }

    /**
     * Handle error during AI request
     */
    private handleError(block: InlineEditBlock, error: Error): void {
        block.state = 'error' as InlineEditState;
        block.error = error.message;

        // Clean up processing state
        this.deps.setProcessing(false);
        this.deps.setActiveRequestBlockId(null);

        // Remove red marking from original blocks on error
        if (block.selectedBlockIds && block.selectedBlockIds.length > 0) {
            const selector = block.selectedBlockIds.map(id => `[data-node-id="${id}"]`).join(',');
            const blockElements = document.querySelectorAll(selector);
            blockElements.forEach(el => el.classList.remove('quick-edit-original-block'));
        }

        if (block.element) {
            this.deps.renderer.showError(block.element, error.message);
            // Show retry/reject buttons, hide cancel button
            this.deps.renderer.showReviewButtons(block.element);
        }

        console.error('[AIRequestHandler] Error:', error);
        showMessage(`❌ 快速编辑失败: ${error.message}`, 3000, 'error');
    }

    /**
     * Handle completion of AI request
     */
    private handleComplete(
        block: InlineEditBlock,
        fullResponseChunks: string[],
        fullResponseWithIndentChunks: string[],
        totalChars: number
    ): void {
        block.state = 'reviewing' as InlineEditState;
        block.updatedAt = Date.now();

        // Join all chunks once at the end (O(n) instead of O(n²))
        const fullResponse = fullResponseChunks.join('');
        const fullResponseWithIndent = fullResponseWithIndentChunks.join('');

        // Validate response length
        if (fullResponse.length !== totalChars) {
            console.error(
                `[AIRequestHandler] Response length mismatch: expected ${totalChars}, got ${fullResponse.length}`
            );
        }

        // Validate DOM text
        if (block.element) {
            const suggestionContent = block.element.querySelector('[data-content-type="suggestion"]') as HTMLElement;
            const domText = suggestionContent?.textContent || '';

            if (domText.length === 0) {
                console.error('[AIRequestHandler] CRITICAL: DOM text is empty!');
            } else {
                const diff = Math.abs(domText.length - fullResponseWithIndent.length);
                if (diff > 2) {
                    console.error(
                        `[AIRequestHandler] DOM text mismatch: DOM=${domText.length}, ` +
                        `Expected=${fullResponseWithIndent.length}, Diff=${diff}`
                    );
                }
            }

            // Check auto action setting
            const currentProfile = this.deps.configManager.getActiveProfile();
            const autoAction = (currentProfile?.settings?.editSettings?.quickEditAutoAction || 'preview') as QuickEditAutoAction;

            if (autoAction === 'preview') {
                // Default: show review buttons
                this.deps.renderer.completeStreaming(block.element);
            } else {
                // Auto mode: show hint, then auto-apply
                this.deps.renderer.completeStreamingAutoMode(block.element, autoAction);

                // Delay to let user see the result, then auto-apply
                setTimeout(() => {
                    if (autoAction === 'replace') {
                        this.deps.onAccept(block.id);
                    } else if (autoAction === 'insert') {
                        this.deps.onInsert(block.id);
                    }
                }, 500);
            }
        }

        // Save final joined responses
        block.suggestedText = fullResponse;
        block.suggestedTextWithIndent = fullResponseWithIndent;

        // Clean up processing state
        this.deps.setProcessing(false);
        this.deps.setActiveRequestBlockId(null);
    }
}
