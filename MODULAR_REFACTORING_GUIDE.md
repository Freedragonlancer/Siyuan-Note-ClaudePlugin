# QuickEditManager 模块化重构指南

**版本**: v0.9.0
**日期**: 2025-01-06

---

## 概述

QuickEditManager 已从 2078 行的 God Class 拆分为多个专职模块，每个模块负责单一职责。这大幅提升了代码的可维护性、可测试性和可扩展性。

---

## 新架构

### 模块结构

```
src/quick-edit/
├── QuickEditManager.ts       # 主编排器（原有，待简化）
│
├── SelectionHandler.ts        # ✨ 新增：选区处理
├── BlockOperations.ts         # ✨ 新增：SiYuan API 操作
├── PromptBuilder.ts           # ✨ 新增：提示词构建
├── EditStateManager.ts        # ✨ 新增：状态管理
│
├── ContextExtractor.ts        # 上下文提取（已有）
├── InlineEditRenderer.ts      # UI 渲染（已有）
└── InstructionInputPopup.ts   # 输入弹窗（已有）
```

### 职责划分

| 模块 | 职责 | 代码行数 | 关键方法 |
|------|------|----------|----------|
| **SelectionHandler** | 处理文本选区提取和验证 | ~240 | `getSelection()`, `extractBlocksFromRange()` |
| **BlockOperations** | 封装所有 SiYuan API 调用 | ~260 | `insertBlock()`, `deleteBlock()`, `updateBlock()` |
| **PromptBuilder** | 构建 AI 提示词 | ~200 | `buildPrompt()`, `replacePlaceholders()` |
| **EditStateManager** | 管理编辑状态和事件监听 | ~200 | `addActiveBlock()`, `registerKeyboardHandler()` |

---

## 使用示例

### 1. SelectionHandler - 选区处理

```typescript
import { SelectionHandler } from '@/quick-edit';

const selectionHandler = new SelectionHandler();

// 获取当前选区
const selection = selectionHandler.getSelection(protyle);

if (selection) {
    console.log('Selected text:', selection.text);
    console.log('Block ID:', selection.blockId);
    console.log('Is multi-block:', selection.isMultiBlock);
    console.log('Selected block IDs:', selection.selectedBlockIds);
}

// 从 Range 提取块
const blocks = selectionHandler.extractBlocksFromRange(range);
console.log('Extracted blocks:', blocks);
```

**特性**:
- ✅ 单块和多块选区支持
- ✅ 块级选区回退（无文本选择时）
- ✅ 自动查找包含块元素
- ✅ 跨块文本提取

---

### 2. BlockOperations - API 操作

```typescript
import { BlockOperations } from '@/quick-edit';

const blockOps = new BlockOperations();

// 插入单个块
const result = await blockOps.insertBlock(
    '这是新的段落内容',
    'previousBlockId'
);

if (result.success) {
    console.log('New block ID:', result.blockId);
}

// 批量插入多个块
const paragraphs = ['段落1', '段落2', '段落3'];
const results = await blockOps.insertMultipleBlocks(
    paragraphs,
    'afterThisBlockId'
);

console.log('Inserted:', results.filter(r => r.success).length);

// 删除多个块
const deleteResults = await blockOps.deleteMultipleBlocks([
    'blockId1',
    'blockId2',
    'blockId3'
]);

// 更新块内容
await blockOps.updateBlock('blockId', '新的内容');

// 应用 Markdown 格式
const formatted = blockOps.applyMarkdownFormatting(
    'Heading Text',
    'NodeHeading',
    'h2'
);
console.log(formatted); // "## Heading Text"
```

**特性**:
- ✅ Promise 化的 API 调用
- ✅ 错误处理和结果验证
- ✅ 批量操作支持
- ✅ Markdown 格式化

---

### 3. PromptBuilder - 提示词构建

```typescript
import { PromptBuilder } from '@/quick-edit';
import { ContextExtractor } from '@/quick-edit';

const contextExtractor = new ContextExtractor();
const promptBuilder = new PromptBuilder(contextExtractor);

// 从预设模板构建提示词
const template: PromptTemplate = {
    id: 'improve',
    name: 'Improve Writing',
    systemPrompt: 'You are a professional editor',
    editInstruction: `Please improve the following text: {instruction}

Original:
{original}

Context above:
{above=3}

Context below:
{below=2}`
};

const prompt = await promptBuilder.buildPrompt(template, {
    instruction: '让这段话更简洁',
    originalText: '这是原始文本',
    blockId: 'block-id-123',
    blockType: 'NodeParagraph'
});

console.log('System prompt:', prompt.systemPrompt);
console.log('Messages:', prompt.messages);

// 构建选区问答提示
const qaPrompt = await promptBuilder.buildSelectionQAPrompt(
    template,
    '这是选中的文本',
    '请解释这段话的含义'
);

// 添加格式化提示
const withHint = promptBuilder.addFormattingHint(
    prompt,
    'NodeHeading',
    'h2'
);
```

**特性**:
- ✅ 占位符替换 (`{instruction}`, `{original}`, `{above=N}`, etc.)
- ✅ 上下文提取集成
- ✅ 选区问答模式
- ✅ 格式化提示自动添加

---

### 4. EditStateManager - 状态管理

```typescript
import { EditStateManager } from '@/quick-edit';
import type { InlineEditBlock } from '@/quick-edit';

const stateManager = new EditStateManager();

// 检查是否正在处理
if (stateManager.isCurrentlyProcessing()) {
    console.log('Already processing an edit');
    return;
}

// 开始处理
stateManager.setProcessing(true);

// 添加活动块
const block: InlineEditBlock = {
    id: 'edit-1',
    blockId: 'block-123',
    originalText: 'Original',
    suggestedText: '',
    state: 'processing',
    selectedBlockIds: ['block-123'],
    createdAt: Date.now()
};

stateManager.addActiveBlock('block-123', block);

// 注册键盘快捷键
stateManager.registerKeyboardHandler('block-123', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
        console.log('Accept edit');
    }
});

// 设置 DOM 观察器（检测块被外部删除）
stateManager.setupDOMObserver((blockId) => {
    console.log(`Block ${blockId} was removed externally`);
    stateManager.removeActiveBlock(blockId);
});

// 获取活动块
const activeBlock = stateManager.getActiveBlock('block-123');

// 清理
stateManager.unregisterKeyboardHandler('block-123');
stateManager.removeActiveBlock('block-123');
stateManager.setProcessing(false);

// 完全销毁（插件卸载时）
stateManager.destroy();
```

**特性**:
- ✅ 并发保护（防止多个编辑同时进行）
- ✅ 键盘事件管理（自动清理）
- ✅ DOM 变化监控（检测外部删除）
- ✅ 容器级观察

---

## 集成到现有代码

### 方式 1: 渐进式重构（推荐）

保持 QuickEditManager 不变，在新功能中使用新模块：

```typescript
import {
    SelectionHandler,
    BlockOperations,
    PromptBuilder,
    EditStateManager
} from '@/quick-edit';

class MyNewFeature {
    private selectionHandler = new SelectionHandler();
    private blockOps = new BlockOperations();
    private promptBuilder = new PromptBuilder(contextExtractor);
    private stateManager = new EditStateManager();

    async process() {
        // 使用新模块
        const selection = this.selectionHandler.getSelection(protyle);
        if (!selection) return;

        const prompt = await this.promptBuilder.buildPrompt(template, {
            instruction: 'Improve',
            originalText: selection.text,
            blockId: selection.blockId
        });

        // ... AI 处理

        await this.blockOps.insertBlock(aiResponse, selection.blockId);
    }
}
```

### 方式 2: 完全重构 QuickEditManager

将 QuickEditManager 改为精简的编排器：

```typescript
export class QuickEditOrchestrator {
    private selectionHandler: SelectionHandler;
    private blockOps: BlockOperations;
    private promptBuilder: PromptBuilder;
    private stateManager: EditStateManager;
    private renderer: InlineEditRenderer;

    constructor(...) {
        this.selectionHandler = new SelectionHandler();
        this.blockOps = new BlockOperations();
        this.promptBuilder = new PromptBuilder(contextExtractor);
        this.stateManager = new EditStateManager();
        // ...
    }

    async trigger() {
        // 1. 获取选区
        const selection = this.selectionHandler.getSelection(this.protyle);
        if (!selection) return;

        // 2. 检查状态
        if (this.stateManager.isCurrentlyProcessing()) {
            showMessage('Already processing');
            return;
        }

        // 3. 显示输入弹窗
        const { instruction, presetId } = await this.showInputPopup();

        // 4. 构建提示词
        const prompt = await this.promptBuilder.buildPrompt(preset, {
            instruction,
            originalText: selection.text,
            blockId: selection.blockId
        });

        // 5. 调用 AI
        const response = await this.callAI(prompt);

        // 6. 插入结果
        await this.blockOps.insertBlock(response, selection.blockId);

        // 7. 清理状态
        this.stateManager.setProcessing(false);
    }
}
```

---

## 测试示例

### 单元测试 SelectionHandler

```typescript
import { SelectionHandler } from '@/quick-edit';

describe('SelectionHandler', () => {
    let handler: SelectionHandler;

    beforeEach(() => {
        handler = new SelectionHandler();
    });

    test('should extract single block selection', () => {
        const mockProtyle = createMockProtyle();
        const selection = handler.getSelection(mockProtyle);

        expect(selection).toBeDefined();
        expect(selection?.isMultiBlock).toBe(false);
        expect(selection?.selectedBlockIds).toHaveLength(1);
    });

    test('should handle multi-block selection', () => {
        const mockProtyle = createMultiBlockProtyle();
        const selection = handler.getSelection(mockProtyle);

        expect(selection?.isMultiBlock).toBe(true);
        expect(selection?.selectedBlockIds.length).toBeGreaterThan(1);
    });
});
```

### 单元测试 BlockOperations

```typescript
import { BlockOperations } from '@/quick-edit';

describe('BlockOperations', () => {
    let blockOps: BlockOperations;

    beforeEach(() => {
        blockOps = new BlockOperations();
        // Mock fetch API
        global.fetch = jest.fn();
    });

    test('should insert block successfully', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({
                code: 0,
                data: [{ doOperations: [{ id: 'new-block-id' }] }]
            })
        });

        const result = await blockOps.insertBlock('Test content', 'prev-id');

        expect(result.success).toBe(true);
        expect(result.blockId).toBe('new-block-id');
    });

    test('should apply markdown formatting', () => {
        const formatted = blockOps.applyMarkdownFormatting(
            'Heading',
            'NodeHeading',
            'h2'
        );

        expect(formatted).toBe('## Heading');
    });
});
```

---

## 迁移清单

### 从旧的 QuickEditManager 迁移

- [ ] 识别使用 QuickEditManager 的地方
- [ ] 评估是否需要完全重构
- [ ] 如果是新功能，直接使用新模块
- [ ] 如果是修改现有功能，考虑渐进式重构
- [ ] 添加单元测试
- [ ] 更新文档

### 向后兼容性

✅ **完全向后兼容**
- 旧的 QuickEditManager 继续工作
- 新模块作为独立组件可选使用
- 无破坏性更改

---

## 性能优势

| 方面 | 改进 |
|------|------|
| 代码可读性 | 每个模块 <300 行，职责清晰 |
| 可测试性 | 每个模块可独立测试，无需模拟整个系统 |
| 可维护性 | 修改一个功能只需关注对应模块 |
| 可扩展性 | 添加新功能不影响现有模块 |
| 编译速度 | 模块化后 TypeScript 可并行编译 |
| 代码复用 | 模块可在其他功能中重用 |

---

## 常见问题

### Q: 是否必须立即重构 QuickEditManager？
**A**: 不是。新模块可以独立使用，现有代码无需立即修改。建议在添加新功能或修复 bug 时渐进式重构。

### Q: 新模块是否会增加包大小？
**A**: 不会。构建工具会 tree-shake 未使用的代码。如果不使用新模块，它们不会被打包。

### Q: 如何调试新模块？
**A**: 每个模块都有独立的 console.log 前缀（如 `[SelectionHandler]`），便于追踪。

### Q: 是否需要更新现有的 preset 配置？
**A**: 不需要。新模块与现有 PromptTemplate 完全兼容。

---

## 下一步

1. ✅ **已完成**: 创建所有新模块
2. ✅ **已完成**: 测试构建通过
3. 📋 **进行中**: 编写使用文档
4. ⏳ **待办**: 添加单元测试
5. ⏳ **待办**: 重构 QuickEditManager 使用新模块
6. ⏳ **待办**: 性能基准测试

---

## 相关文档

- [ARCHITECTURE.md](ARCHITECTURE.md) - 完整架构文档
- [REFACTORING.md](REFACTORING.md) - 重构日志
- [CLAUDE.md](CLAUDE.md) - 开发指南

---

**维护者**: Claude Plugin Team
**最后更新**: 2025-01-06
