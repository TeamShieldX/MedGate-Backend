/**
 * Patient Repository / Data Access Layer - SHI-6
 * MedGate Backend
 * 
 * Provides resilient access to Synthea synthetic patient records and clinical entities.
 * Integrates directly with official Synthea datasets, transparently querying
 * Neon PostgreSQL if available or serving from the loaded Synthea dataset.
 */

const { pool } = require('./index');
const { randomUUID } = require('crypto');
const { loadSyntheaPatients } = require('./syntheaLoader');
const { CANONICAL_SYNTHEA_PATIENTS, generateSyntheaDataset } = require('./syntheaDataset');
const { filterFields, RESOURCES } = require('../services/rbac');

// Load authentic Synthea patients from CSV, falling back to canonical Synthea data
let syntheaRecords = loadSyntheaPatients({ limit: 50 });
if (!syntheaRecords || syntheaRecords.length === 0) {
  syntheaRecords = [...CANONICAL_SYNTHEA_PATIENTS];
}

let inMemoryPatients = [...syntheaRecords];
let isDatabaseConnected = false;

/**
 * Checks if Postgres connection is alive.
 * @returns {Promise<boolean>}
 */
async function checkDbConnection() {
  if (!process.env.DATABASE_URL) {
    return false;
  }
  try {
    const client = await pool.connect();
    client.release();
    isDatabaseConnected = true;
    return true;
  } catch {
    isDatabaseConnected = false;
    return false;
  }
}

/**
 * Retrieves all patients, applying role-based field filtering.
 * 
 * @param {Object} options 
 * @param {string} options.role - Accessing user's role
 * @param {number} options.limit - Max records to return
 * @param {number} options.offset - Pagination offset
 * @returns {Promise<{ total: number, data: Array }>}
 */
async function getAllPatients({ role = 'Doctor', limit = 50, offset = 0 } = {}) {
  const dbAvailable = await checkDbConnection();

  if (dbAvailable) {
    try {
      const countRes = await pool.query('SELECT COUNT(*) as total FROM patients');
      const total = parseInt(countRes.rows[0].total, 10);

      const query = `
        SELECT id, first_name as "firstName", last_name as "lastName", gender,
               birth_date as "birthDate", address, phone, primary_condition as "primaryCondition",
               assigned_doctor as "assignedDoctor", confidential_notes as "confidentialNotes",
               created_at, updated_at
        FROM patients
        ORDER BY created_at ASC
        LIMIT $1 OFFSET $2
      `;
      const res = await pool.query(query, [limit, offset]);
      const filtered = filterFields(role, RESOURCES.PATIENTS, res.rows);
      return { total, data: filtered };
    } catch (err) {
      console.warn('[DataLayer] PostgreSQL query failed, falling back to Synthea in-memory dataset:', err.message);
    }
  }

  // Fallback: In-memory Synthea dataset
  const total = inMemoryPatients.length;
  const paginated = inMemoryPatients.slice(offset, offset + limit);
  const filtered = filterFields(role, RESOURCES.PATIENTS, paginated);
  return { total, data: filtered };
}

/**
 * Retrieves a single patient by ID with complete clinical entities,
 * applying role-based field filtering.
 * 
 * @param {string} id - Patient UUID
 * @param {Object} options
 * @param {string} options.role - Accessing user's role
 * @returns {Promise<Object|null>}
 */
async function getPatientById(id, { role = 'Doctor' } = {}) {
  const dbAvailable = await checkDbConnection();

  if (dbAvailable) {
    try {
      const patientQuery = `
        SELECT id, first_name as "firstName", last_name as "lastName", gender,
               birth_date as "birthDate", address, phone, primary_condition as "primaryCondition",
               assigned_doctor as "assignedDoctor", confidential_notes as "confidentialNotes",
               created_at, updated_at
        FROM patients
        WHERE id = $1
      `;
      const patientRes = await pool.query(patientQuery, [id]);
      if (patientRes.rows.length === 0) return null;

      const patient = patientRes.rows[0];

      // Fetch relational entities in parallel
      const [encounters, diagnoses, medications, observations, allergies, procedures, immunizations, appointments] = await Promise.all([
        pool.query('SELECT id, encounter_type as "encounterType", code, description, provider, start_date as "startDate", end_date as "endDate" FROM encounters WHERE patient_id = $1', [id]),
        pool.query('SELECT id, code, description, onset_date as "onsetDate", status FROM diagnoses WHERE patient_id = $1', [id]),
        pool.query('SELECT id, code, description, dosage, status, start_date as "startDate", end_date as "endDate" FROM medications WHERE patient_id = $1', [id]),
        pool.query('SELECT id, code, description, value, unit, recorded_date as "recordedDate" FROM observations WHERE patient_id = $1', [id]),
        pool.query('SELECT id, allergen, reaction, severity, recorded_date as "recordedDate" FROM allergies WHERE patient_id = $1', [id]),
        pool.query('SELECT id, code, description, performed_date as "performedDate" FROM procedures WHERE patient_id = $1', [id]),
        pool.query('SELECT id, vaccine_code as "vaccineCode", description, administered_date as "administeredDate" FROM immunizations WHERE patient_id = $1', [id]),
        pool.query('SELECT id, doctor_name as "doctorName", department, appointment_date as "appointmentDate", status, notes FROM appointments WHERE patient_id = $1', [id]),
      ]);

      const fullRecord = {
        ...patient,
        encounters: encounters.rows,
        diagnoses: diagnoses.rows,
        medications: medications.rows,
        observations: observations.rows,
        allergies: allergies.rows,
        procedures: procedures.rows,
        immunizations: immunizations.rows,
        appointments: appointments.rows,
      };

      return filterFields(role, RESOURCES.PATIENTS, fullRecord);
    } catch (err) {
      console.warn('[DataLayer] PostgreSQL lookup failed, falling back to Synthea in-memory:', err.message);
    }
  }

  // Fallback: In-memory Synthea dataset
  const found = inMemoryPatients.find((p) => p.id === id);
  if (!found) return null;

  return filterFields(role, RESOURCES.PATIENTS, found);
}

async function batchInsert(client, table, columns, rows) {
  if (!rows || rows.length === 0) return;
  const colNames = columns.join(', ');
  const BATCH_SIZE = 100;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const valuePlaceholders = [];
    const params = [];
    chunk.forEach((row, rowIdx) => {
      const placeholders = columns.map((_, colIdx) => `$${rowIdx * columns.length + colIdx + 1}`);
      valuePlaceholders.push(`(${placeholders.join(', ')})`);
      params.push(...row);
    });
    const sql = `INSERT INTO ${table} (${colNames}) VALUES ${valuePlaceholders.join(', ')} ON CONFLICT (id) DO NOTHING`;
    await client.query(sql, params);
  }
}

/**
 * Seeds the in-memory or database store with a specified number of Synthea patients.
 * Prioritizes authentic Synthea CSV data, expanding with generator if count exceeds available.
 * 
 * @param {number} count 
 * @returns {Promise<{ seededCount: number, source: string }>}
 */
async function seedDataset(count = 50) {
  console.log(`[DataLayer] seedDataset called with count: ${count}`);
  let dataset = loadSyntheaPatients({ limit: count });
  if (!dataset || dataset.length === 0) {
    dataset = generateSyntheaDataset(count);
  } else if (dataset.length < count) {
    const additional = generateSyntheaDataset(count - dataset.length);
    dataset = [...dataset, ...additional];
  }

  console.log(`[DataLayer] Dataset prepared: ${dataset.length} records`);
  inMemoryPatients = [...dataset];

  const dbAvailable = await checkDbConnection();
  if (dbAvailable) {
    console.log('[DataLayer] Connecting client to PostgreSQL...');
    const client = await pool.connect();
    console.log('[DataLayer] Client connected. Beginning batch transaction...');
    try {
      await client.query('BEGIN');

      // 1. Batch Patients
      const patientRows = dataset.map((p) => [
        p.id,
        p.firstName,
        p.lastName,
        p.gender,
        p.birthDate,
        p.address,
        p.phone,
        p.primaryCondition,
        p.assignedDoctor,
        p.confidentialNotes,
      ]);
      await batchInsert(
        client,
        'patients',
        ['id', 'first_name', 'last_name', 'gender', 'birth_date', 'address', 'phone', 'primary_condition', 'assigned_doctor', 'confidential_notes'],
        patientRows
      );

      // 2. Aggregate & Batch Sub-Entities
      const allEncounters = [];
      const allDiagnoses = [];
      const allMedications = [];
      const allObservations = [];
      const allAllergies = [];
      const allProcedures = [];
      const allImmunizations = [];
      const allAppointments = [];

      for (const p of dataset) {
        if (p.encounters) {
          for (const enc of p.encounters) {
            allEncounters.push([enc.id || randomUUID(), p.id, enc.encounter_type, enc.code, enc.description, enc.provider, enc.start_date || new Date().toISOString(), enc.end_date || null]);
          }
        }
        if (p.diagnoses) {
          for (const d of p.diagnoses) {
            allDiagnoses.push([d.id || randomUUID(), p.id, d.code, d.description, d.onset_date || null, d.status || 'active']);
          }
        }
        if (p.medications) {
          for (const m of p.medications) {
            allMedications.push([m.id || randomUUID(), p.id, m.code, m.description, m.dosage, m.status || 'active', m.start_date || null, m.end_date || null]);
          }
        }
        if (p.observations) {
          for (const o of p.observations) {
            allObservations.push([o.id || randomUUID(), p.id, o.code, o.description, o.value, o.unit, o.recorded_date || new Date().toISOString()]);
          }
        }
        if (p.allergies) {
          for (const a of p.allergies) {
            allAllergies.push([a.id || randomUUID(), p.id, a.allergen, a.reaction, a.severity, a.recorded_date || null]);
          }
        }
        if (p.procedures) {
          for (const pr of p.procedures) {
            allProcedures.push([pr.id || randomUUID(), p.id, pr.code, pr.description, pr.performed_date || null]);
          }
        }
        if (p.immunizations) {
          for (const im of p.immunizations) {
            allImmunizations.push([im.id || randomUUID(), p.id, im.vaccine_code, im.description, im.administered_date || null]);
          }
        }
        if (p.appointments) {
          for (const ap of p.appointments) {
            allAppointments.push([ap.id || randomUUID(), p.id, ap.doctor_name, ap.department, ap.appointment_date || new Date().toISOString(), ap.status || 'scheduled', ap.notes]);
          }
        }
      }

      await batchInsert(client, 'encounters', ['id', 'patient_id', 'encounter_type', 'code', 'description', 'provider', 'start_date', 'end_date'], allEncounters);
      await batchInsert(client, 'diagnoses', ['id', 'patient_id', 'code', 'description', 'onset_date', 'status'], allDiagnoses);
      await batchInsert(client, 'medications', ['id', 'patient_id', 'code', 'description', 'dosage', 'status', 'start_date', 'end_date'], allMedications);
      await batchInsert(client, 'observations', ['id', 'patient_id', 'code', 'description', 'value', 'unit', 'recorded_date'], allObservations);
      await batchInsert(client, 'allergies', ['id', 'patient_id', 'allergen', 'reaction', 'severity', 'recorded_date'], allAllergies);
      await batchInsert(client, 'procedures', ['id', 'patient_id', 'code', 'description', 'performed_date'], allProcedures);
      await batchInsert(client, 'immunizations', ['id', 'patient_id', 'vaccine_code', 'description', 'administered_date'], allImmunizations);
      await batchInsert(client, 'appointments', ['id', 'patient_id', 'doctor_name', 'department', 'appointment_date', 'status', 'notes'], allAppointments);

      await client.query('COMMIT');
      console.log(`[DataLayer] Batch insertion committed for ${dataset.length} patients and all clinical entities.`);
      return { seededCount: dataset.length, source: 'PostgreSQL Database (Neon)' };
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[DataLayer] Database seeding failed, kept in-memory store:', err.message);
    } finally {
      client.release();
    }
  }

  return { seededCount: dataset.length, source: 'In-Memory Synthea Store' };
}

/**
 * Resets the in-memory dataset to initial state.
 */
function resetInMemoryDataset() {
  inMemoryPatients = [...syntheaRecords];
}

module.exports = {
  getAllPatients,
  getPatientById,
  seedDataset,
  resetInMemoryDataset,
  checkDbConnection,
};
