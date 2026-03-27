/**
 * financeController.js
 *
 * HTTP request/response handling for the Finance module (2.1 – 2.9).
 *
 * Each handler follows the same three-step pattern:
 *   1. Validate input with Joi
 *   2. Delegate to financeService
 *   3. Send a standardised response via sendSuccess
 *
 * No business logic or DB access lives here.
 *
 * Role access matrix (enforced on routes, documented here for clarity):
 * ┌──────────────────────────────────────┬──────────────────────────────────────┐
 * │ Route                                │ Allowed roles                        │
 * ├──────────────────────────────────────┼──────────────────────────────────────┤
 * │ GET  /finance/summary                │ super_admin, accountant, admin,      │
 * │                                      │ principal                            │
 * │ GET  /finance/fees                   │ super_admin, accountant, admin,      │
 * │                                      │ principal                            │
 * │ GET  /finance/fees/:studentId        │ super_admin, accountant, admin,      │
 * │                                      │ principal                            │
 * │ POST /finance/payments               │ super_admin, accountant              │
 * │ GET  /finance/payments               │ super_admin, accountant, admin,      │
 * │                                      │ principal                            │
 * │ GET  /finance/invoices               │ super_admin, accountant, admin,      │
 * │                                      │ principal                            │
 * │ GET  /finance/invoices/:invoiceId    │ super_admin, accountant, admin,      │
 * │                                      │ principal                            │
 * │ POST /finance/invoices/generate      │ super_admin, accountant              │
 * │ POST /finance/invoices/:id/send      │ super_admin, accountant              │
 * └──────────────────────────────────────┴──────────────────────────────────────┘
 *
 * From the API spec Role Access Summary:
 *   super_admin → Full CRUD
 *   admin       → Read only
 *   principal   → Read only
 *   accountant  → Full CRUD
 *   teacher     → No access
 */

const asyncHandler    = require('../middleware/asyncHandler');
const ErrorResponse   = require('../utils/errorResponse');
const { sendSuccess } = require('../utils/sendResponse');
const financeService  = require('../services/financeService');

const {
    validate,
    summaryQuerySchema,
    feeRecordQuerySchema,
    studentFeeQuerySchema,
    recordPaymentSchema,
    paymentQuerySchema,
    invoiceQuerySchema,
    generateInvoicesSchema,
} = require('../helpers/financeValidations');

// ─── Helper ───────────────────────────────────────────────────────────────────

const extractJoiErrors = (joiError) =>
    joiError.details.map((d) => ({
        field:   d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
    }));

// ═══════════════════════════════════════════════════════════════════════════════
// 2.1  GET /finance/summary
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Get finance dashboard summary metrics
 * @route   GET /api/v1/finance/summary
 * @access  super_admin | accountant | admin | principal
 */
exports.getFinanceSummary = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(summaryQuerySchema, req.query);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await financeService.getFinanceSummary(value);
    sendSuccess(res, 200, '', result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2.2  GET /finance/fees
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Get all fee records (paginated + filtered)
 * @route   GET /api/v1/finance/fees
 * @access  super_admin | accountant | admin | principal
 */
exports.getAllFeeRecords = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(feeRecordQuerySchema, req.query);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await financeService.getAllFeeRecords(value);
    sendSuccess(res, 200, '', result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2.3  GET /finance/fees/:studentId
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Get a single student's full fee record and payment history
 * @route   GET /api/v1/finance/fees/:studentId
 * @access  super_admin | accountant | admin | principal
 */
exports.getStudentFeeRecord = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(studentFeeQuerySchema, req.query);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await financeService.getStudentFeeRecord(
        req.params.studentId,
        value.term
    );
    sendSuccess(res, 200, '', result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2.4  POST /finance/payments
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Record a new fee payment for a student
 * @route   POST /api/v1/finance/payments
 * @access  super_admin | accountant
 */
exports.recordPayment = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(recordPaymentSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await financeService.recordPayment(value, req.user.id);
    sendSuccess(res, 201, 'Payment recorded successfully', result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2.5  GET /finance/payments
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Get all payment transactions (paginated + filtered)
 * @route   GET /api/v1/finance/payments
 * @access  super_admin | accountant | admin | principal
 */
exports.getAllPayments = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(paymentQuerySchema, req.query);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await financeService.getAllPayments(value);
    sendSuccess(res, 200, '', result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2.6  GET /finance/invoices
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Get all invoices (paginated + filtered)
 * @route   GET /api/v1/finance/invoices
 * @access  super_admin | accountant | admin | principal
 */
exports.getAllInvoices = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(invoiceQuerySchema, req.query);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await financeService.getAllInvoices(value);
    sendSuccess(res, 200, '', result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2.7  GET /finance/invoices/:invoiceId
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Get a single invoice with line items and payment history
 * @route   GET /api/v1/finance/invoices/:invoiceId
 * @access  super_admin | accountant | admin | principal
 */
exports.getInvoice = asyncHandler(async (req, res) => {
    const result = await financeService.getInvoice(req.params.invoiceId);
    sendSuccess(res, 200, '', result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2.8  POST /finance/invoices/generate
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Bulk-generate invoices for all active students for a given term
 * @route   POST /api/v1/finance/invoices/generate
 * @access  super_admin | accountant
 */
exports.generateInvoices = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(generateInvoicesSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await financeService.generateInvoices(value, req.user.id);
    sendSuccess(res, 200, 'Invoices generated successfully', result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2.9  POST /finance/invoices/:invoiceId/send
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Send an invoice PDF to the parent's correspondence email
 * @route   POST /api/v1/finance/invoices/:invoiceId/send
 * @access  super_admin | accountant
 */
exports.sendInvoiceToParent = asyncHandler(async (req, res) => {
    const result = await financeService.sendInvoiceToParent(req.params.invoiceId);
    sendSuccess(res, 200, 'Invoice sent to parent successfully', result);
});
