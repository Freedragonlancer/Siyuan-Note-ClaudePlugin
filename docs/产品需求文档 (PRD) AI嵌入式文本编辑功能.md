  产品需求文档 (PRD): AI 嵌入式文本编辑功能

  1. 产品概述

  1.1 功能定位

  在思源笔记中集成 AI 驱动的智能文本编辑功能，允许用户选择文档中的任意文本，通过右键菜单发送给 Claude AI
  进行智能编辑，并以可视化差异对比的方式呈现修改建议，用户可选择性接受或拒绝修改。

  1.2 核心价值

  - 无缝集成：直接在编辑器中完成 AI 辅助编辑，无需切换界面
  - 上下文感知：智能提取前后文，提供更准确的 AI 建议
  - 安全可控：用户完全掌控修改权，可预览差异后再决定是否应用
  - 批量处理：支持多段文本同时编辑，提升效率

  1.3 目标用户

  - 需要文本润色、改写的写作者
  - 需要代码重构、优化的开发者
  - 需要翻译、总结的知识工作者

  ---
  2. 用户故事

  故事 1: 文本润色

  作为一名写作者，我希望选中一段文字后，让 AI 帮我润色优化，并能看到修改前后的对比，以便我决定是否采纳。

  故事 2: 代码重构

  作为一名开发者，我希望选中一段代码，让 AI 帮我重构优化，同时保留原代码上下文，确保重构后的代码逻辑正确。

  故事 3: 批量翻译

  作为一名研究者，我希望能选中多段外文内容，一次性发送给 AI 翻译，并逐段对比确认后应用修改。

  ---
  3. 功能需求

  3.1 文本选择与发送

  3.1.1 右键菜单集成

  - 触发条件：用户在思源笔记编辑器中选中至少 1 行文本
  - 菜单项名称：「发送到 Claude 编辑」或「AI 智能编辑」
  - 菜单位置：在现有右键菜单中添加，建议放在「复制」下方
  - 快捷键：可配置（建议 Ctrl+Shift+E）

  3.1.2 选中文本解析

  - 以行为单位：
    - 记录选中文本的起始行号和结束行号
    - 保留原始缩进和格式
    - 支持跨块选择（如跨多个段落、代码块）
  - 元数据记录：
  interface TextSelection {
    id: string;              // 唯一标识
    blockId: string;         // 思源块 ID
    startLine: number;       // 起始行号（从 1 开始）
    endLine: number;         // 结束行号
    selectedText: string;    // 选中的原始文本
    contextBefore: string;   // 上文上下文
    contextAfter: string;    // 下文上下文
    timestamp: number;       // 选择时间戳
    status: 'pending' | 'processing' | 'completed' | 'error';
  }

  3.2 上下文管理

  3.2.1 可配置上下文行数

  - 设置项：
    - contextLinesBefore: 上文扩展行数（默认 5 行）
    - contextLinesAfter: 下文扩展行数（默认 3 行）
    - 范围：0-50 行

  3.2.2 上下文提取逻辑

  - 上文提取：
    - 从选中起始行向上提取 N 行
    - 如果遇到块边界（如标题、分割线），停止提取
    - 保留原始格式（Markdown、代码块语法等）
  - 下文提取：
    - 从选中结束行向下提取 N 行
    - 同样遵守块边界规则

  3.2.3 发送给 AI 的格式

  <上文信息>
  {contextLinesBefore} 行上文内容
  </上文信息>

  <待编辑文本>
  {selectedText}
  </待编辑文本>

  <下文信息>
  {contextLinesAfter} 行下文内容
  </下文信息>

  <编辑指令>
  请对「待编辑文本」部分进行优化/改写/翻译（用户可自定义指令），保持格式一致，只输出修改后的文本内容。
  </编辑指令>

  3.3 Dock 面板显示

  3.3.1 选中文本列表

  ┌─────────────────────────────────────┐
  │ AI 文本编辑队列                      │
  ├─────────────────────────────────────┤
  │ ✓ 段落 1 (第 10-15 行) - 已完成     │
  │ ⏳ 段落 2 (第 22-28 行) - 处理中... │
  │ ⏸ 段落 3 (第 35-40 行) - 等待中     │
  ├─────────────────────────────────────┤
  │ [+ 添加选中文本] [🗑 清空队列]       │
  └─────────────────────────────────────┘

  3.3.2 状态指示器

  - 等待中 (⏸ pending): 灰色，已加入队列但未处理
  - 处理中 (⏳ processing): 蓝色，正在请求 AI
  - 已完成 (✓ completed): 绿色，AI 已返回结果
  - 错误 (❌ error): 红色，请求失败

  3.3.3 详情展开

  点击某个列表项，展开显示：
  - 原始文本预览（前 50 字）
  - AI 修改建议预览
  - 操作按钮：「查看差异」「应用修改」「重新生成」「删除」

  3.4 差异对比视图

  3.4.1 在原文位置显示

  - 实现方式：在思源编辑器中，选中文本的块上方/下方插入临时差异对比块
  - 差异高亮：
    - 删除内容：红色背景 + 删除线
    - 新增内容：绿色背景
    - 修改内容：黄色背景

  3.4.2 对比界面布局

  ┌─────────────────────────────────────────────┐
  │ 📝 AI 建议修改 (第 10-15 行)                 │
  ├─────────────────────────────────────────────┤
  │ 原文 │ 修改建议                              │
  ├──────┼──────────────────────────────────────┤
  │ This │ This sentence has been improved.      │
  │ is a │ (绿色高亮新增部分)                     │
  │ text.│                                        │
  ├─────────────────────────────────────────────┤
  │ [✓ 应用修改] [✗ 拒绝] [↻ 重新生成]          │
  └─────────────────────────────────────────────┘

  3.4.3 操作按钮

  - 应用修改：用 AI 建议替换原文，关闭对比视图
  - 拒绝修改：保持原文不变，关闭对比视图
  - 重新生成：用不同的 prompt 重新请求 AI
  - 编辑建议：允许用户手动调整 AI 建议后再应用

  3.5 批量处理

  3.5.1 多段文本排队

  - 用户可多次选择不同文本，依次加入队列
  - 队列按添加顺序处理（FIFO）
  - 支持暂停/继续处理

  3.5.2 并发控制

  - 最多同时处理 N 个请求（可配置，默认 1）
  - 避免 API 限流和过载

  ---
  4. UI/UX 设计

  4.1 交互流程图

  用户选中文本
      ↓
  右键菜单「发送到 Claude 编辑」
      ↓
  文本加入 Dock 队列（状态：等待中）
      ↓
  自动/手动触发 AI 处理（状态：处理中）
      ↓
  AI 返回结果（状态：已完成）
      ↓
  在编辑器中显示差异对比
      ↓
  用户选择：应用/拒绝/重新生成
      ↓
  应用后更新原文，移除对比视图

  4.2 快捷操作

  - 快速应用：Ctrl+Enter 应用当前差异
  - 快速拒绝：Ctrl+Backspace 拒绝当前差异
  - 下一个差异：Ctrl+↓ 跳到下一个待处理项

  4.3 反馈机制

  - 加载动画：处理中显示旋转图标和进度提示
  - 成功提示：应用修改后显示 Toast："✓ 已应用 AI 建议"
  - 错误提示：请求失败显示具体错误信息

  ---
  5. 技术架构

  5.1 核心模块

  5.1.1 TextSelectionManager

  负责管理选中文本的生命周期
  class TextSelectionManager {
    private selections: Map<string, TextSelection>;

    addSelection(blockId: string, range: Range): string;
    removeSelection(id: string): void;
    getSelection(id: string): TextSelection | null;
    updateStatus(id: string, status: SelectionStatus): void;
    extractContext(blockId: string, lineRange: LineRange): Context;
  }

  5.1.2 AIEditProcessor

  处理 AI 编辑请求
  class AIEditProcessor {
    async processSelection(
      selection: TextSelection,
      instruction?: string
    ): Promise<EditResult>;

    private buildPrompt(selection: TextSelection): string;
    private parseAIResponse(response: string): EditSuggestion;
  }

  5.1.3 DiffRenderer

  渲染差异对比视图
  class DiffRenderer {
    renderDiff(
      original: string,
      modified: string,
      targetBlock: HTMLElement
    ): DiffView;

    applyChanges(diffView: DiffView): void;
    rejectChanges(diffView: DiffView): void;
  }

  5.1.4 EditQueue (新增)

  管理编辑队列和并发控制
  class EditQueue {
    private queue: TextSelection[];
    private processing: Set<string>;
    private maxConcurrent: number;

    enqueue(selection: TextSelection): void;
    processNext(): Promise<void>;
    pauseQueue(): void;
    resumeQueue(): void;
  }

  5.2 数据流

  右键菜单 → TextSelectionManager.addSelection()
            ↓
        EditQueue.enqueue()
            ↓
    AIEditProcessor.processSelection()
            ↓
       ClaudeClient.sendMessage()
            ↓
    AIEditProcessor.parseAIResponse()
            ↓
      DiffRenderer.renderDiff()
            ↓
        用户交互
            ↓
    DiffRenderer.applyChanges() / rejectChanges()

  5.3 思源 API 集成

  5.3.1 右键菜单注册

  // 使用思源的 protyle.toolbar API
  this.addCommand({
    langKey: "aiEdit",
    hotkey: "⌃⇧E",
    editorCallback: (protyle) => {
      const selection = protyle.getSelection();
      this.textSelectionManager.addSelection(selection);
    }
  });

  5.3.2 块操作

  // 获取块内容
  const blockContent = await this.getBlockContent(blockId);

  // 更新块内容
  await this.updateBlock(blockId, newContent);

  // 插入差异对比块（临时块）
  await this.insertTempBlock(blockId, diffHTML, position: 'after');

  ---
  6. 边缘情况处理

  6.1 文本选择边界

  | 场景          | 处理方式                |
  |-------------|---------------------|
  | 选中少于 1 行    | 提示用户至少选择一行完整文本      |
  | 选中超过 1000 行 | 警告：文本过长，建议分段处理      |
  | 跨多个文档块选择    | 分别处理每个块，生成多个编辑任务    |
  | 选中代码块内容     | 保留代码块标记（```），确保格式一致 |
  | 选中表格        | 保留 Markdown 表格语法    |

  6.2 上下文提取边界

  | 场景       | 处理方式            |
  |----------|-----------------|
  | 上文不足设定行数 | 提取到文档开头即可，不报错   |
  | 下文不足设定行数 | 提取到文档末尾即可       |
  | 遇到标题分隔   | 停止提取，避免跨章节污染上下文 |
  | 遇到代码块边界  | 完整包含代码块，不截断     |

  6.3 AI 响应异常

  | 场景         | 处理方式               |
  |------------|--------------------|
  | API 超时     | 显示错误，提供重试按钮        |
  | 返回格式错误     | 尝试智能解析，失败则提示用户     |
  | 返回内容为空     | 提示 AI 未提供建议，允许重新生成 |
  | Token 超限   | 自动缩减上下文行数，重新请求     |
  | API Key 无效 | 跳转到设置页面提示配置        |

  6.4 并发冲突

  | 场景           | 处理方式             |
  |--------------|------------------|
  | 同一块多次编辑      | 仅保留最新的编辑任务，丢弃旧的  |
  | 用户手动修改了原文    | 检测到变化后，标记差异视图为过期 |
  | 差异视图未关闭时再次编辑 | 提示用户先处理当前差异      |

  6.5 性能优化

  - 大文本处理：选中超过 500 行时，自动分段处理（每 100 行一段）
  - 缓存策略：相同文本 + 相同指令 24 小时内使用缓存结果
  - 节流限流：右键菜单点击间隔 < 1 秒时忽略

  ---
  7. 配置项

  7.1 设置面板新增项

  interface EditSettings {
    // 上下文配置
    contextLinesBefore: number;      // 上文行数 (0-50)
    contextLinesAfter: number;       // 下文行数 (0-50)

    // 编辑指令模板
    defaultInstruction: string;      // 默认编辑指令
    customInstructions: string[];    // 自定义指令列表

    // 队列配置
    maxConcurrentEdits: number;      // 最大并发数 (1-3)
    autoProcessQueue: boolean;       // 自动处理队列

    // 差异显示
    showDiffInline: boolean;         // 是否内联显示差异
    diffHighlightColor: string;      // 高亮颜色

    // 快捷键
    hotkeySendToAI: string;          // 发送到 AI (默认 Ctrl+Shift+E)
    hotkeyApplyDiff: string;         // 应用差异 (默认 Ctrl+Enter)
    hotkeyRejectDiff: string;        // 拒绝差异 (默认 Ctrl+Backspace)
  }

  ---
  8. 实现优先级

  P0 (MVP - 必须实现)

  1. 右键菜单集成
  2. 基本文本选择和发送
  3. AI 请求与响应
  4. 简单差异对比（纯文本）
  5. 应用/拒绝修改

  P1 (核心增强)

  1. 上下文智能提取
  2. Dock 队列面板
  3. 批量处理
  4. 可视化差异高亮

  P2 (高级功能)

  1. 自定义编辑指令
  2. 编辑历史记录
  3. 快捷键支持
  4. 性能优化（缓存、分段）

  ---
  9. 成功指标

  - 可用性：90% 的用户能在 30 秒内完成首次 AI 编辑
  - 准确性：AI 建议采纳率 > 60%
  - 性能：单次编辑请求响应时间 < 5 秒
  - 稳定性：错误率 < 5%

  ---
  10. 风险与缓解

  | 风险        | 影响  | 缓解措施             |
  |-----------|-----|------------------|
  | 思源 API 变更 | 高   | 跟踪官方 API 文档，及时适配 |
  | AI 响应质量差  | 中   | 提供手动编辑和重新生成功能    |
  | 大文本性能问题   | 中   | 实现分段处理和进度提示      |
  | 用户误操作覆盖   | 高   | 实现编辑历史和撤销功能（P2）  |

  ---