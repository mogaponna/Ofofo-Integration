// Electron 28 uses Node.js 20+, which has native URL.searchParams support
// No polyfill needed - the native implementation works correctly
// The previous polyfill was causing issues by interfering with the native implementation

const { Pool } = require('pg');
require('dotenv').config();

// Database connection pool
let pool = null;

function getPool() {
  if (!pool) {
    console.log('[DB] ========================================');
    console.log('[DB] CREATING DATABASE POOL');
    console.log('[DB] ========================================');
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      console.warn('[DB] DATABASE_URL not set. Database operations will fail.');
      return null;
    }
    
    console.log('[DB] DATABASE_URL exists:', !!databaseUrl);
    console.log('[DB] DATABASE_URL length:', databaseUrl ? databaseUrl.length : 0);
    console.log('[DB] DATABASE_URL preview:', databaseUrl ? databaseUrl.substring(0, 80) + '...' : 'N/A');
    
    // Extract password for logging (without exposing full password)
    // This helps debug password authentication issues
    try {
      const urlMatch = databaseUrl.match(/postgresql?:\/\/[^:]+:([^@]+)@/);
      if (urlMatch && urlMatch[1]) {
        const password = urlMatch[1];
        const passwordLength = password.length;
        // Show first and last character for debugging (password might have special chars)
        const passwordPreview = passwordLength > 2 
          ? `${password[0]}...${password[passwordLength - 1]}` 
          : '***';
        console.log('[DB] Password extracted from URL - length:', passwordLength, 'preview:', passwordPreview);
        // Check if password might need URL encoding
        if (password.includes(' ') || password.includes('@') || password.includes('#')) {
          console.warn('[DB] ⚠️  Password contains special characters that might need URL encoding!');
          console.warn('[DB] If authentication fails, try URL-encoding the password in DATABASE_URL');
        }
      }
    } catch (parseErr) {
      console.warn('[DB] Could not extract password from URL for logging:', parseErr.message);
    }
    
    // Verify native URL.searchParams is available (should be in Node.js 20+)
    try {
      const testUrl = new URL('http://example.com?test=value');
      if (testUrl.searchParams && typeof testUrl.searchParams.get === 'function') {
        console.log('[DB] ✓ Native URL.searchParams is available');
      } else {
        console.warn('[DB] ⚠️  URL.searchParams not available (unexpected in Node.js 20+)');
      }
    } catch (e) {
      console.warn('[DB] ⚠️  Error testing URL.searchParams:', e.message);
    }
    
    console.log('[DB] Creating Pool with connectionString (using DATABASE_URL as-is)...');
    console.log('[DB] Note: pg library will handle URL parsing and password encoding');
    try {
      // Use DATABASE_URL directly - pg-connection-string handles URL encoding
      // DO NOT modify or re-parse the URL as it may corrupt special characters in password
      pool = new Pool({
        connectionString: databaseUrl, // Use as-is - pg handles encoding
        ssl: databaseUrl.includes('sslmode=require') || databaseUrl.includes('ssl=true') 
          ? { rejectUnauthorized: false } 
          : false,
        // Optimized pool settings for performance
        max: 3, // Reduced pool size for lightweight app
        min: 1, // Keep at least 1 connection ready
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 15000, // 15s for initial connection (Neon can be slow)
        // Statement timeout to prevent hanging queries
        statement_timeout: 15000, // 15 seconds for queries
        // Query timeout
        query_timeout: 15000,
        // Keep connections alive
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
      });

      pool.on('error', (err) => {
        console.error('[DB] Unexpected error on idle client', err);
        // Don't crash on connection errors, just log
      });

      // Pre-warm connection on startup (with timeout) - don't block
      (async () => {
        try {
          await Promise.race([
            pool.query('SELECT 1'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 10000))
          ]);
          console.log('[DB] Pre-warm connection successful');
        } catch (err) {
          console.warn('[DB] Pre-warm connection failed (will connect on first use):', err.message);
          // Silent fail on pre-warm, connection will be created on first use
        }
      })();

      console.log('[DB] Database connection pool created (optimized)');
    } catch (error) {
      console.error('[DB] Failed to create connection pool:', error);
      return null;
    }
  }

  return pool;
}

/**
 * Generate a random 6-digit OTP
 */
function generateOTP() {
  const min = 100000;
  const max = 999999;
  return Math.floor(Math.random() * (max - min + 1) + min).toString();
}

/**
 * Get OTP expiry time (10 minutes from now)
 */
function getOTPExpiry() {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + 10);
  return expiry;
}

/**
 * Check if OTP is expired
 */
function isOTPExpired(expiryTime) {
  return new Date() > new Date(expiryTime);
}

// Cache for user lookups (short-lived, 30 seconds)
const userCache = new Map();
const CACHE_TTL = 30000; // 30 seconds

/**
 * Get user by email (for OTP verification only) - with caching
 */
async function getUser(email) {
  const db = getPool();
  if (!db) {
    throw new Error('Database connection not available');
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();
    
    // Check cache first
    const cacheKey = `user:${normalizedEmail}`;
    const cached = userCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    // Query database with timeout and retry logic
    let result;
    let retries = 2;
    while (retries > 0) {
      try {
        result = await Promise.race([
          db.query('SELECT id, email, "otpSecret", "otpExpiry" FROM "User" WHERE email = $1', [normalizedEmail]),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), 8000))
        ]);
        break; // Success, exit retry loop
      } catch (queryError) {
        retries--;
        if (retries === 0 || !queryError.message.includes('timeout')) {
          throw queryError;
        }
        console.warn(`[DB] Query timeout, retrying... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
      }
    }

    const user = result.rows[0] || null;
    
    // Cache result
    if (user) {
      userCache.set(cacheKey, { data: user, timestamp: Date.now() });
      // Clean cache after TTL
      setTimeout(() => userCache.delete(cacheKey), CACHE_TTL);
    }
    
    return user;
  } catch (error) {
    console.error('[DB] Error getting user:', error);
    throw error;
  }
}

/**
 * Store OTP for email (update existing user or create if needed)
 * Note: This is only for OTP verification, not user management
 * Optimized: Check first, then update or insert
 */
async function storeOTP(email, otp, otpExpiry) {
  console.log('[DB] ========================================');
  console.log('[DB] storeOTP called for:', email);
  console.log('[DB] ========================================');
  
  const db = getPool();
  if (!db) {
    console.log('[DB] ✗ Database pool is null!');
    throw new Error('Database connection not available');
  }
  
  console.log('[DB] Database pool exists:', !!db);
  console.log('[DB] Pool type:', typeof db);
  console.log('[DB] Pool constructor:', db.constructor ? db.constructor.name : 'unknown');

  try {
    const normalizedEmail = email.toLowerCase().trim();
    console.log('[DB] Normalized email:', normalizedEmail);
    
    // Simplified: Try update first, if no rows affected, then insert
    // This avoids the need for ON CONFLICT and handles race conditions
    let result;
    
    try {
      console.log('[DB] Attempting UPDATE query...');
      // Try update first (most common case - user exists)
      const updateResult = await Promise.race([
        db.query(
          'UPDATE "User" SET "otpSecret" = $1, "otpExpiry" = $2 WHERE email = $3 RETURNING id, email, "otpSecret", "otpExpiry"',
          [otp, otpExpiry, normalizedEmail]
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), 8000))
      ]);
      console.log('[DB] UPDATE query completed, rows:', updateResult.rows.length);
      
      if (updateResult.rows.length > 0) {
        result = updateResult.rows[0];
      } else {
        // No user found, insert new one
        console.log('[DB] User not found, creating new user for OTP');
        const insertResult = await Promise.race([
          db.query(
            `INSERT INTO "User" (email, "otpSecret", "otpExpiry", "isApproved")
             VALUES ($1, $2, $3, true)
             RETURNING id, email, "otpSecret", "otpExpiry"`,
            [normalizedEmail, otp, otpExpiry]
          ),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), 8000))
        ]);
        result = insertResult.rows[0];
      }
    } catch (dbError) {
      // If insert fails due to duplicate (race condition), try update again
      if (dbError.code === '23505') {
        console.log('[DB] Race condition detected, retrying update...');
        const retryResult = await Promise.race([
          db.query(
            'UPDATE "User" SET "otpSecret" = $1, "otpExpiry" = $2 WHERE email = $3 RETURNING id, email, "otpSecret", "otpExpiry"',
            [otp, otpExpiry, normalizedEmail]
          ),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), 8000))
        ]);
        result = retryResult.rows[0];
      } else {
        console.error('[DB] Error storing OTP:', dbError.message);
        throw dbError;
      }
    }

    // Clear cache for this user
    userCache.delete(`user:${normalizedEmail}`);
    
    return result;
  } catch (error) {
    console.error('[DB] Error storing OTP:', error);
    throw error;
  }
}

/**
 * Verify OTP and get user (no clearing - OTP expires naturally)
 */
async function verifyOTP(email, otp) {
  const db = getPool();
  if (!db) {
    throw new Error('Database connection not available');
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await getUser(normalizedEmail);
    
    if (!user) {
      return { valid: false, error: 'User not found' };
    }

    // Check if OTP exists and matches
    if (!user.otpSecret || user.otpSecret !== otp) {
      return { valid: false, error: 'Invalid OTP' };
    }

    // Check if OTP expired
    if (!user.otpExpiry || isOTPExpired(user.otpExpiry)) {
      return { valid: false, error: 'OTP has expired' };
    }

    // OTP is valid - return user info
    return { 
      valid: true, 
      user: {
        id: user.id,
        email: user.email,
        token: user.id // Use user ID as token
      }
    };
  } catch (error) {
    console.error('[DB] Error verifying OTP:', error);
    throw error;
  }
}

// Cache for controls (5 minutes)
const controlsCache = new Map();
const CONTROLS_CACHE_TTL = 300000; // 5 minutes

/**
 * Get controls from orgcontrols table (lowercase) - optimized with caching
 * Columns: id, dataroom_id, organization_id, control_id, implementation_status, control_data, created_at, updated_at
 */
async function getControls(organizationId, dataroomId) {
  const db = getPool();
  if (!db) {
    throw new Error('Database connection not available');
  }

  try {
    // Check cache first
    const cacheKey = `controls:${dataroomId || organizationId || 'all'}`;
    const cached = controlsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CONTROLS_CACHE_TTL) {
      return cached.data;
    }

    // Optimized query - only select needed columns
    let query = 'SELECT id, dataroom_id, organization_id, control_id, implementation_status, control_data FROM orgcontrols';
    const params = [];
    
    if (dataroomId) {
      query += ' WHERE dataroom_id = $1';
      params.push(dataroomId);
    } else if (organizationId) {
      query += ' WHERE organization_id = $1';
      params.push(organizationId);
    }
    
    query += ' ORDER BY control_id LIMIT 5000'; // Limit for performance
    
    // Add timeout to query (increased for reliability)
    let result;
    try {
      result = await Promise.race([
        db.query(query, params),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), 10000))
      ]);
    } catch (timeoutError) {
      console.error('[DB] Controls query timeout:', timeoutError);
      return []; // Return empty array on timeout
    }

    const controls = result.rows;
    
    // Cache result
    controlsCache.set(cacheKey, { data: controls, timestamp: Date.now() });
    setTimeout(() => controlsCache.delete(cacheKey), CONTROLS_CACHE_TTL);
    
    return controls;
  } catch (error) {
    console.error('[DB] Error getting controls:', error);
    // Return empty array on error instead of throwing
    return [];
  }
}

// Cache for evidence (5 minutes)
const evidenceCache = new Map();
const EVIDENCE_CACHE_TTL = 300000; // 5 minutes

/**
 * Get evidence from orgevidences table (lowercase) - optimized with caching
 * Columns: id, dataroom_id, organization_id, evidence_key, availability_status, evidence_data, created_at, updated_at
 */
async function getEvidence(organizationId, dataroomId) {
  const db = getPool();
  if (!db) {
    throw new Error('Database connection not available');
  }

  try {
    // Check cache first
    const cacheKey = `evidence:${dataroomId || organizationId || 'all'}`;
    const cached = evidenceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < EVIDENCE_CACHE_TTL) {
      return cached.data;
    }

    // Optimized query - only select needed columns
    let query = 'SELECT id, dataroom_id, organization_id, evidence_key, availability_status, evidence_data FROM orgevidences';
    const params = [];
    
    if (dataroomId) {
      query += ' WHERE dataroom_id = $1';
      params.push(dataroomId);
    } else if (organizationId) {
      query += ' WHERE organization_id = $1';
      params.push(organizationId);
    }
    
    query += ' ORDER BY evidence_key LIMIT 5000'; // Limit for performance
    
    // Add timeout to query (increased for reliability)
    let result;
    try {
      result = await Promise.race([
        db.query(query, params),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), 10000))
      ]);
    } catch (timeoutError) {
      console.error('[DB] Evidence query timeout:', timeoutError);
      return []; // Return empty array on timeout
    }

    const evidence = result.rows;
    
    // Cache result
    evidenceCache.set(cacheKey, { data: evidence, timestamp: Date.now() });
    setTimeout(() => evidenceCache.delete(cacheKey), EVIDENCE_CACHE_TTL);
    
    return evidence;
  } catch (error) {
    console.error('[DB] Error getting evidence:', error);
    // Return empty array on error instead of throwing
    return [];
  }
}

/**
 * Get user's active organization ID
 */
async function getUserOrganizationId(userId) {
  const db = getPool();
  if (!db) {
    throw new Error('Database connection not available');
  }

  try {
    const result = await db.query(
      'SELECT "activeOrganizationId" FROM "User" WHERE id = $1',
      [userId]
    );
    return result.rows[0]?.activeOrganizationId || null;
  } catch (error) {
    console.error('[DB] Error getting user organization:', error);
    throw error;
  }
}

/**
 * Subprocess Management Functions
 * Table: orgsubprocesses
 * Columns: id, user_id, organization_id, subprocess_name, subprocess_type, 
 *          connection_config, connection_status, created_at, updated_at
 */

/**
 * Create subprocesses table if it doesn't exist
 */
async function ensureSubprocessesTable() {
  const db = getPool();
  if (!db) return;

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS orgsubprocesses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        organization_id TEXT,
        subprocess_name TEXT NOT NULL,
        subprocess_type TEXT NOT NULL,
        connection_config JSONB,
        connection_status TEXT DEFAULT 'disconnected',
        results JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_orgsubprocesses_user_id ON orgsubprocesses(user_id);
      CREATE INDEX IF NOT EXISTS idx_orgsubprocesses_subprocess_type ON orgsubprocesses(subprocess_type);
    `);
    console.log('[DB] Subprocesses table ready');
  } catch (error) {
    console.error('[DB] Error creating subprocesses table:', error);
  }
}

// Ensure table exists on module load
ensureSubprocessesTable();

/**
 * Note: We use the DataRoomFile table (main table for dataroom files)
 * This is the primary table used by the web application
 */

/**
 * Save a subprocess configuration
 */
async function saveSubprocess(userId, subprocessData) {
  const db = getPool();
  if (!db) {
    throw new Error('Database connection not available');
  }

  try {
    const { subprocess_name, subprocess_type, connection_config, connection_status } = subprocessData;
    
    const result = await db.query(`
      INSERT INTO orgsubprocesses (user_id, subprocess_name, subprocess_type, connection_config, connection_status, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      RETURNING *
    `, [userId, subprocess_name, subprocess_type, JSON.stringify(connection_config), connection_status || 'disconnected']);
    
    return result.rows[0];
  } catch (error) {
    console.error('[DB] Error saving subprocess:', error);
    throw error;
  }
}

/**
 * Get all subprocesses for a user
 */
async function getUserSubprocesses(userId) {
  const db = getPool();
  if (!db) {
    throw new Error('Database connection not available');
  }

  try {
    const result = await db.query(`
      SELECT * FROM orgsubprocesses 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `, [userId]);
    
    return result.rows;
  } catch (error) {
    console.error('[DB] Error getting subprocesses:', error);
    return [];
  }
}

/**
 * Get a single subprocess by ID
 */
async function getSubprocessById(id) {
  const db = getPool();
  if (!db) {
    throw new Error('Database connection not available');
  }

  try {
    const result = await db.query(`
      SELECT * FROM orgsubprocesses WHERE id = $1
    `, [id]);
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('[DB] Error getting subprocess:', error);
    return null;
  }
}

/**
 * Update subprocess connection status
 */
async function updateSubprocessStatus(id, status) {
  const db = getPool();
  if (!db) {
    throw new Error('Database connection not available');
  }

  try {
    const result = await db.query(`
      UPDATE orgsubprocesses 
      SET connection_status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [status, id]);
    
    return result.rows[0];
  } catch (error) {
    console.error('[DB] Error updating subprocess status:', error);
    throw error;
  }
}

/**
 * Delete a subprocess
 */
async function deleteSubprocess(id) {
  const db = getPool();
  if (!db) {
    throw new Error('Database connection not available');
  }

  try {
    await db.query(`DELETE FROM orgsubprocesses WHERE id = $1`, [id]);
    return true;
  } catch (error) {
    console.error('[DB] Error deleting subprocess:', error);
    throw error;
  }
}

/**
 * Update subprocess results (track mod/benchmark analysis)
 * Stores fileId, blobUrl, encryptedBlobUrl for later retrieval
 * @param {string} id - UUID of the subprocess (from orgsubprocesses.id)
 */
async function updateSubprocessResults(id, modId, benchmarkId, fileId, blobUrl = null, encryptedBlobUrl = null) {
  const db = getPool();
  if (!db) {
    throw new Error('Database connection not available');
  }

  try {
    // id is UUID string (from orgsubprocesses.id which is UUID type)
    // Get current results
    const current = await db.query(`SELECT results FROM orgsubprocesses WHERE id = $1`, [id]);
    const results = current.rows[0]?.results || {};
    
    // Initialize mod entry if not exists
    if (!results[modId]) {
      results[modId] = {};
    }
    
    // Add benchmark analysis record with file URLs
    results[modId][benchmarkId] = {
      fileId,
      blobUrl: blobUrl || null,
      encryptedBlobUrl: encryptedBlobUrl || null,
      analyzedAt: new Date().toISOString(),
      status: 'completed'
    };
    
    // Update database
    const result = await db.query(`
      UPDATE orgsubprocesses 
      SET results = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [JSON.stringify(results), id]);
    
    console.log(`[DB] Updated subprocess results: mod=${modId}, benchmark=${benchmarkId}, fileId=${fileId}`);
    
    return result.rows[0];
  } catch (error) {
    console.error('[DB] Error updating subprocess results:', error);
    throw error;
  }
}

/**
 * Save a report file to DataRoomFile table
 * This is called AFTER successful Azure upload
 * Uses the main DataRoomFile table (not dataroom_files)
 * 
 * @param {string} fileId - UUID for the file (used as id)
 * @param {string} userId - User ID (UUID)
 * @param {string} organizationId - DataRoom ID (UUID, for web dataroom visibility)
 * @param {string} fileName - File name
 * @param {string} filePath - Local file path (not stored in DataRoomFile, kept for reference)
 * @param {number} fileSize - File size in bytes
 * @param {string|null} blobUrl - Azure blob URL (encrypted)
 * @param {string|null} encryptedBlobUrl - Encrypted blob URL
 */
async function saveReportFileWithId(fileId, userId, organizationId, fileName, filePath, fileSize, blobUrl = null, encryptedBlobUrl = null) {
  const db = getPool();
  if (!db) {
    throw new Error('Database connection not available');
  }

  try {
    // DataRoomFile table structure:
    // - id: UUID (PRIMARY KEY, auto-generated or use fileId)
    // - name: VARCHAR(255) NOT NULL
    // - userId: UUID NOT NULL
    // - dataRoomId: UUID NULL (FK to DataRoom.id)
    // - folderId: UUID NULL
    // - blobUrl: TEXT NOT NULL (encrypted URL - required!)
    // - encryptedURL: TEXT NULL
    // - size: VARCHAR(20) NULL
    // - type: VARCHAR(150) NULL
    // - inVectorStore: BOOLEAN DEFAULT false
    // - createdAt: TIMESTAMP NOT NULL
    // - updatedAt: TIMESTAMP NULL

    // Both blobUrl and encryptedURL should store the encrypted URL
    // blobUrl is NOT NULL, so we must provide it
    // Use encryptedBlobUrl (encrypted version) for both columns
    let encryptedUrlForStorage = encryptedBlobUrl;
    
    // If we only have plain blobUrl, encrypt it
    if (!encryptedUrlForStorage && blobUrl) {
      console.log('[DB] Encrypting plain blobUrl');
      const { encryptBlobUrl } = require('./encryption');
      encryptedUrlForStorage = encryptBlobUrl(blobUrl);
    }
    
    if (!encryptedUrlForStorage) {
      throw new Error('Encrypted blob URL is required for DataRoomFile table (blobUrl is NOT NULL)');
    }

    // Convert fileSize to string (size column is VARCHAR(20))
    const sizeStr = fileSize ? String(fileSize) : null;

    // Determine file type
    const fileType = fileName.endsWith('.md') ? 'text/markdown' : 'application/octet-stream';

    console.log(`[DB] Inserting into DataRoomFile: id=${fileId}, userId=${userId}, dataRoomId=${organizationId}, name=${fileName}`);

    // Insert into DataRoomFile table
    // Use fileId as the id (UUID), or let it auto-generate
    const result = await db.query(`
      INSERT INTO "DataRoomFile" (
        id,
        name,
        "userId",
        "dataRoomId",
        "folderId",
        "blobUrl",
        "encryptedURL",
        size,
        type,
        "inVectorStore",
        "createdAt",
        "updatedAt"
      ) VALUES ($1, $2, $3, $4, NULL, $5, $5, $6, $7, false, NOW(), NOW())
      RETURNING *
    `, [fileId, fileName, userId, organizationId, encryptedUrlForStorage, sizeStr, fileType]);

    console.log(`[DB] ✓ File saved to DataRoomFile with id: ${result.rows[0].id}`);
    
    return result.rows[0];
  } catch (error) {
    console.error('[DB] Error saving report file to DataRoomFile:', error);
    throw error;
  }
}

/**
 * Legacy function - kept for backward compatibility
 * Save a report file to DataRoomFile table
 * Note: This function doesn't include blob URLs - use saveReportFileWithId instead
 * @deprecated Use saveReportFileWithId instead for full functionality
 */
async function saveReportFile(userId, subprocessId, fileName, filePath, fileSize) {
  const db = getPool();
  if (!db) {
    throw new Error('Database connection not available');
  }

  try {
    // Generate UUID for the file
    const { randomUUID } = require('crypto');
    const fileId = randomUUID();
    
    // Get organization ID (fallback to userId)
    let dataRoomId = userId;
    try {
      const orgId = await getUserOrganizationId(userId);
      if (orgId) {
        dataRoomId = orgId;
      }
    } catch (orgError) {
      console.warn('[DB] Could not get organization ID for legacy saveReportFile:', orgError.message);
    }

    // DataRoomFile requires blobUrl (NOT NULL), so we need to provide a placeholder
    // This is a legacy function, so we'll use a placeholder encrypted URL
    const placeholderBlobUrl = 'legacy-file-placeholder'; // This should be replaced with actual blob URL
    
    const sizeStr = fileSize ? String(fileSize) : null;
    const fileType = fileName.endsWith('.md') ? 'text/markdown' : 'application/octet-stream';

    console.warn('[DB] Using legacy saveReportFile - blobUrl is required but not provided. Consider using saveReportFileWithId instead.');
    
    const result = await db.query(`
      INSERT INTO "DataRoomFile" (
        id,
        name,
        "userId",
        "dataRoomId",
        "folderId",
        "blobUrl",
        "encryptedURL",
        size,
        type,
        "inVectorStore",
        "createdAt",
        "updatedAt"
      ) VALUES ($1, $2, $3, $4, NULL, $5, NULL, $6, $7, false, NOW(), NOW())
      RETURNING *
    `, [fileId, fileName, userId, dataRoomId, placeholderBlobUrl, sizeStr, fileType]);
    
    return result.rows[0];
  } catch (error) {
    console.error('[DB] Error saving report file (legacy):', error);
    throw error;
  }
}

module.exports = {
  getPool,
  generateOTP,
  getOTPExpiry,
  isOTPExpired,
  getUser,
  storeOTP,
  verifyOTP,
  getControls,
  getEvidence,
  getUserOrganizationId,
  // Subprocess management
  saveSubprocess,
  getUserSubprocesses,
  getSubprocessById,
  updateSubprocessStatus,
  updateSubprocessResults,
  deleteSubprocess,
  // Dataroom
  saveReportFile,
  saveReportFileWithId,
};

