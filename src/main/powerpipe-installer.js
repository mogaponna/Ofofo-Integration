const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { app } = require('electron');

const execAsync = promisify(exec);

/**
 * Powerpipe Auto-Installer
 * Automatically installs Powerpipe and Steampipe with the application
 */

/**
 * Detect and map system architecture to Steampipe/Powerpipe naming
 * Handles all common architectures across different platforms
 */
function detectArchitecture() {
  const platform = process.platform;
  const nodeArch = process.arch;
  
  // Map Node.js arch names to Steampipe/Powerpipe arch names
  const archMap = {
    'x64': 'amd64',      // Intel/AMD 64-bit
    'x32': '386',        // 32-bit x86
    'ia32': '386',       // 32-bit x86 (alternative)
    'arm64': 'arm64',    // ARM 64-bit (Apple Silicon, ARM servers)
    'arm': 'arm',        // ARM 32-bit
    'ppc64': 'ppc64le',  // PowerPC 64-bit little-endian
    's390x': 's390x',    // IBM Z
  };
  
  let arch = archMap[nodeArch] || nodeArch;
  
  // Additional platform-specific detection
  if (platform === 'darwin') {
    // macOS: Check for Apple Silicon vs Intel
    if (nodeArch === 'arm64') {
      arch = 'arm64';  // Apple Silicon
    } else if (nodeArch === 'x64') {
      arch = 'amd64';  // Intel Mac
    }
  } else if (platform === 'linux') {
    // Linux: Use the mapped architecture
    // Most common: amd64, arm64, arm
  } else if (platform === 'win32') {
    // Windows: x64 -> amd64, ia32 -> 386
    if (nodeArch === 'x64') {
      arch = 'amd64';
    } else if (nodeArch === 'ia32' || nodeArch === 'x32') {
      arch = '386';
    }
  }
  
  console.log(`[Installer] Detected: platform=${platform}, nodeArch=${nodeArch}, mappedArch=${arch}`);
  
  return {
    platform,
    arch,
    nodeArch,
    // Supported architectures for Steampipe/Powerpipe
    supported: ['amd64', 'arm64', 'arm', '386'].includes(arch),
  };
}

// Get bundled binaries directory (from app resources)
const getBundledBinariesDir = () => {
  const isDev = require('electron-is-dev');
  if (isDev) {
    // In development, check if binaries exist in project
    return path.join(__dirname, '..', '..', 'binaries', `${process.platform}-${process.arch}`);
  } else {
    // In production, binaries are in app resources
    return path.join(process.resourcesPath, 'binaries', `${process.platform}-${process.arch}`);
  }
};

// Installation directory - use app's userData directory (fallback)
const getInstallDir = () => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'bin');
};

// Binary paths - check bundled first, then fallback to userData
const getBinaryPaths = () => {
  const isWindows = process.platform === 'win32';
  const ext = isWindows ? '.exe' : '';
  
  // Try bundled binaries first
  const bundledDir = getBundledBinariesDir();
  const bundledSteampipe = path.join(bundledDir, `steampipe${ext}`);
  const bundledPowerpipe = path.join(bundledDir, `powerpipe${ext}`);
  
  // Fallback to userData/bin
  const installDir = getInstallDir();
  const userSteampipe = path.join(installDir, `steampipe${ext}`);
  const userPowerpipe = path.join(installDir, `powerpipe${ext}`);
  
  return {
    // Prefer bundled, fallback to userData
    steampipe: bundledSteampipe,
    powerpipe: bundledPowerpipe,
    steampipeFallback: userSteampipe,
    powerpipeFallback: userPowerpipe,
    installDir,
    bundledDir,
  };
};

// Powerpipe workspace directory (for mods)
const getPowerpipeWorkspace = () => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'powerpipe-workspace');
};

/**
 * Check if a file exists (with fallback)
 */
async function checkFileExists(filePath, fallbackPath = null) {
  try {
    await fs.access(filePath);
    return { exists: true, path: filePath };
  } catch (error) {
    if (fallbackPath) {
      try {
        await fs.access(fallbackPath);
        return { exists: true, path: fallbackPath };
      } catch (fallbackError) {
        return { exists: false, path: null };
      }
    }
    return { exists: false, path: null };
  }
}

/**
 * Check if Powerpipe and Steampipe are already installed
 * Checks bundled binaries first, then fallback to userData
 */
async function checkInstallation() {
  const paths = getBinaryPaths();
  
  try {
    const [steampipeCheck, powerpipeCheck] = await Promise.all([
      checkFileExists(paths.steampipe, paths.steampipeFallback),
      checkFileExists(paths.powerpipe, paths.powerpipeFallback),
    ]);

    return {
      steampipe: {
        installed: steampipeCheck.exists,
        path: steampipeCheck.path,
        bundled: steampipeCheck.path === paths.steampipe,
      },
      powerpipe: {
        installed: powerpipeCheck.exists,
        path: powerpipeCheck.path,
        bundled: powerpipeCheck.path === paths.powerpipe,
      },
    };
  } catch (error) {
    return {
      steampipe: { installed: false, path: null, bundled: false },
      powerpipe: { installed: false, path: null, bundled: false },
    };
  }
}

/**
 * Download file from URL
 */
async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = require('fs').createWriteStream(destPath);
    let downloadSize = 0;
    
    const request = https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        file.close();
        require('fs').unlink(destPath, () => {});
        return downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode === 404) {
        file.close();
        require('fs').unlink(destPath, () => {});
        reject(new Error(
          `Download failed: Binary not found (404). ` +
          `The architecture/platform combination may not be supported. ` +
          `URL: ${url}`
        ));
        return;
      }
      
      if (response.statusCode !== 200) {
        file.close();
        require('fs').unlink(destPath, () => {});
        reject(new Error(`Download failed with status ${response.statusCode}. URL: ${url}`));
        return;
      }

      response.on('data', (chunk) => {
        downloadSize += chunk.length;
      });

      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`[Installer] Downloaded ${downloadSize} bytes`);
        if (downloadSize === 0) {
          require('fs').unlink(destPath, () => {});
          reject(new Error('Downloaded file is empty (0 bytes)'));
        } else {
          resolve();
        }
      });

      file.on('error', (err) => {
        file.close();
        require('fs').unlink(destPath, () => {});
        reject(err);
      });
    });

    request.on('error', (err) => {
      file.close();
      require('fs').unlink(destPath, () => {});
      reject(err);
    });
  });
}

/**
 * Extract tar.gz file using native tar command
 */
async function extractTarGz(filePath, destDir) {
  const platform = process.platform;
  
  if (platform === 'win32') {
    // Use tar.js module for Windows
    const tar = require('tar');
    await tar.extract({
      file: filePath,
      cwd: destDir,
    });
  } else {
    // Use native tar command for Unix-like systems (more reliable)
    const command = `tar -xzf "${filePath}" -C "${destDir}"`;
    console.log('[Installer] Executing:', command);
    await execAsync(command);
  }
}

/**
 * Extract zip file using native unzip command or library
 */
async function extractZip(filePath, destDir) {
  const platform = process.platform;
  
  if (platform === 'win32') {
    // Windows: try to use PowerShell's Expand-Archive, fallback to adm-zip if available
    try {
      await execAsync(`powershell -Command "Expand-Archive -Path '${filePath}' -DestinationPath '${destDir}' -Force"`);
    } catch (error) {
      // Fallback: try adm-zip if installed
      try {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(filePath);
        zip.extractAllTo(destDir, true);
      } catch (zipError) {
        throw new Error(`Failed to extract zip file. Please install 'adm-zip' package or ensure PowerShell is available.`);
      }
    }
  } else {
    // Unix-like (macOS, Linux): use native unzip command
    const command = `unzip -o "${filePath}" -d "${destDir}"`;
    console.log('[Installer] Executing:', command);
    await execAsync(command);
  }
}

/**
 * Install Steampipe
 */
async function installSteampipe() {
  console.log('[Installer] Installing Steampipe...');
  
  const detection = detectArchitecture();
  const { platform, arch, supported } = detection;
  
  if (!supported) {
    throw new Error(
      `Unsupported architecture: ${detection.nodeArch} (${arch}). ` +
      `Steampipe supports: amd64, arm64, arm, 386. ` +
      `Please install Steampipe manually or use a supported system.`
    );
  }
  
  const paths = getBinaryPaths();
  await fs.mkdir(paths.installDir, { recursive: true });
  
  try {
    let downloadUrl;
    let binaryName = 'steampipe';
    let useZip = false;
    
    if (platform === 'darwin') {
      // Steampipe uses zip format with underscores for macOS
      downloadUrl = `https://github.com/turbot/steampipe/releases/latest/download/steampipe_darwin_${arch}.zip`;
      useZip = true;
    } else if (platform === 'linux') {
      // Linux might still use tar.gz, but check latest format
      downloadUrl = `https://github.com/turbot/steampipe/releases/latest/download/steampipe_linux_${arch}.zip`;
      useZip = true;
    } else if (platform === 'win32') {
      downloadUrl = `https://github.com/turbot/steampipe/releases/latest/download/steampipe_windows_${arch}.zip`;
      binaryName = 'steampipe.exe';
      useZip = true;
    } else {
      throw new Error(`Unsupported platform: ${platform}. Supported: darwin (macOS), linux, win32 (Windows)`);
    }
    
    console.log(`[Installer] Download URL: ${downloadUrl}`);
    
    const tempFile = path.join(paths.installDir, useZip ? 'steampipe.zip' : 'steampipe.tar.gz');
    
    console.log('[Installer] Downloading Steampipe from:', downloadUrl);
    
    // Ensure temp directory exists
    await fs.mkdir(paths.installDir, { recursive: true });
    
    // Download file
    try {
      await downloadFile(downloadUrl, tempFile);
    } catch (downloadError) {
      // Clean up partial download if it exists
      try {
        await fs.unlink(tempFile);
      } catch (unlinkError) {
        // Ignore unlink errors
      }
      throw new Error(`Failed to download Steampipe: ${downloadError.message}`);
    }
    
    // Verify download - check if file exists first
    let stats;
    try {
      stats = await fs.stat(tempFile);
    } catch (statError) {
      throw new Error(`Downloaded file not found at ${tempFile}. Download may have failed.`);
    }
    
    console.log('[Installer] Downloaded file size:', stats.size, 'bytes');
    if (stats.size < 1000) {
      // Clean up invalid file
      try {
        await fs.unlink(tempFile);
      } catch (unlinkError) {
        // Ignore unlink errors
      }
      throw new Error(`Downloaded file is too small (${stats.size} bytes) - download may have failed`);
    }
    
    console.log('[Installer] Extracting Steampipe...');
    if (useZip) {
      await extractZip(tempFile, paths.installDir);
    } else {
      await extractTarGz(tempFile, paths.installDir);
    }
    
    // Clean up archive file
    try {
      await fs.unlink(tempFile);
    } catch (unlinkError) {
      console.warn('[Installer] Could not remove temp file:', unlinkError.message);
    }
    
    // Verify binary exists after extraction
    // The binary might be in a subdirectory or directly in installDir
    let steampipePath = null;
    
    // First, check if binary is directly in installDir
    const directPath = path.join(paths.installDir, binaryName);
    try {
      await fs.access(directPath);
      steampipePath = directPath;
      console.log('[Installer] Found binary at direct path:', steampipePath);
    } catch (directError) {
      // Check expected paths
      try {
        await fs.access(paths.steampipeFallback);
        steampipePath = paths.steampipeFallback;
        console.log('[Installer] Found binary at fallback path:', steampipePath);
      } catch (fallbackError) {
        // Check bundled path (shouldn't exist, but check anyway)
        try {
          await fs.access(paths.steampipe);
          steampipePath = paths.steampipe;
          console.log('[Installer] Found binary at bundled path:', steampipePath);
        } catch (bundledError) {
          // List directory to see what was extracted
          try {
            const files = await fs.readdir(paths.installDir);
            console.log('[Installer] Files in install directory:', files);
            
            // Check subdirectories
            for (const file of files) {
              const filePath = path.join(paths.installDir, file);
              const fileStat = await fs.stat(filePath);
              if (fileStat.isDirectory()) {
                const subFiles = await fs.readdir(filePath);
                console.log(`[Installer] Files in subdirectory ${file}:`, subFiles);
                // Check if binary is in subdirectory
                const subBinaryPath = path.join(filePath, binaryName);
                try {
                  await fs.access(subBinaryPath);
                  // Move binary to installDir root
                  const finalPath = path.join(paths.installDir, binaryName);
                  await fs.rename(subBinaryPath, finalPath);
                  steampipePath = finalPath;
                  console.log('[Installer] Moved binary from subdirectory to:', steampipePath);
                  break;
                } catch (subError) {
                  // Continue searching
                }
              } else if (file === binaryName || file === 'steampipe') {
                // Found it!
                steampipePath = filePath;
                console.log('[Installer] Found binary:', steampipePath);
                break;
              }
            }
          } catch (listError) {
            console.error('[Installer] Error listing directory:', listError);
          }
          
          if (!steampipePath) {
            throw new Error(
              `Steampipe binary not found after extraction. ` +
              `Expected at ${paths.steampipeFallback} or ${directPath}. ` +
              `The archive may not contain the expected binary structure.`
            );
          }
        }
      }
    }
    
    // Update path if we used fallback
    if (steampipePath !== paths.steampipe) {
      console.log('[Installer] Using fallback path:', steampipePath);
    }
    
    // Make binary executable (Unix-like systems)
    if (platform !== 'win32') {
      await fs.chmod(steampipePath, 0o755);
    }
    
    // Verify binary is executable by trying to get version
    try {
      const { stdout } = await execAsync(`"${steampipePath}" --version`);
      console.log('[Installer] Steampipe version:', stdout.trim());
    } catch (error) {
      console.warn('[Installer] Could not verify Steampipe version (this is OK if binary exists)');
    }
    
    console.log('[Installer] ✓ Steampipe installed successfully at:', steampipePath);
    return { success: true, path: steampipePath };
  } catch (error) {
    console.error('[Installer] Steampipe installation failed:', error);
    throw error;
  }
}

/**
 * Install Powerpipe
 */
async function installPowerpipe() {
  console.log('[Installer] Installing Powerpipe...');
  
  const detection = detectArchitecture();
  const { platform, arch, supported } = detection;
  
  if (!supported) {
    throw new Error(
      `Unsupported architecture: ${detection.nodeArch} (${arch}). ` +
      `Powerpipe supports: amd64, arm64, arm, 386. ` +
      `Please install Powerpipe manually or use a supported system.`
    );
  }
  
  const paths = getBinaryPaths();
  await fs.mkdir(paths.installDir, { recursive: true });
  
  try {
    let downloadUrl;
    let binaryName = 'powerpipe';
    
    if (platform === 'darwin') {
      downloadUrl = `https://github.com/turbot/powerpipe/releases/latest/download/powerpipe.darwin.${arch}.tar.gz`;
    } else if (platform === 'linux') {
      downloadUrl = `https://github.com/turbot/powerpipe/releases/latest/download/powerpipe.linux.${arch}.tar.gz`;
    } else if (platform === 'win32') {
      downloadUrl = `https://github.com/turbot/powerpipe/releases/latest/download/powerpipe.windows.${arch}.tar.gz`;
      binaryName = 'powerpipe.exe';
    } else {
      throw new Error(`Unsupported platform: ${platform}. Supported: darwin (macOS), linux, win32 (Windows)`);
    }
    
    console.log(`[Installer] Download URL: ${downloadUrl}`);
    
    const tempFile = path.join(paths.installDir, 'powerpipe.tar.gz');
    
    console.log('[Installer] Downloading Powerpipe from:', downloadUrl);
    await downloadFile(downloadUrl, tempFile);
    
    // Verify download
    const stats = await fs.stat(tempFile);
    console.log('[Installer] Downloaded file size:', stats.size, 'bytes');
    if (stats.size < 1000) {
      throw new Error(`Downloaded file is too small (${stats.size} bytes) - download may have failed`);
    }
    
    console.log('[Installer] Extracting Powerpipe...');
    await extractTarGz(tempFile, paths.installDir);
    
    // Clean up tar file
    await fs.unlink(tempFile);
    
    // Verify binary exists after extraction
    try {
      await fs.access(paths.powerpipe);
    } catch (error) {
      throw new Error(
        `Powerpipe binary not found after extraction at ${paths.powerpipe}. ` +
        `The archive may not contain the expected binary structure.`
      );
    }
    
    // Make binary executable (Unix-like systems)
    if (platform !== 'win32') {
      await fs.chmod(paths.powerpipe, 0o755);
    }
    
    // Verify binary is executable by trying to get version
    try {
      const { stdout } = await execAsync(`"${paths.powerpipe}" --version`);
      console.log('[Installer] Powerpipe version:', stdout.trim());
    } catch (error) {
      console.warn('[Installer] Could not verify Powerpipe version (this is OK if binary exists)');
    }
    
    console.log('[Installer] ✓ Powerpipe installed successfully');
    return { success: true, path: paths.powerpipe };
  } catch (error) {
    console.error('[Installer] Powerpipe installation failed:', error);
    throw error;
  }
}

/**
 * Create symlinks in /usr/local/bin so commands are available in PATH
 */
async function createSymlinks() {
  try {
    const platform = process.platform;
    if (platform === 'win32') {
      // Windows doesn't use symlinks the same way
      return { success: true, message: 'Windows PATH setup not implemented' };
    }
    
    const paths = getBinaryPaths();
    const fsSync = require('fs');
    const targetDir = '/usr/local/bin';
    
    // Check if binaries exist
    const steampipeExists = fsSync.existsSync(paths.steampipe);
    const powerpipeExists = fsSync.existsSync(paths.powerpipe);
    
    if (!steampipeExists && !powerpipeExists) {
      return { success: false, error: 'Binaries not found' };
    }
    
    // Create symlinks (requires sudo on macOS/Linux, but we'll try)
    try {
      if (steampipeExists) {
        const steampipeLink = path.join(targetDir, 'steampipe');
        // Remove existing symlink if it exists
        if (fsSync.existsSync(steampipeLink)) {
          fsSync.unlinkSync(steampipeLink);
        }
        fsSync.symlinkSync(paths.steampipe, steampipeLink);
        console.log('[Installer] ✓ Created steampipe symlink');
      }
      
      if (powerpipeExists) {
        const powerpipeLink = path.join(targetDir, 'powerpipe');
        // Remove existing symlink if it exists
        if (fsSync.existsSync(powerpipeLink)) {
          fsSync.unlinkSync(powerpipeLink);
        }
        fsSync.symlinkSync(paths.powerpipe, powerpipeLink);
        console.log('[Installer] ✓ Created powerpipe symlink');
      }
      
      return { success: true, message: 'Symlinks created successfully' };
    } catch (symlinkError) {
      // Symlink creation might fail due to permissions - that's okay
      console.warn('[Installer] Could not create symlinks (may need sudo):', symlinkError.message);
      console.log('[Installer] To use commands in terminal, add to PATH:');
      console.log(`[Installer]   export PATH="${paths.installDir}:$PATH"`);
      return { 
        success: false, 
        error: symlinkError.message,
        pathHint: paths.installDir
      };
    }
  } catch (error) {
    console.warn('[Installer] Symlink creation failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Auto-install both Powerpipe and Steampipe if not already installed
 */
async function autoInstall() {
  console.log('[Installer] Checking Powerpipe/Steampipe installation...');
  
  // Detect system architecture first
  const detection = detectArchitecture();
  console.log(`[Installer] System: ${detection.platform} ${detection.arch} (Node.js: ${detection.nodeArch})`);
  
  if (!detection.supported) {
    const errorMsg = `Unsupported architecture detected: ${detection.nodeArch} (${detection.arch}). ` +
      `This system architecture is not supported by Powerpipe/Steampipe. ` +
      `Supported architectures: amd64 (x64), arm64, arm, 386 (x32).`;
    console.error(`[Installer] ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      detection,
    };
  }
  
  const installation = await checkInstallation();
  const needsInstall = {
    steampipe: !installation.steampipe.installed,
    powerpipe: !installation.powerpipe.installed,
  };
  
  if (!needsInstall.steampipe && !needsInstall.powerpipe) {
    console.log('[Installer] Powerpipe and Steampipe already installed');
    return {
      success: true,
      alreadyInstalled: true,
      steampipe: installation.steampipe,
      powerpipe: installation.powerpipe,
      detection,
    };
  }
  
  const results = {
    steampipe: installation.steampipe,
    powerpipe: installation.powerpipe,
  };
  
  // Install Steampipe if needed
  if (needsInstall.steampipe) {
    try {
      const result = await installSteampipe();
      results.steampipe = { installed: true, path: result.path };
    } catch (error) {
      console.error('[Installer] Failed to install Steampipe:', error);
      results.steampipe = { installed: false, error: error.message };
    }
  }
  
  // Install Powerpipe if needed
  if (needsInstall.powerpipe) {
    try {
      const result = await installPowerpipe();
      results.powerpipe = { installed: true, path: result.path };
    } catch (error) {
      console.error('[Installer] Failed to install Powerpipe:', error);
      results.powerpipe = { installed: false, error: error.message };
    }
  }
  
  return {
    success: results.steampipe.installed && results.powerpipe.installed,
    steampipe: results.steampipe,
    powerpipe: results.powerpipe,
    detection,
  };
}

/**
 * Get the command to run Steampipe/Powerpipe
 * Returns the full path to the binary
 */
function getSteampipeCommand() {
  const paths = getBinaryPaths();
  const fsSync = require('fs');
  
  // Check bundled binary first
  if (fsSync.existsSync(paths.steampipe)) {
    return paths.steampipe;
  }
  
  // Fallback to userData/bin
  if (fsSync.existsSync(paths.steampipeFallback)) {
    return paths.steampipeFallback;
  }
  
  // Return expected path (will be installed if missing)
  return paths.steampipeFallback;
}

function getPowerpipeCommand() {
  const paths = getBinaryPaths();
  const fsSync = require('fs');
  
  // Check bundled binary first
  if (fsSync.existsSync(paths.powerpipe)) {
    return paths.powerpipe;
  }
  
  // Fallback to userData/bin
  if (fsSync.existsSync(paths.powerpipeFallback)) {
    return paths.powerpipeFallback;
  }
  
  // Return expected path (will be installed if missing)
  return paths.powerpipeFallback;
}

/**
 * Ensure Powerpipe workspace exists
 */
async function ensurePowerpipeWorkspace() {
  const workspace = getPowerpipeWorkspace();
  await fs.mkdir(workspace, { recursive: true });
  
  // Create mod.pp file if it doesn't exist (required for Powerpipe)
  const modFile = path.join(workspace, 'mod.pp');
  try {
    await fs.access(modFile);
  } catch {
    // Create a basic mod.pp file
    const modContent = `mod "ofofo_workspace" {
  title = "Ofofo Compliance Workspace"
  description = "Workspace for running compliance benchmarks"
}
`;
    await fs.writeFile(modFile, modContent, 'utf-8');
    console.log('[Installer] Created Powerpipe workspace at:', workspace);
  }
  
  return workspace;
}

module.exports = {
  checkInstallation,
  autoInstall,
  installSteampipe,
  installPowerpipe,
  getSteampipeCommand,
  getPowerpipeCommand,
  getBinaryPaths,
  detectArchitecture,
  getPowerpipeWorkspace,
  ensurePowerpipeWorkspace,
  createSymlinks,
};

