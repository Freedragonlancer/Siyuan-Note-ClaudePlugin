# Test Suite for SiYuan Claude Assistant Plugin

This directory contains comprehensive tests for the multi-AI platform integration.

## Directory Structure

```
tests/
├── setup.ts                          # Global test setup and utilities
├── unit/                             # Unit tests (isolated components)
│   ├── BaseAIProvider.test.ts       # BaseAIProvider tests
│   └── providers/                   # Provider-specific tests
│       ├── AnthropicProvider.test.ts
│       ├── OpenAIProvider.test.ts
│       ├── GeminiProvider.test.ts
│       ├── XAIProvider.test.ts
│       └── DeepSeekProvider.test.ts
├── integration/                     # Integration tests (multiple components)
│   └── provider-switching.test.ts  # Provider switching scenarios
└── README.md                        # This file
```

## Running Tests

### All Tests
```bash
npm test                    # Run all tests in watch mode
npm run test:unit          # Run only unit tests
npm run test:integration   # Run only integration tests
```

### With Coverage
```bash
npm run test:coverage      # Run tests with coverage report
```

### With UI
```bash
npm run test:ui            # Open Vitest UI dashboard
```

## Test Categories

### Unit Tests
**Location:** `tests/unit/`
**Purpose:** Test individual components in isolation
**Scope:**
- Provider configuration validation
- API response parsing
- Error handling
- Edge cases (empty inputs, malformed data, etc.)

**Example:**
```typescript
describe('AnthropicProvider', () => {
    it('should reject empty API key', () => {
        expect(() => new AnthropicProvider({
            apiKey: '',
            // ...
        })).toThrow('API key is required');
    });
});
```

### Integration Tests
**Location:** `tests/integration/`
**Purpose:** Test multiple components working together
**Scope:**
- Provider switching workflows
- Configuration management
- Request lifecycle (with mocked APIs)
- Concurrent request handling

**Example:**
```typescript
describe('Provider Switching', () => {
    it('should cancel active request when switching providers', async () => {
        // Start request with Provider A
        // Switch to Provider B mid-request
        // Verify Provider A request is cancelled
    });
});
```

## Mocking Strategy

### HTTP Requests (Nock)
We use [nock](https://github.com/nock/nock) to mock HTTP requests to AI provider APIs.

**Example:**
```typescript
import nock from 'nock';

nock('https://api.anthropic.com')
    .post('/v1/messages')
    .reply(200, {
        content: [{ type: 'text', text: 'Hello!' }],
    });
```

### DOM Environment (Happy-DOM)
We use [happy-dom](https://github.com/capricorn86/happy-dom) for lightweight DOM mocking.

**Configured in:** `vitest.config.ts`

### Global Mocks
Common mocks are defined in `tests/setup.ts`:
- `localStorage`
- `console` methods (to reduce noise)

## Test Utilities

### Helper Functions (tests/setup.ts)
```typescript
// Create mock message
const msg = createMockMessage('user', 'Hello');

// Create mock AI config
const config = createMockAIModelConfig({
    provider: 'anthropic',
    apiKey: 'test-key',
});
```

## Edge Cases to Test

### Configuration Validation
- ✅ Empty API key
- ✅ Whitespace-only API key
- ✅ Invalid model IDs
- ✅ Malformed baseURL

### API Responses
- ✅ Malformed JSON
- ✅ Missing required fields
- ✅ Empty response body
- ✅ Partial response (streaming cut off)

### Network Errors
- ✅ 401 Authentication error
- ✅ 429 Rate limit error
- ✅ 500 Server error
- ✅ Network timeout
- ✅ Connection refused

### Concurrency
- ✅ Rapid provider switching
- ✅ Concurrent requests
- ✅ Request cancellation (AbortSignal)

### Provider-Specific
- ✅ Anthropic: baseURL normalization (/v1 stripping)
- ✅ DeepSeek: temperature override for reasoning models
- ✅ Gemini: system prompt injection

## Coverage Goals

- **Overall:** 80%+
- **Critical paths:** 90%+
- **Provider implementations:** 85%+
- **Error handling:** 95%+

## CI/CD Integration

### GitHub Actions
Tests should run on:
- Pull requests
- Pushes to main branch
- Before releases

**Example workflow:**
```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:coverage
```

## Debugging Tests

### Run specific test file
```bash
npx vitest tests/unit/providers/AnthropicProvider.test.ts
```

### Run specific test case
```bash
npx vitest -t "should reject empty API key"
```

### Enable verbose logging
```typescript
// In test file
import { vi } from 'vitest';

// Restore console.log for debugging
vi.spyOn(console, 'log').mockRestore();
```

## Best Practices

1. **Isolation:** Each test should be independent
2. **Cleanup:** Use `beforeEach`/`afterEach` to clean up state
3. **Mocking:** Mock external dependencies (HTTP, file system)
4. **Assertions:** Use clear, specific assertions
5. **Edge Cases:** Test both happy path and error cases
6. **Readability:** Use descriptive test names

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Nock Documentation](https://github.com/nock/nock)
- [Happy-DOM Documentation](https://github.com/capricorn86/happy-dom)
