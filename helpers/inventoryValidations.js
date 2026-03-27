/**
 * inventoryValidations.js
 *
 * Joi validation schemas for the Inventory module (3.1 – 3.6).
 *
 *   listQuerySchema    — 3.1  GET  /inventory
 *   createItemSchema   — 3.3  POST /inventory
 *   updateItemSchema   — 3.4  PUT  /inventory/:id  (all fields optional)
 */

const Joi = require('joi');
const { ITEM_CONDITIONS, ITEM_CATEGORIES, LOCATION_TYPES } = require('../model/inventory.model');

// ─── Generic validation runner ────────────────────────────────────────────────

const validate = (schema, data) =>
    schema.validate(data, { abortEarly: false, stripUnknown: true });

// ─── 3.1  List Query — query params ──────────────────────────────────────────

const listQuerySchema = Joi.object({
    page:         Joi.number().integer().min(1).default(1).optional(),
    limit:        Joi.number().integer().min(1).max(100).default(20).optional(),
    search:       Joi.string().trim().allow('').optional(),
    locationType: Joi.string().valid(...LOCATION_TYPES).optional(),
    location:     Joi.string().trim().allow('').optional(),
    category:     Joi.string().valid(...ITEM_CATEGORIES).optional(),
    condition:    Joi.string().valid(...ITEM_CONDITIONS).optional(),
});

// ─── 3.3  Create Item ─────────────────────────────────────────────────────────

const createItemSchema = Joi.object({
    name: Joi.string().trim().min(2).max(150).required().messages({
        'any.required': 'Item name is required',
        'string.min':   'Item name must be at least 2 characters',
        'string.max':   'Item name cannot exceed 150 characters',
    }),

    category: Joi.string()
        .valid(...ITEM_CATEGORIES)
        .required()
        .messages({
            'any.only':    `Category must be one of: ${ITEM_CATEGORIES.join(', ')}`,
            'any.required': 'Category is required',
        }),

    location: Joi.string().trim().min(2).max(100).required().messages({
        'any.required': 'Location is required',
        'string.min':   'Location must be at least 2 characters',
    }),

    locationType: Joi.string()
        .valid(...LOCATION_TYPES)
        .required()
        .messages({
            'any.only':    `locationType must be one of: ${LOCATION_TYPES.join(', ')}`,
            'any.required': 'locationType is required',
        }),

    quantity: Joi.number().integer().min(0).required().messages({
        'any.required':  'Quantity is required',
        'number.min':    'Quantity cannot be negative',
        'number.integer': 'Quantity must be a whole number',
    }),

    unit: Joi.string().trim().min(1).max(50).required().messages({
        'any.required': 'Unit is required',
    }),

    condition: Joi.string()
        .valid(...ITEM_CONDITIONS)
        .required()
        .messages({
            'any.only':    `Condition must be one of: ${ITEM_CONDITIONS.join(', ')}`,
            'any.required': 'Condition is required',
        }),

    notes: Joi.string().trim().max(500).allow('').optional(),
});

// ─── 3.4  Update Item — all fields optional ───────────────────────────────────

const updateItemSchema = createItemSchema.fork(
    ['name', 'category', 'location', 'locationType', 'quantity', 'unit', 'condition'],
    (field) => field.optional()
);

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    validate,
    listQuerySchema,
    createItemSchema,
    updateItemSchema,
};
