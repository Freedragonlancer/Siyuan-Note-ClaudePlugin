# Error Handling Guidelines

## Overview

This project uses typed error handling with custom error classes for better error categorization and user-friendly error messages.

## Error Types

### Built-in Error Classes

```typescript
import {
    ValidationError,      // Input validation errors
    NetworkError,         // HTTP/network errors
    APIError,            // AI provider API errors
    TimeoutError,        // Request timeout errors
    ConfigurationError,  // Configuration/settings errors
} from '@/utils/ErrorHandler';
```

### When to Use Each Type

| Error Type | Use Case | Example |
|------------|----------|---------|
| `ValidationError` | Invalid user input, data validation failures | Empty required field, invalid format |
| `NetworkError` | HTTP errors, connection failures | 404, 500, network unavailable |
| `APIError` | AI provider errors | Rate limit, invalid API key, model unavailable |
| `TimeoutError` | Request timeouts | API call exceeds time limit |
| `ConfigurationError` | Invalid settings, missing config | Missing API key, invalid baseURL |

## Usage Examples

### Basic Error Handling

```typescript
import { ErrorHandler, ValidationError } from '@/utils/ErrorHandler';

// ❌ OLD (Generic catch)
try {
    await performOperation();
} catch (error) {
    console.error('Operation failed:', error);
}

// ✅ NEW (Typed error handling)
try {
    await performOperation();
} catch (error) {
    ErrorHandler.handle(error, {
        showToUser: true,
        userMessage: '操作失败，请重试',
        context: { operation: 'performOperation' },
    });
}
```

### Throwing Custom Errors

```typescript
// ❌ OLD
if (!apiKey) {
    throw new Error('API key is required');
}

// ✅ NEW
import { ConfigurationError } from '@/utils/ErrorHandler';

if (!apiKey) {
    throw new ConfigurationError('API key is required');
}
```

### Network Error Handling

```typescript
import { NetworkError, ErrorHandler } from '@/utils/ErrorHandler';

async function fetchData(url: string) {
    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new NetworkError(
                `HTTP ${response.status}: ${response.statusText}`,
                response.status
            );
        }

        return await response.json();
    } catch (error) {
        ErrorHandler.handle(error, {
            showToUser: true,
            userMessage: '获取数据失败',
            context: { url },
        });
        return null;
    }
}
```

### API Error Handling

```typescript
import { APIError, TimeoutError, ErrorHandler } from '@/utils/ErrorHandler';

async function callAI(provider: string, prompt: string) {
    try {
        const result = await aiClient.sendMessage(prompt);
        return result;
    } catch (error) {
        if (error instanceof TimeoutError) {
            ErrorHandler.handle(error, {
                showToUser: true,
                userMessage: 'AI 请求超时，请重试',
            });
        } else if (error instanceof APIError) {
            ErrorHandler.handle(error, {
                showToUser: true,
                userMessage: `AI 服务错误: ${error.provider}`,
            });
        } else {
            ErrorHandler.handle(error, {
                showToUser: true,
                userMessage: '未知错误',
            });
        }
        return null;
    }
}
```

### Using Error Wrapper Functions

```typescript
import { ErrorHandler } from '@/utils/ErrorHandler';

// Async function wrapper
const result = await ErrorHandler.wrapAsync(
    async () => {
        return await fetchDataFromAPI();
    },
    {
        showToUser: true,
        userMessage: 'Failed to fetch data',
        log: true,
    }
);

if (result === null) {
    // Error occurred, already handled
    return;
}

// Use result...
```

### Using Decorators

```typescript
import { HandleErrors } from '@/utils/ErrorHandler';

class MyService {
    @HandleErrors({ showToUser: true, userMessage: '处理失败' })
    async processData(data: any) {
        // If this throws, error is automatically handled
        const result = await this.complexOperation(data);
        return result;
    }
}
```

### Type Guards

```typescript
import {
    isNetworkError,
    isAPIError,
    isTimeoutError,
    ErrorHandler,
} from '@/utils/ErrorHandler';

try {
    await operation();
} catch (error) {
    if (isTimeoutError(error)) {
        // Handle timeout specifically
        console.log(`Timeout after ${error.timeoutMs}ms`);
    } else if (isNetworkError(error)) {
        // Handle network error
        console.log(`Network error: ${error.statusCode}`);
    } else if (isAPIError(error)) {
        // Handle API error
        console.log(`API error from ${error.provider}`);
    } else {
        // Generic handling
        ErrorHandler.handle(error);
    }
}
```

## Migration Examples

### Example 1: Simple Error Logging

```typescript
// Before
try {
    await saveSettings();
} catch (error) {
    console.error('[Settings] Failed to save:', error);
}

// After
import { ErrorHandler } from '@/utils/ErrorHandler';

try {
    await saveSettings();
} catch (error) {
    ErrorHandler.handle(error, {
        log: true,
        context: { component: 'Settings', action: 'save' },
    });
}
```

### Example 2: User-Facing Errors

```typescript
// Before
try {
    await applyEdit();
} catch (error) {
    console.error('[QuickEdit] Failed to apply:', error);
    showMessage(`应用修改失败: ${error instanceof Error ? error.message : String(error)}`);
}

// After
import { ErrorHandler } from '@/utils/ErrorHandler';

try {
    await applyEdit();
} catch (error) {
    ErrorHandler.handle(error, {
        showToUser: true,
        userMessage: '应用修改失败',
        context: { component: 'QuickEdit', action: 'apply' },
    });
}
```

### Example 3: API Request with Timeout

```typescript
// Before
try {
    const result = await fetch(url);
    if (!result.ok) {
        throw new Error(`HTTP error: ${result.status}`);
    }
} catch (error) {
    console.error('Fetch failed:', error);
    if (error.name === 'AbortError') {
        throw new Error('Request timeout');
    }
    throw error;
}

// After
import { NetworkError, TimeoutError } from '@/utils/ErrorHandler';

try {
    const result = await fetch(url);
    if (!result.ok) {
        throw new NetworkError(`HTTP error`, result.status);
    }
} catch (error) {
    if (error.name === 'AbortError') {
        throw new TimeoutError('Request timeout', 10000);
    }
    throw error;
}
```

### Example 4: Validation Errors

```typescript
// Before
function validateInput(input: string) {
    if (!input || input.trim() === '') {
        throw new Error('Input cannot be empty');
    }
    if (input.length > 1000) {
        throw new Error('Input too long');
    }
}

// After
import { ValidationError } from '@/utils/ErrorHandler';

function validateInput(input: string) {
    if (!input || input.trim() === '') {
        throw new ValidationError('Input cannot be empty');
    }
    if (input.length > 1000) {
        throw new ValidationError('Input exceeds maximum length (1000 characters)');
    }
}
```

## ErrorHandler Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `showToUser` | boolean | false | Show error message to user via showMessage() |
| `userMessage` | string | error.message | Custom user-facing message |
| `log` | boolean | true | Log error to console/Logger |
| `logLevel` | string | 'error' | Log level: 'debug', 'info', 'warn', 'error' |
| `context` | object | {} | Additional context for debugging |
| `rethrow` | boolean | false | Rethrow error after handling |

## Best Practices

### ✅ DO

- Use specific error types (`ValidationError`, `NetworkError`, etc.)
- Provide user-friendly error messages
- Include context information for debugging
- Log errors with appropriate log levels
- Use type guards to differentiate error types
- Wrap async operations with error handlers

### ❌ DON'T

- Don't use generic `Error` for everything
- Don't catch errors without logging
- Don't expose technical error messages to users
- Don't swallow errors silently
- Don't use `any` type for errors

```typescript
// ❌ Bad
catch (error: any) {  // Don't use 'any'
    // Swallows error silently
}

// ✅ Good
catch (error) {  // Let TypeScript infer 'unknown'
    if (error instanceof NetworkError) {
        // Handle network error
    } else {
        ErrorHandler.handle(error);
    }
}
```

## Common Patterns

### Pattern 1: Try-Catch with Error Handler

```typescript
async function performAction() {
    try {
        const result = await apiCall();
        return result;
    } catch (error) {
        ErrorHandler.handle(error, {
            showToUser: true,
            userMessage: 'Action failed',
            context: { action: 'performAction' },
        });
        return null;
    }
}
```

### Pattern 2: Error Type Differentiation

```typescript
try {
    await operation();
} catch (error) {
    if (isTimeoutError(error)) {
        // Retry logic
        await retry();
    } else if (isNetworkError(error) && error.statusCode === 429) {
        // Rate limit handling
        await backoff();
    } else {
        // Generic handling
        ErrorHandler.handle(error, { showToUser: true });
    }
}
```

### Pattern 3: Validation with Custom Errors

```typescript
function validateConfig(config: Config): asserts config is ValidConfig {
    if (!config.apiKey) {
        throw new ConfigurationError('API key is required');
    }
    if (!config.model) {
        throw new ConfigurationError('Model selection is required');
    }
    if (config.temperature < 0 || config.temperature > 2) {
        throw new ValidationError('Temperature must be between 0 and 2');
    }
}
```

## Integration with Logger

ErrorHandler automatically uses Logger for error logging:

```typescript
// ErrorHandler calls Logger.error() internally
ErrorHandler.handle(error, {
    log: true,
    logLevel: 'error',  // Can be 'debug', 'info', 'warn', 'error'
    context: { /* additional data */ },
});
```

## Migration Strategy

### Priority 1: Critical Paths (Week 1)
- API calls (providers, ClaudeClient)
- User-facing operations (QuickEdit, Chat)
- Configuration/Settings loading

### Priority 2: Core Features (Week 2)
- File operations
- Data processing
- UI components

### Priority 3: Utilities (Week 3)
- Helper functions
- Less critical components

## Related Files

- `src/utils/ErrorHandler.ts` - Error handling utilities
- `src/utils/Logger.ts` - Logging system (used by ErrorHandler)
- `src/config/environment.ts` - Environment configuration

---

**Last Updated**: 2025-01-12
**Status**: Infrastructure Complete
