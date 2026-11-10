import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, vi } from 'vitest';

beforeEach(() => {
  // Never forward an unhandled request to a running app or production.
  vi.stubGlobal('fetch', vi.fn(() => {
    throw new Error('Network disabled: install a synthetic API handler in this test.');
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
