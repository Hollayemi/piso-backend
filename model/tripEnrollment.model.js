/**
 * tripEnrollment.model.js
 *
 * Tracks individual student enrollment for a SpecialTrip.
 * Used to compute enrolled/paidCount/totalCollected in service aggregations.
 *
 * Deleting a SpecialTrip cascades to delete all related TripEnrollments
 * (handled in specialTripService.deleteTrip).
 */

const mongoose = require('mongoose');

const TRIP_PAY_STATUSES = ['Paid', 'Unpaid'];

const TripEnrollmentSchema = new mongoose.Schema(
    {
        tripId: {
            type:     String,
            required: [true, 'Trip ID is required'],
            trim:     true,
            ref:      'SpecialTrip',
        },

        studentId: {
            type:     String,
            required: [true, 'Student ID is required'],
            trim:     true,
            ref:      'Student',
        },

        // Denormalised snapshot for list reads
        studentName:  { type: String, trim: true, default: '' },
        studentClass: { type: String, trim: true, default: '' },

        fee: {
            type:    Number,
            default: 0,
            // Copied from the trip fee at time of enrollment
        },

        amountPaid: {
            type:    Number,
            default: 0,
        },

        payStatus: {
            type:    String,
            enum:    TRIP_PAY_STATUSES,
            default: 'Unpaid',
        },

        enrolledDate: {
            type:    Date,
            default: Date.now,
        },

        enrolledBy:    { type: String, default: '' },
    },
    { timestamps: true }
);

// One student can only enroll once per trip
TripEnrollmentSchema.index({ tripId: 1, studentId: 1 }, { unique: true });
TripEnrollmentSchema.index({ tripId:    1 });
TripEnrollmentSchema.index({ studentId: 1 });
TripEnrollmentSchema.index({ payStatus: 1 });

module.exports = mongoose.model('TripEnrollment', TripEnrollmentSchema);
module.exports.TRIP_PAY_STATUSES = TRIP_PAY_STATUSES;
