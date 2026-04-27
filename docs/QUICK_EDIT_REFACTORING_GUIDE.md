# Quick Edit 系统重构指南

本文档详细描述 QuickEditManager 从 God Class (2,084行) 拆分为模块化组件的重构计划。

## 目标架构

```
┌─────────────────────────────────────────────────────────────┐
│              QuickEditCoordinator (~400 行)                 │
│         (原 QuickEditManager，精简为协调器)                  │
└─────────────────────────────────────────────────────────────┘
                              │ 协调
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌────────────────┐    ┌────────────────┐
│SelectionHandler│    │  PromptBuilder  │    │EditStateManager│
│   ✅ 已完成    │    │    (激活)       │    │    (激活)      │
│   ~300 行     │    │    ~250 行      │    │    ~250 行     │
└───────────────┘    └────────────────┘    └────────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌────────────────┐    ┌────────────────┐
│ ActionHandler │    │AIRequestHandler│    │EditStateMachine│
│    (新建)     │    │     (新建)     │    │     (新建)     │
│   ~350 行     │    │    ~300 行     │    │    ~200 行     │
└───────────────┘    └────────────────┘    └────────────────┘
```

---

## Phase 1.1: 激活 SelectionHandler ✅ 已完成

**状态**: 已完成

**改动**:
- `SelectionHandler.getSelection()` 现在不需要 IProtyle 参数
- 添加了 `ExtendedSelection` 接口
- QuickEditManager 已使用 `selectionHandler.getSelection()`
- 7 个重复方法已标记 `@deprecated`

---

## Phase 1.2: 激活 PromptBuilder

**目标**: 将 QuickEditManager 中内联的 prompt 构建逻辑 (第 738-806 行) 迁移到 PromptBuilder

### 当前问题

QuickEditManager 第 738-806 行存在内联 prompt 构建：

```typescript
// QuickEditManager.ts 中的内联逻辑
let template: string;
let presetSystemPrompt: string | undefined = undefined;
let presetAppendedPrompt: string | undefined = undefined;
if (currentPresetId) {
    const currentPreset = this.configManager.getTemplateById(currentPresetId);
    if (currentPreset && currentPreset.editInstruction) {
        template = currentPreset.editInstruction;
        presetSystemPrompt = currentPreset.systemPrompt;
        presetAppendedPrompt = currentPreset.appendedPrompt;
        // ...
    }
}
```

### 需要的改动

#### 1. 增强 PromptBuilder (`src/quick-edit/PromptBuilder.ts`)

添加新方法：

```typescript
export interface QuickEditPromptResult {
    /** 用户消息 (含编辑指令和原文) */
    userPrompt: string;
    /** 系统提示词 (来自预设) */
    systemPrompt?: string;
    /** 追加提示词 (来自预设) */
    appendedPrompt?: string;
    /** 过滤规则 (来自预设) */
    filterRules?: FilterRule[];
}

export class PromptBuilder {
    constructor(
        private configManager: ConfigManager,
        private contextExtractor: ContextExtractor
    ) {}

    /**
     * 构建 Quick Edit 完整 prompt
     * @param instruction 用户编辑指令
     * @param originalText 原始文本
     * @param presetId 预设 ID (可选)
     * @param blockIds 选中的块 ID 列表 (用于上下文提取)
     */
    async buildQuickEditPrompt(
        instruction: string,
        originalText: string,
        presetId?: string,
        blockIds?: string[]
    ): Promise<QuickEditPromptResult> {
        let template = this.getDefaultTemplate();
        let systemPrompt: string | undefined;
        let appendedPrompt: string | undefined;
        let filterRules: FilterRule[] | undefined;

        // 如果有预设，使用预设的模板
        if (presetId) {
            const preset = this.configManager.getTemplateById(presetId);
            if (preset?.editInstruction) {
                template = preset.editInstruction;
                systemPrompt = preset.systemPrompt;
                appendedPrompt = preset.appendedPrompt;
                filterRules = preset.filterRules;
            }
        }

        // 处理上下文占位符 (如 {above_blocks=2})
        let processedTemplate = template;
        if (blockIds && blockIds.length > 0 && this.contextExtractor.hasPlaceholders(template)) {
            try {
                processedTemplate = await this.contextExtractor.processTemplate(template, blockIds);
            } catch (error) {
                console.error('[PromptBuilder] Context extraction failed:', error);
                // 继续使用原始模板
            }
        }

        // 替换 {instruction} 和 {original} 占位符
        const userPrompt = processedTemplate
            .replace(/{instruction}/g, instruction)
            .replace(/{original}/g, originalText);

        return {
            userPrompt,
            systemPrompt,
            appendedPrompt,
            filterRules
        };
    }

    private getDefaultTemplate(): string {
        return `请按以下要求修改文本：

任务：{instruction}

原文：
{original}

请直接输出修改后的完整内容，不要包含任何解释。`;
    }
}
```

#### 2. 更新 QuickEditManager

```typescript
// 构造函数中添加
this.promptBuilder = new PromptBuilder(configManager, this.contextExtractor);

// 替换 processInlineEdit 中的内联逻辑 (约第 738-806 行)
const promptResult = await this.promptBuilder.buildQuickEditPrompt(
    block.instruction,
    block.originalText,
    currentPresetId,
    block.selectedBlockIds
);

// 使用 promptResult.userPrompt, promptResult.systemPrompt 等
```

### 测试要点

- [ ] 默认模板正确应用
- [ ] 预设模板正确加载
- [ ] 上下文占位符 `{above_blocks=N}` 正确展开
- [ ] `{instruction}` 和 `{original}` 正确替换
- [ ] 过滤规则正确传递

---

## Phase 1.3: 激活 EditStateManager

**目标**: 将 QuickEditManager 中分散的状态变量迁移到 EditStateManager

### 当前问题

QuickEditManager 第 71-92 行有多个分散的状态变量：

```typescript
private activeBlocks: Map<string, InlineEditBlock> = new Map();
private activeRequestBlockId: string | null = null;
private isProcessing: boolean = false;
private keyboardHandlers: Map<string, (e: KeyboardEvent) => void> = new Map();
private pendingSelection: InlineEditSelection | null = null;
private mutationObserver: MutationObserver | null = null;
private observedContainers: Set<HTMLElement> = new Set();
```

### 需要的改动

#### 1. 增强 EditStateManager (`src/quick-edit/EditStateManager.ts`)

```typescript
import type { InlineEditBlock, InlineEditSelection } from './inline-types';

export class EditStateManager {
    // 活跃编辑块
    private activeBlocks: Map<string, InlineEditBlock> = new Map();

    // 当前请求的块 ID
    private activeRequestBlockId: string | null = null;

    // 是否正在处理
    private isProcessing: boolean = false;

    // 待处理的选择
    private pendingSelection: InlineEditSelection | null = null;

    // 键盘处理器
    private keyboardHandlers: Map<string, (e: KeyboardEvent) => void> = new Map();

    // ===== Active Blocks =====

    getActiveBlock(blockId: string): InlineEditBlock | undefined {
        return this.activeBlocks.get(blockId);
    }

    setActiveBlock(blockId: string, block: InlineEditBlock): void {
        this.activeBlocks.set(blockId, block);
    }

    deleteActiveBlock(blockId: string): boolean {
        return this.activeBlocks.delete(blockId);
    }

    hasActiveBlock(blockId: string): boolean {
        return this.activeBlocks.has(blockId);
    }

    getAllActiveBlocks(): Map<string, InlineEditBlock> {
        return this.activeBlocks;
    }

    clearAllActiveBlocks(): void {
        this.activeBlocks.clear();
    }

    // ===== Processing State =====

    get processing(): boolean {
        return this.isProcessing;
    }

    setProcessing(value: boolean): void {
        this.isProcessing = value;
    }

    // ===== Active Request =====

    get currentRequestBlockId(): string | null {
        return this.activeRequestBlockId;
    }

    setCurrentRequestBlockId(blockId: string | null): void {
        this.activeRequestBlockId = blockId;
    }

    // ===== Pending Selection =====

    get selection(): InlineEditSelection | null {
        return this.pendingSelection;
    }

    setSelection(selection: InlineEditSelection | null): void {
        this.pendingSelection = selection;
    }

    // ===== Keyboard Handlers =====

    getKeyboardHandler(blockId: string): ((e: KeyboardEvent) => void) | undefined {
        return this.keyboardHandlers.get(blockId);
    }

    setKeyboardHandler(blockId: string, handler: (e: KeyboardEvent) => void): void {
        this.keyboardHandlers.set(blockId, handler);
    }

    deleteKeyboardHandler(blockId: string): boolean {
        return this.keyboardHandlers.delete(blockId);
    }

    clearAllKeyboardHandlers(): void {
        this.keyboardHandlers.clear();
    }

    // ===== Cleanup =====

    reset(): void {
        this.activeBlocks.clear();
        this.activeRequestBlockId = null;
        this.isProcessing = false;
        this.pendingSelection = null;
        this.keyboardHandlers.clear();
    }
}
```

#### 2. 更新 QuickEditManager

```typescript
// 构造函数中
this.stateManager = new EditStateManager();

// 替换所有直接状态访问，例如：
// 旧: this.activeBlocks.get(blockId)
// 新: this.stateManager.getActiveBlock(blockId)

// 旧: this.isProcessing = true
// 新: this.stateManager.setProcessing(true)

// 旧: this.pendingSelection = selection
// 新: this.stateManager.setSelection(selection)
```

### 测试要点

- [ ] 状态读写正确
- [ ] 并发保护正常工作
- [ ] 清理时所有状态正确重置
- [ ] 键盘处理器正确注册和清理

---

## Phase 2: 新建 EditStateMachine

**目标**: 创建状态机管理编辑状态转换

### 状态定义

```typescript
// src/quick-edit/EditStateMachine.ts

export enum EditState {
    IDLE = 'idle',
    INPUT_INSTRUCTION = 'input_instruction',
    PROCESSING = 'processing',
    STREAMING = 'streaming',
    REVIEWING = 'reviewing',
    APPLYING = 'applying',
    ERROR = 'error'
}

export interface StateTransition {
    from: EditState;
    to: EditState;
    action: string;
    guard?: (context: StateContext) => boolean;
}

export interface StateContext {
    blockId: string;
    hasActiveRequest: boolean;
    hasSelection: boolean;
}
```

### 状态转换图

```
                    ┌─────────────────────┐
                    │        IDLE         │
                    └──────────┬──────────┘
                               │ trigger
                               ▼
                    ┌─────────────────────┐
         cancel ◄───│  INPUT_INSTRUCTION  │
                    └──────────┬──────────┘
                               │ submit
                               ▼
                    ┌─────────────────────┐
         error ◄────│     PROCESSING      │
                    └──────────┬──────────┘
                               │ start_stream
                               ▼
                    ┌─────────────────────┐
         error ◄────│     STREAMING       │───► cancel
                    └──────────┬──────────┘
                               │ complete
                               ▼
                    ┌─────────────────────┐
         reject ◄───│     REVIEWING       │───► retry (→PROCESSING)
                    └──────────┬──────────┘
                               │ accept
                               ▼
                    ┌─────────────────────┐
         error ◄────│      APPLYING       │
                    └──────────┬──────────┘
                               │ applied
                               ▼
                           (→ IDLE)
```

### 实现

```typescript
export class EditStateMachine {
    private currentState: EditState = EditState.IDLE;
    private transitions: StateTransition[];
    private listeners: Set<(from: EditState, to: EditState, action: string) => void> = new Set();

    constructor() {
        this.transitions = [
            { from: EditState.IDLE, to: EditState.INPUT_INSTRUCTION, action: 'trigger' },
            { from: EditState.INPUT_INSTRUCTION, to: EditState.PROCESSING, action: 'submit' },
            { from: EditState.INPUT_INSTRUCTION, to: EditState.IDLE, action: 'cancel' },
            { from: EditState.PROCESSING, to: EditState.STREAMING, action: 'start_stream' },
            { from: EditState.PROCESSING, to: EditState.ERROR, action: 'error' },
            { from: EditState.STREAMING, to: EditState.REVIEWING, action: 'complete' },
            { from: EditState.STREAMING, to: EditState.ERROR, action: 'error' },
            { from: EditState.STREAMING, to: EditState.IDLE, action: 'cancel' },
            { from: EditState.REVIEWING, to: EditState.APPLYING, action: 'accept' },
            { from: EditState.REVIEWING, to: EditState.IDLE, action: 'reject' },
            { from: EditState.REVIEWING, to: EditState.PROCESSING, action: 'retry' },
            { from: EditState.APPLYING, to: EditState.IDLE, action: 'applied' },
            { from: EditState.APPLYING, to: EditState.ERROR, action: 'error' },
            { from: EditState.ERROR, to: EditState.IDLE, action: 'dismiss' },
            { from: EditState.ERROR, to: EditState.PROCESSING, action: 'retry' },
        ];
    }

    getState(): EditState {
        return this.currentState;
    }

    canTransition(action: string): boolean {
        return this.transitions.some(
            t => t.from === this.currentState && t.action === action
        );
    }

    transition(action: string, context?: StateContext): boolean {
        const validTransition = this.transitions.find(
            t => t.from === this.currentState && t.action === action
        );

        if (!validTransition) {
            console.warn(`[StateMachine] Invalid: ${this.currentState} --${action}-->`);
            return false;
        }

        if (validTransition.guard && context && !validTransition.guard(context)) {
            console.warn(`[StateMachine] Guard blocked: ${this.currentState} --${action}-->`);
            return false;
        }

        const from = this.currentState;
        this.currentState = validTransition.to;

        this.listeners.forEach(listener => listener(from, this.currentState, action));
        return true;
    }

    onTransition(listener: (from: EditState, to: EditState, action: string) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    reset(): void {
        this.currentState = EditState.IDLE;
    }
}
```

### 测试要点

- [ ] 所有合法转换正常工作
- [ ] 非法转换被拒绝
- [ ] Guard 条件正确检查
- [ ] 监听器正确触发
- [ ] reset() 正确重置状态

---

## Phase 3.1: 新建 ActionHandler

**目标**: 从 QuickEditManager 提取动作处理逻辑

### 提取的方法

| 方法 | 原位置 | 行数 |
|------|--------|------|
| `handleAccept()` | 第 1112-1242 行 | 130 |
| `handleReject()` | 第 1362-1381 行 | 20 |
| `handleInsert()` | 第 1248-1356 行 | 108 |
| `handleRetry()` | 第 1386-1402 行 | 16 |
| `cancelActiveRequest()` | 第 493-514 行 | 21 |

### 实现

```typescript
// src/quick-edit/ActionHandler.ts

import type { InlineEditBlock } from './inline-types';
import type { EditStateManager } from './EditStateManager';
import type { EditStateMachine } from './EditStateMachine';
import type { BlockOperations } from './BlockOperations';
import type { InlineEditRenderer } from './InlineEditRenderer';
import type { EditHistory } from '@/editor/EditHistory';

export class ActionHandler {
    constructor(
        private stateManager: EditStateManager,
        private stateMachine: EditStateMachine,
        private blockOps: BlockOperations,
        private renderer: InlineEditRenderer,
        private history: EditHistory
    ) {}

    /**
     * 接受 AI 建议的修改
     */
    async handleAccept(blockId: string): Promise<void> {
        const block = this.stateManager.getActiveBlock(blockId);
        if (!block) {
            console.error(`[ActionHandler] Block ${blockId} not found`);
            return;
        }

        if (!this.stateMachine.transition('accept')) {
            return;
        }

        try {
            // 1. 删除原始块
            if (block.selectedBlockIds && block.selectedBlockIds.length > 0) {
                await this.blockOps.deleteMultipleBlocks(block.selectedBlockIds);
            }

            // 2. 插入新内容
            const suggestedText = block.suggestedTextWithIndent || block.suggestedText;
            // ... 实现插入逻辑

            // 3. 记录到历史
            this.history.addEntry({
                blockId: block.blockId,
                originalText: block.originalText,
                newText: suggestedText,
                timestamp: Date.now()
            });

            // 4. 清理
            this.renderer.removeComparisonBlock(blockId);
            this.stateManager.deleteActiveBlock(blockId);

            this.stateMachine.transition('applied');
        } catch (error) {
            console.error('[ActionHandler] Accept failed:', error);
            this.stateMachine.transition('error');
        }
    }

    /**
     * 拒绝修改，恢复原状
     */
    handleReject(blockId: string): void {
        if (!this.stateMachine.transition('reject')) {
            return;
        }

        // 移除比较块
        this.renderer.removeComparisonBlock(blockId);

        // 清理状态
        this.stateManager.deleteActiveBlock(blockId);
        this.stateManager.deleteKeyboardHandler(blockId);
    }

    /**
     * 将 AI 内容插入到原文下方（保留原文）
     */
    async handleInsert(blockId: string): Promise<void> {
        // ... 实现插入逻辑
    }

    /**
     * 重试编辑
     */
    async handleRetry(blockId: string, onProcess: (block: InlineEditBlock) => Promise<void>): Promise<void> {
        const block = this.stateManager.getActiveBlock(blockId);
        if (!block) return;

        if (!this.stateMachine.transition('retry')) {
            return;
        }

        // 重置建议文本
        block.suggestedText = '';
        this.stateManager.setActiveBlock(blockId, block);

        // 重新处理
        await onProcess(block);
    }

    /**
     * 取消当前请求
     */
    cancelActiveRequest(): void {
        const blockId = this.stateManager.currentRequestBlockId;
        if (!blockId) return;

        this.stateMachine.transition('cancel');

        // 清理
        this.renderer.removeComparisonBlock(blockId);
        this.stateManager.deleteActiveBlock(blockId);
        this.stateManager.setCurrentRequestBlockId(null);
        this.stateManager.setProcessing(false);
    }
}
```

---

## Phase 3.2: 新建 AIRequestHandler

**目标**: 从 QuickEditManager 提取 AI 请求处理逻辑

### 提取的方法

| 方法 | 原位置 | 行数 |
|------|--------|------|
| `processInlineEdit()` | 第 703-976 行 | 273 |
| 流式回调处理 | 内含 | - |
| Filter 规则应用 | 内含 | - |

### 实现

```typescript
// src/quick-edit/AIRequestHandler.ts

import type { InlineEditBlock } from './inline-types';
import type { ClaudeClient } from '@/claude';
import type { EditStateManager } from './EditStateManager';
import type { EditStateMachine } from './EditStateMachine';
import type { PromptBuilder } from './PromptBuilder';
import type { InlineEditRenderer } from './InlineEditRenderer';
import type { FilterRule } from '@/settings/config-types';

export class AIRequestHandler {
    constructor(
        private claudeClient: ClaudeClient,
        private stateManager: EditStateManager,
        private stateMachine: EditStateMachine,
        private promptBuilder: PromptBuilder,
        private renderer: InlineEditRenderer
    ) {}

    /**
     * 处理内联编辑请求
     */
    async processEdit(block: InlineEditBlock, presetId?: string): Promise<void> {
        if (!this.stateMachine.canTransition('submit')) {
            console.warn('[AIRequestHandler] Cannot process: invalid state');
            return;
        }

        this.stateMachine.transition('submit');
        this.stateManager.setProcessing(true);
        this.stateManager.setCurrentRequestBlockId(block.id);

        try {
            // 1. 构建 prompt
            const promptResult = await this.promptBuilder.buildQuickEditPrompt(
                block.instruction,
                block.originalText,
                presetId,
                block.selectedBlockIds
            );

            // 2. 开始流式请求
            this.stateMachine.transition('start_stream');

            const chunks: string[] = [];

            await this.claudeClient.sendMessage(
                [{ role: 'user', content: promptResult.userPrompt }],
                // onMessage
                (chunk: string) => {
                    chunks.push(chunk);
                    block.suggestedText = chunks.join('');
                    this.renderer.updateStreamingContent(block.id, block.suggestedText);
                },
                // onError
                (error: Error) => {
                    console.error('[AIRequestHandler] Streaming error:', error);
                    block.error = error.message;
                    this.stateMachine.transition('error');
                },
                // onComplete
                () => {
                    block.suggestedText = chunks.join('');
                    this.applyFilterRules(block, promptResult.filterRules);
                    this.stateMachine.transition('complete');
                    this.renderer.showReviewActions(block.id);
                },
                'QuickEdit',
                promptResult.filterRules,
                promptResult.systemPrompt
            );

        } catch (error) {
            console.error('[AIRequestHandler] Process error:', error);
            block.error = (error as Error).message;
            this.stateMachine.transition('error');
        } finally {
            this.stateManager.setProcessing(false);
            this.stateManager.setCurrentRequestBlockId(null);
        }
    }

    /**
     * 应用过滤规则
     */
    private applyFilterRules(block: InlineEditBlock, filterRules?: FilterRule[]): void {
        if (!filterRules || filterRules.length === 0) return;

        let filtered = block.suggestedText;
        for (const rule of filterRules) {
            if (!rule.enabled) continue;
            try {
                const regex = new RegExp(rule.pattern, rule.flags || 'g');
                filtered = filtered.replace(regex, rule.replacement);
            } catch (error) {
                console.warn(`[AIRequestHandler] Filter rule failed: ${rule.pattern}`, error);
            }
        }
        block.suggestedText = filtered;
    }
}
```

---

## Phase 4: 重命名为 QuickEditCoordinator

**目标**: 精简 QuickEditManager 为纯协调器

### 最终结构

```typescript
// src/quick-edit/QuickEditCoordinator.ts

export class QuickEditCoordinator {
    // 组件引用
    private selectionHandler: SelectionHandler;
    private promptBuilder: PromptBuilder;
    private stateManager: EditStateManager;
    private stateMachine: EditStateMachine;
    private actionHandler: ActionHandler;
    private requestHandler: AIRequestHandler;
    private renderer: InlineEditRenderer;
    private inputPopup: InstructionInputPopup;

    constructor(
        plugin: Plugin,
        claudeClient: ClaudeClient,
        history: EditHistory,
        editSettings: EditSettings,
        configManager: ConfigManager
    ) {
        // 初始化所有组件
        this.selectionHandler = new SelectionHandler();
        this.stateManager = new EditStateManager();
        this.stateMachine = new EditStateMachine();
        this.promptBuilder = new PromptBuilder(configManager, new ContextExtractor(new EditorHelper()));
        this.renderer = new InlineEditRenderer();
        this.actionHandler = new ActionHandler(
            this.stateManager,
            this.stateMachine,
            new BlockOperations(),
            this.renderer,
            history
        );
        this.requestHandler = new AIRequestHandler(
            claudeClient,
            this.stateManager,
            this.stateMachine,
            this.promptBuilder,
            this.renderer
        );
        // ... 设置回调和事件订阅
    }

    /**
     * 触发快速编辑
     */
    public trigger(): void {
        const selection = this.selectionHandler.getSelection();
        if (!selection) {
            showMessage('请先选中要编辑的文本', 3000);
            return;
        }

        this.stateManager.setSelection(selection);
        this.stateMachine.transition('trigger');
        this.inputPopup.show(selection);
    }

    /**
     * 清理资源
     */
    public destroy(): void {
        this.renderer.cleanup();
        this.inputPopup.close();
        this.stateManager.reset();
        this.stateMachine.reset();
    }
}
```

### 目标行数

| 组件 | 目标行数 |
|------|----------|
| QuickEditCoordinator | ~400 |
| SelectionHandler | ~300 |
| PromptBuilder | ~250 |
| EditStateManager | ~250 |
| EditStateMachine | ~200 |
| ActionHandler | ~350 |
| AIRequestHandler | ~300 |

---

## Phase 5: 更新导出

### 更新 `src/quick-edit/index.ts`

```typescript
// Core coordinator
export { QuickEditCoordinator } from './QuickEditCoordinator';
// Backward compatibility alias
export { QuickEditCoordinator as QuickEditManager } from './QuickEditCoordinator';

// Modular components
export { SelectionHandler } from './SelectionHandler';
export { PromptBuilder } from './PromptBuilder';
export { EditStateManager } from './EditStateManager';
export { EditStateMachine, EditState } from './EditStateMachine';
export { ActionHandler } from './ActionHandler';
export { AIRequestHandler } from './AIRequestHandler';

// Support components
export { BlockOperations } from './BlockOperations';
export { ContextExtractor } from './ContextExtractor';
export { InlineEditRenderer } from './InlineEditRenderer';
export { InstructionInputPopup } from './InstructionInputPopup';

// Types
export * from './types';
export * from './inline-types';
export type { ExtendedSelection } from './SelectionHandler';
export type { QuickEditPromptResult } from './PromptBuilder';
```

---

## 测试清单

每个 Phase 完成后验证：

- [ ] `npm run build` 无错误
- [ ] 单块快速编辑
- [ ] 多块快速编辑 (拖选)
- [ ] 块选择快速编辑 (块图标)
- [ ] 处理中取消
- [ ] 错误后重试
- [ ] 接受并验证内容
- [ ] 拒绝并验证恢复
- [ ] 插入到下方

**注意**: 无热重载，每次测试需 `npm run deploy` + 重启思源

---

## 风险评估

| Phase | 风险 | 缓解策略 |
|-------|------|----------|
| 1.2 | 低 | PromptBuilder 已存在，只需增强 |
| 1.3 | 低 | EditStateManager 已存在，只需增强 |
| 2 | 中 | 先并行运行新旧逻辑 |
| 3.1 | 中 | 逐个提取方法，保持签名 |
| 3.2 | 中 | 保持 ClaudeClient 接口不变 |
| 4 | 低 | 保留兼容别名 |
| 5 | 低 | 仅导出变更 |

---

**文档版本**: 1.0
**创建日期**: 2025-12-30
**基于**: Phase 1.1 完成后的代码状态
