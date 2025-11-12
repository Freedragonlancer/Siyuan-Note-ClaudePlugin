# Gemini API Setup Guide

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
- 以 `AIza` 开头
- 长度约为 39 个字符
- 示例: `AIzaSyD...` (完整的key会更长)

### ⚠️ 常见错误

#### 错误 1: "API key not valid"
**原因**: API Key 格式不正确或已过期

**解决方法**:
1. 检查 API Key 是否以 `AIza` 开头
2. 确认没有复制多余的空格
3. 在 Google AI Studio 中重新生成 API Key
4. 确认你的 Google Cloud 项目已启用 "Generative Language API"

#### 错误 2: "模型不存在"
**原因**: 选择了已废弃的模型

**解决方法**:
推荐使用以下模型（按性能排序）：

**Gemini 2.5 系列 (最新 - 2025)** ⭐
- `gemini-2.5-pro` - 最强推理能力，100万token上下文
- `gemini-2.5-flash` - **推荐**，最佳性价比
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

### 启用 Generative Language API

如果遇到权限错误，需要在 Google Cloud Console 启用 API：

1. 访问: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com
2. 选择你的项目
3. 点击 "Enable" 启用 API

### 配额限制

**免费额度** (Free tier):
- 每分钟 15 次请求
- 每天 1,500 次请求
- 每分钟 100 万 tokens

**付费额度** (根据项目配置):
- 需要在 Google Cloud Console 配置计费账户

### 测试 API Key

在插件设置中：
1. 选择 AI 提供商: Google Gemini
2. 输入你的 API Key
3. 选择模型: `gemini-1.5-pro-latest`
4. 点击 "测试连接"

如果测试失败，检查浏览器控制台 (F12) 的错误信息。

### 调试信息

插件会在控制台输出调试信息：
```
[GeminiProvider] Initializing with API key: AIzaSyD...
[GeminiProvider] Model ID: gemini-1.5-pro-latest
```

如果看到警告信息：
```
[GeminiProvider] API key format warning: Expected to start with 'AIza'
```
说明 API Key 格式可能不正确。

### 相关链接

- Google AI Studio: https://makersuite.google.com/
- API 文档: https://ai.google.dev/docs
- 模型列表: https://ai.google.dev/models/gemini
- Google Cloud Console: https://console.cloud.google.com/

### 支持

如果遇到问题，请在 GitHub Issues 中报告，并附上：
1. 浏览器控制台的错误信息 (F12)
2. API Key 的前 4 位字符 (例如: AIza...)
3. 选择的模型名称
