# MedGate: Frontend Client Integration Guide (SHI-9)

This guide documents the API contract, authentication headers, role-based field responses, and configuration needed to connect frontend clients (such as `MedGate-Frontend`) to the live MedGate Express / Neon PostgreSQL backend.

---

## 1. Backend Server Details

- **Base URL:** `http://localhost:5000`
- **Health Check:** `GET http://localhost:5000/health`
- **CORS Allowed Origins:** Any `http://localhost:*` or `http://127.0.0.1:*` (Vite dev server default: `http://localhost:5173`)
- **Allowed Request Headers:** `Content-Type`, `Authorization`, `x-user-role`, `x-user-id`, `x-user-name`

---

## 2. Authentication & Role Context Propagation

MedGate uses zero-trust role-based access control. All protected endpoints evaluate the caller's role via headers:

| Header | Description | Example |
| :--- | :--- | :--- |
| `x-user-role` | Active user role (Case-insensitive) | `Doctor`, `Nurse`, `Receptionist`, `Researcher`, `Administrator` |
| `x-user-id` | Optional unique identifier of the user | `doc-101`, `nurse-202` |
| `x-user-name` | Optional display name of user | `dr_smith` |

Alternatively, `?role=` query parameter or JSON body `{ "role": "Doctor" }` is accepted.

---

## 3. Core API Endpoints

### 3.1 Authentication
- **`POST /auth/login`**
  - **Body:** `{ "role": "Doctor", "username": "dr_moyin" }`
  - **Returns:** `{ "success": true, "data": { "token": "...", "user": { ... } } }`
  - **Denials:** Returns `400 Bad Request` if role is invalid.

### 3.2 Patient Records
- **`GET /patients?limit=25&offset=0`**
  - Role-gated and dynamic field-redacted list of patients.
  - **Returns:**
    - `accessRole`: The role under which the response was rendered.
    - `total`: Total record count in database.
    - `data`: Array of patient entities.

- **`GET /patients/:id`**
  - Deep patient record containing relational graphs (encounters, diagnoses, medications, observations, allergies, appointments).
  - Returns `404` if ID not found.

### 3.3 Audit Log
- **`GET /audit-log?limit=50&offset=0&role=Doctor&result=GRANTED`**
  - **Administrator Only:** Non-administrators receive `403 Forbidden` with a structured reason payload.
  - **Returns:**
    - `integrity.tamperEvidentChainValid`: Boolean indicating cryptographic validity across all historical logs.
    - `count`: Number of returned log rows.
    - `data`: Chronological array of audit logs with SHA-256 hash chains.

---

## 4. Role-Based Field Redaction Matrix

| Field | Doctor | Nurse | Receptionist | Researcher | Administrator |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `id` | Visible | Visible | Visible | Visible | Visible |
| `firstName`, `lastName` | Visible | Visible | Visible | **Redacted** | Visible |
| `address`, `phone` | Visible | Visible | Visible | **Redacted** | Visible |
| `birthDate` / `gender` | Visible | Visible | Visible | Visible | Visible |
| `primaryCondition` | Visible | Visible | **Redacted** | Visible | Visible |
| `confidentialNotes` | Visible | **Redacted** | **Redacted** | **Redacted** | Visible |
| `medications` | Visible | Visible | **Redacted** | Visible | Visible |
| `observations` (Vitals/Labs) | Visible | Visible | **Redacted** | Visible | Visible |
| `appointments` | Visible | Visible | Visible | **Redacted** | Visible |
| `audit-log` Access | Denied (403) | Denied (403) | Denied (403) | Denied (403) | **Granted (200)** |

---

## 5. Drop-in Frontend API Client Implementation

To wire `MedGate-Frontend` directly to this backend, replace `MedGate-Frontend/src/services/api.js` with:

```javascript
const API_BASE_URL = import.meta.env?.VITE_API_URL || 'http://localhost:5000';

function getHeaders(roleOverride = null) {
  const role = roleOverride || localStorage.getItem('medgate_role') || 'Doctor';
  return {
    'Content-Type': 'application/json',
    'x-user-role': role,
  };
}

export async function login(role, username) {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, username }),
  });
  const json = await res.json();
  if (json.data?.user?.role) localStorage.setItem('medgate_role', json.data.user.role);
  return json;
}

export async function getPatients(role = null) {
  const res = await fetch(`${API_BASE_URL}/patients?limit=25`, { headers: getHeaders(role) });
  return await res.json();
}

export async function getPatientById(id, role = null) {
  const res = await fetch(`${API_BASE_URL}/patients/${id}`, { headers: getHeaders(role) });
  return await res.json();
}

export async function getAuditLog(role = null) {
  const res = await fetch(`${API_BASE_URL}/audit-log`, { headers: getHeaders(role) });
  return await res.json();
}
```
