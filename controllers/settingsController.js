const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const { sendSuccess } = require('../utils/sendResponse');
const settingsService = require('../services/settingsService');
const SettingsModel = require("../model/settings.model")

const {
    validate,
    updateSchoolSchema,
    createTermSchema,
    updateTermSchema,
    updateNotificationsSchema,
    updateSecuritySchema,
    createSessionSchema,
    updateSessionSchema,
} = require('../helpers/settingsValidations');

// ─── Helper ───────────────────────────────────────────────────────────────────

const extractJoiErrors = (joiError) =>
    joiError.details.map((d) => ({
        field: d.path.join('.'),
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

// ─── Session Controllers ─────────────────────────────────────────

/**
 * @desc    Create a new academic session
 * @route   POST /api/settings/academic/sessions
 * @access  Private/Admin
 */
exports.createSession = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(createSessionSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const settings = await SettingsModel.getSingleton();
    console.log({ settings })
    const session = await settings.createSession(value);

    sendSuccess(res, 201, 'Session created successfully', session);
});

/**
 * @desc    Update an academic session
 * @route   PUT /api/settings/academic/sessions/:id
 * @access  Private/Admin
 */
exports.updateSession = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(updateSessionSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const { id } = req.params;
    const settings = await SettingsModel.getSingleton();
    const session = await settings.updateSession(id, value);

    sendSuccess(res, 200, 'Session updated successfully', session);
});

/**
 * @desc    Delete an academic session
 * @route   DELETE /api/settings/academic/sessions/:id
 * @access  Private/Admin
 */
exports.deleteSession = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    const settings = await SettingsModel.getSingleton();
    await settings.deleteSession(id);

    sendSuccess(res, 200, 'Session deleted successfully');
});

/**
 * @desc    Set current session
 * @route   PATCH /api/settings/academic/sessions/:id/current
 * @access  Private/Admin
 */
exports.setCurrentSession = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    const settings = await SettingsModel.getSingleton();
    const session = await settings.setCurrentSession(id);

    sendSuccess(res, 200, 'Current session updated successfully', session);
});

/**
 * @desc    Get all sessions
 * @route   GET /api/settings/academic/sessions
 * @access  Private/Admin
 */
exports.getSessions = asyncHandler(async (req, res, next) => {
    const settings = await SettingsModel.getSingleton();

    sendSuccess(res, 200, 'Sessions retrieved successfully', settings.academic.sessions);
});

/**
 * @desc    Get current session
 * @route   GET /api/settings/academic/sessions/current
 * @access  Private/Admin
 */
exports.getCurrentSession = asyncHandler(async (req, res, next) => {
    const settings = await SettingsModel.getSingleton();
    const session = settings.getCurrentSession();

    sendSuccess(res, 200, 'Current session retrieved successfully', session);
});

// ─── Term Controllers ────────────────────────────────────────────

/**
 * @desc    Create a new term under a session
 * @route   POST /api/settings/academic/sessions/:sessionId/terms
 * @access  Private/Admin
 */
exports.createTerm = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(createTermSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const { sessionId } = req.params;
    const settings = await SettingsModel.getSingleton();
    const term = await settings.createTerm(sessionId, value);

    sendSuccess(res, 201, 'Term created successfully', term);
});

/**
 * @desc    Update a term
 * @route   PUT /api/settings/academic/terms/:id
 * @access  Private/Admin
 */
exports.updateTerm = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(updateTermSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const { id } = req.params;
    const settings = await SettingsModel.getSingleton();
    const term = await settings.updateTerm(id, value);

    sendSuccess(res, 200, 'Term updated successfully', term);
});

/**
 * @desc    Delete a term
 * @route   DELETE /api/settings/academic/terms/:id
 * @access  Private/Admin
 */
exports.deleteTerm = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    const settings = await SettingsModel.getSingleton();
    await settings.deleteTerm(id);

    sendSuccess(res, 200, 'Term deleted successfully');
});

/**
 * @desc    Set current term
 * @route   PATCH /api/settings/academic/terms/:id/current
 * @access  Private/Admin
 */
exports.setCurrentTerm = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    const settings = await SettingsModel.getSingleton();
    const term = await settings.setCurrentTerm(id);

    sendSuccess(res, 200, 'Current term updated successfully', term);
});

/**
 * @desc    Get all terms for a session
 * @route   GET /api/settings/academic/sessions/:sessionId/terms
 * @access  Private/Admin
 */
exports.getTermsBySession = asyncHandler(async (req, res, next) => {
    const { sessionId } = req.params;

    const settings = await SettingsModel.getSingleton();
    const terms = settings.getTermsBySession(sessionId);

    sendSuccess(res, 200, 'Terms retrieved successfully', terms);
});

/**
 * @desc    Get current term
 * @route   GET /api/settings/academic/terms/current
 * @access  Private/Admin
 */
exports.getCurrentTerm = asyncHandler(async (req, res, next) => {
    const settings = await SettingsModel.getSingleton();
    const term = settings.getCurrentTerm();

    sendSuccess(res, 200, 'Current term retrieved successfully', term);
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