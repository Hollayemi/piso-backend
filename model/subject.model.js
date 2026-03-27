/**
 * subject.model.js
 *
 * Represents a single academic subject (e.g. Mathematics, Biology).
 *
 * Relationships (denormalised for read performance):
 *   - teachers[] → array of { staffId, name, dept } snapshots
 *   - classes[]  → array of class name strings
 *
 * The Timetable model also references subjectId, so deleting a subject
 * must cascade — handled in subjectService.deleteSubject().
 */

const mongoose = require('mongoose');

// ─── Constants ────────────────────────────────────────────────────────────────

const SUBJECT_CATEGORIES = ['Core', 'Elective', 'Vocational'];

const SUBJECT_DEPTS = [
    'Science',
    'Arts',
    'Commercial',
    'Languages',
    'Humanities',
    'General',
];

// ─── Sub-schema: embedded teacher snapshot ────────────────────────────────────

const SubjectTeacherSchema = new mongoose.Schema(
    {
        staffId: { type: String, trim: true },
        name:    { type: String, trim: true },
        dept:    { type: String, trim: true, default: '' },
    },
    { _id: false }
);

// ─── Main Subject Schema ──────────────────────────────────────────────────────

const SubjectSchema = new mongoose.Schema(
    {
        // ── System / Identity ──────────────────────────────────────────────
        subjectId: {
            type:     String,
            unique:   true,
            required: true,
            trim:     true,
            // Format: SUB-NNN  e.g. SUB-001
        },

        serialNumber: {
            type:     Number,
            required: true,
        },

        // ── Core Fields ────────────────────────────────────────────────────
        name: {
            type:      String,
            required:  [true, 'Subject name is required'],
            unique:    true,
            trim:      true,
            maxlength: [100, 'Subject name cannot exceed 100 characters'],
        },

        code: {
            type:      String,
            required:  [true, 'Subject code is required'],
            unique:    true,
            trim:      true,
            uppercase: true,
            maxlength: [6, 'Subject code cannot exceed 6 characters'],
            // e.g. "MTH", "ENG", "BIO"
        },

        category: {
            type:     String,
            required: [true, 'Category is required'],
            enum:     SUBJECT_CATEGORIES,
        },

        dept: {
            type:    String,
            enum:    SUBJECT_DEPTS,
            default: 'General',
        },

        periodsPerWeek: {
            type:    Number,
            min:     [1, 'Must have at least 1 period per week'],
            max:     [10, 'Cannot exceed 10 periods per week'],
            default: 1,
        },

        color: {
            type:    String,
            trim:    true,
            default: 'bg-gray-100 text-gray-700',
            // Tailwind class string for UI rendering
        },

        // ── Relationships (denormalised) ───────────────────────────────────
        teachers: {
            type:    [SubjectTeacherSchema],
            default: [],
        },

        classes: {
            type:    [String],
            default: [],
            // Array of class name strings e.g. ["JSS 1A", "SS 2 Science"]
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

SubjectSchema.index({ subjectId:  1 });
SubjectSchema.index({ code:       1 });
SubjectSchema.index({ category:   1 });
SubjectSchema.index({ dept:       1 });
SubjectSchema.index({ createdAt: -1 });

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = mongoose.model('Subject', SubjectSchema);
module.exports.SUBJECT_CATEGORIES = SUBJECT_CATEGORIES;
module.exports.SUBJECT_DEPTS      = SUBJECT_DEPTS;
