# OpenAI API Setup Guide (Updated 2025)

## 🆕 最新更新：GPT-4o, o1, o3-mini 系列

OpenAI 已发布多个新模型系列，包括 GPT-4o（多模态旗舰）、o1/o3 推理模型等。

---

## 如何获取 OpenAI API Key

### 步骤 1: 访问 OpenAI Platform
打开浏览器访问: https://platform.openai.com/api-keys

### 步骤 2: 登录 OpenAI 账号
使用你的 OpenAI 账号登录（需要注册账号）

### 步骤 3: 创建 API Key
1. 点击 "Create new secret key" 按钮
2. 输入一个名称（可选）
3. 复制生成的 API Key（只显示一次！）

### 步骤 4: 验证 API Key 格式
正确的 OpenAI API Key 格式应该：
- ✅ 以 `sk-` 开头
- ✅ 长度约为 51 个字符
- ✅ 示例: `sk-proj-...` 或 `sk-...`

---

## 模型选择指南 🎯

### GPT-4o 系列 (最新旗舰 - 2024-2025) ⭐

#### 🌟 ChatGPT-4o Latest (推荐)
- **用途**: 日常对话、内容创作、代码生成
- **特点**: 自动指向最新 GPT-4o 版本
- **上下文**: 128k tokens
- **输出**: 16k tokens
- **模型ID**: `chatgpt-4o-latest`
- **适合**: 大多数应用场景 ⭐⭐⭐⭐⭐

#### ⚡ GPT-4o
- **用途**: 多模态任务（文本+图像+音频）
- **特点**: 高性能，支持视觉理解
- **上下文**: 128k tokens
- **输出**: 16k tokens
- **模型ID**: `gpt-4o`
- **适合**: 需要多模态能力的场景

#### 🚀 GPT-4o Mini
- **用途**: 高频调用、简单任务
- **特点**: 速度快、成本低（60% cheaper than GPT-4o）
- **上下文**: 128k tokens
- **输出**: 16k tokens
- **模型ID**: `gpt-4o-mini`
- **适合**: 成本敏感型应用 ⭐⭐⭐⭐

### o 系列推理模型 (2025) 🧠

#### 🧠 o1 (深度推理)
- **用途**: 复杂问题求解、数学、科学、编程
- **特点**: 内置"思考链"，推理能力最强
- **上下文**: 200k tokens
- **输出**: 100k tokens
- **模型ID**: `o1`
- **适合**: 需要深度推理的复杂任务

#### o1-preview
- **用途**: 高级推理任务
- **上下文**: 128k tokens
- **输出**: 32k tokens
- **模型ID**: `o1-preview`
- **适合**: 提前体验 o1 能力

#### o1-mini
- **用途**: STEM 任务、编程
- **特点**: 成本效率高（80% cheaper than o1-preview）
- **上下文**: 128k tokens
- **输出**: 65k tokens
- **模型ID**: `o1-mini`
- **适合**: 编程和理工科任务

#### o3-mini (最新 - 2025年1月)
- **用途**: 小型推理任务
- **特点**: 与 o1-mini 相同成本和延迟，但更智能
- **上下文**: 128k tokens
- **输出**: 65k tokens
- **模型ID**: `o3-mini`
- **适合**: 需要推理能力的日常任务 ⭐⭐⭐⭐

### GPT-4 Turbo 系列 (传统高性能)

#### GPT-4 Turbo
- **模型ID**: `gpt-4-turbo`
- **特点**: 128k上下文，知识截止到2024年4月
- **适合**: 需要大上下文的任务

#### GPT-4 Classic
- **模型ID**: `gpt-4`
- **特点**: 原始GPT-4，稳定可靠
- **适合**: 保守用户

### GPT-3.5 系列 (经济型)

#### GPT-3.5 Turbo
- **模型ID**: `gpt-3.5-turbo`
- **特点**: 速度快、价格低
- **上下文**: 16k tokens
- **输出**: 4k tokens
- **适合**: 简单对话、预算有限

---

## ⚠️ 常见错误

### 错误 1: "Incorrect API key provided"
**原因**: API Key 格式不正确或已过期

**解决方法**:
1. 检查 API Key 是否以 `sk-` 开头
2. 确认没有复制多余的空格
3. 在 OpenAI Platform 中重新生成 API Key
4. 确认账户有余额或已绑定支付方式

**控制台提示**:
```
[OpenAIProvider] API key format warning: Expected to start with 'sk-', got 'AIza...'
```

### 错误 2: "模型不存在" / "The model does not exist"
**原因**: 选择了不存在或无权访问的模型

**解决方法**:
推荐使用以下模型（按优先级排序）：

**GPT-4o 系列** (推荐)
- `chatgpt-4o-latest` - 自动更新到最新版 ⭐⭐⭐⭐⭐
- `gpt-4o` - 多模态旗舰
- `gpt-4o-mini` - 快速省钱

**o 系列推理模型** (2025最新)
- `o3-mini` - 最新小型推理模型 ⭐⭐⭐⭐
- `o1` - 深度推理旗舰
- `o1-mini` - 编程和STEM任务

**传统模型**
- `gpt-4-turbo` - 大上下文
- `gpt-3.5-turbo` - 经济型

### 错误 3: "You exceeded your current quota"
**原因**: API 使用配额已用完

**解决方法**:
1. 访问 https://platform.openai.com/account/billing
2. 检查账户余额
3. 添加支付方式或充值
4. 检查使用限制（免费试用有限额）

### 错误 4: "Rate limit reached"
**原因**: 请求频率超过限制

**解决方法**:
1. 降低请求频率
2. 使用更小的模型（如 gpt-4o-mini）
3. 升级账户获得更高配额
4. 实现请求队列和重试机制

---

## API Key 安全注意事项 🔒

### DO (推荐做法)
- ✅ 定期轮换 API Key
- ✅ 使用环境变量存储
- ✅ 设置使用限额
- ✅ 监控使用情况

### DON'T (不要做)
- ❌ 将 API Key 提交到 Git
- ❌ 在前端代码中硬编码
- ❌ 与他人分享 API Key
- ❌ 使用同一个 Key 在多个项目

---

## 配额和定价 (2025)

### 免费试用
- 新用户可获得 $5 免费额度
- 有效期 3 个月
- 部分模型受限

### 付费计划 (Pay-as-you-go)

**GPT-4o 系列**:
- GPT-4o: $2.50/1M input tokens, $10.00/1M output tokens
- GPT-4o-mini: $0.15/1M input tokens, $0.60/1M output tokens

**o 系列推理模型**:
- o1: $15/1M input tokens, $60/1M output tokens
- o1-mini: $3/1M input tokens, $12/1M output tokens
- o3-mini: 与 o1-mini 相同

**GPT-4 Turbo**:
- $10/1M input tokens, $30/1M output tokens

**GPT-3.5 Turbo**:
- $0.50/1M input tokens, $1.50/1M output tokens

**注意**: 价格可能变动，请访问官网查看最新定价。

---

## 速率限制 (Rate Limits)

根据账户等级不同：

**免费试用**:
- 每分钟 3 次请求 (RPM)
- 每天 200 次请求 (RPD)

**付费账户** (Tier 1-5):
- Tier 1: 500 RPM, 10,000 RPD
- Tier 5: 10,000 RPM, 5,000,000 RPD

**推理模型** (o1, o3):
- 通常有更严格的限制
- 建议使用 o1-mini 或 o3-mini 进行高频调用

---

## 测试 API Key

### 在插件设置中

1. **选择 AI 提供商**: OpenAI
2. **输入 API Key**: 必须以 `sk-` 开头
3. **选择模型**: `chatgpt-4o-latest` (推荐⭐)
4. **点击 "测试连接"**

### 成功示例

控制台输出:
```
[OpenAIProvider] Initializing with API key: sk-proj-Ab...
[OpenAIProvider] Model ID: chatgpt-4o-latest
[OpenAIProvider] Base URL: https://api.openai.com/v1
[UniversalAIClient] Initialized provider: OpenAI
```

### 失败示例

```
[OpenAIProvider] API key format warning: Expected to start with 'sk-'
Error: Incorrect API key provided
```

---

## 调试信息

插件会在控制台输出调试信息：

```javascript
[OpenAIProvider] Initializing with API key: sk-proj-Ab...
[OpenAIProvider] Model ID: chatgpt-4o-latest
[OpenAIProvider] Base URL: https://api.openai.com/v1
```

如果看到警告：
```
[OpenAIProvider] API key format warning: Expected to start with 'sk-', got 'AIza...'
[OpenAIProvider] This may indicate an invalid API key format
```

说明你可能使用了其他平台（如 Google Gemini）的 API key。

---

## 模型对比表

| 模型 | 推理能力 | 速度 | 成本 | 上下文 | 推荐度 |
|------|---------|------|------|--------|--------|
| **chatgpt-4o-latest** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | 128k | ⭐⭐⭐⭐⭐ |
| **gpt-4o** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | 128k | ⭐⭐⭐⭐ |
| **gpt-4o-mini** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 128k | ⭐⭐⭐⭐ |
| **o1** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐ | 200k | ⭐⭐⭐⭐ |
| **o3-mini** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | 128k | ⭐⭐⭐⭐ |
| gpt-4-turbo | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | 128k | ⭐⭐⭐ |
| gpt-3.5-turbo | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 16k | ⭐⭐ |

**推荐**: 日常使用 `chatgpt-4o-latest`，需要推理使用 `o3-mini` ⭐⭐⭐⭐⭐

---

## 反向代理配置

### 使用自定义端点

如果你使用第三方 API 代理或自建服务：

1. 选择 AI 提供商: OpenAI
2. API 端点: 自定义端点 / 反向代理
3. 输入你的代理 URL，例如:
   - `https://your-proxy.com/v1`
   - `https://api.openai-proxy.com/v1`
4. 确保 URL 以 `/v1` 结尾

**注意**: 某些代理可能需要特殊的 API Key 格式。

---

## 相关链接

- **OpenAI Platform**: https://platform.openai.com/
- **API Keys 管理**: https://platform.openai.com/api-keys
- **API 文档**: https://platform.openai.com/docs/
- **模型列表**: https://platform.openai.com/docs/models
- **定价**: https://openai.com/pricing
- **使用统计**: https://platform.openai.com/usage
- **o1 系列文档**: https://platform.openai.com/docs/guides/reasoning

---

## 支持

如果遇到问题，请在 GitHub Issues 中报告，并附上：
1. 浏览器控制台的错误信息 (F12)
2. API Key 的前 7 位字符 (例如: `sk-proj...`)
3. 选择的模型名称
4. 完整的错误堆栈信息

---

**最后更新**: 2025-01-12
**文档版本**: 2.0 (GPT-4o & o-Series Update)
