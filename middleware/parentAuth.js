/**
 * middleware/parentAuth.js
 *
 * Ensures the authenticated user is a parent (role === 'parent').
 * Must be used AFTER the `protect` middleware which populates req.user.
 *
 * Also attaches req.parent — the full Parent document — to the request
 * so downstream handlers can access the parent's linked children without
 * an additional DB query.
 *
 * Usage:
 *   router.use(protect);
 *   router.use(parentAuthMiddleware);
 */

const Parent        = require('../model/parent.model');
const ErrorResponse = require('../utils/errorResponse');

const parentAuthMiddleware = async (req, res, next) => {
    // protect() already verified the JWT and attached req.user
    if (!req.user) {
        return next(new ErrorResponse('Not authenticated', 401));
    }

    if (req.user.role !== 'parent') {
        return next(
            new ErrorResponse(
                'This endpoint is for parent accounts only.',
                403,
                [{ code: 'PARENT_ONLY' }]
            )
        );
    }

    // Load the Parent document to get linked children
    const parent = await Parent.findOne({ parentId: req.user.id }).lean();

    if (!parent) {
        return next(
            new ErrorResponse(
                'Parent account not found. Please contact the school.',
                404,
                [{ code: 'PARENT_NOT_FOUND' }]
            )
        );
    }

    req.parent = parent;
    next();
};

module.exports = parentAuthMiddleware;
