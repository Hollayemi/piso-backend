const jwt = require('jsonwebtoken');
const asyncHandler = require('./asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

/**
 * VALID ROLES — single source of truth for the entire application.
 * Import this wherever role lists are needed.
 */
const ROLES = Object.freeze({
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    PRINCIPAL: 'principal',
    ACCOUNTANT: 'accountant',
    TEACHER: 'teacher',
});

/**
 * @middleware protect
 * Verifies the Bearer JWT and attaches `req.user` to the request.
 * Expected JWT payload: { id, role, email, name }
 */
const protect = asyncHandler(async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer ')
    ) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return next(
            new ErrorResponse('Not authorized — no token provided', 401)
        );
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { id, role, email, name }
        next();
    } catch (err) {
        return next(
            new ErrorResponse('Not authorized — token is invalid or expired', 401)
        );
    }
});

/**
 * @middleware authorize
 * Role guard — restricts a route to one or more allowed roles.
 *
 * Usage: router.get('/', protect, authorize('admin', 'principal'), controller)
 *
 * @param  {...string} roles — one or more role strings from ROLES
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
