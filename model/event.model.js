/**
 * model/event.model.js
 *
 * Represents a school event, notice, or announcement visible to parents
 * and managed by admin staff.
 *
 * Design decisions:
 *   - `targetAudience` is an array so one event can address multiple groups
 *     (e.g. ['Senior Secondary', 'Parents']) while still filtering efficiently.
 *   - `requiresPayment` + `paymentAmount` + `paymentDeadline` are co-located
 *     so the parent portal can show an "action required" badge without an
 *     extra round-trip.
 *   - `notifiedAt` is set by the admin when the "Notify Parents" action fires;
 *     it is null until that action is taken.
 *   - `isNew` is a virtual: true when createdAt is within the last 7 days
 *     OR when the admin explicitly set `markedNewUntil`.
 *   - ID format: EVT-YYYY-NNNN  e.g. EVT-2025-0001
 */

const mongoose = require('mongoose');

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_TYPES = [
    'Academic',
    'Cultural',
    'Sports',
    'PTA Meeting',
    'Examination',
    'Holiday',
    'Trip',
    'Ceremony',
    'Health',
    'General',
];

const EVENT_STATUSES = ['Upcoming', 'Ongoing', 'Completed', 'Cancelled'];

const TARGET_AUDIENCES = [
    'All',
    'Junior Secondary',
    'Senior Secondary',
    'Boarding',
    'Day',
    'Parents',
    'Staff',
];

// ─── Main Schema ──────────────────────────────────────────────────────────────

const EventSchema = new mongoose.Schema(
    {
        // ── System / Identity ──────────────────────────────────────────────
        eventId: {
            type:     String,
            unique:   true,
            required: true,
            trim:     true,
            // Format: EVT-YYYY-NNNN
        },

        serialNumber: {
            type:     Number,
            required: true,
        },

        // ── Core Fields ────────────────────────────────────────────────────
        title: {
            type:      String,
            required:  [true, 'Event title is required'],
            trim:      true,
            maxlength: [150, 'Title cannot exceed 150 characters'],
        },

        type: {
            type:     String,
            required: [true, 'Event type is required'],
            enum:     EVENT_TYPES,
            default:  'General',
        },

        description: {
            type:    String,
            trim:    true,
            default: '',
            maxlength: [2000, 'Description cannot exceed 2000 characters'],
        },

        // ── Dates & Time ───────────────────────────────────────────────────
        /**
         * Primary event date (start date for multi-day events).
         * Stored as a plain Date — the frontend formats it per locale.
         */
        date: {
            type:     Date,
            required: [true, 'Event date is required'],
        },

        /**
         * Optional end date for multi-day events (e.g. exam week).
         * When null, the event is treated as a single-day event.
         */
        endDate: {
            type:    Date,
            default: null,
        },

        /**
         * Human-readable time string e.g. "8:00 AM".
         * Stored as a string rather than a Date field for flexibility.
         */
        time: {
            type:    String,
            trim:    true,
            default: '',
        },

        // ── Location ───────────────────────────────────────────────────────
        location: {
            type:    String,
            trim:    true,
            default: '',
            maxlength: [200, 'Location cannot exceed 200 characters'],
        },

        // ── Audience & Status ──────────────────────────────────────────────
        targetAudience: {
            type:    [String],
            enum:    TARGET_AUDIENCES,
            default: ['All'],
        },

        status: {
            type:    String,
            enum:    EVENT_STATUSES,
            default: 'Upcoming',
        },

        // ── Payment ────────────────────────────────────────────────────────
        requiresPayment: {
            type:    Boolean,
            default: false,
        },

        paymentAmount: {
            type:    Number,
            default: 0,
            min:     [0, 'Payment amount cannot be negative'],
        },

        paymentDeadline: {
            type:    Date,
            default: null,
        },

        // ── Notification ───────────────────────────────────────────────────
        /**
         * Timestamp of the last "Notify Parents" push.
         * Null until the admin fires the notification action.
         */
        notifiedAt: {
            type:    Date,
            default: null,
        },

        /**
         * Admin can manually extend the "New" badge beyond the 7-day default.
         */
        markedNewUntil: {
            type:    Date,
            default: null,
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

// ─── Virtual: isNew ───────────────────────────────────────────────────────────

/**
 * An event is "new" if:
 *   a) It was created within the last 7 days, OR
 *   b) The admin has explicitly set markedNewUntil to a future date.
 */
EventSchema.virtual('isNew').get(function () {
    const now      = new Date();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    if (this.markedNewUntil && this.markedNewUntil > now) return true;
    return this.createdAt >= sevenDaysAgo;
});

// ─── Virtual: isPast ──────────────────────────────────────────────────────────

EventSchema.virtual('isPast').get(function () {
    const refDate = this.endDate || this.date;
    return refDate < new Date();
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

EventSchema.index({ eventId:    1 });
EventSchema.index({ date:      -1 });
EventSchema.index({ type:       1 });
EventSchema.index({ status:     1 });
EventSchema.index({ requiresPayment: 1 });
EventSchema.index({ targetAudience:  1 });
EventSchema.index({ notifiedAt:     -1 });
EventSchema.index({ createdAt:      -1 });
// Text index for search
EventSchema.index({ title: 'text', description: 'text' });

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = mongoose.model('Event', EventSchema);
module.exports.EVENT_TYPES      = EVENT_TYPES;
module.exports.EVENT_STATUSES   = EVENT_STATUSES;
module.exports.TARGET_AUDIENCES = TARGET_AUDIENCES;
