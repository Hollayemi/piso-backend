/**
 * helpers/authValidations.js
 *
 * Joi validation schemas for the Auth module:
 *
 *   loginSchema          — POST /auth/login
 *   changePasswordSchema — PUT  /auth/change-password
 */

const Joi = require('joi');

// ─── Generic validation runner ────────────────────────────────────────────────

/**
 * Validates `data` against `schema`.
 * Returns { error, value } — matches Joi's native pattern.
 *
 * @param {object} schema - Joi schema
 * @param {object} data   - Raw request body / query
 */
const validate = (schema, data) =>
    schema.validate(data, { abortEarly: false, stripUnknown: true });

// ─── POST /auth/login ─────────────────────────────────────────────────────────

const loginSchema = Joi.object({
    email: Joi.string().email().lowercase().required().messages({
        'string.email':  'Please provide a valid email address',
        'any.required':  'Email is required',
    }),
    login_type: Joi.string().valid('admin', 'parent').required().messages({
        'any.only':     'Login type must be either "admin" or "admission"',
        'any.required': 'Login type is required',
    }),
    password: Joi.string().min(1).required().messages({
        'any.required': 'Password is required',
    }),
});

// ─── PUT /auth/change-password ────────────────────────────────────────────────

const changePasswordSchema = Joi.object({
    currentPassword: Joi.string().required().messages({
        'any.required': 'Current password is required',
    }),

    newPassword: Joi.string().min(8).required().messages({
        'string.min':   'New password must be at least 8 characters',
        'any.required': 'New password is required',
    }),

    confirmPassword: Joi.string()
        .valid(Joi.ref('newPassword'))
        .required()
        .messages({
            'any.only':    'Passwords do not match',
            'any.required': 'Please confirm your new password',
        }),
});

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    validate,
    loginSchema,
    changePasswordSchema,
};
