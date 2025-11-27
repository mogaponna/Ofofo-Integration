import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/globals.css';

// Fix for URL/searchParams issues in Electron file:// protocol
// This must run before any other code that uses URL
(function() {
  if (typeof window === 'undefined') return;
  
  // Store original URL constructor
  const OriginalURL = window.URL;
  
  // Override URL constructor to ensure searchParams is always available
  const URLWrapper = function(this: any, url: string | URL, base?: string | URL) {
    try {
      const urlInstance = new OriginalURL(url, base);
      
      // Ensure searchParams exists - add it if missing
      if (!urlInstance.searchParams) {
        Object.defineProperty(urlInstance, 'searchParams', {
          get() {
            return new URLSearchParams(this.search || '');
          },
          enumerable: true,
          configurable: true,
        });
      }
      
      return urlInstance;
    } catch (error) {
      // If URL constructor fails, log and rethrow - let the caller handle it
      console.error('URL constructor error:', error, 'url:', url, 'base:', base);
      throw error;
    }
  };
  
  // Copy prototype and static methods
  URLWrapper.prototype = OriginalURL.prototype;
  Object.setPrototypeOf(URLWrapper, OriginalURL);
  Object.getOwnPropertyNames(OriginalURL).forEach(name => {
    if (name !== 'prototype' && name !== 'length' && name !== 'name') {
      try {
        (URLWrapper as any)[name] = (OriginalURL as any)[name];
      } catch (e) {
        // Ignore non-copyable properties
      }
    }
  });
  
  // Copy all static methods from OriginalURL
  const staticMethods = ['canParse', 'createObjectURL', 'parse', 'revokeObjectURL'];
  staticMethods.forEach(method => {
    if (typeof (OriginalURL as any)[method] === 'function') {
      (URLWrapper as any)[method] = (OriginalURL as any)[method];
    }
  });
  
  window.URL = URLWrapper as any as typeof URL;
  
  // Ensure window.location.searchParams works
  try {
    if (window.location && !(window.location as any).searchParams) {
      Object.defineProperty(window.location, 'searchParams', {
        get() {
          try {
            const url = new URL(window.location.href);
            return url.searchParams;
          } catch (e) {
            return new URLSearchParams(window.location.search || '');
          }
        },
        enumerable: true,
        configurable: true,
      });
    }
  } catch (e) {
    console.warn('Could not add searchParams to window.location:', e);
  }
})();

// Global error handler to catch unhandled errors
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  console.error('Error details:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
    stack: event.error?.stack,
  });
  
  // If it's a searchParams error, log additional context and try to fix
  if (event.message?.includes('searchParams')) {
    console.error('searchParams error detected. Location:', window.location);
    console.error('URL constructor test:', typeof URL !== 'undefined' ? 'available' : 'missing');
    console.error('URLSearchParams available:', typeof URLSearchParams !== 'undefined');
    
    // Try to prevent the error from breaking the app
    event.preventDefault();
  }
}, true); // Use capture phase to catch errors early

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  console.error('Rejection details:', {
    reason: event.reason,
    stack: event.reason?.stack,
  });
});

// Wrap app initialization in try-catch
try {
  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Root element not found');
  }

  ReactDOM.createRoot(root).render(
  <React.StrictMode>
      <ErrorBoundary>
    <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
} catch (error) {
  console.error('Failed to initialize app:', error);
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : String(error);
  
  document.body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100vh; background: #000; color: #fff; font-family: Arial;">
      <div style="text-align: center;">
        <h1>Application Error</h1>
        <p>${errorMessage}</p>
        <pre style="background: #1a1a1a; padding: 20px; border-radius: 8px; margin-top: 20px; text-align: left;">
${errorStack}
        </pre>
      </div>
    </div>
  `;
}
