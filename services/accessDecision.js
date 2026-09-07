/**
 * Access Decision Logic Service (Placeholder for SHI-7 & SHI-8)
 * 
 * Single entry point: evaluateAccess(user, resource, action) -> { allowed, reason }
 * - Invokes RBAC engine (services/rbac.js)
 * - Emits audit log entry on every access attempt
 * - Returns clear human-readable reason for denials
 */

const { checkPermission } = require('./rbac');

async function evaluateAccess(user, resource, action) {
  if (!user || !user.role) {
    return {
      allowed: false,
      reason: 'Authentication required. No user role specified.',
    };
  }

  const allowed = checkPermission(user.role, resource, action);
  const reason = allowed
    ? `Access granted to resource '${resource}' for role '${user.role}'`
    : `Access denied: Role '${user.role}' lacks permission '${action}' on '${resource}'`;
  return { allowed, reason };
}

module.exports = {
  evaluateAccess,
};
