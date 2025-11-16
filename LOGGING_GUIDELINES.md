# Logging Guidelines

## Overview

This project uses a centralized logging system (`src/utils/Logger.ts`) to control log output based on environment (development/production).

## Logger Configuration

The Logger is automatically configured in `src/index.ts` on plugin load:

- **Development**: Log level = DEBUG (all logs shown)
- **Production**: Log level = WARN (only warnings and errors shown)

## Usage

### Import the Logger

```typescript
import { Logger } from '@/utils/Logger';
// OR for scoped logging
import { logger } from '@/utils/Logger';
```

### Basic Logging

Replace `console.log` with appropriate log levels:

```typescript
// ❌ OLD (Console)
console.log('[MyComponent] Initializing...');
console.error('[MyComponent] Failed to load:', error);

// ✅ NEW (Logger)
Logger.debug('Initializing...');  // Only shown in development
Logger.info('Component loaded');  // Informational
Logger.warn('Deprecated feature used');  // Warnings
Logger.error('Failed to load:', error);  // Errors (always shown)
```

### Scoped Logger

For module-specific logging with automatic prefix:

```typescript
import { Logger } from '@/utils/Logger';

const logger = Logger.createScoped('QuickEdit');

logger.debug('Processing selection');  // Output: [ClaudePlugin] [DEBUG] [QuickEdit] Processing selection
logger.error('Failed to apply edit', error);
```

### Convenience Functions

```typescript
import { logger } from '@/utils/Logger';

logger.debug('Debug message');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');

// Change log level dynamically
logger.setLevel(LogLevel.ERROR);  // Only show errors
```

## Log Levels

| Level | When to Use | Shown in Dev | Shown in Prod |
|-------|-------------|--------------|---------------|
| `DEBUG` | Detailed debugging info, function entry/exit | ✅ | ❌ |
| `INFO` | General informational messages | ✅ | ❌ |
| `WARN` | Warnings, deprecated features, recoverable errors | ✅ | ✅ |
| `ERROR` | Errors, exceptions, failures | ✅ | ✅ |

## Environment-Aware Console Wrapper

For quick migration without refactoring, use `devConsole`:

```typescript
import { devConsole } from '@/config/environment';

// ❌ OLD
console.log('Debug info');  // Always shown

// ✅ NEW
devConsole.log('Debug info');  // Only shown in development
devConsole.error('Error');  // Always shown
```

## Migration Examples

### Example 1: Simple Logging

```typescript
// Before
console.log('[UnifiedAIPanel] Rendering markdown');

// After
import { Logger } from '@/utils/Logger';
Logger.debug('Rendering markdown');
```

### Example 2: Error Handling

```typescript
// Before
try {
    await performOperation();
} catch (error) {
    console.error('[Component] Operation failed:', error);
}

// After
import { Logger } from '@/utils/Logger';
try {
    await performOperation();
} catch (error) {
    Logger.error('Operation failed:', error);
}
```

### Example 3: Scoped Logger

```typescript
// Before
class QuickEditManager {
    async process() {
        console.log('[QuickEditManager] Starting process');
        console.log('[QuickEditManager] Selection found');
        console.error('[QuickEditManager] Process failed');
    }
}

// After
import { Logger } from '@/utils/Logger';

class QuickEditManager {
    private logger = Logger.createScoped('QuickEditManager');

    async process() {
        this.logger.debug('Starting process');
        this.logger.debug('Selection found');
        this.logger.error('Process failed');
    }
}
```

### Example 4: Conditional Logging

```typescript
// Before
if (process.env.NODE_ENV === 'development') {
    console.log('Debug data:', data);
}

// After
import { Logger } from '@/utils/Logger';
Logger.debug('Debug data:', data);  // Automatically suppressed in production
```

## Best Practices

### ✅ DO

- Use `Logger.debug()` for debugging information
- Use `Logger.info()` for general informational messages
- Use `Logger.warn()` for warnings and deprecation notices
- Use `Logger.error()` for errors and exceptions
- Use scoped loggers for class/module-specific logging
- Include context in log messages (e.g., variable values, state)

### ❌ DON'T

- Don't use `console.log()` directly (use `Logger.debug()` instead)
- Don't log sensitive information (API keys, passwords, user data)
- Don't log excessively in loops (consider throttling or aggregation)
- Don't use string concatenation (use parameters instead)

```typescript
// ❌ Bad
Logger.debug('User: ' + user.name + ', Age: ' + user.age);

// ✅ Good
Logger.debug('User info:', { name: user.name, age: user.age });
```

## Migration Strategy

Given the large number of files using `console` statements (40+), we recommend a **gradual migration** approach:

### Priority 1: Critical Files (Week 1)
- Entry point: `src/index.ts` ✅ (completed)
- Core components: `QuickEditManager`, `UnifiedAIPanel`, `ClaudeClient`

### Priority 2: Provider Layer (Week 2)
- All AI providers (`src/ai/providers/*.ts`)
- Provider factory (`src/ai/AIProviderFactory.ts`)

### Priority 3: Features (Week 3)
- Settings panels
- Filter pipeline
- Editor components

### Priority 4: Utilities (Week 4)
- Helper functions
- Utilities
- Less critical components

## Production Considerations

- In production, only `WARN` and `ERROR` level logs are shown
- Stack traces are only enabled in development
- Timestamps are only added in development
- Consider adding log persistence for production debugging (see `src/logger/RequestLogger.ts`)

## Configuration

To change log level programmatically:

```typescript
import { Logger, LogLevel } from '@/utils/Logger';

// In development mode, use DEBUG
Logger.setLevel(LogLevel.DEBUG);

// In production, use WARN
Logger.setLevel(LogLevel.WARN);

// Disable all logs
Logger.setLevel(LogLevel.NONE);
```

## Related Files

- `src/utils/Logger.ts` - Logger implementation
- `src/config/environment.ts` - Environment configuration
- `src/logger/RequestLogger.ts` - API request logging (separate system)
- `src/index.ts` - Logger initialization

## FAQ

**Q: Can I still use `console.log` for quick debugging?**
A: Yes, but use `devConsole.log()` instead to ensure it's suppressed in production.

**Q: What if I need to log in production?**
A: Use `Logger.warn()` or `Logger.error()` for important messages that should appear in production.

**Q: How do I enable debug logs in production?**
A: Call `Logger.setLevel(LogLevel.DEBUG)` at runtime (not recommended for end users).

**Q: Should I remove all `console.log` statements?**
A: Gradually replace them with `Logger` calls. Use `devConsole` as a quick migration path.

---

**Last Updated**: 2025-01-12
**Status**: In Progress (Priority 1 completed)
