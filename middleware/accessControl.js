/**
 * Access Control Middleware - SHI-5 & SHI-7
 * MedGate Backend
 * 
 * Intercepts incoming HTTP requests to protected routes, resolves user identity/role,
 * and delegates permission evaluation to Access Decision Logic (SHI-7).
 */

const { evaluateAccess } = require('../services/accessDecision');

/**
 * Access Control Middleware Factory.
 * Can be used directly: `app.use(accessControl)`
 * Or parameterized: `router.get('/notes', accessControl('clinical-notes', 'read'), handler)`
 * 
 * @param {string} [enforcedResource] 
 * @param {string} [enforcedAction] 
 */
function accessControl(enforcedResource, enforcedAction) {
  // If invoked directly as Express middleware: (req, res, next)
  if (typeof enforcedResource === 'object' && enforcedResource.method && enforcedResource.headers) {
    const req = enforcedResource;
    const res = enforcedAction;
    const next = arguments[2];
    return handleAccess(req, res, next);
  }

  // Middleware factory handler
  return function (req, res, next) {
    return handleAccess(req, res, next, enforcedResource, enforcedAction);
  };
}

async function handleAccess(req, res, next, explicitResource, explicitAction) {
  try {
    // 1. Resolve User Identity & Role
    const userRole = req.headers['x-user-role'] ||
                     req.query?.role ||
                     req.body?.role ||
                     req.user?.role ||
                     'Doctor';

    const userId = req.headers['x-user-id'] ||
                   req.user?.id ||
                   req.body?.userId ||
                   'usr-default';

    const username = req.headers['x-user-name'] ||
                     req.user?.username ||
                     'user';

    const user = {
      id: userId,
      username,
      role: userRole,
    };

    // 2. Resolve Resource & Action
    const resource = explicitResource ||
                     req.baseUrl.replace(/^\/+/, '').split('/')[0] ||
                     'patients';

    let action = explicitAction;
    if (!action) {
      switch (req.method) {
        case 'GET':
          action = 'read';
          break;
        case 'POST':
          action = 'write';
          break;
        case 'PUT':
        case 'PATCH':
          action = 'update';
          break;
        case 'DELETE':
          action = 'delete';
          break;
        default:
          action = 'read';
      }
    }

    const context = {
      resourceId: req.params?.id || null,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
    };

    // 3. Delegate to Access Decision Logic (SHI-7)
    const decision = await evaluateAccess(user, resource, action, context);

    if (!decision.allowed) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        reason: decision.reason,
        auditLogId: decision.auditLogId,
        timestamp: decision.timestamp,
      });
    }

    // Attach access context for downstream handlers
    req.accessContext = {
      user: { ...user, role: decision.role },
      decision,
      resource,
      action,
    };

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = accessControl;
