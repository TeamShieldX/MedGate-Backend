# PRD — MedGate Backend

## 1. Purpose

The backend is where the actual access-control logic lives: RBAC, access decisions, audit logging, and the data layer that serves synthetic patient records. Every claim the demo and write-up make about "safe access to patient records" has to be true here first — the frontend only reflects what this layer decides.

Corresponds to Linear issues:
- **SHI-5** — Access Control Engine (RBAC)
- **SHI-6** — Data Layer (Synthea integration)
- **SHI-7** — Access Decision Logic
- **SHI-8** — Audit Logging
- **SHI-9** — Backend / API

---

## 2. Stack

- **Language:** JavaScript
- **Framework:** Express (assumed default — not formally locked, flag if the team wants otherwise)
- **Database:** Neon (serverless Postgres)
- **DB client:** `pg` (node-postgres)
- **Data source:** Synthea (synthetic patient records)

---

## 3. Roles in Scope

- Doctor — broad clinical access
- Nurse — patient, medication, observation data
- Researcher — approved research data only
- Receptionist — basic patient/appointment info
- Administrator — system + permission management

---

## 4. Core Responsibilities

### 4.1 Data Layer (SHI-6)
- Load Synthea-generated synthetic patient data (demographics, diagnoses, encounters, medications, allergies, observations, procedures, immunizations)
- Design and seed a Postgres schema in Neon
- Schema needs to support field/table-level access gating, not just whole-record gating

### 4.2 Access Control Engine (SHI-5)
- Role → permission → resource mapping, data-driven (not hardcoded per-role if/else)
- Least privilege by default — deny unless explicitly permitted
- Exposes a permission-check function usable by the Access Decision Logic layer

### 4.3 Access Decision Logic (SHI-7)
- Single entry point: given (user, resource, action) → `{ allowed, reason }`
- Calls into the RBAC engine for the actual permission check
- Every call — granted or denied — triggers an audit log write
- Denials return a human-readable reason, not just a boolean

### 4.4 Audit Logging (SHI-8)
- `audit_log` table: who, what resource, what action, when, result, reason
- Written to on every access decision, no exceptions
- Append-only — no update/delete path in normal app flow
- Decide early: simple log table for v1, or tamper-evident (hash-chained) for a stronger write-up story

### 4.5 API Layer (SHI-9)
- `POST /auth/login` — simplified role-based login (no need for production-grade auth)
- `GET /patients` — role-filtered patient list
- `GET /patients/:id` — role-filtered patient detail (routes through Access Decision Logic)
- `GET /audit-log` — access history, for admin/demo view
- Every data-returning endpoint must route through Access Decision Logic before responding — no bypasses

---

## 5. Folder Structure (target)

```
MedGate-Backend/
├── routes/         → auth, patients, auditLog
├── controllers/     → request handlers per route
├── services/        → RBAC engine, access decision logic
├── middleware/      → access-control check, error handling, CORS
├── db/               → schema, seed scripts (Synthea data)
├── index.js / server.js
```

---

## 6. Acceptance Criteria

- No endpoint returns patient data without passing through Access Decision Logic first
- Every access attempt (granted or denied) produces an audit log entry
- Denials return a clear 403 + human-readable reason, not a raw crash
- Schema and permission model are documented well enough that the frontend team knows what each role can see
- System has been tested at 2+ data scales (per SHI-10) with real access-check/query timing recorded

---

## 7. Dependencies & Sequencing

1. Data Layer (SHI-6) needs to land first — everything else queries against it
2. RBAC Engine (SHI-5) can be built in parallel once the schema shape is roughly known
3. Access Decision Logic (SHI-7) depends on both of the above
4. Audit Logging (SHI-8) plugs into Access Decision Logic
5. API Layer (SHI-9) wraps everything and is what the frontend actually calls

Frontend can build against mocked API responses in the meantime — no need to block on this sequencing.

---

## 8. Out of Scope (for this build)

- Production-grade authentication (OAuth, hashed passwords, sessions/JWT refresh flows)
- Real patient data of any kind — synthetic only, per NITDA's rules
- Horizontal scaling / production deployment concerns — this is a prototype, not a shipped product

---

*Last updated: 2 September 2026*
