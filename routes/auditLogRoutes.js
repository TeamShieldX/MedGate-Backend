const express = require('express');
const router = express.Router();
const auditLogController = require('../controllers/auditLogController');

router.get('/', auditLogController.getAuditLogs);

module.exports = router;
