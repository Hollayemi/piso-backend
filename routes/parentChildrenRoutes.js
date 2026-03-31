/**
 * routes/parentChildrenRoutes.js
 *
 * Children endpoints for the Parent Portal.
 *
 * All routes require a valid parent JWT — enforced by protect + parentAuthMiddleware.
 * parentAuthMiddleware also populates req.parent.linkedStudentIds so downstream
 * services can validate child ownership without additional DB calls.
 *
 * Route table:
 * ┌────────────────────────────────┬──────────────────────────────────────────┐
 * │ Route                          │ Description                              │
 * ├────────────────────────────────┼──────────────────────────────────────────┤
 * │ GET  /parent/children          │ 4. List all children (summary)           │
 * │ GET  /parent/children/:id      │ 5. Full profile for one child            │
 * └────────────────────────────────┴──────────────────────────────────────────┘
 *
 * Mount in server.js BEFORE the general parent finance router:
 *   app.use('/api/v1', require('./routes/parentChildrenRoutes'));
 *
 * ⚠️  Route ordering:
 *   GET /parent/children is declared BEFORE /parent/children/:id to ensure
 *   Express matches the literal path first when both patterns are registered.
 *   (Express already handles this correctly for GET vs GET /:id, but explicit
 *   ordering is good practice for clarity.)
 */

const express = require('express');

const router                 = express.Router();
const { protect }            = require('../middleware/auth');
const parentAuthMiddleware   = require('../middleware/parentAuth');
const {
    getChildren,
    getChildProfile,
} = require('../controllers/parentChildrenController');

// ─── Apply auth guards to all routes in this file ────────────────────────────

router.use(protect);
router.use(parentAuthMiddleware);

// ─── 4.  GET /parent/children ─────────────────────────────────────────────────
// Returns a summary list of all children linked to the authenticated parent.
router.get('/parent/children', getChildren);

// ─── 5.  GET /parent/children/:id ────────────────────────────────────────────
// Returns full profile for one child. Access-guarded against the parent's
// linked student list — 403 is returned for unlinked student IDs.
router.get('/parent/children/:id', getChildProfile);

module.exports = router;
