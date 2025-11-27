import crypto from 'crypto';

const SUPPORT_KEY = process.env.SUPPORT_KEY || '~oF||Of||O~';

/**
 * Encrypt a blob URL using AES-256-CBC
 * Format: {base64_IV}.{base64_encrypted_data}
 */
export function encryptBlobUrl(url: string): string {
  try {
    const key = crypto.scryptSync(SUPPORT_KEY, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    let encrypted = cipher.update(url, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    return `${iv.toString('base64')}.${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt URL');
  }
}

/**
 * Decrypt an encrypted blob URL
 */
export function decryptBlobUrl(encryptedUrl: string): string {
  try {
    const [ivBase64, encryptedData] = encryptedUrl.split('.');
    if (!ivBase64 || !encryptedData) {
      throw new Error('Invalid encrypted URL format');
    }
    
    const key = crypto.scryptSync(SUPPORT_KEY, 'salt', 32);
    const iv = Buffer.from(ivBase64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt URL');
  }
}

/**
 * Safely decrypt URL - handles both encrypted and plain URLs
 */
export function safeDecryptUrl(url: string): string | null {
  if (!url) return null;
  
  // Check if URL is encrypted (contains a dot separator)
  if (url.includes('.') && !url.startsWith('http')) {
    try {
      return decryptBlobUrl(url);
    } catch (error) {
      console.error('Safe decrypt failed:', error);
      return null;
    }
  }
  
  // Return as-is if it's already a plain URL
  return url;
}
