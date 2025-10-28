# CLAUDE.md

This file provides guidance to Claude Code when working with this SiYuan plugin project.

## Quick Reference

**Project**: SiYuan Note plugin integrating Claude AI for chat and inline text editing
**Tech Stack**: TypeScript, Svelte, Vite, Anthropic SDK
**Key Features**: Dual-dock UI (Chat + Quick Edit), streaming responses, inline AI editing with diff preview

## Build & Deploy

```bash
# Install dependencies
pnpm install

# Development build with watch
pnpm dev

# Production build
pnpm build

# Deploy to SiYuan (after build)
npm run copy-plugin
# Or manually:
cp dist/index.js "N:/Siyuan-Note/data/plugins/siyuan-plugin-claude-assistant/index.js"
cp dist/index.css "N:/Siyuan-Note/data/plugins/siyuan-plugin-claude-assistant/index.css"

# Restart SiYuan to reload plugin
```

**Build Output**: `dist/` → `index.js`, `index.css`, `plugin.json`, `icon.png`, i18n files

### ⚡ 快速测试部署流程 (每次代码开发完必做)

**一键部署**:
```bash
npm run deploy
```
这个命令会自动执行：
1. `npm run build` - 构建生产版本
2. `npm run copy-plugin` - 复制文件到 SiYuan 插件目录
3. 完成后**重启 SiYuan** 即可测试新功能

**分步执行** (调试用):
```bash
# 步骤 1: 构建
npm run build

# 步骤 2: 复制到插件目录
npm run copy-plugin

# 步骤 3: 手动重启 SiYuan
```

**验证部署**:
- 检查控制台是否有构建错误
- 确认文件已复制: `N:/Siyuan-Note/data/plugins/siyuan-plugin-claude-assistant/`
- 重启 SiYuan 后打开插件检查功能是否正常

## Architecture Overview

### Dual-Dock Design
- **Chat Dock** (`claude-dock`): Traditional conversational AI interface
- **Quick Edit Dock** (`claude-edit-dock`): Inline text editing with visual diff (NOT USED - using Quick Edit feature instead)

### Plugin Entry Points
- **Main Class**: `ClaudeAssistantPlugin` in `src/index.ts`
- **Lifecycle**:
  - `onload()`: Initialize managers, client, register commands
  - `onLayoutReady()`: Register docks and topbar icon
  - `onunload()`: Cleanup panels and listeners

### Core Components

**1. Claude API Client** (`src/claude/`)
- `ClaudeClient.ts`: Streaming/non-streaming API calls
- `types.ts`: Interfaces (ClaudeSettings, Message, callbacks)
- Uses `dangerouslyAllowBrowser: true` for Electron environment

**2. Chat Panel** (`src/sidebar/ChatPanel.ts`)
- Vanilla TypeScript UI (no Svelte)
- Markdown rendering with syntax highlighting
- Insert/Replace text to editor

**3. Quick Edit System** (`src/quick-edit/`)
- **QuickEditManager**: Main controller for inline AI editing
  - Manages active edit blocks (Map of InlineEditBlock)
  - Handles selection → AI processing → user review → apply/reject
  - Key methods: `startQuickEdit()`, `handleAccept()`, `handleReject()`
- **InlineEditRenderer**: DOM rendering for comparison blocks
  - Creates side-by-side original vs AI suggestion view
  - Renders action buttons (Accept/Reject/Retry)
- **Types** (`inline-types.ts`): InlineEditBlock, InlineEditState, settings
- **Features**:
  - Multi-block selection support
  - Block type preservation (headings, code blocks, quotes)
  - Indentation preservation
  - Red marking of original blocks during AI processing
  - MutationObserver for DOM change detection

**4. Settings System** (`src/settings/`)
- **SettingsManager**: localStorage persistence with atomic save and rollback
- **SettingsPanelV3**: Profile-based configuration UI with XSS protection
- **ConfigManager**: Multi-profile management (create, duplicate, import/export)

**5. Editor Helper** (`src/editor/EditorHelper.ts`)
- SiYuan Protyle editor integration
- Text insertion/replacement
- Block-level operations (get/update content)

## Key Technical Details

### Dock Initialization Timing ⚠️
**CRITICAL**: `addDock()` does NOT call `init()` immediately!

```typescript
// onLayoutReady - registers dock but doesn't create panel yet
this.addDock({
    type: "claude-dock",
    init() {
        // This runs LATER when user opens the dock
        this.chatPanel = new ChatPanel(...);
    }
});
```

- `init()` executes when user opens dock (click icon/shortcut)
- Cannot access panel elements in `onLayoutReady()`
- Use regular `function` (not arrow function) to preserve `this` context
- Panel state persists between open/close

### Quick Edit Workflow

1. User selects text → Right-click "AI 快速编辑" or `Ctrl+Shift+E`
2. `QuickEditManager.startQuickEdit()`:
   - Creates `InlineEditBlock` with original text
   - Marks selected blocks with red background (`.quick-edit-original-block`)
   - Renders comparison block showing original text
3. `processInlineEdit()`:
   - Sends to Claude API with streaming
   - Updates suggestion text in real-time
4. User reviews and clicks:
   - **Accept**: Apply AI suggestion, delete original blocks
   - **Reject**: Remove comparison block, restore original
   - **Retry**: Clear suggestion and re-process

### Critical Bug Fixes Applied

**Memory & Performance**:
- Critical 1.1: MutationObserver memory leak - cleared container references
- Critical 1.3: Streaming O(n²) → O(n) - array accumulation instead of string concat

**Security & Data**:
- Critical 1.4: XSS in settings - added `escapeHtml()` for user input
- Critical 1.5: Settings data loss - atomic save with rollback on failure

**Robustness**:
- Critical 1.2: Race condition in concurrent block deletion - Promise.all with error tracking
- High 2.1: Null safety checks for DOM elements
- High 2.2: CRLF line ending support in indentation calculation
- High 2.3: Network error tracking and user feedback
- High 2.4: DOM query optimization - `querySelectorAll` instead of loops

## Common Development Patterns

### Adding a New Setting
1. Update interface in `src/claude/types.ts` (ClaudeSettings or EditSettings)
2. Update `DEFAULT_SETTINGS` in `src/claude/index.ts`
3. Add UI in `SettingsPanelV3.ts` (remember to escape HTML!)
4. Handle in `ClaudeClient.ts` or relevant component

### Modifying Quick Edit Behavior
- **Prompt changes**: Edit `processInlineEdit()` in `QuickEditManager.ts`
- **UI changes**: Edit `InlineEditRenderer.ts` (comparison block template)
- **Block handling**: Modify `handleAccept()` (insertion logic) or `handleReject()`
- **Settings**: Add to `InlineEditSettings` in `inline-types.ts`

### Working with SiYuan API
```javascript
// Insert block
fetch('/api/block/insertBlock', {
    method: 'POST',
    body: JSON.stringify({ dataType: 'markdown', data: content, previousID: blockId })
});

// Delete block
fetch('/api/block/deleteBlock', {
    method: 'POST',
    body: JSON.stringify({ id: blockId })
});
```

### DOM Query Best Practices
```javascript
// ❌ BAD: O(N) queries in loop
blockIds.forEach(id => {
    const el = document.querySelector(`[data-node-id="${id}"]`);
    el.classList.add('class');
});

// ✅ GOOD: O(1) query
const selector = blockIds.map(id => `[data-node-id="${id}"]`).join(',');
const elements = document.querySelectorAll(selector);
elements.forEach(el => el.classList.add('class'));
```

## Important Notes

### Build Configuration
- **Format**: CommonJS (required by SiYuan)
- **Externals**: `siyuan`, `process` (provided by runtime)
- **Aliases**: `@` → `src/`
- **CSS**: `style.css` auto-renamed to `index.css`

### Security Considerations
- API keys stored in localStorage (not encrypted)
- Always escape user input before innerHTML (use `escapeHtml()`)
- Validate settings before save (atomic save with rollback)

### SiYuan Plugin Skill
For general SiYuan plugin development (lifecycle, events, i18n, etc.), use the `siyuan-plugin` skill. This CLAUDE.md focuses on project-specific Claude AI integration.

## Troubleshooting Quick Guide

**Plugin not loading**: Check `icon.png` exists (160x160, required)
**API errors**: Verify API key in Settings → Test Connection
**Quick Edit not working**: Check console (F12) for errors, verify text is selected
**Build errors**: Check `pnpm install` completed successfully
**Changes not appearing**: Ensure you ran `npm run copy-plugin` and restarted SiYuan
