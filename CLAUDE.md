# CLAUDE.md

Essential development guide for Claude AI integration in SiYuan Note plugin.

## Quick Reference

**Project**: SiYuan Note plugin with Claude AI (Chat + Quick Edit)
**Tech Stack**: TypeScript, Svelte, Vite, Anthropic SDK
**Key Features**: Streaming AI responses, inline editing, multi-profile configs, response filtering

## Build & Deploy

```bash
# One-command deploy (build + copy + restart SiYuan)
npm run deploy

# Manual steps
npm run build              # Build to dist/
npm run copy-plugin        # Copy to N:/Siyuan-Note/data/plugins/
# Then restart SiYuan
```

**Build Output**: `dist/` → `index.js`, `index.css`, `plugin.json`, `icon.png`, i18n files
**Format**: CommonJS (required by SiYuan), externals: `siyuan`, `process`

## Architecture

### Plugin Entry Points
- **Main**: `src/index.ts` → `ClaudeAssistantPlugin`
- **Lifecycle**: `onload()` → `onLayoutReady()` → `onunload()`
- **Dock Init**: ⚠️ `addDock()` registers dock, but `init()` runs LATER when user opens it

### Core Systems

**1. Quick Edit** (`src/quick-edit/`)
- `QuickEditManager.ts`: Main controller (selection → AI → review → apply)
- `InlineEditRenderer.ts`: DOM rendering (comparison blocks, buttons)
- `ContextExtractor.ts`: Context placeholder parsing (`{above=x}`, `{below_blocks=x}`)
- `InstructionInputPopup.ts`: User input dialog with preset selection

**2. Settings** (`src/settings/`)
- `ConfigManager.ts`: Multi-profile management (CRUD, import/export)
- `PromptEditorPanel.ts`: Preset editor with filterRules UI
- `config-types.ts`: Types (ConfigProfile, PromptTemplate, FilterRule)

**3. Claude Client** (`src/claude/`)
- `ClaudeClient.ts`: Streaming/non-streaming API, response filtering
- `ResponseFilter.ts`: Pattern-based content filtering with regex/keywords
- Uses `dangerouslyAllowBrowser: true` for Electron environment

## AI Request Pipeline (Quick Edit)

### Flow Diagram
```
User Selection → Instruction Input → Build Prompt → Process Context →
Apply Filters → Stream Response → Render Preview → User Review → Apply/Reject
```

### Detailed Pipeline (QuickEditManager.processInlineEdit)

**Step 1: Template Processing**
```typescript
// Get template from settings
const template = claudeSettings.quickEditPromptTemplate || defaultTemplate;

// Process context placeholders (ContextExtractor)
if (hasPlaceholders(template)) {
    template = await processTemplate(template, selectedBlockIds);
    // Replaces: {above=5}, {below=3}, {above_blocks=2}, {below_blocks=4}
}
```

**Step 2: Prompt Building**
```typescript
// Replace placeholders
let userPrompt = template
    .replace('{instruction}', userInstruction)
    .replace('{original}', originalText);

// Append unified prompt (from systemPrompt/appendedPrompt)
if (appendedPrompt) {
    userPrompt += '\n\n' + appendedPrompt;
}
```

**Step 3: Get FilterRules**
```typescript
// Retrieve from current preset (stored in localStorage)
const lastPresetId = localStorage.getItem('claude-quick-edit-last-preset-index');
const currentPreset = configManager.getAllTemplates().find(t => t.id === lastPresetId);
const filterRules = currentPreset?.filterRules || [];
```

**Step 4: Send Request with Streaming**
```typescript
await claudeClient.sendMessage(
    [{ role: 'user', content: userPrompt }],
    onMessage,    // Chunk callback
    onError,      // Error callback
    onComplete,   // Completion callback
    "QuickEdit",  // Feature name (for logging)
    filterRules   // Response filtering rules
);
```

**Step 5: Response Processing (ClaudeClient)**
```typescript
// Stream chunks
for await (const chunk of stream) {
    accumulatedResponse += chunk;

    // Apply filterRules after each chunk
    if (hasFilterRules) {
        const filterResult = responseFilter.applyFilters(accumulatedResponse, filterRules);
        if (filterResult.wasFiltered) {
            // Send filtered content with marker
            onMessage('[FILTERED_REPLACE]' + filterResult.filtered);
            break; // Stop streaming
        }
    }

    onMessage(chunk); // Normal chunk
}
```

**Step 6: Render Preview**
```typescript
// InlineEditRenderer displays:
// - Original text (red background on source blocks)
// - AI suggestion (streaming with typing animation)
// - Action buttons (Accept/Reject/Retry)
```

**Step 7: User Action**
- **Accept**: Insert AI text via `/api/block/insertBlock`, delete original blocks
- **Reject**: Remove comparison block, restore original
- **Retry**: Clear suggestion, re-run pipeline with same instruction

### Context Extractor Placeholders

Supported patterns in prompt templates:
- `{above=5}` - 5 lines of text above selection
- `{below=3}` - 3 lines of text below selection
- `{above_blocks=2}` - 2 SiYuan blocks above selection
- `{below_blocks=4}` - 4 SiYuan blocks below selection

Implementation: `ContextExtractor.ts` parses placeholders → fetches content from DOM → replaces in template

### Response Filtering

**FilterRule Structure**:
```typescript
interface FilterRule {
    name: string;
    enabled: boolean;
    pattern: string;        // Regex or keyword
    replacement: string;    // Replacement text
    useRegex: boolean;      // true for regex, false for keyword
    flags?: string;         // Regex flags (g, i, m, s)
}
```

**Filter Application** (ResponseFilter.ts):
1. Check if response matches any enabled rule's pattern
2. If match found: apply replacement, return filtered content with `wasFiltered: true`
3. ClaudeClient sends `[FILTERED_REPLACE]` marker + filtered content
4. QuickEditManager replaces entire preview with filtered version

## Critical Performance Fixes

**Streaming O(n²) → O(n)**: Use array accumulation instead of string concatenation
```typescript
// ❌ BAD: O(n²) - creates new string each iteration
fullResponse += chunk;

// ✅ GOOD: O(n) - accumulate in array, join once at end
fullResponseChunks.push(chunk);
const fullResponse = fullResponseChunks.join('');
```

**DOM Query Optimization**: Batch queries with single `querySelectorAll`
```typescript
// ❌ BAD: O(N) separate queries
blockIds.forEach(id => {
    const el = document.querySelector(`[data-node-id="${id}"]`);
    el.classList.add('class');
});

// ✅ GOOD: O(1) single query
const selector = blockIds.map(id => `[data-node-id="${id}"]`).join(',');
const elements = document.querySelectorAll(selector);
elements.forEach(el => el.classList.add('class'));
```

## Common Development Tasks

### Add New Setting
1. Update `ClaudeSettings` or `EditSettings` in `src/claude/types.ts`
2. Update `DEFAULT_SETTINGS` in `src/claude/index.ts`
3. Add UI in `SettingsPanelV3.ts` (escape HTML with `escapeHtml()`)
4. Handle in relevant component (`ClaudeClient.ts`, `QuickEditManager.ts`)

### Modify Quick Edit Prompt
1. Edit template in `QuickEditManager.processInlineEdit()` (line ~563)
2. Or configure via Settings UI → Quick Edit Prompt Template
3. Supports placeholders: `{instruction}`, `{original}`, `{above=x}`, etc.

### Add FilterRule Template
1. Update `BUILTIN_FILTER_RULE_TEMPLATES` in `config-types.ts`
2. Or create via Settings UI → Filter Rules → Add from Template

### Work with SiYuan API
```typescript
// Insert block
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
```

## Security & Data Safety

- **XSS Protection**: Always use `escapeHtml()` before setting `innerHTML`
- **Atomic Saves**: Settings use try-catch with rollback on failure
- **API Keys**: Stored in localStorage (not encrypted - warn users)
- **Filter Validation**: Regex patterns validated before saving

## Troubleshooting

**Plugin not loading**: Verify `icon.png` exists (160x160, required)
**Quick Edit error**: Check console (F12), verify preset has valid filterRules
**Build fails**: Run `pnpm install`, check Node version compatibility
**Changes not showing**: Ensure `npm run deploy` ran successfully, restart SiYuan

## Key Files for Future Development

- `src/quick-edit/QuickEditManager.ts` - Main Quick Edit logic, AI pipeline
- `src/claude/ClaudeClient.ts` - API client, streaming, filtering
- `src/claude/ResponseFilter.ts` - Content filtering engine
- `src/quick-edit/ContextExtractor.ts` - Context placeholder parser
- `src/settings/ConfigManager.ts` - Profile/preset management
- `src/settings/PromptEditorPanel.ts` - Settings UI with filter editor

## Debug Logging

Console logs cleaned (only errors/warnings remain):
- `console.error()` - Critical errors requiring attention
- `console.warn()` - Non-critical issues, fallback behavior
- `console.log()` - Removed from production code (streamlined output)

To debug, add temporary logs with clear prefixes:
```typescript
console.log('[QuickEdit] Debug:', data);
```
