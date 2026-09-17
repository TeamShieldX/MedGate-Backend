/**
 * MedGate Scalability & Performance Benchmark Test Suite (SHI-10)
 * 
 * Verifies and benchmarks MedGate across 2+ data scales:
 * - Scale A: 50 patient records
 * - Scale B: 500 patient records
 * 
 * Measures:
 * 1. Access Decision & RBAC Engine Evaluation Latency
 * 2. Dynamic Field-Level Redaction Throughput across all 5 roles
 * 3. End-to-End Query & Access Gating Retrieval Latency
 * 4. Tamper-Evident SHA-256 Cryptographic Hash-Chain Verification
 */

const assert = require('assert');
const { performance } = require('perf_hooks');
const { ROLES, RESOURCES, ACTIONS, checkPermission, filterFields } = require('../services/rbac');
const { evaluateAccess } = require('../services/accessDecision');
const { generateSyntheaDataset } = require('../db/syntheaDataset');
const { getAllPatients, getPatientById } = require('../db/patientRepository');
const { recordAccessEvent, verifyLogIntegrity, getAuditLogs } = require('../services/auditLogger');

function computeStats(samples) {
  if (samples.length === 0) return { min: 0, max: 0, avg: 0, median: 0, p95: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = sum / sorted.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  return { min, max, avg, median, p95 };
}

async function runScalabilityBenchmarks() {
  console.log('================================================================');
  console.log('  MEDGATE PERFORMANCE & SCALABILITY BENCHMARK SUITE (SHI-10)   ');
  console.log('================================================================\n');

  const benchmarkReport = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    scales: {
      scaleA: 50,
      scaleB: 500,
    },
    results: {},
  };

  // -------------------------------------------------------------
  // BENCHMARK 1: Access Decision Engine Latency (1,000 evaluations)
  // -------------------------------------------------------------
  console.log('1. Benchmarking Access Decision Engine (1,000 operations across 5 roles)...');
  const decisionLatencies = [];
  const testRoles = Object.values(ROLES);
  const testResources = Object.values(RESOURCES);
  const testActions = ['read', 'write', 'update', 'delete'];

  for (let i = 0; i < 1000; i++) {
    const role = testRoles[i % testRoles.length];
    const resource = testResources[i % testResources.length];
    const action = testActions[i % testActions.length];

    const t0 = performance.now();
    const decision = await evaluateAccess(
      { id: `user-${i}`, role },
      resource,
      action,
      { skipDb: true }
    );
    const t1 = performance.now();
    decisionLatencies.push(t1 - t0);

    assert(decision && typeof decision.allowed === 'boolean');
  }

  const decisionStats = computeStats(decisionLatencies);
  console.log(`   Engine Operations: 1,000`);
  console.log(`   Min:    ${decisionStats.min.toFixed(4)} ms`);
  console.log(`   Avg:    ${decisionStats.avg.toFixed(4)} ms`);
  console.log(`   Median: ${decisionStats.median.toFixed(4)} ms`);
  console.log(`   p95:    ${decisionStats.p95.toFixed(4)} ms`);
  console.log(`   Max:    ${decisionStats.max.toFixed(4)} ms`);

  // Measure live DB-persisted access decisions sample
  console.log('   Sampling live Neon PostgreSQL audit log persistence (10 operations)...');
  const dbPersistLatencies = [];
  for (let i = 0; i < 10; i++) {
    const role = testRoles[i % testRoles.length];
    const t0 = performance.now();
    await evaluateAccess({ id: `db-user-${i}`, role }, RESOURCES.PATIENTS, ACTIONS.READ);
    const t1 = performance.now();
    dbPersistLatencies.push(t1 - t0);
  }
  const dbPersistStats = computeStats(dbPersistLatencies);
  console.log(`   Live Neon DB Persist: Avg ${dbPersistStats.avg.toFixed(2)} ms | p95 ${dbPersistStats.p95.toFixed(2)} ms\n`);

  benchmarkReport.results.accessDecision = decisionStats;
  benchmarkReport.results.liveDbPersist = dbPersistStats;

  // -------------------------------------------------------------
  // BENCHMARK 2: Field-Level Redaction Across 2 Data Scales
  // -------------------------------------------------------------
  console.log('2. Benchmarking Dynamic Field-Level Redaction (Scale A: 50 vs Scale B: 500 records)...');
  const dataset50 = generateSyntheaDataset(50);
  const dataset500 = generateSyntheaDataset(500);

  const redactionResults = {};

  for (const [roleName, roleVal] of Object.entries(ROLES)) {
    // Measure Scale A (50 records)
    const t0_A = performance.now();
    const filteredA = filterFields(roleVal, RESOURCES.PATIENTS, dataset50);
    const t1_A = performance.now();
    const durationA = t1_A - t0_A;

    // Measure Scale B (500 records)
    const t0_B = performance.now();
    const filteredB = filterFields(roleVal, RESOURCES.PATIENTS, dataset500);
    const t1_B = performance.now();
    const durationB = t1_B - t0_B;

    assert.strictEqual(filteredA.length, 50);
    assert.strictEqual(filteredB.length, 500);

    // Verify security constraints on scale
    if (roleVal === ROLES.RECEPTIONIST) {
      assert.strictEqual(filteredB[0].confidentialNotes, undefined);
      assert.strictEqual(filteredB[0].diagnoses, undefined);
    } else if (roleVal === ROLES.RESEARCHER) {
      assert.strictEqual(filteredB[0].firstName, undefined);
      assert.strictEqual(filteredB[0].address, undefined);
    }

    redactionResults[roleName] = {
      scaleA_50_ms: durationA,
      scaleB_500_ms: durationB,
      ratio: durationB / (durationA || 0.001),
      throughputA_recordsPerSec: Math.round((50 / (durationA || 0.001)) * 1000),
      throughputB_recordsPerSec: Math.round((500 / (durationB || 0.001)) * 1000),
    };

    console.log(`   Role [${roleName}]:`);
    console.log(`     Scale A (50 records):   ${durationA.toFixed(3)} ms (${redactionResults[roleName].throughputA_recordsPerSec.toLocaleString()} rec/sec)`);
    console.log(`     Scale B (500 records):  ${durationB.toFixed(3)} ms (${redactionResults[roleName].throughputB_recordsPerSec.toLocaleString()} rec/sec)`);
  }
  console.log('');
  benchmarkReport.results.fieldRedaction = redactionResults;

  // -------------------------------------------------------------
  // BENCHMARK 3: End-to-End Query & Access Gating Retrieval
  // -------------------------------------------------------------
  console.log('3. Benchmarking Query & Access Gating Retrieval...');
  const queryLatencies = [];
  for (let i = 0; i < 20; i++) {
    const role = testRoles[i % testRoles.length];
    const t0 = performance.now();
    const res = await getAllPatients({ role, limit: 50 });
    const t1 = performance.now();
    queryLatencies.push(t1 - t0);
    assert(res.data.length > 0);
  }
  const queryStats = computeStats(queryLatencies);
  console.log(`   GetAllPatients (50 records batch): Avg ${queryStats.avg.toFixed(3)} ms | p95 ${queryStats.p95.toFixed(3)} ms`);

  // Single patient lookup with complete clinical graph
  const patientId = dataset50[0].id;
  const lookupLatencies = [];
  for (let i = 0; i < 20; i++) {
    const role = testRoles[i % testRoles.length];
    const t0 = performance.now();
    await getPatientById(patientId, { role });
    const t1 = performance.now();
    lookupLatencies.push(t1 - t0);
  }
  const lookupStats = computeStats(lookupLatencies);
  console.log(`   GetPatientById (deep clinical graph): Avg ${lookupStats.avg.toFixed(3)} ms | p95 ${lookupStats.p95.toFixed(3)} ms\n`);

  benchmarkReport.results.queryGating = {
    getAllPatients: queryStats,
    getPatientById: lookupStats,
  };

  // -------------------------------------------------------------
  // BENCHMARK 4: Tamper-Evident SHA-256 Cryptographic Hash Chain
  // -------------------------------------------------------------
  console.log('4. Benchmarking Cryptographic Hash Chain Integrity Verification...');
  const t0_chain = performance.now();
  const integrity = verifyLogIntegrity();
  const t1_chain = performance.now();
  const chainVerificationDuration = t1_chain - t0_chain;

  assert.strictEqual(integrity.valid, true);
  console.log(`   Verified ${integrity.checkedEntries} audit log entries.`);
  console.log(`   Cryptographic integrity: 100% VALID`);
  console.log(`   Verification latency: ${chainVerificationDuration.toFixed(4)} ms\n`);

  benchmarkReport.results.auditHashChain = {
    totalEntriesChecked: integrity.checkedEntries,
    tamperEvidentChainValid: integrity.valid,
    verificationDurationMs: chainVerificationDuration,
  };

  console.log('================================================================');
  console.log('  SCALABILITY & BENCHMARK SUITE: ALL TESTS PASSED (100% SUCCESS)');
  console.log('================================================================\n');

  return benchmarkReport;
}

if (require.main === module) {
  runScalabilityBenchmarks()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Benchmark failed:', err);
      process.exit(1);
    });
}

module.exports = { runScalabilityBenchmarks };
