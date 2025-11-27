// CRITICAL: Make crypto available globally for Azure SDK
// Azure SDK uses crypto.randomUUID() which expects crypto to be global
const crypto = require('crypto');
if (typeof global.crypto === 'undefined') {
  global.crypto = crypto;
  console.log('[Email Service] Made crypto available globally for Azure SDK');
}

// NOTE: .env should already be loaded by index.js before this module is required
// We don't reload it here to avoid conflicts. Just verify it's available.
const isDev = require('electron-is-dev');
if (!isDev) {
  // In production, just check if the key exists (it should be loaded by index.js)
  const testKey = process.env.AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING;
  console.log('[Email Service] Module loaded - checking for connection string...');
  console.log('[Email Service] Key exists in process.env:', !!testKey);
  console.log('[Email Service] Key length:', testKey ? testKey.length : 0);
  console.log('[Email Service] Key preview:', testKey ? testKey.substring(0, 30) + '...' : 'N/A');
  console.log('[Email Service] All AZURE keys in process.env:', Object.keys(process.env).filter(k => k.includes('AZURE')));
  
  if (!testKey) {
    console.error('[Email Service] WARNING: Connection string not found in process.env!');
    console.error('[Email Service] This means .env was not loaded by index.js before this module was required.');
    console.error('[Email Service] process.resourcesPath:', process.resourcesPath);
    
    // Try to load it as a last resort
    const path = require('path');
    const fs = require('fs');
    const envPath = path.join(process.resourcesPath, '.env');
    if (fs.existsSync(envPath)) {
      console.log('[Email Service] Attempting emergency .env load from:', envPath);
      const result = require('dotenv').config({ path: envPath, override: false });
      console.log('[Email Service] Emergency load result:', result.error ? 'ERROR: ' + result.error : 'SUCCESS');
      const afterLoad = process.env.AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING;
      console.log('[Email Service] After emergency load - Key exists:', !!afterLoad);
    } else {
      console.error('[Email Service] .env file not found at:', envPath);
    }
  }
}

// NOW require Azure SDK - it will use our patched URL
const { EmailClient } = require('@azure/communication-email');

let emailClient = null;
let emailClientInitAttempted = false;

function getEmailClient() {
  // If we've already tried and failed, don't try again
  if (emailClientInitAttempted && !emailClient) {
    console.warn('[Email] EmailClient initialization was previously attempted and failed. Skipping retry.');
    return null;
  }
  
  if (!emailClient) {
    emailClientInitAttempted = true;
    // Get and trim connection string (remove quotes if present)
    // Try the exact key name first
    let connectionString = process.env.AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING;
    
    // Debug: Log all possible variations
    console.log('[Email] Checking for connection string...');
    console.log('[Email] Direct access:', !!connectionString);
    console.log('[Email] process.env keys containing AZURE:', Object.keys(process.env).filter(k => k.includes('AZURE')));
    console.log('[Email] process.env keys containing COMMUNICATION:', Object.keys(process.env).filter(k => k.includes('COMMUNICATION')));
    
    // Try alternative key names if direct access fails
    if (!connectionString) {
      console.log('[Email] Trying alternative key names...');
      connectionString = process.env.AZURE_COMMUNICATION_CONNECTION_STRING || 
                        process.env.AZURE_EMAIL_CONNECTION_STRING ||
                        process.env.COMMUNICATION_SERVICE_CONNECTION_STRING;
      console.log('[Email] Alternative key found:', !!connectionString);
    }
    
    if (connectionString) {
      connectionString = connectionString.trim();
      // Remove surrounding quotes if present
      if ((connectionString.startsWith('"') && connectionString.endsWith('"')) ||
          (connectionString.startsWith("'") && connectionString.endsWith("'"))) {
        connectionString = connectionString.slice(1, -1);
      }
    }
    
    console.log('[Email] Final connection string exists:', !!connectionString);
    console.log('[Email] Connection string length:', connectionString ? connectionString.length : 0);
    console.log('[Email] Connection string first 30 chars:', connectionString ? connectionString.substring(0, 30) : 'N/A');
    console.log('[Email] All env vars with AZURE or DATABASE:', Object.keys(process.env).filter(k => k.includes('AZURE') || k.includes('DATABASE')));
    
    if (!connectionString) {
      console.warn('[Email] Azure Communication Service connection string not set. Email functionality disabled.');
      console.warn('[Email] Please ensure .env file is in the app resources folder with AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING');
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
      console.error(`[Email] Client not initialized, skipping email to ${email}`);
      console.error(`[Email] Connection string check:`, !!process.env.AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING);
      console.error(`[Email] Connection string length:`, process.env.AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING ? process.env.AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING.length : 0);
      console.error(`[Email] emailClient variable:`, emailClient);
      // Throw an error with details instead of returning false
      throw new Error('Email client not initialized. Connection string exists but EmailClient initialization failed. Check main process logs for details.');
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
        
        // Wrap in Promise to catch any synchronous errors
        poller = await Promise.resolve().then(() => client.beginSend(emailMessage));
        console.log(`[Email] beginSend() completed, got poller`);
      } catch (beginError) {
        console.error(`[Email] ERROR in beginSend():`, beginError.message);
        console.error(`[Email] beginSend() error stack:`, beginError.stack);
        
        // Check if it's a searchParams error - but try to fix it first
        const errorMsg = beginError.message || String(beginError);
        if (errorMsg.includes('searchParams') || errorMsg.includes('Cannot read properties of undefined')) {
          console.error(`[Email] SEARCHPARAMS ERROR DETECTED!`);
          console.error(`[Email] Attempting to re-apply polyfill and retry...`);
          
          // Re-apply polyfill to URL prototype
          const urlModule = require('url');
          const OriginalURLSearchParams = urlModule.URLSearchParams;
          const URLPrototype = global.URL.prototype;
          
          if (!URLPrototype.searchParams) {
            Object.defineProperty(URLPrototype, 'searchParams', {
              get() {
                return new OriginalURLSearchParams(this.search || '');
              },
              enumerable: true,
              configurable: true,
            });
          }
          
          // Retry the call
          console.log(`[Email] Retrying beginSend() after polyfill re-application...`);
          poller = await client.beginSend(emailMessage);
          console.log(`[Email] Retry successful!`);
        } else {
          // Not a searchParams error, re-throw it
          throw beginError;
        }
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
  getEmailClient, // Expose for diagnostics
};

