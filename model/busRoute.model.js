/**
 * busRoute.model.js
 *
 * Represents a single school bus route.
 *
 * Relationships:
 *   - BusEnrollment references routeId
 *   - Deleting a route is blocked when active enrollments exist (enforced in service)
 *
 * ID format: RT-NN  e.g. RT-01, RT-12
 */

const mongoose = require('mongoose');

// ─── Main Schema ──────────────────────────────────────────────────────────────

const BusRouteSchema = new mongoose.Schema(
    {
        // ── System / Identity ──────────────────────────────────────────────
        routeId: {
            type:     String,
            unique:   true,
            required: true,
            trim:     true,
            // Format: RT-NN  e.g. RT-01
        },

        serialNumber: {
            type:     Number,
            required: true,
        },

        // ── Core Fields ────────────────────────────────────────────────────
        name: {
            type:      String,
            required:  [true, 'Route name is required'],
            unique:    true,
            trim:      true,
            maxlength: [100, 'Route name cannot exceed 100 characters'],
        },

        /**
         * Ordered list of bus stop names for this route.
         * Enrollments must reference a stop from this array.
         */
        stops: {
            type:     [String],
            required: [true, 'At least one stop is required'],
            validate: {
                validator: (arr) => Array.isArray(arr) && arr.length >= 1,
                message:   'At least one stop is required',
            },
        },

        fee: {
            type:     Number,
            required: [true, 'Route fee is required'],
            min:      [0, 'Fee cannot be negative'],
        },

        active: {
            type:    Boolean,
            default: true,
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

BusRouteSchema.index({ routeId: 1 });
BusRouteSchema.index({ name:    1 });
BusRouteSchema.index({ active:  1 });
BusRouteSchema.index({ createdAt: -1 });

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = mongoose.model('BusRoute', BusRouteSchema);
