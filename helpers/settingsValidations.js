/**
 * helpers/settingsValidations.js
 *
 * Joi validation schemas for the Settings module:
 *
 *   updateSchoolSchema        — PUT  /settings/school
 *   createSessionSchema       — POST /settings/academic/sessions
 *   updateSessionSchema       — PUT  /settings/academic/sessions/:id
 *   deleteSessionSchema       — DELETE /settings/academic/sessions/:id
 *   createTermSchema          — POST /settings/academic/sessions/:sessionId/terms
 *   updateTermSchema          — PUT  /settings/academic/terms/:id
 *   deleteTermSchema          — DELETE /settings/academic/terms/:id
 *   setCurrentSessionSchema   — PATCH /settings/academic/sessions/:id/current
 *   setCurrentTermSchema      — PATCH /settings/academic/terms/:id/current
 *   updateNotificationsSchema — PUT  /settings/notifications
 *   updateSecuritySchema      — PUT  /settings/security
 */

const Joi = require('joi');
const { NOTIFICATION_IDS, VALID_SESSION_TIMEOUTS } = require('../model/settings.model');

// ─── Generic validation runner ────────────────────────────────────────────────

const validate = (schema, data) =>
    schema.validate(data, { abortEarly: false, stripUnknown: true });

// ─── Helper: Date range validator ─────────────────────────────────────────────

const isValidDateRange = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return start < end;
};

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

// ─── 5.3  Create Academic Session ─────────────────────────────────────────────

const createSessionSchema = Joi.object({
    name: Joi.string()
        .trim()
        .pattern(/^\d{4}\/\d{4}$/)
        .required()
        .messages({
            'string.pattern.base': 'Session name must be in the format YYYY/YYYY e.g. 2025/2026',
            'any.required':        'Session name is required',
        }),

    startDate: Joi.date()
        .iso()
        .required()
        .messages({
            'any.required': 'Start date is required',
            'date.base':    'Start date must be a valid ISO date',
        }),

    endDate: Joi.date()
        .iso()
        .greater(Joi.ref('startDate'))
        .required()
        .messages({
            'any.required': 'End date is required',
            'date.greater': 'End date must be after start date',
        }),
})

// ─── 5.4  Update Academic Session ─────────────────────────────────────────────

const updateSessionSchema = Joi.object({
    name: Joi.string()
        .trim()
        .pattern(/^\d{4}\/\d{4}$/)
        .optional()
        .messages({
            'string.pattern.base': 'Session name must be in the format YYYY/YYYY e.g. 2025/2026',
        }),

    startDate: Joi.date()
        .iso()
        .optional()
        .messages({
            'date.base': 'Start date must be a valid ISO date',
        }),

    endDate: Joi.date()
        .iso()
        .optional()
        .messages({
            'date.base': 'End date must be a valid ISO date',
        }),
})

// ─── 5.5  Delete Session (params validation) ──────────────────────────────────

const deleteSessionSchema = Joi.object({
    sessionId: Joi.string()
        .trim()
        .pattern(/^SESS_.+$/)
        .required()
        .messages({
            'string.pattern.base': 'Invalid session ID format',
            'any.required':        'Session ID is required',
        }),
});

// ─── 5.6  Set Current Session ─────────────────────────────────────────────────

const setCurrentSessionSchema = Joi.object({
    sessionId: Joi.string()
        .trim()
        .pattern(/^SESS_.+$/)
        .required()
        .messages({
            'string.pattern.base': 'Invalid session ID format',
            'any.required':        'Session ID is required',
        }),
});

// ─── 5.7  Create Term (under a session) ───────────────────────────────────────

const createTermSchema = Joi.object({
    sessionId: Joi.string()
        .trim()
        .pattern(/^SESS_.+$/)
        .required()
        .messages({
            'string.pattern.base': 'Invalid session ID format',
            'any.required':        'Session ID is required',
        }),

    name: Joi.string()
        .trim()
        .min(2)
        .max(50)
        .required()
        .valid('1st Term', '2nd Term', '3rd Term', 'First Term', 'Second Term', 'Third Term')
        .messages({
            'any.required': 'Term name is required',
            'any.only':     'Term name must be one of: 1st Term, 2nd Term, 3rd Term, First Term, Second Term, Third Term',
        }),

    startDate: Joi.date()
        .required()
        .messages({
            'any.required': 'Start date is required',
        }),

    endDate: Joi.date()
        .greater(Joi.ref('startDate'))
        .required()
        .messages({
            'any.required': 'End date is required',
            'date.greater': 'End date must be after start date',
        }),
})
// ─── 5.8  Update Term ─────────────────────────────────────────────────────────

const updateTermSchema = Joi.object({
    name: Joi.string()
        .trim()
        .min(2)
        .max(50)
        .optional()
        .valid('1st Term', '2nd Term', '3rd Term', 'First Term', 'Second Term', 'Third Term')
        .messages({
            'any.only': 'Term name must be one of: 1st Term, 2nd Term, 3rd Term, First Term, Second Term, Third Term',
        }),

    startDate: Joi.date()
        .iso()
        .optional()
        .messages({
            'date.base': 'Start date must be a valid ISO date',
        }),

    endDate: Joi.date()
        .iso()
        .optional()
        .messages({
            'date.base': 'End date must be a valid ISO date',
        }),
})
// ─── 5.9  Delete Term (params validation) ─────────────────────────────────────

const deleteTermSchema = Joi.object({
    termId: Joi.string()
        .trim()
        .pattern(/^TERM_.+$/)
        .required()
        .messages({
            'string.pattern.base': 'Invalid term ID format',
            'any.required':        'Term ID is required',
        }),
});

// ─── 5.10 Set Current Term ────────────────────────────────────────────────────

const setCurrentTermSchema = Joi.object({
    termId: Joi.string()
        .trim()
        .pattern(/^TERM_.+$/)
        .required()
        .messages({
            'string.pattern.base': 'Invalid term ID format',
            'any.required':        'Term ID is required',
        }),
});

// ─── 5.11 Get Terms by Session (params validation) ────────────────────────────

const getTermsBySessionSchema = Joi.object({
    sessionId: Joi.string()
        .trim()
        .pattern(/^SESS_.+$/)
        .required()
        .messages({
            'string.pattern.base': 'Invalid session ID format',
            'any.required':        'Session ID is required',
        }),
});

// ─── 5.12 Update Notification Settings ───────────────────────────────────────

const updateNotificationsSchema = Joi.object({
    notifications: Joi.array()
        .items(
            Joi.object({
                id:      Joi.string().valid(...NOTIFICATION_IDS).required().messages({
                    'any.only':    `id must be one of: ${NOTIFICATION_IDS.join(', ')}`,
                    'any.required': 'Notification id is required',
                }),
                label:   Joi.string().trim().max(100).optional(),
                desc:    Joi.string().trim().max(200).optional(),
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

// ─── 5.13 Update Security Settings ────────────────────────────────────────────

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

// ─── 5.14 Fee Structure Validations ───────────────────────────────────────────

const feeLineItemSchema = Joi.object({
    description: Joi.string().trim().min(1).max(200).required(),
    amount:      Joi.number().min(0).max(999999999).required(),
});

const feeTermSchema = Joi.object({
    items: Joi.array().items(feeLineItemSchema).max(50).default([]),
});

const feeCategorySchema = Joi.object({
    label:      Joi.string().trim().max(100).optional(),
    firstTerm:  feeTermSchema.optional(),
    secondTerm: feeTermSchema.optional(),
    thirdTerm:  feeTermSchema.optional(),
});

const updateFeeStructureSchema = Joi.object({
    category: Joi.string()
        .valid('primaryDay', 'primaryBoarders', 'juniorDay', 'juniorBoarders', 'seniorDay', 'seniorBoarders')
        .optional(),
    
    label: Joi.string().trim().max(100).optional(),
    
    firstTerm:  feeTermSchema.optional(),
    secondTerm: feeTermSchema.optional(),
    thirdTerm:  feeTermSchema.optional(),
    
    feeStructure: Joi.object({
        primaryDay:      feeCategorySchema.optional(),
        primaryBoarders: feeCategorySchema.optional(),
        juniorDay:       feeCategorySchema.optional(),
        juniorBoarders:  feeCategorySchema.optional(),
        seniorDay:       feeCategorySchema.optional(),
        seniorBoarders:  feeCategorySchema.optional(),
    }).optional(),
}).custom((value, helpers) => {
    // Validate that either category or feeStructure is provided
    if (!value.category && !value.feeStructure) {
        return helpers.error('either.categoryOrStructure', { 
            message: 'Either "category" or "feeStructure" must be provided' 
        });
    }
    
    // If category is provided, ensure at least one term is provided
    if (value.category && !value.firstTerm && !value.secondTerm && !value.thirdTerm && !value.label) {
        return helpers.error('category.noData', { 
            message: 'When updating a category, provide at least label or one term configuration' 
        });
    }
    
    return value;
});

// ─── Export all schemas ───────────────────────────────────────────────────────

module.exports = {
    validate,
    
    // School
    updateSchoolSchema,
    
    // Session Management
    createSessionSchema,
    updateSessionSchema,
    deleteSessionSchema,
    setCurrentSessionSchema,
    getTermsBySessionSchema,
    
    // Term Management
    createTermSchema,
    updateTermSchema,
    deleteTermSchema,
    setCurrentTermSchema,
    
    // Notifications & Security
    updateNotificationsSchema,
    updateSecuritySchema,
    
    // Fee Structure
    updateFeeStructureSchema,
    
    // Re-export constants for use in routes
    NOTIFICATION_IDS,
    VALID_SESSION_TIMEOUTS,
};