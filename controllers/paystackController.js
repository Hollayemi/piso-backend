/**
 * controllers/paystackController.js
 *
 * HTTP layer for Paystack payment endpoints (8.5 – 8.7).
 *
 * 8.5  POST /parent/payments/initiate          → initiatePayment
 * 8.6  GET  /parent/payments/verify/:reference → verifyPayment
 * 8.7  POST /parent/payments/webhook           → handleWebhook  (PUBLIC)
 */

const asyncHandler      = require('../middleware/asyncHandler');
const ErrorResponse     = require('../utils/errorResponse');
const { sendSuccess }   = require('../utils/sendResponse');
const paystackService   = require('../services/paystackService');
const Joi               = require('joi');

// ─── Validation schema ────────────────────────────────────────────────────────

const initiateSchema = Joi.object({
    studentId: Joi.string().trim().required().messages({
        'any.required': 'studentId is required',
    }),
    amount: Joi.number().positive().required().messages({
        'any.required': 'amount is required (in Naira)',
        'number.positive': 'amount must be greater than 0',
    }),
    term: Joi.string().trim().allow('').optional(),
});

// ─── 8.5  POST /parent/payments/initiate ─────────────────────────────────────

/**
 * @desc    Initiate a Paystack payment for a child's school fees
 * @route   POST /api/v1/parent/payments/initiate
 * @access  parent
 *
 * Request body:
 *   { studentId: string, amount: number (Naira), term?: string }
 *
 * Response:
 *   { reference, authorizationUrl, accessCode, amount, currency, studentName, term }
 *
 * Frontend usage:
 *   - Inline Popup: Pass accessCode to PaystackPop.newTransaction({ key, reference, ... })
 *   - Redirect:     Redirect the user to authorizationUrl
 */
exports.initiatePayment = asyncHandler(async (req, res, next) => {
    const { error, value } = initiateSchema.validate(req.body, {
        abortEarly:   false,
        stripUnknown: true,
    });

    if (error) {
        return next(
            new ErrorResponse('Validation failed', 400,
                error.details.map((d) => ({
                    field:   d.path.join('.'),
                    message: d.message.replace(/['"]/g, ''),
                }))
            )
        );
    }

    const result = await paystackService.initiatePayment(value, req.parent);
    sendSuccess(res, 200, 'Payment initiated successfully', result);
});

// ─── 8.6  GET /parent/payments/verify/:reference ─────────────────────────────

/**
 * @desc    Verify a Paystack payment reference and sync the school fee record
 * @route   GET /api/v1/parent/payments/verify/:reference
 * @access  parent
 *
 * Response:
 *   { reference, status, amount, channel, gatewayResponse, schoolPaymentId, paidAt }
 *
 * Frontend should poll this after the Paystack callback fires, or call it
 * once to confirm payment status on the success/cancel page.
 */
exports.verifyPayment = asyncHandler(async (req, res) => {
    const result = await paystackService.verifyPayment(
        req.params.reference,
        req.parent.parentId
    );

    const message = result.status === 'success'
        ? 'Payment verified successfully'
        : `Payment status: ${result.status}`;

    sendSuccess(res, 200, message, result);
});

// ─── 8.7  POST /parent/payments/webhook ──────────────────────────────────────

/**
 * @desc    Receive and process Paystack webhook events
 * @route   POST /api/v1/parent/payments/webhook
 * @access  PUBLIC — Paystack server IPs only (validate via HMAC)
 *
 * IMPORTANT: This route must use express.raw() — NOT express.json() —
 * so the raw body is available for HMAC signature validation.
 * This is already configured in parentFinanceRoutes.js.
 *
 * Paystack retries failed webhooks up to 5 times. This handler is
 * idempotent — duplicate events are safely ignored.
 */
exports.handleWebhook = async (req, res) => {
    // Always respond 200 quickly — Paystack will retry if we're slow
    const signature = req.headers['x-paystack-signature'] || '';

    try {
        const result = await paystackService.handleWebhookEvent(req.body, signature);
        console.log('[Webhook] Paystack event processed:', result);
        return res.status(200).json({ received: true });
    } catch (err) {
        console.error('[Webhook] Error processing Paystack event:', err.message);
        // Still return 200 — Paystack docs say to always 200; handle internally
        return res.status(200).json({ received: true, error: err.message });
    }
};
