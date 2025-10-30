# GitHub Release 首次发布操作指南

完整的 Git 配置和首次发布步骤指南，从零开始到成功发布。

---

## 📋 目录

- [前置要求](#前置要求)
- [第一部分：Git 配置](#第一部分git-配置)
- [第二部分：提交发布系统](#第二部分提交发布系统)
- [第三部分：首次版本发布](#第三部分首次版本发布)
- [第四部分：验证发布](#第四部分验证发布)
- [故障排查](#故障排查)

---

## 前置要求

### ✅ 必需工具

1. **Git** 已安装并配置
   ```bash
   git --version  # 应显示版本号，如 git version 2.40.0
   ```

2. **Node.js** 已安装
   ```bash
   node --version  # 应为 v16+ 或更高
   npm --version   # 应为 v8+ 或更高
   ```

3. **GitHub 账户** 并且已有远程仓库
   - 仓库地址：https://github.com/Freedragonlancer/Siyuan-Note-ClaudePlugin

4. **Git 远程仓库已配置**
   ```bash
   git remote -v
   # 应显示：
   # origin  https://github.com/Freedragonlancer/Siyuan-Note-ClaudePlugin.git (fetch)
   # origin  https://github.com/Freedragonlancer/Siyuan-Note-ClaudePlugin.git (push)
   ```

---

## 第一部分：Git 配置

### 步骤 1：检查 Git 用户信息

```bash
# 检查当前配置
git config user.name
git config user.email

# 如果未配置或需要修改，设置用户信息
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### 步骤 2：配置 .gitignore（如果还没有）

确保以下文件/目录被忽略：

```bash
# 查看 .gitignore 内容
cat .gitignore

# 应包含以下内容（如果没有，需要添加）：
node_modules/
dist/
*.log
.DS_Store
.vscode/
.idea/
```

**如果 .gitignore 不完整**，执行：

```bash
# 备份现有 .gitignore（如果存在）
cp .gitignore .gitignore.bak

# 添加必要的忽略规则
cat >> .gitignore << 'EOF'
# Dependencies
node_modules/

# Build output
dist/

# Logs
*.log
npm-debug.log*

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Temporary files
*.tmp
.cache/

# Environment
.env
.env.local
EOF
```

### 步骤 3：检查当前 Git 状态

```bash
# 查看工作目录状态
git status

# 查看当前分支
git branch

# 如果不在 main 分支，切换到 main
git checkout main
```

### 步骤 4：检查远程仓库连接

```bash
# 测试远程连接
git fetch origin

# 如果失败，可能需要配置身份验证
# 对于 HTTPS（推荐使用 Personal Access Token）：
git remote set-url origin https://YOUR_GITHUB_USERNAME@github.com/Freedragonlancer/Siyuan-Note-ClaudePlugin.git

# 或使用 SSH（需要配置 SSH key）：
git remote set-url origin git@github.com:Freedragonlancer/Siyuan-Note-ClaudePlugin.git
```

---

## 第二部分：提交发布系统

### 步骤 1：查看新增的发布系统文件

```bash
# 查看新增文件
git status

# 应该看到以下未跟踪的文件：
# RELEASE.md
# RELEASE_SETUP_GUIDE.md
# .github/workflows/release.yml
# .github/workflows/version-check.yml
# scripts/bump-version.js
# .versionrc.json
#
# 以及修改的文件：
# CLAUDE.md
# package.json
```

### 步骤 2：添加所有发布系统文件到 Git

```bash
# 添加新文件和修改的文件
git add RELEASE.md
git add RELEASE_SETUP_GUIDE.md
git add .github/workflows/release.yml
git add .github/workflows/version-check.yml
git add scripts/bump-version.js
git add .versionrc.json
git add CLAUDE.md
git add package.json

# 或者一次性添加所有文件
git add .
```

### 步骤 3：提交发布系统

```bash
# 使用 Conventional Commits 格式提交
git commit -m "feat: add automated GitHub release system

- Complete release documentation (RELEASE.md)
- GitHub Actions workflows for release and PR validation
- Version bump script with Conventional Commits support
- npm scripts for release automation
- Updated CLAUDE.md with release section
- First-time release setup guide (RELEASE_SETUP_GUIDE.md)

This enables fully automated releases triggered by git tags."
```

### 步骤 4：推送到 GitHub

```bash
# 推送到远程仓库
git push origin main

# 如果推送失败（本地落后于远程），先拉取：
git pull origin main --rebase
git push origin main
```

---

## 第三部分：首次版本发布

### 选项 A：自动发布（推荐）

这个选项会自动分析你的 commits 并决定版本号。

```bash
# 1. 确保所有更改已提交
git status  # 应显示 "nothing to commit, working tree clean"

# 2. 执行自动发布
npm run release
```

**预期输出**：
```
═══════════════════════════════════════════
   SiYuan Plugin Version Bump Script
═══════════════════════════════════════════

ℹ️  Current version: 0.1.0

ℹ️  No bump type specified, analyzing commits...
ℹ️  Found feat commit(s)

─────────────────────────────────────────
  0.1.0 → 0.2.0 (MINOR)
─────────────────────────────────────────

✅ Updated package.json: 0.1.0 → 0.2.0
✅ Updated plugin.json: 0.1.0 → 0.2.0

═══════════════════════════════════════════
   Version Bump Complete!
═══════════════════════════════════════════

[然后自动执行 git commit, git tag, git push]
```

### 选项 B：手动指定版本类型

如果你想手动控制版本升级类型：

```bash
# 对于主版本（破坏性变更）：0.1.0 → 1.0.0
npm run release:major

# 对于次版本（新功能）：0.1.0 → 0.2.0
npm run release:minor

# 对于补丁版本（bug 修复）：0.1.0 → 0.1.1
npm run release:patch
```

### 选项 C：完全手动发布

如果你想完全控制每一步：

```bash
# 1. 手动更新版本号
npm run bump-version minor  # 或 major/patch

# 2. 查看更改
git diff package.json plugin.json

# 3. 提交版本更改
git add package.json plugin.json
git commit -m "chore: bump version to $(node -p "require('./package.json').version")"

# 4. 创建 tag
VERSION=$(node -p "require('./package.json').version")
git tag v$VERSION -m "Release v$VERSION"

# 5. 推送到 GitHub（包括 tags）
git push origin main --tags
```

---

## 第四部分：验证发布

### 步骤 1：检查 GitHub Actions 工作流

1. 访问你的 GitHub 仓库：
   ```
   https://github.com/Freedragonlancer/Siyuan-Note-ClaudePlugin
   ```

2. 点击 **Actions** 标签

3. 查找名为 **"Release Plugin"** 的工作流

4. 点击最新的运行，查看执行日志

**预期步骤**：
- ✅ Validate Tag Format
- ✅ Checkout Repository
- ✅ Setup Node.js
- ✅ Install Dependencies
- ✅ Verify Version Consistency
- ✅ Build Plugin
- ✅ Verify Build Output
- ✅ Generate Changelog
- ✅ Create Release Package
- ✅ Create GitHub Release

### 步骤 2：检查 GitHub Release

1. 在仓库页面，点击右侧的 **Releases**

2. 应该看到新创建的 release（如 `v0.2.0`）

3. 验证以下内容：
   - ✅ Release 标题正确（如 `v0.2.0`）
   - ✅ Release notes 包含 changelog
   - ✅ 附件包含 `siyuan-plugin-claude-assistant-v0.2.0.zip`

### 步骤 3：下载并测试 Release 包

```bash
# 下载 release ZIP
curl -L -o test-release.zip https://github.com/Freedragonlancer/Siyuan-Note-ClaudePlugin/releases/latest/download/siyuan-plugin-claude-assistant-v0.2.0.zip

# 解压并检查内容
unzip -l test-release.zip

# 应包含：
# index.js
# index.css
# plugin.json
# icon.png
# README.md
# README_zh_CN.md
# i18n/*
```

### 步骤 4：（可选）检查 SiYuan Bazaar PR

如果配置了 `BAZAAR_TOKEN`：

1. 访问 https://github.com/siyuan-note/bazaar/pulls

2. 查找你的插件更新 PR

3. PR 标题应为：`chore: update siyuan-plugin-claude-assistant to vX.Y.Z`

---

## 故障排查

### 问题 1：git push 被拒绝（Permission denied）

**原因**：GitHub 身份验证失败

**解决方案（HTTPS）**：使用 Personal Access Token

1. 访问 GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)

2. 点击 **Generate new token (classic)**

3. 勾选权限：
   - `repo` (完整仓库访问)
   - `workflow` (GitHub Actions)

4. 生成 token 并复制

5. 更新 Git 远程 URL：
   ```bash
   git remote set-url origin https://YOUR_TOKEN@github.com/Freedragonlancer/Siyuan-Note-ClaudePlugin.git
   ```

6. 重新推送：
   ```bash
   git push origin main --tags
   ```

**解决方案（SSH）**：配置 SSH Key

1. 生成 SSH key：
   ```bash
   ssh-keygen -t ed25519 -C "your.email@example.com"
   ```

2. 添加到 ssh-agent：
   ```bash
   eval "$(ssh-agent -s)"
   ssh-add ~/.ssh/id_ed25519
   ```

3. 复制公钥：
   ```bash
   cat ~/.ssh/id_ed25519.pub
   ```

4. 添加到 GitHub：Settings → SSH and GPG keys → New SSH key

5. 更新远程 URL：
   ```bash
   git remote set-url origin git@github.com:Freedragonlancer/Siyuan-Note-ClaudePlugin.git
   ```

---

### 问题 2：npm run release 失败（版本号不匹配）

**错误信息**：
```
Error: package.json version (0.2.0) does not match plugin.json version (0.1.0)
```

**解决方案**：
```bash
# 手动同步版本号
npm run bump-version patch  # 这会同时更新两个文件

# 或者手动编辑 plugin.json 使版本号匹配 package.json
```

---

### 问题 3：GitHub Actions 工作流失败（构建错误）

**常见原因**：
- Node.js 版本不兼容
- 依赖安装失败
- 构建脚本错误

**解决方案**：

1. 本地测试构建：
   ```bash
   npm ci  # 清洁安装依赖
   npm run build  # 测试构建
   ```

2. 检查 `dist/` 目录：
   ```bash
   ls -lh dist/
   # 应包含 index.js, index.css, plugin.json, icon.png
   ```

3. 如果本地构建成功，检查 GitHub Actions 日志找出差异

---

### 问题 4：Release 创建成功，但没有 ZIP 文件

**原因**：ZIP 创建或上传步骤失败

**解决方案**：

1. 检查 Actions 日志中的 "Create Release Package" 步骤

2. 确保 `dist/` 目录包含所有必需文件

3. 手动创建 ZIP 测试：
   ```bash
   cd dist
   zip -r test-package.zip index.js index.css plugin.json icon.png README.md README_zh_CN.md i18n/
   ```

---

### 问题 5：Tag 已存在错误

**错误信息**：
```
fatal: tag 'v0.2.0' already exists
```

**解决方案**：

**选项 A**：删除本地和远程 tag，重新创建
```bash
# 删除本地 tag
git tag -d v0.2.0

# 删除远程 tag
git push origin :refs/tags/v0.2.0

# 重新创建和推送
git tag v0.2.0
git push origin v0.2.0
```

**选项 B**：升级到下一个版本
```bash
npm run bump-version patch  # 升级到 v0.2.1
git add package.json plugin.json
git commit -m "chore: bump version to 0.2.1"
git tag v0.2.1
git push origin main --tags
```

---

## 🎯 快速参考命令

### 日常发布流程

```bash
# 1. 开发完成，确保所有更改已提交
git add .
git commit -m "feat: your feature description"

# 2. 推送到 GitHub
git push origin main

# 3. 自动发布
npm run release

# 4. 等待 GitHub Actions 完成（约 2-5 分钟）

# 5. 检查 release
# 访问 https://github.com/Freedragonlancer/Siyuan-Note-ClaudePlugin/releases
```

### 检查命令

```bash
# 查看当前版本
npm run version:check

# 查看 git 状态
git status

# 查看 tag 列表
git tag -l

# 查看最近的 commits
git log --oneline -10

# 测试构建
npm run build
```

---

## 📞 获取帮助

如果遇到其他问题：

1. **检查 GitHub Actions 日志**：详细的错误信息
2. **查看 RELEASE.md**：完整的发布文档
3. **提交 Issue**：https://github.com/Freedragonlancer/Siyuan-Note-ClaudePlugin/issues

---

**最后更新**：2025-10-30
**作者**：Claude Assistant
