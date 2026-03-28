/**
 * admissionRoutes.js
 *
 * All Admissions module routes with JWT + role guards.
 *
 * Role access matrix (per API spec Role Access Summary):
 *
 * ┌──────────────────────────────────────────────┬────────────────────────────────────────────────────┐
 * │ Route                                        │ Allowed roles                                      │
 * ├──────────────────────────────────────────────┼────────────────────────────────────────────────────┤
 * │ POST   /admissions           (submit)        │ PUBLIC — no auth required                          │
 * │ GET    /admissions/stats                     │ super_admin, admin, principal                       │
 * │ GET    /admissions/screening                 │ super_admin, admin, principal                       │
 * │ GET    /admissions/offers                    │ super_admin, admin, principal                       │
 * │ GET    /admissions                           │ super_admin, admin, principal                       │
 * │ GET    /admissions/:id                       │ super_admin, admin, principal                       │
 * │ PATCH  /admissions/:id/status                │ super_admin, admin                                  │
 * │ DELETE /admissions/:id                       │ super_admin, admin                                  │
 * │ PUT    /admissions/:id/screening             │ super_admin, admin                                  │
 * │ POST   /admissions/:id/offer                 │ super_admin, admin                                  │
 * │ PATCH  /admissions/:id/offer/status          │ super_admin, admin                                  │
 * └──────────────────────────────────────────────┴────────────────────────────────────────────────────┘
 *
 * Notes:
 *   - accountant has NO access to any Admissions endpoint.
 *   - teacher    has NO access to any Admissions endpoint.
 *   - principal  is READ ONLY.
 *   - admin has FULL CRUD.
 *   - super_admin has FULL CRUD.
 *
 * ⚠️  Route ordering — static segments BEFORE parameterised ones:
 *       /admissions/stats      → before /admissions/:id
 *       /admissions/screening  → before /admissions/:id
 *       /admissions/offers     → before /admissions/:id
 *       /admissions/:id/offer/status → before /admissions/:id/offer
 *
 * Mount in server.js:
 *   app.use('/api/v1/admissions', require('./routes/admissionRoutes'));
 */

const express = require('express');
const router  = express.Router();

const { protect, authorize, ROLES } = require('../middleware/auth');

const {
    validateSubmitApplication,
    validateUpdateApplicationStatus,
    validateUpdateScreeningRecord,
    validateSendOfferLetter,
    validateUpdateOfferAcceptanceStatus,
} = require('../helpers/admissionValidator');

const {
    getAllApplications,
    getApplication,
    submitApplication,
    updateApplicationStatus,
    deleteApplication,
    getScreeningList,
    updateScreeningRecord,
    getOffersList,
    sendOfferLetter,
    updateOfferAcceptanceStatus,
    getAdmissionsStats,
} = require('../controllers/admissionController');

// ─── Role groups ──────────────────────────────────────────────────────────────

/** Full CRUD on admission resources */
const CRUD_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

/** Read access — all roles except accountant and teacher */
const READ_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRINCIPAL];

// ─── PUBLIC — no auth ─────────────────────────────────────────────────────────

// POST /admissions  — public application submission
router.post('/', validateSubmitApplication, submitApplication);

// ─── Protected routes ─────────────────────────────────────────────────────────

router.use(protect);

// ─── Static sub-routes — declared BEFORE /:id ────────────────────────────────

// GET  /admissions/stats
router.get('/stats', authorize(...READ_ROLES), getAdmissionsStats);

// GET  /admissions/screening
router.get('/screening', authorize(...READ_ROLES), getScreeningList);

// GET  /admissions/offers
router.get('/offers', authorize(...READ_ROLES), getOffersList);

// ─── Collection ───────────────────────────────────────────────────────────────

// GET  /admissions
router.get('/', authorize(...READ_ROLES), getAllApplications);

// ─── Individual application ───────────────────────────────────────────────────

// PATCH  /admissions/:id/offer/status
// ⚠️  Must come BEFORE /:id/offer to prevent "status" being matched as :id
router.patch(
    '/:id/offer/status',
    authorize(...CRUD_ROLES),
    validateUpdateOfferAcceptanceStatus,
    updateOfferAcceptanceStatus
);

// POST   /admissions/:id/offer
router.post(
    '/:id/offer',
    authorize(...CRUD_ROLES),
    validateSendOfferLetter,
    sendOfferLetter
);

// PATCH  /admissions/:id/status
router.patch(
    '/:id/status',
    authorize(...CRUD_ROLES),
    validateUpdateApplicationStatus,
    updateApplicationStatus
);

// PUT    /admissions/:id/screening
router.put(
    '/:id/screening',
    authorize(...CRUD_ROLES),
    validateUpdateScreeningRecord,
    updateScreeningRecord
);

// GET    /admissions/:id
router.get('/:id', authorize(...READ_ROLES), getApplication);

// DELETE /admissions/:id
router.delete('/:id', authorize(...CRUD_ROLES), deleteApplication);

module.exports = router;
