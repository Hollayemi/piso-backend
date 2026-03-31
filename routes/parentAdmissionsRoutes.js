/**
 * routes/parentAdmissionsRoutes.js
 *
 * Admission endpoints for the Parent Portal:
 *
 * ┌──────────────────────────────────────────────────────────────┬────────────────────────────────────┐
 * │ Route                                                        │ Description                        │
 * ├──────────────────────────────────────────────────────────────┼────────────────────────────────────┤
 * │ GET    /parent/admissions                                    │ List parent's own applications      │
 * │ GET    /parent/admissions/:id                                │ Single application detail           │
 * │ POST   /parent/admissions                                    │ Submit new application              │
 * │ PATCH  /parent/admissions/:id/offer                          │ Accept / Decline an offer           │
 * └──────────────────────────────────────────────────────────────┴────────────────────────────────────┘
 *
 * All routes require a valid parent JWT (role === 'parent').
 *
 * Mount in server.js:
 *   app.use('/api/v1', require('./routes/parentAdmissionsRoutes'));
 */

const express = require('express');

const router                     = express.Router();
const { protect }                = require('../middleware/auth');
const parentAdmissionController  = require('../controllers/parentAdmissionController');

// ─── Simple parent-role guard ─────────────────────────────────────────────────
// We use protect (JWT check) then an inline role guard.
// This avoids the linkedStudentIds bug in parentAuthMiddleware while
// still ensuring only parents can reach these routes.

const requireParent = (req, res, next) => {
    const role = req.user?.role;
    if (role !== "parent") {
        const ErrorResponse = require('../utils/errorResponse');
        return next(
            new ErrorResponse('This endpoint is for parent accounts only.', 403, [
                { code: 'PARENT_ONLY' },
            ])
        );
    }
    // req.user is the full Parent document — expose parentId conveniently
    req.parent = req.user;
    next();
};

// ─── Apply guards to all routes ───────────────────────────────────────────────

router.use(protect);
router.use(requireParent);

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET  /parent/admissions
router.get('/', parentAdmissionController.getMyApplications);

// POST /parent/admissions
router.post('/', parentAdmissionController.submitApplication);

// PATCH /parent/admissions/:id/offer   ← MUST come before /:id to avoid shadowing
router.patch('/:id/offer', parentAdmissionController.respondToOffer);

// GET /parent/admissions/:id
router.get('/:id', parentAdmissionController.getMyApplication);

module.exports = router;
