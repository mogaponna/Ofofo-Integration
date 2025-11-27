// Preload script for Electron
const { contextBridge, ipcRenderer, shell } = require('electron');

// CRITICAL: URL/searchParams polyfill - must run BEFORE any other code
// This fixes the "Cannot read properties of undefined (reading 'searchParams')" error
// in packaged Electron apps when using file:// protocol
(function() {
  'use strict';
  if (typeof window === 'undefined') return;
  
  // Store original URL constructor
  const OriginalURL = window.URL;
  
  // Ensure URLSearchParams exists
  if (typeof window.URLSearchParams === 'undefined') {
    window.URLSearchParams = function(init) {
      this.params = new Map();
      if (init) {
        if (typeof init === 'string') {
          init = init.startsWith('?') ? init.slice(1) : init;
          init.split('&').forEach(function(pair) {
            const parts = pair.split('=');
            const key = decodeURIComponent(parts[0] || '');
            const value = decodeURIComponent(parts[1] || '');
            if (key) this.params.set(key, value);
          }.bind(this));
        } else if (Array.isArray(init)) {
          init.forEach(function(pair) {
            this.params.set(pair[0], pair[1]);
          }.bind(this));
        } else if (init instanceof URLSearchParams) {
          init.forEach(function(value, key) {
            this.params.set(key, value);
          }.bind(this));
        } else if (typeof init === 'object') {
          Object.keys(init).forEach(function(key) {
            this.params.set(key, init[key]);
          }.bind(this));
        }
      }
      this.get = function(name) { return this.params.get(name) || null; };
      this.set = function(name, value) { this.params.set(name, value); };
      this.has = function(name) { return this.params.has(name); };
      this.delete = function(name) { this.params.delete(name); };
      this.append = function(name, value) {
        const existing = this.params.get(name);
        this.params.set(name, existing ? existing + ',' + value : value);
      };
      this.toString = function() {
        const pairs = [];
        this.params.forEach(function(value, key) {
          pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
        });
        return pairs.join('&');
      };
      this.forEach = function(callback) {
        this.params.forEach(callback);
      };
      this.entries = function() { return this.params.entries(); };
      this.keys = function() { return this.params.keys(); };
      this.values = function() { return this.params.values(); };
    };
  }
  
  // Override URL constructor to ensure searchParams is always available
  if (OriginalURL) {
    const URLWrapper = function(url, base) {
      try {
        const urlInstance = new OriginalURL(url, base);
        
        // Ensure searchParams exists - add it if missing
        if (!urlInstance.searchParams) {
          Object.defineProperty(urlInstance, 'searchParams', {
            get: function() {
              return new URLSearchParams(this.search || '');
            },
            enumerable: true,
            configurable: true
          });
        }
        
        return urlInstance;
      } catch (error) {
        console.error('URL constructor error:', error, 'url:', url, 'base:', base);
        // Try to create a minimal URL object as fallback
        try {
          const fallbackUrl = Object.create(OriginalURL.prototype);
          const urlStr = String(url);
          const parts = urlStr.split('?');
          fallbackUrl.href = urlStr;
          fallbackUrl.pathname = parts[0] || '';
          fallbackUrl.search = parts[1] ? '?' + parts[1] : '';
          fallbackUrl.searchParams = new URLSearchParams(parts[1] || '');
          return fallbackUrl;
        } catch (fallbackError) {
          console.error('URL fallback also failed:', fallbackError);
          throw error;
        }
      }
    };
    
    // Copy prototype and static methods
    URLWrapper.prototype = OriginalURL.prototype;
    Object.setPrototypeOf(URLWrapper, OriginalURL);
    
    // Copy static methods
    const staticMethods = ['canParse', 'createObjectURL', 'parse', 'revokeObjectURL'];
    staticMethods.forEach(function(method) {
      if (typeof OriginalURL[method] === 'function') {
        URLWrapper[method] = OriginalURL[method];
      }
    });
    
    window.URL = URLWrapper;
  }
  
  // Ensure window.location.searchParams works
  try {
    if (window.location && !window.location.searchParams) {
      Object.defineProperty(window.location, 'searchParams', {
        get: function() {
          try {
            const url = new URL(window.location.href);
            return url.searchParams;
          } catch (e) {
            return new URLSearchParams(window.location.search || '');
          }
        },
        enumerable: true,
        configurable: true
      });
    }
  } catch (e) {
    console.warn('Could not add searchParams to window.location:', e);
  }
  
  // Add defensive wrapper for common URL operations that might fail
  // This catches cases where libraries try to access searchParams on undefined
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  
  // Intercept and fix common URL-related errors
  window.addEventListener('error', function(event) {
    if (event.message && event.message.includes('searchParams')) {
      console.warn('[Preload] Caught searchParams error, attempting to fix:', event.message);
      // Try to prevent the error from breaking the app
      event.preventDefault();
      return false;
    }
  }, true);
  
  console.log('[Preload] URL/searchParams polyfill initialized');
})();

// CRITICAL: Inject polyfill into renderer context BEFORE any modules load
// This ensures the polyfill is available when the renderer process starts
contextBridge.exposeInMainWorld('__URL_POLYFILL_READY__', true);

// Also inject the polyfill code directly into the page before it loads
// This runs in the renderer context, not the preload context
const injectPolyfillScript = `
(function() {
  'use strict';
  if (typeof window === 'undefined') return;
  
  // Store original URL constructor
  const OriginalURL = window.URL;
  if (!OriginalURL) return;
  
  // Ensure URLSearchParams exists
  if (typeof window.URLSearchParams === 'undefined') {
    window.URLSearchParams = function(init) {
      this.params = new Map();
      if (init) {
        if (typeof init === 'string') {
          init = init.startsWith('?') ? init.slice(1) : init;
          init.split('&').forEach(function(pair) {
            const parts = pair.split('=');
            const key = decodeURIComponent(parts[0] || '');
            const value = decodeURIComponent(parts[1] || '');
            if (key) this.params.set(key, value);
          }.bind(this));
        }
      }
      this.get = function(name) { return this.params.get(name) || null; };
      this.set = function(name, value) { this.params.set(name, value); };
      this.has = function(name) { return this.params.has(name); };
      this.delete = function(name) { this.params.delete(name); };
      this.append = function(name, value) {
        const existing = this.params.get(name);
        this.params.set(name, existing ? existing + ',' + value : value);
      };
      this.toString = function() {
        const pairs = [];
        this.params.forEach(function(value, key) {
          pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
        });
        return pairs.join('&');
      };
      this.forEach = function(callback) {
        this.params.forEach(callback);
      };
    };
  }
  
  // Override URL constructor with defensive checks
  window.URL = function(url, base) {
    if (!url) {
      console.error('[Polyfill] URL constructor called with undefined/null url');
      throw new TypeError('Failed to construct URL: Invalid URL');
    }
    
    try {
      const urlInstance = new OriginalURL(url, base);
      
      // Defensive check: ensure urlInstance is not undefined
      if (!urlInstance) {
        console.error('[Polyfill] URL constructor returned undefined for:', url);
        throw new TypeError('URL constructor returned undefined');
      }
      
      // Ensure searchParams exists - add it if missing
      if (!urlInstance.searchParams) {
        Object.defineProperty(urlInstance, 'searchParams', {
          get: function() {
            return new URLSearchParams(this.search || '');
          },
          enumerable: true,
          configurable: true
        });
      }
      
      return urlInstance;
    } catch (error) {
      console.error('[Polyfill] URL constructor error:', error, 'url:', url, 'base:', base);
      throw error;
    }
  };
  
  // Copy prototype
  window.URL.prototype = OriginalURL.prototype;
  Object.setPrototypeOf(window.URL, OriginalURL);
  
  // Copy static methods
  ['canParse', 'createObjectURL', 'parse', 'revokeObjectURL'].forEach(function(method) {
    if (typeof OriginalURL[method] === 'function') {
      window.URL[method] = OriginalURL[method];
    }
  });
  
  // Ensure window.location.searchParams works
  try {
    if (window.location && !window.location.searchParams) {
      Object.defineProperty(window.location, 'searchParams', {
        get: function() {
          try {
            const url = new URL(window.location.href);
            return url ? url.searchParams : new URLSearchParams(window.location.search || '');
          } catch (e) {
            return new URLSearchParams(window.location.search || '');
          }
        },
        enumerable: true,
        configurable: true
      });
    }
  } catch (e) {
    console.warn('[Polyfill] Could not add searchParams to window.location:', e);
  }
  
  // Global error handler for searchParams errors
  window.addEventListener('error', function(event) {
    if (event.message && event.message.includes('searchParams')) {
      console.error('[Polyfill] Caught searchParams error:', event.message);
      console.error('[Polyfill] Error source:', event.filename, 'line:', event.lineno);
      // Don't prevent default - let it be caught by React error boundary
    }
  }, true);
  
  console.log('[Polyfill] URL/searchParams polyfill injected into renderer');
})();
`;

// Inject the script into the page when DOM is ready
// This runs in the renderer context
if (typeof document !== 'undefined' && document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    const script = document.createElement('script');
    script.textContent = injectPolyfillScript;
    document.head.insertBefore(script, document.head.firstChild);
  });
} else {
  // DOM already loaded, inject immediately
  const script = document.createElement('script');
  script.textContent = injectPolyfillScript;
  if (document.head) {
    document.head.insertBefore(script, document.head.firstChild);
  } else {
    // Fallback: wait for head to be available
    setTimeout(function() {
      if (document.head) {
        document.head.insertBefore(script, document.head.firstChild);
      }
    }, 0);
  }
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
    // Shell operations
    openExternal: (url) => {
      return shell.openExternal(url);
    },
    // Database operations
    db: {
      sendOTP: async (data) => {
        return await ipcRenderer.invoke('db-send-otp', data);
      },
      verifyOTP: async (data) => {
        return await ipcRenderer.invoke('db-verify-otp', data);
      },
      getControls: async (data) => {
        return await ipcRenderer.invoke('db-get-controls', data);
      },
      getEvidence: async (data) => {
        return await ipcRenderer.invoke('db-get-evidence', data);
      },
    },
    // Backend API calls
    uploadToAzure: async (data) => {
      return await ipcRenderer.invoke('upload-to-azure', data);
    },
    addToContext: async (data) => {
      return await ipcRenderer.invoke('add-to-context', data);
    },
    evaluateEvidence: async (data) => {
      return await ipcRenderer.invoke('evaluate-evidence', data);
    },
    evaluateControls: async (data) => {
      return await ipcRenderer.invoke('evaluate-controls', data);
    },
    // Azure Evidence Collection
    azure: {
      checkCLI: async () => {
        return await ipcRenderer.invoke('azure-check-cli');
      },
      initializeAuth: async () => {
        return await ipcRenderer.invoke('azure-initialize-auth');
      },
      getSubscriptionInfo: async () => {
        return await ipcRenderer.invoke('azure-get-subscription-info');
      },
      getDeviceCode: async () => {
        return await ipcRenderer.invoke('azure-get-device-code');
      },
      confirmDeviceCode: async () => {
        return await ipcRenderer.invoke('azure-confirm-device-code');
      },
      collectEvidence: async (data) => {
        return await ipcRenderer.invoke('azure-collect-evidence', data);
      },
      collectBulkEvidence: async (data) => {
        return await ipcRenderer.invoke('azure-collect-bulk-evidence', data);
      },
      getApplicableControls: async (data) => {
        return await ipcRenderer.invoke('azure-get-applicable-controls', data);
      },
      getControlMappings: async (data) => {
        return await ipcRenderer.invoke('azure-get-control-mappings', data);
      },
      setSubscription: async (subscriptionId) => {
        return await ipcRenderer.invoke('azure-set-subscription', subscriptionId);
      },
    },
  // Powerpipe operations
  powerpipe: {
      checkInstallation: async () => {
        return await ipcRenderer.invoke('powerpipe-check-installation');
      },
      listPlugins: async () => {
        return await ipcRenderer.invoke('powerpipe-list-plugins');
      },
      installPlugin: async (pluginName) => {
        return await ipcRenderer.invoke('powerpipe-install-plugin', pluginName);
      },
      configureConnection: async (data) => {
        return await ipcRenderer.invoke('powerpipe-configure-connection', data);
      },
      testConnection: async (pluginName) => {
        return await ipcRenderer.invoke('powerpipe-test-connection', pluginName);
      },
      runBenchmark: async (data) => {
        return await ipcRenderer.invoke('powerpipe-run-benchmark', data);
      },
      queryEvidence: async (data) => {
        return await ipcRenderer.invoke('powerpipe-query-evidence', data);
      },
      mapControls: async (data) => {
        return await ipcRenderer.invoke('powerpipe-map-controls', data);
      },
      collectEvidence: async (data) => {
        return await ipcRenderer.invoke('powerpipe-collect-evidence', data);
      },
      getBenchmarks: async (pluginName) => {
        return await ipcRenderer.invoke('powerpipe-get-benchmarks', pluginName);
      },
      runAzureQueries: async (data) => {
        return await ipcRenderer.invoke('azure-run-queries', data);
      },
      // Mod management
      checkPluginInstalled: async () => {
        return await ipcRenderer.invoke('powerpipe-check-azure-plugin');
      },
      installMod: async (data) => {
        return await ipcRenderer.invoke('powerpipe-install-mod', data);
      },
      checkModInstalled: async (modRepo) => {
        return await ipcRenderer.invoke('powerpipe-check-mod-installed', modRepo);
      },
      runModBenchmark: async (data) => {
        return await ipcRenderer.invoke('powerpipe-run-mod-benchmark', data);
      },
      listBenchmarks: async (modRepo) => {
        return await ipcRenderer.invoke('powerpipe-list-benchmarks', modRepo);
      },
      runModCompliance: async (data) => {
        return await ipcRenderer.invoke('powerpipe-run-mod-compliance', data);
    },
  },
  // Subprocess management
  subprocess: {
      save: async (data) => {
        return await ipcRenderer.invoke('subprocess-save', data);
      },
      getAll: async (userId) => {
        return await ipcRenderer.invoke('subprocess-get-all', userId);
      },
      getById: async (id) => {
        return await ipcRenderer.invoke('subprocess-get-by-id', id);
      },
      updateStatus: async (data) => {
        return await ipcRenderer.invoke('subprocess-update-status', data);
      },
      delete: async (id) => {
        return await ipcRenderer.invoke('subprocess-delete', id);
      },
      checkAzureCLI: async () => {
        return await ipcRenderer.invoke('subprocess-check-azure-cli');
      },
      installAzureCLI: async () => {
        return await ipcRenderer.invoke('subprocess-install-azure-cli');
      },
      authenticateAzureCLI: async () => {
        return await ipcRenderer.invoke('subprocess-authenticate-azure-cli');
      },
      getAzureSubscriptions: async () => {
        return await ipcRenderer.invoke('subprocess-get-azure-subscriptions');
      },
      setupAzure: async (data) => {
        return await ipcRenderer.invoke('subprocess-setup-azure', data);
      },
      getAzureTables: async () => {
        return await ipcRenderer.invoke('subprocess-get-azure-tables');
      },
      querySteampipe: async (data) => {
        return await ipcRenderer.invoke('subprocess-query-steampipe', data);
      },
      installAzureMod: async () => {
        return await ipcRenderer.invoke('subprocess-install-azure-mod');
      },
      getBenchmarks: async (data) => {
        return await ipcRenderer.invoke('subprocess-get-benchmarks', data);
      },
      runBenchmark: async (data) => {
        return await ipcRenderer.invoke('subprocess-run-benchmark', data);
    },
  },
  // Dataroom management
  dataroom: {
    saveReport: async (data) => {
      return await ipcRenderer.invoke('dataroom-save-report', data);
    },
  },
  // Azure initialization
  ensureAzurePrerequisites: async (subscriptionId) => {
    return await ipcRenderer.invoke('azure-ensure-prerequisites', subscriptionId);
  },
});
