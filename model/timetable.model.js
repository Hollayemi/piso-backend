
const mongoose = require('mongoose');

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const ALL_SLOT_IDS   = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9'];
const BREAK_SLOT_IDS = [];
const TEACH_SLOT_IDS = ALL_SLOT_IDS.filter((s) => !BREAK_SLOT_IDS.includes(s));
// → ['T1', 'T2', 'T3', 'T5', 'T6', 'T8', 'T9']

// ─── Sub-schema: a single timetable cell ─────────────────────────────────────

const CellSchema = new mongoose.Schema(
    {
        subjectId:   { type: String, trim: true, default: '' },
        subjectName: { type: String, trim: true, default: '' },
        subjectCode: { type: String, trim: true, default: '' },
        color:       { type: String, trim: true, default: '' },
        teacherId:   { type: String, trim: true, default: '' },
        teacherName: { type: String, trim: true, default: '' },
        note:        { type: String, trim: true, default: '' },
    },
    { _id: false }
);

const DaySchema = new mongoose.Schema(
    {
        T1: { type: CellSchema, default: null },
        T2: { type: CellSchema, default: null },
        T3: { type: CellSchema, default: null },
        T5: { type: CellSchema, default: null },
        T6: { type: CellSchema, default: null },
        T8: { type: CellSchema, default: null },
        T9: { type: CellSchema, default: null },
    },
    { _id: false }
);

const TimetableSchema = new mongoose.Schema(
    {
        class: {
            type:     mongoose.Types.ObjectId,
            ref:       "Class",
            required: [true, 'Class name is required'],
            trim:     true,
        },
        session: {
            type:     String,
            required: [true, 'Academic session is required'],
            trim:     true,
            // e.g. "2025/2026"
        },

        term: {
            type:     String,
            required: [true, 'Term is required'],
            trim:     true,
            // e.g. "1st Term"
        },

        // ── Slot grid ─────────────────────────────────────────────────────
        slots: {
            Monday:    { type: DaySchema, default: () => ({}) },
            Tuesday:   { type: DaySchema, default: () => ({}) },
            Wednesday: { type: DaySchema, default: () => ({}) },
            Thursday:  { type: DaySchema, default: () => ({}) },
            Friday:    { type: DaySchema, default: () => ({}) },
        },

        // ── Audit ──────────────────────────────────────────────────────────
        createdBy:     { type: String, default: '' },
        lastUpdatedBy: { type: String, default: '' },
    },
    {
        timestamps: true,
    }
);

TimetableSchema.index(
    { class: 1, session: 1, term: 1 },
    { unique: true }
);
TimetableSchema.index({ class: 1 });
TimetableSchema.index({ session:   1, term: 1 });

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = mongoose.model('Timetable', TimetableSchema);
module.exports.DAYS_OF_WEEK   = DAYS_OF_WEEK;
module.exports.ALL_SLOT_IDS   = ALL_SLOT_IDS;
module.exports.BREAK_SLOT_IDS = BREAK_SLOT_IDS;
module.exports.TEACH_SLOT_IDS = TEACH_SLOT_IDS;
