/**
 * Patient Routes - SHI-7 & SHI-9
 * MedGate Backend
 * 
 * Protected patient endpoints guarded by accessControl middleware.
 */

const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');
const accessControl = require('../middleware/accessControl');

// Guard all patient routes with Access Control Middleware (SHI-5 & SHI-7)
router.use(accessControl('patients'));

router.get('/', patientController.getPatients);
router.get('/:id', patientController.getPatientById);

module.exports = router;
