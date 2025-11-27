import { BlobServiceClient } from '@azure/storage-blob';
import { v4 as uuidv4 } from 'uuid';
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
 * Upload a file to Azure Blob Storage
 */
export async function uploadToAzureBlob(
  fileBuffer: Buffer,
  filename: string,
  dataRoomId: string,
  contentType: string = 'application/json'
): Promise<UploadResult> {
  try {
    // Initialize blob service client
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      AZURE_STORAGE_CONNECTION_STRING
    );
    
    // Get container client
    const containerClient = blobServiceClient.getContainerClient(
      AZURE_STORAGE_CONTAINER_NAME
    );
    
    // Generate unique blob name
    const uniqueId = uuidv4();
    const blobName = `${dataRoomId}/${uniqueId}-${filename}`;
    
    // Get block blob client
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    
    // Upload data
    await blockBlobClient.uploadData(fileBuffer, {
      blobHTTPHeaders: {
        blobContentType: contentType,
      },
    });
    
    // Get blob URL
    const blobUrl = blockBlobClient.url;
    
    // Encrypt URL
    const encryptedUrl = encryptBlobUrl(blobUrl);
    
    console.log(`✓ Uploaded to Azure: ${blobName}`);
    
    return {
      url: blobUrl,
      encryptedUrl,
      pathname: blobName,
      contentType,
      contentLength: fileBuffer.length,
      uploadedAt: new Date(),
    };
  } catch (error) {
    console.error('Azure upload error:', error);
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
