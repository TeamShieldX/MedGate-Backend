/**
 * Database & In-Memory Seeder - SHI-6
 * MedGate Backend
 * 
 * Seeds Synthea synthetic patient records and related clinical entities
 * into PostgreSQL (Neon) or memory.
 */

const { seedDataset, checkDbConnection } = require('./patientRepository');
const { pool } = require('./index');
const fs = require('fs');
const path = require('path');

async function seed(count = 25) {
  console.log(`[Seed] Initializing Synthea synthetic patient data seeding (target: ${count} records)...`);

  const dbConnected = await checkDbConnection();
  if (dbConnected) {
    console.log('[Seed] PostgreSQL database connected. Applying schema DDL...');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await pool.query(schemaSql);
    console.log('[Seed] Schema tables and indexes created.');
  } else {
    console.log('[Seed] Notice: DATABASE_URL not connected. Seeding in-memory Synthea store.');
  }

  const result = await seedDataset(count);
  console.log(`[Seed] Successfully seeded ${result.seededCount} Synthea patient records into ${result.source}.`);
  return result;
}

if (require.main === module) {
  const countArg = parseInt(process.argv[2], 10) || 25;
  seed(countArg)
    .then(() => {
      console.log('[Seed] Seeding process completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Seed] Error during seeding:', err);
      process.exit(1);
    });
}

module.exports = { seed };
