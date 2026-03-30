/**
 * model/parent.model.js
 *
 * Represents a parent/guardian account in the system.
 *
 * A parent is linked to one or more Student documents via their
 * `linkedStudentIds` array. The link is established when:
 *   (a) A student is registered and the parent email matches, OR
 *   (b) An admin manually links the parent account to a student.
 *
 * ID format: PAR-YYYY-NNNN  e.g. PAR-2025-0001
 *
 * Authentication:
 *   Parents authenticate via the same /auth/login endpoint as staff.
 *   The JWT payload will contain role: 'parent'.
 *   The protect middleware maps role 'parent' → no Staff record lookup;
 *   parentAuth middleware loads the Parent record instead.
 *
 * Relationship to Student model:
 *   Student.father.email or Student.mother.email === Parent.email
 *   is the primary link. `linkedStudentIds` is a denormalised cache
 *   for fast child lookups.
 */

const mongoose  = require('mongoose');
const bcrypt    = require('bcryptjs');

// ─── Constants ────────────────────────────────────────────────────────────────

const RELATIONS = ['father', 'mother', 'guardian'];

// ─── Main Schema ──────────────────────────────────────────────────────────────

const ParentSchema = new mongoose.Schema(
    {
        // ── Identity ───────────────────────────────────────────────────────
        parentId: {
            type:     String,
            unique:   true,
            required: true,
            trim:     true,
            // Format: PAR-YYYY-NNNN
        },

        serialNumber: {
            type:     Number,
            required: true,
        },

        // ── Personal ───────────────────────────────────────────────────────
        name: {
            type:     String,
            required: [true, 'Name is required'],
            trim:     true,
        },

        email: {
            type:      String,
            required:  [true, 'Email is required'],
            unique:    true,
            lowercase: true,
            trim:      true,
        },

        phone: {
            type:    String,
            trim:    true,
            default: '',
        },

        whatsApp: {
            type:    String,
            trim:    true,
            default: '',
        },

        homeAddress: {
            type:    String,
            trim:    true,
            default: '',
        },

        occupation: {
            type:    String,
            trim:    true,
            default: '',
        },

        relation: {
            type:    String,
            enum:    RELATIONS,
            default: 'guardian',
        },

        // ── Linked children ────────────────────────────────────────────────
        /**
         * Array of Student.studentId strings.
         * Populated by admissionService when a student is admitted and
         * the parent email matches, or manually by an admin.
         */
        linkedStudentIds: {
            type:    [String],
            default: [],
        },

        // ── Auth ───────────────────────────────────────────────────────────
        password: {
            type:   String,
            select: false,
        },

        mustResetPassword: {
            type:    Boolean,
            default: false,
        },

        lastLogin: {
            type: Date,
            default: null,
        },

        // ── Preferences ────────────────────────────────────────────────────
        notificationPreferences: {
            email: { type: Boolean, default: true },
            sms:   { type: Boolean, default: false },
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

ParentSchema.index({ parentId:        1 });
ParentSchema.index({ email:           1 });
ParentSchema.index({ linkedStudentIds: 1 });
ParentSchema.index({ createdAt:      -1 });

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = mongoose.model('Parent', ParentSchema);
module.exports.RELATIONS = RELATIONS;
