// Global mocks for Chrome extension APIs
global.chrome = {
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined)
    },
    sync: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined)
    }
  },
  webRequest: {
    onBeforeRequest: { addListener: jest.fn(), removeListener: jest.fn() },
    onCompleted: { addListener: jest.fn(), removeListener: jest.fn() },
    onErrorOccurred: { addListener: jest.fn(), removeListener: jest.fn() },
    onBeforeSendHeaders: { addListener: jest.fn(), removeListener: jest.fn() },
    onHeadersReceived: { addListener: jest.fn(), removeListener: jest.fn() }
  },
  runtime: {
    onMessage: { addListener: jest.fn() },
    sendMessage: jest.fn()
  },
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn()
  }
};

// Mock window for modules that check for it
global.window = global;

// Suppress console noise during tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn()
};
