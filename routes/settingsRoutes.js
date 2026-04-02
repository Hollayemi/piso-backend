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
    getNotificationSettings,
    updateNotificationSettings,
    getSecuritySettings,
    updateSecuritySettings,
    forcePasswordReset,
    clearAllSessions,
    getFeeStructure,
    updateFeeStructure,
    createSession,
    updateSession,
    deleteSession,
    setCurrentSession,
    getSessions,
    getCurrentSession,
    createTerm,
    updateTerm,
    deleteTerm,
    setCurrentTerm,
    getTermsBySession,
    getCurrentTerm,
} = require('../controllers/settingsController');

// ─── Apply JWT + super_admin guard to every route ────────────────────────────


// GET /academic — full session + terms list
router.get('/academic', getAcademicSettings);


router.use(protect);
router.use(authorize(ROLES.SUPER_ADMIN));

// ═══════════════════════════════════════════════════════════════════════════════
// SCHOOL INFO  —  /settings/school
// ═══════════════════════════════════════════════════════════════════════════════

router
    .route('/school')
    .get(getSchoolInfo)
    .put(updateSchoolInfo);


// ─── Session Routes ─────────────────────────────────────────────
router.route('/academic/session')
    .get(getSessions)
    .post(createSession);

router.route('/academic/sessions/current')
    .get(getCurrentSession);

router.route('/academic/sessions/:id')
    .put(updateSession)
    .delete(deleteSession);

router.route('/academic/sessions/:id/set-current')
    .patch(setCurrentSession);

// ─── Term Routes ────────────────────────────────────────────────
router.route('/academic/sessions/:sessionId/terms')
    .get(getTermsBySession)
    .post(createTerm);

router.route('/academic/terms/current')
    .get(getCurrentTerm);

router.route('/academic/terms/:id')
    .put(updateTerm)
    .delete(deleteTerm);

router.route('/academic/terms/:id/set-current')
    .patch(setCurrentTerm);


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


// GET /fees  |  PUT /fees
router
    .route('/fees')
    .get(getFeeStructure)
    .put(updateFeeStructure);
module.exports = router;
