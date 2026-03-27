/**
 * busEnrollment.model.js
 *
 * Represents a student's enrollment on a specific bus route for a given term.
 *
 * One enrollment = one student × one term × one route.
 * A student cannot have two active enrollments for the same term.
 *
 * Payment tracking (amountPaid, balance, payStatus) is self-contained
 * on this document — not linked to the main Finance module.
 */

const mongoose = require('mongoose');

// ─── Constants ────────────────────────────────────────────────────────────────

const BUS_PAY_STATUSES = ['Paid', 'Partial', 'Unpaid'];

// ─── Main Schema ──────────────────────────────────────────────────────────────

const BusEnrollmentSchema = new mongoose.Schema(
    {
        // ── Student reference ──────────────────────────────────────────────
        studentId: {
            type:     String,
            required: [true, 'Student ID is required'],
            trim:     true,
            ref:      'Student',
        },

        // Denormalised student snapshot for fast list reads
        studentName: {
            type:    String,
            trim:    true,
            default: '',
        },

        studentClass: {
            type:    String,
            trim:    true,
            default: '',
        },

        gender: {
            type:    String,
            trim:    true,
            default: '',
        },

        parentPhone: {
            type:    String,
            trim:    true,
            default: '',
        },

        // ── Route reference ────────────────────────────────────────────────
        routeId: {
            type:     String,
            required: [true, 'Route ID is required'],
            trim:     true,
            ref:      'BusRoute',
        },

        // Denormalised route snapshot
        routeName: {
            type:    String,
            trim:    true,
            default: '',
        },

        stop: {
            type:     String,
            required: [true, 'Stop is required'],
            trim:     true,
        },

        // ── Term ───────────────────────────────────────────────────────────
        term: {
            type:     String,
            required: [true, 'Term is required'],
            trim:     true,
            // e.g. "1st Term 2025/2026"
        },

        // ── Payment ────────────────────────────────────────────────────────
        termFee: {
            type:    Number,
            default: 0,
            // Copied from the route fee at time of enrollment
        },

        amountPaid: {
            type:    Number,
            default: 0,
        },

        balance: {
            type:    Number,
            default: 0,
        },

        payStatus: {
            type:    String,
            enum:    BUS_PAY_STATUSES,
            default: 'Unpaid',
        },

        enrolledDate: {
            type:    Date,
            default: Date.now,
        },

        // ── Audit ──────────────────────────────────────────────────────────
        enrolledBy:    { type: String, default: '' },
        lastUpdatedBy: { type: String, default: '' },
    },
    {
        timestamps: true,
        toJSON:     { virtuals: true },
        toObject:   { virtuals: true },
    }
);

// ─── Compound index — one enrollment per student per term ─────────────────────

BusEnrollmentSchema.index(
    { studentId: 1, term: 1 },
    { unique: true }
);
BusEnrollmentSchema.index({ routeId:   1 });
BusEnrollmentSchema.index({ payStatus: 1 });
BusEnrollmentSchema.index({ term:      1 });
BusEnrollmentSchema.index({ enrolledDate: -1 });

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = mongoose.model('BusEnrollment', BusEnrollmentSchema);
module.exports.BUS_PAY_STATUSES = BUS_PAY_STATUSES;
