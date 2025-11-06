/**
 * Prompt Builder
 * Constructs AI prompts from templates and context
 */

import type { PromptTemplate } from '@/settings/config-types';
import type { Message } from '@/claude/types';
import { ContextExtractor } from './ContextExtractor';

export interface PromptBuildOptions {
    /** User instruction */
    instruction: string;
    /** Original selected text */
    originalText: string;
    /** Block ID for context extraction */
    blockId: string;
    /** Block type (e.g., 'NodeParagraph', 'NodeHeading') */
    blockType?: string;
    /** Block subtype (e.g., 'h1', 'h2', 'p') */
    blockSubtype?: string;
    /** Additional context */
    additionalContext?: string;
}

export interface BuiltPrompt {
    /** System prompt */
    systemPrompt: string;
    /** Messages for AI */
    messages: Message[];
    /** Original instruction */
    instruction: string;
}

export class PromptBuilder {
    private contextExtractor: ContextExtractor;

    constructor(contextExtractor: ContextExtractor) {
        this.contextExtractor = contextExtractor;
    }

    /**
     * Build prompt from template and options
     * @param template Prompt template (preset)
     * @param options Build options
     * @returns Complete prompt ready for AI
     */
    async buildPrompt(template: PromptTemplate, options: PromptBuildOptions): Promise<BuiltPrompt> {
        // Get system prompt from template
        const systemPrompt = template.systemPrompt || '';

        // Build edit instruction from template
        let editInstruction = template.editInstruction || this.getDefaultEditInstruction();

        // Replace placeholders in edit instruction
        editInstruction = await this.replacePlaceholders(editInstruction, options);

        // Build user message
        const userMessage: Message = {
            role: 'user',
            content: editInstruction
        };

        return {
            systemPrompt,
            messages: [userMessage],
            instruction: options.instruction
        };
    }

    /**
     * Replace placeholders in template
     * Supports: {instruction}, {original}, {above=N}, {below=N}, {above_blocks=N}, {below_blocks=N}
     */
    private async replacePlaceholders(
        template: string,
        options: PromptBuildOptions
    ): Promise<string> {
        let result = template;

        // Replace {instruction}
        result = result.replace(/\{instruction\}/g, options.instruction);

        // Replace {original}
        result = result.replace(/\{original\}/g, options.originalText);

        // Extract context if needed
        if (result.includes('{above') || result.includes('{below')) {
            const context = await this.contextExtractor.extractContext(
                result,
                options.blockId
            );
            result = context.processedInstruction;
        }

        // Add additional context if provided
        if (options.additionalContext) {
            result += `\n\nAdditional Context:\n${options.additionalContext}`;
        }

        return result;
    }

    /**
     * Get default edit instruction template
     */
    private getDefaultEditInstruction(): string {
        return `Please help me edit the following text according to this instruction: {instruction}

Original text:
{original}

Please provide only the edited text without explanations.`;
    }

    /**
     * Build prompt for selection Q&A (chat mode)
     * @param template Prompt template
     * @param selectedText Selected text
     * @param userQuestion User's question
     * @returns Complete prompt
     */
    async buildSelectionQAPrompt(
        template: PromptTemplate,
        selectedText: string,
        userQuestion: string
    ): Promise<BuiltPrompt> {
        const systemPrompt = template.systemPrompt || '';

        // Use selection Q&A template if provided, otherwise use default
        let qaTemplate = template.selectionQATemplate || this.getDefaultQATemplate();

        // Replace placeholders
        qaTemplate = qaTemplate.replace(/\{selection\}/g, selectedText);
        qaTemplate = qaTemplate.replace(/\{question\}/g, userQuestion);

        const userMessage: Message = {
            role: 'user',
            content: qaTemplate
        };

        return {
            systemPrompt,
            messages: [userMessage],
            instruction: userQuestion
        };
    }

    /**
     * Get default Q&A template
     */
    private getDefaultQATemplate(): string {
        return `I have selected the following text:

{selection}

My question: {question}

Please answer my question based on the selected text.`;
    }

    /**
     * Append additional context to existing prompt
     * @param prompt Existing prompt
     * @param context Context to append
     * @returns Updated prompt
     */
    appendContext(prompt: BuiltPrompt, context: string): BuiltPrompt {
        const lastMessage = prompt.messages[prompt.messages.length - 1];
        if (lastMessage && lastMessage.role === 'user') {
            lastMessage.content += `\n\n${context}`;
        }

        return prompt;
    }

    /**
     * Add formatting hint to prompt based on block type
     * @param prompt Existing prompt
     * @param blockType Block type
     * @param blockSubtype Block subtype
     * @returns Updated prompt
     */
    addFormattingHint(
        prompt: BuiltPrompt,
        blockType?: string,
        blockSubtype?: string
    ): BuiltPrompt {
        if (!blockType || !blockSubtype) {
            return prompt;
        }

        let hint = '';

        if (blockType === 'NodeHeading') {
            hint = `Note: The original text is a ${blockSubtype.toUpperCase()} heading. Please maintain the heading format.`;
        } else if (blockType === 'NodeListItem') {
            hint = 'Note: The original text is a list item. Please maintain the list format.';
        } else if (blockType === 'NodeBlockquote') {
            hint = 'Note: The original text is a blockquote. Please maintain the blockquote format.';
        } else if (blockType === 'NodeCodeBlock') {
            hint = 'Note: The original text is a code block. Please maintain the code formatting.';
        }

        if (hint) {
            return this.appendContext(prompt, hint);
        }

        return prompt;
    }
}
