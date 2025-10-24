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
}

onunload() {
    // Cleanup: remove listeners, clear timers, free resources
}

onLayoutReady() {
    // Execute after UI layout is ready
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
this.addDock({
    config: {
        position: "LeftBottom",
        size: { width: 200, height: 0 },
        icon: "iconEmoji",
        title: "My Panel",
    },
    data: { myData: "value" },
    type: "my-panel-type",
    init() {
        this.element.innerHTML = `
            <div class="my-panel">
                Panel content
            </div>
        `;
    },
    destroy() {
        // Cleanup
    }
});
```

#### Add Tab

```javascript
this.addTab({
    type: "my-tab-type",
    init() {
        this.element.innerHTML = "<div>Tab content</div>";
    },
    destroy() {
        // Cleanup
    }
});
```

### Commands

Register custom commands:

```javascript
this.addCommand({
    langKey: "myCommand",
    hotkey: "⌘⇧P",
    callback: () => {
        showMessage("Command executed!");
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

Subscribe to SiYuan events:

```javascript
// Editor loaded
this.eventBus.on("loaded-protyle", ({ detail }) => {
    console.log("Editor loaded:", detail);
});

// Block icon clicked
this.eventBus.on("click-blockicon", ({ detail }) => {
    const { blockElements, menu } = detail;
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
    console.log("Content clicked:", detail);
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

Access SiYuan's HTTP API:

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

Common API endpoints:
- `/api/block/*` - Block operations
- `/api/notebook/*` - Notebook operations  
- `/api/attr/*` - Attribute operations
- `/api/search/*` - Search operations
- `/api/query/sql` - SQL queries

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
