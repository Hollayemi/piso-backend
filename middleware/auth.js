/**
 * middleware/auth.js  (updated)
 *
 * Changes from original:
 *   1. protect() now validates `sessionVersion` against the current Settings
 *      singleton — any token issued before clear-sessions is called is rejected.
 *   2. protect() now checks Staff.mustResetPassword and returns 403 if set,
 *      except on routes that are explicitly whitelisted (change-password).
 *   3. ROLES constant and authorize() are unchanged.
 *
 * JWT payload shape (set by authService.login):
 *   { id, role, email, name, sessionVersion }
 *
 * Mount in server.js:
 *   const { protect, authorize, ROLES } = require('./middleware/auth');
 */

const jwt          = require('jsonwebtoken');
const asyncHandler = require('./asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

// ─── Routes exempt from mustResetPassword enforcement ────────────────────────
// Matched against req.path (the portion after the router mount point).
const RESET_EXEMPT_PATHS = ['/change-password', '/logout', '/me'];

// ─── Valid roles — single source of truth ────────────────────────────────────

const ROLES = Object.freeze({
    SUPER_ADMIN: 'super_admin',
    ADMIN:       'admin',
    PRINCIPAL:   'principal',
    ACCOUNTANT:  'accountant',
    TEACHER:     'teacher',
});

// ─── protect ─────────────────────────────────────────────────────────────────

/**
 * @middleware protect
 *
 * 1. Extracts Bearer token from Authorization header.
 * 2. Verifies JWT signature.
 * 3. Checks token's sessionVersion against the live Settings value.
 * 4. Attaches the decoded payload to req.user.
 * 5. Checks Staff.mustResetPassword (blocks unless on exempt routes).
 */
const protect = asyncHandler(async (req, res, next) => {
    // ── 1. Extract token ───────────────────────────────────────────────────
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer ')
    ) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return next(new ErrorResponse('Not authorized — no token provided', 401));
    }

    // ── 2. Verify signature ────────────────────────────────────────────────
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        return next(new ErrorResponse('Not authorized — token is invalid or expired', 401));
    }

    // ── 3. Session version check ───────────────────────────────────────────
    // Lazy-require to avoid circular dependencies at module load time.
    const Settings = require('../model/settings.model');
    const settings = await Settings.getSingleton();
    const currentVersion = settings.security?.sessionVersion ?? 1;

    if ((decoded.sessionVersion ?? 0) < currentVersion) {
        return next(
            new ErrorResponse(
                'Session has been invalidated — please log in again',
                401
            )
        );
    }

    // ── 4. Attach user to request ──────────────────────────────────────────
    req.user = decoded; // { id, role, email, name, sessionVersion }

    // ── 5. mustResetPassword gate ──────────────────────────────────────────
    // Allow whitelisted auth routes regardless of flag.
    const isExempt = RESET_EXEMPT_PATHS.some((p) => req.path.endsWith(p));

    if (!isExempt) {
        // Lazy-load Staff to avoid circular requires
        const Staff = require('../model/staff.model');
        const staff = await Staff.findOne(
            { staffId: decoded.id },
            { mustResetPassword: 1 }
        ).lean();

        if (staff?.mustResetPassword) {
            return next(
                new ErrorResponse(
                    'Password reset required — please change your password before continuing',
                    403
                )
            );
        }
    }

    next();
});

// ─── authorize ────────────────────────────────────────────────────────────────

/**
 * @middleware authorize
 *
 * Role guard — restricts a route to one or more allowed roles.
 *
 * Usage:
 *   router.get('/', protect, authorize('admin', 'principal'), handler)
 *   router.get('/', protect, authorize(ROLES.SUPER_ADMIN), handler)
 *
 * @param {...string} roles - One or more role strings from ROLES
 */
const authorize = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return next(
            new ErrorResponse(
                `Role '${req.user?.role}' is not permitted to perform this action`,
                403
            )
        );
    }
    next();
};

module.exports = { protect, authorize, ROLES };
