/**
 * Patient Controller (Placeholder)
 * Returns mock patient records for GET /patients and GET /patients/:id
 */

const mockPatients = [
  {
    id: 'pat-001',
    firstName: 'Sarah',
    lastName: 'Connor',
    gender: 'F',
    birthDate: '1985-05-14',
    primaryCondition: 'Hypertension',
    assignedDoctor: 'Dr. Smith',
    confidentialNotes: 'Restricted access: High security patient',
  },
  {
    id: 'pat-002',
    firstName: 'John',
    lastName: 'Doe',
    gender: 'M',
    birthDate: '1990-11-22',
    primaryCondition: 'Type 2 Diabetes',
    assignedDoctor: 'Dr. Smith',
    confidentialNotes: 'Regular checkup required',
  },
];

async function getPatients(req, res, next) {
  try {
    const role = req.accessContext?.user?.role || 'Doctor';

    res.status(200).json({
      success: true,
      count: mockPatients.length,
      accessRole: role,
      data: mockPatients,
      note: 'Placeholder response. Real filtered patient data via Synthea & RBAC coming next.',
    });
  } catch (error) {
    next(error);
  }
}

async function getPatientById(req, res, next) {
  try {
    const { id } = req.params;
    const patient = mockPatients.find((p) => p.id === id) || mockPatients[0];

    res.status(200).json({
      success: true,
      data: {
        ...patient,
        requestedId: id,
      },
      note: 'Placeholder response. Field-level filtering will apply based on role.',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getPatients,
  getPatientById,
};
