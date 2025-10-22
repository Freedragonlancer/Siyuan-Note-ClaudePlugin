# Changelog

All notable changes to the SiYuan Claude Assistant Plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-10-22

### Added
- 🎉 Initial release of SiYuan Claude Assistant Plugin
- ✨ Unified AI Panel combining chat and text editing features
- 💬 Streaming chat interface with Claude AI
- ✏️ AI-powered text editing with diff preview
- 🎨 Compact UI design with collapsible sections
- ⚙️ Flexible settings with API key configuration
- 🔧 Support for official Anthropic API and reverse proxy
- 📝 Markdown rendering with syntax highlighting
- 🌐 Bilingual support (English & Chinese)
- 🎯 Context-aware text selection integration
- 📊 Edit queue management system
- 🔄 Batch text processing capabilities
- 💾 Settings persistence across sessions
- 🎭 Multiple Claude models support (3.5 Sonnet, Opus, Haiku)

### Features

#### Chat System
- Real-time streaming responses
- Message history preservation
- Copy and regenerate message actions
- Typing indicators and animations
- Markdown and code block rendering

#### Text Editing
- Select text and send to AI via right-click
- Diff view showing original vs modified
- Apply, reject, or regenerate edits
- Queue management for multiple selections
- Status tracking (queued, processing, completed)

#### UI/UX
- Compact header design (28px)
- Collapsible edit queue (default collapsed)
- Optimized message display area
- Responsive textarea input
- Hover effects and animations

#### Settings
- API endpoint configuration
- Model selection dropdown
- Temperature and max tokens sliders
- System prompt templates
- Connection testing

### Technical
- Built with TypeScript and Vite
- SCSS styling with SiYuan theme integration
- Anthropic SDK integration
- Event-driven architecture
- Diff-match-patch for text comparison

### Documentation
- Comprehensive README (EN & ZH)
- Development guide (CLAUDE.md)
- Installation instructions
- Configuration guide

### Known Issues
- First-time load may require browser cache refresh
- Large text editing may be slow
- API key must be configured before use

---

## [Unreleased]

### Planned Features
- [ ] Custom instruction presets
- [ ] Export conversation history
- [ ] Keyboard shortcuts
- [ ] Dark/light theme toggle
- [ ] Voice input support
- [ ] Multi-language system prompts
- [ ] Plugin marketplace integration

---

**Note**: This is the initial release. Please report bugs and feature requests on [GitHub Issues](https://github.com/YOUR_USERNAME/siyuan-plugin-claude-assistant/issues).
