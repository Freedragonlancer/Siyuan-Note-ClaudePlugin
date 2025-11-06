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

### Core Systems (v0.9.0 Modular Architecture)

**1. Configuration (Multi-Profile + Presets)**
```
ConfigManager
  ├── Profiles (Multiple configuration sets)
  │   └── ConfigProfile { settings: ClaudeSettings }
  └── Presets (Reusable prompt templates)
      └── PromptTemplate { systemPrompt, appendedPrompt, editInstruction,
                           inputPlaceholder, filterRules, ... }
```

**2. AI Provider Layer (Extensible)**
```
AIProviderFactory
  ├── AnthropicProvider (Claude - Implemented ✅)
  ├── OpenAIProvider (GPT - Planned 📋)
  ├── GeminiProvider (Google - Planned 📋)
  └── Custom Providers (Extensible 🔌)
```

**Key Interface**:
```typescript
interface AIProvider {
  sendMessage(messages, options): Promise<string>
  streamMessage(messages, options): Promise<void>
  validateConfig(config): boolean | string
  getAvailableModels(): string[]
}
```

**3. Quick Edit Pipeline (Modular)**
```
User Selection → SelectionHandler → PromptBuilder → AIProvider →
FilterPipeline → InlineEditRenderer → User Review (Accept/Reject/Retry)
```

**Modular Components**:
- `SelectionHandler` - Text/block selection extraction
- `PromptBuilder` - Template-based prompt construction
- `BlockOperations` - SiYuan API wrapper (insert, delete, update)
- `EditStateManager` - State management and cleanup
- `QuickEditManager` - Orchestrator coordinating components

**4. Filter Pipeline System**
```
FilterPipeline
  ├── RegexFilterMiddleware (pattern-based)
  ├── CodeBlockNormalizerMiddleware (formatting)
  ├── MarkdownLinkFixerMiddleware (validation)
  ├── WhitespaceTrimmerMiddleware (cleanup)
  └── CustomFunctionMiddleware (user-defined)
```

**5. UI Panels**
- `UnifiedAIPanel` - Main chat interface (sidebar dock)

---

## Quick Edit System

### Core Components (Modular Architecture v0.9.0)

**QuickEditManager** (`src/quick-edit/QuickEditManager.ts`)
- Orchestrator coordinating Quick Edit workflow
- Entry point: `trigger()` method
- Delegates to specialized modules (SelectionHandler, PromptBuilder, etc.)
- Status: Transitioning from monolithic to modular (backward compatible)

**Modular Components (NEW v0.9.0)**:

**SelectionHandler** (`src/quick-edit/SelectionHandler.ts`)
- Extracts text selection from SiYuan editor
- Handles single and multi-block selections
- Validates selection and finds containing blocks
- Key method: `getSelection(protyle): InlineEditSelection | null`

**PromptBuilder** (`src/quick-edit/PromptBuilder.ts`)
- Constructs AI prompts from templates
- Replaces placeholders: `{instruction}`, `{original}`, `{above=N}`, `{below=N}`
- Integrates with ContextExtractor for surrounding context
- Key method: `buildPrompt(template, options): Promise<BuiltPrompt>`

**BlockOperations** (`src/quick-edit/BlockOperations.ts`)
- Encapsulates all SiYuan API operations
- Methods: `insertBlock()`, `deleteBlock()`, `updateBlock()`
- Batch operations: `insertMultipleBlocks()`, `deleteMultipleBlocks()`
- Markdown formatting: `applyMarkdownFormatting()`

**EditStateManager** (`src/quick-edit/EditStateManager.ts`)
- Manages active edit sessions
- Keyboard handler registration/cleanup
- DOM mutation observer for external changes
- Prevents concurrent edits with `isCurrentlyProcessing()` check
- Key methods: `addActiveBlock()`, `setupDOMObserver()`, `destroy()`

**Supporting Components**:

**InstructionInputPopup** (`src/quick-edit/InstructionInputPopup.ts`)
- Preset selector with quick access buttons
- Input field with dynamic placeholder (from `PromptTemplate.inputPlaceholder`)
- Persistence: Dual-storage (localStorage cache + file storage)

**ContextExtractor** (`src/quick-edit/ContextExtractor.ts`)
- Parses template placeholders: `{above=N}`, `{below=N}`, `{above_blocks=N}`, `{below_blocks=N}`
- Extracts surrounding context from SiYuan document via SQL API or DOM fallback
- **Security**: Sanitizes blockId to prevent SQL injection (v0.9.0)
- **Optimization**: Uses `root_id` for efficient block queries (v0.9.0)
- Key method: `extractContext(template, blockId): Promise<string>`

**InlineEditRenderer** (`src/quick-edit/InlineEditRenderer.ts`)
- Renders comparison view (original vs AI suggestion)
- Action buttons: Accept, Reject, Retry
- **Security**: Uses `escapeHtml()` for XSS protection
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

## Extensibility (v0.9.0+)

### Adding AI Providers

The plugin now supports multiple AI providers through an abstraction layer:

```typescript
// 1. Implement AIProvider interface
class MyCustomProvider implements AIProvider {
    readonly providerType = 'custom';
    readonly providerName = 'My AI Service';

    async sendMessage(messages: Message[], options?: AIRequestOptions): Promise<string> {
        // Implementation
    }

    async streamMessage(messages: Message[], options?: AIRequestOptions): Promise<void> {
        // Stream implementation with options.onChunk callback
    }

    validateConfig(config: AIModelConfig): true | string {
        if (!config.apiKey) return 'API key required';
        return true;
    }

    getAvailableModels(): string[] {
        return ['model-v1', 'model-v2'];
    }
}

// 2. Register provider
AIProviderFactory.register({
    type: 'custom',
    factory: (config) => new MyCustomProvider(config),
    displayName: 'My AI Service',
    description: 'Custom AI provider'
});
```

**Current Providers:**
- `anthropic` - Claude (Implemented ✅)
- `openai` - GPT (Planned 📋)
- `gemini` - Google Gemini (Planned 📋)

### Adding Filter Middleware

Create custom response filters using the pipeline system:

```typescript
import { FilterMiddleware, FilterContext } from '@/filter/types';

class MyFilterMiddleware implements FilterMiddleware {
    readonly name = 'MyCustomFilter';

    process(response: string, context: FilterContext): string {
        // Transform response
        return response.replace(/pattern/g, 'replacement');
    }

    validate(): boolean | string {
        // Optional validation
        return true;
    }
}

// Use in pipeline
import { FilterPipeline } from '@/filter/FilterPipeline';
import { RegexFilterMiddleware } from '@/filter/middleware';

const pipeline = new FilterPipeline();
pipeline.use(new RegexFilterMiddleware(rules));
pipeline.use(new MyFilterMiddleware());

const filtered = await pipeline.execute(response, 'QuickEdit');
```

**Built-in Middleware:**
- `RegexFilterMiddleware` - Pattern-based filtering
- `CodeBlockNormalizerMiddleware` - Code block formatting
- `MarkdownLinkFixerMiddleware` - Link validation
- `WhitespaceTrimmerMiddleware` - Whitespace cleanup
- `ConditionalMiddleware` - Conditional execution
- `PresetSpecificMiddleware` - Preset-based filtering

### Using Modular Quick Edit Components

Leverage the new modular components in your own features:

```typescript
import {
    SelectionHandler,
    BlockOperations,
    PromptBuilder,
    EditStateManager
} from '@/quick-edit';

class MyFeature {
    private selectionHandler = new SelectionHandler();
    private blockOps = new BlockOperations();
    private promptBuilder = new PromptBuilder(contextExtractor);
    private stateManager = new EditStateManager();

    async process() {
        // 1. Get selection
        const selection = this.selectionHandler.getSelection(protyle);
        if (!selection) return;

        // 2. Build prompt
        const prompt = await this.promptBuilder.buildPrompt(template, {
            instruction: 'Improve text',
            originalText: selection.text,
            blockId: selection.blockId
        });

        // 3. Call AI and insert result
        const result = await aiProvider.sendMessage(prompt.messages);
        await this.blockOps.insertBlock(result, selection.blockId);
    }
}
```

See [MODULAR_REFACTORING_GUIDE.md](MODULAR_REFACTORING_GUIDE.md) for detailed API documentation and examples.

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

### Input Validation (v0.9.0)
- **SQL Injection Prevention**: `sanitizeBlockId()` validates block IDs before SQL queries (ContextExtractor)
  - Pattern: `/^[0-9]{14}-[0-9a-z]{7}$/i` (SiYuan format: 14 digits + hyphen + 7 chars)
  - Throws error on invalid format
  - Validates all numeric parameters (count range: 1-100)
  - Uses `root_id` instead of `parent_id` for secure sibling block queries
- **XSS Protection**: Always use `escapeHtml()` before setting `innerHTML`
  - Applied in InlineEditRenderer
  - Applied in UnifiedAIPanel markdown rendering

### Configuration Security
- **API Keys**: Stored in localStorage (NOT encrypted - warn users)
- **Async Initialization**: Fixed race condition using `waitForLoad()` pattern (v0.9.0)
  - Prevents settings overwrite on first launch
  - Ensures configuration fully loaded before plugin initialization

### API Security
- **Filter Validation**: Regex patterns validated to prevent ReDoS attacks
- **Timeout Protection**: `fetchWithTimeout()` prevents indefinite API hangs (10s default)
- **Request Abort**: AbortController support for canceling in-flight requests

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
- `src/quick-edit/QuickEditManager.ts` - Quick Edit orchestrator
- `src/quick-edit/SelectionHandler.ts` - Selection extraction (NEW v0.9.0)
- `src/quick-edit/PromptBuilder.ts` - Prompt construction (NEW v0.9.0)
- `src/quick-edit/BlockOperations.ts` - SiYuan API wrapper (NEW v0.9.0)
- `src/quick-edit/EditStateManager.ts` - State management (NEW v0.9.0)

### AI Provider Layer (NEW v0.9.0)
- `src/ai/types.ts` - AIProvider interface definitions
- `src/ai/AnthropicProvider.ts` - Claude implementation
- `src/ai/AIProviderFactory.ts` - Provider registry and factory
- `src/ai/index.ts` - Module exports

### Filtering System
- `src/filter/ResponseFilter.ts` - Legacy regex-based filtering
- `src/filter/FilterPipeline.ts` - Middleware pipeline system (NEW v0.9.0)
- `src/filter/middleware.ts` - Built-in middleware (NEW v0.9.0)
- `src/filter/types.ts` - FilterRule, FilterResult

### UI Components
- `src/quick-edit/InstructionInputPopup.ts` - Preset selector + input
- `src/quick-edit/InlineEditRenderer.ts` - Comparison block rendering
- `src/sidebar/UnifiedAIPanel.ts` - Main chat interface

### Configuration
- `src/settings/ConfigManager.ts` - Profile/preset management
- `src/settings/SettingsManager.ts` - Persistence (async initialization)
- `src/settings/PromptEditorPanel.ts` - Settings UI
- `src/settings/config-types.ts` - Types (PromptTemplate, FilterRule)

### Context Processing
- `src/quick-edit/ContextExtractor.ts` - Placeholder parser with SQL injection protection

### Types
- `src/claude/types.ts` - ClaudeSettings, Message
- `src/ai/types.ts` - AIProvider, AIModelConfig (NEW v0.9.0)
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

## Architecture Documentation

For detailed architecture information (v0.9.0 Refactoring):

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Complete architecture guide (coming soon)
  - Module details and responsibilities
  - Data flow diagrams
  - Extensibility points
  - Performance optimizations

- **[REFACTORING.md](REFACTORING.md)** - v0.9.0 refactoring log
  - Phase 1: Security fixes (SQL injection, async initialization)
  - Phase 2: AI Provider abstraction & Filter Pipeline
  - Phase 3: QuickEditManager modularization
  - Migration guide and backward compatibility notes

- **[MODULAR_REFACTORING_GUIDE.md](MODULAR_REFACTORING_GUIDE.md)** - Module usage guide
  - Detailed API documentation for new modules
  - Code examples and best practices
  - Testing examples
  - Migration checklist

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
- API keys stored unencrypted in localStorage
- QuickEditManager partially modularized (ongoing refactoring)
  - New modules available for use (SelectionHandler, BlockOperations, PromptBuilder, EditStateManager)
  - Full migration to modular architecture planned for v0.10.0
- Multi-provider support framework ready, but only Anthropic implemented
  - OpenAI and Gemini providers planned for future releases

---

**Last Updated**: 2025-01-06
**Version**: 0.8.0 (Architecture v0.9.0)
