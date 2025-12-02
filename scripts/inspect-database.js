#!/usr/bin/env node

/**
 * Database Inspection Script
 * Inspects dataroom_files table structure and data
 */

require('dotenv').config();
const { Pool } = require('pg');

async function inspectDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    console.log('========================================');
    console.log('Database Inspection');
    console.log('========================================\n');

    // 1. Check if dataroom_files table exists
    console.log('1. Checking dataroom_files table...');
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'dataroom_files'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('❌ dataroom_files table does NOT exist');
      await pool.end();
      return;
    }
    console.log('✓ dataroom_files table exists\n');

    // 2. Get all columns in dataroom_files
    console.log('2. Table Structure (dataroom_files):');
    console.log('----------------------------------------');
    const columns = await pool.query(`
      SELECT 
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'dataroom_files'
      ORDER BY ordinal_position;
    `);

    columns.rows.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
      const length = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
      console.log(`  ${col.column_name.padEnd(25)} ${col.data_type.toUpperCase()}${length} ${nullable}${defaultVal}`);
    });
    console.log('');

    // 3. Get all constraints
    console.log('3. Constraints:');
    console.log('----------------------------------------');
    const constraints = await pool.query(`
      SELECT 
        constraint_name,
        constraint_type
      FROM information_schema.table_constraints
      WHERE table_schema = 'public' 
      AND table_name = 'dataroom_files';
    `);

    constraints.rows.forEach(con => {
      console.log(`  ${con.constraint_type}: ${con.constraint_name}`);
    });
    console.log('');

    // 4. Get indexes
    console.log('4. Indexes:');
    console.log('----------------------------------------');
    const indexes = await pool.query(`
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' 
      AND tablename = 'dataroom_files';
    `);

    indexes.rows.forEach(idx => {
      console.log(`  ${idx.indexname}`);
      console.log(`    ${idx.indexdef}`);
    });
    console.log('');

    // 5. Count records
    console.log('5. Record Count:');
    console.log('----------------------------------------');
    const count = await pool.query('SELECT COUNT(*) as count FROM dataroom_files');
    console.log(`  Total records: ${count.rows[0].count}\n`);

    // 6. Sample data (last 5 records)
    console.log('6. Sample Data (last 5 records):');
    console.log('----------------------------------------');
    
    // First check which columns exist
    const existingColumns = columns.rows.map(c => c.column_name);
    const selectColumns = ['id', 'user_id', 'subprocess_id', 'file_name', 'file_size', 'created_at']
      .filter(col => existingColumns.includes(col));
    
    // Add optional columns if they exist
    if (existingColumns.includes('organization_id')) selectColumns.push('organization_id');
    if (existingColumns.includes('file_uuid')) selectColumns.push('file_uuid');
    if (existingColumns.includes('blob_url')) selectColumns.push('blob_url');
    if (existingColumns.includes('encrypted_blob_url')) selectColumns.push('encrypted_blob_url');
    
    const sample = await pool.query(`
      SELECT ${selectColumns.join(', ')}
      FROM dataroom_files
      ORDER BY created_at DESC
      LIMIT 5;
    `);

    if (sample.rows.length === 0) {
      console.log('  No records found\n');
    } else {
      sample.rows.forEach((row, idx) => {
        console.log(`\n  Record ${idx + 1}:`);
        console.log(`    ID: ${row.id}`);
        console.log(`    User ID: ${row.user_id}`);
        console.log(`    Subprocess ID: ${row.subprocess_id || 'NULL'}`);
        console.log(`    Organization ID: ${row.organization_id || 'NULL'}`);
        console.log(`    File Name: ${row.file_name}`);
        console.log(`    File UUID: ${row.file_uuid || 'NULL'}`);
        console.log(`    Blob URL: ${row.blob_url ? row.blob_url.substring(0, 80) + '...' : 'NULL'}`);
        console.log(`    Encrypted URL: ${row.encrypted_blob_url ? 'Present' : 'NULL'}`);
        console.log(`    File Size: ${row.file_size ? (row.file_size / 1024).toFixed(2) + ' KB' : 'NULL'}`);
        console.log(`    Created At: ${row.created_at}`);
      });
      console.log('');
    }

    // 7. Check for DataRoomFile table (the new one we shouldn't use)
    console.log('7. Checking for DataRoomFile table (should NOT exist):');
    console.log('----------------------------------------');
    const newTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'DataRoomFile'
      );
    `);

    if (newTableCheck.rows[0].exists) {
      const newTableCount = await pool.query('SELECT COUNT(*) as count FROM "DataRoomFile"');
      console.log(`⚠️  DataRoomFile table EXISTS with ${newTableCount.rows[0].count} records`);
      console.log('   This table should be deleted - it was created by mistake\n');
    } else {
      console.log('✓ DataRoomFile table does NOT exist (good)\n');
    }

    // 8. Check for other dataroom-related tables
    console.log('8. Other dataroom-related tables:');
    console.log('----------------------------------------');
    const otherTables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE '%dataroom%' OR table_name LIKE '%DataRoom%'
      ORDER BY table_name;
    `);

    otherTables.rows.forEach(t => {
      console.log(`  - ${t.table_name}`);
    });
    console.log('');

    console.log('========================================');
    console.log('Inspection complete!');
    console.log('========================================');

  } catch (error) {
    console.error('Error inspecting database:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run inspection
inspectDatabase()
  .then(() => {
    console.log('\n✓ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Script failed:', error);
    process.exit(1);
  });

