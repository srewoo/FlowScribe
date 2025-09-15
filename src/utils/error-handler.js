// FlowScribe Error Handler
class ErrorHandler {
  constructor() {
    this.errorLog = [];
    this.maxErrors = 100;
    this.setupGlobalErrorHandlers();
  }

  setupGlobalErrorHandlers() {
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (e) => this.handleError({
        type: 'UNHANDLED_ERROR', message: e.message, error: e.error
      }));
      window.addEventListener('unhandledrejection', (e) => this.handleError({
        type: 'UNHANDLED_REJECTION', message: e.reason?.message || 'Promise rejection', error: e.reason
      }));
    }
  }

  handleError(errorInfo, context = 'unknown') {
    const error = {
      id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(), 
      type: errorInfo.type || 'UNKNOWN_ERROR',
      message: errorInfo.message || 'Unknown error', 
      context, 
      ...errorInfo
    };
    
    this.errorLog.push(error);
    if (this.errorLog.length > this.maxErrors) this.errorLog = this.errorLog.slice(-this.maxErrors);
    
    console.error(`[FlowScribe] ${error.type}: ${error.message}`, error);
    return error;
  }

  async safeExecute(fn, fallback = null) {
    try { 
      return await fn(); 
    } catch (error) {
      this.handleError({ type: 'SAFE_EXECUTE_ERROR', message: error.message, error });
      return fallback;
    }
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = ErrorHandler;
else if (typeof window !== 'undefined') window.ErrorHandler = ErrorHandler;
else self.ErrorHandler = ErrorHandler;
