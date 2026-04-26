import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement ResizeObserver — stub for any UI tests that need it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;
