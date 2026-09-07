const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');
const accessControl = require('../middleware/accessControl');

router.use(accessControl);

router.get('/', patientController.getPatients);
router.get('/:id', patientController.getPatientById);

module.exports = router;
