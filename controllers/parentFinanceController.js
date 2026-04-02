/**
 * controllers/parentFinanceController.js
 *
 * Thin HTTP layer for the Parent Finance module (8.1 – 8.4).
 * All business logic lives in parentFinanceService.js.
 */

const asyncHandler          = require('../middleware/asyncHandler');
const { sendSuccess }       = require('../utils/sendResponse');
const parentFinanceService  = require('../services/parentFinanceService');

// ─── 8.1  GET /parent/children/:id/fees ──────────────────────────────────────

/**
 * @desc    Fee record, line items, and payment history for a single child
 * @route   GET /api/v1/parent/children/:id/fees
 * @access  parent
 */
exports.getChildFeeRecord = asyncHandler(async (req, res) => {
    const result = await parentFinanceService.getChildFeeRecord(
        req.params.id,
        req.parent.linkedStudentIds,
        req.query
    );
    sendSuccess(res, 200, '', result);
});

// ─── 8.2  GET /parent/fees ────────────────────────────────────────────────────

/**
 * @desc    Aggregated fee summary across all children
 * @route   GET /api/v1/parent/fees
 * @access  parent
 */
exports.getAllChildrenFees = asyncHandler(async (req, res) => {
    console.log({linkedStudentIds: req.parent.linkedStudentIds, query: req.query})
    const result = await parentFinanceService.getAllChildrenFees(
        req.parent.linkedStudentIds,
        req.query
    );
    sendSuccess(res, 200, '', result);
});

// ─── 8.3  GET /parent/invoices ────────────────────────────────────────────────

/**
 * @desc    Paginated invoice list across all children
 * @route   GET /api/v1/parent/invoices
 * @access  parent
 */
exports.listInvoices = asyncHandler(async (req, res) => {
    const result = await parentFinanceService.listInvoices(
        req.parent.linkedStudentIds,
        req.query
    );
    sendSuccess(res, 200, '', result);
});

// ─── 8.4  GET /parent/invoices/:invoiceId ────────────────────────────────────

/**
 * @desc    Full detail for a single invoice
 * @route   GET /api/v1/parent/invoices/:invoiceId
 * @access  parent
 */
exports.getInvoice = asyncHandler(async (req, res) => {
    const result = await parentFinanceService.getInvoice(
        req.params.invoiceId,
        req.parent.linkedStudentIds
    );
    sendSuccess(res, 200, '', result);
});
