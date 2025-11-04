# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Project**: SiYuan Note plugin with Claude AI (Chat + Quick Edit)
**Tech Stack**: TypeScript, Svelte, Vite, Anthropic SDK
**Plugin Type**: Frontend plugin for SiYuan Note (思源笔记)

---

## Quick Start

### Build & Deploy
```bash
npm run deploy        # One-command: build + copy to SiYuan plugins folder
npm run dev           # Watch mode for development
npm run build         # Build only
```

**Note**: Hot reload NOT supported - must restart SiYuan (F5) after each change.

### Development Workflow
1. Edit TypeScript/Svelte files in `src/`
2. Run `npm run deploy`
3. Restart SiYuan (F5)
4. Test in plugin dock panel
5. Check console (F12) for errors

### Testing Checklist
- [ ] Build succeeds without errors
- [ ] Plugin loads without console errors
- [ ] Quick Edit works with all presets
- [ ] Filter rules apply correctly
- [ ] Settings persist after restart

---

## Architecture Overview

### Entry Point & Lifecycle
```typescript
// src/index.ts - ClaudeAssistantPlugin
onload()           // Initialize plugin (NOT for dock/tab registration)
  ↓
onLayoutReady()    // Register dock, topbar (MUST be here)
  ↓
onunload()         // Cleanup resources
```

**Critical**: `addDock()` must be called in `onLayoutReady()`, not `onload()`. Dock's `init()` runs lazily when user opens it.

### Core Systems

**1. Configuration (Multi-Profile + Presets)**
```
ConfigManager
  ├── Profiles (Multiple configuration sets)
  │   └── ConfigProfile { settings: ClaudeSettings }
  └── Presets (Reusable prompt templates)
      └── PromptTemplate { systemPrompt, appendedPrompt, editInstruction,
                           inputPlaceholder, filterRules, ... }
```

**Key Types**:
```typescript
PromptTemplate {
  id: string;
  name: string;
  systemPrompt: string;           // AI role definition
  appendedPrompt: string;         // Auto-appended to requests
  editInstruction?: string;       // Quick Edit template with {instruction}, {original}
  inputPlaceholder?: string;      // Placeholder text for input field
  filterRules?: FilterRule[];     // Preset-specific filters
  selectionQATemplate?: string;   // Selection Q&A template
}
```

**2. Quick Edit Pipeline**
```
User Selection → Input Popup → Preset Selection → Build Prompt →
Context Extraction → AI Streaming → Response Filtering → Preview Render →
User Review (Accept/Reject/Retry)
```

**Core Files**:
- `QuickEditManager.ts` - Main controller (`trigger()` → `processInlineEdit()`)
- `InstructionInputPopup.ts` - Preset selector + instruction input
- `ContextExtractor.ts` - Placeholder parser (`{above=5}`, `{above_blocks=2}`)
- `InlineEditRenderer.ts` - Comparison block rendering

**3. Claude Client & Filtering**
- `ClaudeClient.ts` - API client with streaming support
- `ResponseFilter.ts` - Regex-based content filtering

**4. UI Panels**
- `UnifiedAIPanel.ts` - Main chat interface (sidebar dock)

---

## Quick Edit System

### Core Components

**QuickEditManager** (`src/quick-edit/QuickEditManager.ts`)
- Entry point: `trigger()` method
- Main flow: `processInlineEdit()`
- Handles: selection → AI request → preview → accept/reject

**InstructionInputPopup** (`src/quick-edit/InstructionInputPopup.ts`)
- Preset selector with quick access buttons
- Input field with dynamic placeholder (from `PromptTemplate.inputPlaceholder`)
- Persistence: Dual-storage (localStorage cache + file storage for restart persistence)

**ContextExtractor** (`src/quick-edit/ContextExtractor.ts`)
- Parses template placeholders: `{instruction}`, `{original}`, `{above=N}`, `{below=N}`, `{above_blocks=N}`, `{below_blocks=N}`
- Extracts surrounding context from SiYuan document DOM
- Replaces placeholders in `editInstruction` template

**InlineEditRenderer** (`src/quick-edit/InlineEditRenderer.ts`)
- Renders comparison view (original vs AI suggestion)
- Action buttons: Accept, Reject, Retry
- Integrates with SiYuan's block system

### Key Interfaces

**PromptTemplate** (used by Quick Edit)
```typescript
interface PromptTemplate {
  id: string;
  name: string;
  editInstruction?: string;         // Template with placeholders
  inputPlaceholder?: string;        // Dynamic input field placeholder
  systemPrompt: string;
  appendedPrompt: string;
  filterRules?: FilterRule[];       // Preset-specific filters
}
```

**FilterRule** (response processing)
```typescript
interface FilterRule {
  pattern: string;                  // Regex pattern
  replacement: string;              // Supports $1, $2 capture groups
  flags?: string;                   // Regex flags (g, i, m, s)
  enabled: boolean;
}
```

### Quick Edit Flow

1. **Trigger**: User selects text/blocks → Right-click menu or keyboard shortcut
2. **Input**: Popup shows preset buttons + instruction input (with dynamic placeholder)
3. **Process**: Build prompt with template + context → Stream AI response → Apply filters
4. **Preview**: Render comparison block in document
5. **Action**: User accepts (replace blocks) or rejects (restore original)

---

## SiYuan Integration

### Block API
```typescript
// Insert block after another block
fetch('/api/block/insertBlock', {
    method: 'POST',
    body: JSON.stringify({
        dataType: 'markdown',
        data: content,
        previousID: blockId
    })
});

// Delete block
fetch('/api/block/deleteBlock', {
    method: 'POST',
    body: JSON.stringify({ id: blockId })
});

// Update block
fetch('/api/block/updateBlock', {
    method: 'POST',
    body: JSON.stringify({
        dataType: 'markdown',
        data: newContent,
        id: blockId
    })
});
```

### Event Bus
```typescript
// Block icon menu (right-click on block icon)
this.eventBus.on("click-blockicon", ({ detail }) => {
    const { blockElements, menu } = detail;
    menu.addItem({ icon: "iconEdit", label: "Quick Edit", click: () => {} });
});

// Content menu (right-click on selected text)
this.eventBus.on("open-menu-content", ({ detail }) => {
    const { menu, range } = detail;
    // Add custom menu items
});
```

### Editor Access (Protyle)
```typescript
// Get text selection
const range = protyle?.wysiwyg?.element?.ownerDocument?.getSelection()?.getRangeAt(0);
const selectedText = range.toString().trim();

// Find containing block
let blockElement = range.startContainer.parentElement;
while (blockElement && !blockElement.getAttribute('data-node-id')) {
    blockElement = blockElement.parentElement;
}
const blockId = blockElement.getAttribute('data-node-id');
```

---

## Development Guidelines

### Adding Presets
- **UI**: Settings → Presets tab → Add Preset
- **Code**: Add to `BUILTIN_TEMPLATES` in `src/settings/config-types.ts`
- **Fields**: id, name, systemPrompt, appendedPrompt, editInstruction, inputPlaceholder, filterRules

### Adding Filter Rules
- **UI**: Settings → Filter Rules tab → Add Rule
- **Code**: Add to `BUILTIN_FILTER_RULE_TEMPLATES` in `src/settings/config-types.ts`
- **Structure**: pattern (regex), replacement (supports $1, $2), flags, enabled

### Adding Settings
1. Define type in `src/claude/types.ts` (ClaudeSettings interface)
2. Set default in `src/claude/index.ts` (DEFAULT_SETTINGS)
3. Add UI in `src/settings/SettingsPanelV3.ts`
4. Access via `claudeClient.getSettings()`

### Performance Notes
- **Streaming**: Use array accumulation + join() instead of string concatenation (O(n) vs O(n²))
- **DOM Queries**: Batch with single `querySelectorAll()` using comma-separated selectors
- **XSS Protection**: Always use `escapeHtml()` before setting `innerHTML`

---

## Security

- **XSS Protection**: Always use `escapeHtml()` before setting `innerHTML`
- **API Keys**: Stored in localStorage (NOT encrypted - warn users)
- **Filter Validation**: Regex patterns validated to prevent ReDoS attacks
- **Timeout Protection**: `fetchWithTimeout()` prevents indefinite API hangs

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Plugin not loading | Check `icon.png` exists (160x160), verify `plugin.json` version matches `package.json` |
| Quick Edit error | Check console, test with default preset, verify editInstruction is valid |
| Build fails | Run `npm install`, check Node 18+, clear `dist/` folder |
| Changes not showing | Ensure `npm run deploy` succeeded, restart SiYuan (not just F5) |
| Streaming timeout | Check API key, network, Anthropic status; increase timeout in ClaudeClient.ts |

---

## Key Files Reference

### Core Logic
- `src/index.ts` - Plugin entry, lifecycle
- `src/quick-edit/QuickEditManager.ts` - Quick Edit controller
- `src/claude/ClaudeClient.ts` - API client, streaming
- `src/filter/ResponseFilter.ts` - Content filtering

### UI Components
- `src/quick-edit/InstructionInputPopup.ts` - Preset selector + input (inputPlaceholder logic)
- `src/quick-edit/InlineEditRenderer.ts` - Comparison block rendering
- `src/sidebar/UnifiedAIPanel.ts` - Main chat interface

### Configuration
- `src/settings/ConfigManager.ts` - Profile/preset management
- `src/settings/PromptEditorPanel.ts` - Settings UI
- `src/settings/config-types.ts` - Types (PromptTemplate, FilterRule)

### Context Processing
- `src/quick-edit/ContextExtractor.ts` - Placeholder parser

### Types
- `src/claude/types.ts` - ClaudeSettings, Message
- `src/filter/types.ts` - FilterRule, FilterResult
- `src/editor/types.ts` - EditSettings, TextSelection

---

## Release & Versioning

**Quick Release**:
```bash
npm run release  # Auto-bump version + create tag + trigger GitHub Actions
```

**Commit Format**: Conventional Commits (`feat:`, `fix:`, `chore:`)
**Version Bumps**: `feat:` → MINOR, `fix:` → PATCH, `BREAKING CHANGE:` → MAJOR

See [RELEASE.md](RELEASE.md) for complete workflow.

---

## Using the SiYuan Plugin Skill

Activate with: `/skill siyuan-plugin`

**Provides**:
- SiYuan Plugin API reference
- Event handling examples
- Dock/tab creation guides
- Data storage patterns
- Troubleshooting tips

**Skill location**: `.claude/skills/siyuan-plugin/`

---

## Additional Resources

- **SiYuan API**: https://github.com/siyuan-note/siyuan/tree/master/kernel/api
- **Anthropic Docs**: https://docs.anthropic.com/
- **Plugin Sample**: https://github.com/siyuan-note/plugin-sample
- **Release Guide**: [RELEASE.md](RELEASE.md)

---

## Known Limitations

- Hot reload not supported (must restart SiYuan after code changes)
- Context extraction limited to linear document structure
- No offline mode (requires active API connection)

---

**Last Updated**: 2025-01-05
**Version**: 0.7.0
