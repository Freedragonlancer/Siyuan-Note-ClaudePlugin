# Release Guide

Comprehensive guide for releasing new versions of the SiYuan Plugin Claude Assistant.

## Table of Contents

- [Version Numbering Scheme](#version-numbering-scheme)
- [Conventional Commits](#conventional-commits)
- [Automated Release Process](#automated-release-process)
- [Manual Release Steps](#manual-release-steps)
- [SiYuan Bazaar Integration](#siyuan-bazaar-integration)
- [Release Checklist](#release-checklist)
- [Rollback Strategy](#rollback-strategy)
- [FAQ](#faq)

---

## Version Numbering Scheme

This project follows **Semantic Versioning 2.0.0** ([semver.org](https://semver.org/)).

### Format

```
MAJOR.MINOR.PATCH
```

- **MAJOR** (X.0.0): Breaking changes, incompatible API changes
- **MINOR** (0.X.0): New features, backward-compatible functionality
- **PATCH** (0.0.X): Bug fixes, backward-compatible corrections

### Examples

- `0.1.0` → `0.2.0`: New feature added (Quick Edit presets)
- `0.2.0` → `0.2.1`: Bug fix (streaming performance)
- `0.2.1` → `1.0.0`: Breaking change (refactored settings API)

### Pre-release Versions (Not Used)

This project does NOT use pre-release versions (alpha/beta/rc). All testing is completed before release.

---

## Conventional Commits

All commits MUST follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Commit Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types

| Type | Description | Version Bump |
|------|-------------|--------------|
| `feat` | New feature | MINOR |
| `fix` | Bug fix | PATCH |
| `docs` | Documentation only | None |
| `style` | Code style (formatting, semicolons) | None |
| `refactor` | Code refactoring (no feature/bug change) | None |
| `perf` | Performance improvement | PATCH |
| `test` | Adding/updating tests | None |
| `build` | Build system or dependency changes | None |
| `ci` | CI/CD configuration changes | None |
| `chore` | Other changes (tooling, config) | None |
| `revert` | Revert previous commit | PATCH |

### Breaking Changes

Add `BREAKING CHANGE:` in footer or `!` after type to trigger **MAJOR** version bump:

```
feat!: redesign settings API

BREAKING CHANGE: Settings API now uses ConfigManager instead of direct localStorage access.
Migration guide in docs/MIGRATION.md.
```

### Examples

```bash
# Feature (bumps MINOR: 0.1.0 → 0.2.0)
git commit -m "feat: add support for Claude 3.5 Sonnet model"

# Bug fix (bumps PATCH: 0.2.0 → 0.2.1)
git commit -m "fix: resolve streaming timeout issue in Quick Edit"

# Bug fix with scope (bumps PATCH)
git commit -m "fix(quick-edit): prevent duplicate comparison blocks"

# Documentation (no version bump)
git commit -m "docs: update API key configuration instructions"

# Breaking change (bumps MAJOR: 0.2.1 → 1.0.0)
git commit -m "feat!: migrate to Anthropic SDK v2.0

BREAKING CHANGE: Requires Anthropic SDK v2.0+. See MIGRATION.md."
```

---

## Automated Release Process

GitHub Actions automatically handles the entire release workflow when a version tag is created.

### Prerequisites

1. **GitHub Secrets** (configured in repository settings):
   - `GITHUB_TOKEN` (automatically provided by GitHub)
   - `BAZAAR_TOKEN` (optional, for SiYuan Bazaar PR automation)

2. **Repository Settings**:
   - Actions enabled
   - Write permissions for workflows
   - Release creation allowed

### Workflow Trigger

The release workflow is triggered when you create and push a version tag:

```bash
# Method 1: Using npm script (recommended)
npm run release

# Method 2: Manual git tag
git tag v1.2.3
git push origin v1.2.3
```

### Automated Steps

When the tag is pushed, GitHub Actions automatically:

1. ✅ **Validates Tag Format**: Ensures tag matches `v*.*.*` pattern
2. ✅ **Analyzes Commits**: Parses commits since last tag
3. ✅ **Generates Changelog**: Creates release notes from Conventional Commits
4. ✅ **Builds Plugin**: Runs `npm run build` to generate distribution files
5. ✅ **Creates Release Package**: Zips `index.js`, `index.css`, `plugin.json`, `icon.png`, `README*.md`
6. ✅ **Creates GitHub Release**: Publishes release with generated notes
7. ✅ **Uploads Assets**: Attaches `siyuan-plugin-claude-assistant-v*.zip`
8. ✅ **Submits to Bazaar**: (Optional) Creates PR in SiYuan plugin marketplace

### Monitoring Release

1. Go to **Actions** tab in GitHub repository
2. Find the running workflow: **"Release Plugin"**
3. Monitor real-time logs for each step
4. Check **Releases** tab for published release

---

## Manual Release Steps

If GitHub Actions fails or manual release is needed:

### 1. Update Version Numbers

Update version in **both** files:

```bash
# package.json
"version": "1.2.3"

# plugin.json
"version": "1.2.3"
```

### 2. Update Changelog

Edit `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/):

```markdown
## [1.2.3] - 2025-10-30

### Added
- Support for Claude 3.5 Sonnet model

### Fixed
- Streaming timeout issue in Quick Edit
- Duplicate comparison blocks bug

### Changed
- Improved error handling in API client
```

### 3. Build Plugin

```bash
npm run build
```

Verify `dist/` contains:
- `index.js` (bundled code)
- `index.css` (styles)
- `plugin.json` (metadata)
- `icon.png` (160x160 icon)
- `README.md` + `README_zh_CN.md`

### 4. Create Release Package

```bash
# Windows PowerShell
Compress-Archive -Path dist\index.js,dist\index.css,dist\plugin.json,dist\icon.png,dist\README.md,dist\README_zh_CN.md -DestinationPath siyuan-plugin-claude-assistant-v1.2.3.zip

# Linux/macOS
cd dist && zip -r ../siyuan-plugin-claude-assistant-v1.2.3.zip index.js index.css plugin.json icon.png README.md README_zh_CN.md
```

### 5. Create Git Tag

```bash
git add package.json plugin.json CHANGELOG.md
git commit -m "chore: release v1.2.3"
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin main --tags
```

### 6. Create GitHub Release

1. Go to **Releases** → **Draft a new release**
2. **Tag version**: `v1.2.3`
3. **Release title**: `v1.2.3 - Brief Description`
4. **Description**: Copy from `CHANGELOG.md`
5. **Attach files**: Upload `siyuan-plugin-claude-assistant-v1.2.3.zip`
6. Click **Publish release**

---

## SiYuan Bazaar Integration

SiYuan plugin marketplace ([bazaar](https://github.com/siyuan-note/bazaar)) requires manual submission.

### Automated Submission (Recommended)

If `BAZAAR_TOKEN` is configured, GitHub Actions automatically creates a PR. Monitor:
- **siyuan-note/bazaar** repository for new PR
- PR should update `plugins.json` with new version info

### Manual Submission

If automation fails or token not configured:

1. **Fork** [siyuan-note/bazaar](https://github.com/siyuan-note/bazaar)

2. **Edit** `plugins.json`:

```json
{
  "repos": [
    {
      "owner": "Freedragonlancer",
      "repo": "Siyuan-Note-ClaudePlugin",
      "version": "1.2.3",
      "minAppVersion": "2.12.0"
    }
  ]
}
```

3. **Create PR** with title: `chore: update siyuan-plugin-claude-assistant to v1.2.3`

4. **Wait for Review**: Maintainers will validate and merge

5. **Verify**: Check plugin appears in SiYuan → Settings → Bazaar → Plugins

---

## Release Checklist

Use this checklist before releasing:

### Pre-release

- [ ] All commits follow Conventional Commits format
- [ ] All tests pass locally
- [ ] CHANGELOG.md is up to date (if manual release)
- [ ] README.md reflects new features/changes
- [ ] No hardcoded API keys or secrets in code
- [ ] `plugin.json` minAppVersion is correct
- [ ] Build succeeds without errors: `npm run build`
- [ ] Plugin works in local SiYuan: `npm run deploy` + test

### Release

- [ ] Version numbers match in `package.json` and `plugin.json`
- [ ] Git tag follows `vX.Y.Z` format
- [ ] Tag pushed to GitHub: `git push origin --tags`
- [ ] GitHub Actions workflow completed successfully
- [ ] GitHub Release created with correct assets
- [ ] Release notes are accurate and complete

### Post-release

- [ ] Release appears in GitHub Releases tab
- [ ] ZIP file downloads correctly
- [ ] SiYuan Bazaar PR created (if automated)
- [ ] Plugin installs correctly from release ZIP
- [ ] Verified in SiYuan Bazaar within 24-48 hours (manual check)

---

## Rollback Strategy

If a release has critical issues:

### 1. Immediate Mitigation

**Option A: Delete Release** (if < 1 hour old, no downloads)
```bash
gh release delete v1.2.3 --yes
git tag -d v1.2.3
git push origin :refs/tags/v1.2.3
```

**Option B: Mark as Pre-release** (if downloads exist)
1. Edit GitHub Release
2. Check **"This is a pre-release"**
3. Add warning in description

### 2. Fix and Re-release

```bash
# Fix critical issue
git commit -m "fix: critical bug in v1.2.3"

# Release patch version
git tag v1.2.4
git push origin v1.2.4
```

### 3. Bazaar Update

If already in SiYuan Bazaar:
1. Create PR to update `plugins.json` to fixed version
2. Notify maintainers of critical issue

### 4. Communication

- Update GitHub Release notes with warning
- Open GitHub Issue explaining problem and fix
- Update README.md if installation instructions affected

---

## FAQ

### Q: How do I know what version number to use?

**A:** Use `npm run release` which automatically calculates the next version based on commits since last tag.

### Q: Can I manually choose the version bump type?

**A:** Yes, specify in tag:
```bash
npm run release -- --release-as major  # Force MAJOR bump
npm run release -- --release-as minor  # Force MINOR bump
npm run release -- --release-as patch  # Force PATCH bump
```

### Q: What if I forgot to follow Conventional Commits?

**A:** Manually update version in `package.json` + `plugin.json`, then create tag:
```bash
git tag v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

### Q: How do I create a hotfix release?

**A:**
```bash
git checkout -b hotfix/critical-bug
# Fix the bug
git commit -m "fix: resolve critical authentication bug"
git checkout main
git merge hotfix/critical-bug
npm run release  # Auto-bumps PATCH version
```

### Q: Can I test the release workflow without publishing?

**A:** Yes, use workflow dispatch with `dry-run` mode (see `.github/workflows/release.yml` for implementation).

### Q: How long until release appears in SiYuan Bazaar?

**A:** Typically 24-48 hours after PR is merged by maintainers.

### Q: What if GitHub Actions fails?

**A:**
1. Check **Actions** tab for error logs
2. Fix the issue (usually build errors or missing secrets)
3. Delete failed tag: `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`
4. Re-tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`

---

## Version History

- **v0.1.0** (2024-10-22): Initial release with Chat + Quick Edit features
- **v0.1.0** (Current): First version with automated release system

---

## References

- [Semantic Versioning 2.0.0](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [SiYuan Plugin Bazaar](https://github.com/siyuan-note/bazaar)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

---

**Last Updated**: 2025-10-30
**Maintained By**: Freedragonlancer
