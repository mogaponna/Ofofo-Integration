import { BlobServiceClient } from '@azure/storage-blob';
import { encryptBlobUrl } from './encryption';

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
const AZURE_STORAGE_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME || 'dataroom';

export interface UploadResult {
  url: string;
  encryptedUrl: string;
  pathname: string;
  contentType: string;
  contentLength: number;
  uploadedAt: Date;
}

/**
 * Upload a file to Azure Blob Storage as a PRIVATE blob
 * Blob path structure: {dataroomId}/{fileId}
 * 
 * @param fileBuffer - File content as Buffer
 * @param fileId - Database file ID (used in blob path)
 * @param dataRoomId - User's dataroom/organization ID
 * @param contentType - MIME type (default: 'text/markdown')
 */
export async function uploadToAzureBlob(
  fileBuffer: Buffer,
  fileId: string | number,
  dataRoomId: string,
  contentType: string = 'text/markdown'
): Promise<UploadResult> {
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
      const errorMessage = createError instanceof Error ? createError.message : String(createError);
      if (!errorMessage.includes('already exists')) {
        console.log(`[Azure] Container check: ${errorMessage}`);
      }
    }
    
    // Blob path structure: {dataroomId}/{fileId}
    // Example: "532b50eb-39d7-46df-a350-017c92fe044f/1"
    const blobName = `${dataRoomId}/${fileId}`;
    
    // Get block blob client
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    
    // Upload data as PRIVATE blob
    // By default, blobs in a private container are private
    // No public access unless explicitly granted via SAS token
    await blockBlobClient.uploadData(fileBuffer, {
      blobHTTPHeaders: {
        blobContentType: contentType,
      },
      // Blobs inherit the container's access level (private by default)
      // No additional security configuration needed
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
 */
export async function uploadMultipleFiles(
  files: Array<{ buffer: Buffer; filename: string; contentType: string }>,
  dataRoomId: string
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  
  for (const file of files) {
    try {
      const result = await uploadToAzureBlob(
        file.buffer,
        file.filename,
        dataRoomId,
        file.contentType
      );
      results.push(result);
    } catch (error) {
      console.error(`Failed to upload ${file.filename}:`, error);
      // Continue with other files
    }
  }
  
  return results;
}
