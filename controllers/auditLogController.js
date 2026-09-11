/**
 * Audit Log Controller - SHI-7 & SHI-8
 * MedGate Backend
 * 
 * Serves real tamper-evident access audit log entries.
 */

const { getAuditLogs: fetchAuditLogs, verifyLogIntegrity } = require('../services/auditLogger');

/**
 * GET /audit-log
 * Retrieves recorded access events with optional filtering by role or result.
 */
async function getAuditLogs(req, res, next) {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;
    const role = req.query.role || null;
    const result = req.query.result || null;

    const logs = await fetchAuditLogs({ limit, offset, role, result });
    const integrity = verifyLogIntegrity();

    res.status(200).json({
      success: true,
      count: logs.data.length,
      total: logs.total,
      integrity: {
        tamperEvidentChainValid: integrity.valid,
        totalEntriesVerified: integrity.checkedEntries,
      },
      data: logs.data,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAuditLogs,
};
