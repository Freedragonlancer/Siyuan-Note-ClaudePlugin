# SiYuan Plugin API 参考

本文档包含 SiYuan 插件开发的核心 API 参考。

## Plugin 类

### 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `eventBus` | `EventBus` | 事件总线对象，用于接收思源的事件 |
| `i18n` | `IObject` | 国际化对象，结构同 `i18n` 目录下的 json 文件 |
| `data` | `any` | 插件数据 |
| `name` | `string` | 插件名称 |
| `app` | `App` | 包含 plugins 和 appId 属性 |
| `commands` | `ICommandOption[]` | 命令列表 |
| `setting` | `Setting` | 设置对象 |

### 生命周期方法

#### `onload(): void`
插件初始化函数，思源在初始化时调用该方法。在此方法中初始化插件的 UI 元素、注册事件监听器等。

#### `onunload(): void`
插件卸载函数，当插件被禁用时调用。在此方法中清理资源、移除事件监听器等。

#### `onLayoutReady(): void`
布局准备完成时调用。

### UI 方法

#### `addTopBar(options): HTMLElement`
在顶栏添加图标按钮。

参数:
- `icon`: 图标 (Symbol 标识符或 SVG HTML)
- `title`: 悬浮提示文本
- `callback`: 点击回调函数 `(event: MouseEvent) => void`
- `position`: 位置 ("right" | "left")

返回: 添加的 HTML 元素

#### `addStatusBar(options): HTMLElement`
在状态栏添加元素。

参数:
- `element`: HTML 元素
- `position`: 位置 ("right" | "left")

返回: 添加的 HTML 元素

#### `addTab(options): () => IModel`
添加标签页。

参数:
- `type`: 标签页类型
- `init`: 初始化函数
- `destroy`: 销毁回调函数 (可选)
- `resize`: 调整大小回调函数 (可选)
- `update`: 更新回调函数 (可选)

#### `addDock(options): { config: IPluginDockTab, model: IModel }`
添加停靠面板。

参数:
- `config`: 停靠面板配置
- `data`: 数据
- `type`: 类型
- `init`: 初始化函数
- `destroy`: 销毁回调函数 (可选)
- `resize`: 调整大小回调函数 (可选)
- `update`: 更新回调函数 (可选)

#### `addCommand(options: ICommandOption): void`
添加命令。

### 数据存储方法

#### `loadData(storageName: string): Promise<any>`
加载存储的数据。

参数:
- `storageName`: 存储名称

返回: Promise 包含加载的数据

#### `saveData(storageName: string, content: any): Promise<void>`
保存数据到存储。

参数:
- `storageName`: 存储名称
- `content`: 要保存的内容

#### `removeData(storageName: string): Promise<any>`
删除存储的数据。

参数:
- `storageName`: 存储名称

### 其他方法

#### `openSetting(): void`
打开插件设置界面。

#### `addIcons(svg: string): void`
添加图标。

参数:
- `svg`: SVG 图标字符串

#### `addFloatLayer(options): void`
添加浮层。

参数:
- `ids`: 块 ID 数组
- `defIds`: 默认 ID 数组 (可选)
- `x`: X 坐标 (可选)
- `y`: Y 坐标 (可选)
- `targetElement`: 目标元素 (可选)

## EventBus 类

事件总线用于监听思源的各种事件。

### 方法

#### `on(eventName: string, callback: Function): void`
注册事件监听器。

常见事件:
- `loaded-protyle`: 编辑器加载完成
- `click-blockicon`: 点击块图标
- `click-editorcontent`: 点击编辑器内容
- `open-menu-*`: 打开各种菜单

## Dialog 类

对话框类，用于创建模态对话框。

### 构造函数
```typescript
new Dialog(options: {
    title?: string,
    content: string | HTMLElement,
    width?: string,
    height?: string,
    destroyCallback?: () => void
})
```

## Menu 类

菜单类，用于创建上下文菜单。

### 构造函数
```typescript
new Menu(id?: string)
```

### 方法

#### `addItem(options): void`
添加菜单项。

参数:
- `icon`: 图标
- `label`: 标签文本
- `click`: 点击回调函数
- `submenu`: 子菜单 (可选)

#### `addSeparator(): void`
添加分隔线。

#### `open(options): void`
打开菜单。

参数:
- `x`: X 坐标
- `y`: Y 坐标

## Setting 类

设置类，用于管理插件设置界面。

### 方法

#### `addItem(options): void`
添加设置项。

参数:
- `title`: 标题
- `description`: 描述
- `createActionElement`: 创建操作元素的函数

## 内核 API

SiYuan 内核 API 可通过 `/api/*` 端点访问。

### 常用端点

- `/api/block/*` - 块操作
- `/api/notebook/*` - 笔记本操作
- `/api/attr/*` - 属性操作
- `/api/search/*` - 搜索操作
- `/api/query/*` - 查询操作

使用 `fetch` 或 `XMLHttpRequest` 发送 POST 请求到这些端点。

## 插件结构

```
plugin-name/
├── plugin.json          # 插件清单文件
├── index.js            # 插件主文件
├── preview.png         # 插件预览图
├── icon.png            # 插件图标
├── README.md           # 说明文档
└── i18n/              # 国际化文件夹
    ├── zh_CN.json
    └── en_US.json
```

### plugin.json 结构

```json
{
  "name": "plugin-name",
  "author": "Author Name",
  "url": "https://github.com/username/plugin-name",
  "version": "1.0.0",
  "minAppVersion": "2.9.0",
  "backends": ["all"],
  "frontends": ["all"],
  "displayName": {
    "default": "Plugin Display Name",
    "zh_CN": "插件显示名称"
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

## 最佳实践

1. **资源清理**: 在 `onunload` 中清理所有资源
2. **错误处理**: 使用 try-catch 包装异步操作
3. **国际化**: 支持多语言
4. **数据持久化**: 使用 `loadData` 和 `saveData` 方法
5. **事件监听**: 使用 `eventBus.on` 监听事件
6. **样式隔离**: 使用插件特定的 CSS 类名前缀
