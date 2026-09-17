/**
 * Automated Unit Tests for Access Control Engine (RBAC) - SHI-5
 * MedGate Backend
 */

const assert = require('assert');
const {
  ROLES,
  RESOURCES,
  ACTIONS,
  isValidRole,
  normalizeRole,
  hasPermission,
  getAllowedFields,
  filterFields,
  getRolePermissions,
} = require('../services/rbac');

let passedTests = 0;
let totalTests = 0;

function runTest(description, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`  PASS: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(` FAIL: ${description}`);
    console.error(`        ${err.message}`);
  }
}

console.log('=== MedGate RBAC Engine Test Suite (SHI-5) ===\n');

// 1. Role Validation & Normalization Tests
console.log('1. Role Validation & Normalization:');

runTest('Recognizes standard system roles', () => {
  assert.strictEqual(isValidRole('Doctor'), true);
  assert.strictEqual(isValidRole('Nurse'), true);
  assert.strictEqual(isValidRole('Researcher'), true);
  assert.strictEqual(isValidRole('Receptionist'), true);
  assert.strictEqual(isValidRole('Administrator'), true);
});

runTest('Normalizes case-insensitively', () => {
  assert.strictEqual(normalizeRole('doctor'), ROLES.DOCTOR);
  assert.strictEqual(normalizeRole('NURSE'), ROLES.NURSE);
  assert.strictEqual(normalizeRole('  receptionist  '), ROLES.RECEPTIONIST);
});

runTest('Rejects invalid roles', () => {
  assert.strictEqual(isValidRole('Hacker'), false);
  assert.strictEqual(isValidRole('Guest'), false);
  assert.strictEqual(isValidRole(''), false);
  assert.strictEqual(isValidRole(null), false);
});

// 2. Least Privilege Default Deny Tests
console.log('\n2. Least Privilege Default Deny:');

runTest('Denies unknown roles with explicit reason', () => {
  const res = hasPermission('Patient', RESOURCES.PATIENTS, ACTIONS.READ);
  assert.strictEqual(res.allowed, false);
  assert.match(res.reason, /not a recognized system role/i);
});

runTest('Denies undefined or unregistered resource', () => {
  const res = hasPermission(ROLES.DOCTOR, 'financial_records', ACTIONS.READ);
  assert.strictEqual(res.allowed, false);
  assert.match(res.reason, /no permissions for resource/i);
});

runTest('Denies ungranted action on valid resource', () => {
  // Nurse cannot delete patients
  const res = hasPermission(ROLES.NURSE, RESOURCES.PATIENTS, ACTIONS.DELETE);
  assert.strictEqual(res.allowed, false);
  assert.match(res.reason, /lacks 'delete' permission/i);
});

// 3. Role-Specific Permission Tests
console.log('\n3. Role Permission Rules:');

runTest('Doctor has broad clinical access', () => {
  assert.strictEqual(hasPermission(ROLES.DOCTOR, RESOURCES.PATIENTS, ACTIONS.READ).allowed, true);
  assert.strictEqual(hasPermission(ROLES.DOCTOR, RESOURCES.CLINICAL_NOTES, ACTIONS.READ).allowed, true);
  assert.strictEqual(hasPermission(ROLES.DOCTOR, RESOURCES.CLINICAL_NOTES, ACTIONS.WRITE).allowed, true);
  assert.strictEqual(hasPermission(ROLES.DOCTOR, RESOURCES.MEDICATIONS, ACTIONS.WRITE).allowed, true);
  assert.strictEqual(hasPermission(ROLES.DOCTOR, RESOURCES.DIAGNOSES, ACTIONS.READ).allowed, true);
});

runTest('Nurse has patient/medication access but DENIED confidential clinical-notes', () => {
  assert.strictEqual(hasPermission(ROLES.NURSE, RESOURCES.PATIENTS, ACTIONS.READ).allowed, true);
  assert.strictEqual(hasPermission(ROLES.NURSE, RESOURCES.MEDICATIONS, ACTIONS.READ).allowed, true);
  assert.strictEqual(hasPermission(ROLES.NURSE, RESOURCES.OBSERVATIONS, ACTIONS.WRITE).allowed, true);
  // Denied clinical notes
  const notesRes = hasPermission(ROLES.NURSE, RESOURCES.CLINICAL_NOTES, ACTIONS.READ);
  assert.strictEqual(notesRes.allowed, false);
});

runTest('Receptionist has basic patient and appointment access, DENIED clinical resources', () => {
  assert.strictEqual(hasPermission(ROLES.RECEPTIONIST, RESOURCES.PATIENTS, ACTIONS.READ).allowed, true);
  assert.strictEqual(hasPermission(ROLES.RECEPTIONIST, RESOURCES.APPOINTMENTS, ACTIONS.WRITE).allowed, true);
  // Denied medications, diagnoses, notes
  assert.strictEqual(hasPermission(ROLES.RECEPTIONIST, RESOURCES.MEDICATIONS, ACTIONS.READ).allowed, false);
  assert.strictEqual(hasPermission(ROLES.RECEPTIONIST, RESOURCES.DIAGNOSES, ACTIONS.READ).allowed, false);
  assert.strictEqual(hasPermission(ROLES.RECEPTIONIST, RESOURCES.CLINICAL_NOTES, ACTIONS.READ).allowed, false);
});

runTest('Researcher has approved data read access, DENIED clinical notes and appointments', () => {
  assert.strictEqual(hasPermission(ROLES.RESEARCHER, RESOURCES.PATIENTS, ACTIONS.READ).allowed, true);
  assert.strictEqual(hasPermission(ROLES.RESEARCHER, RESOURCES.DIAGNOSES, ACTIONS.READ).allowed, true);
  assert.strictEqual(hasPermission(ROLES.RESEARCHER, RESOURCES.OBSERVATIONS, ACTIONS.READ).allowed, true);
  assert.strictEqual(hasPermission(ROLES.RESEARCHER, RESOURCES.CLINICAL_NOTES, ACTIONS.READ).allowed, false);
  assert.strictEqual(hasPermission(ROLES.RESEARCHER, RESOURCES.APPOINTMENTS, ACTIONS.READ).allowed, false);
  assert.strictEqual(hasPermission(ROLES.RESEARCHER, RESOURCES.PATIENTS, ACTIONS.WRITE).allowed, false);
});

runTest('Administrator has user/audit log access, DENIED direct clinical write operations', () => {
  assert.strictEqual(hasPermission(ROLES.ADMINISTRATOR, RESOURCES.USERS, ACTIONS.WRITE).allowed, true);
  assert.strictEqual(hasPermission(ROLES.ADMINISTRATOR, RESOURCES.AUDIT_LOGS, ACTIONS.READ).allowed, true);
  assert.strictEqual(hasPermission(ROLES.ADMINISTRATOR, RESOURCES.SYSTEM, ACTIONS.UPDATE).allowed, true);
  assert.strictEqual(hasPermission(ROLES.ADMINISTRATOR, RESOURCES.CLINICAL_NOTES, ACTIONS.WRITE).allowed, false);
});

// 4. Field-Level Access Gating & Redaction Tests
console.log('\n4. Field-Level Access Gating & Redaction:');

const samplePatient = {
  id: 'pat-001',
  firstName: 'Sarah',
  lastName: 'Connor',
  gender: 'F',
  birthDate: '1985-05-14',
  address: '123 Tech Lane',
  phone: '555-0199',
  primaryCondition: 'Hypertension',
  assignedDoctor: 'Dr. Smith',
  confidentialNotes: 'High-security restricted psychiatric evaluation',
  medications: ['Lisinopril 10mg'],
  diagnoses: ['Essential hypertension'],
};

runTest('Doctor retains all fields including confidential notes', () => {
  const filtered = filterFields(ROLES.DOCTOR, RESOURCES.PATIENTS, samplePatient);
  assert.strictEqual(filtered.confidentialNotes, samplePatient.confidentialNotes);
  assert.strictEqual(filtered.primaryCondition, 'Hypertension');
  assert.strictEqual(filtered.firstName, 'Sarah');
});

runTest('Nurse sees medical info but confidentialNotes is stripped', () => {
  const filtered = filterFields(ROLES.NURSE, RESOURCES.PATIENTS, samplePatient);
  assert.strictEqual(filtered.confidentialNotes, undefined);
  assert.strictEqual(filtered.primaryCondition, 'Hypertension');
  assert.deepStrictEqual(filtered.medications, ['Lisinopril 10mg']);
  assert.strictEqual(filtered.firstName, 'Sarah');
});

runTest('Receptionist sees only administrative info, all clinical data stripped', () => {
  const filtered = filterFields(ROLES.RECEPTIONIST, RESOURCES.PATIENTS, samplePatient);
  assert.strictEqual(filtered.firstName, 'Sarah');
  assert.strictEqual(filtered.lastName, 'Connor');
  assert.strictEqual(filtered.assignedDoctor, 'Dr. Smith');
  assert.strictEqual(filtered.confidentialNotes, undefined);
  assert.strictEqual(filtered.primaryCondition, undefined);
  assert.strictEqual(filtered.medications, undefined);
  assert.strictEqual(filtered.diagnoses, undefined);
});

runTest('Researcher sees clinical info but PII is stripped/de-identified', () => {
  const filtered = filterFields(ROLES.RESEARCHER, RESOURCES.PATIENTS, samplePatient);
  assert.strictEqual(filtered.id, 'pat-001');
  assert.strictEqual(filtered.gender, 'F');
  assert.strictEqual(filtered.birthDate, '1985-05-14');
  assert.strictEqual(filtered.primaryCondition, 'Hypertension');
  assert.deepStrictEqual(filtered.diagnoses, ['Essential hypertension']);
  // PII stripped
  assert.strictEqual(filtered.firstName, undefined);
  assert.strictEqual(filtered.lastName, undefined);
  assert.strictEqual(filtered.address, undefined);
  assert.strictEqual(filtered.phone, undefined);
  assert.strictEqual(filtered.confidentialNotes, undefined);
});

runTest('Filter works transparently on arrays of patients', () => {
  const list = [samplePatient, { ...samplePatient, id: 'pat-002', firstName: 'John' }];
  const filteredList = filterFields(ROLES.RECEPTIONIST, RESOURCES.PATIENTS, list);
  assert.strictEqual(filteredList.length, 2);
  assert.strictEqual(filteredList[0].confidentialNotes, undefined);
  assert.strictEqual(filteredList[1].firstName, 'John');
  assert.strictEqual(filteredList[1].primaryCondition, undefined);
});

// Summary
console.log(`\n=== Test Results: ${passedTests}/${totalTests} Passed ===`);
if (passedTests !== totalTests) {
  process.exit(1);
}
