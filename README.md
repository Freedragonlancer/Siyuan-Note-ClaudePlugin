# Claude AI Assistant for SiYuan Note

A powerful SiYuan Note plugin that integrates Claude AI directly into your note-taking workflow. Select text, chat with Claude, and get AI-powered assistance without leaving SiYuan.

## Features

### 🎨 **Modern UI/UX**
- **Beautiful Chat Interface**: Clean, modern chat UI with message grouping
- **Markdown Rendering**: Full markdown support with proper formatting
- **Code Syntax Highlighting**: GitHub Dark theme for code blocks
- **Typing Animations**: Smooth typing indicators and blinking cursor
- **Message Actions**: Copy messages and regenerate responses with one click
- **Responsive Design**: Adaptive layout that works in all screen sizes

### 🔧 **Powerful Settings**
- **Grouped Settings Panel**: Well-organized settings with clear sections
- **Dual API Support**: Switch between official Anthropic API or custom reverse proxy
- **Template System**: 5 pre-configured system prompt templates (Assistant, Coder, Writer, Translator, Custom)
- **Real-time Validation**: Test API connection before saving
- **Visual Feedback**: Real-time sliders for max tokens and temperature

### 🚀 **Smart Integration**
- **Seamless SiYuan Integration**: Native dock panel in sidebar
- **Context-Aware**: Use selected text as context for queries
- **Streaming Responses**: Real-time response streaming with markdown rendering
- **Flexible Actions**: Insert at cursor or replace selected text
- **Full Conversation History**: Maintain context across interactions
- **Multiple Models**: Claude 3.5 Sonnet, Opus, Haiku support

## Installation

### From Plugin Marketplace (Recommended)

1. Open SiYuan Note
2. Go to Settings → Marketplace → Plugins
3. Search for "Claude AI Assistant"
4. Click Install

### Manual Installation

1. Download the latest release from [GitHub Releases](https://github.com/yourusername/siyuan-plugin-claude-assistant/releases)
2. Extract the archive
3. Copy the folder to `{workspace}/data/plugins/`
4. Restart SiYuan Note

## Configuration

### Getting an API Key

1. Visit [Anthropic Console](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key (starts with `sk-ant-`)

### Setting up the Plugin

1. **Open Settings**
   - Click the robot icon in the top bar to open the chat panel
   - Click the ⚙️ **Settings** button in the chat panel header (left side)
   - Or use the command palette and search for "Claude AI Assistant - Settings"

2. **Configure Connection Settings**
   - Choose API Provider:
     - **Anthropic 官方 API**: Official Anthropic API (default)
     - **自定义反向代理**: Custom reverse proxy
   - Enter your Claude API key (starts with `sk-ant-`)
   - Toggle the 👁️ icon to show/hide your API key
   - If using proxy, enter your custom endpoint URL

3. **Configure Model Settings**
   - **Model**: Choose from dropdown (Sonnet 4.5, Sonnet 3.5, Opus, Haiku)
     - See pricing and capability info below the dropdown
   - **Max Tokens**: Drag slider (256-8192 tokens)
   - **Temperature**: Drag slider (0.0-1.0)
     - Lower = more focused, Higher = more creative

4. **Configure System Prompt**
   - Choose from template dropdown:
     - 默认助手 (General Assistant)
     - 代码助手 (Code Assistant)
     - 写作助手 (Writing Assistant)
     - 翻译助手 (Translation Assistant)
     - 自定义 (Custom - write your own)
   - Edit the prompt in the textarea below

5. **Test and Save**
   - Click **测试连接** (Test Connection) to verify
   - Wait for success message ✅
   - Click **保存** (Save) to apply settings
   - Or click **取消** (Cancel) to discard changes

### Using a Reverse Proxy

If you need to use a reverse proxy (for example, to bypass regional restrictions or use a custom API gateway):

1. **Open plugin settings** (⚙️ button in chat panel)
2. **Select API Provider**: Choose "自定义反向代理" (Custom Reverse Proxy)
3. **Enter Proxy URL**: Input your proxy endpoint
   - Example: `https://your-proxy.com/v1`
   - Example: `https://api.example.com/anthropic`
4. **Enter API Key**: Your Anthropic API key
5. **Test Connection**: Verify the proxy works correctly
6. **Save**: Apply the settings

**Common Reverse Proxy Use Cases**:
- 🌍 Regional access restrictions
- 🔒 Custom API gateways
- 🖥️ Self-hosted proxy servers
- 🏢 Corporate network proxies

**Important Notes**:
- When using "Anthropic 官方 API", the Base URL field is hidden (uses official endpoint)
- Proxy must forward the `anthropic-dangerous-direct-browser-access` header
- Proxy must maintain compatibility with Anthropic's API format
- Test connection before saving to ensure proxy is configured correctly

## Usage

### Opening the Chat Panel

- Click the robot icon in the top bar
- Use keyboard shortcut: `Alt+Shift+C` (Windows/Linux) or `Option+Shift+C` (Mac)
- Use command palette: Search for "Claude AI"

### Basic Conversation

1. Type your question in the input box at the bottom
2. Press `Ctrl+Enter` (or `Cmd+Enter` on Mac) to send
3. Watch Claude's response stream in real-time with:
   - **Typing indicator**: "typing..." appears while waiting
   - **Blinking cursor**: Shows where text is being generated
   - **Live markdown rendering**: Formatting appears as Claude types
   - **Syntax highlighting**: Code blocks are highlighted automatically

### Message Actions

Every AI response has action buttons (hover to reveal):

- **📋 Copy**: Copy the entire message to clipboard
- **🔄 Regenerate**: Generate a new response to the same question
  - Removes the current response
  - Resends the last user message
  - Useful if you want a different answer

### Using Selected Text as Context

1. Select text in your note
2. Click the "Select" button in the chat panel header
3. The selected text will be added as context
4. Add your question or instruction
5. Send the message

### Inserting or Replacing Text

After receiving a response from Claude:

- **Insert**: Click "Insert" to add the response at your cursor position
- **Replace**: Click "Replace" to replace selected text with the response

### Example Workflows

**💡 Improving Writing**:
1. Select a paragraph in your note
2. Open Claude panel and click 📋 "Select" button
3. Ask: "Please improve the clarity and flow of this text"
4. Review Claude's markdown-formatted suggestion
5. Hover over the response and click 📋 to copy
6. Or click "Replace" to update your note directly

**🌐 Translation**:
1. Select text to translate
2. Click 📋 "Select" button in chat header
3. Use a template: Choose "翻译助手" in settings first
4. Ask: "Translate this to English"
5. Click "Replace" or "Insert"

**📝 Summarization**:
1. Select a long section
2. Ask Claude: "Summarize the key points as a bullet list"
3. Get a beautifully formatted markdown list
4. Insert the summary elsewhere in your document

**💻 Code Explanation**:
1. Select code from your notes
2. Use "代码助手" template for better results
3. Ask: "Explain what this code does"
4. Get a response with syntax-highlighted code blocks
5. Copy individual code snippets with proper formatting

**✨ Creative Writing**:
1. Type your prompt directly in the chat
2. Adjust temperature to 0.8-1.0 for more creativity
3. Generate story ideas, character descriptions, or plot outlines
4. Use the regenerate button 🔄 to get alternative versions
5. Copy the best version to your notes

## Keyboard Shortcuts

- `Alt+Shift+C` (Windows/Linux) or `Option+Shift+C` (Mac): Open Claude panel
- `Ctrl+Enter` or `Cmd+Enter`: Send message
- `Esc`: Close dialogs

## Models

The plugin supports multiple Claude models with pricing info displayed in settings:

| Model | Best For | Speed | Capability | Pricing* |
|-------|----------|-------|------------|----------|
| **Claude Sonnet 4.5** | Latest & most powerful | Fast | Highest | $3/$15 per 1M tokens |
| **Claude 3.5 Sonnet** | Balanced performance | Fast | High | $3/$15 per 1M tokens |
| **Claude 3 Opus** | Complex reasoning tasks | Slower | Very High | $15/$75 per 1M tokens |
| **Claude 3.5 Haiku** | Quick responses | Fastest | Good | $0.8/$4 per 1M tokens |
| **Claude 3 Sonnet** | Legacy balanced model | Fast | Good | $3/$15 per 1M tokens |
| **Claude 3 Haiku** | Legacy quick model | Fastest | Moderate | $0.25/$1.25 per 1M tokens |

*Pricing: Input/Output per million tokens. See settings panel for real-time info.

## Settings Reference

The new settings panel is organized into clear sections:

### 🔌 Connection Settings

**API Provider** (Radio Selection)
- **Anthropic 官方 API**: Official Anthropic endpoint (default)
- **自定义反向代理**: Custom reverse proxy server

**API Key** (Required)
- Your Anthropic API key (starts with `sk-ant-`)
- Click 👁️ icon to toggle visibility
- Stored locally in browser localStorage
- Get yours at: [console.anthropic.com](https://console.anthropic.com)

**API Base URL** (Conditional)
- Only visible when "自定义反向代理" is selected
- Custom endpoint URL for your proxy server
- Leave empty when using official API
- Format: `https://your-proxy.com/v1`

### 🤖 Model Settings

**Model** (Dropdown)
- Choose from 6 Claude models
- Pricing and capability info shown below dropdown
- Recommended: Claude Sonnet 4.5 (latest & most powerful)

**Max Output Tokens** (Slider: 256-8192)
- Maximum tokens in Claude's response
- Displayed in real-time as you drag
- Higher = longer responses (but higher cost)
- Step size: 256 tokens

**Temperature** (Slider: 0.0-1.0)
- Controls response randomness/creativity
- Displayed with 1 decimal precision
- Low (0.0-0.3): Focused, deterministic, factual
- Medium (0.4-0.7): Balanced creativity
- High (0.8-1.0): Creative, varied, experimental
- Step size: 0.1

### 💬 System Prompt Settings

**Prompt Template** (Dropdown)
- **默认助手**: General-purpose AI assistant
- **代码助手**: Optimized for programming tasks
- **写作助手**: Focused on writing improvement
- **翻译助手**: Specialized for translation
- **自定义**: Write your own custom prompt

**System Prompt** (Textarea)
- Auto-fills when you select a template
- Fully customizable for any use case
- Defines Claude's personality and behavior
- Supports multi-line instructions

### 🎯 Action Buttons

- **测试连接** (Test Connection): Validates API key and settings
- **取消** (Cancel): Discard changes and close
- **保存** (Save): Apply settings and close

## Security & Privacy

**Important Security Information**:

- Your API key is stored locally in your browser's localStorage
- The plugin uses direct browser-to-Anthropic communication
- **Warning**: API keys stored in browser localStorage can be accessed by other scripts
- Never share your workspace with untrusted parties
- Consider using API key restrictions in the Anthropic Console

**Best Practices**:

1. Use a dedicated API key for this plugin
2. Set usage limits in the Anthropic Console
3. Regularly rotate your API keys
4. Keep your SiYuan workspace secure

## Troubleshooting

### Plugin doesn't load
- Check that the plugin is enabled in Settings → Plugins
- Restart SiYuan Note (F5 or full restart)
- Check the browser console for errors (F12 in Electron)
- Verify plugin files are in `{workspace}/data/plugins/siyuan-plugin-claude-assistant/`

### Settings button not visible
- Make sure the plugin is fully loaded (check console logs)
- Try toggling the dock panel (close and reopen)
- The ⚙️ settings button is in the chat panel header (left side)
- Alternative: Use command palette and search for "settings"

### API key not working
- Verify the key starts with `sk-ant-`
- Check that the key hasn't expired
- Test the key at [console.anthropic.com](https://console.anthropic.com)
- Use **测试连接** (Test Connection) button in settings
- Check for error messages after test

### No response from Claude
- Check your internet connection
- Verify API key has sufficient credits in Anthropic Console
- Check [Anthropic's status page](https://status.anthropic.com)
- Look for error messages in the chat panel (red system messages)
- If using proxy: verify proxy URL is correct and accessible

### Markdown not rendering
- This is expected - only AI (assistant) messages render markdown
- User messages show as plain text
- Check browser console for rendering errors
- Verify the plugin version is latest (should have marked.js)

### Code highlighting not working
- Specify language in code blocks: \`\`\`python (not just \`\`\`)
- Check that highlight.js is loaded (browser console)
- Try different code languages
- Some languages may not be supported

### Text selection not working
- Click in the editor first to focus
- Make sure text is actually selected (highlighted)
- Try using a different selection method
- Check that you clicked the 📋 "Select" button in chat header

### Message actions not appearing
- Hover over AI messages to reveal action buttons
- Actions only appear on assistant (Claude) messages, not user messages
- Check if JavaScript is running without errors (F12 console)

## Development

### Prerequisites

- Node.js 18+
- pnpm 8+

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/siyuan-plugin-claude-assistant.git
cd siyuan-plugin-claude-assistant

# Install dependencies
pnpm install

# Build for development
pnpm dev
```

### Creating a Development Link

```bash
# Link the plugin to your SiYuan workspace
node scripts/make_dev_link.js --dir=/path/to/siyuan/data/plugins

# Start watching for changes
pnpm dev
```

### Building for Production

```bash
pnpm build
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Anthropic's Claude API](https://www.anthropic.com/claude)
- Based on [SiYuan Note Plugin Sample](https://github.com/siyuan-note/plugin-sample)
- Inspired by the SiYuan community

## Support

- Report bugs: [GitHub Issues](https://github.com/yourusername/siyuan-plugin-claude-assistant/issues)
- Feature requests: [GitHub Discussions](https://github.com/yourusername/siyuan-plugin-claude-assistant/discussions)
- SiYuan community: [Official Forum](https://ld246.com/)

## Changelog

### 0.2.0 (UI/UX Overhaul) - Current

**Major Features**:
- ✨ Complete UI redesign with modern, grouped settings panel
- 📝 Full Markdown rendering with GitHub Dark syntax highlighting
- 🎨 Beautiful message formatting with typography
- ⚡ Live typing animations with blinking cursor
- 📋 Message action buttons (copy, regenerate)
- 🔧 Dual API support (official + reverse proxy)
- 📚 5 pre-configured system prompt templates
- 🧪 Real-time API connection testing
- 🎯 Visual feedback with sliders and real-time values
- 👁️ Password visibility toggle for API key

**Technical Improvements**:
- Added `marked.js` for Markdown parsing
- Added `highlight.js` for code syntax highlighting
- Added `dompurify` for XSS protection
- Improved SCSS styling with animations
- Better error handling and user feedback
- Chinese localization for settings

**Dependencies Added**:
- marked ^12.0.0
- highlight.js ^11.9.0
- dompurify ^3.0.0

### 0.1.0 (Initial Release)

- Basic Claude API integration
- Sidebar chat interface
- Text selection context
- Insert/Replace functionality
- Settings panel with model configuration
- Streaming responses
- Multiple model support (6 models)
- Keyboard shortcuts
- Command palette integration

---

Made with ❤️ for the SiYuan Note community

**Features Comparison**: Before vs After UI Redesign

| Feature | v0.1.0 | v0.2.0 |
|---------|--------|--------|
| Settings UI | Flat list | Grouped sections with headers |
| Markdown | Plain text | Full rendering + syntax highlighting |
| API Config | Single URL | Official + Proxy toggle |
| System Prompts | Manual only | 5 templates + custom |
| Message Actions | None | Copy + Regenerate |
| Animations | Basic | Typing indicator + cursor |
| API Testing | None | Built-in with validation |
| Visual Feedback | Limited | Sliders with real-time values |
