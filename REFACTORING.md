# Architecture Refactoring Log

本文档记录插件架构的重大重构和改进。

---

## v0.9.0 - 架构现代化与扩展性提升 (2025-01-06)

### 概述

本次重构专注于修复严重缺陷并为未来功能扩展打下基础，同时保持完全向后兼容。

### 阶段 1: 严重问题修复 ⚠️

#### 1.1 修复异步初始化竞态条件
**问题**: 使用 `setTimeout(100ms)` 等待设置加载，存在竞态条件风险
**文件**: `src/settings/SettingsManager.ts`, `src/index.ts`
**解决方案**:
- 添加 `waitForLoad()` 方法返回加载 Promise
- index.ts 使用 `await settingsManager.waitForLoad()` 替代 setTimeout
- 消除不确定性，确保设置完全加载后再初始化

**影响**: ✅ 防止用户设置被默认值覆盖

#### 1.2 修复 SQL 注入漏洞
**问题**: blockId 直接拼接到 SQL 查询，存在注入风险
**文件**: `src/quick-edit/ContextExtractor.ts`
**解决方案**:
- 添加 `sanitizeBlockId()` 方法验证 blockId 格式
- 验证 parentId 和数值参数（currentSort, count）
- 限制 count 范围（1-100）

**影响**: ✅ 消除 SQL 注入攻击向量

#### 1.3 内存泄漏已验证修复
**状态**: 已在之前版本修复
**验证**:
- QuickEditManager.destroy() 正确清理所有监听器
- handleAccept/handleReject 调用 cleanupBlock()
- InstructionInputPopup 覆盖 remove() 清理全局监听器

#### 1.4 空值安全检查已验证
**状态**: 已在之前版本添加
**验证**: 关键路径（QuickEditManager:573-577, 592）已有空值检查

---

### 阶段 2: 架构扩展性提升 🏗️

#### 2.1 AI Provider 抽象层

**目标**: 支持多种 AI 提供商（OpenAI, Gemini, 本地模型等）

**新增文件**:
```
src/ai/
├── types.ts              # AIProvider 接口定义
├── AnthropicProvider.ts  # Anthropic/Claude 实现
├── AIProviderFactory.ts  # Provider 工厂
└── index.ts              # 模块导出
```

**核心接口**:
```typescript
interface AIProvider {
    sendMessage(messages, options): Promise<string>
    streamMessage(messages, options): Promise<void>
    validateConfig(config): boolean | string
    getAvailableModels(): string[]
}
```

**支持的 Provider 类型**:
- `anthropic` - Claude (已实现)
- `openai` - GPT-4, GPT-3.5 (待实现)
- `gemini` - Google Gemini (待实现)
- `custom` - 自定义 API 端点

**扩展示例**:
```typescript
// 未来添加 OpenAI 支持
AIProviderFactory.register({
    type: 'openai',
    factory: (config) => new OpenAIProvider(config),
    displayName: 'OpenAI',
    description: 'GPT-4, GPT-3.5 and other OpenAI models'
});
```

**向后兼容性**: ✅ 完全兼容
- 现有 ClaudeClient 继续工作
- 新代码可选使用 AIProvider 接口
- 无配置迁移需求

---

#### 2.2 高级过滤管道

**目标**: 提供可扩展的响应处理中间件系统

**新增文件**:
```
src/filter/
├── FilterPipeline.ts  # 管道核心
├── middleware.ts      # 内置中间件
└── index.ts           # 更新导出
```

**核心概念**:
```typescript
interface FilterMiddleware {
    readonly name: string;
    process(response, context): Promise<string> | string;
    validate?(): boolean | string;
}

class FilterPipeline {
    use(middleware): this           // 添加中间件
    execute(response): Promise<string>  // 执行管道
}
```

**内置中间件**:
1. **RegexFilterMiddleware** - 包装现有 regex 过滤
2. **CodeBlockNormalizerMiddleware** - 规范化代码块格式
3. **MarkdownLinkFixerMiddleware** - 修复错误的 markdown 链接
4. **WhitespaceTrimmerMiddleware** - 清理多余空白
5. **CustomFunctionMiddleware** - 自定义转换函数
6. **ConditionalMiddleware** - 条件执行
7. **PresetSpecificMiddleware** - 仅用于特定预设

**使用示例**:
```typescript
const pipeline = new FilterPipeline();

// 基础过滤
pipeline.use(new RegexFilterMiddleware(filterRules));

// 代码块规范化
pipeline.use(new CodeBlockNormalizerMiddleware());

// 自定义过滤
pipeline.use(new CustomFunctionMiddleware('RemoveEmojis',
    (response) => response.replace(/[\u{1F600}-\u{1F64F}]/gu, '')
));

// 执行管道
const filtered = await pipeline.execute(aiResponse, 'QuickEdit', presetId);
```

**扩展性**:
- 用户可编写自定义中间件
- 支持异步中间件（API 调用、文件操作）
- 中间件可访问上下文元数据
- 管道可动态配置

**向后兼容性**: ✅ 完全兼容
- 现有 responseFilter 继续工作
- 管道是可选增强功能
- 无需修改现有代码

---

### 阶段 3: 构建验证 ✅

**构建状态**: ✅ 成功
**构建时间**: 1.22s
**包大小**: 1,362.93 kB (gzip: 419.97 kB)
**警告**: 仅 Sass 和类型导入警告（不影响功能）

---

## 未来重构计划

### 高优先级 (P1)
- [ ] 拆分 QuickEditManager (2078 行 → 多个专职类)
  - SelectionHandler - 处理选区
  - PromptBuilder - 构建提示词
  - BlockOperations - SiYuan API 操作
  - EditStateManager - 状态管理
- [ ] 实现配置迁移机制 (ConfigMigrator)
- [ ] 启用 TypeScript strict 模式

### 中优先级 (P2)
- [ ] 添加单元测试（ConfigMigrator, AIProvider, FilterPipeline）
- [ ] 实现 OpenAIProvider 和 GeminiProvider
- [ ] 创建 ARCHITECTURE.md 文档

### 低优先级 (P3)
- [ ] 提取魔法数字为常量
- [ ] 统一 i18n 系统
- [ ] 添加性能监控

---

## 重构原则

1. **向后兼容优先** - 所有重构必须保持用户数据和配置兼容
2. **渐进式改进** - 每个阶段独立提交，可独立回滚
3. **测试驱动** - 核心模块必须有单元测试
4. **文档同步** - 重构必须更新相关文档

---

## 相关文档

- [CLAUDE.md](CLAUDE.md) - 开发指南
- [RELEASE.md](RELEASE.md) - 发布流程
- 架构文档 (待创建): ARCHITECTURE.md

---

**最后更新**: 2025-01-06
**重构负责人**: Claude Code Review + Architecture Refactoring
