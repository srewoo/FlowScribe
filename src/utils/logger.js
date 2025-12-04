/**
 * FlowScribe Logger Utility
 * Conditional logging that can be disabled in production
 */

// Set to false for production builds
const DEBUG_MODE = false;

const Logger = {
  /**
   * Log info messages (only in debug mode)
   */
  log(...args) {
    if (DEBUG_MODE) {
      console.log('[FlowScribe]', ...args);
    }
  },

  /**
   * Log warning messages (only in debug mode)
   */
  warn(...args) {
    if (DEBUG_MODE) {
      console.warn('[FlowScribe]', ...args);
    }
  },

  /**
   * Log error messages (always shown - errors are important)
   */
  error(...args) {
    console.error('[FlowScribe]', ...args);
  },

  /**
   * Log debug messages (only in debug mode)
   */
  debug(...args) {
    if (DEBUG_MODE) {
      console.debug('[FlowScribe]', ...args);
    }
  }
};

// Export for ES modules
export default Logger;

// Also expose globally for non-module scripts
if (typeof window !== 'undefined') {
  window.FlowScribeLogger = Logger;
}
