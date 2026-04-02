
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const { sendSuccess } = require('../utils/sendResponse');
const authService = require('../services/authService');
const parentService = require('../services/parentAuthService');

const {
    validate,
    loginSchema,
    changePasswordSchema,
} = require('../helpers/authValidations');

// ─── Helper ───────────────────────────────────────────────────────────────────

const extractJoiErrors = (joiError) =>
    joiError.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
    }));

// ═══════════════════════════════════════════════════════════════════════════════
// POST /auth/login
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Authenticate a staff member and return a JWT
 * @route   POST /api/v1/auth/login
 * @access  Public
 */
exports.login = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(loginSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await authService.login(value.email, value.password, value.login_type);

    sendSuccess(res, 200, 'Login successful', result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /auth/logout
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Logout the current user (client discards token)
 * @route   POST /api/v1/auth/logout
 * @access  Private — any authenticated role
 */
exports.logout = asyncHandler(async (req, res) => {
    const result = await authService.logout();
    sendSuccess(res, 200, result.message);
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /auth/me
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Return the profile of the currently authenticated staff member
 * @route   GET /api/v1/auth/me
 * @access  Private — any authenticated role
 */


exports.getProfile = asyncHandler(async (req, res) => {
    let result;
    if (req.user.role === "parent") {
        result = await parentService.getProfile(req.user.id);
    } else {
        result = await authService.getProfile(req.user.id);
    }
    sendSuccess(res, 200, '', result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /auth/change-password
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Change the authenticated staff member's password
 * @route   PUT /api/v1/auth/change-password
 * @access  Private — any authenticated role (also allowed when mustResetPassword = true)
 */
exports.changePassword = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(changePasswordSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await authService.changePassword(
        req.user.id,
        value.currentPassword,
        value.newPassword
    );

    sendSuccess(res, 200, result.message);
});
