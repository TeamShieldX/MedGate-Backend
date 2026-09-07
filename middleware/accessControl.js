/**
 * Access Control Middleware (Placeholder for SHI-5 & SHI-7)
 * 
 * Sits in front of sensitive routes (e.g. /patients) to verify permissions
 */

const { evaluateAccess } = require('../services/accessDecision');

async function accessControl(req, res, next) {
  try {
    const userRole = req.headers['x-user-role'] || req.body?.role || 'Doctor';
    const user = { id: req.headers['x-user-id'] || 'user-1', role: userRole };
    const resource = req.baseUrl.replace('/', '') || 'patients';
    const action = req.method === 'GET' ? 'read' : 'write';

    const decision = await evaluateAccess(user, resource, action);

    if (!decision.allowed) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        reason: decision.reason,
      });
    }

    req.accessContext = { user, decision };
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = accessControl;
