const NetworkRecorder = require('../../src/network/network-recorder');

describe('NetworkRecorder', () => {
  let recorder;

  beforeEach(() => {
    recorder = new NetworkRecorder();
  });

  // --- isApiRequest ---

  describe('isApiRequest', () => {
    test('returns true for xmlhttprequest type', () => {
      expect(recorder.isApiRequest({ type: 'xmlhttprequest', url: 'https://example.com/page' })).toBe(true);
    });

    test('returns true for fetch type', () => {
      expect(recorder.isApiRequest({ type: 'fetch', url: 'https://example.com/page' })).toBe(true);
    });

    test('returns true for URL containing /api/', () => {
      expect(recorder.isApiRequest({ type: 'document', url: 'https://example.com/api/users' })).toBe(true);
    });

    test('returns true for URL containing /rest/', () => {
      expect(recorder.isApiRequest({ type: 'document', url: 'https://example.com/rest/v1/items' })).toBe(true);
    });

    test('returns true for URL containing /graphql', () => {
      expect(recorder.isApiRequest({ type: 'document', url: 'https://example.com/graphql' })).toBe(true);
    });

    test('returns true for URL containing .json', () => {
      expect(recorder.isApiRequest({ type: 'document', url: 'https://example.com/data.json' })).toBe(true);
    });

    test('returns true for URL containing /v1/', () => {
      expect(recorder.isApiRequest({ type: 'document', url: 'https://example.com/v1/users' })).toBe(true);
    });

    test('returns false for non-API request', () => {
      expect(recorder.isApiRequest({ type: 'stylesheet', url: 'https://example.com/style.css' })).toBe(false);
    });
  });

  // --- shouldCaptureRequest ---

  describe('shouldCaptureRequest', () => {
    test('rejects stylesheet type', () => {
      expect(recorder.shouldCaptureRequest({ type: 'stylesheet', url: 'https://example.com/a.css' })).toBe(false);
    });

    test('rejects font type', () => {
      expect(recorder.shouldCaptureRequest({ type: 'font', url: 'https://example.com/a.woff' })).toBe(false);
    });

    test('rejects image type', () => {
      expect(recorder.shouldCaptureRequest({ type: 'image', url: 'https://example.com/a.png' })).toBe(false);
    });

    test('rejects chrome-extension URL', () => {
      expect(recorder.shouldCaptureRequest({ type: 'fetch', url: 'chrome-extension://abc/page.html' })).toBe(false);
    });

    test('rejects google analytics URL', () => {
      expect(recorder.shouldCaptureRequest({ type: 'fetch', url: 'https://www.google-analytics.com/collect' })).toBe(false);
    });

    test('rejects facebook.net URL', () => {
      expect(recorder.shouldCaptureRequest({ type: 'fetch', url: 'https://connect.facebook.net/sdk.js' })).toBe(false);
    });

    test('accepts fetch type with allowed URL', () => {
      expect(recorder.shouldCaptureRequest({ type: 'fetch', url: 'https://api.example.com/data' })).toBe(true);
    });

    test('accepts xmlhttprequest type', () => {
      expect(recorder.shouldCaptureRequest({ type: 'xmlhttprequest', url: 'https://api.example.com/data' })).toBe(true);
    });

    test('accepts document type', () => {
      expect(recorder.shouldCaptureRequest({ type: 'document', url: 'https://example.com/page' })).toBe(true);
    });

    test('rejects type not in includeTypes', () => {
      expect(recorder.shouldCaptureRequest({ type: 'websocket', url: 'https://example.com/ws' })).toBe(false);
    });
  });

  // --- isGraphQLRequest ---

  describe('isGraphQLRequest', () => {
    test('returns false for null', () => {
      expect(recorder.isGraphQLRequest(null)).toBe(false);
    });

    test('returns true for URL containing /graphql', () => {
      expect(recorder.isGraphQLRequest({ url: 'https://api.example.com/graphql' })).toBe(true);
    });

    test('returns true for application/graphql content type', () => {
      expect(recorder.isGraphQLRequest({
        url: 'https://api.example.com/data',
        requestHeaders: { 'content-type': 'application/graphql' }
      })).toBe(true);
    });

    test('returns true for POST with query field', () => {
      expect(recorder.isGraphQLRequest({
        url: 'https://api.example.com/data',
        method: 'POST',
        requestBody: JSON.stringify({ query: '{ users { id } }' })
      })).toBe(true);
    });

    test('returns true for POST with operationName field', () => {
      expect(recorder.isGraphQLRequest({
        url: 'https://api.example.com/data',
        method: 'POST',
        requestBody: { operationName: 'GetUsers', query: '{ users { id } }' }
      })).toBe(true);
    });

    test('returns false for regular REST request', () => {
      expect(recorder.isGraphQLRequest({
        url: 'https://api.example.com/users',
        method: 'GET'
      })).toBe(false);
    });

    test('returns false for POST with non-GraphQL body', () => {
      expect(recorder.isGraphQLRequest({
        url: 'https://api.example.com/users',
        method: 'POST',
        requestBody: JSON.stringify({ name: 'John', email: 'john@test.com' })
      })).toBe(false);
    });
  });

  // --- extractPathFromUrl ---

  describe('extractPathFromUrl', () => {
    test('extracts pathname from valid URL', () => {
      expect(recorder.extractPathFromUrl('https://example.com/api/v1/users')).toBe('/api/v1/users');
    });

    test('returns "/" for root URL', () => {
      expect(recorder.extractPathFromUrl('https://example.com/')).toBe('/');
    });

    test('strips query params', () => {
      expect(recorder.extractPathFromUrl('https://example.com/api?key=val')).toBe('/api');
    });

    test('returns original string for invalid URL', () => {
      expect(recorder.extractPathFromUrl('not-a-url')).toBe('not-a-url');
    });
  });

  // --- generateNetworkSummary ---

  describe('generateNetworkSummary', () => {
    test('returns zero-valued summary for empty requests', () => {
      const summary = recorder.generateNetworkSummary();
      expect(summary.totalRequests).toBe(0);
      expect(summary.averageResponseTime).toBe(0);
      expect(summary.errorCount).toBe(0);
    });

    test('counts requests by type', () => {
      recorder.networkRequests = [
        { type: 'fetch', url: 'https://a.com/api', statusCode: 200, duration: 100, responseSize: 500 },
        { type: 'fetch', url: 'https://a.com/api2', statusCode: 200, duration: 200, responseSize: 300 },
        { type: 'document', url: 'https://a.com', statusCode: 200, duration: 50, responseSize: 1000 }
      ];
      const summary = recorder.generateNetworkSummary();
      expect(summary.totalRequests).toBe(3);
      expect(summary.requestsByType['fetch']).toBe(2);
      expect(summary.requestsByType['document']).toBe(1);
    });

    test('calculates average response time', () => {
      recorder.networkRequests = [
        { type: 'fetch', url: 'https://a.com', statusCode: 200, duration: 100, responseSize: 0 },
        { type: 'fetch', url: 'https://b.com', statusCode: 200, duration: 300, responseSize: 0 }
      ];
      const summary = recorder.generateNetworkSummary();
      expect(summary.averageResponseTime).toBe(200);
    });
  });

  // --- generateNetworkAssertions ---

  describe('generateNetworkAssertions', () => {
    beforeEach(() => {
      recorder.networkRequests = [
        { type: 'fetch', url: 'https://api.example.com/api/v1/users', method: 'GET', statusCode: 200 }
      ];
    });

    test('generates Playwright assertion with waitForResponse', () => {
      const assertions = recorder.generateNetworkAssertions('playwright');
      expect(assertions.length).toBe(1);
      expect(assertions[0]).toContain('waitForResponse');
      expect(assertions[0]).toContain('/api/v1/users');
      expect(assertions[0]).toContain('200');
    });

    test('generates Cypress assertion with cy.intercept', () => {
      const assertions = recorder.generateNetworkAssertions('cypress');
      expect(assertions.length).toBe(1);
      expect(assertions[0]).toContain('cy.intercept');
      expect(assertions[0]).toContain('GET');
      expect(assertions[0]).toContain('200');
    });

    test('generates Selenium comment for network assertion', () => {
      const assertions = recorder.generateNetworkAssertions('selenium');
      expect(assertions.length).toBe(1);
      expect(assertions[0]).toContain('# API Request');
      expect(assertions[0]).toContain('Note: Network request validation');
    });

    test('returns empty array when no API requests', () => {
      recorder.networkRequests = [
        { type: 'stylesheet', url: 'https://example.com/style.css', method: 'GET', statusCode: 200 }
      ];
      const assertions = recorder.generateNetworkAssertions('playwright');
      expect(assertions.length).toBe(0);
    });

    test('defaults to playwright when no framework specified', () => {
      const assertions = recorder.generateNetworkAssertions();
      expect(assertions[0]).toContain('waitForResponse');
    });
  });

  // --- parseHeaders ---

  describe('parseHeaders', () => {
    test('returns empty object for null', () => {
      expect(recorder.parseHeaders(null)).toEqual({});
    });

    test('lowercases header names', () => {
      const headers = [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Authorization', value: 'Bearer token' }
      ];
      const result = recorder.parseHeaders(headers);
      expect(result['content-type']).toBe('application/json');
      expect(result['authorization']).toBe('Bearer token');
    });
  });
});
