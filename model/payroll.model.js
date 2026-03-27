const mongoose = require('mongoose');

const PAY_STATUSES = ['Pending', 'Processing', 'Paid', 'Failed'];

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── Payroll Schema ────────────────────────────────────────────────────────────
// One document = one staff member's payroll for one calendar month.

const PayrollSchema = new mongoose.Schema(
    {
        // ── Reference ──────────────────────────────────────────────────────
        reference: {
            type:   String,
            unique: true,
            // Format: PAY-STF-0001-JAN2025
        },

        // ── Staff Link ─────────────────────────────────────────────────────
        staffId: {
            type:     String,
            required: [true, 'Staff ID is required'],
            ref:      'Staff',
        },

        staffName: {
            type: String,
            trim: true,
        },

        staffType: {
            type: String,
            trim: true,
        },

        department: {
            type: String,
            trim: true,
        },

        // ── Period ─────────────────────────────────────────────────────────
        month: {
            type:     Number,
            required: [true, 'Month is required'],
            min:      0,
            max:      11,
            // 0 = January … 11 = December (matches JS Date)
        },

        monthName: {
            type: String,
            // Derived from month on save
        },

        year: {
            type:     Number,
            required: [true, 'Year is required'],
            min:      2000,
            max:      2100,
        },

        // ── Earnings ──────────────────────────────────────────────────────
        baseSalary: {
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

        grossPay: {
            type:    Number,
            default: 0,
        },

        // ── Deductions ────────────────────────────────────────────────────
        pension: {
            type:    Number,
            default: 0,
            // 8 % of grossPay — Nigerian statutory pension contribution
        },

        tax: {
            type:    Number,
            default: 0,
            // Simplified PAYE: 5 % of grossPay
        },

        otherDeductions: {
            type:    Number,
            default: 0,
        },

        totalDeductions: {
            type:    Number,
            default: 0,
        },

        // ── Net ───────────────────────────────────────────────────────────
        netPay: {
            type:    Number,
            default: 0,
        },

        // ── Bank ──────────────────────────────────────────────────────────
        bank: {
            type:    String,
            trim:    true,
            default: '',
        },

        accountNumber: {
            type:    String,
            trim:    true,
            default: '',
        },

        // ── Status ────────────────────────────────────────────────────────
        payStatus: {
            type:    String,
            enum:    PAY_STATUSES,
            default: 'Pending',
        },

        payDate: {
            type: Date,
        },

        note: {
            type:    String,
            trim:    true,
            default: '',
        },

        // ── Audit ─────────────────────────────────────────────────────────
        processedBy: {
            type: String, // staff ID of admin / accountant who triggered this
        },
    },
    {
        timestamps: true,
    }
);

// ─── Pre-save hook — derive monthName + reference ─────────────────────────────

PayrollSchema.pre('save', function (next) {
    this.monthName = MONTH_NAMES[this.month];

    if (!this.reference) {
        const monthCode = MONTH_NAMES[this.month].toUpperCase().slice(0, 3);
        this.reference  = `PAY-${this.staffId}-${monthCode}${this.year}`;
    }

    next();
});

// ─── Compound index — prevents duplicate payroll records for same staff+period

PayrollSchema.index({ staffId: 1, month: 1, year: 1 }, { unique: true });
PayrollSchema.index({ payStatus:   1 });
PayrollSchema.index({ department:  1 });
PayrollSchema.index({ year: 1, month: 1 });

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = mongoose.model('Payroll', PayrollSchema);
module.exports.PAY_STATUSES = PAY_STATUSES;
module.exports.MONTH_NAMES  = MONTH_NAMES;
