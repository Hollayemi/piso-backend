/**
 * class.model.js
 *
 * Represents a single class arm within the school
 * e.g. "JSS 1A", "SS 2 Science".
 *
 * Relationships (denormalised for read performance):
 *   - classTeacher  → references Staff.staffId
 *   - studentCount  → kept as a virtual via a counter updated by studentService
 */

const mongoose = require('mongoose');

// ─── Constants ────────────────────────────────────────────────────────────────

const CLASS_LEVELS  = ['Junior', 'Senior'];

const CLASS_GROUPS  = ['JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3'];

// ─── Sub-schema: embedded class teacher snapshot ──────────────────────────────

const ClassTeacherSchema = new mongoose.Schema(
    {
        staffId:  { type: String, trim: true, default: '' },
        name:     { type: String, trim: true, default: '' },
        subject:  { type: String, trim: true, default: '' },
    },
    { _id: false }
);

// ─── Main Class Schema ────────────────────────────────────────────────────────

const ClassSchema = new mongoose.Schema(
    {
        // ── System / Identity ──────────────────────────────────────────────
        classId: {
            type:     String,
            unique:   true,
            required: true,
            trim:     true,
            // Format: CLS-NNN  e.g.  CLS-001
        },

        serialNumber: {
            type:     Number,
            required: true,
        },

        // ── Core Fields ────────────────────────────────────────────────────
        name: {
            type:      String,
            required:  [true, 'Class name is required'],
            unique:    true,
            trim:      true,
            maxlength: [50, 'Class name cannot exceed 50 characters'],
            // e.g. "JSS 1A", "SS 2 Science"
        },

        level: {
            type:     String,
            required: [true, 'Class level is required'],
            enum:     CLASS_LEVELS,
        },

        arm: {
            type:    String,
            trim:    true,
            default: '',
            // e.g. "A", "B", "Science", "Arts"
        },

        group: {
            type:     String,
            required: [true, 'Class group is required'],
            enum:     CLASS_GROUPS,
        },

        capacity: {
            type:     Number,
            required: [true, 'Capacity is required'],
            min:      [1, 'Capacity must be at least 1'],
        },

        // ── Class Teacher (denormalised snapshot) ──────────────────────────
        classTeacher: {
            type:    ClassTeacherSchema,
            default: () => ({}),
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

ClassSchema.index({ classId: 1 });
ClassSchema.index({ name:    1 });
ClassSchema.index({ level:   1 });
ClassSchema.index({ group:   1 });
ClassSchema.index({ createdAt: -1 });

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = mongoose.model('Class', ClassSchema);
module.exports.CLASS_LEVELS = CLASS_LEVELS;
module.exports.CLASS_GROUPS = CLASS_GROUPS;
