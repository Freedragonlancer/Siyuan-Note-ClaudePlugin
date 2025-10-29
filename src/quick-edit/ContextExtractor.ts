/**
 * ContextExtractor - 上下文提取和占位符解析引擎
 *
 * 支持的占位符：
 * - {above=x} - 获取选中内容之前的x行文本
 * - {below=x} - 获取选中内容之后的x行文本
 * - {above_blocks=x} - 获取选中块之前的x个SiYuan块
 * - {below_blocks=x} - 获取选中块之后的x个块
 */

import { EditorHelper } from '../editor/EditorHelper';

/**
 * 占位符类型
 */
export enum PlaceholderType {
    ABOVE_LINES = 'above',
    BELOW_LINES = 'below',
    ABOVE_BLOCKS = 'above_blocks',
    BELOW_BLOCKS = 'below_blocks'
}

/**
 * 解析后的占位符信息
 */
export interface ParsedPlaceholder {
    /** 原始占位符字符串 */
    original: string;
    /** 占位符类型 */
    type: PlaceholderType;
    /** 提取的数量 */
    count: number;
    /** 在模板中的位置 */
    startIndex: number;
    /** 占位符长度 */
    length: number;
}

/**
 * 上下文信息
 */
export interface ContextInfo {
    /** 上文内容 */
    aboveContent: string;
    /** 下文内容 */
    belowContent: string;
    /** 上文行数/块数 */
    aboveCount: number;
    /** 下文行数/块数 */
    belowCount: number;
    /** 是否为块模式 */
    isBlockMode: boolean;
}

/**
 * 占位符解析和上下文提取类
 */
export class ContextExtractor {
    private editorHelper: EditorHelper;

    // 占位符正则表达式 (不带 g flag，避免状态问题)
    private static readonly PLACEHOLDER_REGEX = /\{(above|below|above_blocks|below_blocks)=(\d+)\}/;

    constructor(editorHelper: EditorHelper) {
        this.editorHelper = editorHelper;
    }

    /**
     * 解析模板中的所有占位符
     * @param template 提示词模板
     * @returns 解析后的占位符数组
     */
    public parsePlaceholders(template: string): ParsedPlaceholder[] {
        const placeholders: ParsedPlaceholder[] = [];
        // 创建带 g flag 的正则用于全局匹配（每次调用创建新实例，避免状态问题）
        const regex = new RegExp(ContextExtractor.PLACEHOLDER_REGEX.source, 'g');
        let match: RegExpExecArray | null;

        while ((match = regex.exec(template)) !== null) {
            const [original, typeName, countStr] = match;
            placeholders.push({
                original,
                type: typeName as PlaceholderType,
                count: parseInt(countStr, 10),
                startIndex: match.index,
                length: original.length
            });
        }

        return placeholders;
    }

    /**
     * 检查模板是否包含占位符
     * @param template 提示词模板
     * @returns 是否包含占位符
     */
    public hasPlaceholders(template: string): boolean {
        return ContextExtractor.PLACEHOLDER_REGEX.test(template);
    }

    /**
     * 提取上下文内容
     * @param blockIds 选中的块ID数组
     * @param placeholders 解析后的占位符数组
     * @returns 上下文信息
     */
    public async extractContext(blockIds: string[], placeholders: ParsedPlaceholder[]): Promise<ContextInfo> {
        const context: ContextInfo = {
            aboveContent: '',
            belowContent: '',
            aboveCount: 0,
            belowCount: 0,
            isBlockMode: false
        };

        if (blockIds.length === 0 || placeholders.length === 0) {
            return context;
        }

        // 第一个块ID和最后一个块ID
        const firstBlockId = blockIds[0];
        const lastBlockId = blockIds[blockIds.length - 1];

        // 处理每个占位符
        for (const placeholder of placeholders) {
            try {
                switch (placeholder.type) {
                    case PlaceholderType.ABOVE_LINES:
                        context.aboveContent = await this.getContextLines(firstBlockId, 'above', placeholder.count);
                        context.aboveCount = placeholder.count;
                        break;

                    case PlaceholderType.BELOW_LINES:
                        context.belowContent = await this.getContextLines(lastBlockId, 'below', placeholder.count);
                        context.belowCount = placeholder.count;
                        break;

                    case PlaceholderType.ABOVE_BLOCKS:
                        context.aboveContent = await this.getContextBlocks(firstBlockId, 'above', placeholder.count);
                        context.aboveCount = placeholder.count;
                        context.isBlockMode = true;
                        break;

                    case PlaceholderType.BELOW_BLOCKS:
                        context.belowContent = await this.getContextBlocks(lastBlockId, 'below', placeholder.count);
                        context.belowCount = placeholder.count;
                        context.isBlockMode = true;
                        break;
                }
            } catch (error) {
                console.error(`[ContextExtractor] Error extracting context for ${placeholder.original}:`, error);
            }
        }

        return context;
    }

    /**
     * 获取指定块周围的文本行
     * @param blockId 块ID
     * @param direction 方向（above/below）
     * @param count 行数
     * @returns 文本内容
     */
    private async getContextLines(blockId: string, direction: 'above' | 'below', count: number): Promise<string> {
        try {
            const blocks = await this.getSiblingBlocks(blockId, direction, count * 2); // 获取足够的块
            const lines: string[] = [];

            // 将块内容转换为行
            for (const block of blocks) {
                const blockLines = block.content.split('\n');
                lines.push(...blockLines);
            }

            // 截取指定行数
            const selectedLines = direction === 'above'
                ? lines.slice(-count)  // 取最后count行
                : lines.slice(0, count); // 取前count行

            return selectedLines.join('\n');
        } catch (error) {
            console.error(`[ContextExtractor] Error getting context lines:`, error);
            return '';
        }
    }

    /**
     * 获取指定块周围的SiYuan块
     * @param blockId 块ID
     * @param direction 方向（above/below）
     * @param count 块数
     * @returns 格式化的块内容
     */
    private async getContextBlocks(blockId: string, direction: 'above' | 'below', count: number): Promise<string> {
        try {
            const blocks = await this.getSiblingBlocks(blockId, direction, count);
            return blocks.map(block => block.content).join('\n\n');
        } catch (error) {
            console.error(`[ContextExtractor] Error getting context blocks:`, error);
            return '';
        }
    }

    /**
     * 获取相邻的块
     * @param blockId 起始块ID
     * @param direction 方向
     * @param count 数量
     * @returns 块信息数组
     */
    private async getSiblingBlocks(
        blockId: string,
        direction: 'above' | 'below',
        count: number
    ): Promise<Array<{ id: string; content: string; type: string }>> {
        try {
            // 获取当前块的元素
            const currentElement = document.querySelector(`[data-node-id="${blockId}"]`) as HTMLElement;
            if (!currentElement) {
                console.warn(`[ContextExtractor] Block not found: ${blockId}`);
                return [];
            }

            // 获取父容器
            const container = currentElement.closest('.protyle-wysiwyg');
            if (!container) {
                console.warn(`[ContextExtractor] Container not found for block: ${blockId}`);
                return [];
            }

            // 获取所有块元素
            const allBlocks = Array.from(container.querySelectorAll('[data-node-id]')) as HTMLElement[];
            const currentIndex = allBlocks.findIndex(el => el.dataset.nodeId === blockId);

            if (currentIndex === -1) {
                return [];
            }

            // 根据方向获取相邻块
            const siblingBlocks: HTMLElement[] = [];
            if (direction === 'above') {
                // 向上获取
                for (let i = currentIndex - 1; i >= 0 && siblingBlocks.length < count; i--) {
                    siblingBlocks.unshift(allBlocks[i]); // 保持顺序
                }
            } else {
                // 向下获取
                for (let i = currentIndex + 1; i < allBlocks.length && siblingBlocks.length < count; i++) {
                    siblingBlocks.push(allBlocks[i]);
                }
            }

            // 提取块内容
            const results: Array<{ id: string; content: string; type: string }> = [];
            for (const block of siblingBlocks) {
                const id = block.dataset.nodeId || '';
                const type = block.dataset.type || 'paragraph';
                const content = this.extractBlockText(block);
                results.push({ id, content, type });
            }

            return results;
        } catch (error) {
            console.error(`[ContextExtractor] Error getting sibling blocks:`, error);
            return [];
        }
    }

    /**
     * 从块元素中提取纯文本
     * @param blockElement 块DOM元素
     * @returns 文本内容
     */
    private extractBlockText(blockElement: HTMLElement): string {
        try {
            // 尝试从 data-content 属性获取
            const dataContent = blockElement.dataset.content;
            if (dataContent) {
                return dataContent;
            }

            // 否则提取可见文本
            const contentElement = blockElement.querySelector('[contenteditable]');
            if (contentElement) {
                return contentElement.textContent?.trim() || '';
            }

            // 兜底：直接获取文本
            return blockElement.textContent?.trim() || '';
        } catch (error) {
            console.error(`[ContextExtractor] Error extracting block text:`, error);
            return '';
        }
    }

    /**
     * 应用占位符替换到模板
     * @param template 原始模板
     * @param context 上下文信息
     * @returns 替换后的模板
     */
    public applyPlaceholders(template: string, context: ContextInfo): string {
        let result = template;

        // 替换上文占位符（直接替换为内容，不添加标签）
        if (context.aboveContent) {
            const aboveType = context.isBlockMode ? 'above_blocks' : 'above';
            const aboveRegex = new RegExp(`\\{${aboveType}=\\d+\\}`, 'g');
            result = result.replace(aboveRegex, context.aboveContent);
        }

        // 替换下文占位符（直接替换为内容，不添加标签）
        if (context.belowContent) {
            const belowType = context.isBlockMode ? 'below_blocks' : 'below';
            const belowRegex = new RegExp(`\\{${belowType}=\\d+\\}`, 'g');
            result = result.replace(belowRegex, context.belowContent);
        }

        return result;
    }

    /**
     * 完整的占位符解析和替换流程
     * @param template 提示词模板
     * @param blockIds 选中的块ID数组
     * @returns 替换后的模板
     */
    public async processTemplate(template: string, blockIds: string[]): Promise<string> {
        // 检查是否包含占位符
        if (!this.hasPlaceholders(template)) {
            return template;
        }

        // 解析占位符
        const placeholders = this.parsePlaceholders(template);
        if (placeholders.length === 0) {
            return template;
        }

        // 提取上下文
        const context = await this.extractContext(blockIds, placeholders);

        // 应用替换
        return this.applyPlaceholders(template, context);
    }

    /**
     * 格式化上下文信息为可读字符串（用于调试）
     * @param context 上下文信息
     * @returns 格式化的字符串
     */
    public formatContextInfo(context: ContextInfo): string {
        const parts: string[] = [];

        if (context.aboveContent) {
            const type = context.isBlockMode ? '块' : '行';
            parts.push(`上文 ${context.aboveCount} ${type}: ${context.aboveContent.substring(0, 50)}...`);
        }

        if (context.belowContent) {
            const type = context.isBlockMode ? '块' : '行';
            parts.push(`下文 ${context.belowCount} ${type}: ${context.belowContent.substring(0, 50)}...`);
        }

        return parts.length > 0 ? parts.join(' | ') : '无上下文';
    }
}
