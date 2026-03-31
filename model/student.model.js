/**
 * model/student.model.js
 *
 * A Student document holds only the child's own information.
 * All parent/guardian data lives in the Parent model.
 *
 * Relationship:
 *   Student.parentId  →  Parent.parentId  (many-to-one, single parent record per family)
 *
 * To get parent information when querying a student use:
 *   Student.findOne({ studentId }).populate('parent')
 *
 * ID format: STU-YYYY-NNNN  e.g. STU-2025-0047
 */

const mongoose = require('mongoose');

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const SchoolAttendedSchema = new mongoose.Schema(
    {
        name:      { type: String, trim: true },
        startDate: { type: Date },
        endDate:   { type: Date },
    },
    { _id: false }
);

const VaccinationSchema = new mongoose.Schema(
    {
        polio:         { type: Boolean, default: false },
        smallPox:      { type: Boolean, default: false },
        measles:       { type: Boolean, default: false },
        tetanus:       { type: Boolean, default: false },
        yellowFever:   { type: Boolean, default: false },
        whoopingCough: { type: Boolean, default: false },
        diphtheria:    { type: Boolean, default: false },
        cholera:       { type: Boolean, default: false },
    },
    { _id: false }
);

const HealthSchema = new mongoose.Schema(
    {
        vaccinations:      { type: VaccinationSchema, default: () => ({}) },
        otherVaccination:  { type: String, trim: true, default: '' },
        infectiousDisease: { type: String, trim: true, default: '' },
        foodAllergy:       { type: String, trim: true, default: '' },
    },
    { _id: false }
);

const FeesSchema = new mongoose.Schema(
    {
        paid:            { type: Boolean, default: false },
        amount:          { type: Number,  default: 0 },
        balance:         { type: Number,  default: 0 },
        lastPaymentDate: { type: Date },
    },
    { _id: false }
);

const AttendanceRecordSchema = new mongoose.Schema(
    {
        date:    { type: Date,   required: true },
        status:  { type: String, enum: ['Present', 'Absent', 'Late'], required: true },
        reason:  { type: String, trim: true, default: '' },
        term:    { type: String, trim: true },
        session: { type: String, trim: true },
    },
    { _id: false }
);

const DocumentSchema = new mongoose.Schema(
    {
        filename:   { type: String },
        path:       { type: String },
        uploadedAt: { type: Date },
    },
    { _id: false }
);

// ─── Main Student Schema ──────────────────────────────────────────────────────

const StudentSchema = new mongoose.Schema(
    {
        // ── System / Identity ──────────────────────────────────────────────
        studentId: {
            type:     String,
            unique:   true,
            required: true,
            trim:     true,
            // Format: STU-YYYY-NNNN  e.g. STU-2025-0001
        },

        serialNumber: {
            type:     Number,
            required: true,
        },

        // ── Parent link ────────────────────────────────────────────────────
        /**
         * Foreign key → Parent.parentId
         * All parent/guardian data is fetched via populate('parent').
         */
        parentId: {
            type:     String,
            required: [true, 'Parent ID is required'],
            trim:     true,
            ref:      'Parent',
        },

        // ── Personal Information ───────────────────────────────────────────
        surname: {
            type:      String,
            required:  [true, 'Surname is required'],
            trim:      true,
            maxlength: [50, 'Surname cannot exceed 50 characters'],
        },

        firstName: {
            type:      String,
            required:  [true, 'First name is required'],
            trim:      true,
            maxlength: [50, 'First name cannot exceed 50 characters'],
        },

        middleName: {
            type:      String,
            trim:      true,
            maxlength: [50, 'Middle name cannot exceed 50 characters'],
            default:   '',
        },

        gender: {
            type:     String,
            required: [true, 'Gender is required'],
            enum:     ['male', 'female'],
        },

        dateOfBirth: {
            type:     Date,
            required: [true, 'Date of birth is required'],
        },

        nationality: {
            type:     String,
            required: [true, 'Nationality is required'],
            trim:     true,
        },

        stateOfOrigin: {
            type:     String,
            required: [true, 'State of origin is required'],
            trim:     true,
        },

        localGovernment: {
            type:     String,
            required: [true, 'Local government is required'],
            trim:     true,
        },

        religion: {
            type:    String,
            trim:    true,
            default: '',
        },

        bloodGroup: {
            type:    String,
            enum:    ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', ''],
            default: '',
        },

        genotype: {
            type:    String,
            enum:    ['AA', 'AS', 'SS', 'AC', 'SC', ''],
            default: '',
        },

        // ── Academic Info ──────────────────────────────────────────────────
        class: {
            type:     String,
            required: [true, 'Class is required'],
            trim:     true,
        },

        schoolingOption: {
            type:     String,
            required: [true, 'Schooling option is required'],
            enum:     ['day', 'boarding'],
        },

        status: {
            type:    String,
            enum:    ['Active', 'Inactive', 'Graduated', 'Suspended', 'Transferred'],
            default: 'Active',
        },

        statusReason: {
            type:    String,
            trim:    true,
            default: '',
        },

        admissionDate: {
            type:    Date,
            default: Date.now,
        },

        classTeacher: {
            type:    String,
            trim:    true,
            default: '',
        },

        classPreferences: {
            presentClass:       { type: String, trim: true },
            classInterestedIn:  { type: String, trim: true },
        },

        schools: [SchoolAttendedSchema],

        // ── Health ─────────────────────────────────────────────────────────
        health: { type: HealthSchema, default: () => ({}) },

        // ── Finance snapshot ───────────────────────────────────────────────
        fees: { type: FeesSchema, default: () => ({}) },

        // ── Attendance ─────────────────────────────────────────────────────
        attendanceRecords: [AttendanceRecordSchema],

        // ── Documents ──────────────────────────────────────────────────────
        documents: {
            birthCertificate:   { type: DocumentSchema },
            formerSchoolReport: { type: DocumentSchema },
            medicalReport:      { type: DocumentSchema },
        },

        photo: {
            type:    String,
            default: null,
        },

        // ── Audit ──────────────────────────────────────────────────────────
        submittedFrom: { type: String },
        createdBy:     { type: String },
        lastUpdatedBy: { type: String },
    },
    {
        timestamps: true,
        toJSON:     { virtuals: true },
        toObject:   { virtuals: true },
    }
);

// ─── Virtuals ─────────────────────────────────────────────────────────────────

StudentSchema.virtual('fullName').get(function () {
    return [this.surname, this.firstName, this.middleName].filter(Boolean).join(' ');
});

StudentSchema.virtual('attendancePercentage').get(function () {
    if (!this.attendanceRecords || this.attendanceRecords.length === 0) return 0;
    const present = this.attendanceRecords.filter((r) => r.status === 'Present').length;
    return Math.round((present / this.attendanceRecords.length) * 100);
});

/**
 * Virtual populate — resolves to the parent's full document.
 * Usage: Student.findOne({ studentId }).populate('parent')
 */
StudentSchema.virtual('parent', {
    ref:          'Parent',
    localField:   'parentId',
    foreignField: 'parentId',
    justOne:      true,
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

StudentSchema.index({ studentId: 1 });
StudentSchema.index({ parentId:  1 });
StudentSchema.index({ surname: 1, firstName: 1 });
StudentSchema.index({ class:   1 });
StudentSchema.index({ status:  1 });
StudentSchema.index({ createdAt: -1 });
// Compound index for duplicate-check
StudentSchema.index({ surname: 1, firstName: 1, dateOfBirth: 1 });

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = mongoose.model('Student', StudentSchema);
