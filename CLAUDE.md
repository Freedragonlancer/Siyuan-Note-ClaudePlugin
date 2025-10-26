# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Using the SiYuan Plugin Skill

**Important**: This project has a dedicated `siyuan-plugin` skill that provides comprehensive guidance for general SiYuan plugin development. Use it when you need help with:

- Plugin lifecycle methods (`onload`, `onLayoutReady`, `onunload`)
- UI elements (`addDock`, `addTopBar`, `addStatusBar`, `addTab`)
- Event handling (`eventBus`, SiYuan events)
- Data storage (`saveData`, `loadData`)
- Dialogs and menus
- Internationalization (i18n)
- SiYuan Kernel API
- General best practices

**This CLAUDE.md focuses on**:
- Claude AI integration specifics
- Dual-dock architecture (Chat + Edit)
- AI text editing system
- Anthropic SDK usage
- Project-specific workflows

To use the skill in Claude Code, simply ask about SiYuan plugin topics and Claude will automatically use the skill, or you can explicitly mention "using the siyuan-plugin skill".

## Project Overview

This is a SiYuan Note plugin that integrates Claude AI into the note-taking workflow. Users can select text, chat with Claude via a sidebar panel, and insert/replace text with AI-generated responses. The plugin uses the Anthropic SDK for streaming API responses and is built with TypeScript, Svelte, and Vite.

## Build & Development Commands

### Setup
```bash
# Install dependencies (use pnpm, not npm)
pnpm install
```

### Development
```bash
# Build and watch for changes
pnpm dev

# Create development symlink to SiYuan plugins directory
# Must build first, then run:
node scripts/make_dev_link.cjs --dir=/path/to/siyuan/workspace/data/plugins
# Note: The script file is .cjs (CommonJS), not .js

# On Windows:
pnpm make-link-win --dir=C:/SiYuan/data/plugins
```

### Production Build
```bash
pnpm build
```

Build output goes to `dist/` directory containing:
- `index.js` - Main plugin bundle (CommonJS format)
- `index.css` - Compiled styles (auto-renamed from style.css)
- `plugin.json` - Plugin metadata
- `README.md`, `README_zh_CN.md` - Documentation
- `icon.png` - Plugin icon (160x160, required for plugin to load)
- `preview.png` - Preview screenshot
- `i18n/*.json` files - Translations (must be copied manually or added to vite config)

### Testing & Deployment

**IMPORTANT**: After every build, copy the built files to the SiYuan plugin directory for testing:

```bash
# Windows - Copy to plugin directory
cp "N:\AI_Code\Siyuan-note-plugin\dist\index.js" "N:\Siyuan-Note\data\plugins\siyuan-plugin-claude-assistant\index.js"
cp "N:\AI_Code\Siyuan-note-plugin\dist\index.css" "N:\Siyuan-Note\data\plugins\siyuan-plugin-claude-assistant\index.css"

# Or use the combined command:
cp -v "N:\AI_Code\Siyuan-note-plugin\dist\index.js" "N:\Siyuan-Note\data\plugins\siyuan-plugin-claude-assistant\index.js" && cp -v "N:\AI_Code\Siyuan-note-plugin\dist\index.css" "N:\Siyuan-Note\data\plugins\siyuan-plugin-claude-assistant\index.css"
```

**Testing Workflow**:
1. Make code changes
2. Run `npm run build` (or `pnpm build`)
3. Copy `dist/index.js` and `dist/index.css` to plugin directory (see commands above)
4. **Restart SiYuan Note** to load the updated plugin
5. Test the changes and check console logs (F12)
6. Repeat as needed

**Plugin Directory Locations**:
- Development: `N:\AI_Code\Siyuan-note-plugin\dist\`
- SiYuan Plugin: `N:\Siyuan-Note\data\plugins\siyuan-plugin-claude-assistant\`

## Architecture

### Dual-Dock Design
The plugin uses a two-dock architecture to separate concerns:
- **Chat Dock** (`claude-dock`): Traditional chat interface for conversational AI
  - Ask questions, get explanations, brainstorm ideas
  - Insert/Replace actions for copying results to editor
  - Full conversation history maintained
- **Edit Dock** (`claude-edit-dock`): Specialized interface for inline text editing
  - Queue-based processing of text selections
  - Visual diff review before applying changes
  - Undo/redo history for safe experimentation

This separation allows users to:
- Have both panels open simultaneously
- Use chat for general queries while edits are processing
- Keep edit history separate from chat history
- Different UI paradigms (conversational vs task-oriented)

### Plugin Lifecycle
The main plugin class `ClaudeAssistantPlugin` (in `src/index.ts`) implements:
- **onload**: Initialize SettingsManager, ClaudeClient, EditHistory, and register commands
- **onLayoutReady**: Register dual-dock panels (chat + edit) and topbar icon
- **onunload**: Cleanup ChatPanel, EditPanel, and remove event listeners

### Core Components

#### 1. ClaudeClient (`src/claude/`)
Manages communication with Anthropic's Claude API.
- **ClaudeClient.ts**: Main API client with streaming support
  - `sendMessage()`: Streaming API calls with callbacks (onMessage, onError, onComplete)
  - `sendMessageSimple()`: Non-streaming API calls returning complete response
  - `updateSettings()`: Re-initialize client when API key or baseURL changes
- **types.ts**: TypeScript interfaces (ClaudeSettings, Message, callbacks, EditSettings)
- **index.ts**: Exports and DEFAULT_SETTINGS

**Important**: Uses `dangerouslyAllowBrowser: true` since this runs in SiYuan's Electron environment. Supports custom `baseURL` for reverse proxy configurations.

#### 2. ChatPanel (`src/sidebar/`)
The main UI component displayed in SiYuan's right sidebar dock.
- Manages conversation state (messages array)
- Handles streaming responses and displays them in real-time with markdown rendering
- Provides "Insert" and "Replace" buttons to interact with SiYuan editor
- References the current Protyle (SiYuan's editor instance) for text operations
- Built with vanilla TypeScript/DOM manipulation (not Svelte components)
- Includes message actions (copy, regenerate) and typing animations

#### 3. EditPanel (`src/sidebar/EditPanel.ts`)
NEW FEATURE: AI-powered text editing panel for inline text modifications.
- Displays queued text selections for AI editing
- Shows real-time diff preview of changes using diff-match-patch library
- Provides Apply/Reject/Regenerate buttons for each edit
- Manages EditQueue and coordinates with AIEditProcessor
- Accessed via right-click context menu "Send to AI Edit" or keyboard shortcut `Ctrl+Shift+E`

#### 4. AI Text Editing System (`src/editor/`)
Complete system for AI-powered inline text editing with visual diff review:

**Core Components**:
- **TextSelectionManager**: Tracks text selections awaiting AI processing
  - Stores block ID, line numbers, selected text, and context
  - Manages selection lifecycle (pending → processing → completed/error)
- **AIEditProcessor**: Processes selections through Claude API
  - Builds prompts with context before/after selection
  - Handles streaming responses and generates diffs
  - Supports concurrent request management with cancellation
- **EditQueue**: Queue system for managing multiple edit requests
  - Auto-processing mode (default: 1 concurrent edit)
  - Pause/resume functionality
  - FIFO ordering
- **DiffRenderer**: Visual diff display using diff-match-patch
  - Renders side-by-side or inline diffs with syntax highlighting
  - Color-coded additions (green), deletions (red), unchanged (gray)
  - Line-by-line comparison view
- **EditHistory**: Undo/redo support for AI edits
  - Stores original text and block IDs
  - `Ctrl+Shift+Z` to undo last edit
  - History persists during plugin session

**Workflow**:
1. User selects text and chooses "Send to AI Edit" (right-click or hotkey)
2. TextSelectionManager creates selection with context extraction
3. EditQueue enqueues selection
4. AIEditProcessor sends to Claude with custom instruction
5. DiffRenderer displays changes in EditPanel
6. User reviews and clicks Apply (updates editor) or Reject (discards)
7. EditHistory stores change for potential undo

**Settings** (in `EditSettings` interface):
- `contextLinesBefore`/`contextLinesAfter`: Lines of context for AI (default: 5/3)
- `defaultInstruction`: Default prompt template
- `maxConcurrentEdits`: Concurrent API requests (default: 1)
- `autoProcessQueue`: Auto-process vs manual (default: true)
- `autoShowDiff`: Auto-show diff view (default: true)
- `maxTextLength`: Max characters per edit (default: 5000)
- `customInstructions`: Preset instruction templates (12 presets in Chinese)

#### 5. SettingsManager & SettingsPanel (`src/settings/`)
- **SettingsManager**: Reads/writes settings to browser localStorage (key: `claude-assistant-settings`)
- **SettingsPanelV2**: Modern grouped settings UI (current version)
  - Organized sections: Connection Settings, Model Settings, System Prompt, Edit Settings
  - API provider toggle (Anthropic official vs custom reverse proxy)
  - Test connection button with real-time validation
  - Password visibility toggle for API key
  - Sliders for maxTokens and temperature with live values
  - Template dropdown for system prompts (5 templates: Assistant, Coder, Writer, Translator, Custom)
- **SettingsPanel**: Legacy flat settings UI (deprecated but still in codebase)
- Settings are validated on save (e.g., API keys must start with `sk-ant-`)

#### 6. EditorHelper (`src/editor/`)
Helper utilities for interacting with SiYuan's Protyle editor:
- Get selected text from editor with context extraction
- Insert text at cursor position
- Replace selected text with new content
- Block-level operations (get block content, update block)

### Data Flow

**Chat Workflow**:
1. User types message in ChatPanel → calls ClaudeClient.sendMessage()
2. ClaudeClient streams chunks → ChatPanel updates UI via onMessage callback with markdown rendering
3. User clicks "Insert"/"Replace" → EditorHelper manipulates Protyle editor
4. Settings changes → SettingsManager.saveSettings() → ClaudeClient.updateSettings()

**AI Edit Workflow**:
1. User selects text → right-click "Send to AI Edit" or `Ctrl+Shift+E`
2. TextSelectionManager.addSelection() creates selection with context
3. EditQueue.enqueue() adds to processing queue
4. AIEditProcessor.processSelection() sends to Claude API
5. DiffRenderer displays changes in EditPanel with visual diff
6. User clicks Apply → EditorHelper updates block → EditHistory.push()
7. User can undo with `Ctrl+Shift+Z` → EditHistory.undo() restores original

### SiYuan Integration Points
**Dual Docks**:
- **Chat Dock** (`"claude-dock"`): Right sidebar, position `"RightBottom"`
- **Edit Dock** (`"claude-edit-dock"`): Separate panel for AI text editing with diff review

**Commands**:
- `Alt+Shift+C`: Open Claude chat panel
- `Ctrl+Shift+E`: Send selection to AI Edit
- `Ctrl+Shift+Z`: Undo last AI edit

**Context Menu**: "Send to AI Edit" appears when text is selected

**Protyle Integration**: Editor instance passed to ChatPanel and EditorHelper for text operations

## Important Implementation Notes

### Dock Initialization Timing
**Critical**: The `init()` function in `addDock()` is NOT called immediately when `addDock()` is executed. Understanding this timing is essential:

1. **When `addDock()` is called** (in `onLayoutReady()`):
   - SiYuan registers the dock type and icon
   - The `init()` function is stored but NOT executed
   - The dock panel does not exist yet

2. **When `init()` is called** (lazy initialization):
   - User clicks the dock icon, or
   - User triggers the keyboard shortcut, or
   - Code calls `toggleModel(dockType)`
   - This is when ChatPanel/EditPanel instances are created

3. **Why this matters**:
   - Cannot access panel elements in `onLayoutReady()`
   - Must store references to panels as class properties
   - Use regular `function` (not arrow function) for `init()` to preserve `this` context
   - Panel state persists between open/close (not recreated each time)

Example from `src/index.ts`:
```typescript
// onLayoutReady - registers dock but doesn't create panel yet
this.dockModel = this.addDock({
    type: "claude-dock",
    init() {
        // This runs LATER when user opens the dock
        this.chatPanel = new ChatPanel(...);
    }
});
```

### Context Menu Implementation
Custom right-click menu "Send to AI Edit" implemented in `setupContextMenu()` - only appears when text is selected, triggers AI edit workflow.

## Key Technical Details

### Build Configuration (vite.config.ts)
- Entry: `src/index.ts`
- Output: CommonJS format (required by SiYuan)
- Externals: `siyuan` and `process` (provided by SiYuan runtime)
- Alias: `@` → `src/`
- Asset handling: Renames `style.css` to `index.css`

### TypeScript Configuration
- Target: ES2020, strict mode enabled
- Path alias: `@/*` → `src/*`
- Extends `@tsconfig/svelte`

### API Key Storage
API keys are stored in browser localStorage (not secure). Users should:
- Use dedicated API keys for this plugin
- Set usage limits in Anthropic Console
- Never commit `.env` or config files with keys

## Plugin Installation & Testing

See `siyuan-plugin` skill for general installation instructions. This project provides:

**Development Link Script**:
```bash
# Build first
pnpm build

# Create symlink (Windows)
pnpm make-link-win --dir=C:/SiYuan/data/plugins

# Or use the script directly
node scripts/make_dev_link.cjs --dir=/path/to/SiYuan/data/plugins
```

**Verify Installation**:
- Look for robot icon in topbar
- Press `Alt+Shift+C` to open Claude chat panel
- Press `Ctrl+Shift+E` with text selected to test AI edit

### Troubleshooting

**API Connection Issues:**
- Verify API key is configured in Settings panel
- Test connection using "Test Connection" button
- Check console (F12) for API errors

**AI Edit feature not working:**
- Verify `diff-match-patch` library is installed (check package.json dependencies)
- Check that EditPanel dock is registered (look for "claude-edit-dock" in console logs)
- Ensure text is selected before triggering edit (right-click menu should show "Send to AI Edit")
- Check browser console for errors in AIEditProcessor or EditQueue
- Verify EditSettings are initialized (check localStorage for settings)

**Diff not displaying correctly:**
- Check that DiffRenderer is using diff-match-patch correctly
- Verify CSS styles for diff highlighting are loaded (index.css)
- Look for JavaScript errors when rendering diff
- Try with shorter text selections first (< 1000 chars)

**Undo not working:**
- Verify EditHistory is initialized in plugin onload
- Check that edits are being pushed to history (console.log in EditHistory.push)
- Ensure you're using the correct hotkey (`Ctrl+Shift+Z`, not just `Ctrl+Z`)
- EditHistory only persists during plugin session (cleared on reload)

## Development Workflow

**General Plugin Development**: Use the `siyuan-plugin` skill for standard workflows (build, install, debug).

**This Project**:
1. Make changes in `src/`
2. Run `pnpm build`
3. Restart SiYuan
4. Check console (F12) for errors

**Project-Specific Testing:**
- Test API connection: Settings → Test Connection
- Verify streaming: Chat panel should show real-time responses
- Test markdown rendering: Code blocks, tables, lists in chat
- Test Insert/Replace buttons in chat panel

### Testing AI Edit Feature
1. **Basic Edit Flow**:
   - Select text in editor
   - Right-click → "Send to AI Edit" or press `Ctrl+Shift+E`
   - Verify EditPanel opens and shows selection
   - Wait for AI processing (check for loading indicator)
   - Review diff display (green additions, red deletions)
   - Click Apply and verify text updates in editor

2. **Queue Testing**:
   - Create multiple selections rapidly
   - Verify they queue properly (visible in EditPanel)
   - Check that only `maxConcurrentEdits` (default: 1) process at a time
   - Verify FIFO ordering

3. **Undo Testing**:
   - Apply an edit
   - Press `Ctrl+Shift+Z`
   - Verify original text is restored
   - Check EditHistory maintains correct state

4. **Error Handling**:
   - Test with invalid API key (should show error in EditPanel)
   - Test with text > `maxTextLength` (should reject or truncate)
   - Test network errors (disconnect during processing)
   - Verify error messages are user-friendly

## Key Dependencies

The plugin uses several key libraries:
- **@anthropic-ai/sdk**: Official Anthropic SDK for Claude API
- **marked**: Markdown parser for rendering AI responses
- **highlight.js**: Code syntax highlighting (GitHub Dark theme)
- **dompurify**: XSS protection for rendered HTML
- **diff-match-patch**: Text diff/patch library for AI edit feature
  - Used by DiffRenderer to compute and display changes
  - Generates character-level and line-level diffs
  - Supports patch application and reversal

## Common Patterns

### Adding a New Setting
1. Update `ClaudeSettings` or `EditSettings` interface in `src/claude/types.ts`
2. Update `DEFAULT_SETTINGS` in `src/claude/index.ts`
3. Add UI field in `SettingsPanelV2.ts` (use existing grouped sections)
4. Handle in `ClaudeClient.ts` or `AIEditProcessor.ts` as needed

### Modifying Chat UI
Edit `ChatPanel.ts` which builds DOM elements manually. Look for:
- `createMessageElement()` for message rendering
- Event listeners for buttons (Send, Insert, Replace, etc.)
- `appendAssistantMessage()` for streaming response handling

### Changing Editor Interactions
Key methods in `EditorHelper.ts`:
- `getSelectedText()` - Reads selection with context extraction
- `insertAtCursor()` / `replaceSelection()` - Insert/replace text
- `getBlockContent()` / `updateBlockContent()` - Block-level operations for AI edits

### Adding AI Edit Features
To extend the AI text editing system:

**Add Custom Instruction Templates**:
1. Edit `PRESET_INSTRUCTIONS` array in `src/editor/types.ts`
2. Instructions appear in EditPanel dropdown
3. Can be localized in `i18n/*.json` files

**Modify Edit Processing**:
1. Update `buildPrompt()` in `AIEditProcessor.ts` to change how context is sent to Claude
2. Adjust `parseAIResponse()` to handle different response formats
3. Modify `processSelection()` to add pre/post-processing steps

**Customize Diff Rendering**:
1. Edit `DiffRenderer.ts` to change visual appearance
2. Modify `renderDiff()` for different diff layouts (side-by-side, inline, unified)
3. Update `highlightDifferences()` for custom syntax highlighting

**Adjust Queue Behavior**:
1. Modify `EditQueue.ts` to change processing order (FIFO, LIFO, priority-based)
2. Update `maxConcurrentEdits` in EditSettings for parallel processing
3. Add custom queue filters or prioritization logic