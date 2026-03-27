/**
 * academicsRoutes.js
 *
 * All Academics module routes with JWT + role guards.
 *
 * Role access matrix (from API spec § Role Access Summary):
 * ┌──────────────────────────────────────────────┬──────────────────────────────────────────────────────────────┐
 * │ Route                                        │ Allowed roles                                                │
 * ├──────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
 * │ GET    /classes                              │ super_admin, admin, principal, teacher                       │
 * │ GET    /classes/:id                          │ super_admin, admin, principal, teacher                       │
 * │ POST   /classes                              │ super_admin, admin                                           │
 * │ PUT    /classes/:id                          │ super_admin, admin                                           │
 * │ DELETE /classes/:id                          │ super_admin, admin                                           │
 * ├──────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
 * │ GET    /subjects                             │ super_admin, admin, principal, teacher                       │
 * │ GET    /subjects/:id                         │ super_admin, admin, principal, teacher                       │
 * │ POST   /subjects                             │ super_admin, admin                                           │
 * │ PUT    /subjects/:id                         │ super_admin, admin                                           │
 * │ DELETE /subjects/:id                         │ super_admin, admin                                           │
 * ├──────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
 * │ GET    /timetable/:className                 │ super_admin, admin, principal, teacher                       │
 * │ PUT    /timetable/:className/cell            │ super_admin, admin                                           │
 * │ DELETE /timetable/:className/cell            │ super_admin, admin                                           │
 * │ DELETE /timetable/:className                 │ super_admin, admin                                           │
 * └──────────────────────────────────────────────┴──────────────────────────────────────────────────────────────┘
 *
 * Note — accountant role:
 *   accountant has NO access to any Academics endpoint (per spec).
 *   The role is intentionally omitted from every authorize() call.
 *
 * ⚠️  Route ordering — more specific paths declared BEFORE parameterised ones:
 *       DELETE /timetable/:className/cell  → before  DELETE /timetable/:className
 *
 * Mount in server.js:
 *   app.use('/api/v1/academics', require('./routes/academicsRoutes'));
 */

const express = require('express');
const router  = express.Router();

const { protect, authorize, ROLES } = require('../middleware/auth');
const {
    getAllClasses,
    getClass,
    createClass,
    updateClass,
    deleteClass,
    getAllSubjects,
    getSubject,
    createSubject,
    updateSubject,
    deleteSubject,
    getTimetable,
    saveTimetableCell,
    clearTimetableCell,
    clearFullTimetable,
} = require('../controllers/academicsController');

// ─── Role groups ──────────────────────────────────────────────────────────────

/** Full CRUD on all academic resources */
const CRUD_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

/**
 * Read-only access to Classes, Subjects, and Timetable.
 * principal + teacher can view; accountant has no access here.
 */
const READ_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.TEACHER];

// ─── Apply JWT guard to every route in this router ───────────────────────────

router.use(protect);

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSES  —  /academics/classes
// ═══════════════════════════════════════════════════════════════════════════════

router
    .route('/classes')
    .get(authorize(...READ_ROLES), getAllClasses)
    .post(authorize(...CRUD_ROLES), createClass);

router
    .route('/classes/:id')
    .get(authorize(...READ_ROLES), getClass)
    .put(authorize(...CRUD_ROLES), updateClass)
    .delete(authorize(...CRUD_ROLES), deleteClass);

// ═══════════════════════════════════════════════════════════════════════════════
// SUBJECTS  —  /academics/subjects
// ═══════════════════════════════════════════════════════════════════════════════

router
    .route('/subjects')
    .get(authorize(...READ_ROLES), getAllSubjects)
    .post(authorize(...CRUD_ROLES), createSubject);

router
    .route('/subjects/:id')
    .get(authorize(...READ_ROLES), getSubject)
    .put(authorize(...CRUD_ROLES), updateSubject)
    .delete(authorize(...CRUD_ROLES), deleteSubject);

// ═══════════════════════════════════════════════════════════════════════════════
// TIMETABLE  —  /academics/timetable
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️  Cell-level routes MUST come before the class-level route
 *     to prevent Express matching "cell" as a :className value.
 *
 *   PUT    /timetable/:className/cell  → assign a slot
 *   DELETE /timetable/:className/cell  → clear a single slot
 *   GET    /timetable/:className       → get full timetable grid
 *   DELETE /timetable/:className       → clear entire timetable
 */

router
    .route('/timetable/:className/cell')
    .put(authorize(...CRUD_ROLES), saveTimetableCell)
    .delete(authorize(...CRUD_ROLES), clearTimetableCell);

router
    .route('/timetable/:className')
    .get(authorize(...READ_ROLES), getTimetable)
    .delete(authorize(...CRUD_ROLES), clearFullTimetable);

module.exports = router;
