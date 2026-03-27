/**
 * transportRoutes.js
 *
 * All Transport module routes with JWT + role guards.
 *
 * Role access matrix (from API spec § Role Access Summary):
 * ┌──────────────────────────────────────────────┬──────────────────────────────────────────────────────────────┐
 * │ Route                                        │ Allowed roles                                                │
 * ├──────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
 * │ GET    /routes                               │ super_admin, admin, principal                                │
 * │ POST   /routes                               │ super_admin, admin                                           │
 * │ PUT    /routes/:id                           │ super_admin, admin                                           │
 * │ DELETE /routes/:id                           │ super_admin, admin                                           │
 * ├──────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
 * │ GET    /enrollments                          │ super_admin, admin, principal                                │
 * │ POST   /enrollments                          │ super_admin, admin                                           │
 * │ DELETE /enrollments/:studentId               │ super_admin, admin                                           │
 * ├──────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
 * │ GET    /trips                                │ super_admin, admin, principal                                │
 * │ POST   /trips                                │ super_admin, admin                                           │
 * │ PUT    /trips/:id                            │ super_admin, admin                                           │
 * │ DELETE /trips/:id                            │ super_admin, admin                                           │
 * ├──────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
 * │ GET    /stats                                │ super_admin, admin, principal                                │
 * └──────────────────────────────────────────────┴──────────────────────────────────────────────────────────────┘
 *
 * Note — accountant and teacher roles:
 *   Neither has access to any Transport endpoint (per spec).
 *   Both are intentionally omitted from every authorize() call.
 *
 * ⚠️  Route ordering:
 *   /stats declared BEFORE /:id parameterised routes where needed
 *   to prevent Express matching "stats" as a route or trip ID.
 *
 * Mount in server.js:
 *   app.use('/api/v1/transport', require('./routes/transportRoutes'));
 */

const express = require('express');
const router  = express.Router();

const { protect, authorize, ROLES } = require('../middleware/auth');
const {
    getAllRoutes,
    createRoute,
    updateRoute,
    deleteRoute,
    getAllEnrollments,
    enrollStudent,
    removeEnrollment,
    getAllTrips,
    createTrip,
    updateTrip,
    deleteTrip,
    getTransportStats,
} = require('../controllers/transportController');

// ─── Role groups ──────────────────────────────────────────────────────────────

/** Full CRUD on transport resources */
const CRUD_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

/**
 * Read-only access.
 * principal can view all transport data; accountant and teacher have no access.
 */
const READ_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRINCIPAL];

// ─── Apply JWT guard to all routes ───────────────────────────────────────────

router.use(protect);

// ═══════════════════════════════════════════════════════════════════════════════
// STATS  —  /transport/stats
// Declared BEFORE any parameterised routes to avoid shadowing
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/stats', authorize(...READ_ROLES), getTransportStats);

// ═══════════════════════════════════════════════════════════════════════════════
// BUS ROUTES  —  /transport/routes
// ═══════════════════════════════════════════════════════════════════════════════

router
    .route('/routes')
    .get(authorize(...READ_ROLES), getAllRoutes)
    .post(authorize(...CRUD_ROLES), createRoute);

router
    .route('/routes/:id')
    .put(authorize(...CRUD_ROLES), updateRoute)
    .delete(authorize(...CRUD_ROLES), deleteRoute);

// ═══════════════════════════════════════════════════════════════════════════════
// BUS ENROLLMENTS  —  /transport/enrollments
// ═══════════════════════════════════════════════════════════════════════════════

router
    .route('/enrollments')
    .get(authorize(...READ_ROLES), getAllEnrollments)
    .post(authorize(...CRUD_ROLES), enrollStudent);

router
    .route('/enrollments/:studentId')
    .delete(authorize(...CRUD_ROLES), removeEnrollment);

// ═══════════════════════════════════════════════════════════════════════════════
// SPECIAL TRIPS  —  /transport/trips
// ═══════════════════════════════════════════════════════════════════════════════

router
    .route('/trips')
    .get(authorize(...READ_ROLES), getAllTrips)
    .post(authorize(...CRUD_ROLES), createTrip);

router
    .route('/trips/:id')
    .put(authorize(...CRUD_ROLES), updateTrip)
    .delete(authorize(...CRUD_ROLES), deleteTrip);

module.exports = router;
