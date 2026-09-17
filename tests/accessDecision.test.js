/**
 * Automated Unit & Integration Tests for Access Decision Logic - SHI-7
 * MedGate Backend
 */

const assert = require('assert');
const { evaluateAccess } = require('../services/accessDecision');
const {
  getAuditLogs,
  verifyLogIntegrity,
  resetAuditLogStore,
} = require('../services/auditLogger');
const accessControl = require('../middleware/accessControl');
const { ROLES, RESOURCES, ACTIONS } = require('../services/rbac');

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
  console.log('=== MedGate Access Decision Logic Test Suite (SHI-7) ===\n');

  await resetAuditLogStore();

  // 1. Single Entry Point Evaluation Tests
  console.log('1. Single Entry Point evaluateAccess():');

  await runTestAsync('Returns allowed: true with descriptive reason for valid access', async () => {
    const user = { id: 'usr-101', username: 'dr_smith', role: ROLES.DOCTOR };
    const decision = await evaluateAccess(user, RESOURCES.PATIENTS, ACTIONS.READ);

    assert.strictEqual(decision.allowed, true);
    assert.match(decision.reason, /access granted/i);
    assert.strictEqual(typeof decision.auditLogId, 'string');
    assert.strictEqual(typeof decision.timestamp, 'string');
    assert.strictEqual(decision.role, ROLES.DOCTOR);
  });

  await runTestAsync('Returns allowed: false with descriptive reason for denied access', async () => {
    const user = { id: 'usr-102', username: 'reception_amy', role: ROLES.RECEPTIONIST };
    const decision = await evaluateAccess(user, RESOURCES.CLINICAL_NOTES, ACTIONS.READ);

    assert.strictEqual(decision.allowed, false);
    assert.match(decision.reason, /access denied/i);
    assert.match(decision.reason, /no permissions for resource/i);
  });

  // 2. Guaranteed Audit Log Writing
  console.log('\n2. Guaranteed Audit Logging on Every Decision:');

  await runTestAsync('Granted decision writes GRANTED audit log entry', async () => {
    const user = { id: 'usr-103', username: 'admin_carol', role: ROLES.ADMINISTRATOR };
    const decision = await evaluateAccess(user, RESOURCES.AUDIT_LOGS, ACTIONS.READ);

    const logs = await getAuditLogs({ limit: 1 });
    assert.strictEqual(logs.data.length, 1);
    assert.strictEqual(logs.data[0].id, decision.auditLogId);
    assert.strictEqual(logs.data[0].result, 'GRANTED');
    assert.strictEqual(logs.data[0].username, 'admin_carol');
    assert.strictEqual(logs.data[0].resource, 'audit-logs');
  });

  await runTestAsync('Denied decision writes DENIED audit log entry', async () => {
    const user = { id: 'usr-104', username: 'guest_user', role: 'Anonymous' };
    const decision = await evaluateAccess(user, RESOURCES.PATIENTS, ACTIONS.DELETE);

    const logs = await getAuditLogs({ limit: 1 });
    assert.strictEqual(logs.data[0].id, decision.auditLogId);
    assert.strictEqual(logs.data[0].result, 'DENIED');
    assert.strictEqual(logs.data[0].role, 'Anonymous');
  });

  // 3. Cryptographic Tamper-Evident Hash Chain Verification
  console.log('\n3. Tamper-Evident Cryptographic Hash Chain:');

  await runTestAsync('Audit log hash chain is cryptographically valid across all entries', async () => {
    const integrity = verifyLogIntegrity();
    assert.strictEqual(integrity.valid, true);
    assert.strictEqual(integrity.checkedEntries >= 4, true);
  });

  // 4. Access Control HTTP Middleware Tests
  console.log('\n4. Access Control HTTP Middleware:');

  await runTestAsync('Middleware grants authorized request and populates accessContext', async () => {
    const req = {
      method: 'GET',
      baseUrl: '/patients',
      headers: { 'x-user-role': 'Doctor', 'x-user-id': 'doc-1' },
    };
    let jsonCalled = false;
    const res = {
      status: () => ({ json: () => { jsonCalled = true; } }),
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await accessControl(req, res, next);

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(jsonCalled, false);
    assert.strictEqual(req.accessContext.decision.allowed, true);
    assert.strictEqual(req.accessContext.user.role, 'Doctor');
  });

  await runTestAsync('Middleware rejects unauthorized request with 403 Forbidden', async () => {
    const req = {
      method: 'GET',
      baseUrl: '/audit-logs',
      headers: { 'x-user-role': 'Receptionist' },
    };
    let statusCode = 0;
    let responseBody = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (body) => { responseBody = body; },
        };
      },
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await accessControl('audit-logs', 'read')(req, res, next);

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusCode, 403);
    assert.strictEqual(responseBody.success, false);
    assert.strictEqual(responseBody.error, 'Forbidden');
    assert.match(responseBody.reason, /access denied/i);
  });

  // Summary
  console.log(`\n=== Test Results: ${passedTests}/${totalTests} Passed ===`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
})();
