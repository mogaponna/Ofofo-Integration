/**
 * Script to inspect dataroom_files table structure and data
 * Run with: node scripts/inspect-dataroom-files.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not found in environment');
  process.exit(1);
}

async function inspectDataroomFiles() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('========================================');
    console.log('Inspecting dataroom_files table...');
    console.log('========================================\n');

    // 1. Get table structure
    console.log('1. Table Structure:');
    console.log('----------------------------------------');
    const structureResult = await pool.query(`
      SELECT 
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'dataroom_files'
      ORDER BY ordinal_position;
    `);

    if (structureResult.rows.length === 0) {
      console.log('⚠️  Table "dataroom_files" does not exist!');
      console.log('\nCreating table structure...');
      
      // Try to create the table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS dataroom_files (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          subprocess_id TEXT NOT NULL,
          file_name TEXT NOT NULL,
          file_path TEXT NOT NULL,
          file_type TEXT DEFAULT 'markdown',
          file_size BIGINT,
          blob_url TEXT,
          encrypted_blob_url TEXT,
          dataroom_id TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      console.log('✓ Table created');
      return;
    }

    structureResult.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(25)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

    // 2. Get sample data (only existing columns)
    console.log('\n2. Sample Data (last 5 records):');
    console.log('----------------------------------------');
    const dataResult = await pool.query(`
      SELECT 
        id,
        user_id,
        subprocess_id,
        file_name,
        file_path,
        file_type,
        file_size,
        created_at,
        processed,
        context_added,
        evaluated
      FROM dataroom_files
      ORDER BY created_at DESC
      LIMIT 5;
    `);

    if (dataResult.rows.length === 0) {
      console.log('No records found in dataroom_files table');
    } else {
      dataResult.rows.forEach((row, index) => {
        console.log(`\nRecord ${index + 1}:`);
        console.log(`  ID: ${row.id}`);
        console.log(`  User ID: ${row.user_id}`);
        console.log(`  Subprocess ID: ${row.subprocess_id}`);
        console.log(`  File Name: ${row.file_name}`);
        console.log(`  File Path: ${row.file_path}`);
        console.log(`  File Type: ${row.file_type}`);
        console.log(`  File Size: ${row.file_size} bytes`);
        console.log(`  Created At: ${row.created_at}`);
        console.log(`  Processed: ${row.processed || false}`);
        console.log(`  Context Added: ${row.context_added || false}`);
        console.log(`  Evaluated: ${row.evaluated || false}`);
        
        // Analyze file_path to understand structure
        if (row.file_path) {
          console.log(`  File Path Analysis:`);
          const pathParts = row.file_path.split('/').filter(p => p);
          console.log(`    Path Parts: ${JSON.stringify(pathParts)}`);
          const fileName = pathParts[pathParts.length - 1];
          console.log(`    File Name: ${fileName}`);
        }
      });
    }

    // 3. Get statistics
    console.log('\n3. Statistics:');
    console.log('----------------------------------------');
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_files,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT subprocess_id) as unique_subprocesses,
        SUM(file_size) as total_size_bytes,
        AVG(file_size) as avg_size_bytes,
        COUNT(CASE WHEN processed = true THEN 1 END) as processed_files,
        COUNT(CASE WHEN context_added = true THEN 1 END) as context_added_files,
        COUNT(CASE WHEN evaluated = true THEN 1 END) as evaluated_files
      FROM dataroom_files;
    `);

    if (statsResult.rows.length > 0) {
      const stats = statsResult.rows[0];
      console.log(`  Total Files: ${stats.total_files}`);
      console.log(`  Unique Users: ${stats.unique_users}`);
      console.log(`  Unique Subprocesses: ${stats.unique_subprocesses}`);
      console.log(`  Total Size: ${stats.total_size_bytes ? (stats.total_size_bytes / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'}`);
      console.log(`  Average Size: ${stats.avg_size_bytes ? (stats.avg_size_bytes / 1024).toFixed(2) + ' KB' : 'N/A'}`);
      console.log(`  Processed: ${stats.processed_files}`);
      console.log(`  Context Added: ${stats.context_added_files}`);
      console.log(`  Evaluated: ${stats.evaluated_files}`);
    }

    // 4. Check file naming patterns
    console.log('\n4. File Naming Patterns:');
    console.log('----------------------------------------');
    const patternResult = await pool.query(`
      SELECT 
        id,
        user_id,
        subprocess_id,
        file_name,
        file_path
      FROM dataroom_files
      ORDER BY created_at DESC
      LIMIT 10;
    `);

    if (patternResult.rows.length > 0) {
      patternResult.rows.forEach((row, index) => {
        console.log(`\nFile ${index + 1}:`);
        console.log(`  ID: ${row.id}`);
        console.log(`  User ID: ${row.user_id}`);
        console.log(`  Subprocess ID: ${row.subprocess_id}`);
        console.log(`  File Name: ${row.file_name}`);
        console.log(`  File Path: ${row.file_path}`);
      });
    } else {
      console.log('No files found');
    }

    console.log('\n========================================');
    console.log('Inspection complete!');
    console.log('========================================');

  } catch (error) {
    console.error('Error inspecting dataroom_files:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the inspection
inspectDataroomFiles()
  .then(() => {
    console.log('\n✓ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Script failed:', error);
    process.exit(1);
  });

