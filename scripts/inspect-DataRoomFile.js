#!/usr/bin/env node

/**
 * Inspect DataRoomFile table structure
 */

require('dotenv').config();
const { Pool } = require('pg');

async function inspectDataRoomFile() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    console.log('========================================');
    console.log('DataRoomFile Table Inspection');
    console.log('========================================\n');

    // 1. Check if DataRoomFile table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'DataRoomFile'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('❌ DataRoomFile table does NOT exist');
      await pool.end();
      return;
    }
    console.log('✓ DataRoomFile table exists\n');

    // 2. Get all columns
    console.log('2. Table Structure (DataRoomFile):');
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
      AND table_name = 'DataRoomFile'
      ORDER BY ordinal_position;
    `);

    columns.rows.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
      const length = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
      console.log(`  ${col.column_name.padEnd(25)} ${col.data_type.toUpperCase()}${length} ${nullable}${defaultVal}`);
    });
    console.log('');

    // 3. Get constraints
    console.log('3. Constraints:');
    console.log('----------------------------------------');
    const constraints = await pool.query(`
      SELECT 
        constraint_name,
        constraint_type
      FROM information_schema.table_constraints
      WHERE table_schema = 'public' 
      AND table_name = 'DataRoomFile';
    `);

    constraints.rows.forEach(con => {
      console.log(`  ${con.constraint_type}: ${con.constraint_name}`);
    });
    console.log('');

    // 4. Get foreign keys
    console.log('4. Foreign Keys:');
    console.log('----------------------------------------');
    const fks = await pool.query(`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'DataRoomFile';
    `);

    fks.rows.forEach(fk => {
      console.log(`  ${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    });
    console.log('');

    // 5. Count records
    const count = await pool.query('SELECT COUNT(*) as count FROM "DataRoomFile"');
    console.log(`5. Total Records: ${count.rows[0].count}\n`);

    // 6. Sample data
    console.log('6. Sample Data (last 3 records):');
    console.log('----------------------------------------');
    // Get actual column names from the table
    const actualColumns = columns.rows.map(c => c.column_name);
    const selectCols = ['id', 'name', '"userId"', '"dataRoomId"', '"folderId"', '"blobUrl"', '"encryptedURL"', 'size', 'type', '"inVectorStore"', '"createdAt"']
      .filter(col => {
        const colName = col.replace(/"/g, '');
        return actualColumns.includes(colName);
      });
    
    const sample = await pool.query(`
      SELECT ${selectCols.join(', ')}
      FROM "DataRoomFile"
      ORDER BY "createdAt" DESC
      LIMIT 3;
    `);

    if (sample.rows.length === 0) {
      console.log('  No records found\n');
    } else {
      sample.rows.forEach((row, idx) => {
        console.log(`\n  Record ${idx + 1}:`);
        Object.keys(row).forEach(key => {
          const value = row[key];
          if (value && typeof value === 'string' && value.length > 80) {
            console.log(`    ${key}: ${value.substring(0, 80)}...`);
          } else {
            console.log(`    ${key}: ${value || 'NULL'}`);
          }
        });
      });
      console.log('');
    }

    console.log('========================================');
    console.log('Inspection complete!');
    console.log('========================================');

  } catch (error) {
    console.error('Error inspecting DataRoomFile:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

inspectDataRoomFile()
  .then(() => {
    console.log('\n✓ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Script failed:', error);
    process.exit(1);
  });

