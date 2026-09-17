/**
 * Automated Unit Tests for Data Layer & Synthea Integration - SHI-6
 * MedGate Backend
 */

const assert = require('assert');
const {
  CANONICAL_SYNTHEA_PATIENTS,
  generateSyntheaDataset,
} = require('../db/syntheaDataset');
const {
  loadSyntheaPatients,
  parseCsv,
  SYNTHEA_DATA_DIR,
} = require('../db/syntheaLoader');
const {
  getAllPatients,
  getPatientById,
  seedDataset,
  resetInMemoryDataset,
} = require('../db/patientRepository');
const { ROLES } = require('../services/rbac');
const path = require('path');
const fs = require('fs');

let passedTests = 0;
let totalTests = 0;

async function runTestAsync(description, testFn) {
  totalTests++;
  try {
    await testFn();
    console.log(`  PASS: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(` FAIL: ${description}`);
    console.error(`        ${err.message}`);
  }
}

(async () => {
  console.log('=== MedGate Data Layer & Synthea Test Suite (SHI-6) ===\n');

  // 1. Official Synthea CSV Ingestion Tests
  console.log('1. Official Synthea CSV Ingestion:');

  await runTestAsync('Official Synthea CSV directory and core files exist', async () => {
    assert.strictEqual(fs.existsSync(path.join(SYNTHEA_DATA_DIR, 'patients.csv')), true);
    assert.strictEqual(fs.existsSync(path.join(SYNTHEA_DATA_DIR, 'conditions.csv')), true);
    assert.strictEqual(fs.existsSync(path.join(SYNTHEA_DATA_DIR, 'medications.csv')), true);
    assert.strictEqual(fs.existsSync(path.join(SYNTHEA_DATA_DIR, 'encounters.csv')), true);
  });

  await runTestAsync('loadSyntheaPatients parses official Synthea records with relational entities', async () => {
    const loaded = loadSyntheaPatients({ limit: 10 });
    assert.strictEqual(loaded.length, 10);
    const first = loaded[0];
    assert.strictEqual(typeof first.id, 'string');
    assert.strictEqual(typeof first.firstName, 'string');
    assert.strictEqual(typeof first.lastName, 'string');
    assert.strictEqual(['M', 'F'].includes(first.gender), true);
    assert.strictEqual(Array.isArray(first.diagnoses), true);
    assert.strictEqual(Array.isArray(first.medications), true);
    assert.strictEqual(Array.isArray(first.encounters), true);
    assert.strictEqual(Array.isArray(first.observations), true);
  });

  // 2. Synthea Synthetic Model & Expansion
  console.log('\n2. Synthea Synthetic Model & Expansion:');

  await runTestAsync('Canonical Synthea dataset contains valid patient profiles', async () => {
    assert.strictEqual(CANONICAL_SYNTHEA_PATIENTS.length >= 5, true);
    const p1 = CANONICAL_SYNTHEA_PATIENTS[0];
    assert.strictEqual(p1.firstName, 'Sarah');
    assert.strictEqual(p1.lastName, 'Connor');
    assert.strictEqual(p1.gender, 'F');
  });

  await runTestAsync('Dataset generator scales up with unique UUIDs and clinical sub-entities', async () => {
    const generated = generateSyntheaDataset(30);
    assert.strictEqual(generated.length, 30);
    const ids = new Set(generated.map((p) => p.id));
    assert.strictEqual(ids.size, 30);
    assert.strictEqual(Array.isArray(generated[0].medications), true);
  });

  // 3. Patient Repository Queries
  console.log('\n3. Patient Repository Query & Retrieval:');

  await runTestAsync('getAllPatients returns list and total count', async () => {
    const res = await getAllPatients({ role: ROLES.DOCTOR, limit: 10, offset: 0 });
    assert.strictEqual(res.total >= 10, true);
    assert.strictEqual(Array.isArray(res.data), true);
    assert.strictEqual(res.data.length, 10);
  });

  await runTestAsync('getPatientById retrieves existing Synthea patient by ID', async () => {
    const all = await getAllPatients({ limit: 1 });
    const id = all.data[0].id;
    const retrieved = await getPatientById(id, { role: ROLES.DOCTOR });
    assert.strictEqual(retrieved !== null, true);
    assert.strictEqual(retrieved.id, id);
    assert.strictEqual(typeof retrieved.firstName, 'string');
    assert.strictEqual(typeof retrieved.primaryCondition, 'string');
  });

  await runTestAsync('getPatientById returns null for non-existent ID', async () => {
    const nonExistent = await getPatientById('00000000-0000-0000-0000-000000000000');
    assert.strictEqual(nonExistent, null);
  });

  // 4. Integrated Role-Based Field Gating
  console.log('\n4. Integrated Field-Level Access Gating:');

  await runTestAsync('getAllPatients as Receptionist redacts confidential notes and conditions', async () => {
    const res = await getAllPatients({ role: ROLES.RECEPTIONIST, limit: 5 });
    const first = res.data[0];
    assert.strictEqual(typeof first.firstName, 'string');
    assert.strictEqual(typeof first.lastName, 'string');
    assert.strictEqual(first.confidentialNotes, undefined);
    assert.strictEqual(first.primaryCondition, undefined);
    assert.strictEqual(first.medications, undefined);
    assert.strictEqual(first.diagnoses, undefined);
  });

  await runTestAsync('getPatientById as Nurse redacts confidential notes while keeping medications', async () => {
    const all = await getAllPatients({ limit: 1 });
    const id = all.data[0].id;
    const nurseView = await getPatientById(id, { role: ROLES.NURSE });
    assert.strictEqual(nurseView.confidentialNotes, undefined);
    assert.strictEqual(nurseView.primaryCondition !== undefined, true);
    assert.strictEqual(Array.isArray(nurseView.medications), true);
  });

  await runTestAsync('getPatientById as Researcher redacts PII and confidential notes', async () => {
    const all = await getAllPatients({ limit: 1 });
    const id = all.data[0].id;
    const researcherView = await getPatientById(id, { role: ROLES.RESEARCHER });
    assert.strictEqual(researcherView.id, id);
    assert.strictEqual(researcherView.primaryCondition !== undefined, true);
    assert.strictEqual(researcherView.firstName, undefined);
    assert.strictEqual(researcherView.lastName, undefined);
    assert.strictEqual(researcherView.phone, undefined);
    assert.strictEqual(researcherView.address, undefined);
    assert.strictEqual(researcherView.confidentialNotes, undefined);
  });

  // 5. Seeding Operation
  console.log('\n5. Seeding Operations:');

  await runTestAsync('seedDataset seeds Synthea patient records', async () => {
    const seedResult = await seedDataset(25);
    assert.strictEqual(seedResult.seededCount, 25);
    const postSeed = await getAllPatients({ limit: 50 });
    assert.strictEqual(postSeed.total, 25);
  });

  // Summary
  console.log(`\n=== Test Results: ${passedTests}/${totalTests} Passed ===`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
})();
