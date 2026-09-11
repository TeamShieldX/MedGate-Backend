/**
 * Audit Log Routes - SHI-7 & SHI-8
 * MedGate Backend
 * 
 * Protected audit log endpoints guarded by accessControl middleware.
 */

const express = require('express');
const router = express.Router();
const auditLogController = require('../controllers/auditLogController');
const accessControl = require('../middleware/accessControl');

// Guard audit-log route - requires audit-logs read permission (e.g. Administrator, Doctor)
router.use(accessControl('audit-logs', 'read'));

router.get('/', auditLogController.getAuditLogs);

module.exports = router;
