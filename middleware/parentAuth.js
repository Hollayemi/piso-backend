/**
 * middleware/parentAuth.js
 *
 * Ensures the authenticated user is a parent (role === 'parent').
 * Must be used AFTER the `protect` middleware which populates req.user.
 *
 * Responsibilities:
 *   1. Verify the authenticated user has role 'parent'
 *   2. Load the Parent document from DB
 *   3. Compute and attach req.parent.linkedStudentIds — an array of
 *      studentId strings for all students linked to this parent.
 *      This is used by downstream services to guard child access.
 *
 * NOTE: linkedStudentIds is derived dynamically (not stored on Parent)
 * because the Student → Parent relationship is owned by Student.parentId.
 * Caching this on the Parent document would create a dual-write problem.
 *
 * Usage:
 *   router.use(protect);
 *   router.use(parentAuthMiddleware);
 */

const Parent        = require('../model/parent.model');
const Student       = require('../model/student.model');
const ErrorResponse = require('../utils/errorResponse');

const parentAuthMiddleware = async (req, res, next) => {
    // protect() has already verified the JWT and attached req.user
    if (!req.user) {
        return next(new ErrorResponse('Not authenticated', 401));
    }

    // Role check — only parents may use parent-portal routes
    // if (req.user.parentId) {
    //     return next(
    //         new ErrorResponse(
    //             'This endpoint is for parent accounts only.',
    //             403,
    //             [{ code: 'PARENT_ONLY' }]
    //         )
    //     );
    // }

    // ── Load Parent document ───────────────────────────────────────────────
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

    // ── Resolve linked student IDs ─────────────────────────────────────────
    // Query Student collection for all students whose parentId matches.
    // We include non-active statuses so parents can still view a transferred
    // or graduated child's historical records (finance, results, etc.).
    const linkedStudents = await Student.find(
        { parentId: parent.parentId },
        { studentId: 1 }
    ).lean();

    const linkedStudentIds = linkedStudents.map((s) => s.studentId);

    // ── Attach enriched parent object to request ───────────────────────────
    req.parent = {
        ...parent,
        linkedStudentIds,   // e.g. ['STU-2025-0001', 'STU-2025-0048']
    };

    next();
};

module.exports = parentAuthMiddleware;
