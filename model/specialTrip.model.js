/**
 * specialTrip.model.js
 *
 * Represents a one-off school excursion or inter-school event.
 *
 * Enrollment headcount (enrolled, paidCount, unpaidCount) and financial
 * totals are computed in the service layer via aggregation against
 * TripEnrollment — they are NOT stored redundantly on this document.
 *
 * ID format: TRIP-NNN  e.g. TRIP-001
 */

const mongoose = require('mongoose');

// ─── Constants ────────────────────────────────────────────────────────────────

const TRIP_STATUSES = ['Open', 'Closed', 'Cancelled'];

// ─── Main Schema ──────────────────────────────────────────────────────────────

const SpecialTripSchema = new mongoose.Schema(
    {
        // ── System / Identity ──────────────────────────────────────────────
        tripId: {
            type:     String,
            unique:   true,
            required: true,
            trim:     true,
            // Format: TRIP-NNN  e.g. TRIP-001
        },

        serialNumber: {
            type:     Number,
            required: true,
        },

        // ── Core Fields ────────────────────────────────────────────────────
        name: {
            type:      String,
            required:  [true, 'Trip name is required'],
            trim:      true,
            maxlength: [150, 'Trip name cannot exceed 150 characters'],
        },

        date: {
            type:     Date,
            required: [true, 'Trip date is required'],
        },

        destination: {
            type:     String,
            required: [true, 'Destination is required'],
            trim:     true,
            maxlength: [200, 'Destination cannot exceed 200 characters'],
        },

        fee: {
            type:     Number,
            required: [true, 'Trip fee is required'],
            min:      [0, 'Fee cannot be negative'],
        },

        capacity: {
            type:     Number,
            required: [true, 'Capacity is required'],
            min:      [1, 'Capacity must be at least 1'],
        },

        description: {
            type:    String,
            trim:    true,
            default: '',
            maxlength: [500, 'Description cannot exceed 500 characters'],
        },

        /**
         * Optional list of class names this trip is targeted at.
         * Empty array = open to all classes.
         */
        targetClasses: {
            type:    [String],
            default: [],
        },

        status: {
            type:    String,
            enum:    TRIP_STATUSES,
            default: 'Open',
        },

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

// ─── Indexes ──────────────────────────────────────────────────────────────────

SpecialTripSchema.index({ tripId:    1 });
SpecialTripSchema.index({ status:    1 });
SpecialTripSchema.index({ date:     -1 });
SpecialTripSchema.index({ createdAt: -1 });

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = mongoose.model('SpecialTrip', SpecialTripSchema);
module.exports.TRIP_STATUSES = TRIP_STATUSES;
