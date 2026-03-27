/**
 * studentRoutes.js
 *
 * Mounts all Student module routes with:
 *   - JWT authentication via `protect`
 *   - Fine-grained role guards via `authorize`
 *
 * Role access matrix (from API spec):
 * ┌──────────────┬────────────────────────────────────────────────────────────┐
 * │ Route        │ Allowed roles                                              │
 * ├──────────────┼────────────────────────────────────────────────────────────┤
 * │ GET    /     │ super_admin, admin, principal                              │
 * │ GET    /:id  │ super_admin, admin, principal                              │
 * │ POST   /     │ super_admin, admin                                         │
 * │ PUT    /:id  │ super_admin, admin                                         │
 * │ DELETE /:id  │ super_admin, admin                                         │
 * │ PATCH  /:id/status   │ super_admin, admin                                │
 * │ POST   /promote      │ super_admin, admin                                │
 * │ GET    /:id/attendance │ super_admin, admin, principal                  │
 * └──────────────┴────────────────────────────────────────────────────────────┘
 *
 * Mount in server.js:
 *   app.use('/api/v1/students', require('./routes/studentRoutes'));
 */

const express = require('express');
const router  = express.Router();

const { protect, authorize, ROLES } = require('../middleware/auth');
const {
    getAllStudents,
    getStudent,
    addStudent,
    updateStudent,
    deleteStudent,
    updateStudentStatus,
    promoteStudents,
    getAttendanceSummary,
} = require('../controllers/studentController');

// ─── Role groups (convenience aliases for this module) ────────────────────────

/** Full CRUD access */
const CRUD_ROLES   = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

/** Read-only access */
const READ_ROLES   = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRINCIPAL];

// ─── Apply JWT guard to all routes below ─────────────────────────────────────

router.use(protect);

// ─── Static / collection routes ──────────────────────────────────────────────

// POST /promote  — must be declared BEFORE /:id to avoid route shadowing
router.post('/promote', authorize(...CRUD_ROLES), promoteStudents);

// GET  /
// POST /
router
    .route('/')
    .get(authorize(...READ_ROLES), getAllStudents)
    .post(authorize(...CRUD_ROLES), addStudent);

// ─── Individual student routes ────────────────────────────────────────────────

// GET    /:id/attendance
router.get('/:id/attendance', authorize(...READ_ROLES), getAttendanceSummary);

// PATCH  /:id/status
router.patch('/:id/status', authorize(...CRUD_ROLES), updateStudentStatus);

// GET    /:id
// PUT    /:id
// DELETE /:id
router
    .route('/:id')
    .get(authorize(...READ_ROLES), getStudent)
    .put(authorize(...CRUD_ROLES), updateStudent)
    .delete(authorize(...CRUD_ROLES), deleteStudent);

module.exports = router;
