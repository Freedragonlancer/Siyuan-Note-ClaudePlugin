# OpenAI 模型列表更新说明

**更新日期**: 2025-01-14
**更新内容**: 添加 OpenAI GPT-5.1 系列最新模型

---

## 🚀 新增模型

### GPT-5.1 系列 (2025年11月发布)

OpenAI 于 2025年11月12-13日发布了 GPT-5.1 系列模型，这是最新一代的旗舰模型。

#### 核心模型

1. **gpt-5.1-chat-latest** - GPT-5.1 Chat Latest
   - **特性**: 最新旗舰模型，自适应推理
   - **描述**: GPT-5.1 Instant，将成为 ChatGPT 的默认模型
   - **推荐**: ✅ 现已设置为默认推荐模型
   - **优势**: 更加对话化，改进的指令遵循能力和自适应推理

2. **gpt-5.1** - GPT-5.1 Thinking
   - **特性**: 深度推理，动态思考
   - **描述**: 根据问题复杂度动态调整思考时间
   - **适用场景**: 需要深度推理的复杂任务

3. **gpt-5.1-codex** - GPT-5.1 Codex
   - **特性**: 编程专用模型
   - **描述**: 针对代码生成和理解优化
   - **适用场景**: 代码编写、调试、重构

4. **gpt-5.1-codex-mini** - GPT-5.1 Codex Mini
   - **特性**: 编程轻量版
   - **描述**: 更快速的代码辅助
   - **适用场景**: 快速代码补全和简单编程任务

#### 关键特性

- **自适应推理**: 模型能够根据任务复杂度动态调整推理时间
- **可控推理**: 开发者可以通过设置 `reasoning_effort` 为 `'none'` 来禁用推理，适用于低延迟场景
- **扩展缓存**: 支持最长 24 小时的提示缓存

### GPT-5 系列

5. **gpt-5** - GPT-5
   - **特性**: 前代旗舰模型
   - **描述**: GPT-5.1 发布前的主力模型

### 更新的 o 系列推理模型

新增了更多推理模型变体：

6. **o4-mini** - o4-mini
   - **特性**: 最新推理模型（2025）
   - **描述**: 最新一代推理模型的轻量版

7. **o3** - o3
   - **特性**: 高级推理
   - **描述**: 第三代推理模型完整版

8. **o3-mini** (2025-01-31)
   - **特性**: 推理模型精简版
   - **描述**: 增强的推理能力，性价比高

---

## 📋 完整模型列表

### 现已支持的所有 OpenAI 模型

#### GPT-5.1 系列 (最新 - 2025年11月)
- `gpt-5.1-chat-latest` 🌟 **推荐**
- `gpt-5.1`
- `gpt-5.1-codex`
- `gpt-5.1-codex-mini`

#### GPT-5 系列
- `gpt-5`

#### GPT-4o 系列 (2024-2025)
- `chatgpt-4o-latest`
- `gpt-4o`
- `gpt-4o-2024-11-20`
- `gpt-4o-mini`

#### o 系列推理模型 (2025)
- `o4-mini`
- `o3`
- `o3-mini` (2025-01-31)
- `o1`
- `o1-preview`
- `o1-mini`

#### GPT-4 系列 (传统但仍支持)
- `gpt-4-turbo`
- `gpt-4`

#### GPT-3.5 系列 (经济型)
- `gpt-3.5-turbo`

---

## 🔧 更新的文件

### 1. 设置面板模型列表
**文件**: `src/settings/SettingsPanelV3.ts`

**更改位置**: Line 359-389

**更新内容**:
- 添加 GPT-5.1 系列所有 4 个模型
- 添加 GPT-5 模型
- 更新 o 系列模型列表（添加 o4-mini, o3）
- 重新组织模型分组和注释

### 2. 推荐模型配置
**文件**: `src/config/constants.ts`

**更改位置**: Line 80-87

**更新内容**:
```typescript
export const RECOMMENDED_MODELS = {
    openai: 'gpt-5.1-chat-latest',  // 从 'gpt-4o' 更新为 'gpt-5.1-chat-latest'
    // ...
}
```

### 3. 模型显示名称映射
**文件**: `src/sidebar/UnifiedAIPanel.ts`

**更改位置**: Line 1783-1803

**更新内容**:
- 添加 GPT-5.1 系列的简短显示名称
- 添加 GPT-5 的显示名称
- 更新 o 系列模型的显示名称

---

## 📊 模型选择建议

### 按使用场景推荐

| 使用场景 | 推荐模型 | 原因 |
|---------|---------|------|
| **通用对话** | `gpt-5.1-chat-latest` | 最新旗舰，自适应推理，性能最佳 |
| **深度推理任务** | `gpt-5.1` | 动态思考时间，复杂问题处理更好 |
| **代码生成** | `gpt-5.1-codex` | 专门为编程优化 |
| **快速代码补全** | `gpt-5.1-codex-mini` | 响应速度快，适合实时编码 |
| **复杂推理** | `o4-mini` 或 `o3` | 专门的推理模型，适合数学、逻辑问题 |
| **性价比** | `gpt-4o-mini` | 速度快，成本低，适合简单任务 |
| **多模态任务** | `gpt-4o` | 支持图像理解 |

### 按性能/成本权衡

| 性能等级 | 推荐模型 | 适用场景 |
|---------|---------|---------|
| 🏆 **最强** | `gpt-5.1-chat-latest` | 重要任务，需要最佳质量 |
| ⚡ **快速** | `gpt-5.1-codex-mini` | 实时交互，快速响应 |
| 💰 **经济** | `gpt-4o-mini` | 大量简单任务 |
| 🧠 **推理** | `o4-mini` / `o3-mini` | 需要逻辑推理的任务 |

---

## 🎯 默认推荐变更

**之前**: `gpt-4o`
**现在**: `gpt-5.1-chat-latest`

**变更原因**:
1. GPT-5.1 是最新发布的旗舰模型
2. 自适应推理能力更强
3. 改进的指令遵循和对话能力
4. OpenAI 官方将其作为 ChatGPT 的默认模型

---

## 📖 参考资料

### 官方发布信息
- [OpenAI GPT-5.1 发布公告](https://openai.com/index/gpt-5-1/)
- [GPT-5.1 开发者指南](https://openai.com/index/gpt-5-1-for-developers/)
- [GPT-5.1 系统卡增补](https://openai.com/index/gpt-5-system-card-addendum-gpt-5-1/)

### GitHub Copilot 集成
- [GitHub Copilot 中的 GPT-5.1](https://github.blog/changelog/2025-11-13-openais-gpt-5-1-gpt-5-1-codex-and-gpt-5-1-codex-mini-are-now-in-public-preview-for-github-copilot/)

### 新闻报道
- [Techzine: OpenAI 发布 GPT-5.1](https://www.techzine.eu/news/applications/136324/openai-releases-gpt-5-1-after-criticism-of-gpt-5/)
- [eWeek: GPT-5.1 更智能更快更人性化](https://www.eweek.com/news/openai-releases-gpt-5-1/)

---

## ⚠️ 注意事项

### API 密钥要求
- 使用 GPT-5.1 系列模型需要有效的 OpenAI API 密钥
- 确保您的 API 密钥有权限访问这些新模型

### 定价信息
- GPT-5.1 系列的定价信息请参考 [OpenAI 定价页面](https://openai.com/pricing)
- 推理模型（o 系列）的定价可能与标准模型不同

### 推理模式控制
对于 GPT-5.1 模型，可以通过 API 参数控制推理行为：
```javascript
{
    model: "gpt-5.1",
    reasoning_effort: "none"  // 禁用推理，降低延迟
}
```

### 缓存优化
GPT-5.1 支持最长 24 小时的提示缓存，可以减少重复请求的成本。

---

## 🔄 部署更新

更新已包含在构建中，执行以下命令即可部署：

```bash
cd N:\AI_Code\Siyuan-note-plugin

# 构建并部署
npm run deploy

# 或使用清理部署（如果遇到问题）
npm run clean-deploy
```

部署后，在思源笔记的插件设置中即可看到新的 GPT-5.1 模型选项。

---

## 📅 版本历史

### v0.12.3 (计划)
- ✅ 添加 OpenAI GPT-5.1 系列模型支持
- ✅ 更新默认推荐模型为 gpt-5.1-chat-latest
- ✅ 添加 o4-mini、o3、o3-mini 推理模型
- ✅ 优化模型显示名称

---

**最后更新**: 2025-01-14
**状态**: ✅ 已完成并验证
