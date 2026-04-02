/**
 * subjectScore.model.js
 *
 * Stores per-student, per-subject scores for a given term/session.
 * The admin enters Test1, Test2, Exam per subject per student.
 * First-term and second-term carry-over scores are also stored here
 * so the report card service can compute cumulative averages.
 *
 * One document = one student × one subject × one term × one session.
 */

const mongoose = require('mongoose');

const SubjectScoreSchema = new mongoose.Schema(
  {
    studentId:   { type: String, required: true, trim: true, ref: 'Student' },
    studentName: { type: String, trim: true, default: '' },
    class:       { type: String, required: true, trim: true },
    subjectId:   { type: String, trim: true, default: '' },
    subjectName: { type: String, required: true, trim: true },

    // Academic context
    term:    { type: String, required: true, trim: true }, // "1st Term" | "2nd Term" | "3rd Term"
    session: { type: String, required: true, trim: true }, // "2025/2026"

    // Score fields
    test1: { type: Number, default: null, min: 0, max: 20 },
    test2: { type: Number, default: null, min: 0, max: 20 },
    exam:  { type: Number, default: null, min: 0, max: 60 },

    // Carry-over totals populated when entering 2nd/3rd term scores
    firstTermTotal:  { type: Number, default: null, min: 0, max: 100 },
    secondTermTotal: { type: Number, default: null, min: 0, max: 100 },

    // Audit
    enteredBy:     { type: String, default: '' },
    lastUpdatedBy: { type: String, default: '' },
  },
  {
    timestamps: true,
    toJSON:  { virtuals: true },
    toObject:{ virtuals: true },
  }
);

// Virtual: current term score out of 100
SubjectScoreSchema.virtual('currentTermTotal').get(function () {
  if (this.test1 === null || this.test2 === null || this.exam === null) return null;
  return (this.test1 || 0) + (this.test2 || 0) + (this.exam || 0);
});

// Unique: one record per student × subject × term × session
SubjectScoreSchema.index(
  { studentId: 1, subjectName: 1, term: 1, session: 1 },
  { unique: true }
);

SubjectScoreSchema.index({ class: 1, subjectName: 1, term: 1, session: 1 });
SubjectScoreSchema.index({ studentId: 1, term: 1, session: 1 });
SubjectScoreSchema.index({ class: 1, term: 1, session: 1 });

module.exports = mongoose.model('SubjectScore', SubjectScoreSchema);
