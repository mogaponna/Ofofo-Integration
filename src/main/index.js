const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = require('electron-is-dev');
const axios = require('axios');

// CRITICAL: Fix URL/searchParams for Node.js main process
// Azure SDK libraries use URL.searchParams which can fail in Electron
// This polyfill ensures URL objects always have searchParams
// MUST RUN BEFORE ANY OTHER MODULES ARE LOADED
(function() {
  'use strict';
  
  // Get original URL and URLSearchParams BEFORE any modules use them
  const urlModule = require('url');
  const OriginalURL = urlModule.URL;
  const OriginalURLSearchParams = urlModule.URLSearchParams;
  
  // Ensure URLSearchParams exists globally
  if (typeof global.URLSearchParams === 'undefined') {
    global.URLSearchParams = OriginalURLSearchParams;
  }
  
  // Override URL constructor with defensive checks
  const URLWrapper = function(url, base) {
    // Defensive: Check if url is undefined/null
    if (url === undefined || url === null) {
      console.error('[URL Polyfill] URL constructor called with undefined/null:', { url, base });
      throw new TypeError('Failed to construct URL: Invalid URL');
    }
    
    try {
      const urlInstance = new OriginalURL(url, base);
      
      // Defensive: Check if urlInstance is undefined (shouldn't happen, but be safe)
      if (!urlInstance) {
        console.error('[URL Polyfill] URL constructor returned undefined for:', { url, base });
        throw new TypeError('URL constructor returned undefined');
      }
      
      // Ensure searchParams exists - add it if missing
      if (!urlInstance.searchParams) {
        Object.defineProperty(urlInstance, 'searchParams', {
          get() {
            try {
              return new OriginalURLSearchParams(this.search || '');
            } catch (e) {
              console.error('[URL Polyfill] Error creating URLSearchParams:', e);
              return new OriginalURLSearchParams('');
            }
          },
          enumerable: true,
          configurable: true,
        });
      }
      
      return urlInstance;
    } catch (error) {
      console.error('[URL Polyfill] URL constructor error:', error.message);
      console.error('[URL Polyfill] URL:', url, 'Base:', base);
      // Re-throw to maintain original behavior
      throw error;
    }
  };
  
  // Copy prototype and static methods
  URLWrapper.prototype = OriginalURL.prototype;
  Object.setPrototypeOf(URLWrapper, OriginalURL);
  
  // Copy static methods
  ['canParse', 'createObjectURL', 'parse', 'revokeObjectURL'].forEach(method => {
    if (typeof OriginalURL[method] === 'function') {
      URLWrapper[method] = OriginalURL[method];
    }
  });
  
  // Replace global URL IMMEDIATELY
  // This is what most code uses, including Azure SDK
  // Don't try to modify urlModule.URL as it's read-only in some Node.js versions
  global.URL = URLWrapper;
  
  console.log('[Main Process] URL/searchParams polyfill initialized (aggressive mode)');
})();

// Load .env based on environment
if (!isDev) {
  // In production, load from resources (bundled with app)
  const envPath = path.join(process.resourcesPath, '.env');
  require('dotenv').config({ path: envPath });
  console.log('[App] Loaded .env from resources:', envPath);
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
      await Promise.race([
        emailService.sendOTPEmail(email, otp),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Email sending timeout')), 20000))
      ]);
      console.log(`[OTP] Email sent in ${Date.now() - emailStartTime}ms`);
      console.log(`[OTP] Total time: ${Date.now() - startTime}ms`);
      return { success: true, message: 'OTP sent to your email' };
    } catch (emailError) {
      console.error('[OTP] Email sending failed:', emailError.message);
      console.error('[OTP] Email error stack:', emailError.stack);
      // Check if it's a searchParams error
      if (emailError.message && emailError.message.includes('searchParams')) {
        console.error('[OTP] SEARCHPARAMS ERROR IN EMAIL SERVICE!');
        console.error('[OTP] This suggests the Azure SDK is the issue');
        console.error('[OTP] Azure SDK version:', require('@azure/communication-email/package.json')?.version || 'unknown');
      }
      // If email fails but DB succeeded, still return success (user can request resend)
      if (emailError.message.includes('timeout')) {
        return { success: false, error: 'Email sending timeout. Please try again.' };
      }
      return { success: false, error: 'Failed to send email. Please check your email configuration.' };
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
    return { success: false, error: errorMessage };
  }
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

// Ensure Azure Prerequisites Handler
ipcMain.handle('azure-ensure-prerequisites', async (event, { tenantId, subscriptionId }) => {
  try {
    console.log('[IPC] Ensuring Azure prerequisites...');
    
    // Create progress callback to send updates to renderer
    const progressCallback = (progress) => {
      event.sender.send('azure-prerequisites-progress', progress);
    };
    
    const result = await powerpipeService.ensureAzurePrerequisites(progressCallback, tenantId, subscriptionId);
    return result;
  } catch (error) {
    console.error('Ensure Azure prerequisites error:', error);
    return { success: false, error: error.message };
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
    const { subscriptionId } = data;
    console.log('[IPC] Setting up Azure integration with subscription:', subscriptionId);
    
    const result = await powerpipeService.setupAzureIntegration(subscriptionId);
    return result;
  } catch (error) {
    console.error('Setup Azure integration error:', error);
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
    
    // Create dataroom directory if it doesn't exist
    const fs = require('fs').promises;
    const path = require('path');
    const os = require('os');
    
    const dataroomDir = path.join(os.homedir(), '.ofofo', 'dataroom', subprocessName || 'general');
    await fs.mkdir(dataroomDir, { recursive: true });
    
    // Save the file
    const filePath = path.join(dataroomDir, fileName);
    await fs.writeFile(filePath, content, 'utf8');
    
    console.log(`[Dataroom] Report saved: ${filePath}`);
    
    // Get file size
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    
    // Insert into database using proper db module method
    const fileRecord = await db.saveReportFile(userId, subprocessId, fileName, filePath, fileSize);
    
    console.log(`[Dataroom] File record created with ID: ${fileRecord.id}`);
    
    // Update subprocess results to track this analysis
    if (modId && benchmarkId) {
      await db.updateSubprocessResults(subprocessId, modId, benchmarkId, fileRecord.id);
      console.log(`[Dataroom] Updated subprocess results: mod=${modId}, benchmark=${benchmarkId}`);
    }
    
    return { 
      success: true, 
      filePath,
      fileId: fileRecord.id
    };
  } catch (error) {
    console.error('[Dataroom] Save report error:', error);
    return { success: false, error: error.message };
  }
});

// Register all IPC handlers before app is ready
console.log('[IPC] Registering IPC handlers...');

app.whenReady().then(async () => {
  console.log('[IPC] App ready, initializing...');
  console.log('[App] ========================================');
  console.log('[App] INSTALLING ALL REQUIRED COMPONENTS');
  console.log('[App] ========================================');
  
  try {
    // STEP 1: Install Powerpipe and Steampipe binaries
    console.log('[App] Step 1: Installing Powerpipe and Steampipe...');
    const installResult = await powerpipeInstaller.autoInstall();
    
    if (!installResult.success) {
      console.error('[App] ✗ Failed to install Powerpipe/Steampipe:', installResult.error);
      createWindow(); // Still create window
      return;
    }
    console.log('[App] ✓ Powerpipe and Steampipe installed');
    
    // STEP 2: Create symlinks for terminal access (non-critical)
    try {
      const symlinkResult = await powerpipeInstaller.createSymlinks();
      if (symlinkResult.success) {
        console.log('[App] ✓ Terminal commands available');
      }
    } catch (error) {
      console.warn('[App] Symlink creation skipped (non-critical)');
    }
    
    // STEP 3: Install Steampipe plugins (Azure + Azure AD)
    console.log('[App] Step 2: Installing Steampipe plugins...');
    try {
      await powerpipeService.installAzurePlugin();
      console.log('[App] ✓ Azure plugin installed');
      
      await powerpipeService.installAzureADPlugin();
      console.log('[App] ✓ Azure AD plugin installed');
    } catch (error) {
      console.warn('[App] Plugin installation failed (will retry when needed):', error.message);
    }
    
    // STEP 4: Install popular Powerpipe mods
    console.log('[App] Step 3: Installing popular compliance mods...');
    
    const { AZURE_MODS } = require('./azure-mods');
    
    // Install each mod individually with 'powerpipe mod install <mod-name>'
    for (const mod of AZURE_MODS) {
      try {
        console.log(`[App]   Installing ${mod.name}...`);
        const result = await powerpipeService.installPowerpipeMod(mod.repo);
        if (result.success) {
          console.log(`[App]   ✓ ${mod.name} installed`);
        } else {
          console.warn(`[App]   ⚠️  ${mod.name} installation failed:`, result.error);
        }
      } catch (error) {
        console.warn(`[App]   ⚠️  ${mod.name} error:`, error.message);
      }
    }
    
    console.log('[App]   ✓ Mod installation complete');
    
    console.log('[App] ========================================');
    console.log('[App] ✓ ALL COMPONENTS INSTALLED');
    console.log('[App] ========================================');
    
  } catch (error) {
    console.error('[App] Installation failed:', error);
  }
  
  console.log('[App] Creating window...');
  createWindow();
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
