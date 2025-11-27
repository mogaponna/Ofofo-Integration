const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = promisify(exec);
const powerpipeInstaller = require('./powerpipe-installer');

/**
 * Simplified Powerpipe Service
 * Uses Azure CLI for authentication
 * Steampipe installed on app startup
 */

// Steampipe plugins configuration
const STEAMPIPE_PLUGINS = {
  azure: {
    name: 'azure',
    connection: 'azure',
    displayName: 'Microsoft Azure',
    description: 'Query Azure resources',
  },
  aws: {
    name: 'aws',
    connection: 'aws',
    displayName: 'Amazon Web Services',
    description: 'Query AWS resources',
  },
  gcp: {
    name: 'gcp',
    connection: 'gcp',
    displayName: 'Google Cloud Platform',
    description: 'Query GCP resources',
  },
};

/**
 * Initialize Steampipe on app startup
 * Installs Steampipe if not already installed
 */
async function initializeSteampipe() {
  try {
    console.log('[Steampipe] Checking Steampipe installation...');
    
    // Ensure Steampipe is installed (checkInstallation returns both powerpipe and steampipe)
    const installCheck = await powerpipeInstaller.checkInstallation();
    if (!installCheck.steampipe || !installCheck.steampipe.installed) {
      console.log('[Steampipe] Installing Steampipe...');
      const installResult = await powerpipeInstaller.installSteampipe();
      if (!installResult.success) {
        return { success: false, error: 'Failed to install Steampipe' };
      }
    }
    
    console.log('[Steampipe] ✓ Steampipe installed');
    
    // Start Steampipe service
    await startSteampipeService();
    
    return { success: true, message: 'Steampipe initialized successfully' };
  } catch (error) {
    console.error('[Steampipe] Initialization failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Kill stuck Steampipe processes
 */
async function killStuckSteampipeProcesses() {
  try {
    const platform = process.platform;
    
    if (platform === 'darwin' || platform === 'linux') {
      // Kill all steampipe processes
      await execAsync('pkill -9 steampipe 2>/dev/null || true', { timeout: 5000 });
      // Kill postgres processes related to steampipe
      await execAsync('pkill -9 -f "postgres.*steampipe" 2>/dev/null || true', { timeout: 5000 });
      // Kill processes on port 9193 (Steampipe's port)
      await execAsync('lsof -ti:9193 | xargs kill -9 2>/dev/null || true', { timeout: 5000 });
      
      console.log('[Steampipe] ✓ Killed any stuck processes');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return { success: true };
  } catch (error) {
    console.warn('[Steampipe] Cleanup warning:', error.message);
    return { success: true }; // Continue anyway
  }
}

/**
 * Start Steampipe service
 */
/**
 * Check if Steampipe service is ready to accept connections
 */
async function checkSteampipeServiceReady() {
  try {
    const steampipeCmd = powerpipeInstaller.getSteampipeCommand();
    
    // Try to query the service - if it responds, it's ready
    const { stdout } = await execAsync(
      `"${steampipeCmd}" query "SELECT 1" --output json`,
      { timeout: 5000 }
    );
    
    // If we get a response, service is ready
    return true;
  } catch (error) {
    // Service not ready yet
    return false;
  }
}

async function startSteampipeService() {
  try {
    const steampipeCmd = powerpipeInstaller.getSteampipeCommand();
    
    // Aggressive cleanup first
    console.log('[Steampipe] Cleaning up any stuck processes...');
    await killStuckSteampipeProcesses();
    
    // Stop any existing service
    try {
      await execAsync(`"${steampipeCmd}" service stop --force`, { timeout: 10000 });
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {
      // Service might not be running, that's fine
      console.log('[Steampipe] Service stop:', e.message.includes('not running') ? 'not running' : 'stopped');
    }
    
    // One more cleanup to be sure
    await killStuckSteampipeProcesses();
    
    // Start service fresh
    await execAsync(`"${steampipeCmd}" service start`, { timeout: 30000 });
    console.log('[Steampipe] ✓ Service started');
    
    // Wait for service to be ready
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    return { success: true };
  } catch (error) {
    console.error('[Steampipe] Failed to start service:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if Azure CLI is installed
 */
async function checkAzureCLI() {
  try {
    const { stdout } = await execAsync('az --version', { timeout: 5000 });
    return { installed: true, version: stdout.split('\n')[0] };
  } catch (error) {
    return { installed: false };
  }
}

/**
 * Install Azure CLI
 */
async function installAzureCLI() {
  try {
    console.log('[Azure CLI] Installing Azure CLI...');
    
    const platform = process.platform;
    
    if (platform === 'darwin') {
      // macOS: Use Homebrew
      await execAsync('brew install azure-cli', { timeout: 300000 });
    } else if (platform === 'linux') {
      // Linux: Use curl install script
      await execAsync('curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash', { timeout: 300000 });
    } else if (platform === 'win32') {
      // Windows: Download and run MSI
      return { 
        success: false, 
        error: 'Please install Azure CLI manually from https://aka.ms/installazurecliwindows' 
      };
    }
    
    console.log('[Azure CLI] ✓ Azure CLI installed');
    return { success: true };
  } catch (error) {
    console.error('[Azure CLI] Installation failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Authenticate with Azure using Azure CLI
 * This opens a browser for the user to login
 */
async function authenticateWithAzureCLI() {
  try {
    // First check if already authenticated
    try {
      const { stdout } = await execAsync('az account show --output json', { timeout: 5000 });
      const account = JSON.parse(stdout);
      if (account && account.id) {
        console.log('[Azure CLI] ✓ Already authenticated');
        // Get all accounts
        const accountsResult = await execAsync('az account list --output json', { timeout: 10000 });
        const accounts = JSON.parse(accountsResult.stdout);
        return { 
          success: true, 
          authenticated: true,
          accounts: accounts || [account],
          message: 'Azure CLI already authenticated'
        };
      }
    } catch (checkError) {
      // Not authenticated, proceed with login
      console.log('[Azure CLI] Not authenticated, starting login...');
    }
    
    console.log('[Azure CLI] Starting authentication...');
    
    // Run az login only if not authenticated
    const { stdout } = await execAsync('az login --output json', { timeout: 120000 });
    const accounts = JSON.parse(stdout);
    
    if (!accounts || accounts.length === 0) {
      return { success: false, authenticated: false, error: 'No Azure accounts found' };
    }
    
    console.log('[Azure CLI] ✓ Authentication successful');
    console.log(`[Azure CLI] Found ${accounts.length} subscription(s)`);
    
    return { 
      success: true, 
      authenticated: true,
      accounts,
      message: 'Azure CLI authentication successful'
    };
  } catch (error) {
    console.error('[Azure CLI] Authentication failed:', error);
    return { success: false, authenticated: false, error: error.message };
  }
}

/**
 * Get Azure subscriptions from Azure CLI
 */
async function getAzureSubscriptions() {
  try {
    const { stdout } = await execAsync('az account list --output json', { timeout: 30000 });
    const subscriptions = JSON.parse(stdout);
    
    return { 
      success: true, 
      subscriptions: subscriptions.map(sub => ({
        id: sub.id,
        name: sub.name,
        tenantId: sub.tenantId,
        state: sub.state,
        isDefault: sub.isDefault || false,
      }))
    };
  } catch (error) {
    console.error('[Azure CLI] Failed to get subscriptions:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Set default Azure subscription
 */
async function setAzureSubscription(subscriptionId) {
  try {
    await execAsync(`az account set --subscription "${subscriptionId}"`, { timeout: 10000 });
    console.log(`[Azure CLI] ✓ Set default subscription: ${subscriptionId}`);
    return { success: true };
  } catch (error) {
    console.error('[Azure CLI] Failed to set subscription:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Install Azure plugin for Steampipe
 */
async function installAzurePlugin() {
  try {
    console.log('[Steampipe] Installing Azure plugin...');
    const steampipeCmd = powerpipeInstaller.getSteampipeCommand();
    
    // Use spawn for long-running plugin install to avoid timeout
    return new Promise((resolve, reject) => {
      const child = spawn(steampipeCmd, ['plugin', 'install', 'azure']);
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          console.log('[Steampipe] ✓ Azure plugin installed');
          resolve({ success: true });
        } else if (stderr.includes('already installed') || stdout.includes('already installed')) {
          console.log('[Steampipe] Azure plugin already installed');
          resolve({ success: true });
        } else {
          console.error('[Steampipe] Plugin install failed:', stderr);
          resolve({ success: false, error: stderr || 'Installation failed' });
        }
      });
      
      child.on('error', (error) => {
        console.error('[Steampipe] Plugin install error:', error);
        resolve({ success: false, error: error.message });
      });
      
      // Timeout after 5 minutes
      setTimeout(() => {
        child.kill();
        resolve({ success: false, error: 'Installation timed out after 5 minutes' });
      }, 300000);
    });
  } catch (error) {
    console.error('[Steampipe] Failed to install Azure plugin:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Install Azure AD plugin for Steampipe (required for Azure Compliance mod)
 */
async function installAzureADPlugin() {
  try {
    console.log('[Steampipe] Installing Azure AD plugin...');
    const steampipeCmd = powerpipeInstaller.getSteampipeCommand();
    
    // Use spawn for long-running plugin install
    return new Promise((resolve, reject) => {
      const child = spawn(steampipeCmd, ['plugin', 'install', 'azuread']);
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          console.log('[Steampipe] ✓ Azure AD plugin installed');
          resolve({ success: true });
        } else if (stderr.includes('already installed') || stdout.includes('already installed')) {
          console.log('[Steampipe] Azure AD plugin already installed');
          resolve({ success: true });
        } else {
          console.error('[Steampipe] Azure AD plugin install failed:', stderr);
          resolve({ success: false, error: stderr || 'Installation failed' });
        }
      });
      
      child.on('error', (error) => {
        console.error('[Steampipe] Azure AD plugin install error:', error);
        resolve({ success: false, error: error.message });
      });
      
      // Timeout after 5 minutes
      setTimeout(() => {
        child.kill();
        resolve({ success: false, error: 'Installation timed out after 5 minutes' });
      }, 300000);
    });
  } catch (error) {
    console.error('[Steampipe] Failed to install Azure AD plugin:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Configure Azure plugin connection
 */
async function configureAzurePlugin(subscriptionId) {
  try {
    const os = require('os');
    const homeDir = os.homedir();
    const configDir = path.join(homeDir, '.steampipe', 'config');
    const configFile = path.join(configDir, 'azure.spc');
    
    // Ensure config directory exists
    await fs.mkdir(configDir, { recursive: true });
    
    // Write Azure config
    // Steampipe will use Azure CLI authentication automatically
    // NOTE: Do NOT use "subscription_ids" (causes plugin to fail)
    // Azure CLI authentication will use the default subscription
    const configContent = `connection "azure" {
  plugin = "azure"
}
`;
    
    await fs.writeFile(configFile, configContent, 'utf-8');
    console.log('[Steampipe] ✓ Azure plugin configured');
    
    return { success: true, configFile };
  } catch (error) {
    console.error('[Steampipe] Failed to configure Azure plugin:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Restart Steampipe service to load new configuration
 */
async function restartSteampipeService() {
  try {
    const steampipeCmd = powerpipeInstaller.getSteampipeCommand();
    
    // Aggressive cleanup
    console.log('[Steampipe] Cleaning up for restart...');
    await killStuckSteampipeProcesses();
    
    // Stop service
    try {
      await execAsync(`"${steampipeCmd}" service stop --force`, { timeout: 15000 });
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {
      console.log('[Steampipe] Stop during restart:', e.message);
    }
    
    // Final cleanup
    await killStuckSteampipeProcesses();
    
    // Start service fresh
    await execAsync(`"${steampipeCmd}" service start`, { timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('[Steampipe] ✓ Service restarted');
    return { success: true };
  } catch (error) {
    console.error('[Steampipe] Failed to restart service:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if Azure plugin is installed
 */
async function checkAzurePluginInstalled() {
  try {
    // First, ensure service is ready (plugin list requires service to be running)
    let serviceReady = false;
    for (let i = 0; i < 5; i++) {
      const ready = await checkSteampipeServiceReady();
      if (ready) {
        serviceReady = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    }
    
    if (!serviceReady) {
      console.warn('[Steampipe] Service not ready, cannot check plugins');
      return { success: false, error: 'Steampipe service is not ready', installed: false };
    }
    
    const steampipeCmd = powerpipeInstaller.getSteampipeCommand();
    
    // Retry plugin list check (service might need a moment after restart)
    let plugins = null;
    let lastError = null;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { stdout } = await execAsync(`"${steampipeCmd}" plugin list --output json`, { timeout: 10000 });
        plugins = JSON.parse(stdout);
        break; // Success, exit retry loop
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          console.log(`[Steampipe] Plugin list attempt ${attempt} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
        }
      }
    }
    
    if (!plugins) {
      console.warn('[Steampipe] Error checking plugin after retries:', lastError?.message);
      return { success: false, error: lastError?.message || 'Failed to list plugins', installed: false };
    }
    
    // Check if azure plugin exists in the list
    const azurePlugin = plugins.items?.find(p => p.name === 'azure' || p.name === 'turbot/azure');
    
    if (azurePlugin) {
      console.log('[Steampipe] ✓ Azure plugin is installed:', azurePlugin.name, azurePlugin.version);
      return { success: true, installed: true, plugin: azurePlugin };
    }
    
    console.log('[Steampipe] Azure plugin is NOT installed');
    return { success: true, installed: false };
  } catch (error) {
    console.warn('[Steampipe] Error checking plugin:', error.message);
    return { success: false, error: error.message, installed: false };
  }
}

/**
 * Get all available Azure tables from Steampipe
 * Waits for tables to be loaded after service restart
 */
async function getAzureTables(maxRetries = 10) {
  const steampipeCmd = powerpipeInstaller.getSteampipeCommand();
  
  // Skip plugin check - plugin is installed at app startup
  // This prevents redundant "plugin not installed" messages
  console.log('[Steampipe] Fetching Azure tables...');
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`[Steampipe] Checking for Azure tables (attempt ${i + 1}/${maxRetries})...`);
      
      const query = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'azure' ORDER BY table_name";
      console.log(`[Steampipe] Running query: ${query}`);
      
      const { stdout, stderr } = await execAsync(`"${steampipeCmd}" query "${query}" --output json`, { timeout: 30000 });
      
      console.log(`[Steampipe] Query stdout length: ${stdout.length}`);
      console.log(`[Steampipe] Query stdout: ${stdout.substring(0, 500)}`);
      if (stderr) {
        console.log(`[Steampipe] Query stderr: ${stderr}`);
      }
      
      const results = JSON.parse(stdout);
      console.log(`[Steampipe] Parsed results type:`, typeof results);
      console.log(`[Steampipe] Parsed results keys:`, Object.keys(results || {}));
      
      // Handle different result formats
      let tables = [];
      if (Array.isArray(results)) {
        console.log(`[Steampipe] Results is array with ${results.length} items`);
        tables = results.map(row => row.table_name);
      } else if (results && results.rows && Array.isArray(results.rows)) {
        console.log(`[Steampipe] Results.rows is array with ${results.rows.length} items`);
        tables = results.rows.map(row => row.table_name);
      } else {
        console.log(`[Steampipe] Unrecognized result format:`, JSON.stringify(results).substring(0, 200));
      }
      
      if (tables.length > 0) {
        console.log(`[Steampipe] ✓ Found ${tables.length} Azure tables (Expected: 173 tables)`);
        console.log(`[Steampipe] Sample tables:`, tables.slice(0, 10));
        return { success: true, tables };
      }
      
      // No tables yet, wait and retry
      if (i === 0) {
        console.log(`[Steampipe] No tables found yet, plugin may still be loading...`);
      }
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.log(`[Steampipe] Table check error (attempt ${i + 1}):`, error.message);
      console.log(`[Steampipe] Error stdout:`, error.stdout);
      console.log(`[Steampipe] Error stderr:`, error.stderr);
      
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        return { success: false, error: error.message };
      }
    }
  }
  
  return { success: false, error: 'No Azure tables found after maximum retries. Plugin may not be configured correctly.' };
}

/**
 * Query Steampipe for data
 */
async function querySteampipe(query) {
  try {
    const steampipeCmd = powerpipeInstaller.getSteampipeCommand();
    const { stdout } = await execAsync(`"${steampipeCmd}" query "${query}" --output json`, { timeout: 60000 });
    
    const results = JSON.parse(stdout);
    return { success: true, data: results };
  } catch (error) {
    console.error('[Steampipe] Query failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Setup Azure integration
 * This is called when user adds Azure subprocess
 */
async function setupAzureIntegration(subscriptionId) {
  try {
    console.log('[Azure Setup] Starting Azure integration setup...');
    console.log('[Azure Setup] Using subscription:', subscriptionId);
    
    // Note: Authentication and CLI check are already done in the UI flow
    // We skip those steps here to avoid double authentication
    
    // 1. Set the selected subscription (user already authenticated)
    if (subscriptionId) {
      const setSubResult = await setAzureSubscription(subscriptionId);
      if (!setSubResult.success) {
        return setSubResult;
      }
    }
    
    // 2. Get subscriptions (to return in response)
    const subsResult = await getAzureSubscriptions();
    if (!subsResult.success) {
      return subsResult;
    }
    
    // 3. Install Azure plugin
    const pluginResult = await installAzurePlugin();
    if (!pluginResult.success) {
      return pluginResult;
    }
    
    // 4. Configure Azure plugin
    const configResult = await configureAzurePlugin(subscriptionId);
    if (!configResult.success) {
      return configResult;
    }
    
    // 5. Restart Steampipe service
    const restartResult = await restartSteampipeService();
    if (!restartResult.success) {
      return restartResult;
    }
    
    // 6. Get available tables
    const tablesResult = await getAzureTables();
    if (!tablesResult.success) {
      return tablesResult;
    }
    
    console.log('[Azure Setup] ✓ Azure integration setup complete');
    return {
      success: true,
      subscriptions: subsResult.subscriptions,
      tables: tablesResult.tables,
      message: 'Azure integration setup complete'
    };
  } catch (error) {
    console.error('[Azure Setup] Setup failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Install Powerpipe Azure compliance mod
 * Contains CIS, NIST, PCI-DSS, and other benchmarks
 */
async function installAzureComplianceMod() {
  try {
    console.log('[Powerpipe] Installing Azure compliance mod...');
    const powerpipeCmd = powerpipeInstaller.getPowerpipeCommand();
    
    // Install the mod
    await execAsync(`"${powerpipeCmd}" mod install github.com/turbot/steampipe-mod-azure-compliance`, { timeout: 120000 });
    
    console.log('[Powerpipe] ✓ Azure compliance mod installed');
    return { success: true };
  } catch (error) {
    // Mod might already be installed
    if (error.message && error.message.includes('already installed')) {
      console.log('[Powerpipe] Azure compliance mod already installed');
      return { success: true };
    }
    console.error('[Powerpipe] Failed to install Azure compliance mod:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get available benchmarks from Powerpipe mods
 */
async function getAvailableBenchmarks(modName = 'azure_compliance') {
  try {
    const powerpipeCmd = powerpipeInstaller.getPowerpipeCommand();
    
    // List all benchmarks
    const { stdout } = await execAsync(`"${powerpipeCmd}" benchmark list --mod ${modName} --output json`, { timeout: 30000 });
    
    const benchmarks = JSON.parse(stdout);
    console.log(`[Powerpipe] Found ${benchmarks.length} benchmarks`);
    
    return { success: true, benchmarks };
  } catch (error) {
    console.error('[Powerpipe] Failed to get benchmarks:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Run a Powerpipe benchmark to get control results
 */
async function runBenchmark(benchmarkName = 'azure_compliance.benchmark.cis_v200') {
  try {
    console.log(`[Powerpipe] Running benchmark: ${benchmarkName}...`);
    const powerpipeCmd = powerpipeInstaller.getPowerpipeCommand();
    
    // Run benchmark and get results
    const { stdout } = await execAsync(`"${powerpipeCmd}" benchmark run ${benchmarkName} --output json`, { timeout: 180000 });
    
    const results = JSON.parse(stdout);
    console.log(`[Powerpipe] ✓ Benchmark complete`);
    
    return { success: true, results };
  } catch (error) {
    console.error('[Powerpipe] Failed to run benchmark:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Run Azure pre-built queries and generate MD report
 */
async function runAzureQueries(limit = 10, subscriptionId = null) {
  const steampipeCmd = powerpipeInstaller.getSteampipeCommand();
  const fs = require('fs').promises;
  const results = [];
  
  console.log(`[Azure Queries] Running ${limit} Azure queries...`);
  
  console.log('[Azure Queries] Setting up Azure plugin from scratch...');
  
  if (!subscriptionId) {
    return { success: false, error: 'Subscription ID is required' };
  }
  
  // STEP 1: Stop service completely
  console.log('[Azure Queries] Step 1: Stopping Steampipe service...');
  try {
    await execAsync(`"${steampipeCmd}" service stop --force`, { timeout: 15000 });
    await new Promise(resolve => setTimeout(resolve, 3000));
  } catch (e) {
    console.log('[Azure Queries] Service stop:', e.message);
  }
  
  await killStuckSteampipeProcesses();
  
  // STEP 2: Configure plugin (while service is stopped)
  console.log(`[Azure Queries] Step 2: Writing Azure config for subscription: ${subscriptionId}`);
  const configResult = await configureAzurePlugin(subscriptionId);
  if (!configResult.success) {
    return { success: false, error: 'Failed to configure Azure plugin: ' + configResult.error };
  }
  
  // STEP 3: Install plugin (while service is stopped)
  console.log('[Azure Queries] Step 3: Installing Azure plugin...');
  const installResult = await installAzurePlugin();
  if (!installResult.success) {
    return { success: false, error: 'Failed to install Azure plugin: ' + installResult.error };
  }
  
  // STEP 4: Start service fresh
  console.log('[Azure Queries] Step 4: Starting Steampipe service with new config...');
  try {
    await execAsync(`"${steampipeCmd}" service start`, { timeout: 30000 });
  } catch (e) {
    console.log('[Azure Queries] Service start warning:', e.message);
  }
  
  // STEP 5: Wait for plugin to load (MUCH longer)
  console.log('[Azure Queries] Step 5: Waiting for Azure plugin to initialize (60 seconds)...');
  await new Promise(resolve => setTimeout(resolve, 60000));
  
  // STEP 6: Verify tables exist
  console.log('[Azure Queries] Step 6: Verifying Azure tables are available...');
  let tablesFound = false;
  for (let i = 0; i < 5; i++) {
    try {
      const testQuery = 'SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = \'azure\'';
      const { stdout } = await execAsync(`"${steampipeCmd}" query "${testQuery}" --output json`, { timeout: 15000 });
      const result = JSON.parse(stdout);
      
      const count = parseInt(result.rows?.[0]?.table_count || result[0]?.table_count || '0');
      console.log(`[Azure Queries] Found ${count} Azure tables`);
      
      if (count > 0) {
        console.log(`[Azure Queries] ✓ Azure plugin loaded successfully with ${count} tables!`);
        tablesFound = true;
        break;
      }
      
      console.log(`[Azure Queries] No tables yet, waiting 10 more seconds... (attempt ${i + 1}/5)`);
      await new Promise(resolve => setTimeout(resolve, 10000));
    } catch (e) {
      console.log(`[Azure Queries] Verification attempt ${i + 1} error:`, e.message);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  
  if (!tablesFound) {
    return { 
      success: false, 
      error: 'Azure plugin failed to load after 110+ seconds. Please try manually: steampipe service stop --force && steampipe service start && steampipe query "SELECT * FROM azure_subscription LIMIT 1"' 
    };
  }
  
  const queriesToRun = AZURE_QUERIES.slice(0, limit);
  
  for (let i = 0; i < queriesToRun.length; i++) {
    const queryDef = queriesToRun[i];
    console.log(`\n[Azure Queries] (${i + 1}/${limit}) ${queryDef.name}`);
    console.log(`[Azure Queries] Category: ${queryDef.category}`);
    console.log(`[Azure Queries] Query: ${queryDef.query}`);
    
    try {
      const { stdout } = await execAsync(`"${steampipeCmd}" query "${queryDef.query}" --output json`, { timeout: 60000 });
      const data = JSON.parse(stdout);
      
      let rows = [];
      if (Array.isArray(data)) {
        rows = data;
      } else if (data && data.rows) {
        rows = data.rows;
      }
      
      console.log(`[Azure Queries] ✓ Success: ${rows.length} rows`);
      
      results.push({
        ...queryDef,
        success: true,
        rowCount: rows.length,
        data: rows
      });
    } catch (error) {
      console.error(`[Azure Queries] ✗ Error: ${error.message}`);
      results.push({
        ...queryDef,
        success: false,
        error: error.message
      });
    }
  }
  
  // Generate Markdown report
  let markdown = `# Azure Query Results\n\n`;
  markdown += `Generated: ${new Date().toISOString()}\n\n`;
  markdown += `Total Queries Run: ${limit}\n`;
  markdown += `Successful: ${results.filter(r => r.success).length}\n`;
  markdown += `Failed: ${results.filter(r => !r.success).length}\n\n`;
  markdown += `---\n\n`;
  
  for (const result of results) {
    markdown += `## ${result.name}\n\n`;
    markdown += `**Category:** ${result.category}\n\n`;
    markdown += `**Query:**\n\`\`\`sql\n${result.query}\n\`\`\`\n\n`;
    
    if (result.success) {
      markdown += `**Status:** ✓ Success\n\n`;
      markdown += `**Rows:** ${result.rowCount}\n\n`;
      
      if (result.rowCount > 0) {
        markdown += `**Sample Data (first 5 rows):**\n\`\`\`json\n${JSON.stringify(result.data.slice(0, 5), null, 2)}\n\`\`\`\n\n`;
      } else {
        markdown += `*No data returned*\n\n`;
      }
    } else {
      markdown += `**Status:** ✗ Failed\n\n`;
      markdown += `**Error:** ${result.error}\n\n`;
    }
    
    markdown += `---\n\n`;
  }
  
  // Save to file
  const outputPath = path.join(process.cwd(), 'azure-query-results.md');
  await fs.writeFile(outputPath, markdown, 'utf-8');
  console.log(`\n[Azure Queries] ✓ Results saved to: ${outputPath}`);
  
  return {
    success: true,
    results,
    outputPath,
    summary: {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    }
  };
}

/**
 * ===========================================
 * POWERPIPE MOD MANAGEMENT
 * ===========================================
 */

/**
 * Get or create mods workspace directory
 * This is the main workspace where all mods will be installed
 */
function getModsDirectory() {
  const os = require('os');
  const modsDir = path.join(os.homedir(), '.ofofo', 'powerpipe-workspace');
  const fsSync = require('fs');
  
  // Create directory if needed
  if (!fsSync.existsSync(modsDir)) {
    fsSync.mkdirSync(modsDir, { recursive: true });
    console.log('[Powerpipe] Created workspace directory at:', modsDir);
  }
  
  // Check if workspace is initialized (mod.pp exists)
  const modFile = path.join(modsDir, 'mod.pp');
  if (!fsSync.existsSync(modFile)) {
    // Run 'powerpipe mod init' to initialize the workspace
    console.log('[Powerpipe] Initializing workspace with "powerpipe mod init"...');
    const powerpipeCmd = powerpipeInstaller.getPowerpipeCommand();
    try {
      const { execSync } = require('child_process');
      execSync(`cd "${modsDir}" && "${powerpipeCmd}" mod init`, { 
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      console.log('[Powerpipe] ✓ Workspace initialized');
    } catch (error) {
      console.error('[Powerpipe] Failed to initialize workspace:', error.message);
      // Fallback: create basic mod.pp manually
      const workspaceContent = `mod "local" {
  title = "Ofofo Workspace"
}
`;
      fsSync.writeFileSync(modFile, workspaceContent, 'utf-8');
      console.log('[Powerpipe] Created basic mod.pp manually');
    }
  }
  
  return modsDir;
}

/**
 * Install a Powerpipe mod
 */
async function installPowerpipeMod(modRepo, version = 'latest') {
  try {
    console.log(`[Powerpipe] Installing mod: ${modRepo}@${version}...`);
    
    const powerpipeCmd = powerpipeInstaller.getPowerpipeCommand();
    const workspaceDir = getModsDirectory(); // Ensure workspace exists
    
    // Correct way: powerpipe mod install <specific-mod>
    // NOT: powerpipe mod install (which tries to install from require statements)
    console.log(`[Powerpipe] Running 'powerpipe mod install ${modRepo}' in workspace: ${workspaceDir}`);
    
    return new Promise((resolve, reject) => {
      const child = spawn(powerpipeCmd, ['mod', 'install', modRepo], {
        cwd: workspaceDir,
        stdio: 'pipe'
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        console.log(`[Powerpipe] ${text.trim()}`);
      });
      
      child.stderr.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        console.log(`[Powerpipe] ${text.trim()}`);
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          console.log(`[Powerpipe] ✓ Mod ${modRepo} installed successfully`);
          
          // Verify .mod directory was created
          const dotModDir = path.join(workspaceDir, '.mod');
          const fsSync = require('fs');
          if (fsSync.existsSync(dotModDir)) {
            console.log(`[Powerpipe] ✓ .mod directory exists at ${dotModDir}`);
          }
          
          resolve({ success: true, output: stdout, workspaceDir });
        } else {
          console.error(`[Powerpipe] Mod installation failed with code ${code}`);
          resolve({ success: false, error: `Exit code ${code}`, stderr });
        }
      });
      
      child.on('error', (error) => {
        console.error(`[Powerpipe] Mod installation error:`, error);
        resolve({ success: false, error: error.message });
      });
      
      // Timeout after 5 minutes
      setTimeout(() => {
        child.kill();
        resolve({ success: false, error: 'Installation timed out after 5 minutes' });
      }, 300000);
    });
  } catch (error) {
    console.error(`[Powerpipe] Failed to install mod ${modRepo}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if a mod is installed
 */
async function checkModInstalled(modRepo) {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const workspaceDir = getModsDirectory();
    // Mods are installed in .powerpipe/mods/github.com/turbot/[mod-name]@version/ subdirectory
    const powerpipeModsDir = path.join(workspaceDir, '.powerpipe', 'mods');
    
    if (!fs.existsSync(powerpipeModsDir)) {
      console.log(`[Powerpipe] Mod ${modRepo} is NOT installed yet (no .powerpipe/mods dir)`);
      return false;
    }
    
    // Check for mod in .powerpipe/mods/github.com/turbot/steampipe-mod-azure-compliance@vX.X.X
    const modBasePath = path.join(powerpipeModsDir, modRepo);
    
    // Look for any version of this mod (with @version suffix)
    const parentDir = path.dirname(modBasePath);
    const modName = path.basename(modRepo);
    
    if (fs.existsSync(parentDir)) {
      try {
        const files = fs.readdirSync(parentDir);
        const modDir = files.find(f => f.startsWith(modName + '@') || f === modName);
        
        if (modDir) {
          const fullModPath = path.join(parentDir, modDir);
          const modFile = path.join(fullModPath, 'mod.pp');
          if (fs.existsSync(modFile)) {
            console.log(`[Powerpipe] ✓ Mod ${modRepo} is installed at ${fullModPath}`);
            return true;
          }
        }
      } catch (err) {
        // Directory might not exist
      }
    }
    
    console.log(`[Powerpipe] Mod ${modRepo} is NOT installed yet`);
    return false;
  } catch (error) {
    console.error('[Powerpipe] Failed to check mod installation:', error);
    return false;
  }
}

/**
 * Run a Powerpipe benchmark and generate report
 */
async function runPowerpipeBenchmark(modRepo, benchmarkName, format = 'md') {
  try {
    console.log(`[Powerpipe] Running benchmark: ${benchmarkName} from ${modRepo}...`);
    
    const powerpipeCmd = powerpipeInstaller.getPowerpipeCommand();
    const workspaceDir = getModsDirectory(); // Run from workspace
    
    // Benchmark name should already be in correct format: azure_compliance.benchmark.cis_v200
    // Just use it directly
    const benchmarkRef = benchmarkName;
    
    console.log(`[Powerpipe] Benchmark reference: ${benchmarkRef}`);
    
    const { stdout, stderr } = await execAsync(
      `cd "${workspaceDir}" && "${powerpipeCmd}" benchmark run ${benchmarkRef} --output ${format}`,
      { 
        timeout: 600000, // 10 minutes
        maxBuffer: 50 * 1024 * 1024 // 50MB buffer for large outputs
      }
    );
    
    console.log(`[Powerpipe] Benchmark completed: ${benchmarkName}`);
    
    // Parse results based on format
    let results = stdout;
    if (format === 'json') {
      try {
        results = JSON.parse(stdout);
      } catch (e) {
        console.warn('[Powerpipe] Failed to parse JSON output, returning raw');
      }
    }
    
    return { 
      success: true, 
      results,
      stderr: stderr || ''
    };
  } catch (error) {
    // Powerpipe sometimes returns non-zero exit code even when it generates output
    // Check if we got stdout data despite the error
    if (error.stdout && error.stdout.length > 100) {
      console.log(`[Powerpipe] Benchmark completed with warnings (exit code ${error.code})`);
      return {
        success: true,
        results: error.stdout,
        stderr: error.stderr || '',
        warnings: error.message
      };
    }
    
    console.error(`[Powerpipe] Failed to run benchmark ${benchmarkName}:`, error);
    return { 
      success: false, 
      error: error.message,
      stderr: error.stderr || ''
    };
  }
}

/**
 * List all benchmarks in a mod
 * Runs from the workspace directory
 */
async function listModBenchmarks(modRepo) {
  try {
    console.log(`[Powerpipe] Listing benchmarks for mod: ${modRepo}...`);
    
    const powerpipeCmd = powerpipeInstaller.getPowerpipeCommand();
    const workspaceDir = getModsDirectory(); // Run from workspace
    
    const { stdout } = await execAsync(
      `cd "${workspaceDir}" && "${powerpipeCmd}" benchmark list --output json`,
      { 
        timeout: 30000,
        maxBuffer: 50 * 1024 * 1024 // 50MB buffer for large output
      }
    );
    
    const benchmarks = JSON.parse(stdout || '[]');
    console.log(`[Powerpipe] Found ${benchmarks.length} benchmarks in workspace`);
    
    // Filter benchmarks for this specific mod
    const modName = modRepo.split('/').pop().replace('steampipe-mod-', ''); // azure-compliance
    const modBenchmarks = benchmarks.filter(b => 
      b.mod_name === modName.replace(/-/g, '_') || // azure_compliance
      b.qualified_name?.startsWith(`${modName.replace(/-/g, '_')}.`)
    );
    
    console.log(`[Powerpipe] Found ${modBenchmarks.length} benchmarks for ${modRepo}`);
    return { success: true, benchmarks: modBenchmarks };
  } catch (error) {
    console.error(`[Powerpipe] Failed to list benchmarks for ${modRepo}:`, error);
    return { success: false, error: error.message, benchmarks: [] };
  }
}

/**
 * Run a specific mod's compliance check and generate markdown report
 */
async function runModCompliance(modId, modRepo, benchmarkId = null) {
  try {
    console.log(`[Powerpipe] Running compliance check for mod: ${modId}`);
    console.log(`[Powerpipe] Mod repo: ${modRepo}, benchmarkId: ${benchmarkId}`);
    
    // Mods should already be installed at app startup, so skip installation check
    // This saves time and avoids errors
    console.log(`[Powerpipe] Assuming mod is already installed (installed at app startup)`);
    
    // Get mod name and convert to Powerpipe format
    const modName = modRepo.split('/').pop(); // steampipe-mod-azure-compliance
    const shortModName = modName.replace('steampipe-mod-', '').replace(/-/g, '_'); // azure_compliance
    
    // Determine benchmark to run
    let benchmarkToRun = benchmarkId;
    
    // If benchmarkId provided but missing mod prefix, add it
    if (benchmarkToRun && !benchmarkToRun.includes('.')) {
      benchmarkToRun = `${shortModName}.benchmark.${benchmarkToRun}`;
      console.log(`[Powerpipe] Added mod prefix to benchmark: ${benchmarkToRun}`);
    }
    
    // If no benchmark specified, use default
    if (!benchmarkToRun) {
      const defaultBenchmarks = {
        'azure_compliance': 'azure_compliance.benchmark.cis_v200',
        'azure_insights': 'azure_insights.dashboard.overview',
        'azure_perimeter': 'azure_perimeter.benchmark.publicly_accessible_resources',
        'azure_tags': 'azure_tags.benchmark.untagged_resources',
        'azure_thrifty': 'azure_thrifty.benchmark.cost_optimization'
      };
      
      benchmarkToRun = defaultBenchmarks[shortModName] || `${shortModName}.benchmark.all`;
      console.log(`[Powerpipe] Using default benchmark: ${benchmarkToRun}`);
    }
    
    // Run benchmark and get markdown report
    const result = await runPowerpipeBenchmark(modRepo, benchmarkToRun, 'md');
    
    if (!result.success) {
      return { success: false, error: result.error || 'Failed to run benchmark' };
    }
    
    // Also get JSON results for parsing
    const jsonResult = await runPowerpipeBenchmark(modRepo, benchmarkToRun, 'json');
    
    return {
      success: true,
      markdownReport: result.results,
      jsonResults: jsonResult.success ? jsonResult.results : null,
      benchmark: benchmarkToRun,
      benchmarkId: benchmarkId // Return original for tracking
    };
  } catch (error) {
    console.error(`[Powerpipe] Failed to run mod compliance for ${modId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Test Azure connection by running a simple query
 * Following Turbot's approach: test connection before allowing queries
 */
async function testAzureConnection() {
  try {
    const steampipeCmd = powerpipeInstaller.getSteampipeCommand();
    
    // Test with a simple query - try to get subscription info
    // This verifies: 1) Service is running, 2) Plugin is loaded, 3) Azure auth works
    // Use SELECT * to avoid column name issues
    const testQuery = 'SELECT * FROM azure.azure_subscription LIMIT 1';
    
    console.log('[Connection Test] Testing Azure connection...');
    const { stdout } = await execAsync(
      `"${steampipeCmd}" query "${testQuery}" --output json`,
      { timeout: 15000 }
    );
    
    // Parse result - handle both array and object formats
    let result;
    try {
      result = JSON.parse(stdout);
    } catch (parseError) {
      // If stdout is not JSON, check if it's empty or has error
      if (stdout.trim() === '' || stdout.includes('ERROR')) {
        throw new Error('Query returned no results or error');
      }
      // Try to parse as array of lines
      const lines = stdout.trim().split('\n').filter(l => l);
      if (lines.length > 0) {
        result = lines.map(l => {
          try {
            return JSON.parse(l);
          } catch {
            return l;
          }
        });
      } else {
        result = [];
      }
    }
    
    // Check if we got results (even empty array means connection works)
    if (Array.isArray(result)) {
      console.log(`[Connection Test] ✓ Connection successful (found ${result.length} subscription(s))`);
      return { 
        success: true, 
        message: 'Azure connection verified',
        subscriptionCount: result.length
      };
    } else if (result && typeof result === 'object') {
      // Single object result
      console.log('[Connection Test] ✓ Connection successful');
      return { 
        success: true, 
        message: 'Azure connection verified',
        subscriptionCount: 1
      };
    }
    
    return { success: false, error: 'Unexpected response from connection test' };
  } catch (error) {
    console.error('[Connection Test] Connection test failed:', error.message);
    
    // Provide more helpful error message
    let errorMsg = error.message || 'Failed to connect to Azure';
    if (error.message && error.message.includes('does not exist')) {
      errorMsg = 'Azure plugin may not be fully loaded. Please wait a moment and try again.';
    } else if (error.message && error.message.includes('timeout')) {
      errorMsg = 'Connection test timed out. The Steampipe service may not be ready.';
    }
    
    return { 
      success: false, 
      error: errorMsg
    };
  }
}

/**
 * Ensure all prerequisites are ready for Azure integration
 * Checks and installs: Powerpipe, Steampipe, Azure CLI, Azure Plugin
 * Tests connection before allowing queries (Turbot's approach)
 */
async function ensureAzurePrerequisites(progressCallback, tenantId, subscriptionId) {
  console.log('[Azure Setup] Configuring Azure integration...');
  
  const steps = [
    'Verifying Azure authentication...',
    'Configuring Steampipe for your subscription...',
    'Testing connection...'
  ];
  
  let currentStep = 0;
  
  const updateProgress = (message) => {
    if (progressCallback) {
      progressCallback({ step: currentStep, message, steps });
    }
  };

  try {
    // STEP 1: Verify Azure CLI authentication (should already be done in ToolsTab)
    updateProgress(steps[currentStep]);
    const authResult = await authenticateWithAzureCLI();
    if (!authResult.success) {
      throw new Error('Azure authentication failed');
    }
    currentStep++;
    
    // STEP 2: Configure Steampipe for this subscription
    updateProgress(steps[currentStep]);
    
    // Start Steampipe service if not running
    await initializeSteampipe();
    
    // Wait for service to be fully ready
    console.log('[Azure Setup] Waiting for Steampipe service...');
    let retries = 10;
    while (retries > 0) {
      const ready = await checkSteampipeServiceReady();
      if (ready) break;
      retries--;
      if (retries === 0) throw new Error('Service startup timed out');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Configure plugin with subscription
    if (subscriptionId) {
      await configurePluginConnection(subscriptionId, tenantId);
    }
    
    // Restart to load config
    await restartSteampipeService();
    
    // Wait for restart
    retries = 10;
    while (retries > 0) {
      const ready = await checkSteampipeServiceReady();
      if (ready) break;
      retries--;
      if (retries === 0) throw new Error('Service restart timed out');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    currentStep++;
    
    // STEP 3: Test connection
    updateProgress(steps[currentStep]);
    const testResult = await testAzureConnection();
    if (!testResult.success) {
      throw new Error(testResult.error || 'Connection test failed');
    }
    currentStep++;
    
    return { 
      success: true,
      message: 'Azure integration ready'
    };
    
  } catch (error) {
    console.error('[Azure Setup] Failed:', error);
    if (progressCallback) {
      progressCallback({ 
        step: currentStep, 
        message: steps[currentStep],
        steps,
        error: error.message 
      });
    }
    return { 
      success: false,
      error: error.message 
    };
  }
}

module.exports = {
  STEAMPIPE_PLUGINS,
  initializeSteampipe,
  checkAzureCLI,
  installAzureCLI,
  authenticateWithAzureCLI,
  getAzureSubscriptions,
  setAzureSubscription,
  setupAzureIntegration,
  getAzureTables,
  querySteampipe,
  installAzureComplianceMod,
  getAvailableBenchmarks,
  runBenchmark,
  runAzureQueries,
  // Azure plugin check
  checkAzurePluginInstalled,
  installAzurePlugin,
  installAzureADPlugin,
  // Prerequisites
  ensureAzurePrerequisites,
  // New mod functions
  installPowerpipeMod,
  checkModInstalled,
  runPowerpipeBenchmark,
  listModBenchmarks,
  runModCompliance,
};


