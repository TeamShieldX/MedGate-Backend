/**
 * Patient Repository / Data Access Layer - SHI-6
 * MedGate Backend
 * 
 * Provides resilient access to Synthea synthetic patient records and clinical entities.
 * Integrates directly with official Synthea datasets, transparently querying
 * Neon PostgreSQL if available or serving from the loaded Synthea dataset.
 */

const { pool } = require('./index');
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

/**
 * Seeds the in-memory or database store with a specified number of Synthea patients.
 * Prioritizes authentic Synthea CSV data, expanding with generator if count exceeds available.
 * 
 * @param {number} count 
 * @returns {Promise<{ seededCount: number, source: string }>}
 */
async function seedDataset(count = 50) {
  let dataset = loadSyntheaPatients({ limit: count });
  if (!dataset || dataset.length === 0) {
    dataset = generateSyntheaDataset(count);
  } else if (dataset.length < count) {
    const additional = generateSyntheaDataset(count - dataset.length);
    dataset = [...dataset, ...additional];
  }

  inMemoryPatients = [...dataset];

  const dbAvailable = await checkDbConnection();
  if (dbAvailable) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const p of dataset) {
        await client.query(
          `INSERT INTO patients (id, first_name, last_name, gender, birth_date, address, phone, primary_condition, assigned_doctor, confidential_notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
          [p.id, p.firstName, p.lastName, p.gender, p.birthDate, p.address, p.phone, p.primaryCondition, p.assignedDoctor, p.confidentialNotes]
        );

        if (p.encounters) {
          for (const enc of p.encounters) {
            await client.query(
              `INSERT INTO encounters (id, patient_id, encounter_type, code, description, provider, start_date, end_date)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
              [enc.id, p.id, enc.encounter_type, enc.code, enc.description, enc.provider, enc.start_date, enc.end_date]
            );
          }
        }

        if (p.diagnoses) {
          for (const d of p.diagnoses) {
            await client.query(
              `INSERT INTO diagnoses (id, patient_id, code, description, onset_date, status)
               VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
              [d.id, p.id, d.code, d.description, d.onset_date, d.status]
            );
          }
        }

        if (p.medications) {
          for (const m of p.medications) {
            await client.query(
              `INSERT INTO medications (id, patient_id, code, description, dosage, status, start_date, end_date)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
              [m.id, p.id, m.code, m.description, m.dosage, m.status, m.start_date, m.end_date]
            );
          }
        }

        if (p.observations) {
          for (const o of p.observations) {
            await client.query(
              `INSERT INTO observations (id, patient_id, code, description, value, unit, recorded_date)
               VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
              [o.id, p.id, o.code, o.description, o.value, o.unit, o.recorded_date]
            );
          }
        }
      }
      await client.query('COMMIT');
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
