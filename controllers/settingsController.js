/**
 * controllers/settingsController.js
 *
 * HTTP request/response handling for the Settings module (5.1 – 5.13).
 *
 * Each handler:
 *   1. Validates input with Joi (where input exists)
 *   2. Delegates to settingsService
 *   3. Sends a standardised response via sendSuccess
 *
 * No business logic or DB access lives here.
 *
 * Role access: ALL settings routes require super_admin.
 * This is enforced on the route layer, not here.
 *
 * Sub-sections:
 *   School Info    → 5.1 – 5.2
 *   Academic       → 5.3 – 5.7
 *   Notifications  → 5.8 – 5.9
 *   Security       → 5.10 – 5.13
 */

const asyncHandler    = require('../middleware/asyncHandler');
const ErrorResponse   = require('../utils/errorResponse');
const { sendSuccess } = require('../utils/sendResponse');
const settingsService = require('../services/settingsService');

const {
    validate,
    updateSchoolSchema,
    updateSessionSchema,
    createTermSchema,
    updateTermSchema,
    updateNotificationsSchema,
    updateSecuritySchema,
} = require('../helpers/settingsValidations');

// ─── Helper ───────────────────────────────────────────────────────────────────

const extractJoiErrors = (joiError) =>
    joiError.details.map((d) => ({
        field:   d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
    }));

// ═══════════════════════════════════════════════════════════════════════════════
// SCHOOL INFO
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 5.1  GET /settings/school ────────────────────────────────────────────────

/**
 * @desc    Get school information
 * @route   GET /api/v1/settings/school
 * @access  super_admin
 */
exports.getSchoolInfo = asyncHandler(async (req, res) => {
    const result = await settingsService.getSchoolInfo();
    sendSuccess(res, 200, '', result);
});

// ─── 5.2  PUT /settings/school ────────────────────────────────────────────────

/**
 * @desc    Update school information (with optional logo upload)
 * @route   PUT /api/v1/settings/school
 * @access  super_admin
 */
exports.updateSchoolInfo = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(updateSchoolSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await settingsService.updateSchoolInfo(
        value,
        req.files || null,
        req.user.id
    );

    sendSuccess(res, 200, 'School information updated successfully', result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// ACADEMIC SESSION & TERMS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 5.3  GET /settings/academic ──────────────────────────────────────────────

/**
 * @desc    Get academic session and all terms
 * @route   GET /api/v1/settings/academic
 * @access  super_admin
 */
exports.getAcademicSettings = asyncHandler(async (req, res) => {
    const result = await settingsService.getAcademicSettings();
    sendSuccess(res, 200, '', result);
});

// ─── 5.4  PATCH /settings/academic/session ────────────────────────────────────

/**
 * @desc    Update the current academic session year
 * @route   PATCH /api/v1/settings/academic/session
 * @access  super_admin
 */
exports.updateAcademicSession = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(updateSessionSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await settingsService.updateAcademicSession(
        value.currentSession,
        req.user.id
    );

    sendSuccess(res, 200, 'Academic session updated', result);
});

// ─── 5.5  POST /settings/academic/terms ──────────────────────────────────────

/**
 * @desc    Create a new term
 * @route   POST /api/v1/settings/academic/terms
 * @access  super_admin
 */
exports.createTerm = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(createTermSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await settingsService.createTerm(value, req.user.id);
    sendSuccess(res, 201, 'Term created successfully', result);
});

// ─── 5.5  PUT /settings/academic/terms/:id ────────────────────────────────────

/**
 * @desc    Update an existing term (partial)
 * @route   PUT /api/v1/settings/academic/terms/:id
 * @access  super_admin
 */
exports.updateTerm = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(updateTermSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await settingsService.updateTerm(req.params.id, value, req.user.id);
    sendSuccess(res, 200, 'Term updated successfully', result);
});

// ─── 5.6  DELETE /settings/academic/terms/:id ────────────────────────────────

/**
 * @desc    Delete a term (blocked if it is the current term)
 * @route   DELETE /api/v1/settings/academic/terms/:id
 * @access  super_admin
 */
exports.deleteTerm = asyncHandler(async (req, res) => {
    await settingsService.deleteTerm(req.params.id, req.user.id);
    sendSuccess(res, 200, 'Term deleted successfully');
});

// ─── 5.7  PATCH /settings/academic/terms/:id/set-current ─────────────────────

/**
 * @desc    Mark a term as the active current term
 * @route   PATCH /api/v1/settings/academic/terms/:id/set-current
 * @access  super_admin
 */
exports.setCurrentTerm = asyncHandler(async (req, res) => {
    const result = await settingsService.setCurrentTerm(req.params.id, req.user.id);
    sendSuccess(res, 200, 'Current term updated', result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 5.8  GET /settings/notifications ────────────────────────────────────────

/**
 * @desc    Get notification settings
 * @route   GET /api/v1/settings/notifications
 * @access  super_admin
 */
exports.getNotificationSettings = asyncHandler(async (req, res) => {
    const result = await settingsService.getNotificationSettings();
    sendSuccess(res, 200, '', result);
});

// ─── 5.9  PUT /settings/notifications ────────────────────────────────────────

/**
 * @desc    Update notification toggles and sender config
 * @route   PUT /api/v1/settings/notifications
 * @access  super_admin
 */
exports.updateNotificationSettings = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(updateNotificationsSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    await settingsService.updateNotificationSettings(value, req.user.id);
    sendSuccess(res, 200, 'Notification settings updated successfully');
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 5.10  GET /settings/security ────────────────────────────────────────────

/**
 * @desc    Get security settings
 * @route   GET /api/v1/settings/security
 * @access  super_admin
 */
exports.getSecuritySettings = asyncHandler(async (req, res) => {
    const result = await settingsService.getSecuritySettings();
    sendSuccess(res, 200, '', result);
});

// ─── 5.11  PUT /settings/security ────────────────────────────────────────────

/**
 * @desc    Update password policy and session timeout
 * @route   PUT /api/v1/settings/security
 * @access  super_admin
 */
exports.updateSecuritySettings = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(updateSecuritySchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    await settingsService.updateSecuritySettings(value, req.user.id);
    sendSuccess(res, 200, 'Security settings updated successfully');
});

// ─── 5.12  POST /settings/security/force-password-reset ──────────────────────

/**
 * @desc    Force all staff members to reset their password on next login
 * @route   POST /api/v1/settings/security/force-password-reset
 * @access  super_admin
 */
exports.forcePasswordReset = asyncHandler(async (req, res) => {
    const result = await settingsService.forcePasswordReset(req.user.id);
    sendSuccess(
        res,
        200,
        'Password reset required for all users on next login',
        result
    );
});

// ─── 5.13  POST /settings/security/clear-sessions ────────────────────────────

/**
 * @desc    Invalidate all currently active JWT sessions
 * @route   POST /api/v1/settings/security/clear-sessions
 * @access  super_admin
 */
exports.clearAllSessions = asyncHandler(async (req, res) => {
    const result = await settingsService.clearAllSessions(req.user.id);
    sendSuccess(res, 200, 'All active sessions cleared', result);
});


// ─── GET /settings/fees ───────────────────────────────────────────────────────
exports.getFeeStructure = asyncHandler(async (req, res) => {
    const result = await settingsService.getFeeStructure();
    sendSuccess(res, 200, '', result);
});
 
// ─── PUT /settings/fees ───────────────────────────────────────────────────────
exports.updateFeeStructure = asyncHandler(async (req, res, next) => {
    const result = await settingsService.updateFeeStructure(req.body, req.user.id);
    sendSuccess(res, 200, 'Fee structure updated successfully', result);
});