---
name: siyuan-plugin
description: Create, develop, and debug SiYuan Note plugins. Use when the user needs to build plugins for SiYuan Note (思源笔记), implement plugin features, work with SiYuan's plugin API, add UI elements (topbar, statusbar, docks, tabs), handle events, manage data storage, or create custom commands for SiYuan.
---

# SiYuan Note Plugin Development

Create TypeScript/JavaScript plugins for SiYuan Note. This skill provides comprehensive guidance for developing SiYuan plugins, including API usage, project structure, UI integration, event handling, and data management.

## When to Use This Skill

Use this skill when developing SiYuan Note plugins for:
- Adding custom UI elements (topbar buttons, status bar items, side panels, tabs)
- Implementing custom commands and shortcuts
- Handling SiYuan events and responding to user actions
- Storing and retrieving plugin data
- Creating dialogs and menus
- Integrating with SiYuan's core functionality
- Internationalization (i18n) support

## Project Structure

Create the following structure for a SiYuan plugin:

```
plugin-name/
├── plugin.json          # Plugin manifest (required)
├── index.js            # Main plugin file (required)
├── icon.png            # Plugin icon (required, 160x160px)
├── preview.png         # Preview image (required)
├── README.md           # Documentation (required)
├── README_zh_CN.md     # Chinese documentation (recommended)
└── i18n/              # Internationalization (optional)
    ├── zh_CN.json
    └── en_US.json
```

## Plugin Manifest (plugin.json)

Create `plugin.json` with the following structure:

```json
{
  "name": "plugin-name",
  "author": "Your Name",
  "url": "https://github.com/username/plugin-name",
  "version": "1.0.0",
  "minAppVersion": "2.9.0",
  "backends": ["all"],
  "frontends": ["all"],
  "displayName": {
    "default": "Plugin Name",
    "zh_CN": "插件名称"
  },
  "description": {
    "default": "Plugin description",
    "zh_CN": "插件描述"
  },
  "readme": {
    "default": "README.md",
    "zh_CN": "README_zh_CN.md"
  },
  "funding": {
    "custom": ["https://example.com/donate"]
  }
}
```

## Main Plugin File (index.js)

Create the main plugin class extending `Plugin`:

```javascript
import {
    Plugin,
    showMessage,
    Dialog,
    Menu,
} from "siyuan";

export default class MyPlugin extends Plugin {
    
    async onload() {
        // Initialize plugin
        console.log("Plugin loaded");
        
        // Add topbar button
        this.addTopBar({
            icon: "iconEmoji",
            title: "My Plugin",
            position: "right",
            callback: () => {
                showMessage("Hello from plugin!");
            }
        });
        
        // Register event listeners
        this.eventBus.on("loaded-protyle", this.onEditorLoaded.bind(this));
        
        // Load plugin data
        const data = await this.loadData("settings.json");
    }
    
    onunload() {
        // Cleanup resources
        console.log("Plugin unloaded");
    }
    
    onLayoutReady() {
        // Called when layout is ready
        console.log("Layout ready");
    }
    
    onEditorLoaded() {
        console.log("Editor loaded");
    }
}
```

## Core Plugin Methods

### Lifecycle Methods

Use lifecycle methods to manage plugin initialization and cleanup:

```javascript
onload() {
    // Initialize plugin: register UI, events, commands
    // Called when plugin is loaded
}

onunload() {
    // Cleanup: remove listeners, clear timers, free resources
    // Called when plugin is disabled
}

onLayoutReady() {
    // Execute after UI layout is ready
    // IMPORTANT: addDock, addTab must be called here, not in onload
}

uninstall() {
    // Called when plugin is completely uninstalled
    // Use for final cleanup
}
```

### UI Elements

#### Add Topbar Button

```javascript
const element = this.addTopBar({
    icon: '<svg>...</svg>',  // SVG or icon name
    title: "Button tooltip",
    position: "right",       // "left" or "right"
    callback: (event) => {
        // Handle click
    }
});
```

#### Add Status Bar Item

```javascript
const statusElement = document.createElement("span");
statusElement.textContent = "Status Text";

this.addStatusBar({
    element: statusElement,
    position: "right"
});
```

#### Add Dock Panel

```javascript
// IMPORTANT: Must be called in onLayoutReady(), not onload()
this.addDock({
    config: {
        position: "LeftBottom", // LeftTop, LeftBottom, RightTop, RightBottom, BottomLeft, BottomRight
        size: { width: 200, height: 0 },
        icon: "iconEmoji", // Icon symbol or SVG
        title: "My Panel",
        hotkey: "⌘⇧M", // Optional: keyboard shortcut
        show: true // Optional: show on startup
    },
    data: { myData: "value" }, // Custom data passed to dock
    type: "my-panel-type", // Unique identifier
    init(dock) {
        // `this` is the Custom/MobileCustom instance
        // `dock` is a reference to the dock object
        this.element.innerHTML = `
            <div class="my-panel">
                Panel content
            </div>
        `;
    },
    destroy() {
        // Cleanup when dock is closed
    },
    resize() {
        // Optional: handle resize
    },
    update() {
        // Optional: handle updates
    }
});
```

#### Add Tab

```javascript
// IMPORTANT: Must be called in onLayoutReady(), not onload()
this.addTab({
    type: "my-tab-type", // Unique identifier
    init() {
        // `this` is the Custom instance
        this.element.innerHTML = "<div>Tab content</div>";
    },
    beforeDestroy() {
        // Optional: called before destroy
    },
    destroy() {
        // Cleanup when tab is closed
    },
    resize() {
        // Optional: handle resize
    },
    update() {
        // Optional: handle updates
    }
});
```

### Commands

Register custom commands with multiple callback types:

```javascript
this.addCommand({
    langKey: "myCommand",
    langText: "My Command", // Optional: override i18n text
    hotkey: "⌘⇧P",
    customHotkey: "⌘⇧X", // Optional: custom hotkey

    // Different callbacks for different contexts:
    callback: () => {
        // Generic callback
        showMessage("Command executed!");
    },

    globalCallback: () => {
        // Executes even when focus is outside the app
    },

    fileTreeCallback: (file) => {
        // Executes when focus is on file tree
        console.log("File tree:", file);
    },

    editorCallback: (protyle) => {
        // Executes when focus is on editor
        console.log("Editor:", protyle);
    },

    dockCallback: (element) => {
        // Executes when focus is on dock
        console.log("Dock:", element);
    }
});
```

### Data Storage

Use data storage for persistence:

```javascript
// Save data
await this.saveData("filename.json", { key: "value" });

// Load data
const data = await this.loadData("filename.json");

// Remove data
await this.removeData("filename.json");
```

### Additional Plugin Methods

#### Get Opened Tabs

```javascript
const tabs = this.getOpenedTab();
// Returns object with custom tabs indexed by their ID
```

#### Add Float Layer

```javascript
this.addFloatLayer({
    refDefs: [{ refID: "blockId", defIDs: ["def1", "def2"] }],
    x: 100,
    y: 100,
    isBacklink: false
});
```

#### Update Protyle Toolbar

```javascript
// Customize the editor toolbar
const toolbar = this.updateProtyleToolbar([
    "emoji",
    "headings",
    "|",
    "bold",
    "italic",
    // ... custom items
]);
```

#### Protyle Slash Commands

```javascript
// Add custom slash commands in the editor
this.protyleSlash = [{
    filter: ["mycmd", "my command"],
    html: '<div>My Command</div>',
    id: "myCustomCommand",
    callback(protyle, nodeElement) {
        // Execute custom command
        console.log("Custom command executed!");
    }
}];
```

#### Protyle Options

```javascript
// Configure Protyle editor behavior
this.protyleOptions = {
    render: {
        background: false,
        gutter: true
    }
    // ... other options
};
```

### Dialogs

Create modal dialogs:

```javascript
const dialog = new Dialog({
    title: "Dialog Title",
    content: `<div class="dialog-content">
        Dialog content
    </div>`,
    width: "600px",
    destroyCallback: () => {
        console.log("Dialog closed");
    }
});
```

### Menus

Create context menus:

```javascript
const menu = new Menu("menu-id");

menu.addItem({
    icon: "iconEmoji",
    label: "Menu Item",
    click: () => {
        showMessage("Item clicked!");
    }
});

menu.addSeparator();

menu.open({
    x: event.clientX,
    y: event.clientY
});
```

## Event Handling

Subscribe to SiYuan events using EventBus:

### EventBus Methods

```javascript
// Register event listener
this.eventBus.on("event-name", ({ detail }) => {
    // Handle event
});

// Register one-time listener (auto-removes after first trigger)
this.eventBus.once("event-name", ({ detail }) => {
    // Handle event once
});

// Remove event listener
const handler = ({ detail }) => { /* ... */ };
this.eventBus.on("event-name", handler);
this.eventBus.off("event-name", handler);
```

### Common Events

```javascript
// Editor loaded (static)
this.eventBus.on("loaded-protyle-static", ({ detail }) => {
    console.log("Editor loaded:", detail.protyle);
});

// Editor loaded (dynamic)
this.eventBus.on("loaded-protyle-dynamic", ({ detail }) => {
    console.log("Dynamic load:", detail.protyle, detail.position);
});

// Block icon clicked
this.eventBus.on("click-blockicon", ({ detail }) => {
    const { blockElements, menu, protyle } = detail;
    menu.addItem({
        icon: "iconEmoji",
        label: "My Action",
        click: () => {
            // Handle action
        }
    });
});

// Editor content clicked
this.eventBus.on("click-editorcontent", ({ detail }) => {
    const { protyle, event } = detail;
    console.log("Content clicked:", event);
});

// Editor title icon clicked
this.eventBus.on("click-editortitleicon", ({ detail }) => {
    const { menu, protyle, data } = detail;
    // Add custom menu items
});

// Switch protyle (tab changed)
this.eventBus.on("switch-protyle", ({ detail }) => {
    console.log("Switched to:", detail.protyle);
});

// Paste event
this.eventBus.on("paste", ({ detail }) => {
    const { protyle, textHTML, textPlain, files } = detail;
    // Custom paste handling
    detail.resolve(); // Resolve to continue
});

// WebSocket events
this.eventBus.on("ws-main", ({ detail }) => {
    console.log("WebSocket data:", detail);
});

// Sync events
this.eventBus.on("sync-start", ({ detail }) => {
    console.log("Sync started");
});

this.eventBus.on("sync-end", ({ detail }) => {
    console.log("Sync completed");
});

this.eventBus.on("sync-fail", ({ detail }) => {
    console.log("Sync failed");
});

// Notebook events
this.eventBus.on("opened-notebook", ({ detail }) => {
    console.log("Notebook opened:", detail);
});

this.eventBus.on("closed-notebook", ({ detail }) => {
    console.log("Notebook closed:", detail);
});

// Menu events
this.eventBus.on("open-menu-content", ({ detail }) => {
    const { menu, range } = detail;
    // Add custom context menu items
});

this.eventBus.on("open-menu-link", ({ detail }) => {
    // Handle link menu
});

this.eventBus.on("open-menu-image", ({ detail }) => {
    // Handle image menu
});

this.eventBus.on("open-menu-doctree", ({ detail }) => {
    const { menu, elements, type } = detail;
    // Handle document tree menu
});
```

## Internationalization (i18n)

Create i18n files in the `i18n/` directory:

**i18n/en_US.json:**
```json
{
    "pluginName": "My Plugin",
    "myCommand": "My Command",
    "settingTitle": "Setting Title"
}
```

**i18n/zh_CN.json:**
```json
{
    "pluginName": "我的插件",
    "myCommand": "我的命令",
    "settingTitle": "设置标题"
}
```

Access translations in code:

```javascript
const text = this.i18n.pluginName;
```

## SiYuan Kernel API

Access SiYuan's HTTP API using built-in fetch helpers or standard fetch:

### Using Built-in Fetch Helpers

```javascript
import { fetchPost, fetchSyncPost, fetchGet } from "siyuan";

// Async POST with callback
fetchPost("/api/block/getBlockInfo", { id: blockId }, (response) => {
    console.log("Block info:", response.data);
});

// Sync POST (returns Promise)
const response = await fetchSyncPost("/api/query/sql", {
    stmt: "SELECT * FROM blocks WHERE type='d' LIMIT 10"
});
console.log("Results:", response.data);

// GET request
fetchGet("/api/system/getConf", (response) => {
    console.log("Config:", response.data);
});
```

### Using Standard Fetch

```javascript
// Fetch block by ID
const response = await fetch("/api/block/getBlockInfo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: blockId })
});
const data = await response.json();

// SQL query
const queryResponse = await fetch("/api/query/sql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        stmt: "SELECT * FROM blocks WHERE type='d' LIMIT 10"
    })
});
```

### Common API Endpoints

- `/api/block/*` - Block operations (getBlockInfo, getBlockKramdown, updateBlock, etc.)
- `/api/notebook/*` - Notebook operations (openNotebook, closeNotebook, etc.)
- `/api/attr/*` - Attribute operations (setBlockAttrs, getBlockAttrs, etc.)
- `/api/search/*` - Search operations (fullTextSearchBlock, etc.)
- `/api/query/sql` - SQL queries
- `/api/file/*` - File operations
- `/api/system/*` - System operations

Refer to: https://github.com/siyuan-note/siyuan/tree/master/kernel/api

## Global Utility Functions

SiYuan provides global utility functions that can be imported:

### Message Functions

```javascript
import { showMessage, hideMessage, confirm } from "siyuan";

// Show message
showMessage("Success!", 6000, "info"); // timeout in ms, type: info/error
showMessage("Error occurred", -1, "error"); // -1: always show
showMessage("Manual close", 0); // 0: manual close

// Hide message
hideMessage(); // Hide all messages
hideMessage("message-id"); // Hide specific message

// Confirm dialog
confirm("Title", "Are you sure?", () => {
    // Confirmed
}, () => {
    // Cancelled
});
```

### Tab and Editor Functions

```javascript
import { openTab, getActiveTab, getActiveEditor } from "siyuan";

// Open tab
await openTab({
    app: this.app,
    doc: {
        id: "blockId",
        action: ["cb-get-focus"], // Actions to perform
        zoomIn: false
    },
    position: "right", // "right" or "bottom"
    keepCursor: false,
    removeCurrentTab: false
});

// Open custom tab
await openTab({
    app: this.app,
    custom: {
        id: this.name + "my-tab",
        icon: "iconEmoji",
        title: "My Tab",
        data: { customData: "value" }
    }
});

// Get active tab
const activeTab = getActiveTab();

// Get active editor
const activeEditor = getActiveEditor();
```

### Platform Detection

```javascript
import { getFrontend, getBackend } from "siyuan";

// Get frontend type
const frontend = getFrontend();
// Returns: "desktop" | "desktop-window" | "mobile" | "browser-desktop" | "browser-mobile"

// Get backend type
const backend = getBackend();
// Returns: "windows" | "linux" | "darwin" | "docker" | "android" | "ios" | "harmony"

// Example usage
if (getFrontend() === "mobile") {
    // Mobile-specific code
}
```

### Other Utility Functions

```javascript
import {
    adaptHotkey,
    openWindow,
    lockScreen,
    exitSiYuan,
    getAllEditor,
    getAllModels,
    openSetting,
    saveLayout
} from "siyuan";

// Adapt hotkey to platform
const hotkey = adaptHotkey("⌘⇧P"); // Converts to platform-specific

// Open new window
openWindow({
    position: { x: 100, y: 100 },
    width: 800,
    height: 600,
    doc: { id: "blockId" }
});

// Lock screen
lockScreen(this.app);

// Exit SiYuan
exitSiYuan();

// Get all editors
const editors = getAllEditor(); // Returns Protyle[]

// Get all models
const models = getAllModels();
// Returns: { editor: [], graph: [], asset: [], outline: [], backlink: [],
//            search: [], inbox: [], files: [], bookmark: [], tag: [], custom: [] }

// Open settings dialog
openSetting(this.app);

// Save layout
saveLayout(() => {
    console.log("Layout saved");
});
```

## Development Workflow

1. **Initialize Project**
   ```bash
   mkdir my-plugin
   cd my-plugin
   npm init
   ```

2. **Install Dependencies**
   ```bash
   npm install siyuan --save
   npm install esbuild --save-dev
   ```

3. **Create Files**
   - Create `plugin.json`, `index.js`, `README.md`
   - Add icons: `icon.png` (160x160), `preview.png`

4. **Build Plugin**
   ```bash
   esbuild index.js --bundle --outfile=dist/index.js --format=cjs --platform=node
   ```

5. **Test Plugin**
   - Copy plugin folder to SiYuan's `data/plugins/` directory
   - Restart SiYuan or reload plugins
   - Check console for errors

6. **Debug**
   - Use `console.log()` for debugging
   - Check SiYuan's developer console (Help > Developer Tools)
   - Monitor plugin loading and errors

## Resources

- **API Reference** (`references/plugin_api.md`): Comprehensive API documentation
- **Official Docs**: https://docs.siyuan-note.club/
- **Plugin Examples**: Browse existing plugins in SiYuan marketplace

## Best Practices

1. **Resource Cleanup**: Always clean up in `onunload()` - remove event listeners, clear timers, free resources
2. **Error Handling**: Wrap async operations in try-catch blocks
3. **Performance**: Minimize DOM manipulations, use event delegation
4. **Namespace**: Prefix CSS classes and IDs with plugin name to avoid conflicts
5. **Data Validation**: Validate data before saving/loading
6. **User Feedback**: Use `showMessage()` to provide feedback
7. **Compatibility**: Specify minimum SiYuan version in `plugin.json`
8. **Documentation**: Write clear README with usage examples
9. **Internationalization**: Support multiple languages
10. **Version Control**: Use semantic versioning

## Common Patterns

### Settings Panel

```javascript
// Add settings tab
this.setting = new Setting();
this.setting.addItem({
    title: "Setting Name",
    description: "Setting description",
    createActionElement: () => {
        const input = document.createElement("input");
        input.type = "text";
        input.value = this.data.settingValue || "";
        input.addEventListener("change", async () => {
            this.data.settingValue = input.value;
            await this.saveData("settings.json", this.data);
        });
        return input;
    }
});
```

### Custom Icons

```javascript
// Add custom SVG icons
this.addIcons(`
    <symbol id="iconMyIcon" viewBox="0 0 32 32">
        <path d="M16 2 L30 16 L16 30 L2 16 Z"/>
    </symbol>
`);
```

### Async Data Loading

```javascript
async loadSettings() {
    try {
        const data = await this.loadData("settings.json");
        return data || { /* defaults */ };
    } catch (error) {
        console.error("Failed to load settings:", error);
        return { /* defaults */ };
    }
}
```

## Troubleshooting

**Plugin not loading:**
- Check `plugin.json` syntax
- Verify minimum SiYuan version
- Check console for errors

**Events not firing:**
- Ensure event listeners are registered in `onload()`
- Use correct event names
- Check event detail structure

**Data not persisting:**
- Verify file paths in `saveData()`/`loadData()`
- Check data serialization (must be JSON-compatible)
- Ensure async operations complete

**UI not updating:**
- Check DOM element references
- Verify CSS selectors
- Use browser DevTools to inspect elements
