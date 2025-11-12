/**
 * Vitest setup file
 * Runs before all tests
 */

import { beforeAll, afterAll, vi } from 'vitest';

// Global test setup
beforeAll(() => {
    // Mock console methods to reduce noise in test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Keep console.error for debugging test failures
});

afterAll(() => {
    // Cleanup
    vi.restoreAllMocks();
});

// Mock global objects if needed
global.localStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
};

// Export common test utilities
export const createMockMessage = (role: 'user' | 'assistant', content: string) => ({
    role,
    content,
});

export const createMockAIModelConfig = (overrides = {}) => ({
    provider: 'anthropic' as const,
    modelId: 'claude-3-5-sonnet-20241022',
    apiKey: 'sk-ant-test-key-123',
    baseURL: undefined,
    maxTokens: 1024,
    temperature: 0.7,
    ...overrides,
});
