// Run: node db/run_marketplace_migration.js
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'marketplace_migration.sql'), 'utf8');
    await pool.query(sql);
    console.log('✅ Marketplace migration OK');
    const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
    console.log('Tables:');
    res.rows.forEach(r => console.log(`  - ${r.table_name}`));
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}
run();
