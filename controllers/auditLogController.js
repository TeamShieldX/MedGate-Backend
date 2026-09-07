/**
 * Audit Log Controller (Placeholder)
 * Serves access audit log entries for GET /audit-log
 */

const mockAuditLogs = [
  {
    id: 'log-001',
    timestamp: new Date().toISOString(),
    user: 'usr-101',
    role: 'Doctor',
    action: 'read',
    resource: 'patients',
    result: 'GRANTED',
    reason: "Access granted to resource 'patients' for role 'Doctor'",
  },
  {
    id: 'log-002',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    user: 'usr-102',
    role: 'Receptionist',
    action: 'read',
    resource: 'patients/pat-001/clinical-notes',
    result: 'DENIED',
    reason: "Access denied: Role 'Receptionist' lacks permission on clinical notes",
  },
];

async function getAuditLogs(req, res, next) {
  try {
    res.status(200).json({
      success: true,
      count: mockAuditLogs.length,
      data: mockAuditLogs,
      note: 'Placeholder audit logs. Tamper-evident log table integration coming next.',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAuditLogs,
};
