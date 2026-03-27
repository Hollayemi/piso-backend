/**
 * financeRoutes.js
 *
 * All Finance module routes with JWT + role guards (2.1 – 2.9).
 *
 * Role access matrix (per API spec Role Access Summary):
 *
 * ┌──────────────────────────────────────────────┬──────────────────────────────────────────────────────────┐
 * │ Route                                        │ Allowed roles                                            │
 * ├──────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
 * │ GET  /finance/summary                        │ super_admin, accountant, admin, principal                │
 * │ GET  /finance/fees                           │ super_admin, accountant, admin, principal                │
 * │ GET  /finance/fees/:studentId                │ super_admin, accountant, admin, principal                │
 * │ POST /finance/payments                       │ super_admin, accountant                                  │
 * │ GET  /finance/payments                       │ super_admin, accountant, admin, principal                │
 * │ POST /finance/invoices/generate              │ super_admin, accountant                                  │
 * │ POST /finance/invoices/:invoiceId/send       │ super_admin, accountant                                  │
 * │ GET  /finance/invoices                       │ super_admin, accountant, admin, principal                │
 * │ GET  /finance/invoices/:invoiceId            │ super_admin, accountant, admin, principal                │
 * └──────────────────────────────────────────────┴──────────────────────────────────────────────────────────┘
 *
 * Notes on role mapping:
 *   - teacher has NO access to any Finance endpoint.
 *   - admin is READ ONLY for finance (cannot record payments or generate invoices).
 *   - principal is READ ONLY.
 *   - accountant has FULL CRUD — this is their core function.
 *   - super_admin has FULL CRUD.
 *
 * ⚠️  Route ordering:
 *   POST /invoices/generate     → declared BEFORE GET /invoices/:invoiceId
 *   POST /invoices/:id/send     → comes after /generate (no conflict: different methods)
 *   GET  /fees                  → declared BEFORE GET /fees/:studentId (no conflict: same method
 *                                  but Express matches by specificity)
 *
 * Mount in server.js:
 *   app.use('/api/v1/finance', require('./routes/financeRoutes'));
 */

const express = require('express');

const router = express.Router();

const { protect, authorize, ROLES } = require('../middleware/auth');
const {
    getFinanceSummary,
    getAllFeeRecords,
    getStudentFeeRecord,
    recordPayment,
    getAllPayments,
    getAllInvoices,
    getInvoice,
    generateInvoices,
    sendInvoiceToParent,
} = require('../controllers/financeController');

// ─── Role groups ──────────────────────────────────────────────────────────────

/**
 * Full CRUD — super_admin + accountant.
 * Accountant override: although the global matrix marks accountant as
 * read-only for most modules, Finance CRUD is their core function.
 */
const WRITE_ROLES = [ROLES.SUPER_ADMIN, ROLES.ACCOUNTANT];

/**
 * Read access — all roles except teacher.
 * admin and principal can VIEW all finance data.
 */
const READ_ROLES = [ROLES.SUPER_ADMIN, ROLES.ACCOUNTANT, ROLES.ADMIN, ROLES.PRINCIPAL];

// ─── Apply JWT guard to every route in this router ───────────────────────────

router.use(protect);

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

// GET /summary
router.get('/summary', authorize(...READ_ROLES), getFinanceSummary);

// ═══════════════════════════════════════════════════════════════════════════════
// FEE RECORDS  —  /finance/fees
// ═══════════════════════════════════════════════════════════════════════════════

router
    .route('/fees')
    .get(authorize(...READ_ROLES), getAllFeeRecords);

router
    .route('/fees/:studentId')
    .get(authorize(...READ_ROLES), getStudentFeeRecord);

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENTS  —  /finance/payments
// ═══════════════════════════════════════════════════════════════════════════════

router
    .route('/payments')
    .get(authorize(...READ_ROLES),  getAllPayments)
    .post(authorize(...WRITE_ROLES), recordPayment);

// ═══════════════════════════════════════════════════════════════════════════════
// INVOICES  —  /finance/invoices
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️  Route ordering:
 *   POST /invoices/generate      → must be declared BEFORE GET/POST /invoices/:invoiceId
 *     to prevent Express matching the literal string "generate" as an :invoiceId param.
 *
 *   POST /invoices/:invoiceId/send → no shadowing risk (distinct sub-path)
 */

// POST /invoices/generate
router.post('/invoices/generate', authorize(...WRITE_ROLES), generateInvoices);

// POST /invoices/:invoiceId/send
router.post('/invoices/:invoiceId/send', authorize(...WRITE_ROLES), sendInvoiceToParent);

// GET  /invoices
// (no POST /invoices — invoices are generated in bulk, not created individually)
router.get('/invoices', authorize(...READ_ROLES), getAllInvoices);

// GET  /invoices/:invoiceId
router.get('/invoices/:invoiceId', authorize(...READ_ROLES), getInvoice);

module.exports = router;
