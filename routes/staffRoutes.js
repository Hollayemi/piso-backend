/**
 * staffRoutes.js
 *
 * All Staff module routes with JWT + role guards.
 *
 * Role access matrix:
 * ┌─────────────────────────────────────────┬──────────────────────────────────────────────────────────────┐
 * │ Route                                   │ Allowed roles                                                │
 * ├─────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
 * │ GET    /staff                           │ super_admin, admin, principal, accountant                    │
 * │ GET    /staff/:id                       │ super_admin, admin, principal, accountant                    │
 * │ POST   /staff                           │ super_admin, admin                                           │
 * │ PUT    /staff/:id                       │ super_admin, admin                                           │
 * │ DELETE /staff/:id                       │ super_admin, admin                                           │
 * │ PATCH  /staff/:id/status                │ super_admin, admin                                           │
 * │ GET    /staff/payroll                   │ super_admin, admin, accountant                               │
 * │ POST   /staff/payroll/batch-process     │ super_admin, admin, accountant                               │
 * │ POST   /staff/payroll/:staffId/process  │ super_admin, admin, accountant                               │
 * │ GET    /staff/payroll/:staffId/payslip  │ super_admin, admin, accountant, principal                    │
 * └─────────────────────────────────────────┴──────────────────────────────────────────────────────────────┘
 *
 * Note on accountant payroll write access:
 *   The global role matrix marks accountant as "read only" for Staff.
 *   Payroll processing is however accountant's core function, so write
 *   access to payroll endpoints is intentionally granted here, overriding
 *   the general read-only restriction for that specific sub-resource.
 *
 * Mount in server.js:
 *   app.use('/api/v1/staff', require('./routes/staffRoutes'));
 *
 * ⚠️  Route ordering — static segments MUST come before parameterised ones:
 *       /payroll               → before  /:id
 *       /payroll/batch-process → before  /payroll/:staffId/...
 */

const express = require('express');
const router  = express.Router();

const { protect, authorize, ROLES } = require('../middleware/auth');
const {
    getAllStaff,
    getStaff,
    addStaff,
    updateStaff,
    deleteStaff,
    updateStaffStatus,
    getPayrollList,
    processPayroll,
    batchProcessPayroll,
    getPayslip,
} = require('../controllers/staffController');

// ─── Role groups ──────────────────────────────────────────────────────────────

/** Staff CRUD — super_admin and admin only */
const CRUD_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

/** Staff read — all except teacher */
const READ_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.ACCOUNTANT];

/** Payroll read — super_admin, admin, accountant */
const PAYROLL_READ_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ACCOUNTANT];

/** Payslip read — adds principal (can view but not process) */
const PAYSLIP_READ_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ACCOUNTANT, ROLES.PRINCIPAL];

/** Payroll write — super_admin, admin, accountant */
const PAYROLL_WRITE_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ACCOUNTANT];

// ─── Apply JWT guard to every route ──────────────────────────────────────────

router.use(protect);

// ─── Payroll sub-routes  (declared BEFORE /:id to prevent shadowing) ─────────

// GET    /payroll
router.get('/payroll', authorize(...PAYROLL_READ_ROLES), getPayrollList);

// POST   /payroll/batch-process  (must come before /payroll/:staffId/...)
router.post('/payroll/batch-process', authorize(...PAYROLL_WRITE_ROLES), batchProcessPayroll);

// POST   /payroll/:staffId/process
router.post('/payroll/:staffId/process', authorize(...PAYROLL_WRITE_ROLES), processPayroll);

// GET    /payroll/:staffId/payslip
router.get('/payroll/:staffId/payslip', authorize(...PAYSLIP_READ_ROLES), getPayslip);

// ─── Collection routes ────────────────────────────────────────────────────────

// GET  /
// POST /
router
    .route('/')
    .get(authorize(...READ_ROLES),  getAllStaff)
    .post(authorize(...CRUD_ROLES), addStaff);

// ─── Individual staff routes ──────────────────────────────────────────────────

// PATCH  /:id/status  (before /:id to avoid "status" being parsed as an id segment — not needed
//                      here since PATCH is a distinct method, but declared first for clarity)
router.patch('/:id/status', authorize(...CRUD_ROLES), updateStaffStatus);

// GET    /:id
// PUT    /:id
// DELETE /:id
router
    .route('/:id')
    .get(authorize(...READ_ROLES),  getStaff)
    .put(authorize(...CRUD_ROLES),  updateStaff)
    .delete(authorize(...CRUD_ROLES), deleteStaff);

module.exports = router;
