# SiYuan 插件 API 参考文档

> 本文档整理了 SiYuan 笔记插件开发中的关键 API 信息，方便快速查阅。

## 目录
- [插件生命周期](#插件生命周期)
- [addDock API](#adddock-api)
- [Custom 类型](#custom-类型)
- [常见问题](#常见问题)

---

## 插件生命周期

### onload()
```typescript
onload(): void
```

**用途**：插件的入口函数，在插件加载时调用。

**适用场景**：
- ✅ 初始化设置和配置
- ✅ 创建客户端实例
- ✅ 注册命令 (addCommand)
- ✅ 订阅事件总线
- ✅ 加载数据

**不适用场景**：
- ❌ 添加 UI 元素（应使用 onLayoutReady）

### onLayoutReady()
```typescript
onLayoutReady(): void
```

**用途**：在布局加载完成后自动调用。

**适用场景**：
- ✅ 添加 Dock 面板 (addDock)
- ✅ 添加顶部栏图标 (addTopBar)
- ✅ 添加状态栏 (addStatusBar)
- ✅ 其他需要布局就绪的 UI 操作

**重要提示**：
> SiYuan 在更新中将 `addTopBar` 和 `addStatusBar` 从 `onload` 生命周期调整到 `onLayoutReady`。
> 建议所有 UI 相关的初始化都在此方法中进行，以确保布局已经准备好。

### onunload()
```typescript
onunload(): void
```

**用途**：插件卸载时调用，用于清理资源。

---

## addDock API

### 方法签名
```typescript
addDock(options: {
    config: IPluginDockTab,
    data: any,
    type: string,
    destroy?: (this: Custom | MobileCustom) => void,
    resize?: (this: Custom | MobileCustom) => void,
    update?: (this: Custom | MobileCustom) => void,
    init: (this: Custom | MobileCustom, dock: Custom | MobileCustom) => void,
}): { config: IPluginDockTab, model: Custom | MobileCustom };
```

### 参数说明

#### config: IPluginDockTab
Dock 面板的配置选项：

```typescript
interface IPluginDockTab {
    position: TPluginDockPosition,  // Dock 位置
    size: { width: number, height: number },  // 大小
    icon: string,  // 图标 (支持 svg id 或 svg 标签)
    hotkey?: string,  // 快捷键（可选）
    title: string,  // 标题
    index?: number,  // 索引（可选）
    show?: boolean  // 是否显示（可选）
}

type TPluginDockPosition =
    | "LeftTop"
    | "LeftBottom"
    | "RightTop"
    | "RightBottom"
    | "BottomLeft"
    | "BottomRight"
```

#### data: any
传递给 init 函数的自定义数据。可以在 init 函数中通过 `this.data` 访问。

#### type: string
Dock 的类型标识符。

**格式建议**：
- 使用简单的自定义类型名，如：`"my-dock"`
- 官方示例使用：`"::dock"` 或 `"dock_tab"`
- 避免使用复杂的组合名称

#### init(this, dock)
初始化函数，在 dock 创建时调用。

**重要提示**：
- ⚠️ **必须使用普通函数，不能使用箭头函数**，因为需要正确的 `this` 绑定
- `this` 指向 Custom 实例
- `this.element` 是 dock 的 DOM 元素
- `this.data` 是传入的自定义数据

### 完整示例

```typescript
// 官方示例（来自 sy-bookmark-plus 插件）
this.addDock({
    config: {
        position: 'RightBottom',
        size: { width: 200, height: 200 },
        icon: 'iconBookmark',
        title: 'Bookmark+'
    },
    data: {
        plugin: this,
        initBookmark: initBookmark,
    },
    type: '::dock',
    init() {
        // ✅ 使用普通函数
        // this.element - Dock 的 DOM 元素
        // this.data - 上面传入的 data 对象
        this.data.initBookmark(this.element, this.data.plugin);
    }
});
```

### Claude Assistant 插件示例

```typescript
onLayoutReady() {
    const dockResult = this.addDock({
        config: {
            position: "RightBottom",
            size: { width: 400, height: 600 },
            icon: "iconRobot",
            title: "Claude AI",
        },
        data: {
            plugin: this,
        },
        type: "claude-dock",  // 简单的自定义类型名
        init() {
            console.log("Dock init called");

            const plugin = this.data.plugin;

            // 初始化 ChatPanel
            plugin.chatPanel = new ChatPanel(plugin.claudeClient);
            this.element.innerHTML = '';
            this.element.appendChild(plugin.chatPanel.getElement());
            plugin.dockElement = this.element;

            console.log("Chat panel initialized");
        },
    });

    // 保存 model 以供后续使用
    this.dockModel = dockResult.model;
}
```

---

## Custom 类型

### 定义
```typescript
export declare class Custom extends Model {
    element: Element;           // Dock 的 DOM 元素
    tab: Tab;                   // 所属 Tab
    data: any;                  // 自定义数据
    type: string;               // 类型标识
    init: (custom: Custom) => void;
    destroy: () => void;
    beforeDestroy: () => void;
    resize: () => void;
    update: () => void;
    editors: Protyle[];         // 编辑器实例数组
}
```

### 在 init 函数中的使用

```typescript
init() {
    // this 是 Custom 实例

    // 访问 DOM 元素
    const dockElement = this.element;

    // 访问自定义数据
    const plugin = this.data.plugin;
    const customData = this.data.someData;

    // 添加内容到 Dock
    this.element.appendChild(myComponent);
}
```

---

## 常见问题

### Q: init 函数没有被调用？

**可能原因**：
1. ❌ 在 `onload()` 中调用了 `addDock`
   - **解决**：移动到 `onLayoutReady()`

2. ❌ 使用了箭头函数
   - **解决**：改用普通函数

```typescript
// ❌ 错误
init: () => {
    // this 绑定错误
}

// ✅ 正确
init() {
    // this 绑定正确
}
```

### Q: 如何控制 Dock 的显示/隐藏？

可以使用返回的 `model` 或者通过 SiYuan 的 Dock API：

```typescript
// 方法 1: 通过 this.docks 访问
const dockKey = Object.keys(this.docks || {}).find(key =>
    key.includes('your-dock-type')
);
const dock = this.docks[dockKey];

// 方法 2: 保存 model 引用
this.dockModel = dockResult.model;
```

### Q: type 参数应该用什么值？

**建议**：
- 使用简单、唯一的字符串标识符
- 示例：`"my-plugin-dock"`、`"claude-dock"`、`"bookmark-dock"`
- 官方示例使用 `"::dock"` 或 `"dock_tab"`

### Q: 如何调试 Dock 初始化？

```typescript
init() {
    console.log("=== Dock Init Debug ===");
    console.log("this:", this);
    console.log("this.element:", this.element);
    console.log("this.data:", this.data);
    console.log("========================");

    // 你的初始化代码...
}
```

---

## 参考资源

- [SiYuan 官方文档](https://docs.siyuan-note.club/zh-Hans/guide/plugin/)
- [SiYuan 插件方法 API](https://docs.siyuan-note.club/zh-Hans/reference/api/plugin/method.html)
- [官方插件示例](https://github.com/siyuan-note/plugin-sample)
- [sy-bookmark-plus 插件](https://github.com/frostime/sy-bookmark-plus)（addDock 实际使用示例）

---

## 更新日志

- 2025-01-18: 初始版本，整理 addDock API 和生命周期方法
