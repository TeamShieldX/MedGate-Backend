/**
 * Auth Controller (Placeholder)
 * Handles login requests returning mock authentication tokens and user details
 */

async function login(req, res, next) {
  try {
    const { role, username } = req.body || {};
    const selectedRole = role || 'Doctor';
    const selectedUsername = username || 'dr_smith';

    res.status(200).json({
      success: true,
      message: 'Login successful (Mock)',
      data: {
        token: 'mock-jwt-token-medgate-sec-2026',
        user: {
          id: 'usr-101',
          username: selectedUsername,
          name: 'Demo User',
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
