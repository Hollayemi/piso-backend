/**
 * staffController.js
 *
 * HTTP request/response handling for the Staff module (2.1 – 2.10).
 *
 * Each handler follows the same three-step pattern:
 *   1. Validate input (Joi)
 *   2. Delegate to staffService
 *   3. Send standardised response via sendSuccess
 *
 * No business logic or DB access lives here.
 */

const asyncHandler  = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const { sendSuccess } = require('../utils/sendResponse');
const staffService  = require('../services/staffService');
const {
    createStaffSchema,
    updateStaffSchema,
    updateStaffStatusSchema,
    payrollQuerySchema,
    processPayrollSchema,
    batchProcessPayrollSchema,
    payslipQuerySchema,
    validate,
} = require('../helpers/staffValidations');

// ─── Helper ───────────────────────────────────────────────────────────────────

const extractJoiErrors = (joiError) =>
    joiError.details.map((d) => ({
        field:   d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
    }));

// ─── 2.1  GET /staff ─────────────────────────────────────────────────────────

/**
 * @desc    Get all staff members (paginated + filtered)
 * @route   GET /api/v1/staff
 * @access  super_admin | admin | principal | accountant
 */
exports.getAllStaff = asyncHandler(async (req, res) => {
    const result = await staffService.getAllStaff(req.query);

    sendSuccess(res, 200, '', result);
});

// ─── 2.2  GET /staff/:id ──────────────────────────────────────────────────────

/**
 * @desc    Get a single staff member by ID
 * @route   GET /api/v1/staff/:id
 * @access  super_admin | admin | principal | accountant
 */
exports.getStaff = asyncHandler(async (req, res) => {
    const result = await staffService.getStaffById(req.params.id);

    sendSuccess(res, 200, '', result);
});

// ─── 2.3  POST /staff ─────────────────────────────────────────────────────────

/**
 * @desc    Register a new staff member
 * @route   POST /api/v1/staff
 * @access  super_admin | admin
 */
exports.addStaff = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(createStaffSchema, req.body);

    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await staffService.createStaff(
        value,
        req.files || null,
        req.user.id,
        req.ip || req.connection?.remoteAddress
    );

    sendSuccess(res, 201, 'Staff member registered successfully', result);
});

// ─── 2.4  PUT /staff/:id ──────────────────────────────────────────────────────

/**
 * @desc    Update a staff record (partial)
 * @route   PUT /api/v1/staff/:id
 * @access  super_admin | admin
 */
exports.updateStaff = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(updateStaffSchema, req.body);

    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await staffService.updateStaff(
        req.params.id,
        value,
        req.files || null,
        req.user.id
    );

    sendSuccess(res, 200, 'Staff record updated successfully', result);
});

// ─── 2.5  DELETE /staff/:id ───────────────────────────────────────────────────

/**
 * @desc    Delete a staff record
 * @route   DELETE /api/v1/staff/:id
 * @access  super_admin | admin
 */
exports.deleteStaff = asyncHandler(async (req, res) => {
    await staffService.deleteStaff(req.params.id);

    sendSuccess(res, 200, 'Staff record deleted successfully');
});

// ─── 2.6  PATCH /staff/:id/status ─────────────────────────────────────────────

/**
 * @desc    Update staff status (Active | Inactive | On Leave)
 * @route   PATCH /api/v1/staff/:id/status
 * @access  super_admin | admin
 */
exports.updateStaffStatus = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(updateStaffStatusSchema, req.body);

    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await staffService.updateStaffStatus(
        req.params.id,
        value.status,
        value.reason,
        value.returnDate,
        req.user.id
    );

    sendSuccess(res, 200, `Staff status updated to ${value.status}`, result);
});

// ─── 2.7  GET /staff/payroll ──────────────────────────────────────────────────

/**
 * @desc    Get payroll list for a given month and year
 * @route   GET /api/v1/staff/payroll
 * @access  super_admin | admin | accountant
 */
exports.getPayrollList = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(payrollQuerySchema, req.query);

    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await staffService.getPayrollList(value);

    sendSuccess(res, 200, '', result);
});

// ─── 2.8  POST /staff/payroll/:staffId/process ────────────────────────────────

/**
 * @desc    Process payroll for a single staff member
 * @route   POST /api/v1/staff/payroll/:staffId/process
 * @access  super_admin | admin | accountant
 */
exports.processPayroll = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(processPayrollSchema, req.body);

    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await staffService.processPayroll(
        req.params.staffId,
        value,
        req.user.id
    );

    const { staffId } = result;
    sendSuccess(res, 200, `Payroll processed for staff ${staffId}`, result);
});

// ─── 2.9  POST /staff/payroll/batch-process ───────────────────────────────────

/**
 * @desc    Process payroll for multiple staff members in one request
 * @route   POST /api/v1/staff/payroll/batch-process
 * @access  super_admin | admin | accountant
 */
exports.batchProcessPayroll = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(batchProcessPayrollSchema, req.body);

    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await staffService.batchProcessPayroll(value, req.user.id);

    sendSuccess(res, 200, 'Batch payroll processed', result);
});

// ─── 2.10  GET /staff/payroll/:staffId/payslip ────────────────────────────────

/**
 * @desc    Retrieve a payslip for a specific staff member + period
 * @route   GET /api/v1/staff/payroll/:staffId/payslip
 * @access  super_admin | admin | accountant | principal
 */
exports.getPayslip = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(payslipQuerySchema, req.query);

    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await staffService.getPayslip(
        req.params.staffId,
        value.month,
        value.year
    );

    sendSuccess(res, 200, '', result);
});
