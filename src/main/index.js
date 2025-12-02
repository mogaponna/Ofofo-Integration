const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const isDev = require('electron-is-dev');
const axios = require('axios');
const crypto = require('crypto');

// CRITICAL: Make crypto available globally for Azure SDK
// Azure SDK uses crypto.randomUUID() which expects crypto to be global
if (typeof global.crypto === 'undefined') {
  global.crypto = crypto;
  console.log('[Main Process] Made crypto available globally for Azure SDK');
}

// Note: URL.searchParams should be available natively in Node.js 20+ and Electron 28
// No polyfill needed - if there's an issue, it's likely something else

// Load .env based on environment
if (!isDev) {
  // In production, load from resources (bundled with app)
  const envPath = path.join(process.resourcesPath, '.env');
  console.log('[App] Looking for .env at:', envPath);
  console.log('[App] File exists:', fs.existsSync(envPath));
  
  if (fs.existsSync(envPath)) {
    const result = require('dotenv').config({ path: envPath });
    console.log('[App] Loaded .env from resources:', envPath);
    console.log('[App] dotenv result:', result.error ? 'ERROR: ' + result.error : 'SUCCESS');
    if (result.error) {
      console.error('[App] dotenv error details:', result.error);
    }
    
    // Verify the connection strings were loaded
    let connStr = process.env.AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING;
    let dbUrl = process.env.DATABASE_URL;
    console.log('[App] AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING exists:', !!connStr);
    console.log('[App] Connection string length:', connStr ? connStr.length : 0);
    console.log('[App] Connection string preview:', connStr ? connStr.substring(0, 30) + '...' : 'N/A');
    console.log('[App] DATABASE_URL exists:', !!dbUrl);
    console.log('[App] DATABASE_URL length:', dbUrl ? dbUrl.length : 0);
    console.log('[App] DATABASE_URL preview:', dbUrl ? dbUrl.substring(0, 50) + '...' : 'N/A');
    
    // If dotenv didn't load it, try manual parsing as fallback
    if (!connStr) {
      console.warn('[App] Connection string not loaded by dotenv, trying manual parse...');
      try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const lines = envContent.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING=')) {
            const match = line.match(/AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING=(.+)/);
            if (match && match[1]) {
              connStr = match[1].trim();
              // Remove quotes if present
              if ((connStr.startsWith('"') && connStr.endsWith('"')) || 
                  (connStr.startsWith("'") && connStr.endsWith("'"))) {
                connStr = connStr.slice(1, -1);
              }
              process.env.AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING = connStr;
              console.log('[App] Manually loaded connection string, length:', connStr.length);
              break;
            }
          }
        }
      } catch (parseError) {
        console.error('[App] Failed to manually parse .env:', parseError.message);
      }
    }
  } else {
    console.error('[App] ERROR: .env file not found at:', envPath);
    console.error('[App] This means environment variables are not loaded!');
    // Try fallback locations
    const fallbackPaths = [
      path.join(__dirname, '../../.env'),
      path.join(app.getAppPath(), '.env'),
    ];
    for (const fallbackPath of fallbackPaths) {
      if (fs.existsSync(fallbackPath)) {
        console.log('[App] Found .env at fallback location:', fallbackPath);
        require('dotenv').config({ path: fallbackPath });
        break;
      }
    }
  }
} else {
  // In development, load from project root
  require('dotenv').config();
  console.log('[App] Loaded .env from project root');
}

// CRITICAL: Load modules AFTER polyfill is set up
// This ensures all modules use the patched URL
const db = require('./db');
const emailService = require('./email-service');
const powerpipeService = require('./powerpipe-service');
const powerpipeInstaller = require('./powerpipe-installer');

// ========================================
// Installation Status Cache (Persistence)
// ========================================
// Cache installation status to avoid re-checking/re-installing on every app open
const INSTALLATION_STATUS_FILE = path.join(os.homedir(), '.ofofo', 'installation-status.json');

// Global installation status cache
let installationStatus = {
  powerpipe: { installed: false, checked: false, timestamp: null },
  steampipe: { installed: false, checked: false, timestamp: null },
  azurePlugin: { installed: false, checked: false, timestamp: null },
  azureADPlugin: { installed: false, checked: false, timestamp: null },
  azureMods: { installed: false, checked: false, timestamp: null },
  azureCLI: { installed: false, checked: false, timestamp: null }
};

/**
 * Load installation status from disk (if exists)
 * Called on app startup to restore previous installation state
 */
function loadInstallationStatus() {
  try {
    if (fs.existsSync(INSTALLATION_STATUS_FILE)) {
      const data = fs.readFileSync(INSTALLATION_STATUS_FILE, 'utf8');
      const saved = JSON.parse(data);
      // Merge with defaults (in case new fields added in future)
      installationStatus = { ...installationStatus, ...saved };
      console.log('[App] ✓ Loaded installation status from cache');
    } else {
      console.log('[App] No installation status cache found (first run)');
    }
  } catch (error) {
    console.warn('[App] Failed to load installation status:', error.message);
  }
}

/**
 * Save installation status to disk
 * Called after each installation/check to persist state
 */
function saveInstallationStatus() {
  try {
    const dir = path.dirname(INSTALLATION_STATUS_FILE);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(INSTALLATION_STATUS_FILE, JSON.stringify(installationStatus, null, 2), 'utf8');
    console.log('[App] ✓ Saved installation status to cache');
  } catch (error) {
    console.warn('[App] Failed to save installation status:', error.message);
  }
}

// Load installation status on startup
loadInstallationStatus();

// Backend API URL
const BACKEND_SERVICE_URL = process.env.BACKEND_SERVICE_URL || 'https://orchestrate.ofofo.ai';
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
const AZURE_STORAGE_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME || 'dataroom';

let mainWindow = null;

function createWindow() {
  // Cross-platform window configuration
  const isMac = process.platform === 'darwin';
  const isWindows = process.platform === 'win32';
  const isLinux = process.platform === 'linux';

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      enableRemoteModule: false,
      // Allow outbound network requests
      webSecurity: true,
    },
    // macOS specific
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    backgroundColor: '#1a1a1a',
    show: false,
    // Icon path - in production, logo is in dist/renderer/assets from vite build
    // Note: app.getAppPath() is available after app is ready, so we use __dirname here
    icon: isDev 
      ? path.join(__dirname, '../../public/assets/logo.png')
      : (() => {
          // In production, try to find logo relative to main process location
          // Main process is in app.asar/src/main/ or unpacked/src/main/
          // Logo is in app.asar/dist/renderer/assets/ or unpacked/dist/renderer/assets/
          const possibleIconPaths = [
            path.join(__dirname, '../../dist/renderer/assets/logo.png'),
            path.join(process.resourcesPath, 'app.asar', 'dist', 'renderer', 'assets', 'logo.png'),
            path.join(process.resourcesPath, 'app', 'dist', 'renderer', 'assets', 'logo.png'),
          ];
          // Return first path that exists, or fallback to first option
          for (const iconPath of possibleIconPaths) {
            if (fs.existsSync(iconPath)) {
              return iconPath;
            }
          }
          return possibleIconPaths[0]; // Fallback
        })(),
    // Windows/Linux specific
    frame: true,
    transparent: false,
    vibrancy: isMac ? 'dark' : undefined,
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // Only open dev tools in development
    // mainWindow.webContents.openDevTools();
  } else {
    // In production, use app.getAppPath() which works with both asar and unpacked apps
    // According to Electron docs: app.getAppPath() returns the path to app.asar or unpacked app
    const appPath = app.getAppPath();
    const htmlPath = path.join(appPath, 'dist', 'renderer', 'index.html');
    
    console.log('[App] App path:', appPath);
    console.log('[App] Loading HTML from:', htmlPath);
    console.log('[App] File exists:', fs.existsSync(htmlPath));
    
    // loadFile() handles asar files automatically
    mainWindow.loadFile(htmlPath).catch((err) => {
      console.error('[App] Failed to load file:', err);
      // Fallback: try relative path
      const fallbackPath = path.join(__dirname, '../../dist/renderer/index.html');
      console.log('[App] Trying fallback path:', fallbackPath);
      mainWindow.loadFile(fallbackPath).catch((fallbackErr) => {
        console.error('[App] Fallback also failed:', fallbackErr);
      });
    });
  }

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      
      // Center window on all platforms
      mainWindow.center();
    }
  });

  // Fallback: Show window after a short delay if ready-to-show doesn't fire
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.log('[Window] Force showing window after timeout');
      mainWindow.show();
      mainWindow.focus();
      mainWindow.center();
    }
  }, 2000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorDescription);
  });
  
  // Steampipe will be initialized on-demand when user clicks Azure
  // No need to initialize on app startup - saves significant time!
}

// IPC Handlers for Database Operations
// Register handlers before app is ready to ensure they're available

// Send OTP - Only send email, store OTP temporarily for verification
ipcMain.handle('db-send-otp', async (event, data) => {
  console.log('[IPC] db-send-otp handler called with email:', data?.email);
  const startTime = Date.now();
  
  try {
    // Step 1: Validate input
    console.log('[OTP] Step 1: Validating input...');
    const { email } = data;
    
    if (!email || !email.includes('@')) {
      return { success: false, error: 'Invalid email address' };
    }

    // Step 2: Generate OTP
    console.log('[OTP] Step 2: Generating OTP...');
    let otp, otpExpiry;
    try {
      otp = db.generateOTP();
      otpExpiry = db.getOTPExpiry();
      console.log('[OTP] Generated OTP for:', email);
    } catch (genError) {
      console.error('[OTP] Error generating OTP:', genError);
      console.error('[OTP] Error stack:', genError.stack);
      return { success: false, error: 'Failed to generate OTP: ' + genError.message };
    }

    // Step 3: Store OTP in database (for verification only) - with timeout handling
    console.log('[OTP] Step 3: Storing OTP in database...');
    try {
      const dbStartTime = Date.now();
      await Promise.race([
        db.storeOTP(email, otp, otpExpiry),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Database connection timeout')), 20000))
      ]);
      console.log(`[OTP] OTP stored in ${Date.now() - dbStartTime}ms`);
    } catch (dbError) {
      console.error('[OTP] Database error:', dbError.message);
      console.error('[OTP] Database error stack:', dbError.stack);
      // Check if it's a searchParams error
      if (dbError.message && dbError.message.includes('searchParams')) {
        console.error('[OTP] SEARCHPARAMS ERROR IN DATABASE OPERATION!');
        console.error('[OTP] This suggests the pg library or connection string parsing is the issue');
      }
      // If DB fails, still try to send email (OTP can be verified manually if needed)
      if (dbError.message.includes('timeout') || dbError.message.includes('Connection')) {
        return { success: false, error: 'Database connection timeout. Please check your connection and try again.' };
      }
      throw dbError;
    }

    // Step 4: Send email via Azure Communication Services
    console.log('[OTP] Step 4: Sending email via Azure...');
    try {
      const emailStartTime = Date.now();
      const emailResult = await Promise.race([
        emailService.sendOTPEmail(email, otp),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Email sending timeout')), 20000))
      ]);
      
      // Check if email service returned false (client not initialized)
      if (emailResult === false) {
        console.error('[OTP] Email service returned false - client not initialized');
        console.error('[OTP] This means AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING is not set or invalid');
        // Check the connection string status
        const connStr = process.env.AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING;
        console.error('[OTP] Connection string exists:', !!connStr);
        console.error('[OTP] Connection string length:', connStr ? connStr.length : 0);
        return { 
          success: false, 
          error: 'Email service temporarily unavailable. Please check your Azure Communication Services configuration or contact support.' 
        };
      }
      
      console.log(`[OTP] Email sent in ${Date.now() - emailStartTime}ms`);
      console.log(`[OTP] Total time: ${Date.now() - startTime}ms`);
      return { success: true, message: 'OTP sent to your email' };
    } catch (emailError) {
      console.error('[OTP] Email sending failed:', emailError.message);
      console.error('[OTP] Email error stack:', emailError.stack);
      console.error('[OTP] Full error object:', JSON.stringify(emailError, Object.getOwnPropertyNames(emailError)));
      
      // Check if it's a searchParams error
      if (emailError.message && emailError.message.includes('searchParams')) {
        console.error('[OTP] SEARCHPARAMS ERROR IN EMAIL SERVICE!');
        console.error('[OTP] This suggests the Azure SDK is the issue');
        console.error('[OTP] Azure SDK version:', require('@azure/communication-email/package.json')?.version || 'unknown');
        return { 
          success: false, 
          error: 'Email service temporarily unavailable. Please check your Azure Communication Services configuration or contact support.' 
        };
      }
      
      // If email fails but DB succeeded, still return success (user can request resend)
      if (emailError.message && emailError.message.includes('timeout')) {
        return { success: false, error: 'Email sending timeout. Please try again.' };
      }
      
      // Return the actual error message for debugging - show the real error!
      const errorMsg = emailError.message || 'Failed to send email';
      console.error('[OTP] Returning error to user:', errorMsg);
      console.error('[OTP] Error type:', typeof emailError);
      console.error('[OTP] Error constructor:', emailError.constructor?.name);
      
      // For now, return the ACTUAL error message so we can see what's really failing
      return { 
        success: false, 
        error: `Email sending failed: ${errorMsg}` // Show actual error for debugging
      };
    }
  } catch (error) {
    console.error('[OTP] Unexpected error in db-send-otp handler:', error.message);
    console.error('[OTP] Error stack:', error.stack);
    // Check if it's a searchParams error
    if (error.message && error.message.includes('searchParams')) {
      console.error('[OTP] SEARCHPARAMS ERROR DETECTED IN HANDLER!');
      console.error('[OTP] Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    }
    const errorMessage = error.message || 'Failed to send OTP';
    if (errorMessage.includes('timeout') || errorMessage.includes('Connection')) {
      return { success: false, error: 'Connection timeout. Please check your database connection and try again.' };
    }
    // Check if it's a searchParams error and provide user-friendly message
    if (errorMessage.includes('searchParams') || errorMessage.includes('Cannot read properties of undefined')) {
      console.error('[OTP] searchParams error detected in handler');
      return { 
        success: false, 
        error: 'Email service temporarily unavailable. Please check your Azure Communication Services configuration or contact support.' 
      };
    }
    return { success: false, error: errorMessage };
  }
});

// Diagnostic: Check email service status
ipcMain.handle('check-email-service', async () => {
  console.log('[IPC] check-email-service handler called');
  const connStr = process.env.AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING;
  const envPath = path.join(process.resourcesPath, '.env');
  const envExists = fs.existsSync(envPath);
  
  let envContent = null;
  if (envExists) {
    try {
      envContent = fs.readFileSync(envPath, 'utf8');
    } catch (err) {
      console.error('[Diagnostic] Could not read .env file:', err.message);
    }
  }
  
  const hasKeyInFile = envContent ? envContent.includes('AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING') : false;
  const hasKeyInEnv = !!connStr;
  
  // Try to get the email client to see if it's initialized
  let emailClientStatus = 'unknown';
  let emailClientError = null;
  try {
    // Access the internal getEmailClient function
    const client = emailService.getEmailClient ? emailService.getEmailClient() : null;
    emailClientStatus = client ? 'initialized' : 'not_initialized';
    
    if (!client && connStr) {
      // Try to initialize it directly to see what error we get
      try {
        const { EmailClient } = require('@azure/communication-email');
        // Test URL polyfill first
        const testUrl = new global.URL('https://example.com');
        if (!testUrl.searchParams) {
          emailClientError = 'URL polyfill not working - searchParams missing';
          emailClientStatus = 'polyfill_failed';
        } else {
          const testClient = new EmailClient(connStr.trim());
          emailClientStatus = 'can_initialize';
        }
      } catch (initError) {
        emailClientError = initError.message;
        emailClientStatus = 'init_failed';
        console.error('[Diagnostic] EmailClient initialization test failed:', initError);
        console.error('[Diagnostic] Error stack:', initError.stack);
      }
    }
  } catch (err) {
    emailClientError = err.message;
    emailClientStatus = 'error';
    console.error('[Diagnostic] Error checking email client:', err);
  }
  
  return {
    envFileExists: envExists,
    envFilePath: envPath,
    hasKeyInFile,
    hasKeyInEnv,
    connectionStringLength: connStr ? connStr.length : 0,
    connectionStringPreview: connStr ? connStr.substring(0, 30) + '...' : null,
    allAzureKeys: Object.keys(process.env).filter(k => k.includes('AZURE')),
    resourcesPath: process.resourcesPath,
    emailClientStatus,
    emailClientError,
  };
});

// Verify OTP - Only verify, no user creation
ipcMain.handle('db-verify-otp', async (event, data) => {
  console.log('[IPC] db-verify-otp handler called');
  try {
    const { email, otp } = data;
    
    if (!email || !otp || otp.length !== 6) {
      return { success: false, error: 'Invalid email or OTP' };
    }

    // Verify OTP from database
    const result = await db.verifyOTP(email, otp);

    if (result.valid && result.user) {
      return { 
        success: true, 
        user: result.user
      };
    } else {
      return { success: false, error: result.error || 'Invalid OTP' };
    }
  } catch (error) {
    console.error('[OTP] Verify error:', error);
    return { success: false, error: error.message || 'Failed to verify OTP' };
  }
});

// Get Controls from Database - optimized with caching
ipcMain.handle('db-get-controls', async (event, data) => {
  try {
    let { organizationId, dataroomId, userId } = data || {};
    
    // If userId provided, get their organization (cached)
    if (userId && !organizationId && !dataroomId) {
      organizationId = await db.getUserOrganizationId(userId);
    }
    
    // This is already cached in db.js, so it's fast
    const controls = await db.getControls(organizationId, dataroomId);
    return { success: true, controls: controls || [] };
  } catch (error) {
    console.error('[DB] Get controls error:', error);
    // Return empty array instead of error for smooth UX
    return { success: true, controls: [] };
  }
});

// Get Evidence from Database - optimized with caching
ipcMain.handle('db-get-evidence', async (event, data) => {
  try {
    let { organizationId, dataroomId, userId } = data || {};
    
    // If userId provided, get their organization (cached)
    if (userId && !organizationId && !dataroomId) {
      organizationId = await db.getUserOrganizationId(userId);
    }
    
    // This is already cached in db.js, so it's fast
    const evidence = await db.getEvidence(organizationId, dataroomId);
    return { success: true, evidence: evidence || [] };
  } catch (error) {
    console.error('[DB] Get evidence error:', error);
    // Return empty array instead of error for smooth UX
    return { success: true, evidence: [] };
  }
});

// IPC Handlers for API calls
ipcMain.handle('upload-to-azure', async (event, data) => {
  try {
    const { fileBuffer, filename, dataRoomId, contentType } = data;
    const buffer = Buffer.from(fileBuffer);
    
    // For now, return a mock response since Azure SDK requires proper setup
    // In production, this would use @azure/storage-blob
    const mockUrl = `https://storage.azure.com/${dataRoomId}/${filename}`;
    return {
      success: true,
      data: {
        url: mockUrl,
        encryptedUrl: mockUrl,
        pathname: `${dataRoomId}/${filename}`,
        contentType,
        contentLength: buffer.length,
        uploadedAt: new Date(),
      }
    };
  } catch (error) {
    console.error('Upload error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('add-to-context', async (event, data) => {
  try {
    const { dataRoomId, userId, files, fileType } = data;
    const response = await axios.post(
      `${BACKEND_SERVICE_URL}/graphiti/add-documents`,
      {
        user_id: dataRoomId,
        user_uuid: userId,
        context_files: files,
        file_type: fileType,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000,
      }
    );
    return { success: true, ...response.data };
  } catch (error) {
    console.error('Add to context error:', error);
    return { success: false, error: error.response?.data?.message || error.message };
  }
});

ipcMain.handle('evaluate-evidence', async (event, data) => {
  try {
    const { dataRoomId, userId, files, similarityThreshold } = data;
    const response = await axios.post(
      `${BACKEND_SERVICE_URL}/lance/compliance-evidence-evaluator`,
      {
        user_id: dataRoomId,
        user_uuid: userId,
        files,
        similarity_threshold: similarityThreshold || 0.5,
      },
      {
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        timeout: 120000,
      }
    );
    return { success: true, ...response.data };
  } catch (error) {
    console.error('Evaluate evidence error:', error);
    return { success: false, error: error.response?.data?.message || error.message };
  }
});

ipcMain.handle('evaluate-controls', async (event, data) => {
  try {
    const { dataRoomId, userId, files, similarityThreshold } = data;
    const response = await axios.post(
      `${BACKEND_SERVICE_URL}/lance/compliance-controls-evaluator`,
      {
        user_id: dataRoomId,
        user_uuid: userId,
        files,
        similarity_threshold: similarityThreshold || 0.5,
      },
      {
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        timeout: 120000,
      }
    );
    return { success: true, ...response.data };
  } catch (error) {
    console.error('Evaluate controls error:', error);
    return { success: false, error: error.response?.data?.message || error.message };
  }
});

// Azure Evidence Collection IPC Handlers
ipcMain.handle('azure-check-cli', async (event) => {
  try {
    // Use powerpipe service for Azure integration
    const azurePlugin = await powerpipeService.checkAzurePluginInstalled();
    
    return {
      success: true,
      cli: { 
        installed: azurePlugin.installed || false,
        loggedIn: azurePlugin.installed || false,
        note: azurePlugin.installed 
          ? 'Azure plugin available via Powerpipe' 
          : 'Click "Connect Azure" to set up',
      },
      auth: { authenticated: azurePlugin.installed || false },
    };
  } catch (error) {
    console.error('Azure auth check error:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to check Azure authentication status',
    };
  }
});

// Initialize Azure authentication
ipcMain.handle('azure-initialize-auth', async (event) => {
  try {
    // Azure authentication is handled via Azure CLI/SDK through powerpipe
    console.log('[IPC] Azure authentication delegated to powerpipe service');
        return {
          success: true,
      credential: null,
      method: 'azure_cli',
      message: 'Use Azure CLI or powerpipe for authentication',
        };
  } catch (error) {
    console.error('[IPC] Azure initialize auth error:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to initialize authentication. Please check your network connection.',
    };
  }
});

// Get subscription info
ipcMain.handle('azure-get-subscription-info', async (event) => {
  try {
    // Get subscriptions via powerpipe service
    const result = await powerpipeService.getAzureSubscriptions();
    return result;
  } catch (error) {
    console.error('Azure get subscription error:', error);
    return { success: false, error: error.message };
  }
});

// Get device code info for UI
ipcMain.handle('azure-get-device-code', async (event) => {
  try {
    // Device code not used - authentication via Azure CLI
    return { success: true, deviceCode: null };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Confirm device code authentication
ipcMain.handle('azure-confirm-device-code', async (event) => {
  try {
    // Device code confirmation not needed - use Azure CLI
    return { success: true, message: 'Authentication via Azure CLI' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('azure-collect-evidence', async (event, data) => {
  try {
    const { controlId, controlName, controlData, config } = data;
    
    // Use powerpipe service for evidence collection
    const control = { id: controlId, name: controlName, data: controlData };
    const result = await powerpipeService.collectControlEvidence(control, 'azure', config);
    
    return result;
  } catch (error) {
    console.error('Collect evidence error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('azure-collect-bulk-evidence', async (event, data) => {
  try {
    const { controls, config } = data;
    
    // Collect evidence for each control
    const results = [];
    for (const control of controls) {
      try {
        const result = await powerpipeService.collectControlEvidence(control, 'azure', config);
        results.push({ control, result });
      } catch (error) {
        console.error(`Failed to collect evidence for control ${control.id}:`, error);
        results.push({ control, error: error.message });
      }
    }
    
    // Create combined evidence file
    const os = require('os');
    const outputDir = path.join(os.tmpdir(), 'ofofo-evidence');
    const combinedEvidence = {
      collectedAt: new Date().toISOString(),
      totalControls: controls.length,
      results,
    };
    
    const filename = `bulk-evidence-${Date.now()}.json`;
    const filepath = path.join(outputDir, filename);
    await require('fs').promises.mkdir(outputDir, { recursive: true });
    await require('fs').promises.writeFile(filepath, JSON.stringify(combinedEvidence, null, 2), 'utf-8');
    
    const fileBuffer = await require('fs').promises.readFile(filepath);
    
    return {
      success: true,
      results,
      file: {
        filepath,
        filename,
        size: fileBuffer.length,
        buffer: fileBuffer.toString('base64'),
      },
    };
  } catch (error) {
    console.error('Bulk collect evidence error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('azure-get-applicable-controls', async (event, data) => {
  try {
    const { controls } = data;
    // For now, return all controls as applicable
    // TODO: Implement proper Azure control filtering
    const applicable = controls || [];
    return {
      success: true,
      applicable,
      total: controls.length,
      applicableCount: applicable.length,
    };
  } catch (error) {
    console.error('Get applicable controls error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('azure-get-control-mappings', async (event, data) => {
  try {
    const { controls } = data;
    // Use powerpipe service for control mapping
    const mappings = powerpipeService.mapControlsToPlugins(controls);
    return {
      success: true,
      mappings,
    };
  } catch (error) {
    console.error('Get control mappings error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('azure-set-subscription', async (event, subscriptionId) => {
  try {
    // Subscription is set automatically during evidence collection
    // This is kept for compatibility but doesn't need to do anything
    return { success: true };
  } catch (error) {
    console.error('Set subscription error:', error);
    return { success: false, error: error.message };
  }
});

// Powerpipe IPC Handlers
ipcMain.handle('powerpipe-check-installation', async (event) => {
  try {
    const [powerpipe, steampipe] = await Promise.all([
      powerpipeService.checkPowerpipeInstallation(),
      powerpipeService.checkSteampipeInstallation(),
    ]);
    return {
      success: true,
      powerpipe,
      steampipe,
    };
  } catch (error) {
    console.error('Powerpipe check installation error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('powerpipe-install-now', async (event) => {
  try {
    console.log('[IPC] Manual installation triggered');
    const result = await powerpipeInstaller.autoInstall();
    console.log('[IPC] Installation result:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('[IPC] Manual installation error:', error);
    return { 
      success: false, 
      error: error.message,
      stack: error.stack 
    };
  }
});

ipcMain.handle('powerpipe-list-plugins', async (event) => {
  try {
    const result = await powerpipeService.listAvailablePlugins();
    return {
      success: true,
      plugins: result.plugins,
      knownPlugins: Object.keys(powerpipeService.STEAMPIPE_PLUGINS),
      pluginDetails: powerpipeService.STEAMPIPE_PLUGINS,
      note: result.note,
    };
  } catch (error) {
    console.error('Powerpipe list plugins error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('powerpipe-install-plugin', async (event, pluginName) => {
  try {
    const result = await powerpipeService.installPlugin(pluginName);
    return result;
  } catch (error) {
    console.error('Powerpipe install plugin error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('powerpipe-configure-connection', async (event, data) => {
  try {
    const { pluginName, config } = data;
    const result = await powerpipeService.configurePluginConnection(pluginName, config);
    return result;
  } catch (error) {
    console.error('Powerpipe configure connection error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('powerpipe-test-connection', async (event, pluginName, config = null) => {
  try {
    const result = await powerpipeService.testConnection(pluginName, config);
    return result;
  } catch (error) {
    console.error('Powerpipe test connection error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('powerpipe-run-benchmark', async (event, data) => {
  try {
    const { pluginName, benchmarkName } = data;
    const result = await powerpipeService.runBenchmark(pluginName, benchmarkName);
    return result;
  } catch (error) {
    console.error('Powerpipe run benchmark error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('powerpipe-query-evidence', async (event, data) => {
  try {
    const { pluginName, query } = data;
    const result = await powerpipeService.queryEvidence(pluginName, query);
    return result;
  } catch (error) {
    console.error('Powerpipe query evidence error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('powerpipe-map-controls', async (event, data) => {
  try {
    const { controls } = data;
    const mappings = powerpipeService.mapControlsToPlugins(controls);
    return {
      success: true,
      mappings,
    };
  } catch (error) {
    console.error('Powerpipe map controls error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('azure-run-queries', async (event, data) => {
  try {
    const { limit = 10, subscriptionId } = data || {};
    const result = await powerpipeService.runAzureQueries(limit, subscriptionId);
    return result;
  } catch (error) {
    console.error('[IPC] Error running Azure queries:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('powerpipe-collect-evidence', async (event, data) => {
  try {
    const { control, pluginName, config } = data;
    const result = await powerpipeService.collectControlEvidence(control, pluginName, config);
    
    // Create evidence file if successful
    if (result.success && result.evidence) {
      const os = require('os');
      const outputDir = path.join(os.tmpdir(), 'ofofo-evidence');
      const filename = `powerpipe-evidence-${result.evidence.controlId}-${Date.now()}.json`;
      const filepath = path.join(outputDir, filename);
      
      await require('fs').promises.mkdir(outputDir, { recursive: true });
      await require('fs').promises.writeFile(
        filepath,
        JSON.stringify(result.evidence, null, 2),
        'utf-8'
      );
      
      const fileBuffer = await require('fs').promises.readFile(filepath);
      
      return {
        ...result,
        file: {
          filepath,
          filename,
          size: fileBuffer.length,
          buffer: fileBuffer.toString('base64'),
        },
      };
    }
    
    return result;
  } catch (error) {
    console.error('Powerpipe collect evidence error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('powerpipe-get-benchmarks', async (event, pluginName) => {
  try {
    const benchmarks = powerpipeService.getAvailableBenchmarks(pluginName);
    return {
      success: true,
      benchmarks,
    };
  } catch (error) {
    console.error('Powerpipe get benchmarks error:', error);
    return { success: false, error: error.message };
  }
});

// Azure Plugin Check Handler
ipcMain.handle('powerpipe-check-azure-plugin', async (event) => {
  try {
    const result = await powerpipeService.checkAzurePluginInstalled();
    return result;
  } catch (error) {
    console.error('Check Azure plugin error:', error);
    return { installed: false, error: error.message };
  }
});


// Powerpipe Mod Management IPC Handlers
ipcMain.handle('powerpipe-install-mod', async (event, data) => {
  try {
    const { modRepo, version } = data;
    const result = await powerpipeService.installPowerpipeMod(modRepo, version);
    return result;
  } catch (error) {
    console.error('Install mod error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('powerpipe-check-mod-installed', async (event, modRepo) => {
  try {
    const isInstalled = await powerpipeService.checkModInstalled(modRepo);
    return { success: true, installed: isInstalled };
  } catch (error) {
    console.error('Check mod installed error:', error);
    return { success: false, error: error.message, installed: false };
  }
});

ipcMain.handle('powerpipe-run-mod-benchmark', async (event, data) => {
  try {
    const { modRepo, benchmarkName, format } = data;
    const result = await powerpipeService.runPowerpipeBenchmark(modRepo, benchmarkName, format || 'md');
    return result;
  } catch (error) {
    console.error('Run mod benchmark error:', error);
    return { success: false, error: error.message };
  }
});

// List benchmarks for a mod
ipcMain.handle('powerpipe-list-benchmarks', async (event, data) => {
  try {
    const { modRepo } = data;
    const result = await powerpipeService.listModBenchmarks(modRepo);
    return result;
  } catch (error) {
    console.error('List mod benchmarks error:', error);
    return { success: false, error: error.message, benchmarks: [] };
  }
});

ipcMain.handle('powerpipe-run-mod-compliance', async (event, data) => {
  try {
    const { modId, modRepo, benchmarkId } = data;
    const result = await powerpipeService.runModCompliance(modId, modRepo, benchmarkId);
    return result;
  } catch (error) {
    console.error('Run mod compliance error:', error);
    return { success: false, error: error.message };
  }
});

// Subprocess Management IPC Handlers
ipcMain.handle('subprocess-save', async (event, data) => {
  try {
    const { userId, subprocessData } = data;
    const subprocess = await db.saveSubprocess(userId, subprocessData);
    return { success: true, subprocess };
  } catch (error) {
    console.error('Save subprocess error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('subprocess-get-all', async (event, userId) => {
  try {
    const subprocesses = await db.getUserSubprocesses(userId);
    return { success: true, subprocesses };
  } catch (error) {
    console.error('Get subprocesses error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('subprocess-get-by-id', async (event, id) => {
  try {
    const subprocess = await db.getSubprocessById(id);
    return { success: true, subprocess };
  } catch (error) {
    console.error('Get subprocess error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('subprocess-update-status', async (event, data) => {
  try {
    const { id, status } = data;
    const subprocess = await db.updateSubprocessStatus(id, status);
    return { success: true, subprocess };
  } catch (error) {
    console.error('Update subprocess status error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('subprocess-delete', async (event, id) => {
  try {
    await db.deleteSubprocess(id);
    return { success: true };
  } catch (error) {
    console.error('Delete subprocess error:', error);
    return { success: false, error: error.message };
  }
});

// Check Azure CLI installation
ipcMain.handle('subprocess-check-azure-cli', async (event) => {
  try {
    const result = await powerpipeService.checkAzureCLI();
    return result;
  } catch (error) {
    console.error('Check Azure CLI error:', error);
    return { success: false, error: error.message };
  }
});

// Install Azure CLI
ipcMain.handle('subprocess-install-azure-cli', async (event) => {
  try {
    const result = await powerpipeService.installAzureCLI();
    return result;
  } catch (error) {
    console.error('Install Azure CLI error:', error);
    return { success: false, error: error.message };
  }
});

// Authenticate with Azure CLI
ipcMain.handle('subprocess-authenticate-azure-cli', async (event) => {
  try {
    const result = await powerpipeService.authenticateWithAzureCLI();
    return result;
  } catch (error) {
    console.error('Azure CLI authentication error:', error);
    return { success: false, error: error.message };
  }
});

// Get Azure subscriptions
ipcMain.handle('subprocess-get-azure-subscriptions', async (event) => {
  try {
    const result = await powerpipeService.getAzureSubscriptions();
    return result;
  } catch (error) {
    console.error('Get Azure subscriptions error:', error);
    return { success: false, error: error.message };
  }
});

// Setup Azure integration (full flow)
ipcMain.handle('subprocess-setup-azure', async (event, data) => {
  try {
    const { subscriptionId, tenantId } = data;
    console.log('[IPC] Setting up Azure integration with subscription:', subscriptionId);
    
    // Use simple setup - no plugin install, no restart, no table fetch
    // Plugin is already installed at startup, just configure for this subscription
    const result = await powerpipeService.setupSubprocessSimple(subscriptionId, tenantId);
    return result;
  } catch (error) {
    console.error('Setup Azure integration error:', error);
    return { success: false, error: error.message };
  }
});

// Configure plugin for subscription (lazy configuration)
ipcMain.handle('subprocess-configure-plugin', async (event, subscriptionId) => {
  try {
    const result = await powerpipeService.configurePluginForSubscription(subscriptionId);
    return result;
  } catch (error) {
    console.error('Configure plugin error:', error);
    return { success: false, error: error.message };
  }
});

// Get Azure tables
ipcMain.handle('subprocess-get-azure-tables', async (event) => {
  try {
    const result = await powerpipeService.getAzureTables();
    return result;
  } catch (error) {
    console.error('Get Azure tables error:', error);
    return { success: false, error: error.message };
  }
});

// Query Steampipe
ipcMain.handle('subprocess-query-steampipe', async (event, data) => {
  try {
    const { query } = data;
    const result = await powerpipeService.querySteampipe(query);
    return result;
  } catch (error) {
    console.error('Query Steampipe error:', error);
    return { success: false, error: error.message };
  }
});

// Install Azure compliance mod
ipcMain.handle('subprocess-install-azure-mod', async (event) => {
  try {
    const result = await powerpipeService.installAzureComplianceMod();
    return result;
  } catch (error) {
    console.error('Install Azure mod error:', error);
    return { success: false, error: error.message };
  }
});

// Get available benchmarks
ipcMain.handle('subprocess-get-benchmarks', async (event, data) => {
  try {
    const { modName } = data || {};
    const result = await powerpipeService.getAvailableBenchmarks(modName);
    return result;
  } catch (error) {
    console.error('Get benchmarks error:', error);
    return { success: false, error: error.message };
  }
});

// Run benchmark
ipcMain.handle('subprocess-run-benchmark', async (event, data) => {
  try {
    const { benchmarkName } = data;
    const result = await powerpipeService.runBenchmark(benchmarkName);
    return result;
  } catch (error) {
    console.error('Run benchmark error:', error);
    return { success: false, error: error.message };
  }
});

// Dataroom Management IPC Handlers
ipcMain.handle('dataroom-save-report', async (event, data) => {
  try {
    const { fileName, content, userId, subprocessId, subprocessName, modId, benchmarkId } = data;
    
    // STEP 1: Generate UUID as file ID
    const { randomUUID } = require('crypto');
    const fileId = randomUUID();
    console.log(`[Dataroom] Generated file ID: ${fileId}`);
    
    // Get user's organization/dataroom ID for Azure upload
    let dataRoomId = userId; // Fallback to userId
    try {
      const orgId = await db.getUserOrganizationId(userId);
      if (orgId) {
        dataRoomId = orgId;
        console.log(`[Dataroom] Using organization ID: ${dataRoomId}`);
      }
    } catch (orgError) {
      console.warn('[Dataroom] Could not get organization ID, using userId:', orgError.message);
    }
    
    // STEP 2: Upload to Azure Blob Storage FIRST
    // Blob path structure: {dataroomId}/{fileId}
    let blobUrl = null;
    let encryptedBlobUrl = null;
    
    if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
      try {
        const { uploadToAzureBlob } = require('./azure-upload.js');
        const fileBuffer = Buffer.from(content, 'utf8');
        
        console.log(`[Dataroom] Uploading to Azure Blob Storage...`);
        console.log(`[Dataroom] Blob path: ${dataRoomId}/${fileId}/${fileName}`);
        
        const uploadResult = await uploadToAzureBlob(
          fileBuffer,
          fileId, // Use UUID as file ID
          dataRoomId,
          'text/markdown',
          fileName // Include filename in blob path
        );
        
        blobUrl = uploadResult.url;
        encryptedBlobUrl = uploadResult.encryptedUrl;
        
        console.log(`[Dataroom] ✓ Uploaded private blob to Azure: ${uploadResult.pathname}`);
      } catch (azureError) {
        console.error('[Dataroom] Azure upload failed:', azureError.message);
        // If Azure upload fails, we should fail the entire operation
        // since the file ID is already generated and expected in Azure
        throw new Error(`Failed to upload to Azure: ${azureError.message}`);
      }
    } else {
      console.log('[Dataroom] Azure Storage not configured, skipping cloud upload');
      // If Azure is not configured, we can still save locally, but this is not ideal
    }
    
    // STEP 3: Save file locally (backup)
    const fs = require('fs').promises;
    const path = require('path');
    const os = require('os');
    
    const dataroomDir = path.join(os.homedir(), '.ofofo', 'dataroom', subprocessName || 'general');
    await fs.mkdir(dataroomDir, { recursive: true });
    
    const filePath = path.join(dataroomDir, fileName);
    await fs.writeFile(filePath, content, 'utf8');
    console.log(`[Dataroom] Report saved locally: ${filePath}`);
    
    // Get file size
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    
    // STEP 4: Insert record into DataRoomFile table AFTER successful upload
    // Use the UUID as the file ID
    // Note: subprocessId is not stored in DataRoomFile - it's tracked in orgsubprocesses.results
    const fileRecord = await db.saveReportFileWithId(
      fileId, // Use UUID as ID
      userId,
      dataRoomId, // Organization/dataroom ID for web dataroom visibility
      fileName, 
      filePath, 
      fileSize, 
      blobUrl, 
      encryptedBlobUrl
    );
    console.log(`[Dataroom] File record created in DataRoomFile with ID: ${fileRecord.id}`);
    
    // Update subprocess results to track this analysis with file URLs
    // subprocessId is UUID string (from orgsubprocesses.id)
    if (modId && benchmarkId && subprocessId) {
      // Use the file id (UUID) from DataRoomFile
      const fileIdentifier = fileRecord.id; // DataRoomFile.id is already UUID
      await db.updateSubprocessResults(
        subprocessId, // UUID string - orgsubprocesses.id is UUID type
        modId, 
        benchmarkId, 
        fileIdentifier,
        blobUrl,
        encryptedBlobUrl
      );
      console.log(`[Dataroom] Updated subprocess results: subprocessId=${subprocessId}, mod=${modId}, benchmark=${benchmarkId}, fileId=${fileIdentifier}`);
    }
    
    return { 
      success: true, 
      filePath,
      fileId: fileRecord.id,
      blobUrl: blobUrl || undefined,
      encryptedBlobUrl: encryptedBlobUrl || undefined
    };
  } catch (error) {
    console.error('[Dataroom] Save report error:', error);
    return { success: false, error: error.message };
  }
});

// Register all IPC handlers before app is ready
console.log('[IPC] Registering IPC handlers...');

// Get installation status
ipcMain.handle('get-installation-status', async () => {
  return {
    success: true,
    status: installationStatus
  };
});

// Handle uncaught exceptions to prevent app crash
process.on('uncaughtException', (error) => {
  console.error('[App] Uncaught Exception:', error);
  console.error('[App] Stack:', error.stack);
  // Don't exit - let the app continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[App] Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - let the app continue
});

app.whenReady().then(async () => {
  console.log('[IPC] App ready, initializing...');
  console.log('[App] ========================================');
  console.log('[App] INSTALLING ALL REQUIRED COMPONENTS');
  console.log('[App] ========================================');
  
  try {
    // STEP 1: Install Powerpipe and Steampipe binaries (checks before installing)
    if (!powerpipeInstaller) {
      console.error('[App] ✗ Powerpipe installer not available - modules failed to load');
      throw new Error('Required modules not loaded');
    }
    
    console.log('[App] Step 1: Checking Powerpipe and Steampipe installation...');
    let installResult;
    try {
      installResult = await powerpipeInstaller.autoInstall();
    } catch (installError) {
      console.error('[App] ✗ Installation error:', installError);
      installResult = { success: false, error: installError.message };
    }
    
    if (!installResult.success) {
      console.error('[App] ✗ Failed to install Powerpipe/Steampipe:', installResult.error);
      console.warn('[App] Continuing anyway - app will work but some features may be unavailable');
      // Don't return - continue with other installations
      installationStatus.powerpipe = { installed: false, checked: true, timestamp: Date.now(), error: installResult.error };
      installationStatus.steampipe = { installed: false, checked: true, timestamp: Date.now(), error: installResult.error };
      saveInstallationStatus();
    } else {
      // Update installation status cache (only if installation was successful)
      if (installResult.alreadyInstalled) {
        console.log('[App] ✓ Powerpipe and Steampipe already installed (skipped)');
        installationStatus.powerpipe = { installed: true, checked: true, timestamp: Date.now() };
        installationStatus.steampipe = { installed: true, checked: true, timestamp: Date.now() };
      } else {
        console.log('[App] ✓ Powerpipe and Steampipe installed');
        installationStatus.powerpipe = { installed: true, checked: true, timestamp: Date.now() };
        installationStatus.steampipe = { installed: true, checked: true, timestamp: Date.now() };
      }
      saveInstallationStatus();
    }
    
    // STEP 2: Create symlinks for terminal access (non-critical)
    try {
      const symlinkResult = await powerpipeInstaller.createSymlinks();
      if (symlinkResult.success) {
        console.log('[App] ✓ Terminal commands available');
      }
    } catch (error) {
      console.warn('[App] Symlink creation skipped (non-critical)');
    }
    
    // STEP 3: Check and install Steampipe plugins (Azure + Azure AD) - ONLY IF NOT INSTALLED
    console.log('[App] Step 2: Checking Steampipe plugins...');
    try {
      // Check Azure plugin first
      const azurePluginCheck = await powerpipeService.checkAzurePluginInstalled();
      if (azurePluginCheck.installed) {
        console.log('[App] ✓ Azure plugin already installed');
        installationStatus.azurePlugin = { installed: true, checked: true, timestamp: Date.now() };
      } else {
        console.log('[App] Installing Azure plugin...');
        const installResult = await powerpipeService.installAzurePlugin();
        if (installResult.success) {
          console.log('[App] ✓ Azure plugin installed');
          installationStatus.azurePlugin = { installed: true, checked: true, timestamp: Date.now() };
        } else {
          console.warn('[App] ⚠️  Azure plugin installation failed:', installResult.error);
          installationStatus.azurePlugin = { installed: false, checked: true, timestamp: Date.now() };
        }
      }
      
      // Azure AD plugin - install (it handles "already installed" internally)
      console.log('[App] Checking Azure AD plugin...');
      const azureADResult = await powerpipeService.installAzureADPlugin();
      if (azureADResult.success) {
        console.log('[App] ✓ Azure AD plugin ready');
        installationStatus.azureADPlugin = { installed: true, checked: true, timestamp: Date.now() };
      } else {
        console.warn('[App] ⚠️  Azure AD plugin skipped (non-critical)');
        installationStatus.azureADPlugin = { installed: false, checked: true, timestamp: Date.now() };
      }
      
        saveInstallationStatus();
      } catch (error) {
        console.warn('[App] Plugin check/installation failed:', error.message);
      }
    }
    
    // STEP 4: Check and install popular Powerpipe mods - ONLY IF NOT INSTALLED
    if (!powerpipeService) {
      console.warn('[App] ⚠️  Powerpipe service not available - skipping mod installation');
    } else {
      console.log('[App] Step 3: Checking compliance mods...');
      
      try {
        const { AZURE_MODS } = require('./azure-mods');
        
        // Check each mod before installing
        for (const mod of AZURE_MODS) {
      try {
        const modCheck = await powerpipeService.checkModInstalled(mod.repo);
        if (modCheck) {
          console.log(`[App]   ✓ ${mod.name} already installed`);
        } else {
          console.log(`[App]   Installing ${mod.name}...`);
          const result = await powerpipeService.installPowerpipeMod(mod.repo);
          if (result.success) {
            console.log(`[App]   ✓ ${mod.name} installed`);
          } else {
            console.warn(`[App]   ⚠️  ${mod.name} installation failed:`, result.error);
          }
        }
      } catch (error) {
        console.warn(`[App]   ⚠️  ${mod.name} check/install error:`, error.message);
      }
    }
    
    console.log('[App]   ✓ Mod check/installation complete');
    
    // STEP 5: Check and install Azure CLI if needed (ONLY IF NOT INSTALLED)
    console.log('[App] Step 4: Checking Azure CLI...');
    try {
      const cliCheck = await powerpipeService.checkAzureCLI();
      if (cliCheck.installed) {
        console.log('[App] ✓ Azure CLI already installed');
        installationStatus.azureCLI = { installed: true, checked: true, timestamp: Date.now() };
      } else {
        console.log('[App] Azure CLI not found, installing...');
        const installResult = await powerpipeService.installAzureCLI();
        if (installResult.success) {
          console.log('[App] ✓ Azure CLI installed');
          installationStatus.azureCLI = { installed: true, checked: true, timestamp: Date.now() };
        } else {
          console.warn('[App] ⚠️  Azure CLI installation failed (user can install manually):', installResult.error);
          installationStatus.azureCLI = { installed: false, checked: true, timestamp: Date.now() };
        }
      }
      saveInstallationStatus();
    } catch (error) {
        console.warn('[App] Azure CLI check failed (non-critical):', error.message);
        installationStatus.azureCLI = { installed: false, checked: true, timestamp: Date.now() };
        saveInstallationStatus();
      }
    }
    
    console.log('[App] ========================================');
    console.log('[App] ✓ ALL COMPONENTS CHECKED/INSTALLED');
    console.log('[App] ========================================');
    
  } catch (error) {
    console.error('[App] Installation failed:', error);
    console.error('[App] Error stack:', error.stack);
    // Continue anyway - create window so user can see error
  }
  
  console.log('[App] Creating window...');
  try {
    createWindow();
  } catch (windowError) {
    console.error('[App] Failed to create window:', windowError);
    console.error('[App] Error stack:', windowError.stack);
    // Try to show error dialog
    try {
      const { dialog } = require('electron');
      dialog.showErrorBox('Application Error', 
        `Failed to start application:\n\n${windowError.message}\n\nPlease check the console logs for details.`
      );
    } catch (dialogError) {
      // If dialog also fails, at least log it
      console.error('[App] Failed to show error dialog:', dialogError);
    }
  }
});

app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    // Allow opening external links in default browser
    require('electron').shell.openExternal(navigationUrl);
  });
});
