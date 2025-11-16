# Code Style Guide

## Overview

This project uses ESLint and Prettier to enforce consistent code style across the codebase.

## Setup

### Install Dependencies

```bash
npm install --save-dev @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint prettier eslint-config-prettier
```

### NPM Scripts

Add the following scripts to `package.json`:

```json
{
  "scripts": {
    "lint": "eslint src --ext .ts,.tsx",
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "format": "prettier --write \"src/**/*.{ts,tsx,json,md}\"",
    "format:check": "prettier --check \"src/**/*.{ts,tsx,json,md}\"",
    "typecheck": "tsc --noEmit",
    "check-all": "npm run typecheck && npm run lint && npm run format:check"
  }
}
```

## Configuration Files

### ESLint (`.eslintrc.json`)

- **Purpose**: Catches code quality issues and enforces coding standards
- **Key Rules**:
  - No unused variables (warns if prefixed with `_` for intentional unused)
  - Warn on `any` type usage
  - Warn on console.log (allow console.warn/error)
  - Require const for immutable variables
  - Enforce strict equality (`===`)
  - Enforce curly braces for all control statements

### Prettier (`.prettierrc.json`)

- **Purpose**: Enforces consistent code formatting
- **Settings**:
  - Single quotes for strings
  - Semicolons required
  - 4 spaces for indentation
  - 100 characters per line
  - Trailing commas in multi-line structures

### TypeScript (`tsconfig.json`)

- **Strict Mode**: Enabled
- **Key Checks**:
  - `noImplicitAny`: Requires explicit type annotations
  - `strictNullChecks`: Prevents null/undefined issues
  - `noUnusedLocals`: Detects unused variables
  - `noUnusedParameters`: Detects unused function parameters

## Usage

### Check Code Quality

```bash
# Run ESLint
npm run lint

# Fix auto-fixable issues
npm run lint:fix

# Check TypeScript types
npm run typecheck

# Check formatting
npm run format:check

# Run all checks
npm run check-all
```

### Format Code

```bash
# Format all files
npm run format

# Format specific file
npx prettier --write src/components/MyComponent.ts
```

## Code Style Rules

### 1. Type Annotations

Always provide explicit type annotations for function parameters and return types (except when obvious):

```typescript
// ❌ Bad
function processData(data) {
    return data.map(item => item.id);
}

// ✅ Good
function processData(data: DataItem[]): string[] {
    return data.map((item) => item.id);
}

// ✅ Also good (return type inferred)
function add(a: number, b: number) {
    return a + b;  // return type is obviously number
}
```

### 2. Variable Declarations

Use `const` by default, `let` only when reassignment is needed:

```typescript
// ❌ Bad
var count = 0;
let name = 'John';  // Never reassigned

// ✅ Good
const name = 'John';
let count = 0;  // Will be reassigned
```

### 3. Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `class UserManager` |
| Interfaces | PascalCase | `interface UserConfig` |
| Types | PascalCase | `type UserId = string` |
| Functions | camelCase | `function getUserData()` |
| Variables | camelCase | `const userData = {}` |
| Constants | UPPER_SNAKE_CASE | `const MAX_RETRIES = 3` |
| Private fields | camelCase with `#` or `_` prefix | `#privateField` or `_privateMethod()` |

### 4. Unused Variables

Prefix with underscore if intentionally unused:

```typescript
// ❌ Bad - ESLint will warn
function handleEvent(event, index) {
    console.log(event);
}

// ✅ Good
function handleEvent(event: Event, _index: number) {
    console.log(event);
}
```

### 5. String Quotes

Use single quotes for strings, template literals for interpolation:

```typescript
// ❌ Bad
const message = "Hello";
const greeting = "Hello, " + name;

// ✅ Good
const message = 'Hello';
const greeting = `Hello, ${name}`;
```

### 6. Semicolons

Always use semicolons:

```typescript
// ❌ Bad
const value = 42
const name = 'John'

// ✅ Good
const value = 42;
const name = 'John';
```

### 7. Equality Operators

Use strict equality (`===`, `!==`):

```typescript
// ❌ Bad
if (value == null) {}
if (count != 0) {}

// ✅ Good
if (value === null) {}
if (count !== 0) {}
```

### 8. Curly Braces

Always use curly braces for control statements:

```typescript
// ❌ Bad
if (condition) doSomething();

// ✅ Good
if (condition) {
    doSomething();
}
```

### 9. Object/Array Formatting

Use trailing commas in multi-line structures:

```typescript
// ❌ Bad
const user = {
    name: 'John',
    age: 30
};

// ✅ Good
const user = {
    name: 'John',
    age: 30,
};
```

### 10. Function Declarations

Prefer arrow functions for callbacks, regular functions for methods:

```typescript
// ❌ Bad
array.map(function(item) {
    return item.id;
});

// ✅ Good
array.map((item) => item.id);

// ✅ Good for class methods
class MyClass {
    myMethod() {
        // ...
    }
}
```

### 11. Type Safety

Avoid using `any` type:

```typescript
// ❌ Bad
function process(data: any): any {
    return data.value;
}

// ✅ Good
function process(data: DataType): ResultType {
    return data.value;
}

// ✅ Acceptable if truly unknown
function process(data: unknown): ResultType {
    if (isDataType(data)) {
        return data.value;
    }
    throw new Error('Invalid data type');
}
```

### 12. Null Checks

Handle null/undefined explicitly:

```typescript
// ❌ Bad
function getName(user) {
    return user.name;  // Might throw if user is null
}

// ✅ Good
function getName(user: User | null): string | null {
    return user?.name ?? null;
}
```

## Import Organization

### Order

1. External dependencies
2. Internal modules (using @/ alias)
3. Relative imports
4. Types (separate import if needed)

```typescript
// ✅ Good
import { Plugin, showMessage } from 'siyuan';
import DOMPurify from 'dompurify';

import { Logger } from '@/utils/Logger';
import { ErrorHandler } from '@/utils/ErrorHandler';

import { helperFunction } from './helpers';

import type { UserConfig } from '@/types';
```

### Remove Unused Imports

ESLint and TypeScript will detect unused imports:

```typescript
// ❌ Bad
import { Logger } from '@/utils/Logger';
import { ErrorHandler } from '@/utils/ErrorHandler';  // Not used

// ✅ Good
import { Logger } from '@/utils/Logger';
```

## Pre-commit Checks (Recommended)

Consider adding a pre-commit hook using `husky` and `lint-staged`:

```bash
npm install --save-dev husky lint-staged
```

### `.husky/pre-commit`

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx lint-staged
```

### `package.json` (lint-staged config)

```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md}": [
      "prettier --write"
    ]
  }
}
```

## Common Issues & Fixes

### Issue 1: Too many ESLint errors

```bash
# Fix auto-fixable issues first
npm run lint:fix

# Then manually fix remaining issues
npm run lint
```

### Issue 2: Formatting conflicts with ESLint

Solution: Use `eslint-config-prettier` to disable conflicting rules:

```bash
npm install --save-dev eslint-config-prettier
```

Update `.eslintrc.json`:

```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"  // Add this last
  ]
}
```

### Issue 3: Too many `any` warnings

Gradually replace `any` with proper types:

```typescript
// Instead of
function process(data: any) {}

// Use
function process(data: unknown) {
    if (typeof data === 'object' && data !== null) {
        // Type guard
    }
}
```

## VS Code Integration

### Recommended Extensions

- ESLint (`dbaeumer.vscode-eslint`)
- Prettier (`esbenp.prettier-vscode`)

### Settings (`.vscode/settings.json`)

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.validate": ["typescript"],
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

## Migration Checklist

- [ ] Install ESLint and Prettier dependencies
- [ ] Add npm scripts to package.json
- [ ] Run `npm run lint` to see current issues
- [ ] Fix critical issues first (auto-fix with `npm run lint:fix`)
- [ ] Run `npm run format` to format all files
- [ ] Run `npm run typecheck` to verify types
- [ ] Set up pre-commit hooks (optional)
- [ ] Configure VS Code settings

## Related Files

- `.eslintrc.json` - ESLint configuration
- `.prettierrc.json` - Prettier configuration
- `.prettierignore` - Files to exclude from formatting
- `tsconfig.json` - TypeScript configuration

---

**Last Updated**: 2025-01-12
**Status**: Configuration Ready (Dependencies need installation)
