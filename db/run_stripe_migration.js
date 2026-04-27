// Run: node db/run_stripe_migration.js
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'stripe_migration.sql'), 'utf8');
    await pool.query(sql);
    console.log('✅ Stripe migration OK');
    const res = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='egg_purchases' ORDER BY ordinal_position"
    );
    console.log('egg_purchases columns:');
    res.rows.forEach(r => console.log(`  - ${r.column_name} (${r.data_type})`));
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}
run();
