/**
 * Audit Logging Service - SHI-7 & SHI-8
 * MedGate Backend
 * 
 * Provides an append-only, tamper-evident (cryptographically hash-chained)
 * audit log system recording every access decision (granted or denied).
 */

const { createHash } = require('crypto');
const { pool } = require('../db/index');
const { checkDbConnection } = require('../db/patientRepository');

// In-memory append-only audit log store
const auditLogStore = [];
let lastLogHash = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Computes SHA-256 hash for a log entry to maintain the tamper-evident chain.
 * @param {Object} entry 
 * @param {string} prevHash 
 * @returns {string}
 */
function computeEntryHash(entry, prevHash) {
  const payload = `${entry.timestamp}|${entry.userId}|${entry.role}|${entry.action}|${entry.resource}|${entry.result}|${entry.reason}|${prevHash}`;
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Records an access event into the audit log.
 * Guaranteed to record every access decision (granted or denied).
 * 
 * @param {Object} params
 * @param {Object} params.user - User object { id, username, role }
 * @param {string} params.resource - Resource accessed
 * @param {string} params.action - Action attempted ('read', 'write', etc.)
 * @param {string} params.result - 'GRANTED' or 'DENIED'
 * @param {string} params.reason - Human-readable reason for the decision
 * @param {string} [params.resourceId] - Specific ID of the resource
 * @param {string} [params.ipAddress] - Request IP address
 * @returns {Promise<Object>} The recorded audit log entry
 */
async function recordAccessEvent({
  user = {},
  resource = 'unknown',
  action = 'read',
  result = 'DENIED',
  reason = '',
  resourceId = null,
  ipAddress = '127.0.0.1',
}) {
  const timestamp = new Date().toISOString();
  const userId = user.id || 'anonymous';
  const username = user.username || user.name || userId;
  const role = user.role || 'Unauthenticated';

  const entry = {
    id: `log-${auditLogStore.length + 1}`,
    timestamp,
    userId,
    username,
    role,
    action,
    resource,
    resourceId,
    result,
    reason,
    ipAddress,
    prevHash: lastLogHash,
  };

  entry.hash = computeEntryHash(entry, lastLogHash);
  lastLogHash = entry.hash;

  // Append to in-memory store
  auditLogStore.push(entry);

  // Write to PostgreSQL database if connected
  const dbConnected = await checkDbConnection();
  if (dbConnected) {
    try {
      const query = `
        INSERT INTO audit_logs (user_id, username, role, action, resource, resource_id, result, reason, ip_address, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `;
      const res = await pool.query(query, [
        userId,
        username,
        role,
        action,
        resource,
        resourceId,
        result,
        reason,
        ipAddress,
        timestamp,
      ]);
      entry.dbId = res.rows[0].id;
    } catch (err) {
      console.warn('[AuditLogger] PostgreSQL insert failed, retained in tamper-evident memory store:', err.message);
    }
  }

  return entry;
}

/**
 * Retrieves audit log entries with filtering and pagination.
 * 
 * @param {Object} options
 * @param {number} options.limit
 * @param {number} options.offset
 * @param {string} options.role
 * @param {string} options.result - 'GRANTED' | 'DENIED'
 * @returns {Promise<{ total: number, data: Array }>}
 */
async function getAuditLogs({ limit = 50, offset = 0, role = null, result = null } = {}) {
  const dbConnected = await checkDbConnection();

  if (dbConnected) {
    try {
      let whereClause = [];
      let params = [];

      if (role) {
        params.push(role);
        whereClause.push(`role = $${params.length}`);
      }
      if (result) {
        params.push(result.toUpperCase());
        whereClause.push(`result = $${params.length}`);
      }

      const whereStr = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';
      const countRes = await pool.query(`SELECT COUNT(*) as total FROM audit_logs ${whereStr}`, params);
      const total = parseInt(countRes.rows[0].total, 10);

      params.push(limit);
      const limitIdx = params.length;
      params.push(offset);
      const offsetIdx = params.length;

      const query = `
        SELECT id, user_id as "userId", username, role, action, resource,
               resource_id as "resourceId", result, reason, ip_address as "ipAddress", timestamp
        FROM audit_logs
        ${whereStr}
        ORDER BY timestamp DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;
      const res = await pool.query(query, params);
      return { total, data: res.rows };
    } catch (err) {
      console.warn('[AuditLogger] PostgreSQL query failed, using memory store:', err.message);
    }
  }

  // In-memory query
  let filtered = [...auditLogStore];
  if (role) {
    filtered = filtered.filter((l) => l.role.toLowerCase() === role.toLowerCase());
  }
  if (result) {
    filtered = filtered.filter((l) => l.result.toUpperCase() === result.toUpperCase());
  }

  // Return sorted newest first (with stable fallback on sequence ID)
  filtered.sort((a, b) => {
    const timeDiff = new Date(b.timestamp) - new Date(a.timestamp);
    if (timeDiff !== 0) return timeDiff;
    const idA = parseInt(a.id.replace('log-', ''), 10) || 0;
    const idB = parseInt(b.id.replace('log-', ''), 10) || 0;
    return idB - idA;
  });

  const total = filtered.length;
  const paginated = filtered.slice(offset, offset + limit);

  return { total, data: paginated };
}

/**
 * Cryptographically verifies the integrity of the audit log hash chain.
 * Returns true if no entries have been tampered with or deleted.
 * 
 * @returns {{ valid: boolean, checkedEntries: number, errorIndex?: number }}
 */
function verifyLogIntegrity() {
  let expectedPrevHash = '0000000000000000000000000000000000000000000000000000000000000000';

  for (let i = 0; i < auditLogStore.length; i++) {
    const entry = auditLogStore[i];

    if (entry.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        checkedEntries: i,
        errorIndex: i,
        error: `PrevHash mismatch at index ${i}. Expected: ${expectedPrevHash}, Found: ${entry.prevHash}`,
      };
    }

    const calculatedHash = computeEntryHash(entry, expectedPrevHash);
    if (entry.hash !== calculatedHash) {
      return {
        valid: false,
        checkedEntries: i,
        errorIndex: i,
        error: `Hash corrupted at index ${i}. Expected: ${calculatedHash}, Found: ${entry.hash}`,
      };
    }

    expectedPrevHash = entry.hash;
  }

  return { valid: true, checkedEntries: auditLogStore.length };
}

/**
 * Resets the in-memory audit log store (primarily for unit testing).
 */
function resetAuditLogStore() {
  auditLogStore.length = 0;
  lastLogHash = '0000000000000000000000000000000000000000000000000000000000000000';
}

module.exports = {
  recordAccessEvent,
  getAuditLogs,
  verifyLogIntegrity,
  resetAuditLogStore,
  computeEntryHash,
};
