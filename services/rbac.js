/**
 * RBAC Engine Service (Placeholder for SHI-5)
 * 
 * Future Implementation:
 * - Data-driven Role -> Permission -> Resource mapping
 * - Least privilege by default (deny unless permitted)
 * - Support field/table-level access gating
 */

const ROLES = {
  DOCTOR: 'Doctor',
  NURSE: 'Nurse',
  RESEARCHER: 'Researcher',
  RECEPTIONIST: 'Receptionist',
  ADMINISTRATOR: 'Administrator',
};

function checkPermission(role, resource, action) {
  // Placeholder: Always true for scaffolding phase
  return true;
}

module.exports = {
  ROLES,
  checkPermission,
};
