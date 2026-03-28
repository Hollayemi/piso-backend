/**
 * dashboardRoutes.js
 *
 * Dashboard module routes with JWT + role guards.
 *
 * Role access matrix (per API spec Role Access Summary):
 *
 * ┌──────────────────────────────┬────────────────────────────────────────────────────────────────┐
 * │ Route                        │ Allowed roles                                                  │
 * ├──────────────────────────────┼────────────────────────────────────────────────────────────────┤
 * │ GET /dashboard/summary       │ super_admin, admin, principal — full summary                   │
 * │                              │ accountant — finance section only (filtered server-side)        │
 * │                              │ teacher    — NO access                                         │
 * └──────────────────────────────┴────────────────────────────────────────────────────────────────┘
 *
 * Notes:
 *   - teacher has NO access to the dashboard endpoint.
 *   - accountant receives a finance-only summary (limited view — handled in service).
 *   - principal, admin, super_admin receive the full summary.
 *
 * Mount in server.js:
 *   app.use('/api/v1/dashboard', require('./routes/dashboardRoutes'));
 */

const express = require('express');
const router  = express.Router();

const { protect, authorize, ROLES } = require('../middleware/auth');
const { getDashboardSummary }       = require('../controllers/dashboardController');

// ─── All authenticated roles except teacher ───────────────────────────────────

const DASHBOARD_ROLES = [
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.PRINCIPAL,
    ROLES.ACCOUNTANT,
];

// ─── Apply JWT guard ───────────────────────────────────────────────────────────

router.use(protect);

// GET /dashboard/summary
router.get('/summary', authorize(...DASHBOARD_ROLES), getDashboardSummary);

module.exports = router;
