/**
 * Synthea Synthetic Patient Dataset & Generator - SHI-6
 * MedGate Backend
 * 
 * Provides FHIR/Synthea-modeled synthetic patient data covering:
 * demographics, encounters, diagnoses, medications, observations,
 * allergies, procedures, immunizations, appointments, and confidential notes.
 */

const { randomUUID } = require('crypto');

const FIRST_NAMES_M = ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Marcus', 'Samuel', 'Daniel'];
const FIRST_NAMES_F = ['Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Chloe', 'Elena', 'Grace'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Connor', 'Vance', 'Bennett'];

const CONDITIONS = [
  { code: '38341003', description: 'Hypertension', category: 'Cardiovascular' },
  { code: '44054006', description: 'Type 2 Diabetes Mellitus', category: 'Endocrine' },
  { code: '195967001', description: 'Asthma', category: 'Pulmonary' },
  { code: '53741008', description: 'Coronary Artery Disease', category: 'Cardiovascular' },
  { code: '10509002', description: 'Acute Bronchitis', category: 'Pulmonary' },
  { code: '69896004', description: 'Rheumatoid Arthritis', category: 'Immunology' },
  { code: '230690007', description: 'Major Depressive Disorder', category: 'Psychiatric' },
];

const MEDICATIONS = [
  { code: '314076', description: 'Lisinopril 10 MG Oral Tablet', dosage: '1 tablet daily' },
  { code: '860975', description: 'Metformin hydrochloride 500 MG', dosage: '2 tablets daily' },
  { code: '745679', description: 'Albuterol 90 MCG Inhaler', dosage: '1-2 puffs as needed' },
  { code: '617314', description: 'Atorvastatin 20 MG Oral Tablet', dosage: '1 tablet nightly' },
  { code: '308189', description: 'Amoxicillin 500 MG Capsule', dosage: '1 capsule 3x daily' },
  { code: '312961', description: 'Sertraline 50 MG Oral Tablet', dosage: '1 tablet daily' },
];

const OBSERVATIONS = [
  { code: '8480-6', description: 'Systolic Blood Pressure', value: '128', unit: 'mmHg' },
  { code: '8462-4', description: 'Diastolic Blood Pressure', value: '82', unit: 'mmHg' },
  { code: '8867-4', description: 'Heart rate', value: '74', unit: 'beats/minute' },
  { code: '39156-5', description: 'Body Mass Index (BMI)', value: '26.4', unit: 'kg/m2' },
  { code: '4548-4', description: 'Hemoglobin A1c/Hemoglobin.total', value: '6.2', unit: '%' },
  { code: '8310-5', description: 'Body temperature', value: '37.0', unit: 'Cel' },
];

const ALLERGIES = [
  { allergen: 'Penicillin G', reaction: 'Hives, Urticaria', severity: 'moderate' },
  { allergen: 'Peanut Protein', reaction: 'Anaphylaxis', severity: 'severe' },
  { allergen: 'Latex', reaction: 'Contact Dermatitis', severity: 'mild' },
  { allergen: 'Aspirin', reaction: 'Angioedema', severity: 'moderate' },
];

const PROCEDURES = [
  { code: '268400002', description: 'Electrocardiogram (ECG / EKG)' },
  { code: '73761001', description: 'Colonoscopy screening' },
  { code: '399208008', description: 'Chest X-Ray 2 Views' },
  { code: '430193006', description: 'Medication reconciliation' },
];

const IMMUNIZATIONS = [
  { vaccine_code: '207', description: 'COVID-19, mRNA, LNP-S, PF, 100 mcg/0.5mL' },
  { vaccine_code: '140', description: 'Influenza, seasonal, injectable, preservative free' },
  { vaccine_code: '115', description: 'Tdap (Tetanus, diphtheria, pertussis)' },
];

const DOCTORS = ['Dr. Sarah Smith', 'Dr. David Watson', 'Dr. Amara Okafor', 'Dr. Keith Richards'];
const DEPARTMENTS = ['Cardiology', 'Internal Medicine', 'Endocrinology', 'Pulmonology', 'Family Medicine'];

/**
 * Generates a synthetic Synthea patient record with complete relational clinical data.
 * @param {Object} overrides 
 * @returns {Object}
 */
function createSyntheticPatient(overrides = {}) {
  const isFemale = overrides.gender ? overrides.gender === 'F' : Math.random() > 0.5;
  const gender = isFemale ? 'F' : 'M';
  const firstNames = isFemale ? FIRST_NAMES_F : FIRST_NAMES_M;
  const firstName = overrides.firstName || firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = overrides.lastName || LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  const id = overrides.id || randomUUID();

  const cond = overrides.condition || CONDITIONS[Math.floor(Math.random() * CONDITIONS.length)];
  const doc = overrides.assignedDoctor || DOCTORS[Math.floor(Math.random() * DOCTORS.length)];
  const dept = DEPARTMENTS[Math.floor(Math.random() * DEPARTMENTS.length)];

  const birthYear = 1950 + Math.floor(Math.random() * 50);
  const birthMonth = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
  const birthDay = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
  const birthDate = overrides.birthDate || `${birthYear}-${birthMonth}-${birthDay}`;

  const patient = {
    id,
    firstName,
    lastName,
    gender,
    birthDate,
    address: overrides.address || `${100 + Math.floor(Math.random() * 900)} Healthcare Blvd, Metropolis`,
    phone: overrides.phone || `555-01${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`,
    primaryCondition: cond.description,
    assignedDoctor: doc,
    department: dept,
    confidentialNotes: overrides.confidentialNotes || `Restricted clinical note for ${firstName} ${lastName}: Sensitive diagnostic evaluation and care instructions. Authorized personnel only.`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),

    // Relational Synthea entities
    encounters: [
      {
        id: randomUUID(),
        patient_id: id,
        encounter_type: 'Ambulatory',
        code: '185349003',
        description: `Encounter for checkup regarding ${cond.description}`,
        provider: doc,
        start_date: '2026-02-15T09:30:00Z',
        end_date: '2026-02-15T10:15:00Z',
      },
    ],
    diagnoses: [
      {
        id: randomUUID(),
        patient_id: id,
        code: cond.code,
        description: cond.description,
        onset_date: `${birthYear + 35}-06-12`,
        status: 'active',
      },
    ],
    medications: [
      {
        id: randomUUID(),
        patient_id: id,
        code: MEDICATIONS[0].code,
        description: MEDICATIONS[0].description,
        dosage: MEDICATIONS[0].dosage,
        status: 'active',
        start_date: '2026-01-10',
        end_date: null,
      },
    ],
    observations: [
      {
        id: randomUUID(),
        patient_id: id,
        code: OBSERVATIONS[0].code,
        description: OBSERVATIONS[0].description,
        value: OBSERVATIONS[0].value,
        unit: OBSERVATIONS[0].unit,
        recorded_date: '2026-02-15T09:45:00Z',
      },
      {
        id: randomUUID(),
        patient_id: id,
        code: OBSERVATIONS[1].code,
        description: OBSERVATIONS[1].description,
        value: OBSERVATIONS[1].value,
        unit: OBSERVATIONS[1].unit,
        recorded_date: '2026-02-15T09:45:00Z',
      },
    ],
    allergies: [
      {
        id: randomUUID(),
        patient_id: id,
        allergen: ALLERGIES[0].allergen,
        reaction: ALLERGIES[0].reaction,
        severity: ALLERGIES[0].severity,
        recorded_date: '2020-04-18',
      },
    ],
    procedures: [
      {
        id: randomUUID(),
        patient_id: id,
        code: PROCEDURES[0].code,
        description: PROCEDURES[0].description,
        performed_date: '2026-02-15',
      },
    ],
    immunizations: [
      {
        id: randomUUID(),
        patient_id: id,
        vaccine_code: IMMUNIZATIONS[0].vaccine_code,
        description: IMMUNIZATIONS[0].description,
        administered_date: '2025-11-20',
      },
    ],
    appointments: [
      {
        id: randomUUID(),
        patient_id: id,
        doctor_name: doc,
        department: dept,
        appointment_date: '2026-10-10T14:00:00Z',
        status: 'scheduled',
        notes: `Follow-up evaluation for ${cond.description}`,
      },
    ],
  };

  return patient;
}

/**
 * Pre-defined canonical Synthea patients for testing & demo consistency.
 */
const CANONICAL_SYNTHEA_PATIENTS = [
  createSyntheticPatient({
    id: 'a1b2c3d4-e5f6-4001-8001-000000000001',
    firstName: 'Sarah',
    lastName: 'Connor',
    gender: 'F',
    birthDate: '1985-05-14',
    condition: CONDITIONS[0], // Hypertension
    assignedDoctor: 'Dr. Sarah Smith',
    confidentialNotes: 'Restricted access: High security psychiatric evaluation. Patient reports severe insomnia and stress.',
  }),
  createSyntheticPatient({
    id: 'a1b2c3d4-e5f6-4001-8001-000000000002',
    firstName: 'John',
    lastName: 'Doe',
    gender: 'M',
    birthDate: '1990-11-22',
    condition: CONDITIONS[1], // Type 2 Diabetes
    assignedDoctor: 'Dr. David Watson',
    confidentialNotes: 'Confidential: Family history of early-onset cardiac arrest. Patient requests non-disclosure to relatives.',
  }),
  createSyntheticPatient({
    id: 'a1b2c3d4-e5f6-4001-8001-000000000003',
    firstName: 'Marcus',
    lastName: 'Vance',
    gender: 'M',
    birthDate: '1978-03-30',
    condition: CONDITIONS[3], // CAD
    assignedDoctor: 'Dr. Amara Okafor',
    confidentialNotes: 'Restricted: Enrolled in blind clinical cardiovascular drug trial. Strict research access protocols apply.',
  }),
  createSyntheticPatient({
    id: 'a1b2c3d4-e5f6-4001-8001-000000000004',
    firstName: 'Elena',
    lastName: 'Rostova',
    gender: 'F',
    birthDate: '1994-08-19',
    condition: CONDITIONS[2], // Asthma
    assignedDoctor: 'Dr. Keith Richards',
    confidentialNotes: 'Routine clinical note: Severe reaction to non-steroidal anti-inflammatory medications.',
  }),
  createSyntheticPatient({
    id: 'a1b2c3d4-e5f6-4001-8001-000000000005',
    firstName: 'Chloe',
    lastName: 'Bennett',
    gender: 'F',
    birthDate: '2001-01-12',
    condition: CONDITIONS[6], // Depression
    assignedDoctor: 'Dr. Sarah Smith',
    confidentialNotes: 'Highly Confidential: Bi-weekly psychotherapy progress reports. DO NOT release without explicit psychiatric consent.',
  }),
];

/**
 * Generates an arbitrary number of synthetic patients.
 * @param {number} count 
 * @returns {Array}
 */
function generateSyntheaDataset(count = 20) {
  const dataset = [...CANONICAL_SYNTHEA_PATIENTS];
  if (count <= CANONICAL_SYNTHEA_PATIENTS.length) {
    return dataset.slice(0, count);
  }

  const additionalCount = count - CANONICAL_SYNTHEA_PATIENTS.length;
  for (let i = 0; i < additionalCount; i++) {
    dataset.push(createSyntheticPatient());
  }

  return dataset;
}

module.exports = {
  createSyntheticPatient,
  generateSyntheaDataset,
  CANONICAL_SYNTHEA_PATIENTS,
  CONDITIONS,
  MEDICATIONS,
  OBSERVATIONS,
  ALLERGIES,
  PROCEDURES,
  IMMUNIZATIONS,
  DOCTORS,
  DEPARTMENTS,
};
