/**
 * routes/eventRoutes.js
 *
 * All Events module routes with JWT + role guards.
 *
 * Role access matrix:
 * ┌──────────────────────────────────────────────┬───────────────────────────────────────────────────┐
 * │ Route                                        │ Allowed roles                                     │
 * ├──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 * │ GET    /events                               │ All authenticated (staff + parent)                │
 * │ GET    /events/:id                           │ All authenticated (staff + parent)                │
 * │ POST   /events                               │ super_admin, admin, principal                     │
 * │ PUT    /events/:id                           │ super_admin, admin, principal                     │
 * │ DELETE /events/:id                           │ super_admin, admin                                │
 * │ POST   /events/:id/notify                    │ super_admin, admin, principal                     │
 * └──────────────────────────────────────────────┴───────────────────────────────────────────────────┘
 *
 * Notes:
 *   - teacher, accountant, and parent can read events but cannot create/edit/delete.
 *   - The notify route pushes a broadcast to all parents.
 *
 * ⚠️  Route ordering:
 *   POST /events/:id/notify  → declared BEFORE /:id to avoid shadowing
 *   (not strictly necessary with different HTTP methods, but explicit is clearer)
 *
 * Mount in server.js:
 *   app.use('/api/v1/events', require('./routes/eventRoutes'));
 */

const express = require('express');
const router  = express.Router();

const { protect, authorize, ROLES } = require('../middleware/auth');
const {
    getAllEvents,
    getEvent,
    createEvent,
    updateEvent,
    deleteEvent,
    notifyParents,
} = require('../controllers/eventController');

// ─── Role groups ──────────────────────────────────────────────────────────────

/**
 * Full CRUD on events — principal can also create/edit events (school notices).
 */
const WRITE_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRINCIPAL];

/**
 * Delete is more destructive — restricted to admin and super_admin only.
 */
const DELETE_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

/**
 * All authenticated staff roles + parent.
 * We allow the parent role through here so the parent portal can
 * call the same events endpoint.
 */
const READ_ROLES = [
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.PRINCIPAL,
    ROLES.ACCOUNTANT,
    ROLES.TEACHER,
    'parent',
];

// ─── Apply JWT guard to all routes ────────────────────────────────────────────

router.use(protect);

// ─── POST /events/:id/notify — declared BEFORE GET /:id ──────────────────────
// ⚠️  Though Express won't confuse POST vs GET, placing specific sub-routes
//     before the base param route is a good defensive habit.

router.post('/:id/notify', authorize(...WRITE_ROLES), notifyParents);

// ─── Collection ───────────────────────────────────────────────────────────────

router
    .route('/')
    .get(authorize(...READ_ROLES),   getAllEvents)
    .post(authorize(...WRITE_ROLES), createEvent);

// ─── Individual event ─────────────────────────────────────────────────────────

router
    .route('/:id')
    .get(authorize(...READ_ROLES),    getEvent)
    .put(authorize(...WRITE_ROLES),   updateEvent)
    .delete(authorize(...DELETE_ROLES), deleteEvent);

module.exports = router;
