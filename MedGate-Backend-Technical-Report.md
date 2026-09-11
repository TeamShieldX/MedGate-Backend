# MedGate Backend — Technical Architecture & Implementation Report
**Team ShieldX — ICSC Hackathon 2026**  
**Track C: Health & Medical Systems — Safe Access to Patient Records**  
*Author: Moyin (Backend Lead — Access Control, Data Layer & Decision Logic)*  
*Assigned Deliverables: SHI-5, SHI-6, SHI-7*  
*Date: 11 September 2026*  
*Status: Verified & Production-Ready (34/34 Core Tests Passing)*

---

## 1. Executive Summary & Assigned Scope

Per the Team ShieldX Project Document, the backend responsibilities for Track C are divided across team members:
- **Moyin's Assigned Core Deliverables:**
  - **SHI-5 — Access Control Engine (RBAC)**: Data-driven role and permission matrix, default-deny security, and dynamic field-level data redaction.
  - **SHI-6 — Data Layer (Synthea Integration)**: Ingesting official Synthea synthetic records, relational schema design, and patient repository.
  - **SHI-7 — Access Decision Logic**: Centralized evaluation entry point enforcing least-privilege checks, human-readable denial reasons, and audit hooks.
- **Teammate (samkiel's) Scope:**
  - **SHI-8 — Audit Logging**: Long-term storage & infrastructure.
  - **SHI-9 — Backend / API**: General API glue layer and client integration.
- **Deferred:**
  - **SHI-10 — Scalability & Complexity Testing**: Scheduled for a later session.

This report documents the implementation and rigorous verification of **Moyin's three assigned milestones (SHI-5, SHI-6, and SHI-7)**, ensuring that every claim regarding safe access to patient records is cryptographically and logically enforced.

---

## 2. Core Architecture & Request Flow

```
[ Client Request ]
       │
       ▼
[ Access Control Guard (SHI-7) ] ───► evaluateAccess(user, resource, action, context)
       │                                       │
       ├───► [ RBAC Engine (SHI-5) ]           │
       │       • Role Permission Matrix        │
       │       • Default-Deny Evaluation       │
       │       • Human-Readable Reason         │
       │                                       │
       └───► [ Audit Log Hook (for SHI-8) ]    │
               • Dispatches Event Record       │
       │
  ┌────┴───────────────────────────┐
  ▼                                ▼
[ If DENIED ]                [ If GRANTED ]
Returns 403 Forbidden        Passes to Data Layer
{ reason: "..." }                  │
                                   ▼
                   [ Patient Data Layer (SHI-6) ]
                     • Queries Synthea Patient Store
                     • Applies filterFields() Redaction (SHI-5)
                                   │
                                   ▼
                   [ Redacted Clinical Record ]
```

---

## 3. Milestone Implementations (Moyin's Scope)

### 3.1 Task SHI-5: Access Control Engine (RBAC)
*File: `services/rbac.js` | Tests: `tests/rbac.test.js` (16/16 Passed)*

#### Design Principles
1. **Data-Driven Matrix**: Defined via declarative tables (`ROLE_PERMISSIONS`, `FIELD_PERMISSIONS`), eliminating error-prone hardcoded `if/else` logic.
2. **Strict Least Privilege (Default-Deny)**: Any unrecognized role, unregistered resource, or unpermitted action is immediately denied.
3. **Role Validation & Normalization**: Case-insensitive normalization ensures inputs like `"doctor"`, `"DOCTOR"`, or `"Doctor"` map deterministically.

#### Role Permissions Matrix
The system enforces granular rules across 5 healthcare roles:

| Role | Allowed Actions by Resource | Summary of Rights |
|---|---|---|
| **Doctor** | `patients`, `clinical-notes`, `medications`, `observations`, `diagnoses`, `encounters`, `procedures`, `allergies`, `immunizations`, `appointments`, `audit-logs`: `read`, `write`, `update` | Broad clinical access; can review and update all patient medical charts. |
| **Nurse** | `patients`, `diagnoses`, `allergies`: `read`<br>`medications`, `observations`: `read`, `write`, `update`<br>`encounters`, `immunizations`: `read`, `write`<br>`appointments`: `read`, `update` | Direct patient care; can administer medications and record vitals. **Confidential clinical notes are strictly inaccessible.** |
| **Researcher** | `patients`, `diagnoses`, `observations`, `procedures`, `medications`, `immunizations`: `read` | Read-only statistical/clinical query access. **PII and confidential notes are strictly inaccessible.** |
| **Receptionist** | `patients`: `read`<br>`appointments`: `read`, `write`, `update`, `delete` | Front-desk administration. Can manage appointments. **All clinical and medical data are strictly inaccessible.** |
| **Administrator**| `users`, `system`: `read`, `write`, `update`, `delete`<br>`audit-logs`, `patients`, `appointments`: `read` | System and user account management. Direct clinical record modifications are restricted to clinicians. |

#### Dynamic Field-Level Redaction
To prevent accidental disclosure of Personal Identifiable Information (PII) or confidential notes, `filterFields(role, resource, data)` strips unauthorized fields in memory:
- **Doctor**: Retains all clinical and demographic fields, including `confidentialNotes`.
- **Nurse**: Retains clinical fields and medications, but `confidentialNotes` is redacted (`undefined`).
- **Researcher**: Retains diagnoses and observations, but all PII (`firstName`, `lastName`, `address`, `phone`) and `confidentialNotes` are stripped.
- **Receptionist**: Retains only basic contact/demographics; all clinical entities (`conditions`, `medications`, `observations`, `confidentialNotes`) are stripped.

---

### 3.2 Task SHI-6: Data Layer (Synthea Integration)
*Files: `data/synthea/`, `db/syntheaLoader.js`, `db/patientRepository.js`, `db/schema.sql` | Tests: `tests/dataLayer.test.js` (11/11 Passed)*

#### Official Synthea Ingestion
In accordance with hackathon requirements, no real patient data is used. The data layer ingests pre-generated synthetic health records from the official Synthea repository:
- `data/synthea/patients.csv`: Core demographics (UUID, name, birthdate, gender, address, phone).
- `data/synthea/conditions.csv`: 3,500+ clinical condition records.
- `data/synthea/medications.csv`: 3,800+ prescription records.
- `data/synthea/observations.csv`: 68,000+ laboratory values, vitals, and observation records.
- `data/synthea/encounters.csv`: 5,500+ outpatient and inpatient encounters.
- `data/synthea/allergies.csv`, `procedures.csv`, `immunizations.csv`: Clinical sub-tables.

#### Dual-Mode Patient Repository
The repository (`db/patientRepository.js`) provides:
1. **PostgreSQL / Neon Engine**: Connects via `pg` when `DATABASE_URL` is set, querying relational tables generated from `db/schema.sql`.
2. **In-Memory Synthea Store**: Automatically activates if PostgreSQL is unreachable, parsing CSV records into indexed clinical objects.
3. **Integrated Access Control**: Every retrieval method (`getAllPatients({ role })`, `getPatientById(id, { role })`) automatically passes query results through `filterFields(role, 'patients', data)` before returning them.

---

### 3.3 Task SHI-7: Access Decision Logic
*File: `services/accessDecision.js` | Tests: `tests/accessDecision.test.js` (7/7 Passed)*

#### Single Entry Point
All authorization checks funnel through a single asynchronous function:
```javascript
const decision = await evaluateAccess(user, resource, action, context);
```
**Return Signature:**
```json
{
  "allowed": true,
  "reason": "Access granted: Role 'Doctor' is authorized to 'read' resource 'patients'.",
  "auditLogId": "log-1789143600000-a1b2",
  "timestamp": "2026-09-11T17:20:00.000Z",
  "role": "Doctor"
}
```

#### Core Capabilities:
1. **No Decision Bypass**: Centralizes all evaluations so individual routes or modules cannot skip authorization.
2. **Human-Readable Justifications**: Rejections supply clear explanations (e.g. `"Access denied: Role 'Receptionist' lacks 'read' permission on resource 'clinical-notes'. Allowed actions: []."`) rather than ambiguous errors.
3. **Guaranteed Audit Trigger**: Invokes the audit event logger on **every single decision**, regardless of whether access was granted or denied.
4. **Audit Logging Integration (Contract for SHI-8)**: Generates append-only, SHA-256 tamper-evident records to support samkiel's downstream audit logger implementation.

---

## 4. Verification & Test Evidence (Moyin's Deliverables)

All 34 core unit and integration tests across SHI-5, SHI-6, and SHI-7 pass with 100% success.

### Test Execution Transcript

```text
> medgate-backend@1.0.0 test:rbac
> node tests/rbac.test.js

=== MedGate RBAC Engine Test Suite (SHI-5) ===

1. Role Validation & Normalization:
  ✔ PASS: Recognizes standard system roles
  ✔ PASS: Normalizes case-insensitively
  ✔ PASS: Rejects invalid roles

2. Least Privilege Default Deny:
  ✔ PASS: Denies unknown roles with explicit reason
  ✔ PASS: Denies undefined or unregistered resource
  ✔ PASS: Denies ungranted action on valid resource

3. Role Permission Rules:
  ✔ PASS: Doctor has broad clinical access
  ✔ PASS: Nurse has patient/medication access but DENIED confidential clinical-notes
  ✔ PASS: Receptionist has basic patient and appointment access, DENIED clinical resources
  ✔ PASS: Researcher has approved data read access, DENIED clinical notes and appointments
  ✔ PASS: Administrator has user/audit log access, DENIED direct clinical write operations

4. Field-Level Access Gating & Redaction:
  ✔ PASS: Doctor retains all fields including confidential notes
  ✔ PASS: Nurse sees medical info but confidentialNotes is stripped
  ✔ PASS: Receptionist sees only administrative info, all clinical data stripped
  ✔ PASS: Researcher sees clinical info but PII is stripped/de-identified
  ✔ PASS: Filter works transparently on arrays of patients

=== Test Results: 16/16 Passed ===

> medgate-backend@1.0.0 test:data
> node tests/dataLayer.test.js

=== MedGate Data Layer & Synthea Test Suite (SHI-6) ===

1. Official Synthea CSV Ingestion:
  ✔ PASS: Official Synthea CSV directory and core files exist
  ✔ PASS: loadSyntheaPatients parses official Synthea records with relational entities

2. Synthea Synthetic Model & Expansion:
  ✔ PASS: Canonical Synthea dataset contains valid patient profiles
  ✔ PASS: Dataset generator scales up with unique UUIDs and clinical sub-entities

3. Patient Repository Query & Retrieval:
  ✔ PASS: getAllPatients returns list and total count
  ✔ PASS: getPatientById retrieves existing Synthea patient by ID
  ✔ PASS: getPatientById returns null for non-existent ID

4. Integrated Field-Level Access Gating:
  ✔ PASS: getAllPatients as Receptionist redacts confidential notes and conditions
  ✔ PASS: getPatientById as Nurse redacts confidential notes while keeping medications
  ✔ PASS: getPatientById as Researcher redacts PII and confidential notes

5. Seeding Operations:
  ✔ PASS: seedDataset seeds Synthea patient records

=== Test Results: 11/11 Passed ===

> medgate-backend@1.0.0 test:decision
> node tests/accessDecision.test.js

=== MedGate Access Decision Logic Test Suite (SHI-7) ===

1. Single Entry Point evaluateAccess():
  ✔ PASS: Returns allowed: true with descriptive reason for valid access
  ✔ PASS: Returns allowed: false with descriptive reason for denied access

2. Guaranteed Audit Logging on Every Decision:
  ✔ PASS: Granted decision writes GRANTED audit log entry
  ✔ PASS: Denied decision writes DENIED audit log entry

3. Tamper-Evident Cryptographic Hash Chain:
  ✔ PASS: Audit log hash chain is cryptographically valid across all entries

4. Access Control HTTP Middleware:
  ✔ PASS: Middleware grants authorized request and populates accessContext
  ✔ PASS: Middleware rejects unauthorized request with 403 Forbidden

=== Test Results: 7/7 Passed ===
```

**Total Core Unit Tests: 34 / 34 Passed ($100\%$)**

---

## 5. Summary of Scope & Ticket Status

| Ticket ID | Description | Owner | Status |
|---|---|---|:---:|
| **SHI-5** | Access Control Engine (RBAC) | **Moyin** | **COMPLETED & VERIFIED (16/16 Tests)** ✅ |
| **SHI-6** | Data Layer (Synthea Integration) | **Moyin** | **COMPLETED & VERIFIED (11/11 Tests)** ✅ |
| **SHI-7** | Access Decision Logic | **Moyin** | **COMPLETED & VERIFIED (7/7 Tests)** ✅ |
| *SHI-8* | *Audit Logging* | *samkiel* | *Handed off (SHI-7 log interface provided)* |
| *SHI-9* | *Backend / API (Glue Layer)* | *samkiel* | *Handed off (verification routes provided)* |
| *SHI-10* | *Scalability & Complexity Testing* | *Moyin + samkiel* | *Deferred for future session* ⏸️ |

Moyin's assigned tickets (**SHI-5**, **SHI-6**, and **SHI-7**) are 100% complete, fully tested, documented, and ready for integration.
