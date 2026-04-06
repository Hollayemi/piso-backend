/**
 * routes/parentProfileRoutes.js
 *
 * Routes for the authenticated parent's own profile.
 *
 *   GET   /parent/profile   → return full profile (auth/me style)
 *   PATCH /parent/profile   → update contact details
 *
 * Mount in server.js:
 *   app.use('/api/v1', require('./routes/parentProfileRoutes'));
 */

const express = require('express');
const router  = express.Router();

const { protect }        = require('../middleware/auth');
const { updateProfile }  = require('../controllers/parentProfileController');

// Simple inline parent-role guard (same pattern as parentAdmissionsRoutes)
const requireParent = (req, res, next) => {
    if (req.user?.role !== 'parent') {
        const ErrorResponse = require('../utils/errorResponse');
        return next(new ErrorResponse('This endpoint is for parent accounts only.', 403));
    }
    next();
};

router.use(protect);
router.use(requireParent);

// PATCH /parent/profile
router.patch('/parent/profile', updateProfile);

module.exports = router;
