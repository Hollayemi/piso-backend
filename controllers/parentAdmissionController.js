/**
 * controllers/parentAdmissionController.js
 *
 * HTTP layer for the Parent Admission module.
 *
 *   GET    /parent/admissions         → getMyApplications
 *   GET    /parent/admissions/:id     → getMyApplication
 *   POST   /parent/admissions         → submitApplication
 *   PATCH  /parent/admissions/:id/offer → respondToOffer
 */

const Joi = require('joi');
const asyncHandler          = require('../middleware/asyncHandler');
const ErrorResponse         = require('../utils/errorResponse');
const { sendSuccess }       = require('../utils/sendResponse');
const parentAdmissionService = require('../services/parentAdmissionService');

// ─── Validation schemas ───────────────────────────────────────────────────────

/**
 * Body schema for POST /parent/admissions.
 * Only child-specific fields are required — parent info comes from the
 * authenticated session; no need to re-submit father/mother details.
 */
const submitSchema = Joi.object({
    // ── Child personal details ─────────────────────────────────────────────
    surname: Joi.string()
        .trim().min(2).max(50)
        .pattern(/^[a-zA-Z\s'-]+$/)
        .required()
        .messages({
            'any.required':        'Surname is required',
            'string.pattern.base': 'Surname must contain only letters, spaces, hyphens, and apostrophes',
        }),

    firstName: Joi.string()
        .trim().min(2).max(50)
        .pattern(/^[a-zA-Z\s'-]+$/)
        .required()
        .messages({
            'any.required':        'First name is required',
            'string.pattern.base': 'First name must contain only letters',
        }),

    middleName: Joi.string().trim().max(50).allow('').optional(),

    dateOfBirth: Joi.date().iso().max('now').required().messages({
        'any.required': 'Date of birth is required',
        'date.max':     'Date of birth must be in the past',
    }),

    gender: Joi.string()
        .valid('male', 'female', 'Male', 'Female')
        .required()
        .messages({ 'any.required': 'Gender is required' }),

    bloodGroup: Joi.string()
        .valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', '')
        .allow('')
        .optional(),

    genotype: Joi.string()
        .valid('AA', 'AS', 'SS', 'AC', 'SC', '')
        .allow('')
        .optional(),

    nationality:     Joi.string().trim().max(50).default('Nigerian').optional(),
    stateOfOrigin:   Joi.string().trim().max(50).allow('').optional(),
    localGovernment: Joi.string().trim().max(50).allow('').optional(),

    // ── Academic ───────────────────────────────────────────────────────────
    schoolingOption: Joi.string()
        .valid('Day', 'Boarding', 'day', 'boarding')
        .required()
        .messages({ 'any.required': 'Schooling option is required' }),

    classPreferences: Joi.object({
        presentClass:      Joi.string().trim().allow('').optional(),
        classInterestedIn: Joi.string().trim().required().messages({
            'any.required': 'Class applying for is required',
        }),
    }).required().messages({ 'any.required': 'Class preferences are required' }),

    // ── Schools attended ───────────────────────────────────────────────────
    schools: Joi.array()
        .items(
            Joi.object({
                name:      Joi.string().trim().max(200).allow('').optional(),
                startDate: Joi.date().iso().max('now').optional().allow('', null),
                endDate:   Joi.date().iso().max('now').optional().allow('', null),
            })
        )
        .optional(),

    // ── Health ─────────────────────────────────────────────────────────────
    health: Joi.object({
        vaccinations:      Joi.object().optional(),
        otherVaccination:  Joi.string().trim().max(200).allow('').optional(),
        infectiousDisease: Joi.string().trim().max(200).allow('').optional(),
        foodAllergy:       Joi.string().trim().max(200).allow('').optional(),
    }).optional(),

    // ── Contact override (optional — defaults to parent's registered email) ─
    correspondenceEmail: Joi.string().email().lowercase().optional(),
    howDidYouKnow:       Joi.string().trim().allow('').optional(),
});

/** Schema for PATCH /parent/admissions/:id/offer */
const offerResponseSchema = Joi.object({
    acceptanceStatus: Joi.string()
        .valid('Accepted', 'Declined')
        .required()
        .messages({
            'any.only':    'acceptanceStatus must be "Accepted" or "Declined"',
            'any.required': 'acceptanceStatus is required',
        }),
});

// ─── Helper ───────────────────────────────────────────────────────────────────

const extractJoiErrors = (joiError) =>
    joiError.details.map((d) => ({
        field:   d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
    }));

// ─── Resolve parentId from req ────────────────────────────────────────────────
// req.user is the full Parent Mongoose document (set by protect middleware).
// req.parent is set by parentAuthMiddleware if used; otherwise fall back to req.user.

const getParentId = (req) =>
    req.parent?.parentId || req.user?.parentId || req.user?.id;

// ═══════════════════════════════════════════════════════════════════════════════
// GET /parent/admissions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    List all admission applications submitted by this parent
 * @route   GET /api/v1/parent/admissions
 * @access  parent
 */
exports.getMyApplications = asyncHandler(async (req, res) => {
    const parentId = getParentId(req);
    const result   = await parentAdmissionService.getMyApplications(parentId);
    sendSuccess(res, 200, '', result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /parent/admissions/:id
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Get a single application by ID (must belong to this parent)
 * @route   GET /api/v1/parent/admissions/:id
 * @access  parent
 */
exports.getMyApplication = asyncHandler(async (req, res) => {
    const parentId = getParentId(req);
    const result   = await parentAdmissionService.getMyApplication(parentId, req.params.id);
    sendSuccess(res, 200, '', result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /parent/admissions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Submit a new admission application as an authenticated parent
 * @route   POST /api/v1/parent/admissions
 * @access  parent
 */
exports.submitApplication = asyncHandler(async (req, res, next) => {
    const { error, value } = submitSchema.validate(req.body, {
        abortEarly:   false,
        stripUnknown: true,
    });

    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const parentId = getParentId(req);
    const files    = req.files || {};

    const result = await parentAdmissionService.submitApplicationAsParent(parentId, value, files);
    sendSuccess(res, 201, 'Application submitted successfully', result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /parent/admissions/:id/offer
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Accept or decline an admission offer
 * @route   PATCH /api/v1/parent/admissions/:id/offer
 * @access  parent
 */
exports.respondToOffer = asyncHandler(async (req, res, next) => {
    const { error, value } = offerResponseSchema.validate(req.body, {
        abortEarly:   false,
        stripUnknown: true,
    });

    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const parentId = getParentId(req);
    const result   = await parentAdmissionService.respondToOffer(
        parentId,
        req.params.id,
        value.acceptanceStatus
    );

    const msg = value.acceptanceStatus === 'Accepted'
        ? 'Offer accepted successfully. Welcome to Progress Intellectual School!'
        : 'Offer declined. Contact the school if this was a mistake.';

    sendSuccess(res, 200, msg, result);
});
