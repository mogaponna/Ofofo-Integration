#!/usr/bin/env node
/**
 * Download Powerpipe and Steampipe binaries for bundling with the app
 * Run this script during build time to bundle binaries with the app
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PLATFORMS = [
  { platform: 'darwin', arch: 'amd64', name: 'macos-intel' },
  { platform: 'darwin', arch: 'arm64', name: 'macos-arm' },
  { platform: 'linux', arch: 'amd64', name: 'linux-amd64' },
  { platform: 'linux', arch: 'arm64', name: 'linux-arm64' },
  { platform: 'win32', arch: 'amd64', name: 'windows-amd64' },
];

const BINARIES_DIR = path.join(__dirname, '..', 'binaries');

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlink(destPath, () => {});
        return downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(destPath, () => {});
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
      
      file.on('error', (err) => {
        file.close();
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function extractZip(filePath, destDir) {
  const platform = process.platform;
  
  if (platform === 'win32') {
    execSync(`powershell -Command "Expand-Archive -Path '${filePath}' -DestinationPath '${destDir}' -Force"`);
  } else {
    execSync(`unzip -o "${filePath}" -d "${destDir}"`);
  }
}

async function downloadBinary(name, platform, arch) {
  const platformDir = path.join(BINARIES_DIR, `${platform}-${arch}`);
  await fs.promises.mkdir(platformDir, { recursive: true });
  
  const isWindows = platform === 'win32';
  const ext = isWindows ? '.exe' : '';
  const binaryName = `${name}${ext}`;
  const zipName = `${name}.zip`;
  
  // Download URL
  const downloadUrl = `https://github.com/turbot/${name}/releases/latest/download/${name}_${platform}_${arch}.zip`;
  
  console.log(`[Download] ${name} for ${platform}-${arch}...`);
  console.log(`  URL: ${downloadUrl}`);
  
  const zipPath = path.join(platformDir, zipName);
  
  try {
    // Download
    await downloadFile(downloadUrl, zipPath);
    console.log(`  ✓ Downloaded`);
    
    // Extract
    const extractDir = path.join(platformDir, 'extracted');
    await fs.promises.mkdir(extractDir, { recursive: true });
    await extractZip(zipPath, extractDir);
    console.log(`  ✓ Extracted`);
    
    // Find the binary in extracted folder
    const extractedFiles = await fs.promises.readdir(extractDir, { recursive: true });
    const binaryFile = extractedFiles.find(f => f.endsWith(binaryName));
    
    if (!binaryFile) {
      throw new Error(`Binary ${binaryName} not found in extracted files`);
    }
    
    // Move binary to platform directory
    const sourcePath = path.join(extractDir, binaryFile);
    const destPath = path.join(platformDir, binaryName);
    await fs.promises.copyFile(sourcePath, destPath);
    
    // Make executable on Unix
    if (!isWindows) {
      await fs.promises.chmod(destPath, 0o755);
    }
    
    // Cleanup
    await fs.promises.rm(extractDir, { recursive: true, force: true });
    await fs.promises.unlink(zipPath).catch(() => {});
    
    console.log(`  ✓ Binary ready: ${destPath}`);
    return destPath;
  } catch (error) {
    console.error(`  ✗ Failed: ${error.message}`);
    throw error;
  }
}

async function main() {
  console.log('📦 Downloading Powerpipe and Steampipe binaries for bundling...\n');
  
  // Create binaries directory
  await fs.promises.mkdir(BINARIES_DIR, { recursive: true });
  
  // Download for all platforms
  for (const { platform, arch } of PLATFORMS) {
    try {
      await downloadBinary('steampipe', platform, arch);
      await downloadBinary('powerpipe', platform, arch);
      console.log('');
    } catch (error) {
      console.error(`Failed to download for ${platform}-${arch}:`, error.message);
    }
  }
  
  console.log('✅ Binary download complete!');
  console.log(`Binaries are in: ${BINARIES_DIR}`);
  console.log('\nThese will be bundled with the app during electron-builder build.');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { downloadBinary, PLATFORMS };

