/**
 * controllers/parentProfileController.js
 *
 * HTTP layer for the authenticated parent's own profile management.
 *
 *   GET    /parent/profile       → getProfile  (re-uses authController.getProfile)
 *   PATCH  /parent/profile       → updateProfile
 */

const asyncHandler          = require('../middleware/asyncHandler');
const ErrorResponse         = require('../utils/errorResponse');
const { sendSuccess }       = require('../utils/sendResponse');
const parentAuthService     = require('../services/parentAuthService');
const Joi                   = require('joi');

// ─── Validation schema ────────────────────────────────────────────────────────

const guardianUpdateSchema = Joi.object({
    name:          Joi.string().trim().max(100).optional(),
    occupation:    Joi.string().trim().max(100).optional(),
    officeAddress: Joi.string().trim().max(200).optional(),
    homeAddress:   Joi.string().trim().max(200).optional(),
    homePhone:     Joi.string().trim().optional(),
    whatsApp:      Joi.string().trim().optional(),
    email:         Joi.string().email().lowercase().optional(),
});

const updateProfileSchema = Joi.object({
    father:                  guardianUpdateSchema.optional(),
    mother:                  guardianUpdateSchema.optional(),
    correspondenceEmail:     Joi.string().email().lowercase().optional(),
    howDidYouKnow:           Joi.string().trim().max(200).allow('').optional(),
    notificationPreferences: Joi.object({
        email: Joi.boolean().optional(),
        sms:   Joi.boolean().optional(),
    }).optional(),
});

const extractJoiErrors = (joiError) =>
    joiError.details.map((d) => ({
        field:   d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
    }));

// ─── PATCH /parent/profile ────────────────────────────────────────────────────

/**
 * @desc   Update the authenticated parent's profile
 * @route  PATCH /api/v1/parent/profile
 * @access parent
 */
exports.updateProfile = asyncHandler(async (req, res, next) => {
    const { error, value } = updateProfileSchema.validate(req.body, {
        abortEarly:   false,
        stripUnknown: true,
    });

    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    // req.user.id is the parentId (set by protect middleware)
    const result = await parentAuthService.updateParentProfile(req.user.id, value);
    sendSuccess(res, 200, 'Profile updated successfully', result);
});
