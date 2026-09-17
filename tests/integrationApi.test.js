/**
 * Integration API Test Suite - MedGate Backend
 * 
 * Verifies end-to-end HTTP API behavior:
 * - /health endpoint
 * - /auth/login role-based authentication
 * - /patients role-filtered access and field redaction
 * - /audit-log role gating (Admin vs Receptionist)
 * - Cryptographic hash chain validation across all recorded events
 */

const http = require('http');
const assert = require('assert');
const app = require('../server');
const { verifyLogIntegrity, getAuditLogs } = require('../services/auditLogger');

function httpRequest(server, options, postData = null) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const port = address.port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port,
      path: options.path,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    if (postData) {
      reqOptions.headers['Content-Type'] = 'application/json';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, rawBody: body });
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runIntegrationTests() {
  console.log('\n=== MedGate End-to-End Live HTTP API Integration Test Suite ===\n');
  let passed = 0;
  let total = 0;

  const test = async (name, fn) => {
    total++;
    try {
      await fn();
      console.log(`  PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  FAIL: ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  };

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    // 1. Health Endpoint
    await test('GET /health returns 200 and running status', async () => {
      const res = await httpRequest(server, { path: '/health' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.message, 'MedGate Backend API is running');
    });

    // 2. Auth Login - Valid Doctor
    let doctorToken = null;
    await test('POST /auth/login with Doctor role succeeds', async () => {
      const res = await httpRequest(
        server,
        { path: '/auth/login', method: 'POST' },
        JSON.stringify({ role: 'Doctor', username: 'dr_moyin' })
      );
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.user.role, 'Doctor');
      doctorToken = res.body.data.token;
    });

    // 3. Auth Login - Invalid Role
    await test('POST /auth/login with invalid role fails with 400', async () => {
      const res = await httpRequest(
        server,
        { path: '/auth/login', method: 'POST' },
        JSON.stringify({ role: 'Hacker', username: 'bad_actor' })
      );
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.error.includes('Invalid role'));
    });

    // 4. Patients List as Doctor - Full Access
    let testPatientId = null;
    await test('GET /patients as Doctor includes clinical notes and sensitive fields', async () => {
      const res = await httpRequest(server, {
        path: '/patients?limit=5',
        headers: { 'x-user-role': 'Doctor', 'x-user-id': 'doc-101' },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.accessRole, 'Doctor');
      assert.ok(res.body.data.length > 0);
      testPatientId = res.body.data[0].id;
      // Doctor sees firstName, lastName, confidentialNotes
      assert.ok(res.body.data[0].firstName);
      assert.ok(res.body.data[0].lastName);
      assert.ok('confidentialNotes' in res.body.data[0]);
    });

    // 5. Patients List as Receptionist - Redacted Clinical Info
    await test('GET /patients as Receptionist redacts confidential notes and diagnoses', async () => {
      const res = await httpRequest(server, {
        path: '/patients?limit=5',
        headers: { 'x-user-role': 'Receptionist', 'x-user-id': 'rec-202' },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.accessRole, 'Receptionist');
      const patient = res.body.data[0];
      // Demographics preserved
      assert.ok(patient.firstName);
      assert.ok(patient.lastName);
      // Clinical fields stripped
      assert.strictEqual(patient.confidentialNotes, undefined);
      assert.strictEqual(patient.diagnoses, undefined);
      assert.strictEqual(patient.medications, undefined);
    });

    // 6. Patients List as Researcher - Redacted PII
    await test('GET /patients as Researcher redacts names, phone and address', async () => {
      const res = await httpRequest(server, {
        path: '/patients?limit=5',
        headers: { 'x-user-role': 'Researcher', 'x-user-id': 'res-303' },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.accessRole, 'Researcher');
      const patient = res.body.data[0];
      // PII stripped
      assert.strictEqual(patient.firstName, undefined);
      assert.strictEqual(patient.lastName, undefined);
      assert.strictEqual(patient.phone, undefined);
      assert.strictEqual(patient.address, undefined);
      // Clinical / research fields available
      assert.ok(patient.primaryCondition !== undefined || patient.gender !== undefined);
    });

    // 7. Patient Detail as Nurse - Medical records preserved, confidential notes redacted
    await test('GET /patients/:id as Nurse retains medications but redacts confidential notes', async () => {
      assert.ok(testPatientId, 'Valid patient ID required');
      const res = await httpRequest(server, {
        path: `/patients/${testPatientId}`,
        headers: { 'x-user-role': 'Nurse', 'x-user-id': 'nurse-404' },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      const patient = res.body.data;
      assert.ok(patient.firstName);
      assert.strictEqual(patient.confidentialNotes, undefined);
      assert.ok(Array.isArray(patient.medications));
    });

    // 8. Audit Log Access as Receptionist - Denied 403
    await test('GET /audit-log as Receptionist is DENIED with 403 Forbidden', async () => {
      const res = await httpRequest(server, {
        path: '/audit-log',
        headers: { 'x-user-role': 'Receptionist', 'x-user-id': 'rec-202' },
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error, 'Forbidden');
      assert.ok(res.body.reason.includes('Receptionist'));
      assert.ok(res.body.auditLogId);
    });

    // 9. Audit Log Access as Administrator - Granted 200 with tamper-evident chain verification
    await test('GET /audit-log as Administrator succeeds with valid hash chain', async () => {
      const res = await httpRequest(server, {
        path: '/audit-log',
        headers: { 'x-user-role': 'Administrator', 'x-user-id': 'admin-001' },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.integrity.tamperEvidentChainValid, true);
      assert.ok(res.body.count > 0);
      assert.ok(res.body.data.length > 0);
    });

    // 10. Audit Log Integrity across entire runtime
    await test('Cryptographic SHA-256 hash chain remains 100% valid after all API calls', async () => {
      const integrity = verifyLogIntegrity();
      assert.strictEqual(integrity.valid, true);
      assert.ok(integrity.checkedEntries > 5);
    });

  } finally {
    server.close();
  }

  console.log(`\n=== Integration Test Results: ${passed}/${total} Passed ===\n`);
  if (passed !== total) {
    process.exit(1);
  }
}

if (require.main === module) {
  runIntegrationTests().catch((err) => {
    console.error('Fatal Integration Test Error:', err);
    process.exit(1);
  });
}

module.exports = runIntegrationTests;
