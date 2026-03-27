/**
 * routes/settingsRoutes.js
 *
 * All Settings module routes with JWT + role guards (5.1 – 5.13).
 *
 * Role access matrix (per API spec Role Access Summary):
 *
 * ┌─────────────────────────────────────────────────────┬───────────────────────────┐
 * │ Route                                               │ Allowed roles             │
 * ├─────────────────────────────────────────────────────┼───────────────────────────┤
 * │ GET    /settings/school                             │ super_admin               │
 * │ PUT    /settings/school                             │ super_admin               │
 * │ GET    /settings/academic                           │ super_admin               │
 * │ PATCH  /settings/academic/session                   │ super_admin               │
 * │ POST   /settings/academic/terms                     │ super_admin               │
 * │ PUT    /settings/academic/terms/:id                 │ super_admin               │
 * │ DELETE /settings/academic/terms/:id                 │ super_admin               │
 * │ PATCH  /settings/academic/terms/:id/set-current     │ super_admin               │
 * │ GET    /settings/notifications                      │ super_admin               │
 * │ PUT    /settings/notifications                      │ super_admin               │
 * │ GET    /settings/security                           │ super_admin               │
 * │ PUT    /settings/security                           │ super_admin               │
 * │ POST   /settings/security/force-password-reset      │ super_admin               │
 * │ POST   /settings/security/clear-sessions            │ super_admin               │
 * └─────────────────────────────────────────────────────┴───────────────────────────┘
 *
 * Notes:
 *   - admin, principal, accountant, and teacher have NO access.
 *   - Every route is protected by both `protect` (JWT check) and
 *     `authorize(ROLES.SUPER_ADMIN)` (role check).
 *
 * ⚠️  Route ordering:
 *   Static sub-paths declared BEFORE parameterised ones:
 *     /academic/session           → before /academic/terms/:id
 *     /security/force-password-reset → before /security/clear-sessions
 *     /academic/terms/:id/set-current → after /academic/terms (POST)
 *
 * Mount in server.js:
 *   app.use('/api/v1/settings', require('./routes/settingsRoutes'));
 */

const express = require('express');

const router = express.Router();

const { protect, authorize, ROLES } = require('../middleware/auth');
const {
    getSchoolInfo,
    updateSchoolInfo,
    getAcademicSettings,
    updateAcademicSession,
    createTerm,
    updateTerm,
    deleteTerm,
    setCurrentTerm,
    getNotificationSettings,
    updateNotificationSettings,
    getSecuritySettings,
    updateSecuritySettings,
    forcePasswordReset,
    clearAllSessions,
} = require('../controllers/settingsController');

// ─── Apply JWT + super_admin guard to every route ────────────────────────────

router.use(protect);
router.use(authorize(ROLES.SUPER_ADMIN));

// ═══════════════════════════════════════════════════════════════════════════════
// SCHOOL INFO  —  /settings/school
// ═══════════════════════════════════════════════════════════════════════════════

router
    .route('/school')
    .get(getSchoolInfo)
    .put(updateSchoolInfo);

// ═══════════════════════════════════════════════════════════════════════════════
// ACADEMIC  —  /settings/academic
// ═══════════════════════════════════════════════════════════════════════════════

// GET /academic — full session + terms list
router.get('/academic', getAcademicSettings);

// PATCH /academic/session — update session string
// ⚠️  Declared BEFORE /academic/terms to avoid route confusion
router.patch('/academic/session', updateAcademicSession);

// POST /academic/terms — create new term
router.post('/academic/terms', createTerm);

// PATCH /academic/terms/:id/set-current — mark a term as current
// ⚠️  Declared BEFORE /academic/terms/:id to prevent Express matching
//     "set-current" as a second :id segment in a chained route
router.patch('/academic/terms/:id/set-current', setCurrentTerm);

// PUT    /academic/terms/:id — update a term
// DELETE /academic/terms/:id — delete a term
router
    .route('/academic/terms/:id')
    .put(updateTerm)
    .delete(deleteTerm);

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS  —  /settings/notifications
// ═══════════════════════════════════════════════════════════════════════════════

router
    .route('/notifications')
    .get(getNotificationSettings)
    .put(updateNotificationSettings);

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY  —  /settings/security
// ═══════════════════════════════════════════════════════════════════════════════

// ⚠️  Static sub-routes MUST be declared before the base /security route
//     to avoid Express matching "force-password-reset" as a path suffix
//     on the GET handler.

// POST /security/force-password-reset
router.post('/security/force-password-reset', forcePasswordReset);

// POST /security/clear-sessions
router.post('/security/clear-sessions', clearAllSessions);

// GET /security  |  PUT /security
router
    .route('/security')
    .get(getSecuritySettings)
    .put(updateSecuritySettings);

module.exports = router;
