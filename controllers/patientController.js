/**
 * Patient Controller - SHI-6 & SHI-7
 * MedGate Backend
 * 
 * Serves Synthea patient records with strict role-based access gating.
 */

const { getAllPatients, getPatientById: fetchPatientById } = require('../db/patientRepository');

/**
 * GET /patients
 * Returns list of patients filtered according to requesting role permissions.
 */
async function getPatients(req, res, next) {
  try {
    const role = req.accessContext?.user?.role || 'Doctor';
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;

    const result = await getAllPatients({ role, limit, offset });

    res.status(200).json({
      success: true,
      count: result.data.length,
      total: result.total,
      accessRole: role,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /patients/:id
 * Returns a specific patient record with clinical entities,
 * applying field-level access gating based on role.
 */
async function getPatientById(req, res, next) {
  try {
    const { id } = req.params;
    const role = req.accessContext?.user?.role || 'Doctor';

    const patient = await fetchPatientById(id, { role });

    if (!patient) {
      return res.status(404).json({
        success: false,
        error: 'Patient not found',
        requestedId: id,
      });
    }

    res.status(200).json({
      success: true,
      accessRole: role,
      data: patient,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getPatients,
  getPatientById,
};
