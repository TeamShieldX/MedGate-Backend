/**
 * Access Control Engine (RBAC) - SHI-5
 * MedGate Backend
 * 
 * Implements data-driven Role-Based Access Control (RBAC) with:
 * - Data-driven role -> permission -> resource mapping
 * - Least privilege by default (explicit deny if not permitted)
 * - Field-level access gating and data redaction
 * - Validation and human-readable decision reasons
 */

const ROLES = Object.freeze({
  DOCTOR: 'Doctor',
  NURSE: 'Nurse',
  RESEARCHER: 'Researcher',
  RECEPTIONIST: 'Receptionist',
  ADMINISTRATOR: 'Administrator',
});

const RESOURCES = Object.freeze({
  PATIENTS: 'patients',
  CLINICAL_NOTES: 'clinical-notes',
  MEDICATIONS: 'medications',
  OBSERVATIONS: 'observations',
  DIAGNOSES: 'diagnoses',
  ENCOUNTERS: 'encounters',
  PROCEDURES: 'procedures',
  ALLERGIES: 'allergies',
  IMMUNIZATIONS: 'immunizations',
  APPOINTMENTS: 'appointments',
  AUDIT_LOGS: 'audit-logs',
  USERS: 'users',
  SYSTEM: 'system',
});

const ACTIONS = Object.freeze({
  READ: 'read',
  WRITE: 'write',
  UPDATE: 'update',
  DELETE: 'delete',
});

/**
 * Data-Driven Role Permissions Table
 * Defines allowed actions per resource for each role.
 * Any combination not explicitly listed is DENIED by default.
 */
const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.DOCTOR]: {
    [RESOURCES.PATIENTS]: [ACTIONS.READ, ACTIONS.WRITE, ACTIONS.UPDATE],
    [RESOURCES.CLINICAL_NOTES]: [ACTIONS.READ, ACTIONS.WRITE, ACTIONS.UPDATE],
    [RESOURCES.MEDICATIONS]: [ACTIONS.READ, ACTIONS.WRITE, ACTIONS.UPDATE],
    [RESOURCES.OBSERVATIONS]: [ACTIONS.READ, ACTIONS.WRITE, ACTIONS.UPDATE],
    [RESOURCES.DIAGNOSES]: [ACTIONS.READ, ACTIONS.WRITE, ACTIONS.UPDATE],
    [RESOURCES.ENCOUNTERS]: [ACTIONS.READ, ACTIONS.WRITE, ACTIONS.UPDATE],
    [RESOURCES.PROCEDURES]: [ACTIONS.READ, ACTIONS.WRITE, ACTIONS.UPDATE],
    [RESOURCES.ALLERGIES]: [ACTIONS.READ, ACTIONS.WRITE, ACTIONS.UPDATE],
    [RESOURCES.IMMUNIZATIONS]: [ACTIONS.READ, ACTIONS.WRITE, ACTIONS.UPDATE],
    [RESOURCES.APPOINTMENTS]: [ACTIONS.READ, ACTIONS.WRITE, ACTIONS.UPDATE],
    [RESOURCES.AUDIT_LOGS]: [ACTIONS.READ],
  },
  [ROLES.NURSE]: {
    [RESOURCES.PATIENTS]: [ACTIONS.READ],
    [RESOURCES.MEDICATIONS]: [ACTIONS.READ, ACTIONS.WRITE, ACTIONS.UPDATE],
    [RESOURCES.OBSERVATIONS]: [ACTIONS.READ, ACTIONS.WRITE, ACTIONS.UPDATE],
    [RESOURCES.ENCOUNTERS]: [ACTIONS.READ, ACTIONS.WRITE],
    [RESOURCES.IMMUNIZATIONS]: [ACTIONS.READ, ACTIONS.WRITE],
    [RESOURCES.ALLERGIES]: [ACTIONS.READ],
    [RESOURCES.APPOINTMENTS]: [ACTIONS.READ, ACTIONS.UPDATE],
    [RESOURCES.DIAGNOSES]: [ACTIONS.READ],
    // clinical-notes (confidential) explicitly not permitted
  },
  [ROLES.RESEARCHER]: {
    [RESOURCES.PATIENTS]: [ACTIONS.READ],
    [RESOURCES.DIAGNOSES]: [ACTIONS.READ],
    [RESOURCES.OBSERVATIONS]: [ACTIONS.READ],
    [RESOURCES.PROCEDURES]: [ACTIONS.READ],
    [RESOURCES.MEDICATIONS]: [ACTIONS.READ],
    [RESOURCES.IMMUNIZATIONS]: [ACTIONS.READ],
    // appointments, clinical-notes, PII write operations not permitted
  },
  [ROLES.RECEPTIONIST]: {
    [RESOURCES.PATIENTS]: [ACTIONS.READ],
    [RESOURCES.APPOINTMENTS]: [ACTIONS.READ, ACTIONS.WRITE, ACTIONS.UPDATE, ACTIONS.DELETE],
    // All clinical resources (clinical-notes, medications, diagnoses, observations, etc.) not permitted
  },
  [ROLES.ADMINISTRATOR]: {
    [RESOURCES.USERS]: [ACTIONS.READ, ACTIONS.WRITE, ACTIONS.UPDATE, ACTIONS.DELETE],
    [RESOURCES.AUDIT_LOGS]: [ACTIONS.READ],
    [RESOURCES.SYSTEM]: [ACTIONS.READ, ACTIONS.WRITE, ACTIONS.UPDATE],
    [RESOURCES.PATIENTS]: [ACTIONS.READ],
    [RESOURCES.APPOINTMENTS]: [ACTIONS.READ],
    // Direct medical manipulation restricted to clinicians
  },
});

/**
 * Data-Driven Field-Level Access Rules
 * Defines allowed record fields per resource for each role.
 * Any field not listed is redacted/omitted upon return.
 */
const FIELD_PERMISSIONS = Object.freeze({
  [RESOURCES.PATIENTS]: {
    [ROLES.DOCTOR]: [
      'id',
      'firstName',
      'lastName',
      'gender',
      'birthDate',
      'address',
      'phone',
      'primaryCondition',
      'assignedDoctor',
      'confidentialNotes',
      'medications',
      'diagnoses',
      'observations',
      'allergies',
      'procedures',
      'encounters',
      'immunizations',
    ],
    [ROLES.NURSE]: [
      'id',
      'firstName',
      'lastName',
      'gender',
      'birthDate',
      'address',
      'phone',
      'primaryCondition',
      'assignedDoctor',
      'medications',
      'diagnoses',
      'observations',
      'allergies',
      'immunizations',
      // 'confidentialNotes' is restricted
    ],
    [ROLES.RESEARCHER]: [
      'id',
      'gender',
      'birthDate',
      'primaryCondition',
      'diagnoses',
      'observations',
      'procedures',
      'medications',
      'immunizations',
      // PII ('firstName', 'lastName', 'address', 'phone') and 'confidentialNotes' restricted
    ],
    [ROLES.RECEPTIONIST]: [
      'id',
      'firstName',
      'lastName',
      'gender',
      'birthDate',
      'address',
      'phone',
      'assignedDoctor',
      // All clinical fields restricted
    ],
    [ROLES.ADMINISTRATOR]: [
      'id',
      'firstName',
      'lastName',
      'gender',
      'birthDate',
      'assignedDoctor',
      // Clinical notes and deep clinical fields restricted for admin
    ],
  },
});

/**
 * Normalizes a role string to standard casing.
 * @param {string} role 
 * @returns {string|null}
 */
function normalizeRole(role) {
  if (!role || typeof role !== 'string') return null;
  const match = Object.values(ROLES).find(
    (r) => r.toLowerCase() === role.trim().toLowerCase()
  );
  return match || null;
}

/**
 * Validates if a role string is a recognized system role.
 * @param {string} role 
 * @returns {boolean}
 */
function isValidRole(role) {
  return normalizeRole(role) !== null;
}

/**
 * Evaluates whether a given role has permission to perform an action on a resource.
 * Enforces Least Privilege by default: Deny unless explicitly permitted.
 * 
 * @param {string} role - The role of the user (e.g., 'Doctor', 'Nurse')
 * @param {string} resource - Target resource (e.g., 'patients', 'clinical-notes')
 * @param {string} action - Action to perform (e.g., 'read', 'write')
 * @returns {{ allowed: boolean, reason: string, normalizedRole: string|null }}
 */
function hasPermission(role, resource, action = ACTIONS.READ) {
  const normalizedRole = normalizeRole(role);
  const normalizedAction = (action || '').trim().toLowerCase();
  const normalizedResource = (resource || '').trim().toLowerCase();

  // 1. Validate Role
  if (!normalizedRole) {
    return {
      allowed: false,
      reason: `Access denied: Role '${role}' is not a recognized system role.`,
      normalizedRole: null,
    };
  }

  // 2. Lookup role permissions matrix
  const roleRules = ROLE_PERMISSIONS[normalizedRole];
  if (!roleRules) {
    return {
      allowed: false,
      reason: `Access denied: No permissions defined for role '${normalizedRole}'.`,
      normalizedRole,
    };
  }

  // 3. Lookup resource permissions
  const allowedActions = roleRules[normalizedResource];
  if (!allowedActions || !Array.isArray(allowedActions)) {
    return {
      allowed: false,
      reason: `Access denied: Role '${normalizedRole}' has no permissions for resource '${normalizedResource}'.`,
      normalizedRole,
    };
  }

  // 4. Verify action
  if (!allowedActions.includes(normalizedAction)) {
    return {
      allowed: false,
      reason: `Access denied: Role '${normalizedRole}' lacks '${normalizedAction}' permission on resource '${normalizedResource}'. Allowed actions: [${allowedActions.join(', ')}].`,
      normalizedRole,
    };
  }

  // 5. Access Granted
  return {
    allowed: true,
    reason: `Access granted: Role '${normalizedRole}' is authorized to '${normalizedAction}' resource '${normalizedResource}'.`,
    normalizedRole,
  };
}

/**
 * Returns allowed fields for a given role on a resource.
 * 
 * @param {string} role 
 * @param {string} resource 
 * @returns {string[]}
 */
function getAllowedFields(role, resource = RESOURCES.PATIENTS) {
  const normalizedRole = normalizeRole(role);
  const normalizedResource = (resource || '').trim().toLowerCase();

  if (!normalizedRole) return [];
  const resourceFields = FIELD_PERMISSIONS[normalizedResource];
  if (!resourceFields) return [];

  return resourceFields[normalizedRole] || [];
}

/**
 * Applies field-level access gating and redaction to a data object or array of objects.
 * Strips any fields that the specified role is not permitted to view.
 * 
 * @param {string} role 
 * @param {string} resource 
 * @param {Object|Array} data 
 * @returns {Object|Array|null}
 */
function filterFields(role, resource, data) {
  if (data === null || data === undefined) return data;

  const allowedFields = getAllowedFields(role, resource);
  
  // If no field permissions defined, return empty representation per least-privilege
  if (!allowedFields || allowedFields.length === 0) {
    return Array.isArray(data) ? [] : {};
  }

  const allowedSet = new Set(allowedFields);

  const filterSingleObject = (item) => {
    if (!item || typeof item !== 'object') return item;
    const filtered = {};
    for (const key of Object.keys(item)) {
      if (allowedSet.has(key)) {
        filtered[key] = item[key];
      }
    }
    return filtered;
  };

  if (Array.isArray(data)) {
    return data.map(filterSingleObject);
  }

  return filterSingleObject(data);
}

/**
 * Returns all configured permissions for a given role.
 * 
 * @param {string} role 
 * @returns {Object|null}
 */
function getRolePermissions(role) {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return null;
  return ROLE_PERMISSIONS[normalizedRole] || null;
}

module.exports = {
  ROLES,
  RESOURCES,
  ACTIONS,
  ROLE_PERMISSIONS,
  FIELD_PERMISSIONS,
  normalizeRole,
  isValidRole,
  hasPermission,
  getAllowedFields,
  filterFields,
  getRolePermissions,
};
