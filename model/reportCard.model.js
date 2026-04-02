/**
 * reportCard.model.js
 *
 * Compiled, publishable report card for one student per term/session.
 *
 * Generated from SubjectScore documents by reportCardService.generateReportCards().
 * After generation, admin can:
 *  - Edit affective traits, psychomotor ratings, and teacher comments
 *  - Publish (sets isPublished = true, making it visible to parents)
 *
 * PDF download is served from the backend using this stored data.
 */

const mongoose = require('mongoose');

// ─── Constants ────────────────────────────────────────────────────────────────

const AFFECTIVE_TRAITS = [
  'Punctuality', 'Mental Alertness', 'Behaviour', 'Reliability',
  'Attentiveness', 'Respect', 'Neatness', 'Politeness', 'Honesty',
  'Relationship With Staff', 'Relationship With Students',
  'Attitude to School', 'Self Control',
  'Spirit of Teamwork', 'Initiatives', 'Organizational Ability',
];

const PSYCHOMOTOR_SKILLS = [
  'Handwriting', 'Reading', 'Verbal Fluency Diction',
  'Musical Skills', 'Creative Arts', 'Physical Education', 'General Reasoning',
];

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const SubjectResultSchema = new mongoose.Schema(
  {
    subjectId:        { type: String, default: '' },
    name:             { type: String, required: true, trim: true },
    test1:            { type: Number, default: 0 },
    test2:            { type: Number, default: 0 },
    exam:             { type: Number, default: 0 },
    firstTerm:        { type: Number, default: null },  // 1st term carry-over (null = not applicable)
    secondTerm:       { type: Number, default: null },  // 2nd term carry-over (for 3rd term card)
    currentTermTotal: { type: Number, default: 0 },     // test1 + test2 + exam
    total:            { type: Number, default: 0 },     // sum across all terms (max 200 for 2nd, 300 for 3rd)
    cumulativeAvg:    { type: Number, default: 0 },     // total / numberOfTerms
    grade:            { type: String, default: 'F9' },
    position:         { type: String, default: '-' },
    classAvg:         { type: Number, default: 0 },
    highest:          { type: Number, default: 0 },
    lowest:           { type: Number, default: 0 },
    remark:           { type: String, default: 'Fail' },
  },
  { _id: false }
);

const ClassInfoSchema = new mongoose.Schema(
  {
    positionInClass:       { type: String, default: '-' },
    positionInSection:     { type: String, default: '-' },
    studentsInClass:       { type: Number, default: 0 },
    studentsInSection:     { type: Number, default: 0 },
    classSectionAvg:       { type: Number, default: 0 },
    lowestAvgInSection:    { type: Number, default: 0 },
    highestAvgInSection:   { type: Number, default: 0 },
    totalScore:            { type: Number, default: 0 },
    studentAvg:            { type: Number, default: 0 },
    overallPerformance:    { type: String, default: 'Pass' },
    schoolDaysOpened:      { type: mongoose.Schema.Types.Mixed, default: '-' },
    daysPresent:           { type: mongoose.Schema.Types.Mixed, default: '-' },
    daysAbsent:            { type: mongoose.Schema.Types.Mixed, default: '-' },
  },
  { _id: false }
);

// Build trait/skill schemas with all fields set to Number 0-5
const affectiveFields = Object.fromEntries(
  AFFECTIVE_TRAITS.map((t) => [t.replace(/\s+/g, '_'), { type: Number, default: 0, min: 0, max: 5 }])
);
const psychomotorFields = Object.fromEntries(
  PSYCHOMOTOR_SKILLS.map((s) => [s.replace(/\s+/g, '_'), { type: Number, default: 0, min: 0, max: 5 }])
);

// ─── Main Schema ──────────────────────────────────────────────────────────────

const ReportCardSchema = new mongoose.Schema(
  {
    // ── Identity ───────────────────────────────────────────────────────────
    reportCardId: { type: String, unique: true, required: true, trim: true },
    serialNumber: { type: Number, required: true },

    // ── Student snapshot ───────────────────────────────────────────────────
    studentId:   { type: String, required: true, trim: true, ref: 'Student' },
    parentId:    { type: String, trim: true, default: '' },
    studentName: { type: String, trim: true, required: true },
    regNo:       { type: String, trim: true, default: '' },
    class:       { type: String, required: true, trim: true },
    photo:       { type: String, default: null },

    // ── Academic context ───────────────────────────────────────────────────
    term:             { type: String, required: true, trim: true },    // "1st Term" | "2nd Term" | "3rd Term"
    session:          { type: String, required: true, trim: true },    // "2025/2026"
    termEndDate:      { type: String, default: '-' },
    nextTermBegins:   { type: String, default: '-' },

    // ── Academic results ───────────────────────────────────────────────────
    classInfo: { type: ClassInfoSchema, default: () => ({}) },
    subjects:  { type: [SubjectResultSchema], default: [] },

    // ── Behavioral assessments ─────────────────────────────────────────────
    // Stored as flat Mixed maps for flexibility (trait name → rating 1-5)
    affective:   { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    psychomotor: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },

    // ── Comments ───────────────────────────────────────────────────────────
    classTeacherComment: { type: String, trim: true, default: '' },
    principalComment:    { type: String, trim: true, default: '' },

    // ── Publishing control ─────────────────────────────────────────────────
    isPublished: { type: Boolean, default: false },
    publishedAt: { type: Date,    default: null  },
    publishedBy: { type: String,  default: ''    },

    // ── Audit ──────────────────────────────────────────────────────────────
    generatedAt:   { type: Date,   default: null },
    generatedBy:   { type: String, default: ''   },
    createdBy:     { type: String, default: ''   },
    lastUpdatedBy: { type: String, default: ''   },
  },
  {
    timestamps: true,
    toJSON:  { virtuals: true },
    toObject:{ virtuals: true },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

ReportCardSchema.index({ studentId: 1, term: 1, session: 1 }, { unique: true });
ReportCardSchema.index({ class: 1, term: 1, session: 1 });
ReportCardSchema.index({ parentId: 1, isPublished: 1 });
ReportCardSchema.index({ isPublished: 1 });
ReportCardSchema.index({ reportCardId: 1 });
ReportCardSchema.index({ createdAt: -1 });

// ─── Exports ──────────────────────────────────────────────────────────────────

const ReportCard = mongoose.model('ReportCard', ReportCardSchema);

module.exports = ReportCard;
module.exports.AFFECTIVE_TRAITS   = AFFECTIVE_TRAITS;
module.exports.PSYCHOMOTOR_SKILLS = PSYCHOMOTOR_SKILLS;
