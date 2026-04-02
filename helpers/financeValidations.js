/**
 * financeValidations.js
 *
 * Joi validation schemas for the Finance module (2.1 – 2.9).
 *
 *   recordPaymentSchema  — 2.4  POST /finance/payments
 *   generateInvoicesSchema — 2.8  POST /finance/invoices/generate
 *   feeRecordQuerySchema   — 2.2  GET  /finance/fees (query params)
 *   paymentQuerySchema     — 2.5  GET  /finance/payments (query params)
 *   invoiceQuerySchema     — 2.6  GET  /finance/invoices (query params)
 *   summaryQuerySchema     — 2.1  GET  /finance/summary (query params)
 */

const Joi = require('joi');
const { PAYMENT_METHODS } = require('../model/finance.model');

// ─── Generic validation runner ────────────────────────────────────────────────

/**
 * Validates `data` against `schema`.
 * Returns { error, value } — matches Joi's native pattern.
 */
const validate = (schema, data) =>
    schema.validate(data, { abortEarly: false, stripUnknown: true });

// ─── 2.1  Finance Summary — query params ─────────────────────────────────────

const summaryQuerySchema = Joi.object({
    term: Joi.string().trim().allow('').optional(),
});

// ─── 2.2  Fee Records — query params ─────────────────────────────────────────

const feeRecordQuerySchema = Joi.object({
    page:                Joi.number().integer().min(1).default(1).optional(),
    limit:               Joi.number().integer().min(1).max(100).default(20).optional(),
    search:              Joi.string().trim().allow('').optional(),
    class:               Joi.string().trim().allow('').optional(),
    status:              Joi.string().valid('Paid', 'Partial', 'Low', 'Unpaid').optional(),
    schoolingOption:     Joi.string().valid('Boarding', 'Day').optional(),
    paidPercentLessThan: Joi.number().integer().min(1).max(100).optional(),
    term:                Joi.string().trim().allow('').optional(),
});

// ─── 2.3  Single Student Fee Record — query params ────────────────────────────

const studentFeeQuerySchema = Joi.object({
    term: Joi.string().trim().allow('').optional(),
});

// ─── 2.4  Record Payment ──────────────────────────────────────────────────────

const recordPaymentSchema = Joi.object({
    studentId: Joi.string().trim().required().messages({
        'any.required': 'studentId is required',
    }),

    amount: Joi.number().positive().required().messages({
        'any.required': 'amount is required',
        'number.positive': 'amount must be greater than 0',
    }),

    method: Joi.string()
        .valid(...PAYMENT_METHODS)
        .required()
        .messages({
            'any.only':    `method must be one of: ${PAYMENT_METHODS.join(', ')}`,
            'any.required': 'method is required',
        }),

    reference:  Joi.string().trim().max(100).allow('').optional(),

    date: Joi.date().iso().required().messages({
        'any.required': 'date is required',
        'date.base':    'date must be a valid ISO date string',
    }),

    term:       Joi.string().trim().allow('').optional(),
    receivedBy: Joi.string().trim().max(100).allow('').optional(),
});

// ─── 2.5  Payments List — query params ───────────────────────────────────────

const paymentQuerySchema = Joi.object({
    page:     Joi.number().integer().min(1).default(1).optional(),
    limit:    Joi.number().integer().min(1).max(100).default(20).optional(),
    search:   Joi.string().trim().allow('').optional(),
    method:   Joi.string().valid(...PAYMENT_METHODS).optional(),
    dateFrom: Joi.date().iso().optional(),
    dateTo:   Joi.date().iso().min(Joi.ref('dateFrom')).optional().messages({
        'date.min': 'dateTo must be after dateFrom',
    }),
    term:     Joi.string().trim().allow('').optional(),
});

// ─── 2.6  Invoices List — query params ───────────────────────────────────────

const invoiceQuerySchema = Joi.object({
    page:   Joi.number().integer().min(1).default(1).optional(),
    limit:  Joi.number().integer().min(1).max(100).default(15).optional(),
    search: Joi.string().trim().allow('').optional(),
    status: Joi.string().valid('Paid', 'Partial', 'Unpaid').optional(),
    term:   Joi.string().trim().allow('').optional(),
});

// ─── 2.8  Generate Invoices ───────────────────────────────────────────────────

const generateInvoicesSchema = Joi.object({
    term: Joi.string().trim().required().messages({
        'any.required': 'term is required',
    }),
    session: Joi.string().trim().required().messages({
        'any.required': 'session is required',
    }),
    overwrite: Joi.boolean().default(false).optional(),
});

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    validate,
    summaryQuerySchema,
    feeRecordQuerySchema,
    studentFeeQuerySchema,
    recordPaymentSchema,
    paymentQuerySchema,
    invoiceQuerySchema,
    generateInvoicesSchema,
};
