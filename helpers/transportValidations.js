/**
 * transportValidations.js
 *
 * Joi validation schemas for the Transport module:
 *   - Bus Routes      (4.2 / 4.3)
 *   - Bus Enrollments (4.6)
 *   - Special Trips   (4.9 / 4.10)
 */

const Joi = require('joi');
const { TRIP_STATUSES }   = require('../model/specialTrip.model');
const { BUS_PAY_STATUSES } = require('../model/busEnrollment.model');

// ─── Generic validation runner ────────────────────────────────────────────────

const validate = (schema, data) =>
    schema.validate(data, { abortEarly: false, stripUnknown: true });

// ─── 4.2  Create Bus Route ────────────────────────────────────────────────────

const createRouteSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required().messages({
        'any.required': 'Route name is required',
        'string.min':   'Route name must be at least 2 characters',
    }),

    stops: Joi.array()
        .items(Joi.string().trim().min(1))
        .min(1)
        .required()
        .messages({
            'any.required': 'At least one stop is required',
            'array.min':    'At least one stop is required',
        }),

    fee: Joi.number().min(0).required().messages({
        'any.required': 'Route fee is required',
        'number.min':   'Fee cannot be negative',
    }),

    active: Joi.boolean().default(true).optional(),
});

// ─── 4.3  Update Bus Route (all fields optional) ──────────────────────────────

const updateRouteSchema = createRouteSchema.fork(
    ['name', 'stops', 'fee'],
    (field) => field.optional()
);

// ─── 4.5  Get Bus Enrollments — query params ──────────────────────────────────

const enrollmentQuerySchema = Joi.object({
    page:      Joi.number().integer().min(1).default(1).optional(),
    limit:     Joi.number().integer().min(1).max(100).default(15).optional(),
    search:    Joi.string().trim().allow('').optional(),
    routeId:   Joi.string().trim().allow('').optional(),
    payStatus: Joi.string().valid(...BUS_PAY_STATUSES).optional(),
});

// ─── 4.6  Enroll Student ──────────────────────────────────────────────────────

const enrollStudentSchema = Joi.object({
    studentId: Joi.string().trim().required().messages({
        'any.required': 'studentId is required',
    }),

    routeId: Joi.string().trim().required().messages({
        'any.required': 'routeId is required',
    }),

    stop: Joi.string().trim().required().messages({
        'any.required': 'stop is required',
    }),

    term: Joi.string().trim().allow('').optional(),
});

// ─── 4.7  Remove Enrollment — query params ────────────────────────────────────

const removeEnrollmentQuerySchema = Joi.object({
    term: Joi.string().trim().allow('').optional(),
});

// ─── 4.8  Get Special Trips — query params ────────────────────────────────────

const tripQuerySchema = Joi.object({
    status: Joi.string().valid(...TRIP_STATUSES).optional(),
});

// ─── 4.9  Create Special Trip ─────────────────────────────────────────────────

const createTripSchema = Joi.object({
    name: Joi.string().trim().min(2).max(150).required().messages({
        'any.required': 'Trip name is required',
    }),

    date: Joi.date().iso().greater('now').required().messages({
        'any.required': 'Trip date is required',
        'date.greater': 'Trip date must be in the future',
    }),

    destination: Joi.string().trim().min(2).max(200).required().messages({
        'any.required': 'Destination is required',
    }),

    fee: Joi.number().min(0).required().messages({
        'any.required': 'Trip fee is required',
        'number.min':   'Fee cannot be negative',
    }),

    capacity: Joi.number().integer().min(1).required().messages({
        'any.required': 'Capacity is required',
        'number.min':   'Capacity must be at least 1',
    }),

    description:   Joi.string().trim().max(500).allow('').optional(),
    targetClasses: Joi.array().items(Joi.string().trim()).default([]).optional(),

    status: Joi.string()
        .valid(...TRIP_STATUSES)
        .default('Open')
        .optional()
        .messages({
            'any.only': `Status must be one of: ${TRIP_STATUSES.join(', ')}`,
        }),
});

// ─── 4.10  Update Special Trip (all fields optional) ──────────────────────────

const updateTripSchema = createTripSchema.fork(
    ['name', 'date', 'destination', 'fee', 'capacity'],
    (field) => field.optional()
);

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    validate,
    createRouteSchema,
    updateRouteSchema,
    enrollmentQuerySchema,
    enrollStudentSchema,
    removeEnrollmentQuerySchema,
    tripQuerySchema,
    createTripSchema,
    updateTripSchema,
};
