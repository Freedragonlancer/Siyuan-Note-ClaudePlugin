# Contributing to SiYuan Claude Assistant

First off, thank you for considering contributing to SiYuan Claude Assistant! 🎉

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Style Guidelines](#style-guidelines)
- [Commit Messages](#commit-messages)

## 📜 Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## 🤝 How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples**
- **Describe the behavior you observed and what you expected**
- **Include screenshots if possible**
- **Specify your environment** (SiYuan version, OS, plugin version)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- **Use a clear and descriptive title**
- **Provide a detailed description of the suggested enhancement**
- **Explain why this enhancement would be useful**
- **List examples of where this enhancement could be applied**

### Your First Code Contribution

Unsure where to begin? Look for issues tagged with:

- `good first issue` - easier issues for newcomers
- `help wanted` - issues that need assistance

### Pull Requests

1. Fork the repo and create your branch from `main`
2. Make your changes
3. Test your changes thoroughly
4. Update documentation if needed
5. Submit a pull request

## 🛠️ Development Setup

### Prerequisites

- Node.js (v16 or higher)
- npm or pnpm
- SiYuan Note (v2.12.0+)
- Git

### Setup Steps

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/siyuan-plugin-claude-assistant.git
cd siyuan-plugin-claude-assistant

# Install dependencies
npm install

# Start development mode (watch for changes)
npm run dev

# Build for production
npm run build

# Create development link (optional)
npm run make-link -- --dir=/path/to/siyuan/data/plugins
```

### Project Structure

```
siyuan-plugin-claude-assistant/
├── src/
│   ├── index.ts          # Plugin entry point
│   ├── claude/           # Claude API client
│   ├── sidebar/          # UI components
│   │   ├── UnifiedAIPanel.ts
│   │   └── unified-types.ts
│   ├── settings/         # Settings management
│   ├── editor/           # Text editing features
│   └── index.scss        # Styles
├── dist/                 # Build output (gitignored)
├── plugin.json           # Plugin metadata
└── README.md
```

### Testing

Manual testing checklist:
- [ ] Chat functionality works
- [ ] Text editing works (select, edit, apply)
- [ ] Settings persist correctly
- [ ] UI looks correct in different themes
- [ ] No console errors

## 📝 Pull Request Process

1. **Update README.md** with details of changes if needed
2. **Update CHANGELOG.md** following the Keep a Changelog format
3. **Ensure all tests pass** and add new tests if applicable
4. **Update documentation** for any changed functionality
5. **Follow the style guidelines** below
6. **Get approval** from at least one maintainer

### PR Title Format

```
type(scope): brief description

Types: feat, fix, docs, style, refactor, test, chore
Examples:
- feat(chat): add message export functionality
- fix(settings): resolve API key validation issue
- docs(readme): update installation instructions
```

## 🎨 Style Guidelines

### TypeScript Code Style

- Use TypeScript strict mode
- Follow existing code formatting (2 spaces indentation)
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Avoid `any` type when possible

```typescript
// Good
interface MessageOptions {
    content: string;
    role: 'user' | 'assistant';
    timestamp: number;
}

function createMessage(options: MessageOptions): Message {
    // Implementation
}

// Bad
function createMessage(data: any) {
    // Implementation
}
```

### CSS/SCSS Style

- Use BEM naming convention for class names
- Follow SiYuan's CSS variable conventions
- Keep selectors specific but not overly nested
- Use existing utility classes when possible

```scss
// Good
.claude-message {
    &__content {
        padding: 8px;
    }
    
    &--user {
        background: var(--b3-theme-primary);
    }
}

// Bad
.message {
    .content {
        padding: 8px;
    }
}
```

### File Organization

- One component per file
- Group related files in directories
- Use index.ts for barrel exports
- Keep files focused and under 500 lines

## 📨 Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```
feat(chat): add conversation export functionality

Added ability to export chat history as JSON or Markdown.
Includes UI button and file download logic.

Closes #123
```

```
fix(settings): resolve API key validation issue

Fixed bug where API keys with special characters
were incorrectly rejected during validation.

Fixes #456
```

## 🌐 Internationalization

When adding new UI text:

1. Add the English text to `i18n/en_US.json`
2. Add the Chinese translation to `i18n/zh_CN.json`
3. Use the i18n system in your code

```typescript
// Good
const text = this.plugin.i18n.settingsTitle;

// Bad
const text = "Settings";
```

## 🔍 Code Review Process

All submissions require review. We use GitHub pull requests for this purpose:

1. **Automated checks** must pass (if configured)
2. **Code review** by at least one maintainer
3. **Discussion and iteration** on feedback
4. **Final approval** and merge

## 📞 Getting Help

- **Documentation**: Check CLAUDE.md for development details
- **Issues**: Search existing issues or create a new one
- **Discussions**: Use GitHub Discussions for questions

## 🙏 Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes for their contributions
- GitHub's contributor graph

Thank you for contributing! 🎉
