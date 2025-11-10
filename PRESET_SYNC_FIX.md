# Quick Edit Preset 同步问题修复

## 🐛 问题描述

### 用户反馈
- **现象**: 打开软件第一次使用 Quick Edit 时
- **UI 显示**: 正确显示上次关闭时最后选择的 preset（UI 正确 ✅）
- **实际请求**: 发送的是最后一个 preset 的内容（逻辑错误 ❌）

### 复现步骤
1. 打开 SiYuan，插件有 3 个 presets（A, B, C）
2. 上次关闭时选择了 preset A
3. 重新打开 SiYuan，触发 Quick Edit
4. **预期**: 使用 preset A 的 `editInstruction`
5. **实际**: 使用全局的 `quickEditPromptTemplate`（可能是 preset C 的内容）

---

## 🔍 根本原因分析

### 问题定位

**UI 显示流程（正确）**:
```typescript
// InstructionInputPopup.ts 第74行
const lastPresetId = this.getLastPresetIndex(); // 从 localStorage 读取

// 第79-84行
if (lastPresetId && lastPresetId !== 'custom') {
    const preset = this.presets.find(p => p.id === lastPresetId);
    if (preset) {
        presetIdToUse = lastPresetId; // ✅ UI 显示正确
    }
}
```

**实际使用流程（错误）**:
```typescript
// QuickEditManager.ts 原第640行（修复前）
const claudeSettings = this.claudeClient.getSettings();
const template = claudeSettings.quickEditPromptTemplate; // ❌ 使用全局模板
```

### 为什么会这样？

1. **全局配置混淆**:
   - `quickEditPromptTemplate` 是存储在 ClaudeSettings 中的**全局配置**
   - 每个 preset 有自己的 `editInstruction`
   - 代码使用了全局的而不是 preset 特定的

2. **缺少从 preset 到请求的映射**:
   ```
   用户选择 preset A（保存到 localStorage）
       ↓
   UI 显示 preset A ✅
       ↓
   发送请求时...读取全局 quickEditPromptTemplate ❌
       ↓
   使用了错误的模板
   ```

3. **为什么是"最后一个 preset"？**:
   - 当用户点击 preset 按钮时，会触发 `handlePresetSwitch()`
   - 这个方法更新了全局的 `systemPrompt` 和 `appendedPrompt`
   - 但**没有更新** `quickEditPromptTemplate`
   - 所以 `quickEditPromptTemplate` 还是初始值或上次设置的值

---

## 🔧 修复方案

### 核心思想
**从 localStorage 读取当前选中的 preset ID → 使用该 preset 的 editInstruction**

### 代码修改

#### 修改位置: `QuickEditManager.ts` 第639-673行

**修复前**:
```typescript
// 构建请求：使用可配置的提示词模板（从 ClaudeClient 获取）
const claudeSettings = this.claudeClient.getSettings();
const template = claudeSettings.quickEditPromptTemplate || `...默认模板...`;
```

**修复后**:
```typescript
// FIX: 构建请求模板 - 使用当前选中 preset 的 editInstruction
// 获取当前选中的 preset ID
const currentPresetId = this.getCurrentPresetId();
let template: string;

// 如果有选中的 preset，使用 preset 的 editInstruction
if (currentPresetId) {
    const allTemplates = this.configManager.getAllTemplates();
    const currentPreset = allTemplates.find(t => t.id === currentPresetId);

    if (currentPreset && currentPreset.editInstruction) {
        template = currentPreset.editInstruction;
        console.log(`[QuickEdit] Using preset "${currentPreset.name}" editInstruction`);
    } else {
        // 回退：preset 不存在或没有 editInstruction
        console.warn(`[QuickEdit] Preset ${currentPresetId} not found or has no editInstruction, using global template`);
        const claudeSettings = this.claudeClient.getSettings();
        template = claudeSettings.quickEditPromptTemplate || `...默认模板...`;
    }
} else {
    // 没有选中 preset，使用全局模板
    console.log(`[QuickEdit] No preset selected, using global quickEditPromptTemplate`);
    const claudeSettings = this.claudeClient.getSettings();
    template = claudeSettings.quickEditPromptTemplate || `...默认模板...`;
}
```

### 修改 2: 避免重复调用

**修复前**（第671行）:
```typescript
// 获取当前预设 ID，用于获取预设级别的 filterRules
const currentPresetId = this.getCurrentPresetId(); // ❌ 重复调用
```

**修复后**（第697-699行）:
```typescript
// 获取 filterRules（全局 + 预设）
// Note: currentPresetId 已经在上面获取过了，直接使用
const filterRules: FilterRule[] = this.claudeClient.getFilterRules(currentPresetId) || [];
```

---

## 📊 修复效果

### 修复前
| 步骤 | UI 显示 | 实际使用 |
|------|---------|----------|
| 上次选择 preset A | - | - |
| 重启 SiYuan | preset A ✅ | global template ❌ |
| 发送请求 | preset A ✅ | **错误的模板** ❌ |

### 修复后
| 步骤 | UI 显示 | 实际使用 |
|------|---------|----------|
| 上次选择 preset A | - | - |
| 重启 SiYuan | preset A ✅ | preset A ✅ |
| 发送请求 | preset A ✅ | **preset A 的 editInstruction** ✅ |

---

## ✅ 测试验证

### 测试场景 1: 基本功能
1. 配置 3 个 presets（A、B、C），每个有不同的 `editInstruction`
2. 选择 preset A，发送请求
3. **检查控制台**: 应显示 `[QuickEdit] Using preset "A" editInstruction`
4. **检查请求内容**: 确认使用了 preset A 的模板

### 测试场景 2: 重启持久化（核心问题）
1. 选择 preset B
2. 关闭 SiYuan
3. 重新打开 SiYuan
4. 触发 Quick Edit（不切换 preset）
5. **检查控制台**: 应显示 `[QuickEdit] Using preset "B" editInstruction`
6. **检查 UI**: preset B 应被高亮
7. **检查请求**: 确认使用了 preset B 的模板

### 测试场景 3: 切换 preset
1. 当前选择 preset A
2. 打开 Quick Edit 弹窗，切换到 preset C
3. **检查控制台**: 应显示 `[QuickEdit] Using preset "C" editInstruction`
4. **检查 UI**: preset C 应被高亮
5. **检查请求**: 确认使用了 preset C 的模板

### 测试场景 4: 无 preset 场景
1. 删除 localStorage 中的 `claude-quick-edit-last-preset-index`
2. 触发 Quick Edit
3. **检查控制台**: 应显示 `[QuickEdit] No preset selected, using global quickEditPromptTemplate`
4. **检查请求**: 确认使用了全局模板

---

## 🔍 调试技巧

### 1. 控制台日志
打开控制台（F12），查找以下日志：
```
[QuickEdit] Using preset "预设名称" editInstruction  ← 成功使用 preset
[QuickEdit] No preset selected, using global...       ← 使用全局模板
[QuickEdit] Preset xxx not found or has no...        ← preset 不存在（警告）
```

### 2. localStorage 检查
在控制台执行：
```javascript
localStorage.getItem('claude-quick-edit-last-preset-index')
```
应返回 preset ID（如 `"preset-1"`）

### 3. 验证 preset 配置
在控制台执行：
```javascript
// 获取所有 presets
const configManager = ... // 从插件实例获取
const presets = configManager.getAllTemplates();
console.table(presets.map(p => ({
    id: p.id,
    name: p.name,
    hasEditInstruction: !!p.editInstruction
})));
```

---

## 🚀 部署说明

### 构建和部署
```bash
npm run deploy
```

### 重启 SiYuan
修复需要重启 SiYuan（F5）才能生效

### 验证修复
1. 选择一个 preset
2. 关闭 SiYuan
3. 重新打开，发起请求
4. 查看控制台日志，确认使用了正确的 preset

---

## 📋 相关代码路径

| 文件 | 行号 | 说明 |
|------|------|------|
| QuickEditManager.ts | 639-673 | 修复：使用 preset 的 editInstruction |
| QuickEditManager.ts | 697-699 | 优化：避免重复调用 getCurrentPresetId() |
| QuickEditManager.ts | 1977-1993 | getCurrentPresetId() 方法 |
| InstructionInputPopup.ts | 74-100 | UI 显示逻辑（已正确） |
| InstructionInputPopup.ts | 580-587 | getLastPresetIndex() 方法 |

---

## 🎯 修复总结

### 修改文件
- ✅ `QuickEditManager.ts` - 1 处修改（35行代码）

### 修改类型
- 🐛 Bug 修复
- 🔧 逻辑优化

### 影响范围
- ✅ Quick Edit preset 选择逻辑
- ✅ 请求模板生成逻辑
- ❌ 无 UI 变更
- ❌ 无 API 变更

### 向后兼容性
- ✅ 完全兼容
- ✅ 不影响现有功能
- ✅ 回退策略：使用全局模板

---

**修复完成时间**: 2025-01-05
**修复版本**: v0.7.0+
**修复状态**: ✅ 已修复，待测试
