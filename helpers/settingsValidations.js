/**
 * helpers/settingsValidations.js
 *
 * Joi validation schemas for the Settings module (5.1 – 5.13):
 *
 *   updateSchoolSchema        — 5.2  PUT  /settings/school
 *   updateSessionSchema       — 5.4  PATCH /settings/academic/session
 *   createTermSchema          — 5.5  POST  /settings/academic/terms
 *   updateTermSchema          — 5.5  PUT   /settings/academic/terms/:id
 *   updateNotificationsSchema — 5.9  PUT   /settings/notifications
 *   updateSecuritySchema      — 5.11 PUT   /settings/security
 */

const Joi = require('joi');
const { NOTIFICATION_IDS, VALID_SESSION_TIMEOUTS } = require('../model/settings.model');

// ─── Generic validation runner ────────────────────────────────────────────────

const validate = (schema, data) =>
    schema.validate(data, { abortEarly: false, stripUnknown: true });

// ─── 5.2  Update School Info ──────────────────────────────────────────────────

const updateSchoolSchema = Joi.object({
    name:          Joi.string().trim().min(2).max(100).optional(),
    shortName:     Joi.string().trim().min(1).max(20).optional(),
    address:       Joi.string().trim().max(300).allow('').optional(),
    phone:         Joi.string().trim().max(30).allow('').optional(),
    email:         Joi.string().email().lowercase().allow('').optional(),
    website:       Joi.string().trim().uri().allow('').optional(),
    motto:         Joi.string().trim().max(150).allow('').optional(),
    principalName: Joi.string().trim().max(100).allow('').optional(),
    // logo is handled as a file upload — not validated here
});

// ─── 5.4  Update Academic Session ─────────────────────────────────────────────

const updateSessionSchema = Joi.object({
    currentSession: Joi.string()
        .trim()
        .pattern(/^\d{4}\/\d{4}$/)
        .required()
        .messages({
            'string.pattern.base': 'currentSession must be in the format YYYY/YYYY e.g. 2025/2026',
            'any.required':        'currentSession is required',
        }),
});

// ─── 5.5  Create Term ─────────────────────────────────────────────────────────

const createTermSchema = Joi.object({
    name: Joi.string().trim().min(2).max(50).required().messages({
        'any.required': 'Term name is required',
    }),

    start: Joi.date().iso().required().messages({
        'any.required': 'Start date is required',
        'date.base':    'Start date must be a valid ISO date',
    }),

    end: Joi.date()
        .iso()
        .greater(Joi.ref('start'))
        .required()
        .messages({
            'any.required': 'End date is required',
            'date.greater': 'End date must be after start date',
        }),
});

// ─── 5.5  Update Term (all fields optional) ───────────────────────────────────

const updateTermSchema = createTermSchema.fork(
    ['name', 'start', 'end'],
    (field) => field.optional()
);

// ─── 5.9  Update Notification Settings ───────────────────────────────────────

const updateNotificationsSchema = Joi.object({
    notifications: Joi.array()
        .items(
            Joi.object({
                id:      Joi.string().valid(...NOTIFICATION_IDS).required().messages({
                    'any.only':    `id must be one of: ${NOTIFICATION_IDS.join(', ')}`,
                    'any.required': 'Notification id is required',
                }),
                enabled: Joi.boolean().required().messages({
                    'any.required': 'enabled flag is required',
                }),
            })
        )
        .min(1)
        .optional(),

    senderConfig: Joi.object({
        emailSenderName: Joi.string().trim().max(100).optional(),
        replyToEmail:    Joi.string().email().lowercase().optional(),
    }).optional(),
});

// ─── 5.11  Update Security Settings ──────────────────────────────────────────

const updateSecuritySchema = Joi.object({
    twoFactor: Joi.boolean().optional(),

    sessionTimeoutMinutes: Joi.number()
        .integer()
        .valid(...VALID_SESSION_TIMEOUTS)
        .optional()
        .messages({
            'any.only': `sessionTimeoutMinutes must be one of: ${VALID_SESSION_TIMEOUTS.join(', ')}`,
        }),

    passwordMinLength: Joi.number().integer().min(6).max(32).optional().messages({
        'number.min': 'passwordMinLength must be at least 6',
        'number.max': 'passwordMinLength cannot exceed 32',
    }),

    requireUppercase: Joi.boolean().optional(),
    requireNumbers:   Joi.boolean().optional(),
});

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    validate,
    updateSchoolSchema,
    updateSessionSchema,
    createTermSchema,
    updateTermSchema,
    updateNotificationsSchema,
    updateSecuritySchema,
};
