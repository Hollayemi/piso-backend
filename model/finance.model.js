/**
 * finance.model.js
 *
 * Three models for the Finance module (2.1 – 2.9):
 *
 *   FeeRecord  — one per student × term; tracks total fee + running balance
 *   Payment    — one per transaction; child of FeeRecord
 *   Invoice    — one per student × term; mirrors FeeRecord with line items
 *
 * Design decisions:
 *  - FeeRecord is the source of truth for balance calculations.
 *  - Payment always references a FeeRecord; recording a payment mutates
 *    the parent FeeRecord in the service layer (atomic upsert pattern).
 *  - Invoice is a read/send artefact generated from a FeeRecord;
 *    it is not the authoritative balance — that lives on FeeRecord.
 *  - Fee status is derived from paidPercent:
 *      100 %  → Paid   |  1–99 % → Partial  |  < 25 % → Low  |  0 % → Unpaid
 */

const mongoose = require('mongoose');

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_METHODS  = ['Bank Transfer', 'POS', 'Cash', 'Online'];
const FEE_STATUSES     = ['Paid', 'Partial', 'Low', 'Unpaid'];
const INVOICE_STATUSES = ['Paid', 'Partial', 'Unpaid'];

// ─── FeeRecord ────────────────────────────────────────────────────────────────

/**
 * One document per (studentId × term).
 * Updated atomically each time a Payment is recorded.
 */
const FeeRecordSchema = new mongoose.Schema(
    {
        // ── Student snapshot ───────────────────────────────────────────────
        studentId: {
            type:     String,
            required: [true, 'studentId is required'],
            trim:     true,
            ref:      'Student',
        },

        studentName: { type: String, trim: true, default: '' },
        class:       { type: String, trim: true, default: '' },
        schooling:   { type: String, trim: true, default: '' }, // 'Day' | 'Boarding'

        // ── Term ───────────────────────────────────────────────────────────
        term: {
            type:     String,
            required: [true, 'term is required'],
            trim:     true,
            // e.g. "1st Term 2025/2026"
        },

        session: {
            type:     String,
            required: [true, 'session is required'],
            trim:     true,
        },

        // ── Fee structure ──────────────────────────────────────────────────
        totalFee: {
            type:    Number,
            default: 0,
            min:     [0, 'totalFee cannot be negative'],
        },

        totalPaid: {
            type:    Number,
            default: 0,
            min:     [0, 'totalPaid cannot be negative'],
        },

        balance: {
            type:    Number,
            default: 0,
        },

        paidPercent: {
            type:    Number,
            default: 0,
            min:     0,
            max:     100,
        },

        /**
         * Derived status — recomputed on every payment:
         *   paidPercent === 100        → 'Paid'
         *   paidPercent in (25, 99)    → 'Partial'
         *   paidPercent in (0,  25)    → 'Low'
         *   paidPercent === 0          → 'Unpaid'
         */
        status: {
            type:    String,
            enum:    FEE_STATUSES,
            default: 'Unpaid',
        },

        lastPaymentDate: { type: Date, default: null },

        // ── Audit ──────────────────────────────────────────────────────────
        createdBy:     { type: String, default: '' },
        lastUpdatedBy: { type: String, default: '' },
    },
    {
        timestamps: true,
        toJSON:     { virtuals: true },
        toObject:   { virtuals: true },
    }
);

// Compound uniqueness — one record per student per term
FeeRecordSchema.index({ studentId: 1, term: 1 }, { unique: true });
FeeRecordSchema.index({ class:    1 });
FeeRecordSchema.index({ status:   1 });
FeeRecordSchema.index({ term:     1 });
FeeRecordSchema.index({ createdAt: -1 });

// ─── Payment ──────────────────────────────────────────────────────────────────

/**
 * One document per payment transaction.
 * ID format:  PAY-{studentId}-{serial}  e.g. PAY-STU-2024-0001-3
 */
const PaymentSchema = new mongoose.Schema(
    {
        // ── System / Identity ──────────────────────────────────────────────
        paymentId: {
            type:     String,
            unique:   true,
            required: true,
            trim:     true,
        },

        serialNumber: { type: Number, required: true },

        // ── References ─────────────────────────────────────────────────────
        studentId: {
            type:     String,
            required: [true, 'studentId is required'],
            trim:     true,
            ref:      'Student',
        },

        feeRecordId: {
            type:     mongoose.Schema.Types.ObjectId,
            required: true,
            ref:      'FeeRecord',
        },

        // ── Denormalised student snapshot for fast list reads ──────────────
        studentName: { type: String, trim: true, default: '' },
        class:       { type: String, trim: true, default: '' },
        schooling:   { type: String, trim: true, default: '' },

        // ── Payment details ────────────────────────────────────────────────
        amount: {
            type:     Number,
            required: [true, 'amount is required'],
            min:      [1, 'amount must be greater than 0'],
        },

        method: {
            type:     String,
            required: [true, 'payment method is required'],
            enum:     PAYMENT_METHODS,
        },

        reference: {
            type:    String,
            trim:    true,
            default: '',
        },

        date: {
            type:     Date,
            required: [true, 'payment date is required'],
        },

        term: {
            type:     String,
            required: [true, 'term is required'],
            trim:     true,
        },

        receivedBy: {
            type:    String,
            trim:    true,
            default: '',
        },

        // ── Audit ──────────────────────────────────────────────────────────
        recordedBy: { type: String, default: '' }, // staffId of the recorder
    },
    {
        timestamps: true,
        toJSON:     { virtuals: true },
        toObject:   { virtuals: true },
    }
);

PaymentSchema.index({ studentId:  1 });
PaymentSchema.index({ term:       1 });
PaymentSchema.index({ date:      -1 });
PaymentSchema.index({ method:     1 });
PaymentSchema.index({ feeRecordId: 1 });
PaymentSchema.index({ createdAt: -1 });

// ─── Invoice ──────────────────────────────────────────────────────────────────

/**
 * One document per (studentId × term).
 * Generated via POST /finance/invoices/generate — mirrors the FeeRecord
 * but adds line items and a due date, and tracks whether it was sent.
 *
 * ID format:  INV-YYYY-NNNN  e.g. INV-2025-1001
 */
const LineItemSchema = new mongoose.Schema(
    {
        description: { type: String, trim: true, required: true },
        amount:      { type: Number, required: true, min: 0 },
    },
    { _id: false }
);

const InvoiceSchema = new mongoose.Schema(
    {
        // ── System / Identity ──────────────────────────────────────────────
        invoiceId: {
            type:     String,
            unique:   true,
            required: true,
            trim:     true,
        },

        serialNumber: { type: Number, required: true },

        // ── References ─────────────────────────────────────────────────────
        studentId: {
            type:     String,
            required: [true, 'studentId is required'],
            trim:     true,
            ref:      'Student',
        },

        feeRecordId: {
            type:     mongoose.Schema.Types.ObjectId,
            required: true,
            ref:      'FeeRecord',
        },

        // ── Denormalised student snapshot ──────────────────────────────────
        studentName: { type: String, trim: true, default: '' },
        class:       { type: String, trim: true, default: '' },
        schooling:   { type: String, trim: true, default: '' },

        // ── Invoice details ────────────────────────────────────────────────
        term: {
            type:     String,
            required: [true, 'term is required'],
            trim:     true,
        },

        session: {
            type:     String,
            required: [true, 'session is required'],
            trim:     true,
        },
        issuedDate: { type: Date, default: Date.now },
        dueDate:    { type: Date, required: [true, 'dueDate is required'] },

        lineItems: {
            type:     [LineItemSchema],
            default:  [],
        },

        // ── Totals (synced from FeeRecord on generation + payment) ─────────
        totalFee:   { type: Number, default: 0 },
        amountPaid: { type: Number, default: 0 },
        balance:    { type: Number, default: 0 },

        status: {
            type:    String,
            enum:    INVOICE_STATUSES,
            default: 'Unpaid',
        },

        sentToParent: { type: Boolean, default: false },
        sentAt:       { type: Date,    default: null  },

        // ── Audit ──────────────────────────────────────────────────────────
        generatedBy:   { type: String, default: '' },
        lastUpdatedBy: { type: String, default: '' },
    },
    {
        timestamps: true,
        toJSON:     { virtuals: true },
        toObject:   { virtuals: true },
    }
);

// Compound uniqueness — one invoice per student per term
InvoiceSchema.index({ studentId: 1, term: 1 }, { unique: true });
InvoiceSchema.index({ status:    1 });
InvoiceSchema.index({ term:      1 });
InvoiceSchema.index({ class:     1 });
InvoiceSchema.index({ createdAt: -1 });

// ─── Models & Exports ─────────────────────────────────────────────────────────

const FeeRecord = mongoose.model('FeeRecord', FeeRecordSchema);
const Payment   = mongoose.model('Payment',   PaymentSchema);
const Invoice   = mongoose.model('Invoice',   InvoiceSchema);

module.exports = {
    FeeRecord,
    Payment,
    Invoice,
    PAYMENT_METHODS,
    FEE_STATUSES,
    INVOICE_STATUSES,
};
