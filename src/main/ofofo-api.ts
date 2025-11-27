import axios from 'axios';
import { safeDecryptUrl } from './encryption';

const BACKEND_SERVICE_URL = process.env.BACKEND_SERVICE_URL || 'https://orchestrate.ofofo.ai';

export interface FileData {
  fileId: string;
  url: string;
}

export interface BackendAPIResponse {
  success: boolean;
  message?: string;
  [key: string]: any;
}

/**
 * Ofofo Backend API Client
 * Handles 3 main API calls: addToContext, evaluateEvidence, evaluateControls
 */
export class OfofoBackendClient {
  private baseUrl: string;
  
  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || BACKEND_SERVICE_URL;
  }
  
  /**
   * API 1: Add files to context (Graphiti - Knowledge Graph)
   */
  async addToContext(
    dataRoomId: string,
    userId: string,
    files: FileData[],
    fileType: 'document' | 'evidence' | 'certificate' = 'evidence'
  ): Promise<BackendAPIResponse> {
    try {
      console.log(`📤 Adding ${files.length} files to context...`);
      
      // Decrypt URLs before sending
      const contextFiles = files.map(file => ({
        fileId: file.fileId,
        url: safeDecryptUrl(file.url) || file.url,
      }));
      
      const payload = {
        user_id: dataRoomId,
        user_uuid: userId,
        context_files: contextFiles,
        file_type: fileType,
      };
      
      const response = await axios.post(
        `${this.baseUrl}/graphiti/add-documents`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 60000, // 60 seconds
        }
      );
      
      console.log('✓ Files added to context successfully');
      return {
        success: true,
        ...response.data,
      };
    } catch (error: any) {
      console.error('Add to context error:', error);
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Unknown error',
      };
    }
  }
  
  /**
   * API 2: Evaluate evidence (Lance - Evidence Evaluator)
   */
  async evaluateEvidence(
    dataRoomId: string,
    userId: string,
    files: FileData[],
    similarityThreshold: number = 0.5
  ): Promise<BackendAPIResponse> {
    try {
      console.log(`🔍 Evaluating evidence for ${files.length} files...`);
      
      // Decrypt URLs before sending
      const evaluationFiles = files.map(file => ({
        fileId: file.fileId,
        url: safeDecryptUrl(file.url) || file.url,
      }));
      
      const payload = {
        user_id: dataRoomId,
        user_uuid: userId,
        files: evaluationFiles,
        similarity_threshold: similarityThreshold,
      };
      
      const response = await axios.post(
        `${this.baseUrl}/lance/compliance-evidence-evaluator`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          timeout: 120000, // 2 minutes
        }
      );
      
      console.log('✓ Evidence evaluation complete');
      return {
        success: true,
        ...response.data,
      };
    } catch (error: any) {
      console.error('Evidence evaluation error:', error);
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Unknown error',
      };
    }
  }
  
  /**
   * API 3: Evaluate controls (Lance - Controls Evaluator)
   */
  async evaluateControls(
    dataRoomId: string,
    userId: string,
    files: FileData[],
    similarityThreshold: number = 0.5
  ): Promise<BackendAPIResponse> {
    try {
      console.log(`🎯 Evaluating controls for ${files.length} files...`);
      
      // Decrypt URLs before sending
      const evaluationFiles = files.map(file => ({
        fileId: file.fileId,
        url: safeDecryptUrl(file.url) || file.url,
      }));
      
      const payload = {
        user_id: dataRoomId,
        user_uuid: userId,
        files: evaluationFiles,
        similarity_threshold: similarityThreshold,
      };
      
      const response = await axios.post(
        `${this.baseUrl}/lance/compliance-controls-evaluator`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          timeout: 120000, // 2 minutes
        }
      );
      
      console.log('✓ Controls evaluation complete');
      return {
        success: true,
        ...response.data,
      };
    } catch (error: any) {
      console.error('Controls evaluation error:', error);
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Unknown error',
      };
    }
  }
  
  /**
   * Call all 3 APIs in parallel
   */
  async evaluateAll(
    dataRoomId: string,
    userId: string,
    files: FileData[]
  ): Promise<{
    context: BackendAPIResponse;
    evidence: BackendAPIResponse;
    controls: BackendAPIResponse;
  }> {
    console.log('🚀 Starting complete evaluation pipeline...');
    
    const [context, evidence, controls] = await Promise.all([
      this.addToContext(dataRoomId, userId, files),
      this.evaluateEvidence(dataRoomId, userId, files),
      this.evaluateControls(dataRoomId, userId, files),
    ]);
    
    console.log('✅ All evaluations complete!');
    
    return { context, evidence, controls };
  }
}

// Export singleton instance
export const ofofoBackendClient = new OfofoBackendClient();
