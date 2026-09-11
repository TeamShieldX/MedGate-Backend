-- MedGate Database Schema (PostgreSQL / Neon) - SHI-6
-- Fine-grained schema for Role-Based Access Control and Synthea synthetic data integration

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users & Roles
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS immunizations CASCADE;
DROP TABLE IF EXISTS procedures CASCADE;
DROP TABLE IF EXISTS allergies CASCADE;
DROP TABLE IF EXISTS observations CASCADE;
DROP TABLE IF EXISTS medications CASCADE;
DROP TABLE IF EXISTS diagnoses CASCADE;
DROP TABLE IF EXISTS encounters CASCADE;
DROP TABLE IF EXISTS patients CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(30) NOT NULL,
    department VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Patients (Core Demographics & Summary)
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    gender VARCHAR(10) NOT NULL,
    birth_date DATE NOT NULL,
    address VARCHAR(255),
    phone VARCHAR(30),
    primary_condition VARCHAR(100),
    assigned_doctor VARCHAR(100),
    confidential_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Clinical Encounters
CREATE TABLE encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_type VARCHAR(50) NOT NULL,
    code VARCHAR(50),
    description TEXT NOT NULL,
    provider VARCHAR(100),
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP
);

-- 4. Diagnoses / Conditions
CREATE TABLE diagnoses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    code VARCHAR(50),
    description TEXT NOT NULL,
    onset_date DATE,
    status VARCHAR(30) DEFAULT 'active'
);

-- 5. Medications
CREATE TABLE medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    code VARCHAR(50),
    description TEXT NOT NULL,
    dosage VARCHAR(50),
    status VARCHAR(30) DEFAULT 'active',
    start_date DATE,
    end_date DATE
);

-- 6. Observations (Vitals, Lab Results)
CREATE TABLE observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    code VARCHAR(50),
    description TEXT NOT NULL,
    value VARCHAR(50) NOT NULL,
    unit VARCHAR(30),
    recorded_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Allergies
CREATE TABLE allergies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    allergen VARCHAR(100) NOT NULL,
    reaction VARCHAR(100),
    severity VARCHAR(30),
    recorded_date DATE
);

-- 8. Procedures
CREATE TABLE procedures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    code VARCHAR(50),
    description TEXT NOT NULL,
    performed_date DATE
);

-- 9. Immunizations
CREATE TABLE immunizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    vaccine_code VARCHAR(50),
    description TEXT NOT NULL,
    administered_date DATE
);

-- 10. Appointments
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_name VARCHAR(100) NOT NULL,
    department VARCHAR(50),
    appointment_date TIMESTAMP NOT NULL,
    status VARCHAR(30) DEFAULT 'scheduled',
    notes TEXT
);

-- 11. Audit Logs
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50),
    username VARCHAR(50),
    role VARCHAR(30) NOT NULL,
    action VARCHAR(30) NOT NULL,
    resource VARCHAR(50) NOT NULL,
    resource_id VARCHAR(100),
    result VARCHAR(20) NOT NULL,
    reason TEXT,
    ip_address VARCHAR(45),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance & scalable access lookups
CREATE INDEX idx_patients_assigned_doc ON patients(assigned_doctor);
CREATE INDEX idx_encounters_patient_id ON encounters(patient_id);
CREATE INDEX idx_diagnoses_patient_id ON diagnoses(patient_id);
CREATE INDEX idx_medications_patient_id ON medications(patient_id);
CREATE INDEX idx_observations_patient_id ON observations(patient_id);
CREATE INDEX idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_role ON audit_logs(role);
