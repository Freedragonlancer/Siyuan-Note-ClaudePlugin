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

## Key Implementation Details

### 1. InputPlaceholder System (Latest Feature)

**Purpose**: Provide contextual placeholder text based on selected preset.

**Implementation** (`InstructionInputPopup.ts`):
```typescript
// Line 229-236: Determine placeholder from preset
let placeholderText = '输入编辑指令...'; // Default
if (presetId !== 'custom') {
    const preset = presets.find(p => p.id === presetId);
    if (preset?.inputPlaceholder) {
        placeholderText = preset.inputPlaceholder;
    }
}

// Line 309: Apply to input field
<input placeholder="${placeholderText}" />

// Line 458-474: Use placeholder as instruction when user leaves input empty
if (!trimmedInstruction) {
    const input = element.querySelector('#instruction-input');
    if (input?.placeholder && input.placeholder !== '输入编辑指令...') {
        trimmedInstruction = input.placeholder.trim(); // Auto-fill from placeholder
    }
}
```

**Usage in Presets**:
```typescript
// config-types.ts
{
    id: 'translate',
    name: 'Translator',
    inputPlaceholder: '输入目标语言 (e.g., English, 中文)...',
    editInstruction: 'Translate to {instruction}:\n\n{original}',
    // ...
}
```

**User Experience**:
1. User selects preset → input placeholder updates
2. User types custom instruction → used as-is
3. User leaves input empty → placeholder text becomes instruction

### 2. Context Extraction with Placeholders

**Supported Placeholders** (in `editInstruction` templates):
- `{instruction}` - User input
- `{original}` - Selected text
- `{above=5}` - 5 lines of text above selection
- `{below=3}` - 3 lines of text below selection
- `{above_blocks=2}` - 2 SiYuan blocks above selection
- `{below_blocks=4}` - 4 SiYuan blocks below selection

**Implementation** (`ContextExtractor.ts`):
```typescript
// Parse placeholders
const placeholders = parsePlaceholders(template);
// Extract context from DOM
const context = await extractContext(blockIds, placeholders);
// Replace placeholders in template
return applyPlaceholders(template, context);
```

### 3. Two-Level Filter System

**Filter Application Order**:
```typescript
// ClaudeClient.getFilterRules(presetId)
const allRules = [
    ...globalRules,      // ClaudeSettings.filterRules (always applied)
    ...presetRules       // PromptTemplate.filterRules (preset-specific)
];
```

**Filter Rule Structure**:
```typescript
FilterRule {
    pattern: string;        // Regex pattern
    replacement: string;    // Replacement (supports $1, $2 capture groups)
    flags?: string;         // Regex flags (g, i, m, s)
    enabled: boolean;
}
```

**Application** (`ResponseFilter.ts`):
```typescript
// Apply each rule sequentially
for (const rule of rules) {
    if (!rule.enabled) continue;
    currentText = currentText.replace(new RegExp(pattern, flags), replacement);
}
```

### 4. Quick Edit Core Flow

**Trigger** (`QuickEditManager.trigger()`):
```typescript
1. Get current selection (text or blocks)
2. Show InstructionInputPopup
3. User selects preset + enters instruction
4. Call processInlineEdit()
```

**Process** (`QuickEditManager.processInlineEdit()`):
```typescript
1. Get preset from ConfigManager
2. Build prompt:
   - Replace {instruction} and {original}
   - Process context placeholders
   - Append preset's appendedPrompt
3. Get filter rules (global + preset)
4. Stream AI response via ClaudeClient
5. Apply filters to response
6. Render comparison block (original vs AI suggestion)
7. Wait for user action (Accept/Reject/Retry)
```

**Accept Action** (`handleAccept()`):
```typescript
1. Insert AI text via SiYuan API: /api/block/insertBlock
2. Delete original blocks via: /api/block/deleteBlock
3. Remove comparison block
4. Record in edit history (for undo)
```

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

## Common Development Tasks

### Add New Preset

**Via Settings UI**:
1. Open Settings → Presets tab
2. Click "Add Preset"
3. Fill fields: name, systemPrompt, appendedPrompt, editInstruction, inputPlaceholder
4. Optional: Add preset-specific filter rules
5. Save

**Via Code** (for built-in presets):
```typescript
// src/settings/config-types.ts - BUILTIN_TEMPLATES
{
    id: 'summarizer',
    name: 'Summarizer',
    systemPrompt: 'You are an expert at creating concise summaries.',
    appendedPrompt: 'Keep the summary under 3 paragraphs.',
    editInstruction: 'Summarize the following:\n\n{original}\n\nFocus: {instruction}',
    inputPlaceholder: '输入摘要重点 (e.g., key findings, main arguments)...',
    isBuiltIn: true,
    category: 'writing'
}
```

### Add Filter Rule

**Via Settings UI**:
1. Open Settings → Filter Rules tab
2. Click "Add Rule" or "Add from Template"
3. Fill: name, pattern (regex), replacement, flags
4. Enable rule
5. Save

**Via Code** (for global rules):
```typescript
// src/settings/config-types.ts - BUILTIN_FILTER_RULE_TEMPLATES
{
    id: 'remove-thinking-tags',
    name: 'Remove <thinking> tags',
    pattern: '<thinking>.*?</thinking>',
    replacement: '',
    flags: 'gs',
    category: 'content_extraction'
}
```

### Add New Setting

1. **Define type** (`src/claude/types.ts`):
```typescript
export interface ClaudeSettings {
    // ... existing
    newFeatureEnabled?: boolean;
}
```

2. **Set default** (`src/claude/index.ts`):
```typescript
export const DEFAULT_SETTINGS: ClaudeSettings = {
    // ... existing
    newFeatureEnabled: true,
};
```

3. **Add UI** (`src/settings/SettingsPanelV3.ts`):
```typescript
<label class="fn__flex b3-label">
    <span>New Feature</span>
    <input type="checkbox" id="newFeatureEnabled" ${settings.newFeatureEnabled ? 'checked' : ''}>
</label>
```

4. **Use in code**:
```typescript
const settings = this.claudeClient.getSettings();
if (settings.newFeatureEnabled) {
    // Feature logic
}
```

---

## Performance Best Practices

### String Concatenation in Loops
```typescript
// ❌ BAD: O(n²)
let result = '';
for (const chunk of chunks) {
    result += chunk;
}

// ✅ GOOD: O(n)
const chunks = [];
for (const chunk of stream) {
    chunks.push(chunk);
}
const result = chunks.join('');
```

### DOM Queries
```typescript
// ❌ BAD: Multiple queries
blockIds.forEach(id => {
    const el = document.querySelector(`[data-node-id="${id}"]`);
});

// ✅ GOOD: Single query
const selector = blockIds.map(id => `[data-node-id="${id}"]`).join(',');
const elements = document.querySelectorAll(selector);
```

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

## Next Development Iteration

### Recommended Enhancements

1. **Enhanced InputPlaceholder**:
   - Add support for dynamic placeholders (e.g., show detected language)
   - Multi-step wizard for complex presets

2. **Context Extraction**:
   - Add support for semantic context (e.g., `{parent_section}`, `{related_notes}`)
   - Cache extracted context to improve performance

3. **Filter System**:
   - Visual filter builder UI
   - Filter testing/preview before saving
   - Import/export filter rule sets

4. **Quick Edit UX**:
   - Inline preview with diff highlighting
   - Keyboard-only workflow (no mouse required)
   - Batch editing for multiple selections

5. **Performance**:
   - Lazy load presets (only fetch when dropdown opens)
   - Debounce filter application during streaming
   - Virtual scrolling for large comparison blocks

### Current Limitations

- Hot reload not supported (must restart SiYuan)
- No undo for "Accept" action (only via edit history)
- Context extraction limited to linear document structure
- Filter rules applied sequentially (no parallel processing)
- No offline mode (requires API connection)

---

**Last Updated**: 2025-11-04
**Version**: 0.7.0
