# Gemini API Setup Guide (Updated 2025)

## 🆕 最新更新：Gemini 2.5 系列已发布

Google 已发布 Gemini 2.5 Pro 和 2.5 Flash 系列，具有更强的推理能力和100万token上下文窗口。

---

## 如何获取 Gemini API Key

### 步骤 1: 访问 Google AI Studio
打开浏览器访问: https://makersuite.google.com/app/apikey

### 步骤 2: 登录 Google 账号
使用你的 Google 账号登录（需要有 Google 账号）

### 步骤 3: 创建 API Key
1. 点击 "Create API Key" 按钮
2. 选择或创建一个 Google Cloud 项目
3. 复制生成的 API Key

### 步骤 4: 验证 API Key 格式
正确的 Gemini API Key 格式应该：
- ✅ 以 `AIza` 开头
- ✅ 长度约为 39 个字符
- ✅ 示例: `AIzaSyD...` (完整的key会更长)

---

## 模型选择指南 🎯

### Gemini 2.5 系列 (最新 - 2025)

#### 🌟 Gemini 2.5 Pro
- **用途**: 复杂推理、编程、长文档分析
- **特点**: 最强推理能力，支持"思考"模式（thinking mode）
- **上下文**: 100万 tokens (即将支持200万)
- **模型ID**: `gemini-2.5-pro`
- **适合**: 需要深度思考的复杂任务、代码生成

#### ⚡ Gemini 2.5 Flash (推荐)
- **用途**: 日常对话、快速响应、高并发场景
- **特点**: 最佳性价比，保持低延迟
- **上下文**: 100万 tokens
- **模型ID**: `gemini-2.5-flash`
- **适合**: 大多数应用场景 ⭐⭐⭐⭐⭐

#### 🚀 Gemini 2.5 Flash Lite
- **用途**: 简单查询、高频次调用
- **特点**: 最快速度、最低成本
- **上下文**: 100万 tokens
- **模型ID**: `gemini-2.5-flash-lite`
- **适合**: 成本敏感型应用、大量简单请求

#### 🖼️ Gemini 2.5 Flash Image
- **用途**: 图像理解、图像生成
- **特点**: 多模态能力（文本+图像）
- **模型ID**: `gemini-2.5-flash-image`
- **适合**: 需要处理图片的场景

### Gemini 2.0 系列

#### Gemini 2.0 Flash
- **模型ID**: `gemini-2.0-flash`
- **特点**: 下一代功能，稳定版
- **适合**: 需要2.0特性但不需要2.5的场景

### Gemini 1.5 系列 (上一代)

#### Gemini 1.5 Pro Latest
- **模型ID**: `gemini-1.5-pro-latest`
- **特点**: 1.5系列最新版本
- **适合**: 还未升级到2.5的用户

---

## ⚠️ 常见错误

### 错误 1: "API key not valid"
**原因**: API Key 格式不正确或已过期

**解决方法**:
1. 检查 API Key 是否以 `AIza` 开头
2. 确认没有复制多余的空格
3. 在 Google AI Studio 中重新生成 API Key
4. 确认你的 Google Cloud 项目已启用 "Generative Language API"

**控制台提示**:
```
[GeminiProvider] API key format warning: Expected to start with 'AIza', got 'sk-a...'
```

### 错误 2: "模型不存在"
**原因**: 选择了已废弃的模型

**解决方法**:
推荐使用以下模型（按性能排序）：

**Gemini 2.5 系列 (最新 - 2025)** ⭐
- `gemini-2.5-pro` - 最强推理能力，100万token上下文
- `gemini-2.5-flash` - **推荐**，最佳性价比 ⭐⭐⭐⭐⭐
- `gemini-2.5-flash-lite` - 最快速度，成本最低
- `gemini-2.5-flash-image` - 支持图像生成和理解

**Gemini 2.0 系列**
- `gemini-2.0-flash` - 下一代功能，稳定版
- `gemini-2.0-flash-exp` - 实验版，可能有新特性

**Gemini 1.5 系列** (上一代)
- `gemini-1.5-pro-latest` - 1.5系列最新版
- `gemini-1.5-flash-latest` - 1.5 Flash最新版

**⚠️ 不推荐使用**:
- ~~`gemini-pro`~~ (旧版本，已废弃)
- ~~`gemini-pro-vision`~~ (已被2.5系列取代)

---

## 启用 Generative Language API

如果遇到权限错误，需要在 Google Cloud Console 启用 API：

1. 访问: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com
2. 选择你的项目
3. 点击 "Enable" 启用 API
4. 等待几分钟让API生效

---

## 配额限制

### 免费额度 (Free tier)
- 每分钟 15 次请求
- 每天 1,500 次请求
- 每分钟 100 万 tokens

**注意**: Gemini 2.5 Pro 可能有不同的速率限制

### 付费额度 (需要配置计费)
- 需要在 Google Cloud Console 配置计费账户
- 更高的速率限制
- 按使用量计费

---

## 测试 API Key

### 在插件设置中

1. **选择 AI 提供商**: Google Gemini
2. **输入 API Key**: 必须以 `AIza` 开头
3. **选择模型**: `gemini-2.5-flash` (推荐⭐)
4. **点击 "测试连接"**

### 成功示例

控制台输出:
```
[GeminiProvider] Initializing with API key: AIzaSyD...
[GeminiProvider] Model ID: gemini-2.5-flash
[UniversalAIClient] Initialized provider: Google Gemini
```

### 失败示例

如果测试失败，检查浏览器控制台 (F12) 的错误信息：

```
[GeminiProvider] API key format warning: Expected to start with 'AIza'
Error: API key not valid. Please pass a valid API key.
```

---

## 调试信息

插件会在控制台输出调试信息：

```javascript
[GeminiProvider] Initializing with API key: AIzaSyD...
[GeminiProvider] Model ID: gemini-2.5-flash
```

如果看到警告信息：
```
[GeminiProvider] API key format warning: Expected to start with 'AIza', got 'sk-a...'
[GeminiProvider] This may indicate an invalid API key format
```

说明你可能使用了其他平台（如OpenAI）的API key。

---

## 性能对比表

| 模型 | 推理能力 | 速度 | 成本 | 上下文 | 推荐度 |
|------|---------|------|------|--------|--------|
| **gemini-2.5-pro** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | 1M | ⭐⭐⭐⭐ |
| **gemini-2.5-flash** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 1M | ⭐⭐⭐⭐⭐ |
| **gemini-2.5-flash-lite** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 1M | ⭐⭐⭐⭐ |
| gemini-2.0-flash | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 1M | ⭐⭐⭐ |
| gemini-1.5-pro | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | 1M | ⭐⭐ |

**推荐**: 大多数用户使用 `gemini-2.5-flash` 即可获得最佳体验 ⭐⭐⭐⭐⭐

---

## 相关链接

- **Google AI Studio**: https://makersuite.google.com/
- **API 文档**: https://ai.google.dev/docs
- **模型列表**: https://ai.google.dev/gemini-api/docs/models
- **Google Cloud Console**: https://console.cloud.google.com/
- **Gemini 2.5 发布公告**: https://blog.google/technology/google-deepmind/gemini-model-thinking-updates-march-2025/

---

## 支持

如果遇到问题，请在 GitHub Issues 中报告，并附上：
1. 浏览器控制台的错误信息 (F12)
2. API Key 的前 4 位字符 (例如: `AIza...`)
3. 选择的模型名称
4. 完整的错误堆栈信息

---

**最后更新**: 2025-01-12
**文档版本**: 2.0 (Gemini 2.5 系列)
