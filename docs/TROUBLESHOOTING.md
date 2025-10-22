# 故障排除指南 - Troubleshooting Guide

## 插件 Dock 不显示 / init 函数未调用

### 问题症状
- 插件加载成功，控制台显示 "Loading Claude Assistant Plugin"
- 点击顶部栏图标没有反应
- `init()` 函数从未被调用
- ChatPanel 没有初始化

### 根本原因
SiYuan 的 `addDock` API 有特殊的生命周期：
1. `addDock()` 只是**注册** dock，不会立即创建 dock 实例
2. `init()` 函数只在**用户首次打开 dock 时**才被调用
3. 返回的 `model` 是一个**工厂函数**，不是 Custom 实例

### 解决方案

#### 1. 在正确的生命周期方法中调用 addDock

**❌ 错误：在 onload() 中调用**
```typescript
async onload() {
    this.addDock({...});  // 错误！
}
```

**✅ 正确：在 onLayoutReady() 中调用**
```typescript
onLayoutReady() {
    this.addDock({...});  // 正确！
}
```

#### 2. 使用正确的 type 参数格式

SiYuan 内部会将插件名和 type 组合作为 key：

**❌ 错误：使用复杂的 type**
```typescript
type: PLUGIN_NAME + "::dock"  // 会变成很长的字符串
```

**✅ 正确：使用简单的 type**
```typescript
type: "claude-dock"  // SiYuan 会自动添加插件名前缀
```

#### 3. 使用正确的 toggleModel 调用

切换 dock 显示时，必须使用完整的 key（插件名 + type）：

```typescript
private toggleDock() {
    const layout = (window as any).siyuan?.layout;
    const dock = layout.rightDock;  // 或 bottomDock，取决于 position

    // 使用完整的 key
    const dockType = PLUGIN_NAME + "claude-dock";
    dock.toggleModel(dockType);
}
```

#### 4. 使用普通函数而非箭头函数

**❌ 错误：使用箭头函数**
```typescript
init: () => {
    // this 绑定错误
    console.log(this.element);  // undefined
}
```

**✅ 正确：使用普通函数**
```typescript
init() {
    // this 正确绑定到 Custom 实例
    console.log(this.element);  // HTMLElement
    console.log(this.data);     // 传入的 data 对象
}
```

### 完整示例

```typescript
export default class ClaudeAssistantPlugin extends Plugin {
    private chatPanel: ChatPanel | null = null;
    private dockElement: HTMLElement | null = null;

    async onload() {
        // 只做非 UI 相关的初始化
        this.settingsManager = new SettingsManager();
        this.claudeClient = new ClaudeClient(settings);

        // 注册命令
        this.addCommand({...});
    }

    onLayoutReady() {
        // UI 相关的初始化必须在这里
        const dockResult = this.addDock({
            config: {
                position: "RightBottom",
                size: { width: 400, height: 600 },
                icon: "iconRobot",
                title: "Claude AI",
                show: true,  // 可选：默认显示
            },
            data: {
                plugin: this,  // 传递插件实例
            },
            type: "claude-dock",  // 简单的类型名
            init() {
                // 使用普通函数，不要用箭头函数
                const plugin = this.data.plugin;

                // 初始化 ChatPanel
                plugin.chatPanel = new ChatPanel(plugin.claudeClient);
                this.element.innerHTML = '';
                this.element.appendChild(plugin.chatPanel.getElement());
                plugin.dockElement = this.element;
            },
        });

        // 添加顶部栏图标
        this.addTopBar({
            icon: "iconRobot",
            title: "Claude AI",
            position: "right",
            callback: () => {
                this.toggleDock();
            }
        });
    }

    private toggleDock() {
        const layout = (window as any).siyuan?.layout;
        if (!layout) return;

        const dock = layout.rightDock;
        if (!dock) return;

        // 使用完整的 key（插件名 + type）
        const dockType = PLUGIN_NAME + "claude-dock";
        dock.toggleModel(dockType);
    }
}
```

## 调试技巧

### 1. 检查 dock 是否注册成功

在浏览器控制台运行：
```javascript
// 查看所有已注册的 dock
Object.keys(window.siyuan.layout.rightDock.data)

// 应该看到类似：
// ['graph', 'globalGraph', 'backlink', 'siyuan-plugin-claude-assistantclaude-dock']
```

### 2. 检查 model 类型

在 `onLayoutReady` 中添加日志：
```typescript
const dockResult = this.addDock({...});
console.log("Model type:", typeof dockResult.model);  // 应该是 "function"
```

### 3. 验证 init 被调用

在 `init()` 函数中添加日志：
```typescript
init() {
    console.log("=== Dock Init Called ===");
    console.log("this.element:", this.element);
    console.log("this.data:", this.data);
    // ...
}
```

### 4. 检查 toggleModel 调用

```typescript
private toggleDock() {
    const layout = (window as any).siyuan?.layout;
    console.log("Layout:", layout);

    const dock = layout.rightDock;
    console.log("Dock:", dock);
    console.log("Dock data keys:", Object.keys(dock.data || {}));

    const dockType = PLUGIN_NAME + "claude-dock";
    console.log("Toggling with type:", dockType);

    dock.toggleModel(dockType);
}
```

## 常见错误

### Error: "Cannot read properties of null (reading 'classList')"

**原因**：传递给 `toggleModel` 的 type 不正确，SiYuan 找不到对应的 dock。

**解决**：确保使用完整的 key（插件名 + type）：
```typescript
const dockType = PLUGIN_NAME + "claude-dock";  // 正确
const dockType = "claude-dock";  // 错误
```

### init() 从不被调用

**原因**：
1. `addDock` 在 `onload()` 而不是 `onLayoutReady()` 中调用
2. 用户从未点击过 dock 图标

**解决**：
1. 将 `addDock` 移动到 `onLayoutReady()`
2. 点击顶部栏图标或 dock 按钮触发 `toggleModel`

### this.element 是 undefined

**原因**：在 `init()` 中使用了箭头函数。

**解决**：改用普通函数：
```typescript
// 错误
init: () => { ... }

// 正确
init() { ... }
```

## 参考资源

- [SiYuan 插件开发文档](https://docs.siyuan-note.club/zh-Hans/guide/plugin/)
- [SiYuan 插件 API 参考](https://docs.siyuan-note.club/zh-Hans/reference/api/plugin/)
- [docs/SIYUAN_API_REFERENCE.md](./SIYUAN_API_REFERENCE.md) - 本项目整理的 API 文档
