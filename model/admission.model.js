/**
 * admission.model.js
 *
 * Represents a single admission application submitted by a parent/guardian.
 *
 * Three embedded sub-documents track the lifecycle:
 *   application  → initial submission data
 *   screening    → document verification + officer decision (1.6 – 1.7)
 *   offer        → letter dispatch + acceptance tracking    (1.8 – 1.10)
 *
 * ID format: APP-YYYY-NNNN  e.g. APP-2025-0001
 *
 * Status flow:
 *   Pending  →  Under Review  →  Approved for Screening  →  (Rejected at any point)
 *   Screening: Pending → Verified | Rejected
 *   Offer:     Not Sent → Pending → Accepted | Declined
 */

const mongoose = require('mongoose');

// ─── Constants ────────────────────────────────────────────────────────────────

const APPLICATION_STATUSES = [
    'Pending',
    'Under Review',
    'Approved for Screening',
    'Rejected',
];

const SCREENING_STATUSES = ['Pending', 'Verified', 'Rejected'];

const ACCEPTANCE_STATUSES = ['Not Sent', 'Pending', 'Accepted', 'Declined'];

const SCHOOLING_OPTIONS = ['Day', 'Boarding'];

// ─── Sub-schema: parent / guardian ───────────────────────────────────────────

const ParentSchema = new mongoose.Schema(
    {
        name:          { type: String, required: true, trim: true },
        occupation:    { type: String, required: true, trim: true },
        officeAddress: { type: String, required: true, trim: true },
        homeAddress:   { type: String, required: true, trim: true },
        homePhone:     { type: String, required: true, trim: true },
        whatsApp:      { type: String, required: true, trim: true },
        email:         { type: String, required: true, lowercase: true, trim: true },
    },
    { _id: false }
);

// ─── Sub-schema: previous school ─────────────────────────────────────────────

const SchoolAttendedSchema = new mongoose.Schema(
    {
        name:      { type: String, trim: true },
        startDate: { type: Date },
        endDate:   { type: Date },
    },
    { _id: false }
);

// ─── Sub-schema: health & vaccinations ───────────────────────────────────────

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

// ─── Sub-schema: uploaded document flags ─────────────────────────────────────

const DocumentFlagsSchema = new mongoose.Schema(
    {
        birthCertificate:    { type: Boolean, default: false },
        formerSchoolReport:  { type: Boolean, default: false },
        proofOfPayment:      { type: Boolean, default: false },
        immunizationCard:    { type: Boolean, default: false },
        medicalReport:       { type: Boolean, default: false },
    },
    { _id: false }
);

// ─── Sub-schema: uploaded document files ─────────────────────────────────────

const DocFileSchema = new mongoose.Schema(
    {
        filename:   { type: String },
        path:       { type: String },
        uploadedAt: { type: Date },
    },
    { _id: false }
);

// ─── Sub-schema: screening record ────────────────────────────────────────────

const ScreeningSchema = new mongoose.Schema(
    {
        screeningStatus: {
            type:    String,
            enum:    SCREENING_STATUSES,
            default: 'Pending',
        },
        assignedOfficer: { type: String, trim: true, default: '' },
        notes:           { type: String, trim: true, default: '' },
        docs: {
            type:    DocumentFlagsSchema,
            default: () => ({}),
        },
        updatedAt: { type: Date, default: null },
    },
    { _id: false }
);

// ─── Sub-schema: offer record ─────────────────────────────────────────────────

const OfferSchema = new mongoose.Schema(
    {
        offerId: {
            type:  String,
            trim:  true,
            default: '',
            // Format: OFR-YYYY-NNNN
        },
        offerSent:          { type: Boolean, default: false },
        offerDate:          { type: Date,    default: null  },
        acceptanceDeadline: { type: Date,    default: null  },
        emailSent:          { type: Boolean, default: false },
        pdfGenerated:       { type: Boolean, default: false },
        acceptanceStatus: {
            type:    String,
            enum:    ACCEPTANCE_STATUSES,
            default: 'Not Sent',
        },
        sentAt:    { type: Date, default: null },
        updatedAt: { type: Date, default: null },
    },
    { _id: false }
);

// ─── Main Admission Schema ────────────────────────────────────────────────────

const AdmissionSchema = new mongoose.Schema(
    {
        // ── System / Identity ──────────────────────────────────────────────
        applicationId: {
            type:     String,
            unique:   true,
            required: true,
            trim:     true,
            // Format: APP-YYYY-NNNN
        },

        serialNumber: {
            type:     Number,
            required: true,
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

        dateOfBirth: {
            type:     Date,
            required: [true, 'Date of birth is required'],
        },

        gender: {
            type:     String,
            required: [true, 'Gender is required'],
            enum:     ['Male', 'Female'],
        },

        bloodGroup: {
            type: String,
            enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', ''],
            default: '',
        },

        genotype: {
            type: String,
            enum: ['AA', 'AS', 'SS', 'AC', 'SC', ''],
            default: '',
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

        schoolingOption: {
            type:     String,
            required: [true, 'Schooling option is required'],
            enum:     SCHOOLING_OPTIONS,
        },

        // ── Class Preferences ──────────────────────────────────────────────
        classPreferences: {
            presentClass:      { type: String, trim: true, default: '' },
            classInterestedIn: { type: String, trim: true, default: '' },
        },

        // ── Parents / Guardian ─────────────────────────────────────────────
        father: { type: ParentSchema, required: true },
        mother: { type: ParentSchema, required: true },

        // ── Schools Attended ───────────────────────────────────────────────
        schools: { type: [SchoolAttendedSchema], default: [] },

        // ── Health ─────────────────────────────────────────────────────────
        health: { type: HealthSchema, default: () => ({}) },

        // ── Contact ────────────────────────────────────────────────────────
        contact: {
            correspondenceEmail: {
                type:      String,
                required:  [true, 'Correspondence email is required'],
                lowercase: true,
                trim:      true,
            },
            howDidYouKnow: { type: String, trim: true, default: '' },
        },

        // ── Uploaded Document Files ────────────────────────────────────────
        documents: {
            birthCertificate:       { type: DocFileSchema },
            formerSchoolReport:     { type: DocFileSchema },
            proofOfPayment:         { type: DocFileSchema },
            immunizationCertificate: { type: DocFileSchema },
            medicalReport:          { type: DocFileSchema },
        },

        // ── Application Status ─────────────────────────────────────────────
        status: {
            type:    String,
            enum:    APPLICATION_STATUSES,
            default: 'Pending',
        },

        reviewedBy:  { type: String, trim: true, default: '' },
        adminNotes:  { type: String, trim: true, default: '' },

        // ── Screening ──────────────────────────────────────────────────────
        screening: {
            type:    ScreeningSchema,
            default: () => ({}),
        },

        // ── Offer ──────────────────────────────────────────────────────────
        offer: {
            type:    OfferSchema,
            default: () => ({}),
        },

        // ── Submission Metadata ────────────────────────────────────────────
        submittedFrom: { type: String, default: '' },
        dateApplied:   { type: Date, default: Date.now },

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

// ─── Virtuals ─────────────────────────────────────────────────────────────────

/** Convenience: derived class the applicant is applying to */
AdmissionSchema.virtual('appliedClass').get(function () {
    return this.classPreferences?.classInterestedIn || '';
});

/** True when at least one document file has been uploaded */
AdmissionSchema.virtual('docsSubmitted').get(function () {
    const docs = this.documents || {};
    return Object.values(docs).some((d) => d && d.filename);
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

AdmissionSchema.index({ applicationId: 1 });
AdmissionSchema.index({ status: 1 });
AdmissionSchema.index({ 'screening.screeningStatus': 1 });
AdmissionSchema.index({ 'offer.acceptanceStatus': 1 });
AdmissionSchema.index({ 'contact.correspondenceEmail': 1 });
AdmissionSchema.index({ surname: 1, firstName: 1 });
AdmissionSchema.index({ dateApplied: -1 });
AdmissionSchema.index({ createdAt: -1 });

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = mongoose.model('Admission', AdmissionSchema);
module.exports.APPLICATION_STATUSES = APPLICATION_STATUSES;
module.exports.SCREENING_STATUSES   = SCREENING_STATUSES;
module.exports.ACCEPTANCE_STATUSES  = ACCEPTANCE_STATUSES;
module.exports.SCHOOLING_OPTIONS    = SCHOOLING_OPTIONS;
