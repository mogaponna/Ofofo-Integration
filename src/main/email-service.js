// CRITICAL: Patch URL BEFORE requiring Azure SDK
// Azure SDK caches URL reference when module loads, so we must patch it first
(function() {
  'use strict';
  const urlModule = require('url');
  const OriginalURL = urlModule.URL;
  const OriginalURLSearchParams = urlModule.URLSearchParams;
  
  // Aggressive polyfill - ensure URL always has searchParams
  const URLWrapper = function(url, base) {
    // Defensive check for undefined/null
    if (url === undefined || url === null) {
      console.error('[Email Service Polyfill] URL constructor called with undefined/null');
      throw new TypeError('Failed to construct URL: Invalid URL');
    }
    
    try {
      const urlInstance = new OriginalURL(url, base);
      
      // Ensure urlInstance exists
      if (!urlInstance) {
        console.error('[Email Service Polyfill] URL constructor returned undefined');
        throw new TypeError('URL constructor returned undefined');
      }
      
      // ALWAYS ensure searchParams exists, even if it already does
      // This prevents any race conditions
      if (!urlInstance.searchParams) {
        Object.defineProperty(urlInstance, 'searchParams', {
          get() {
            try {
              return new OriginalURLSearchParams(this.search || '');
            } catch (e) {
              console.error('[Email Service Polyfill] Error creating URLSearchParams:', e);
              return new OriginalURLSearchParams('');
            }
          },
          enumerable: true,
          configurable: true,
        });
      }
      
      return urlInstance;
    } catch (error) {
      // If error mentions searchParams, log it
      if (error.message && error.message.includes('searchParams')) {
        console.error('[Email Service Polyfill] SEARCHPARAMS ERROR in URL constructor!');
        console.error('[Email Service Polyfill] URL:', url, 'Base:', base);
      }
      throw error;
    }
  };
  
  // Copy prototype
  URLWrapper.prototype = OriginalURL.prototype;
  Object.setPrototypeOf(URLWrapper, OriginalURL);
  
  // Copy static methods
  ['canParse', 'createObjectURL', 'parse', 'revokeObjectURL'].forEach(method => {
    if (typeof OriginalURL[method] === 'function') {
      URLWrapper[method] = OriginalURL[method];
    }
  });
  
  // Replace global URL - this is what most code uses
  // Don't try to modify urlModule.URL as it's read-only in Node.js
  // Azure SDK and other libraries will use global.URL
  global.URL = URLWrapper;
  
  console.log('[Email Service] URL polyfill applied BEFORE Azure SDK load');
})();

// NOW require Azure SDK - it will use our patched URL
const { EmailClient } = require('@azure/communication-email');
require('dotenv').config();

let emailClient = null;

function getEmailClient() {
  if (!emailClient) {
    const connectionString = process.env.AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING;
    
    if (!connectionString) {
      console.warn('[Email] Azure Communication Service connection string not set. Email functionality disabled.');
      return null;
    }

    try {
      console.log('[Email] Initializing Azure EmailClient...');
      console.log('[Email] Connection string length:', connectionString.length);
      console.log('[Email] Connection string preview:', connectionString.substring(0, 20) + '...');
      
      // Wrap EmailClient initialization to catch URL/searchParams errors
      try {
        emailClient = new EmailClient(connectionString);
        console.log('[Email] Azure Communication Services client initialized successfully');
      } catch (initError) {
        console.error('[Email] EmailClient constructor error:', initError.message);
        console.error('[Email] Error stack:', initError.stack);
        if (initError.message && initError.message.includes('searchParams')) {
          console.error('[Email] SEARCHPARAMS ERROR IN EmailClient CONSTRUCTOR!');
          // Try to provide a more helpful error
          throw new Error('Azure SDK initialization failed due to URL parsing issue. Please check your connection string format.');
        }
        throw initError;
      }
    } catch (error) {
      console.error('[Email] Failed to initialize client:', error.message);
      console.error('[Email] Full error:', error);
      return null;
    }
  }

  return emailClient;
}

const SENDER_ADDRESS = process.env.AZURE_EMAIL_SENDER || 'DoNotReply@ofofo.ai';

/**
 * Send OTP email via Azure Communication Services
 */
async function sendOTPEmail(email, otp) {
  console.log(`[Email] sendOTPEmail called for: ${email}`);
  
  try {
    console.log(`[Email] Step 1: Getting email client...`);
    const client = getEmailClient();
    
    if (!client) {
      console.warn(`[Email] Client not initialized, skipping email to ${email}`);
      return false;
    }
    console.log(`[Email] Client obtained successfully`);

    try {
      console.log(`[Email] Step 2: Preparing email message...`);
      const emailMessage = {
        senderAddress: SENDER_ADDRESS,
        content: {
          subject: 'Your Login OTP',
          plainText: `Use this code to login: ${otp}. This code will expire in 10 minutes.`,
          html: `
            <html>
              <body style="font-family: Arial, sans-serif; padding: 20px;">
                <h1>Your OTP Code</h1>
                <p>Use this code to login: <strong style="font-size: 24px; color: #3b82f6;">${otp}</strong></p>
                <p>This code will expire in 10 minutes.</p>
                <p style="color: #666; font-size: 12px;">If you didn't request this code, please ignore this email.</p>
              </body>
            </html>
          `,
        },
        recipients: {
          to: [{ address: email }],
        },
      };
      console.log(`[Email] Email message prepared`);

      console.log(`[Email] Step 3: Calling client.beginSend()...`);
      let poller;
      try {
        // Verify URL polyfill is working before calling Azure SDK
        const testUrl = new global.URL('https://example.com');
        if (!testUrl.searchParams) {
          console.error(`[Email] URL polyfill not working! searchParams missing`);
          throw new Error('URL polyfill failed - searchParams not available');
        }
        console.log(`[Email] URL polyfill verified - searchParams available`);
        
        poller = await client.beginSend(emailMessage);
        console.log(`[Email] beginSend() completed, got poller`);
      } catch (beginError) {
        console.error(`[Email] ERROR in beginSend():`, beginError.message);
        console.error(`[Email] beginSend() error stack:`, beginError.stack);
        if (beginError.message && beginError.message.includes('searchParams')) {
          console.error(`[Email] SEARCHPARAMS ERROR IN beginSend()!`);
          console.error(`[Email] This is where the Azure SDK is failing`);
          // Try to provide a workaround or better error
          throw new Error('Email service error: URL parsing issue in Azure SDK. Please check your Azure Communication Services connection string.');
        }
        throw beginError;
      }

      console.log(`[Email] Step 4: Polling until done...`);
      let result;
      try {
        result = await poller.pollUntilDone();
        console.log(`[Email] pollUntilDone() completed`);
      } catch (pollError) {
        console.error(`[Email] ERROR in pollUntilDone():`, pollError.message);
        console.error(`[Email] pollUntilDone() error stack:`, pollError.stack);
        if (pollError.message && pollError.message.includes('searchParams')) {
          console.error(`[Email] SEARCHPARAMS ERROR IN pollUntilDone()!`);
        }
        throw pollError;
      }
      
      console.log(`[Email] OTP email sent via Azure:`, result.id);
      return true;
    } catch (innerError) {
      console.error(`[Email] Inner error in sendOTPEmail:`, innerError.message);
      console.error(`[Email] Inner error stack:`, innerError.stack);
      throw innerError;
    }
  } catch (error) {
    console.error(`[Email] Failed to send OTP email via Azure:`, error.message);
    console.error(`[Email] Full error:`, error);
    console.error(`[Email] Error stack:`, error.stack);
    
    // Check for searchParams error
    if (error.message && error.message.includes('searchParams')) {
      console.error(`[Email] ========================================`);
      console.error(`[Email] SEARCHPARAMS ERROR DETECTED!`);
      console.error(`[Email] Error message:`, error.message);
      console.error(`[Email] Error name:`, error.name);
      console.error(`[Email] ========================================`);
    }
    
    if (error.code === 'DomainNotLinked') {
      console.error(`[Email] Domain linking issue detected. Please ensure:`);
      console.error(`1. Domain is verified in Azure Communication Services`);
      console.error(`2. Domain is linked to your Communication Service`);
      console.error(`3. Sender address '${SENDER_ADDRESS}' is approved`);
    }
    
    throw error;
  }
}

module.exports = {
  sendOTPEmail,
};

