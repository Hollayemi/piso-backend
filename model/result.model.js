/**
 * result.model.js
 *
 * Stores term-level academic results for each student.
 *
 * Design decisions:
 *   - One document per (studentId × term × session)
 *   - `isPublished` gate controls parent visibility — admin must explicitly
 *     publish before results appear in the parent portal
 *   - `term` uses the same full-string format as FeeRecord e.g. "1st Term 2025/2026"
 *   - `session` is stored separately for easy range queries e.g. "2025/2026"
 *   - Grades use WAEC-style notation: A1–F9
 *   - CA + Exam scores are stored individually; totalScore is pre-computed on save
 *
 * Relationships:
 *   studentId  → Student.studentId
 *   parentId   → Parent.parentId  (denormalised for fast parent-scoped queries)
 *   subjectId  → Subject.subjectId
 */

const mongoose = require('mongoose');

// ─── Constants ────────────────────────────────────────────────────────────────

const GRADE_VALUES = ['A1', 'A2', 'A3', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9'];
const REMARKS      = ['Excellent', 'Good', 'Average', 'Poor'];

/**
 * Derives WAEC-style grade from a total score (out of 100).
 */
const scoreToGrade = (score) => {
    if (score >= 75) return 'A1';
    if (score >= 70) return 'A2';
    if (score >= 65) return 'A3';
    if (score >= 60) return 'B2';
    if (score >= 55) return 'B3';
    if (score >= 50) return 'C4';
    if (score >= 45) return 'C5';
    if (score >= 40) return 'C6';
    if (score >= 35) return 'D7';
    if (score >= 30) return 'E8';
    return 'F9';
};

/**
 * Derives a human-readable remark from a total score.
 */
const scoreToRemark = (score) => {
    if (score >= 75) return 'Excellent';
    if (score >= 50) return 'Good';
    if (score >= 40) return 'Average';
    return 'Poor';
};

// ─── Sub-schema: per-subject score entry ──────────────────────────────────────

const SubjectScoreSchema = new mongoose.Schema(
    {
        subjectId:   { type: String, trim: true, required: true },
        name:        { type: String, trim: true, required: true },   // denormalised
        code:        { type: String, trim: true, default: '' },       // e.g. "MTH"
        caScore:     { type: Number, default: 0, min: 0, max: 40 },  // Continuous Assessment (max 40)
        examScore:   { type: Number, default: 0, min: 0, max: 60 },  // Terminal exam (max 60)
        totalScore:  { type: Number, default: 0, min: 0, max: 100 }, // CA + Exam
        grade:       { type: String, enum: GRADE_VALUES, default: 'F9' },
        remark:      { type: String, enum: REMARKS,      default: 'Poor' },
    },
    { _id: false }
);

// ─── Main Result Schema ───────────────────────────────────────────────────────

const ResultSchema = new mongoose.Schema(
    {
        // ── Identity / References ──────────────────────────────────────────
        studentId: {
            type:     String,
            required: [true, 'Student ID is required'],
            trim:     true,
            ref:      'Student',
        },

        /**
         * Denormalised parentId for fast parent-scoped result queries.
         * Avoids a join through Student every time a parent loads results.
         */
        parentId: {
            type:     String,
            required: [true, 'Parent ID is required'],
            trim:     true,
            ref:      'Parent',
        },

        // Denormalised student snapshot — populated at creation
        studentName: { type: String, trim: true, default: '' },
        class:       { type: String, trim: true, required: [true, 'Class is required'] },

        // ── Academic context ───────────────────────────────────────────────
        /**
         * Full term string matching FeeRecord.term format.
         * e.g. "1st Term 2025/2026"
         */
        term: {
            type:     String,
            required: [true, 'Term is required'],
            trim:     true,
        },

        /**
         * Academic session for range queries.
         * e.g. "2025/2026"
         */
        session: {
            type:     String,
            required: [true, 'Session is required'],
            trim:     true,
        },

        // ── Class statistics ───────────────────────────────────────────────
        position:    { type: Number, default: null  },   // Position in class
        classSize:   { type: Number, default: 0     },   // Total students in class
        avg:         { type: Number, default: 0     },   // This student's average (1 dp)
        classAvg:    { type: Number, default: 0     },   // Overall class average (1 dp)
        totalScore:  { type: Number, default: 0     },   // Sum of all subject totalScores

        // ── Subjects ───────────────────────────────────────────────────────
        subjects: { type: [SubjectScoreSchema], default: [] },

        // ── Principal / Teacher remarks ────────────────────────────────────
        principalRemark: { type: String, trim: true, default: '' },
        teacherRemark:   { type: String, trim: true, default: '' },

        // ── Next-term resumption date ──────────────────────────────────────
        nextTermResumption: { type: Date, default: null },

        // ── Publishing control ─────────────────────────────────────────────
        /**
         * IMPORTANT: Parents only see results where isPublished === true.
         * Admin must explicitly publish via PATCH /admissions/:id/results or
         * equivalent. Unpublished results are internal only.
         */
        isPublished: { type: Boolean, default: false },
        publishedAt: { type: Date,    default: null  },
        publishedBy: { type: String,  default: ''    },  // Staff ID who published

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

// ─── Virtual: short term label (without session year) ─────────────────────────

ResultSchema.virtual('termLabel').get(function () {
    // "1st Term 2025/2026" → "1st Term"
    return this.term.replace(/\s+\d{4}\/\d{4}$/, '').trim();
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Primary uniqueness — one result per student per term per session
ResultSchema.index({ studentId: 1, session: 1, term: 1 }, { unique: true });

ResultSchema.index({ parentId:    1                  });
ResultSchema.index({ parentId:    1, isPublished: 1  });
ResultSchema.index({ class:       1, session: 1, term: 1 });
ResultSchema.index({ isPublished: 1                  });
ResultSchema.index({ studentId:   1, isPublished: 1  });
ResultSchema.index({ createdAt:  -1                  });

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = mongoose.model('Result', ResultSchema);

module.exports.GRADE_VALUES   = GRADE_VALUES;
module.exports.REMARKS        = REMARKS;
module.exports.scoreToGrade   = scoreToGrade;
module.exports.scoreToRemark  = scoreToRemark;
