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
- [ ] Command history navigation works (Up/Down arrows)
- [ ] Batch operations perform well (200+ blocks)

---

## Automated Deployment Workflow

### Available Commands

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `npm run deploy` | Standard deployment | Normal development - incremental changes |
| `npm run clean-cache` | Clear SiYuan cache only | UI not updating, cached resources |
| `npm run clean-deploy` | Full clean deployment | Major issues, multiple topbar icons, complete refresh |
| `npm run clean-deploy:auto-start` | Clean deploy + auto-start SiYuan | Automated workflow, save time |

### Deployment Scenarios

**Scenario 1: Normal Development (Incremental Changes)**
```bash
# Standard workflow - fastest
npm run deploy
# Then: Restart SiYuan (F5)
```

**Scenario 2: Cache Issues (UI Not Updating)**
```bash
# 1. Clear cache only (SiYuan must be closed)
npm run clean-cache

# 2. Restart SiYuan manually
```

**Scenario 3: Major Issues or Clean Start**
```bash
# Full clean deployment (closes SiYuan automatically)
npm run clean-deploy

# Or with auto-start
npm run clean-deploy:auto-start
```

### What Each Script Does

**`npm run clean-deploy`** performs:
1. ✓ Closes SiYuan application
2. ✓ Removes SiYuan cache (`N:/Siyuan-Note/temp`)
3. ✓ Deletes old plugin directory
4. ✓ Cleans dist folder
5. ✓ Rebuilds plugin from source
6. ✓ Copies all files (js, css, json, icon, readme)
7. ✓ Verifies deployment (file existence check)

**`npm run clean-cache`** performs:
1. ✓ Removes SiYuan cache only
2. ✓ Does NOT delete plugin files
3. ✓ Does NOT rebuild
4. ⚠ Requires manual SiYuan restart

### When to Use Clean Deploy

Use `npm run clean-deploy` when encountering:
- **Multiple topbar icons** (3+ duplicate icons)
- **Settings UI not rendering** (blank panels)
- **CSS changes not applying** (old styles persist)
- **JavaScript errors after refactoring** (stale code)
- **Plugin behavior inconsistent** (cache conflicts)

### Configuration

Edit `scripts/clean-deploy.cjs` to customize paths:

```javascript
const CONFIG = {
    siyuanPath: 'N:/Siyuan-Note',
    pluginName: 'siyuan-plugin-claude-assistant',
    siyuanExe: 'N:/Siyuan-Note/SiYuan.exe',
};
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
  ├── OpenAIProvider (GPT - Implemented ✅)
  ├── GeminiProvider (Google Gemini - Implemented ✅)
  ├── XAIProvider (xAI Grok - Implemented ✅)
  ├── DeepSeekProvider (DeepSeek - Implemented ✅)
  ├── MoonshotProvider (Moonshot AI Kimi - Implemented ✅)
  └── Custom Providers (Extensible 🔌)
```

**Key Interface**:
```typescript
interface AIProvider {
  // Core methods
  sendMessage(messages, options): Promise<string>
  streamMessage(messages, options): Promise<void>

  // Configuration
  validateConfig(config): true | string
  getAvailableModels(): string[]

  // Required abstract methods (from BaseAIProvider)
  getMaxTokenLimit(model: string): number
  getParameterLimits(): ParameterLimits
  getMetadata(): ProviderMetadata  // v0.12.0+ metadata-first architecture

  // Feature detection
  supportsStreaming(): boolean
  supportsSystemPrompt(): boolean
}
```

**Full interface at**: `src/ai/types.ts` (lines 70-140)

**Provider-Specific Features**:
- **Anthropic (Claude)**:
  - Native streaming support, tool use capabilities
  - **BaseURL handling**: Automatically strips trailing `/v1` to prevent duplicate paths
  - Temperature range: [0, 1], max output: 4096 tokens (8192 in extended thinking mode)
  - Models: Sonnet 4.5, Opus 4, Sonnet 3.7, Haiku 3.5
  - **🧠 Thinking Mode** (v0.13.0): Extended Thinking for Sonnet 4+, Opus 4
    - Configurable thinking budget (up to 128K tokens)
    - Model deeply considers and iterates before answering

- **OpenAI (GPT)**:
  - Function calling, vision support (GPT-4V)
  - Temperature range: [0, 2], max output: varies by model (4K-100K)
  - O-series reasoning models support up to 100K output tokens
  - **🧠 Thinking Mode** (v0.13.0): Model-level (select o1/o3/o3-mini models)
    - No parameter needed - thinking built into model architecture

- **Gemini**:
  - Multimodal input, long context (1M-2M tokens)
  - No dedicated system prompt field (merged with first user message)
  - Temperature range: [0, 2], max output: 8192 tokens
  - **🧠 Thinking Mode** (v0.13.0): Thinking Budget for Gemini 2.5+
    - Configurable budget (up to 24576 tokens for 2.5 Flash)
    - Enables step-by-step reasoning with thought summaries

- **xAI (Grok)**:
  - OpenAI-compatible API
  - Vision support in grok-vision-beta
  - Temperature range: [0, 2], context: 128K
  - **🧠 Thinking Mode** (v0.13.0): Reasoning Effort parameter
    - 'low' for speed, 'high' for depth
    - Available in Grok 3+, Grok 4 Fast models

- **DeepSeek**:
  - Specialized coding models, cost-effective pricing
  - **Reasoning models** (deepseek-reasoner): Temperature/top_p disabled automatically
  - Temperature range: [0, 2] (for non-reasoning models), context: 128K
  - **🧠 Thinking Mode** (v0.13.0): Model-level (select deepseek-reasoner)
    - Exposes reasoning_content separate from final answer

- **Moonshot (Kimi)**:
  - K2 Thinking models expose `reasoning_content` in responses, automatically formatted in collapsible sections
  - **Temperature range**: [0, 1] (auto-clamped with warning)
  - Context window: 128K-256K
  - **🧠 Thinking Mode** (v0.13.0): Boolean reasoning parameter
    - Enables K2 Thinking models to expose reasoning process
    - Supports 200-300 sequential tool calls without drift
  - See [MOONSHOT_API_SETUP.md](MOONSHOT_API_SETUP.md) for details

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
- Hybrid architecture: legacy monolithic + new modular components (backward compatible)

**Modular Components** (v0.9.0+):

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
- **Batch operations** (v0.9.3 - Performance optimized):
  - `insertMultipleBlocks()` - Auto-selects batch/sequential based on count (10+ uses batch API)
  - `deleteMultipleBlocks()` - Uses `/api/transactions` for batch deletion
  - Version detection with graceful fallback for older SiYuan versions
  - **Performance**: 96% faster for 200+ blocks (20s → 2s)
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
- **Terminal-style command history** (v0.10.0):
  - Up/Down arrow keys to browse last 30 commands
  - Auto-saves submitted instructions
  - Smart deduplication (skips consecutive duplicates)
  - State machine: normal → browsing → exit on edit

**InstructionHistoryManager** (`src/quick-edit/InstructionHistoryManager.ts`)
- FIFO queue with max 30 entries (auto-removes oldest)
- Dual-layer persistence (localStorage + file storage)
- Storage path: `/data/storage/siyuan-plugin-claude-assistant/instruction-history.json`
- Navigation API: `navigate(currentIndex, 'up'|'down')`
- Key methods: `addEntry()`, `getHistory()`, `navigate()`, `clearHistory()`

**ContextExtractor** (`src/quick-edit/ContextExtractor.ts`)
- Parses template placeholders: `{above=N}`, `{below=N}`, `{above_blocks=N}`, `{below_blocks=N}`, `{custom=((blockid 'name'))}`
- Extracts surrounding context from SiYuan document via SQL API or DOM fallback
- **Custom block reference** (v0.9.3): `{custom=((blockid 'name'))}` - fetches referenced block content
- **Security** (v0.9.0): Sanitizes blockId to prevent SQL injection
- **Optimization** (v0.9.0): Uses `root_id` for efficient block queries
- **Performance** (v0.9.2): Batch processing for large context (10 blocks per batch, removes 100-block limit)
- **Metadata cleaning** (v0.9.2): Removes Kramdown IAL attributes for clean text output
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
2. **Input**: Popup shows preset buttons + instruction input (with dynamic placeholder and command history)
3. **Process**: Build prompt with template + context → Stream AI response → Apply filters
4. **Preview**: Render comparison block in document
5. **Action**: User accepts (replace blocks) or rejects (restore original)

### Command History (v0.10.0)

The instruction input popup supports terminal-style command history:

**Navigation**:
- **Up Arrow** (↑): Browse to previous (older) command
- **Down Arrow** (↓): Browse to next (newer) command
- **Down at newest**: Restores your original input before browsing
- **Start typing**: Exits browsing mode, returns to normal editing

**Features**:
- Automatically saves up to 30 recent commands (FIFO)
- Smart deduplication (skips consecutive identical entries)
- Persistent storage (survives SiYuan restart)
- Dual-layer: localStorage (fast) + file storage (reliable)

**Storage Location**:
`N:/Siyuan-Note/data/storage/siyuan-plugin-claude-assistant/instruction-history.json`

### Template Placeholders

Quick Edit templates support the following placeholders:

#### Context Placeholders
- `{above=N}` - Get N lines of text above the selection
- `{below=N}` - Get N lines of text below the selection
- `{above_blocks=N}` - Get N SiYuan blocks above the selection
- `{below_blocks=N}` - Get N SiYuan blocks below the selection

#### Custom Block Reference Placeholder (v0.9.3+)
- `{custom=((blockid 'name'))}` - Fetch content from a referenced SiYuan block

**Syntax**: `{custom=((20251028231736-h1436a9 '第二章'))}`
- `((blockid 'name'))` - SiYuan block reference format
- The plugin automatically fetches the referenced block's complete content
- Multiple `{custom=...}` placeholders can be used in the same template
- Can be combined with other placeholders

**Example 1: Reference Documentation**
```markdown
editInstruction: |
  参考以下API文档：

  {custom=((20251028231736-h1436a9 'API文档'))}

  基于上述文档，{instruction}

  原始代码：
  {original}
```

**Example 2: Combine Multiple References**
```markdown
editInstruction: |
  背景知识：
  {custom=((20251028231736-h1436a9 '第一章：基础'))}

  进阶内容：
  {custom=((20251029142530-x8k2p4m '第二章：实战'))}

  任务：{instruction}

  待处理内容：
  {original}
```

**Example 3: Mix with Context Placeholders**
```markdown
editInstruction: |
  上文参考：
  {above_blocks=2}

  参考文档：
  {custom=((20251028231736-h1436a9 '技术规范'))}

  任务：{instruction}
  原文：{original}

  下文参考：
  {below_blocks=1}
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

## Extensibility

### Adding New AI Providers (v0.12.0+)

**New in v0.12.0**: Simplified process with **metadata-first architecture**! Adding a provider follows a systematic 8-step process.

The plugin uses a **single source of truth** approach: all provider information (models, URLs, features) is defined in `Provider.getMetadata()`, and the UI/configuration is dynamically generated.

#### Complete Integration Guide (3 Steps Only!)

**Step 1: Create Provider Implementation** (`src/ai/providers/NewProvider.ts`)

```typescript
import { BaseAIProvider } from '../BaseAIProvider';
import type { AIModelConfig, AIRequestOptions, ParameterLimits } from '../types';
import type { Message } from '../../claude/types';

export class NewProvider extends BaseAIProvider {
    readonly providerType = 'newprovider';  // IMPORTANT: lowercase, matches type in AIProviderType
    readonly providerName = 'New Provider Display Name';

    private apiKey: string;
    private model: string;
    private temperature: number;
    private maxTokens: number;
    private baseURL: string;

    constructor(config: AIModelConfig) {
        super(config);  // CRITICAL: Must call super(config), not super()
        
        // IMPORTANT: Use config.modelId (not config.model)
        this.apiKey = config.apiKey;
        this.model = config.modelId || 'default-model-id';
        this.temperature = config.temperature ?? 0.7;
        this.maxTokens = config.maxTokens ?? 4096;
        this.baseURL = config.baseURL || 'https://api.example.com/v1';
    }

    async sendMessage(messages: Message[], options?: AIRequestOptions): Promise<string> {
        // Implementation
    }

    async streamMessage(messages: Message[], options?: AIRequestOptions): Promise<void> {
        // Stream implementation with options.onChunk callback
    }

    // CRITICAL: validateConfig must check config.modelId (not config.model)
    validateConfig(config: AIModelConfig): true | string {
        if (!config.apiKey) return 'API key is required';
        if (!config.modelId) return 'Model selection is required';
        
        const validModels = this.getAvailableModels();
        if (!validModels.includes(config.modelId)) {
            return `Invalid model. Available: ${validModels.join(', ')}`;
        }
        return true;
    }

    getAvailableModels(): string[] {
        return ['model-v1', 'model-v2', 'model-v3'];
    }

    // CRITICAL: These two methods are REQUIRED (abstract methods from BaseAIProvider)
    getMaxTokenLimit(model: string): number {
        const limits: Record<string, number> = {
            'model-v1': 4096,
            'model-v2': 8192,
            'model-v3': 16384,
        };
        return limits[model] || 4096;
    }

    getParameterLimits(): ParameterLimits {
        const modelId = this.model || 'model-v1';
        return {
            temperature: { min: 0, max: 2, default: 0.7 },
            maxTokens: { min: 1, max: this.getMaxTokenLimit(modelId), default: 4096 },
        };
    }
}
```

**Step 2: Export Provider** (`src/ai/providers/index.ts`)

```typescript
export { NewProvider } from './NewProvider';
```

**Step 3: Register in Factory** (`src/ai/AIProviderFactory.ts`)

```typescript
import { NewProvider } from './providers';  // Add to imports

// In initialize() method:
this.register({
    type: 'newprovider',  // Must match providerType
    factory: (config) => new NewProvider(config),
    displayName: 'New Provider Name',
    description: 'Brief description of the provider',
});
```

**Step 4: Add to Type Definitions** (`src/ai/types.ts`)

```typescript
export type AIProviderType =
    'anthropic' | 'openai' | 'gemini' | 'xai' | 'deepseek' | 'moonshot' |
    'newprovider' |  // Add your new provider here
    'custom';

// Note: AIProviderType is defined as `string` in code for runtime flexibility.
// Providers are registered dynamically in AIProviderFactory.initialize().
// This union type documents the available built-in providers.
```

**Step 5: Add to DEFAULT_SETTINGS** (`src/claude/index.ts`) ⚠️ **CRITICAL**

```typescript
export const DEFAULT_SETTINGS: Omit<MultiProviderSettings, "apiKey"> = {
    // ... other settings ...
    providers: {
        anthropic: { /* ... */ },
        openai: { /* ... */ },
        // ... other providers ...
        
        // CRITICAL: Add your new provider here!
        newprovider: {
            apiKey: '',
            baseURL: '',
            model: 'model-v1',  // Default model
            enabled: false,
        },
    },
};
```

**⚠️ WARNING**: If you forget Step 5, `settings.providers.newprovider` will be `undefined`, causing initialization failures!

**Step 6: Add UI Components** (`src/settings/SettingsPanelV3.ts`)

Add provider metadata (around line 253):
```typescript
const providerInfo: Record<AIProviderType, { name: string; icon: string; url: string; defaultBaseURL: string }> = {
    // ... existing providers ...
    newprovider: { 
        name: 'New Provider Display Name', 
        icon: '🆕',  // Choose an emoji
        url: 'https://provider.com/api-keys',
        defaultBaseURL: 'https://api.provider.com/v1'
    },
};
```

Add dropdown option (around line 307):
```typescript
<option value="newprovider" ${activeProvider === 'newprovider' ? 'selected' : ''}>
    ${providerInfo.newprovider.name}
</option>
```

Add model list (around line 462):
```typescript
newprovider: [
    { value: 'model-v1', label: '🌟 Model V1 (Recommended)' },
    { value: 'model-v2', label: 'Model V2 (Advanced)' },
    { value: 'model-v3', label: '⚡ Model V3 (Fast)' },
],
```

Update event listener metadata (around line 856):
```typescript
newprovider: { 
    name: 'New Provider', 
    icon: '🆕', 
    url: 'https://provider.com/api-keys',
    defaultBaseURL: 'https://api.provider.com/v1'
},
```

**Step 7: Add Display Name Mapping** (`src/claude/UniversalAIClient.ts`)

```typescript
getProviderDisplayName(): string {
    const names: Record<string, string> = {
        'anthropic': 'Claude',
        'openai': 'GPT',
        // ... other providers ...
        'newprovider': 'NewAI',  // Short display name
    };
    return names[provider] || provider || 'Unknown';
}
```

**Step 8: Add Badge Display** (`src/sidebar/UnifiedAIPanel.ts`)

Add model name patterns (around line 1806):
```typescript
// New Provider models
[/model-v1/, 'V1'],
[/model-v2/, 'V2'],
[/model-v3/, 'V3'],
```

Add badge color (around line 1856):
```typescript
'newprovider': { bg: 'rgba(255, 100, 50, 0.1)', border: 'rgba(255, 100, 50, 0.3)' }  // Choose colors
```

**Step 9: Update Documentation** (`CLAUDE.md`)

- Update provider list in "Current Providers" section
- Update version number
- Add provider-specific notes if needed

**Step 10: Testing Checklist**

- [ ] Build succeeds without errors (`npm run build`)
- [ ] Provider appears in settings dropdown
- [ ] Can save configuration with API key
- [ ] No "Provider not configured" error after saving
- [ ] Test connection succeeds with valid credentials
- [ ] Model selection dropdown shows correct models
- [ ] Badge displays with correct name and color
- [ ] Streaming works correctly
- [ ] Non-streaming works correctly
- [ ] Error messages are user-friendly

#### Common Pitfalls ⚠️

1. **Constructor must call `super(config)`** - NOT `super()`
2. **Use `config.modelId`** - NOT `config.model`
3. **Must implement `getMaxTokenLimit()` and `getParameterLimits()`** - Required abstract methods
4. **Must add to `DEFAULT_SETTINGS.providers`** - Otherwise config will be `undefined`
5. **Type name must be lowercase** - e.g., `'newprovider'` not `'NewProvider'`
6. **validateConfig must check `config.modelId`** - NOT `config.model`
7. **API key logging in constructors** - Remove debug logs that include API key prefixes
8. **Temperature validation** - Some providers have restricted ranges (e.g., Moonshot: [0,1], Anthropic: [0,1])

#### Example: Moonshot Provider Integration

See `src/ai/providers/MoonshotProvider.ts` for a complete real-world example following all best practices.

**Current Providers:**
- `anthropic` - Claude (Implemented ✅)
- `openai` - GPT (Implemented ✅)
- `gemini` - Google Gemini (Implemented ✅)
- `xai` - xAI Grok (Implemented ✅)
- `deepseek` - DeepSeek (Implemented ✅)
- `moonshot` - Moonshot AI Kimi (Implemented ✅ - v0.11.2)

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
- **DOM Caching** (v0.9.3): Use WeakMap to cache frequently accessed elements (InlineEditRenderer)
- **Progress Throttling** (v0.9.3): Update progress indicators every 100ms instead of per-chunk
- **Batch Operations** (v0.9.3): Use BlockOperations for bulk insert/delete (10+ blocks)
- **Adaptive Delays** (v0.9.3): Dynamic timeout calculation based on operation size
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
- **Deep Merge for Providers** (v0.11.3): Fixed configuration migration bug (Critical Fix)
  - **Problem**: Shallow merge (`{...DEFAULT_SETTINGS, ...parsed}`) overwrote entire `providers` object
  - **Impact**: New providers added to DEFAULT_SETTINGS were lost when loading saved configs
  - **Solution**: Deep merge `providers` object when loading settings
  - **Implementation**: All settings loading paths (localStorage, sessionStorage, file, window global) now use:
    ```typescript
    return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        providers: {
            ...DEFAULT_SETTINGS.providers,  // Ensure all default providers present
            ...parsed.providers,            // Override with user's saved configs
        },
    };
    ```
  - **Why Critical**: Without this fix, users with existing configs couldn't access newly added providers (e.g., Moonshot/Kimi)
  - **Locations Fixed**: 
    - `src/settings/SettingsManager.ts:loadFromFileAsync()` (line ~80)
    - `src/settings/SettingsManager.ts:loadSettings()` - window global (line ~113)
    - `src/settings/SettingsManager.ts:loadSettings()` - sessionStorage (line ~126)
    - `src/settings/SettingsManager.ts:loadSettings()` - localStorage (line ~138)

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
| **Reverse proxy 404 error** | **Provider-specific baseURL handling:**<br>• **Anthropic**: Use full baseURL with `/v1` (e.g., `https://proxy.com/api/v1`). Plugin auto-strips to prevent `/v1/v1/messages`.<br>• **OpenAI/Gemini/xAI/DeepSeek/Moonshot**: Use baseURL as provided by proxy service (no auto-stripping). |
| **Moonshot temperature warning** | **Plugin auto-clamps temperature to [0, 1] range (Moonshot limit). Values above 1.0 are automatically clamped with console warning. No action needed.** |
| **Moonshot reasoning content** | **K2 Thinking models return reasoning in collapsible `<details>` section. Expand to view model's thought process. Use non-Thinking models if reasoning not needed (faster, cheaper).** |
| **New provider not appearing** | **If a newly added provider (e.g., Moonshot) shows "AI provider is not configured" despite having API key set, this is the configuration migration bug. Fixed in v0.11.3. Solution: (1) Update to v0.11.3+, (2) Open Settings, (3) Re-save your API key for the new provider, (4) Restart SiYuan. The deep merge fix ensures new providers from DEFAULT_SETTINGS are preserved.** |
| **Multiple topbar icons (3+)** | **Run `npm run clean-deploy` - removes duplicates caused by improper cleanup** |
| **Settings panel blank/invisible** | **Run `npm run clean-cache` then restart SiYuan - clears cached HTML/CSS** |
| **CSS changes not applying** | **Run `npm run clean-cache` - forces fresh CSS load** |
| **UI glitches after update** | **Run `npm run clean-deploy` - complete fresh start** |

### Cache-Related Issues

**Symptoms of cache problems:**
- Multiple duplicate topbar icons (indicates plugin loaded multiple times)
- Settings panel shows navigation but no content
- CSS styling doesn't match code changes
- JavaScript behaving inconsistently

**Quick diagnosis:**
1. Open SiYuan DevTools (F12)
2. Check console for errors
3. Inspect element to see actual HTML structure
4. Compare with expected structure in source code

**Solutions (in order of escalation):**
1. **Simple restart**: Close SiYuan → Reopen (F5)
2. **Cache clear**: `npm run clean-cache` → Restart SiYuan
3. **Clean deploy**: `npm run clean-deploy` (closes SiYuan, full rebuild)
4. **Manual cleanup**: Delete `N:/Siyuan-Note/temp` + plugin folder manually

---

## Key Files Reference

### Core Logic
- `src/index.ts` - Plugin entry, lifecycle
- `src/quick-edit/QuickEditManager.ts` - Quick Edit orchestrator
- `src/quick-edit/SelectionHandler.ts` - Selection extraction (v0.9.0)
- `src/quick-edit/PromptBuilder.ts` - Prompt construction (v0.9.0)
- `src/quick-edit/BlockOperations.ts` - SiYuan API wrapper with batch operations (v0.9.0, optimized v0.9.3)
- `src/quick-edit/EditStateManager.ts` - State management (v0.9.0)
- `src/quick-edit/InstructionHistoryManager.ts` - Command history manager (v0.10.0)

### AI Provider Layer (v0.9.0)
- `src/ai/types.ts` - AIProvider interface definitions
- `src/ai/AnthropicProvider.ts` - Claude implementation
- `src/ai/providers/OpenAIProvider.ts` - OpenAI GPT implementation
- `src/ai/providers/GeminiProvider.ts` - Google Gemini implementation
- `src/ai/providers/XAIProvider.ts` - xAI Grok implementation
- `src/ai/providers/DeepSeekProvider.ts` - DeepSeek implementation
- `src/ai/providers/MoonshotProvider.ts` - Moonshot AI Kimi implementation (v0.10.1)
- `src/ai/AIProviderFactory.ts` - Provider registry and factory
- `src/ai/index.ts` - Module exports

### Filtering System
- `src/filter/ResponseFilter.ts` - Legacy regex-based filtering
- `src/filter/FilterPipeline.ts` - Middleware pipeline system (v0.9.0)
- `src/filter/middleware.ts` - Built-in middleware (v0.9.0)
- `src/filter/types.ts` - FilterRule, FilterResult

### UI Components
- `src/quick-edit/InstructionInputPopup.ts` - Preset selector + input with command history (v0.10.0)
- `src/quick-edit/InlineEditRenderer.ts` - Comparison block rendering with DOM caching (v0.9.3)
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
- `src/ai/types.ts` - AIProvider, AIModelConfig (v0.9.0)
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

For detailed architecture information:

- **[MODULAR_REFACTORING_GUIDE.md](MODULAR_REFACTORING_GUIDE.md)** - Module usage guide
  - Detailed API documentation for modular components (v0.9.0+)
  - Code examples and best practices
  - Testing examples
  - Migration checklist from legacy code

- **[REFACTORING.md](REFACTORING.md)** - Refactoring history (v0.9.0-v0.10.0)
  - Phase 1: Security fixes (SQL injection, async initialization)
  - Phase 2: AI Provider abstraction & Filter Pipeline
  - Phase 3: QuickEditManager modularization
  - Phase 4: Performance optimizations (batch operations)
  - Phase 5: Command history feature
  - Migration guide and backward compatibility notes

---

## Additional Resources

- **SiYuan API**: https://github.com/siyuan-note/siyuan/tree/master/kernel/api
- **Anthropic Docs**: https://docs.anthropic.com/
- **Plugin Sample**: https://github.com/siyuan-note/plugin-sample
- **Release Guide**: [RELEASE.md](RELEASE.md)
- **Moonshot AI Setup**: [MOONSHOT_API_SETUP.md](MOONSHOT_API_SETUP.md) - Complete guide for Kimi integration

---

## Known Limitations

- Hot reload not supported (must restart SiYuan after code changes)
- Context extraction limited to linear document structure
- No offline mode (requires active API connection)
- API keys stored unencrypted in localStorage
- QuickEditManager uses hybrid architecture (legacy monolithic + new modular components)
  - New modules available: SelectionHandler, BlockOperations, PromptBuilder, EditStateManager, InstructionHistoryManager
  - Core workflow still uses legacy code paths (backward compatible)
  - Full migration to pure modular architecture planned for future release
- Multi-provider support fully implemented (6 providers available)
  - Anthropic (Claude), OpenAI (GPT), Google Gemini, xAI (Grok), DeepSeek, Moonshot AI (Kimi) ✅
  - Reverse proxy configuration supported for all providers
  - **Important**: For Anthropic reverse proxies, baseURL should include `/v1` (e.g., `https://proxy.com/api/v1`)
    - The plugin automatically strips trailing `/v1` to prevent duplicate paths (`/v1/v1/messages`)
    - This normalization ensures correct API endpoint construction

---

**Last Updated**: 2025-01-17
**Version**: 0.13.0 (Feature: Thinking/Reasoning Mode for All Providers)
