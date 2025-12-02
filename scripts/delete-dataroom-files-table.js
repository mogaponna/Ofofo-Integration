#!/usr/bin/env node

/**
 * Delete dataroom_files table (2 records)
 * This table was created by mistake - we use DataRoomFile instead
 */

require('dotenv').config();
const { Pool } = require('pg');

async function deleteDataroomFilesTable() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    console.log('========================================');
    console.log('Deleting dataroom_files table');
    console.log('========================================\n');

    // 1. Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'dataroom_files'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('✓ dataroom_files table does NOT exist (already deleted)');
      await pool.end();
      return;
    }

    // 2. Count records
    const count = await pool.query('SELECT COUNT(*) as count FROM dataroom_files');
    console.log(`Found ${count.rows[0].count} records in dataroom_files table\n`);

    // 3. Show sample data before deletion
    console.log('Sample records (will be deleted):');
    const sample = await pool.query(`
      SELECT id, file_name, user_id, created_at
      FROM dataroom_files
      ORDER BY created_at DESC;
    `);

    sample.rows.forEach((row, idx) => {
      console.log(`  ${idx + 1}. ID: ${row.id}, File: ${row.file_name}, User: ${row.user_id.substring(0, 8)}..., Created: ${row.created_at}`);
    });
    console.log('');

    // 4. Delete the table
    console.log('Deleting dataroom_files table...');
    await pool.query('DROP TABLE IF EXISTS dataroom_files CASCADE;');
    console.log('✓ Table deleted successfully\n');

    // 5. Verify deletion
    const verifyCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'dataroom_files'
      );
    `);

    if (!verifyCheck.rows[0].exists) {
      console.log('✓ Verification: dataroom_files table no longer exists');
    } else {
      console.log('⚠️  Warning: Table still exists after deletion attempt');
    }

    console.log('\n========================================');
    console.log('Deletion complete!');
    console.log('========================================');

  } catch (error) {
    console.error('Error deleting table:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

deleteDataroomFilesTable()
  .then(() => {
    console.log('\n✓ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Script failed:', error);
    process.exit(1);
  });

