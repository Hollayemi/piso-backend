/**
 * model/paystackPayment.model.js
 *
 * Tracks every Paystack payment initiation and its lifecycle.
 *
 * States:
 *   pending   → payment initiated, waiting for user to complete on Paystack
 *   success   → Paystack confirmed payment; school fee record updated
 *   failed    → Paystack reported failure
 *   abandoned → user closed the Paystack modal without paying
 *
 * Relationship:
 *   On success, a Payment document (finance.model.js) is created and
 *   the FeeRecord is updated. This document acts as the audit trail
 *   for all Paystack-initiated transactions.
 */

const mongoose = require('mongoose');

const PAYSTACK_STATUSES = ['pending', 'success', 'failed', 'abandoned'];

const PaystackPaymentSchema = new mongoose.Schema(
    {
        // ── Paystack identifiers ───────────────────────────────────────────
        /**
         * Our own reference — prefixed with PISO- for easy identification
         * in the Paystack dashboard. This is sent to Paystack as `reference`
         * and comes back in the webhook `data.reference`.
         */
        reference: {
            type:     String,
            unique:   true,
            required: true,
            trim:     true,
            // Format: PISO-{studentId}-{timestamp}
        },

        /**
         * Paystack's own transaction ID — populated after verification.
         * Used to reconcile with Paystack's dashboard.
         */
        paystackTxId: {
            type:    Number,
            default: null,
        },

        /**
         * The authorization URL the parent is redirected to (Paystack Popup
         * or redirect flow). Stored so it can be returned to the frontend.
         */
        authorizationUrl: {
            type:    String,
            default: '',
        },

        // ── Context ────────────────────────────────────────────────────────
        parentId: {
            type:     String,
            required: true,
            trim:     true,
            ref:      'Parent',
        },

        studentId: {
            type:     String,
            required: true,
            trim:     true,
            ref:      'Student',
        },

        studentName: {
            type:    String,
            trim:    true,
            default: '',
        },

        /**
         * Term this payment is for e.g. "1st Term 2025/2026"
         */
        term: {
            type:     String,
            required: true,
            trim:     true,
        },

        // ── Amounts — stored in Kobo (Paystack's smallest unit) ───────────
        /**
         * Amount in Kobo sent to Paystack (amount × 100).
         * Always stored in Kobo regardless of currency.
         */
        amountKobo: {
            type:     Number,
            required: true,
            min:      100, // minimum 1 Naira
        },

        /**
         * Convenience field in Naira for display (amountKobo / 100).
         */
        amountNaira: {
            type:     Number,
            required: true,
        },

        currency: {
            type:    String,
            default: 'NGN',
        },

        // ── Status ─────────────────────────────────────────────────────────
        status: {
            type:    String,
            enum:    PAYSTACK_STATUSES,
            default: 'pending',
        },

        /**
         * The gateway response message from Paystack (e.g. "Approved").
         * Populated after verification.
         */
        gatewayResponse: {
            type:    String,
            trim:    true,
            default: '',
        },

        /**
         * Payment channel used by the payer on Paystack's side:
         * card, bank, ussd, qr, mobile_money, bank_transfer
         */
        channel: {
            type:    String,
            trim:    true,
            default: '',
        },

        // ── School finance link ────────────────────────────────────────────
        /**
         * Set to the Payment.paymentId after the school fee record is updated.
         * Null while status is pending.
         */
        schoolPaymentId: {
            type:    String,
            default: null,
        },

        // ── Webhook / verification metadata ───────────────────────────────
        webhookReceivedAt: {
            type: Date,
            default: null,
        },

        verifiedAt: {
            type: Date,
            default: null,
        },

        /**
         * Raw Paystack webhook payload stored for audit / debugging.
         * Stored as Mixed (not enforced shape) to survive API changes.
         */
        webhookPayload: {
            type:    mongoose.Schema.Types.Mixed,
            default: null,
        },

        // ── Audit ──────────────────────────────────────────────────────────
        initiatedBy: {
            type:    String, // parentId
            default: '',
        },
    },
    {
        timestamps: true,
        toJSON:     { virtuals: true },
        toObject:   { virtuals: true },
    }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

PaystackPaymentSchema.index({ reference:  1 });
PaystackPaymentSchema.index({ parentId:   1 });
PaystackPaymentSchema.index({ studentId:  1 });
PaystackPaymentSchema.index({ status:     1 });
PaystackPaymentSchema.index({ createdAt: -1 });

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = mongoose.model('PaystackPayment', PaystackPaymentSchema);
module.exports.PAYSTACK_STATUSES = PAYSTACK_STATUSES;
