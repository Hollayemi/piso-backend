const mongoose = require('mongoose');

// ─── Staff Type constant — single source of truth ────────────────────────────

const STAFF_TYPES = [
    'principal',
    'vice_principal_academic',
    'vice_principal_admin',
    'hod_science',
    'hod_arts',
    'hod_commercial',
    'teacher',
    'class_teacher',
    'bursar',
    'secretary',
    'librarian',
    'lab_technician',
    'ict_instructor',
    'nurse',
    'counselor',
    'boarding_master',
    'security',
    'driver',
    'cook',
    'cleaner',
    'maintenance',
];

const STAFF_STATUSES    = ['Active', 'Inactive', 'On Leave'];
const EMPLOYMENT_TYPES  = ['Full-time', 'Part-time', 'Contract', 'Volunteer'];
const MARITAL_STATUSES  = ['Single', 'Married', 'Divorced', 'Widowed'];

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const BankAccountSchema = new mongoose.Schema(
    {
        bank:          { type: String, trim: true, default: '' },
        accountNumber: { type: String, trim: true, default: '' },
        accountName:   { type: String, trim: true, default: '' },
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

// ─── Main Staff Schema ────────────────────────────────────────────────────────

const StaffSchema = new mongoose.Schema(
    {
        // ── Identity / System ──────────────────────────────────────────────
        staffId: {
            type:     String,
            unique:   true,
            required: true,
            trim:     true,
            // Format: STF-NNNN  e.g.  STF-0001
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

        gender: {
            type:     String,
            required: [true, 'Gender is required'],
            enum:     ['Male', 'Female'],
        },

        dateOfBirth: {
            type:     Date,
            required: [true, 'Date of birth is required'],
        },

        maritalStatus: {
            type: String,
            enum: MARITAL_STATUSES,
            trim: true,
        },

        religion: {
            type:    String,
            trim:    true,
            default: '',
        },

        nin: {
            type:    String,
            trim:    true,
            default: '',
            // National Identification Number
        },

        nationality: {
            type:    String,
            trim:    true,
            default: 'Nigerian',
        },

        stateOfOrigin: {
            type:     String,
            required: [true, 'State of origin is required'],
            trim:     true,
        },

        localGovernment: {
            type:    String,
            trim:    true,
            default: '',
        },

        address: {
            type:    String,
            trim:    true,
            default: '',
        },

        // ── Contact ────────────────────────────────────────────────────────
        phone: {
            type:     String,
            required: [true, 'Phone number is required'],
        },

        alternativePhone: {
            type:    String,
            default: '',
        },

        email: {
            type:      String,
            required:  [true, 'Email is required'],
            unique:    true,
            lowercase: true,
            trim:      true,
        },

        // ── Emergency Contact ──────────────────────────────────────────────
        emergencyContact:  { type: String, trim: true, default: '' },
        emergencyPhone:    { type: String, default: '' },
        emergencyRelation: { type: String, trim: true, default: '' },

        // ── Employment ────────────────────────────────────────────────────
        staffType: {
            type:     String,
            required: [true, 'Staff type is required'],
            enum:     STAFF_TYPES,
        },

        department: {
            type:     String,
            required: [true, 'Department is required'],
            trim:     true,
        },

        qualification: {
            type:    String,
            trim:    true,
            default: '',
        },

        specialization: {
            type:    String,
            trim:    true,
            default: '',
        },

        dateOfEmployment: {
            type:     Date,
            required: [true, 'Date of employment is required'],
        },

        employmentType: {
            type:    String,
            enum:    EMPLOYMENT_TYPES,
            default: 'Full-time',
        },

        status: {
            type:    String,
            enum:    STAFF_STATUSES,
            default: 'Active',
        },

        statusReason: {
            type:    String,
            trim:    true,
            default: '',
        },

        returnDate: {
            // Expected return date when status is 'On Leave'
            type: Date,
        },

        // ── Academic assignments ───────────────────────────────────────────
        subjects: {
            type:    [String],
            default: [],
            // e.g. ['Mathematics', 'Further Mathematics']
        },

        assignedClass: {
            type:    String,
            trim:    true,
            default: '',
            // e.g. 'JSS 1A'
        },

        // ── Compensation ──────────────────────────────────────────────────
        salary: {
            type:    Number,
            default: 0,
        },

        transportAllowance: {
            type:    Number,
            default: 0,
        },

        housingAllowance: {
            type:    Number,
            default: 0,
        },

        medicalAllowance: {
            type:    Number,
            default: 0,
        },

        bankAccount: {
            type:    BankAccountSchema,
            default: () => ({}),
        },

        pensionId: {
            type:    String,
            trim:    true,
            default: '',
        },

        taxId: {
            type:    String,
            trim:    true,
            default: '',
        },

        // ── Authentication ────────────────────────────────────────────────
        password: {
            type:   String,
            select: false, // Never returned in queries by default
        },
       mustResetPassword: {
         type:    Boolean,
          default: false,
      },

        // ── Documents ─────────────────────────────────────────────────────
        documents: {
            cv:            { type: DocumentSchema },
            certificate:   { type: DocumentSchema },
            medicalReport: { type: DocumentSchema },
        },

        photo: {
            type:    String,
            default: null,
        },

        // ── Audit ─────────────────────────────────────────────────────────
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

StaffSchema.virtual('fullName').get(function () {
    return [this.surname, this.firstName, this.middleName].filter(Boolean).join(' ');
});

/** Gross pay derived from salary + allowances */
StaffSchema.virtual('grossPay').get(function () {
    return (
        (this.salary           || 0) +
        (this.transportAllowance || 0) +
        (this.housingAllowance  || 0) +
        (this.medicalAllowance  || 0)
    );
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

StaffSchema.index({ staffId:    1 });
StaffSchema.index({ email:      1 });
StaffSchema.index({ staffType:  1 });
StaffSchema.index({ department: 1 });
StaffSchema.index({ status:     1 });
StaffSchema.index({ surname: 1, firstName: 1 });
StaffSchema.index({ createdAt: -1 });

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = mongoose.model('Staff', StaffSchema);

module.exports.STAFF_TYPES    = STAFF_TYPES;
module.exports.STAFF_STATUSES = STAFF_STATUSES;
