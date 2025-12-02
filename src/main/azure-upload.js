const { BlobServiceClient } = require('@azure/storage-blob');
const { encryptBlobUrl } = require('./encryption');

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
const AZURE_STORAGE_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME || 'dataroom';

/**
 * Upload a file to Azure Blob Storage as a PRIVATE blob
 * Blob path structure: {dataroomId}/{fileId}/{fileName}
 * 
 * @param {Buffer} fileBuffer - File content as Buffer
 * @param {string|number} fileId - Database file ID (UUID)
 * @param {string} dataRoomId - User's dataroom/organization ID
 * @param {string} contentType - MIME type (default: 'text/markdown')
 * @param {string} fileName - Original filename (optional, for blob path)
 * @returns {Promise<{url: string, encryptedUrl: string, pathname: string, contentType: string, contentLength: number, uploadedAt: Date}>}
 */
async function uploadToAzureBlob(
  fileBuffer,
  fileId,
  dataRoomId,
  contentType = 'text/markdown',
  fileName = null
) {
  try {
    if (!AZURE_STORAGE_CONNECTION_STRING) {
      throw new Error('AZURE_STORAGE_CONNECTION_STRING not configured');
    }

    // Initialize blob service client
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      AZURE_STORAGE_CONNECTION_STRING
    );
    
    // Get container client
    const containerClient = blobServiceClient.getContainerClient(
      AZURE_STORAGE_CONTAINER_NAME
    );
    
    // Ensure container exists (create if it doesn't)
    // By default, containers are PRIVATE (no anonymous access) unless explicitly set
    // We don't specify access level, so it defaults to private
    try {
      await containerClient.createIfNotExists();
      console.log(`[Azure] Container "${AZURE_STORAGE_CONTAINER_NAME}" ready (private by default)`);
    } catch (createError) {
      // Container might already exist, that's fine
      if (!createError.message || !createError.message.includes('already exists')) {
        console.log(`[Azure] Container check: ${createError.message}`);
      }
    }
    
    // Blob path structure: {dataroomId}/{fileId}/{fileName}
    // Example: "532b50eb-39d7-46df-a350-017c92fe044f/d277e20d-b112-42fe-9c7e-e148f9af1840/Azure-Compliance-CIS-v2.0.0.md"
    const blobName = fileName 
      ? `${dataRoomId}/${fileId}/${fileName}`
      : `${dataRoomId}/${fileId}`;
    
    // Get block blob client
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    
    // Upload data as PRIVATE blob
    // Blobs inherit the container's access level (private by default)
    // No additional security configuration needed - blob is private automatically
    await blockBlobClient.uploadData(fileBuffer, {
      blobHTTPHeaders: {
        blobContentType: contentType,
      }
    });
    
    // Get blob URL (this URL requires authentication to access - private blob)
    const blobUrl = blockBlobClient.url;
    
    // Encrypt URL for secure storage
    const encryptedUrl = encryptBlobUrl(blobUrl);
    
    console.log(`[Azure] ✓ Uploaded private blob: ${blobName}`);
    console.log(`[Azure]   URL: ${blobUrl}`);
    
    return {
      url: blobUrl,
      encryptedUrl,
      pathname: blobName,
      contentType,
      contentLength: fileBuffer.length,
      uploadedAt: new Date(),
    };
  } catch (error) {
    console.error('[Azure] Upload error:', error);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to upload to Azure: ${message}`);
  }
}

/**
 * Upload multiple files to Azure Blob Storage
 * 
 * @param {Array<{buffer: Buffer, filename: string, contentType: string}>} files - Array of files to upload
 * @param {string} dataRoomId - User's dataroom/organization ID
 * @returns {Promise<Array<{url: string, encryptedUrl: string, pathname: string, contentType: string, contentLength: number, uploadedAt: Date}>>}
 */
async function uploadMultipleFiles(files, dataRoomId) {
  const results = [];
  
  for (const file of files) {
    try {
      // Generate UUID for each file
      const { randomUUID } = require('crypto');
      const fileId = randomUUID();
      
      const result = await uploadToAzureBlob(
        file.buffer,
        fileId,
        dataRoomId,
        file.contentType,
        file.filename
      );
      results.push(result);
    } catch (error) {
      console.error(`Failed to upload ${file.filename}:`, error);
      // Continue with other files
    }
  }
  
  return results;
}

module.exports = {
  uploadToAzureBlob,
  uploadMultipleFiles,
};

