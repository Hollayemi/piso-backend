/**
 * helpers/eventValidations.js
 *
 * Joi validation schemas for the Events module.
 *
 *   createEventSchema  — POST /events
 *   updateEventSchema  — PUT  /events/:id  (all fields optional)
 *   eventQuerySchema   — GET  /events (query params)
 */

const Joi = require('joi');
const { EVENT_TYPES, EVENT_STATUSES, TARGET_AUDIENCES } = require('../model/event.model');

// ─── Generic validation runner ────────────────────────────────────────────────

const validate = (schema, data) =>
    schema.validate(data, { abortEarly: false, stripUnknown: true });

// ─── POST /events — Create ────────────────────────────────────────────────────

const createEventSchema = Joi.object({
    title: Joi.string().trim().min(2).max(150).required().messages({
        'any.required': 'Event title is required',
        'string.min':   'Title must be at least 2 characters',
        'string.max':   'Title cannot exceed 150 characters',
    }),

    type: Joi.string()
        .valid(...EVENT_TYPES)
        .default('General')
        .optional()
        .messages({
            'any.only': `Type must be one of: ${EVENT_TYPES.join(', ')}`,
        }),

    description: Joi.string().trim().max(2000).allow('').optional(),

    date: Joi.date().iso().required().messages({
        'any.required': 'Event date is required',
        'date.base':    'Event date must be a valid ISO date',
    }),

    endDate: Joi.date()
        .iso()
        .min(Joi.ref('date'))
        .optional()
        .allow(null)
        .messages({
            'date.min': 'End date must be on or after the start date',
        }),

    time: Joi.string().trim().max(20).allow('').optional(),

    location: Joi.string().trim().max(200).allow('').optional(),

    targetAudience: Joi.array()
        .items(Joi.string().valid(...TARGET_AUDIENCES))
        .default(['All'])
        .optional()
        .messages({
            'any.only': `Audience values must be one of: ${TARGET_AUDIENCES.join(', ')}`,
        }),

    status: Joi.string()
        .valid(...EVENT_STATUSES)
        .optional()
        .messages({
            'any.only': `Status must be one of: ${EVENT_STATUSES.join(', ')}`,
        }),

    requiresPayment: Joi.boolean().default(false).optional(),

    paymentAmount: Joi.when('requiresPayment', {
        is:      true,
        then:    Joi.number().positive().required().messages({
            'any.required':   'Payment amount is required when requiresPayment is true',
            'number.positive': 'Payment amount must be greater than 0',
        }),
        otherwise: Joi.number().default(0).optional(),
    }),

    paymentDeadline: Joi.when('requiresPayment', {
        is:      true,
        then:    Joi.date().iso().optional().allow(null),
        otherwise: Joi.any().optional(),
    }),

    markedNewUntil: Joi.date().iso().optional().allow(null),
});

// ─── PUT /events/:id — Update (all fields optional) ──────────────────────────

const updateEventSchema = createEventSchema.fork(
    ['title', 'date'],
    (field) => field.optional()
);

// ─── GET /events — Query Params ───────────────────────────────────────────────

const eventQuerySchema = Joi.object({
    page:            Joi.number().integer().min(1).default(1).optional(),
    limit:           Joi.number().integer().min(1).max(100).default(20).optional(),
    search:          Joi.string().trim().allow('').optional(),
    type:            Joi.string().valid(...EVENT_TYPES).optional(),
    status:          Joi.string().valid(...EVENT_STATUSES).optional(),
    requiresPayment: Joi.boolean().optional(),
    audience:        Joi.string().valid(...TARGET_AUDIENCES).optional(),
    upcoming:        Joi.boolean().optional(),
    past:            Joi.boolean().optional(),
});

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    validate,
    createEventSchema,
    updateEventSchema,
    eventQuerySchema,
};
