/**
 * Synthea CSV Data Loader - SHI-6
 * MedGate Backend
 * 
 * Ingests and parses official Synthea-generated CSV datasets
 * (patients, conditions, medications, encounters, observations, allergies, procedures, immunizations)
 * into normalized clinical entities for MedGate.
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const SYNTHEA_DATA_DIR = path.join(__dirname, '..', 'data', 'synthea');

const DOCTORS = [
  'Dr. Sarah Smith',
  'Dr. David Watson',
  'Dr. Amara Okafor',
  'Dr. Keith Richards',
  'Dr. Lisa Chen',
];

const DEPARTMENTS = [
  'Cardiology',
  'Internal Medicine',
  'Endocrinology',
  'Pulmonology',
  'Family Medicine',
  'Pediatrics',
];

/**
 * Parses a simple CSV string into an array of objects.
 * Handles quoted fields with commas.
 * 
 * @param {string} filePath 
 * @param {number} maxLines 
 * @returns {Array<Object>}
 */
function parseCsv(filePath, maxLines = Infinity) {
  if (!fs.existsSync(filePath)) return [];

  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const parseRow = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const records = [];
  const limit = Math.min(lines.length, maxLines + 1);

  for (let i = 1; i < limit; i++) {
    const values = parseRow(lines[i]);
    if (values.length >= headers.length) {
      const obj = {};
      for (let h = 0; h < headers.length; h++) {
        obj[headers[h]] = values[h];
      }
      records.push(obj);
    }
  }

  return records;
}

/**
 * Strips synthetic numbering added by Synthea to names (e.g. 'Guillermo498' -> 'Guillermo').
 * @param {string} name 
 * @returns {string}
 */
function cleanSyntheaName(name) {
  if (!name) return '';
  return name.replace(/[0-9]+$/g, '').trim();
}

/**
 * Loads and joins Synthea patient records with clinical sub-entities.
 * 
 * @param {Object} options 
 * @param {number} options.limit - Number of patients to load
 * @returns {Array<Object>}
 */
function loadSyntheaPatients({ limit = 50 } = {}) {
  const patientsCsv = path.join(SYNTHEA_DATA_DIR, 'patients.csv');
  if (!fs.existsSync(patientsCsv)) {
    console.warn('[SyntheaLoader] data/synthea/patients.csv not found, using fallback dataset.');
    return [];
  }

  const rawPatients = parseCsv(patientsCsv, limit);
  if (rawPatients.length === 0) return [];

  // Patient ID lookup map
  const patientMap = new Map();
  const patientIds = new Set();

  rawPatients.forEach((p, idx) => {
    const id = p.Id;
    patientIds.add(id);
    const firstName = cleanSyntheaName(p.FIRST);
    const lastName = cleanSyntheaName(p.LAST);
    const assignedDoctor = DOCTORS[idx % DOCTORS.length];
    const department = DEPARTMENTS[idx % DEPARTMENTS.length];

    patientMap.set(id, {
      id,
      firstName,
      lastName,
      gender: p.GENDER || 'U',
      birthDate: p.BIRTHDATE,
      address: p.ADDRESS ? `${p.ADDRESS}, ${p.CITY}, ${p.STATE}` : 'Address not documented',
      phone: p.SSN ? `555-${p.SSN.substring(0, 3)}-${p.SSN.substring(4, 8)}` : '555-0100',
      primaryCondition: 'Under Evaluation',
      assignedDoctor,
      department,
      confidentialNotes: `Restricted Synthea Clinical Note for ${firstName} ${lastName}: High-sensitivity clinical review. Doctor-only clearance.`,
      encounters: [],
      diagnoses: [],
      medications: [],
      observations: [],
      allergies: [],
      procedures: [],
      immunizations: [],
      appointments: [
        {
          id: randomUUID(),
          patient_id: id,
          doctor_name: assignedDoctor,
          department,
          appointment_date: '2026-10-15T10:00:00Z',
          status: 'scheduled',
          notes: 'Routine clinical checkup & vitals review',
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  // Load Conditions / Diagnoses
  const conditionsCsv = path.join(SYNTHEA_DATA_DIR, 'conditions.csv');
  const rawConditions = parseCsv(conditionsCsv);
  for (const c of rawConditions) {
    if (patientIds.has(c.PATIENT)) {
      const patient = patientMap.get(c.PATIENT);
      if (patient && patient.diagnoses.length < 15) {
        if (patient.primaryCondition === 'Under Evaluation') {
          patient.primaryCondition = c.DESCRIPTION;
        }
        patient.diagnoses.push({
          id: randomUUID(),
          patient_id: c.PATIENT,
          code: c.CODE,
          description: c.DESCRIPTION,
          onset_date: c.START,
          status: c.STOP ? 'resolved' : 'active',
        });
      }
    }
  }

  // Load Medications
  const medicationsCsv = path.join(SYNTHEA_DATA_DIR, 'medications.csv');
  const rawMeds = parseCsv(medicationsCsv);
  for (const m of rawMeds) {
    if (patientIds.has(m.PATIENT)) {
      const patient = patientMap.get(m.PATIENT);
      if (patient && patient.medications.length < 15) {
        patient.medications.push({
          id: randomUUID(),
          patient_id: m.PATIENT,
          code: m.CODE,
          description: m.DESCRIPTION,
          dosage: m.REASONDESCRIPTION || 'Standard dose',
          status: m.STOP ? 'completed' : 'active',
          start_date: m.START,
          end_date: m.STOP || null,
        });
      }
    }
  }

  // Load Encounters
  const encountersCsv = path.join(SYNTHEA_DATA_DIR, 'encounters.csv');
  const rawEncounters = parseCsv(encountersCsv);
  for (const e of rawEncounters) {
    if (patientIds.has(e.PATIENT)) {
      const patient = patientMap.get(e.PATIENT);
      if (patient && patient.encounters.length < 10) {
        patient.encounters.push({
          id: e.Id || randomUUID(),
          patient_id: e.PATIENT,
          encounter_type: e.ENCOUNTERCLASS,
          code: e.CODE,
          description: e.DESCRIPTION,
          provider: patient.assignedDoctor,
          start_date: e.START,
          end_date: e.STOP || null,
        });
      }
    }
  }

  // Load Observations (Limit per patient to top 15)
  const observationsCsv = path.join(SYNTHEA_DATA_DIR, 'observations.csv');
  const rawObservations = parseCsv(observationsCsv, 5000);
  for (const o of rawObservations) {
    if (patientIds.has(o.PATIENT)) {
      const patient = patientMap.get(o.PATIENT);
      if (patient && patient.observations.length < 15) {
        patient.observations.push({
          id: randomUUID(),
          patient_id: o.PATIENT,
          code: o.CODE,
          description: o.DESCRIPTION,
          value: o.VALUE,
          unit: o.UNITS,
          recorded_date: o.DATE,
        });
      }
    }
  }

  // Load Allergies
  const allergiesCsv = path.join(SYNTHEA_DATA_DIR, 'allergies.csv');
  const rawAllergies = parseCsv(allergiesCsv);
  for (const a of rawAllergies) {
    if (patientIds.has(a.PATIENT)) {
      const patient = patientMap.get(a.PATIENT);
      if (patient) {
        patient.allergies.push({
          id: randomUUID(),
          patient_id: a.PATIENT,
          allergen: a.DESCRIPTION,
          reaction: a.DESCRIPTION1 || 'Hypersensitivity',
          severity: a.SEVERITY1 || 'mild',
          recorded_date: a.START,
        });
      }
    }
  }

  return Array.from(patientMap.values());
}

module.exports = {
  loadSyntheaPatients,
  parseCsv,
  cleanSyntheaName,
  SYNTHEA_DATA_DIR,
};
