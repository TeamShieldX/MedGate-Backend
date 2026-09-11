/**
 * Access Decision Logic - SHI-7
 * MedGate Backend
 * 
 * Provides the single centralized entry point for access control decisions:
 * - Evaluates requests through the RBAC engine
 * - Enforces least-privilege default-deny with human-readable explanations
 * - Guarantees an immutable audit log entry for every evaluation (granted or denied)
 */

const { hasPermission, normalizeRole } = require('./rbac');
const { recordAccessEvent } = require('./auditLogger');

/**
 * Single entry point for all access decisions.
 * Evaluates whether a user can perform an action on a resource,
 * and writes to the audit log regardless of outcome.
 * 
 * @param {Object} user - The requesting user { id, username, role }
 * @param {string} resource - Target resource (e.g. 'patients', 'clinical-notes')
 * @param {string} action - Requested action ('read', 'write', 'update', 'delete')
 * @param {Object} [context] - Additional request context { resourceId, ipAddress, reason }
 * @returns {Promise<{ allowed: boolean, reason: string, auditLogId: string, timestamp: string, role: string }>}
 */
async function evaluateAccess(user = {}, resource = '', action = 'read', context = {}) {
  const role = user.role || 'Unauthenticated';
  const resourceNormalized = (resource || '').trim().toLowerCase();
  const actionNormalized = (action || 'read').trim().toLowerCase();

  // 1. Evaluate permission using RBAC engine
  const rbacResult = hasPermission(role, resourceNormalized, actionNormalized);

  const allowed = rbacResult.allowed;
  const reason = rbacResult.reason;
  const normalizedRole = rbacResult.normalizedRole || role;

  // 2. Record audit log entry (Every decision is logged, granted or denied)
  const auditEntry = await recordAccessEvent({
    user: {
      ...user,
      role: normalizedRole,
    },
    resource: resourceNormalized,
    action: actionNormalized,
    result: allowed ? 'GRANTED' : 'DENIED',
    reason,
    resourceId: context.resourceId || null,
    ipAddress: context.ipAddress || context.ip || '127.0.0.1',
  });

  return {
    allowed,
    reason,
    auditLogId: auditEntry.id,
    timestamp: auditEntry.timestamp,
    role: normalizedRole,
  };
}

module.exports = {
  evaluateAccess,
};
