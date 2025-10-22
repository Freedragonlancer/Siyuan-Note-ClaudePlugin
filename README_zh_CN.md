# 思源笔记 Claude AI 助手插件

一个强大的思源笔记插件，直接将 Claude AI 集成到您的笔记工作流中。选择文本，与 Claude 对话，无需离开思源即可获得 AI 助力。

## 功能特性

- **无缝集成**：直接从思源的侧边栏访问 Claude AI
- **上下文感知**：使用选中的文本作为查询上下文
- **流式响应**：实时响应流，即时反馈
- **灵活操作**：在光标处插入响应或替换选中文本
- **完整对话历史**：在多次交互中保持上下文
- **多模型支持**：支持 Claude 3.5 Sonnet、Claude 3 Opus 等
- **可定制**：配置模型参数、系统提示词和行为

## 安装

### 从插件市场安装（推荐）

1. 打开思源笔记
2. 进入 设置 → 集市 → 插件
3. 搜索 "Claude AI Assistant"
4. 点击安装

### 手动安装

1. 从 [GitHub Releases](https://github.com/yourusername/siyuan-plugin-claude-assistant/releases) 下载最新版本
2. 解压缩
3. 复制文件夹到 `{工作空间}/data/plugins/`
4. 重启思源笔记

## 配置

### 获取 API Key

1. 访问 [Anthropic 控制台](https://console.anthropic.com/)
2. 注册或登录
3. 进入 API Keys 部分
4. 创建新的 API key
5. 复制密钥（以 `sk-ant-` 开头）

### 设置插件

1. 点击顶栏的机器人图标或使用命令面板
2. 在聊天面板中点击"设置"
3. 输入您的 Claude API key
4. 配置可选设置：
   - **API Base URL**：自定义 API 端点（留空使用官方 API，详见下方反向代理部分）
   - **模型**：选择您喜欢的 Claude 模型
   - **最大令牌数**：最大响应长度（256-8192）
   - **温度**：创造性水平（0-1）
   - **系统提示词**：自定义 Claude 的行为
5. 点击"测试连接"进行验证
6. 点击"保存"

### 使用反向代理

如果您需要使用反向代理（例如绕过地区限制或使用自定义 API 网关），可以配置自定义 API Base URL：

1. 打开插件设置
2. 在"API Base URL"字段中输入您的代理端点
   - 示例：`https://your-proxy.com/v1`
   - 示例：`https://api.example.com/anthropic`
3. 留空则使用官方 Anthropic API
4. 确保您的代理正确转发请求到 Anthropic 的 API

**常见反向代理使用场景**：
- 地区访问限制
- 自定义 API 网关
- 自托管代理服务器
- 企业网络代理

**注意**：使用反向代理时，请确保它正确转发 `anthropic-dangerous-direct-browser-access` 头，并保持与 Anthropic API 格式的兼容性。

## 使用方法

### 打开聊天面板

- 点击顶栏的机器人图标
- 使用键盘快捷键：`Alt+Shift+C`（Windows/Linux）或 `Option+Shift+C`（Mac）
- 使用命令面板：搜索 "Claude AI"

### 基本对话

1. 在输入框中输入您的问题
2. 按 `Ctrl+Enter`（Mac 上为 `Cmd+Enter`）发送
3. 观看 Claude 实时流式响应

### 使用选中文本作为上下文

1. 在笔记中选择文本
2. 点击聊天面板标题中的"选择"按钮
3. 选中的文本将作为上下文添加
4. 添加您的问题或指令
5. 发送消息

### 插入或替换文本

收到 Claude 的响应后：

- **插入**：点击"插入"在光标位置添加响应
- **替换**：点击"替换"用响应替换选中的文本

### 使用示例

**改进写作**：
1. 在笔记中选择一段文字
2. 打开 Claude 面板并点击"选择"
3. 询问："请改进这段文字的清晰度和流畅性"
4. 查看 Claude 的建议
5. 点击"替换"更新您的笔记

**翻译**：
1. 选择要翻译的文本
2. 将选中文本作为上下文
3. 询问："将这段翻译成中文"
4. 点击"替换"或"插入"

**摘要**：
1. 选择一个长段落
2. 询问 Claude："总结关键要点"
3. 将摘要插入到文档的其他位置

## 快捷键

- `Alt+Shift+C`（Windows/Linux）或 `Option+Shift+C`（Mac）：打开 Claude 面板
- `Ctrl+Enter` 或 `Cmd+Enter`：发送消息
- `Esc`：关闭对话框

## 模型

插件支持多个 Claude 模型：

| 模型 | 适用场景 | 速度 | 能力 |
|-----|---------|------|------|
| Claude 3.5 Sonnet | 平衡性能 | 快速 | 高 |
| Claude 3.5 Haiku | 快速响应 | 最快 | 良好 |
| Claude 3 Opus | 复杂任务 | 较慢 | 最高 |

## 设置参考

### API Key
您的 Anthropic API 密钥。插件运行所必需。

### API Base URL
使用反向代理的自定义 API 端点。留空则使用官方 Anthropic API（`https://api.anthropic.com`）。适用于：
- 绕过地区限制
- 使用自定义 API 网关
- 自托管代理服务器
- 企业网络配置

### 模型
用于对话的 Claude 模型。不同模型在速度、成本和能力之间有不同的权衡。

### 最大令牌数
Claude 响应的最大令牌数（256-8192）。更高的值允许更长的响应，但成本更高。

### 温度
控制随机性（0-1）：
- 0：更专注和确定性
- 1：更有创造性和多样性

### 系统提示词
定义 Claude 行为和个性的指令。自定义以匹配您的用例。

## 安全与隐私

**重要安全信息**：

- 您的 API key 本地存储在浏览器的 localStorage 中
- 插件使用浏览器直接与 Anthropic 通信
- **警告**：存储在浏览器 localStorage 中的 API key 可能被其他脚本访问
- 永远不要与不受信任的人共享您的工作空间
- 考虑在 Anthropic 控制台中使用 API key 限制

**最佳实践**：

1. 为此插件使用专用的 API key
2. 在 Anthropic 控制台中设置使用限制
3. 定期轮换您的 API key
4. 保持您的思源工作空间安全

## 故障排除

### 插件无法加载
- 检查插件在 设置 → 插件 中是否已启用
- 重启思源笔记
- 检查控制台错误（Electron 中按 F12）

### API key 无法工作
- 验证密钥以 `sk-ant-` 开头
- 检查密钥是否过期
- 在 console.anthropic.com 测试密钥
- 在设置中使用"测试连接"

### Claude 无响应
- 检查您的网络连接
- 验证 API key 有足够的额度
- 检查 Anthropic 的状态页面
- 在聊天面板中查找错误消息

### 文本选择无效
- 先在编辑器中点击
- 确保文本确实被选中
- 尝试使用不同的选择方法

## 开发

### 前置要求

- Node.js 18+
- pnpm 8+

### 设置

```bash
# 克隆仓库
git clone https://github.com/yourusername/siyuan-plugin-claude-assistant.git
cd siyuan-plugin-claude-assistant

# 安装依赖
pnpm install

# 开发构建
pnpm dev
```

### 创建开发链接

```bash
# 将插件链接到您的思源工作空间
node scripts/make_dev_link.js --dir=/path/to/siyuan/data/plugins

# 开始监听更改
pnpm dev
```

### 生产构建

```bash
pnpm build
```

## 贡献

欢迎贡献！请随时提交 Pull Request。

1. Fork 仓库
2. 创建您的功能分支（`git checkout -b feature/AmazingFeature`）
3. 提交您的更改（`git commit -m 'Add some AmazingFeature'`）
4. 推送到分支（`git push origin feature/AmazingFeature`）
5. 打开 Pull Request

## 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

## 致谢

- 使用 [Anthropic 的 Claude API](https://www.anthropic.com/claude) 构建
- 基于 [思源笔记插件示例](https://github.com/siyuan-note/plugin-sample)
- 受思源社区启发

## 支持

- 报告 bug：[GitHub Issues](https://github.com/yourusername/siyuan-plugin-claude-assistant/issues)
- 功能请求：[GitHub Discussions](https://github.com/yourusername/siyuan-plugin-claude-assistant/discussions)
- 思源社区：[官方论坛](https://ld246.com/)

## 更新日志

### 0.1.0（初始版本）

- 基本 Claude API 集成
- 侧边栏聊天界面
- 文本选择上下文
- 插入/替换功能
- 带模型配置的设置面板
- 流式响应
- 多模型支持

---

为思源笔记社区用 ❤️ 制作
