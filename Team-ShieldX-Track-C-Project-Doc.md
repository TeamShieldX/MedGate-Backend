# Team ShieldX — ICSC Hackathon 2026
## Track C: Health & Medical Systems — Safe Access to Patient Records

---

## 1. Overview

The challenge: healthcare records contain highly sensitive information, but different people within a healthcare system need different levels of access to that information. Giving everyone full access to a patient record creates unnecessary privacy and security risk.

Our solution: a role-based access control (RBAC) system built on synthetic patient data (via Synthea), with audit logging, least-privilege access decisions, and scalability testing to demonstrate the system holds up as data and users grow.

We are not building a finished product. We are building a working prototype that can be demoed live, with honest results — including where it fails — per the hackathon's judging criteria.

---

## 2. Key Dates

| Milestone | Date |
|---|---|
| Track selection submitted | 31 August 2026 ✅ |
| Planning window | 1–2 September 2026 |
| Build window | 3–21 September 2026 (19 days, includes 2-day buffer) |
| Final submission | 21 September 2026, 11:59 PM |

Submission requirements: working demo, technical write-up (max 4 pages), link to code.

---

## 3. Data Source

**Synthea** — open-source synthetic patient data generator. No real patient data, no privacy restrictions.

- Generates: demographics, diagnoses, encounters, medications, allergies, observations, procedures, immunizations
- Format: FHIR / C-CDA
- Pre-generated datasets available (e.g. SyntheticMass) if we don't want to run the generator ourselves
- GitHub: `synthetichealth/synthea`

**Limitation to note in the write-up:** Synthea data is synthetic and not a perfect representation of real clinical outcomes. This is acceptable since our focus is access control and security, not medical prediction.

---

## 4. System Design

**Access model:** Role → Permission → Patient Resource → Access Decision

Example roles:
- **Doctor** — broad access to clinical records
- **Nurse** — relevant patient, medication, and observation data
- **Researcher** — approved research data only
- **Receptionist** — basic patient and appointment info
- **Administrator** — system and permission management

**Principles applied:** least privilege, access logging, automatic expiration/revocation of permissions.

**What we're measuring for scalability:** access-check time, database query time, processing time, and storage requirements as patients/users/roles/records scale up. This gives us real experimental data for the "honest results" the judges want, not just a claim that it works.

---

## 5. Project Breakdown (9 Components)

| # | Component | Owner(s) |
|---|---|---|
| 1 | Access Control Engine (RBAC) | Moyin |
| 2 | Data Layer (Synthea integration) | Moyin |
| 3 | Audit Logging | samkiel |
| 4 | Access Decision Logic | Moyin |
| 5 | Backend / API (glue layer) | samkiel |
| 6 | Scalability & Complexity Testing | Moyin + samkiel |
| 7 | Client Interface | Habib + samkiel |
| 8 | Technical Write-up (4 pages) | symplyiisha |
| 9 | Demo Video | symplyiisha |

**Role summary:**
- **Moyin** — backend/cyber lead: RBAC, data layer, access decision logic
- **samkiel** — backend (audit logging, API) + frontend (with Habib); bridges backend and frontend
- **Habib** — frontend
- **symplyiisha** — technical write-up, demo video

---

## 6. Tech Stack

- **Backend:** TBD
- **Frontend:** React
- **Database:** Neon (serverless Postgres)
- **ORM:** TBD (depends on backend language choice)

Reasoning: whole team stays in one language (TS) across backend and frontend, shared types reduce integration friction between Moyin/samkiel's backend work and samkiel/Habib's frontend work, and nobody's learning a new stack under a 19-day deadline.

---

## 7. Repos & Tooling

- **GitHub org:** github.com/TeamShieldX
  - `MedGate-Backend`
  - `MedGate-Frontend`
- **Linear:** ShieldX team, MedGate project (SHI-5 through SHI-13)

---

## 8. Demo Flow (Draft — to refine closer to submission)

1. Log in as Doctor → show broad record access
2. Log in as Receptionist → show restricted view
3. Attempt unauthorized access as Receptionist → show denial + audit log entry
4. Show audit log / access history
5. (If time allows) show scalability results — access-check time as data grows

---

## 9. Open Items / To Decide

- Exact demo script and what gets rehearsed
- Whether audit logging is tamper-evident (hash chain, append-only log, etc.) or a simpler log table for v1
- Linear board setup — issues to be created per component above

---

*Last updated: 1 September 2026*
