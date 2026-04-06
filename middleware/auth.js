/**
 * middleware/auth.js
 *
 * JWT authentication + role-based authorisation middleware.
 *
 * System roles:
 *   super_admin | admin | principal | accountant | teacher
 *
 * Usage:
 *   router.use(protect);                              // require valid JWT
 *   router.get('/', authorize(ROLES.ADMIN), handler); // require specific role(s)
 *
 * Token payload shape (issued by authService.login):
 *   { id, role, email, name, sessionVersion }
 *
 * Session invalidation:
 *   Settings.security.sessionVersion is compared against the token's
 *   embedded sessionVersion. A mismatch means the session was cleared.
 *
 * Force-reset guard:
 *   Staff.mustResetPassword === true blocks all routes EXCEPT the
 *   paths listed in RESET_EXEMPT_PATHS.
 */

const jwt = require('jsonwebtoken');
const Staff = require('../model/staff.model');
const Settings = require('../model/settings.model');
const ErrorResponse = require('../utils/errorResponse');
const Parent = require("../model/parent.model")

// ─── Role constants — single source of truth across all route files ───────────

const ROLES = Object.freeze({
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    PRINCIPAL: 'principal',
    ACCOUNTANT: 'accountant',
    TEACHER: 'teacher',
    PARENT: 'parent',
});

// ─── Paths exempt from the mustResetPassword block ────────────────────────────

const RESET_EXEMPT_PATHS = ['/change-password', '/logout'];

// ═══════════════════════════════════════════════════════════════════════════════
// protect — validates the JWT and attaches req.user
// ═══════════════════════════════════════════════════════════════════════════════

const protect = async (req, res, next) => {
    let token;

    // Extract Bearer token from Authorization header
    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer ')
    ) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return next(new ErrorResponse('Not authorised — no token provided', 401));
    }

    try {
        // Verify signature and expiry
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // ── Session version check ──────────────────────────────────────────
        const settings = await Settings.getSingleton();
        const currentVersion = settings.security?.sessionVersion ?? 1;

        if ((decoded.sessionVersion ?? 1) < currentVersion) {
            return next(
                new ErrorResponse(
                    'Your session has been invalidated. Please log in again.',
                    401
                )
            );
        }

        // ── Load the staff record (without password) ───────────────────────

        let user = ""

        if (decoded.role !== "parent") {
            user = await Staff.findOne({ staffId: decoded.id });
            req.user = {
                id: user.staffId,
                role: decoded.role,
                email: user.email,
                name: `${user.surname} ${user.firstName}`,
                staffDoc: user,
            };
        } else {
            user = await Parent.findOne({parentId: decoded.id});
            req.user = {
                id: user.parentId,
                role: "parent",
                email: user.email,
                name: user.familyName,
                staffDoc: user,          // full doc available if needed
            };
        }

        if (!user) {
            return next(new ErrorResponse('User account not found', 401));
        }

        if (user.status === 'Inactive') {
            return next(
                new ErrorResponse(
                    'Your account has been deactivated. Please contact the administrator.',
                    403
                )
            );
        }

        // ── Force-reset guard ──────────────────────────────────────────────
        const isExemptPath = RESET_EXEMPT_PATHS.some((p) =>
            req.path.includes(p)
        );

        if (user.mustResetPassword && !isExemptPath) {
            return next(
                new ErrorResponse(
                    'You must change your password before continuing.',
                    403,
                    [{ code: 'PASSWORD_RESET_REQUIRED' }]
                )
            );
        }

        // Attach a compact user object to the request
        // req.user

        next();
    } catch (err) {
        console.error('Auth middleware error:', err);
        if (err.name === 'TokenExpiredError') {
            return next(new ErrorResponse('Session expired — please log in again', 401));
        }
        return next(new ErrorResponse('Invalid token', 401));
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// authorize — gate a route to specific roles
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns middleware that allows only the given roles.
 *
 * @param {...string} roles - One or more ROLES values
 */
const authorize = (...roles) => (req, res, next) => {
    if (!req.user) {
        return next(new ErrorResponse('Not authenticated', 401));
    }

    if (!roles.includes(req.user.role)) {
        return next(
            new ErrorResponse(
                `Role '${req.user.role}' is not permitted to access this resource`,
                403,
                [{ code: 'FORBIDDEN' }]
            )
        );
    }

    next();
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { protect, authorize, ROLES };
