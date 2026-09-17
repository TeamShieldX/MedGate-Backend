/**
 * Auth Controller (Placeholder)
 * Handles login requests returning mock authentication tokens and user details
 */

const { isValidRole, normalizeRole } = require('../services/rbac');

async function login(req, res, next) {
  try {
    const { role, username } = req.body || {};

    if (role && !isValidRole(role)) {
      return res.status(400).json({
        success: false,
        error: `Invalid role '${role}'. Allowed roles: Doctor, Nurse, Researcher, Receptionist, Administrator.`,
      });
    }

    const selectedRole = normalizeRole(role) || 'Doctor';
    const selectedUsername = username || 'dr_smith';

    res.status(200).json({
      success: true,
      message: 'Login successful (Mock)',
      data: {
        token: `mock-token-${selectedRole.toLowerCase()}-2026`,
        user: {
          id: `usr-${selectedRole.toLowerCase()}-101`,
          username: selectedUsername,
          name: `${selectedRole} User`,
          role: selectedRole,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
};
