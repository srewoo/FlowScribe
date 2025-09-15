/**
 * FlowScribe Network Recording Engine
 * Captures network requests/responses during user interactions
 * Integrates with test generation for API testing
 */

class NetworkRecorder {
  constructor() {
    this.isRecording = false;
    this.networkRequests = [];
    this.requestMap = new Map(); // Maps request IDs to requests
    this.filters = {
      excludeTypes: ['stylesheet', 'font', 'image', 'media'],
      includeTypes: ['fetch', 'xmlhttprequest', 'document', 'script'],
      excludeUrls: [
        /chrome-extension:\/\//,
        /data:image\//,
        /\.woff|\.ttf|\.eot/,
        /google.*analytics/,
        /facebook\.net/,
        /doubleclick\.net/
      ]
    };
    this.captureSettings = {
      captureHeaders: true,
      captureRequestBody: true,
      captureResponseBody: true,
      maxBodySize: 100000, // 100KB limit
      captureRedirects: true
    };
  }

  /**
   * Initialize network recording
   */
  async init() {
    if (!chrome.webRequest) {
      console.warn('Network recording requires webRequest permission');
      return false;
    }

    await this.setupNetworkListeners();
    console.log('📡 Network recorder initialized');
    return true;
  }

  /**
   * Start recording network requests
   */
  async startRecording() {
    this.isRecording = true;
    this.networkRequests = [];
    this.requestMap.clear();
    
    console.log('🔴 Network recording started');
    
    // Clear any existing listeners to avoid duplicates
    await this.removeNetworkListeners();
    await this.setupNetworkListeners();
    
    return true;
  }

  /**
   * Stop recording network requests
   */
  async stopRecording() {
    this.isRecording = false;
    console.log(`🔴 Network recording stopped. Captured ${this.networkRequests.length} requests`);
    
    return {
      requests: this.networkRequests,
      summary: this.generateNetworkSummary()
    };
  }

  /**
   * Setup network event listeners
   */
  async setupNetworkListeners() {
    if (!chrome.webRequest) return;

    const filters = { urls: ['<all_urls>'] };
    // Note: Manifest V3 doesn't support requestBody without webRequestBlocking
    // We'll capture what we can without blocking permissions
    const options = ['responseHeaders'];

    // Listen for request start
    chrome.webRequest.onBeforeRequest.addListener(
      this.handleRequestStart.bind(this),
      filters
      // No options - request body not available in Manifest V3 without blocking
    );

    // Listen for request headers
    chrome.webRequest.onBeforeSendHeaders.addListener(
      this.handleRequestHeaders.bind(this),
      filters,
      ['requestHeaders']
    );

    // Listen for response headers
    chrome.webRequest.onHeadersReceived.addListener(
      this.handleResponseHeaders.bind(this),
      filters,
      ['responseHeaders']
    );

    // Listen for request completion
    chrome.webRequest.onCompleted.addListener(
      this.handleRequestComplete.bind(this),
      filters,
      ['responseHeaders']
    );

    // Listen for request errors
    chrome.webRequest.onErrorOccurred.addListener(
      this.handleRequestError.bind(this),
      filters
    );
  }

  /**
   * Remove network event listeners
   */
  async removeNetworkListeners() {
    if (!chrome.webRequest) return;

    if (chrome.webRequest.onBeforeRequest.hasListener(this.handleRequestStart)) {
      chrome.webRequest.onBeforeRequest.removeListener(this.handleRequestStart);
    }
    if (chrome.webRequest.onBeforeSendHeaders.hasListener(this.handleRequestHeaders)) {
      chrome.webRequest.onBeforeSendHeaders.removeListener(this.handleRequestHeaders);
    }
    if (chrome.webRequest.onHeadersReceived.hasListener(this.handleResponseHeaders)) {
      chrome.webRequest.onHeadersReceived.removeListener(this.handleResponseHeaders);
    }
    if (chrome.webRequest.onCompleted.hasListener(this.handleRequestComplete)) {
      chrome.webRequest.onCompleted.removeListener(this.handleRequestComplete);
    }
    if (chrome.webRequest.onErrorOccurred.hasListener(this.handleRequestError)) {
      chrome.webRequest.onErrorOccurred.removeListener(this.handleRequestError);
    }
  }

  /**
   * Handle request start
   */
  handleRequestStart(details) {
    if (!this.isRecording || !this.shouldCaptureRequest(details)) {
      return;
    }

    const request = {
      id: details.requestId,
      url: details.url,
      method: details.method,
      type: details.type,
      timestamp: Date.now(),
      startTime: details.timeStamp,
      tabId: details.tabId,
      frameId: details.frameId,
      parentFrameId: details.parentFrameId,
      requestBody: null, // Not available in Manifest V3 without blocking permissions
      status: 'pending'
    };

    this.requestMap.set(details.requestId, request);
  }

  /**
   * Handle request headers
   */
  handleRequestHeaders(details) {
    if (!this.isRecording) return;

    const request = this.requestMap.get(details.requestId);
    if (!request) return;

    if (this.captureSettings.captureHeaders) {
      request.requestHeaders = this.parseHeaders(details.requestHeaders);
    }
  }

  /**
   * Handle response headers
   */
  handleResponseHeaders(details) {
    if (!this.isRecording) return;

    const request = this.requestMap.get(details.requestId);
    if (!request) return;

    request.statusCode = details.statusCode;
    request.statusLine = details.statusLine;
    
    if (this.captureSettings.captureHeaders) {
      request.responseHeaders = this.parseHeaders(details.responseHeaders);
    }
  }

  /**
   * Handle request completion
   */
  handleRequestComplete(details) {
    if (!this.isRecording) return;

    const request = this.requestMap.get(details.requestId);
    if (!request) return;

    request.status = 'completed';
    request.endTime = details.timeStamp;
    request.duration = details.timeStamp - request.startTime;
    request.fromCache = details.fromCache || false;

    // Try to capture response body if possible
    if (this.captureSettings.captureResponseBody && this.shouldCaptureResponseBody(request)) {
      this.captureResponseBody(request);
    }

    // Add to network requests array
    this.networkRequests.push(request);
    this.requestMap.delete(details.requestId);
  }

  /**
   * Handle request error
   */
  handleRequestError(details) {
    if (!this.isRecording) return;

    const request = this.requestMap.get(details.requestId);
    if (!request) return;

    request.status = 'error';
    request.error = details.error;
    request.endTime = details.timeStamp;
    request.duration = details.timeStamp - request.startTime;

    this.networkRequests.push(request);
    this.requestMap.delete(details.requestId);
  }

  /**
   * Determine if request should be captured
   */
  shouldCaptureRequest(details) {
    // Skip excluded resource types
    if (this.filters.excludeTypes.includes(details.type)) {
      return false;
    }

    // Skip excluded URLs
    for (const excludePattern of this.filters.excludeUrls) {
      if (excludePattern.test(details.url)) {
        return false;
      }
    }

    // Only include specific types if specified
    if (this.filters.includeTypes.length > 0) {
      return this.filters.includeTypes.includes(details.type);
    }

    return true;
  }

  /**
   * Parse request body (Note: Limited in Manifest V3)
   */
  parseRequestBody(requestBody) {
    // Note: Request body is not available in Manifest V3 without webRequestBlocking
    if (!requestBody || !this.captureSettings.captureRequestBody) {
      return null;
    }

    let body = null;

    if (requestBody.raw) {
      // Handle raw request body
      const decoder = new TextDecoder();
      const rawData = requestBody.raw.map(data => {
        if (data.bytes) {
          return decoder.decode(new Uint8Array(data.bytes));
        }
        return data.file || '';
      }).join('');
      
      if (rawData.length <= this.captureSettings.maxBodySize) {
        body = {
          type: 'raw',
          data: rawData
        };
      }
    } else if (requestBody.formData) {
      // Handle form data
      body = {
        type: 'formData',
        data: requestBody.formData
      };
    }

    return body;
  }

  /**
   * Parse HTTP headers
   */
  parseHeaders(headers) {
    if (!headers) return {};

    const headerObj = {};
    headers.forEach(header => {
      headerObj[header.name.toLowerCase()] = header.value;
    });

    return headerObj;
  }

  /**
   * Check if response body should be captured
   */
  shouldCaptureResponseBody(request) {
    const contentType = request.responseHeaders?.['content-type'] || '';
    
    // Capture JSON, XML, HTML, and text responses
    const capturableTypes = [
      'application/json',
      'application/xml',
      'text/html',
      'text/plain',
      'text/xml'
    ];

    return capturableTypes.some(type => contentType.includes(type));
  }

  /**
   * Attempt to capture response body (this is complex in Chrome extensions)
   */
  async captureResponseBody(request) {
    // Note: Response body capture is limited in Chrome extensions
    // This would typically require DevTools API or content script injection
    try {
      // For now, we'll mark it as attempted
      request.responseBodyCaptured = false;
      request.responseBodyNote = 'Response body capture requires DevTools API';
    } catch (error) {
      console.warn('Failed to capture response body:', error);
    }
  }

  /**
   * Generate network summary
   */
  generateNetworkSummary() {
    const summary = {
      totalRequests: this.networkRequests.length,
      requestsByType: {},
      requestsByStatus: {},
      averageResponseTime: 0,
      totalDataTransferred: 0,
      errorCount: 0,
      apiRequests: []
    };

    let totalTime = 0;

    this.networkRequests.forEach(request => {
      // Count by type
      summary.requestsByType[request.type] = (summary.requestsByType[request.type] || 0) + 1;

      // Count by status
      const statusCategory = request.status === 'completed' ? 
        Math.floor(request.statusCode / 100) * 100 : request.status;
      summary.requestsByStatus[statusCategory] = (summary.requestsByStatus[statusCategory] || 0) + 1;

      // Calculate average response time
      if (request.duration) {
        totalTime += request.duration;
      }

      // Count errors
      if (request.status === 'error' || (request.statusCode && request.statusCode >= 400)) {
        summary.errorCount++;
      }

      // Identify API requests
      if (this.isApiRequest(request)) {
        summary.apiRequests.push({
          url: request.url,
          method: request.method,
          statusCode: request.statusCode,
          duration: request.duration
        });
      }
    });

    if (summary.totalRequests > 0) {
      summary.averageResponseTime = totalTime / summary.totalRequests;
    }

    return summary;
  }

  /**
   * Determine if request is an API call
   */
  isApiRequest(request) {
    const apiIndicators = [
      'xmlhttprequest',
      'fetch'
    ];

    const urlIndicators = [
      '/api/',
      '/rest/',
      '/graphql',
      'api.',
      '.json',
      '/v1/',
      '/v2/'
    ];

    if (apiIndicators.includes(request.type)) {
      return true;
    }

    return urlIndicators.some(indicator => request.url.includes(indicator));
  }

  /**
   * Get requests for specific tab
   */
  getRequestsForTab(tabId) {
    return this.networkRequests.filter(request => request.tabId === tabId);
  }

  /**
   * Get API requests only
   */
  getApiRequests() {
    return this.networkRequests.filter(request => this.isApiRequest(request));
  }

  /**
   * Generate test assertions for network requests
   */
  generateNetworkAssertions(framework = 'playwright') {
    const apiRequests = this.getApiRequests();
    const assertions = [];

    apiRequests.forEach((request, index) => {
      switch (framework) {
        case 'playwright':
          assertions.push(this.generatePlaywrightNetworkAssertion(request, index));
          break;
        case 'cypress':
          assertions.push(this.generateCypressNetworkAssertion(request, index));
          break;
        case 'selenium':
          assertions.push(this.generateSeleniumNetworkAssertion(request, index));
          break;
      }
    });

    return assertions;
  }

  generatePlaywrightNetworkAssertion(request, index) {
    return `
  // API Request ${index + 1}: ${request.method} ${request.url}
  const request${index} = await page.waitForResponse(response => 
    response.url().includes('${this.extractPathFromUrl(request.url)}') && 
    response.request().method() === '${request.method}'
  );
  expect(request${index}.status()).toBe(${request.statusCode});`;
  }

  generateCypressNetworkAssertion(request, index) {
    return `
  // API Request ${index + 1}: ${request.method} ${request.url}
  cy.intercept('${request.method}', '*${this.extractPathFromUrl(request.url)}*').as('apiRequest${index}');
  cy.wait('@apiRequest${index}').then((interception) => {
    expect(interception.response.statusCode).to.equal(${request.statusCode});
  });`;
  }

  generateSeleniumNetworkAssertion(request, index) {
    return `
# API Request ${index + 1}: ${request.method} ${request.url}
# Note: Network request validation in Selenium requires additional setup
# Consider using browser logs or proxy tools for API testing`;
  }

  extractPathFromUrl(url) {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  }

  /**
   * Export network data
   */
  exportNetworkData(format = 'json') {
    const data = {
      metadata: {
        recordingStart: this.networkRequests[0]?.timestamp,
        recordingEnd: this.networkRequests[this.networkRequests.length - 1]?.timestamp,
        totalRequests: this.networkRequests.length,
        exportedAt: Date.now()
      },
      requests: this.networkRequests,
      summary: this.generateNetworkSummary()
    };

    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);
      case 'har':
        return this.convertToHAR(data);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Convert to HAR (HTTP Archive) format
   */
  convertToHAR(data) {
    const har = {
      log: {
        version: '1.2',
        creator: {
          name: 'FlowScribe',
          version: '1.0.0'
        },
        entries: data.requests.map(request => ({
          startedDateTime: new Date(request.timestamp).toISOString(),
          time: request.duration || 0,
          request: {
            method: request.method,
            url: request.url,
            headers: this.objectToHARHeaders(request.requestHeaders || {}),
            postData: request.requestBody ? {
              mimeType: 'application/json',
              text: JSON.stringify(request.requestBody)
            } : undefined
          },
          response: {
            status: request.statusCode || 0,
            statusText: request.statusLine || '',
            headers: this.objectToHARHeaders(request.responseHeaders || {}),
            content: {
              size: 0,
              mimeType: request.responseHeaders?.['content-type'] || 'text/plain'
            }
          },
          cache: {},
          timings: {
            wait: request.duration || 0,
            receive: 0
          }
        }))
      }
    };

    return JSON.stringify(har, null, 2);
  }

  objectToHARHeaders(headerObj) {
    return Object.entries(headerObj).map(([name, value]) => ({
      name,
      value: String(value)
    }));
  }

  /**
   * Clear recorded network data
   */
  clearNetworkData() {
    this.networkRequests = [];
    this.requestMap.clear();
  }

  /**
   * Get network recording status
   */
  getRecordingStatus() {
    return {
      isRecording: this.isRecording,
      requestCount: this.networkRequests.length,
      settings: this.captureSettings
    };
  }

  /**
   * Update capture settings
   */
  updateCaptureSettings(newSettings) {
    this.captureSettings = { ...this.captureSettings, ...newSettings };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NetworkRecorder;
} else {
  window.NetworkRecorder = NetworkRecorder;
}