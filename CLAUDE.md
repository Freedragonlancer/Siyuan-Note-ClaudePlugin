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
npm run clean-deploy  # Remove duplicates + fresh deploy (fixes topbar icon issues)
npm run clean-cache   # Clear SiYuan's cached HTML/CSS
```

**Mandatory final step for every development task**: after code changes, run the appropriate validation, then run `npm run deploy` (build + copy plugin files) before reporting completion. Without deploy/release, SiYuan will not show the updated plugin behavior. Tell the user clearly if deployment could not be completed.

### Testing
```bash
npm run test          # Run all tests with Vitest
npm run test:ui       # Run tests with browser UI
npm run test:unit     # Unit tests only
npm run test:integration  # Integration tests only
npm run test:coverage # Generate coverage report
```

**Note**: Hot reload NOT supported - must restart SiYuan (F5) after each change.

### Development Workflow
1. Edit TypeScript/Svelte files in `src/`
2. Run relevant validation (`npm run build`, targeted tests, or `npm run test`)
3. Run `npm run deploy` before finishing the task
4. Restart SiYuan (F5)
5. Test in plugin dock panel
6. Check console (F12) for errors

### Path Aliases
Use `@/` for imports from `src/`:
```typescript
import { SecurityUtils } from '@/utils/Security';
import { AIProvider } from '@/ai/types';
```

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
- `ConfigManager` - Profile and preset management
- `PromptTemplate` - Reusable prompt templates with placeholders
- Multi-provider settings for 6 AI providers

**2. AI Provider Layer**
```
AIProviderFactory
  ├── AnthropicProvider (Claude) ✅
  ├── OpenAIProvider (GPT) ✅
  ├── GeminiProvider (Google Gemini) ✅
  ├── XAIProvider (xAI Grok) ✅
  ├── DeepSeekProvider (DeepSeek) ✅
  ├── MoonshotProvider (Moonshot AI Kimi) ✅
  └── Extensible for custom providers 🔌
```

**Key Interface**:
```typescript
interface AIProvider {
  sendMessage(messages, options): Promise<string>
  streamMessage(messages, options): Promise<void>
  validateConfig(config): true | string
  getAvailableModels(): string[]
  getMaxTokenLimit(model: string): number
  getParameterLimits(): ParameterLimits
  supportsStreaming(): boolean
}
```

**3. Quick Edit Pipeline**
```
User Selection → SelectionHandler → PromptBuilder → AIProvider →
FilterPipeline → InlineEditRenderer → User Review (Accept/Reject/Retry)
```

**Modular Components**:
- `SelectionHandler` - Text/block selection extraction
- `PromptBuilder` - Template-based prompt construction with placeholders
- `BlockOperations` - SiYuan API wrapper with batch operations (96% faster for 200+ blocks)
- `EditStateManager` - State management and cleanup
- `QuickEditManager` - Orchestrator coordinating components

**4. Filter Pipeline**
```
FilterPipeline
  ├── RegexFilterMiddleware (pattern-based)
  ├── CodeBlockNormalizerMiddleware (formatting)
  ├── MarkdownLinkFixerMiddleware (validation)
  ├── WhitespaceTrimmerMiddleware (cleanup)
  └── CustomFunctionMiddleware (user-defined)
```

**5. UI Panels (Modular Architecture)**

`UnifiedAIPanel` - Main chat interface (sidebar dock)
- **Architecture**: Coordinator pattern with specialized utility modules
- **Modules** (`src/sidebar/unified/`): UIBuilder, PresetManager, QueueRenderer, MessageRenderer, Helpers, SelectionManager

---

## Quick Edit System

### Core Workflow

1. **Trigger**: User selects text/blocks → Right-click menu or keyboard shortcut
2. **Input**: Popup shows preset buttons + instruction input (with command history)
3. **Process**: Build prompt with template + context → Stream AI response → Apply filters
4. **Preview**: Render comparison block in document
5. **Action**: User accepts (replace blocks) or rejects (restore original)

### Template Placeholders

Quick Edit templates support context placeholders:

- `{above=N}` - Get N lines of text above the selection
- `{below=N}` - Get N lines of text below the selection
- `{above_blocks=N}` - Get N SiYuan blocks above
- `{below_blocks=N}` - Get N SiYuan blocks below
- `{custom=((blockid 'name'))}` - Fetch content from referenced SiYuan block
- `{instruction}` - User's editing instruction
- `{original}` - Selected text content

**Example Template**:
```markdown
editInstruction: |
  上文参考：
  {above_blocks=2}

  任务：{instruction}
  原文：{original}

  下文参考：
  {below_blocks=1}
```

### Command History (v0.10.0)

The instruction input popup supports terminal-style command history:

- **Up Arrow** (↑): Browse to previous (older) command
- **Down Arrow** (↓): Browse to next (newer) command
- Automatically saves up to 30 recent commands (FIFO)
- Persistent storage (survives SiYuan restart)

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

---

## Extensibility

### Adding New AI Providers

Adding a provider requires implementing the `AIProvider` interface and updating configuration:

**Required Steps**:
1. Create provider class extending `BaseAIProvider` in `src/ai/providers/`
2. Implement required methods: `sendMessage`, `streamMessage`, `validateConfig`, `getAvailableModels`, `getMaxTokenLimit`, `getParameterLimits`
3. Export from `src/ai/providers/index.ts`
4. Register in `AIProviderFactory.ts`
5. Add to `AIProviderType` in `src/ai/types.ts`
6. **CRITICAL**: Add to `DEFAULT_SETTINGS.providers` in `src/claude/index.ts`
7. Add UI components in `src/settings/SettingsPanelV3.ts`
8. Add display name mapping in `src/claude/UniversalAIClient.ts`
9. Add badge display in `src/sidebar/UnifiedAIPanel.ts`

**Provider-Specific Notes**:
- **Anthropic**: BaseURL automatically strips trailing `/v1` to prevent duplicate paths
- **DeepSeek**: Reasoning models automatically disable temperature/top_p
- **Moonshot**: Temperature auto-clamped to [0, 1], K2 Thinking models expose reasoning content
- **Gemini**: No dedicated system prompt field (merged with first user message)

See `src/ai/providers/MoonshotProvider.ts` for a complete real-world example.

### Adding Filter Middleware

Create custom response filters using the pipeline system:

```typescript
import { FilterMiddleware, FilterContext } from '@/filter/types';

class MyFilterMiddleware implements FilterMiddleware {
    readonly name = 'MyCustomFilter';

    process(response: string, context: FilterContext): string {
        return response.replace(/pattern/g, 'replacement');
    }

    validate(): boolean | string {
        return true;
    }
}

// Use in pipeline
import { FilterPipeline } from '@/filter/FilterPipeline';

const pipeline = new FilterPipeline();
pipeline.use(new RegexFilterMiddleware(rules));
pipeline.use(new MyFilterMiddleware());

const filtered = await pipeline.execute(response, 'QuickEdit');
```

---

## Development Guidelines

### Adding Presets
- **UI**: Settings → Presets tab → Add Preset
- **Fields**: id, name, systemPrompt, appendedPrompt, editInstruction, inputPlaceholder, filterRules

### Adding Settings
1. Define type in `src/claude/types.ts` (ClaudeSettings interface)
2. Set default in `src/claude/index.ts` (DEFAULT_SETTINGS)
3. Add UI in `src/settings/SettingsPanelV3.ts`
4. Access via `claudeClient.getSettings()`

### Performance Notes
- **Streaming**: Use array accumulation + join() instead of string concatenation (O(n) vs O(n²))
- **Batch Operations**: Use BlockOperations for bulk insert/delete (10+ blocks)
- **DOM Caching**: Use WeakMap to cache frequently accessed elements
- **XSS Protection**: Always use `escapeHtml()` before setting `innerHTML`

---

## Security

### Input Validation
- **SQL Injection Prevention**: `sanitizeBlockId()` validates block IDs before SQL queries
  - Pattern: `/^[0-9]{14}-[0-9a-z]{7}$/i` (SiYuan format)
  - Validates numeric parameters (count range: 1-100)
- **XSS Protection**: Always use `SecurityUtils.escapeHtml()` before setting `innerHTML`
  - Applied in InlineEditRenderer, UnifiedAIPanel markdown rendering

### Configuration Security
- **API Keys**: Stored in localStorage (NOT encrypted - warn users)
- **Deep Merge for Providers**: Ensures new providers from DEFAULT_SETTINGS are preserved when loading saved configs
- **Timeout Protection**: `fetchWithTimeout()` prevents indefinite API hangs (10s default)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Plugin not loading | Check `icon.png` exists (160x160), verify `plugin.json` version matches `package.json` |
| Quick Edit error | Check console, test with default preset, verify editInstruction is valid |
| Build fails | Run `npm install`, check Node 18+, clear `dist/` folder |
| Changes not showing | Ensure `npm run deploy` succeeded, restart SiYuan (not just F5) |
| Streaming timeout | Check API key, network, provider status; increase timeout in ClaudeClient.ts |
| **Reverse proxy 404 error** | **Anthropic**: Use full baseURL with `/v1` (plugin auto-strips). **Others**: Use baseURL as provided. |
| **Multiple topbar icons (3+)** | **Run `npm run clean-deploy` - removes duplicates caused by improper cleanup** |
| **Settings panel blank** | **Run `npm run clean-cache` then restart SiYuan - clears cached HTML/CSS** |

---

## Key Files Reference

### Core Logic
- `src/index.ts` - Plugin entry, lifecycle
- `src/quick-edit/QuickEditManager.ts` - Quick Edit orchestrator
- `src/quick-edit/` - Modular Quick Edit components (SelectionHandler, PromptBuilder, BlockOperations, EditStateManager, InstructionHistoryManager)

### AI Provider Layer
- `src/ai/types.ts` - AIProvider interface definitions
- `src/ai/providers/` - Provider implementations (Anthropic, OpenAI, Gemini, XAI, DeepSeek, Moonshot)
- `src/ai/AIProviderFactory.ts` - Provider registry and factory

### UI Components
- `src/sidebar/UnifiedAIPanel.ts` - Main chat interface
- `src/sidebar/unified/` - Modular UI utilities (UIBuilder, PresetManager, QueueRenderer, MessageRenderer, Helpers, SelectionManager)
- `src/quick-edit/InstructionInputPopup.ts` - Preset selector + input with command history
- `src/quick-edit/InlineEditRenderer.ts` - Comparison block rendering

### Configuration
- `src/settings/ConfigManager.ts` - Profile/preset management
- `src/settings/SettingsManager.ts` - Persistence (async initialization)
- `src/settings/SettingsPanelV3.ts` - Settings UI
- `src/settings/config-types.ts` - Types (PromptTemplate, FilterRule)

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

## Additional Resources

- **SiYuan API**: https://github.com/siyuan-note/siyuan/tree/master/kernel/api
- **Anthropic Docs**: https://docs.anthropic.com/
- **Plugin Sample**: https://github.com/siyuan-note/plugin-sample
- **Release Guide**: [RELEASE.md](RELEASE.md)
- **Moonshot AI Setup**: [MOONSHOT_API_SETUP.md](MOONSHOT_API_SETUP.md)
- **Modular Refactoring Guide**: [MODULAR_REFACTORING_GUIDE.md](MODULAR_REFACTORING_GUIDE.md)
- **Refactoring History**: [REFACTORING.md](REFACTORING.md)

---

## Known Limitations

- Hot reload not supported (must restart SiYuan after code changes)
- Context extraction limited to linear document structure
- No offline mode (requires active API connection)
- API keys stored unencrypted in localStorage (warn users to protect workspace)
- QuickEditManager uses hybrid architecture (legacy + new modular components for backward compatibility)
