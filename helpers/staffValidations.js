const Joi = require('joi');
const { STAFF_TYPES, STAFF_STATUSES } = require('../model/staff');
const { PAY_STATUSES } = require('../model/payroll');

// ─── Reusable validators ──────────────────────────────────────────────────────

const nigerianPhone = (value, helpers) => {
    const phoneRegex = /^(\+234|0)(70|80|81|90|91)\d{8}$/;
    if (!phoneRegex.test(value)) {
        return helpers.error('any.invalid');
    }
    return value;
};

// ─── 2.3 / 2.4  Create / Update Staff ────────────────────────────────────────

const createStaffSchema = Joi.object({
    // Personal
    surname: Joi.string().trim().min(2).max(50)
        .pattern(/^[a-zA-Z\s'-]+$/)
        .required()
        .messages({
            'string.pattern.base': 'Surname must contain only letters, spaces, hyphens, and apostrophes',
            'any.required':        'Surname is required',
        }),

    firstName: Joi.string().trim().min(2).max(50)
        .pattern(/^[a-zA-Z\s'-]+$/)
        .required()
        .messages({
            'string.pattern.base': 'First name must contain only letters',
            'any.required':        'First name is required',
        }),

    middleName: Joi.string().trim().max(50)
        .pattern(/^[a-zA-Z\s'-]+$/)
        .allow('')
        .optional(),

    gender: Joi.string().valid('Male', 'Female').required().messages({
        'any.only':    'Gender must be Male or Female',
        'any.required': 'Gender is required',
    }),

    dateOfBirth: Joi.date().iso().max('now').min('1950-01-01').required().messages({
        'date.max':    'Date of birth must be in the past',
        'date.min':    'Invalid date of birth',
        'any.required': 'Date of birth is required',
    }),

    maritalStatus: Joi.string()
        .valid('Single', 'Married', 'Divorced', 'Widowed')
        .optional(),

    religion:        Joi.string().trim().max(50).allow('').optional(),
    nin:             Joi.string().trim().max(30).allow('').optional(),
    nationality:     Joi.string().trim().max(50).default('Nigerian').optional(),
    stateOfOrigin:   Joi.string().trim().min(2).max(50).required(),
    localGovernment: Joi.string().trim().max(50).allow('').optional(),
    address:         Joi.string().trim().max(300).allow('').optional(),

    // Contact
    phone: Joi.string().custom(nigerianPhone).required().messages({
        'any.invalid':  'Invalid Nigerian phone number format',
        'any.required': 'Phone number is required',
    }),

    alternativePhone: Joi.string().custom(nigerianPhone).allow('').optional().messages({
        'any.invalid': 'Invalid phone number format',
    }),

    email: Joi.string().email().lowercase().required().messages({
        'any.required': 'Email is required',
    }),

    // Emergency
    emergencyContact:  Joi.string().trim().max(100).allow('').optional(),
    emergencyPhone:    Joi.string().custom(nigerianPhone).allow('').optional().messages({
        'any.invalid': 'Invalid emergency phone format',
    }),
    emergencyRelation: Joi.string().trim().max(50).allow('').optional(),

    // Employment
    staffType: Joi.string().valid(...STAFF_TYPES).required().messages({
        'any.only':    `Invalid staff type`,
        'any.required': 'Staff type is required',
    }),

    department: Joi.string().trim().min(2).max(100).required().messages({
        'any.required': 'Department is required',
    }),

    qualification: Joi.string().trim().max(100).allow('').optional(),
    specialization: Joi.string().trim().max(100).allow('').optional(),

    dateOfEmployment: Joi.date().iso().required().messages({
        'any.required': 'Date of employment is required',
    }),

    employmentType: Joi.string()
        .valid('Full-time', 'Part-time', 'Contract', 'Volunteer')
        .default('Full-time')
        .optional(),

    subjects:      Joi.array().items(Joi.string().trim()).default([]).optional(),
    assignedClass: Joi.string().trim().allow('').optional(),

    // Compensation
    salary:             Joi.number().min(0).default(0).optional(),
    transportAllowance: Joi.number().min(0).default(0).optional(),
    housingAllowance:   Joi.number().min(0).default(0).optional(),
    medicalAllowance:   Joi.number().min(0).default(0).optional(),

    bank:          Joi.string().trim().max(100).allow('').optional(),
    accountNumber: Joi.string().trim().max(20).allow('').optional(),
    accountName:   Joi.string().trim().max(100).allow('').optional(),
    pensionId:     Joi.string().trim().max(50).allow('').optional(),
    taxId:         Joi.string().trim().max(50).allow('').optional(),

    // Auth
    password: Joi.string().min(8).optional().messages({
        'string.min': 'Password must be at least 8 characters',
    }),

    // Files handled separately (photo, cv, certificate, medicalReport)
});

/** All fields optional for partial PUT updates */
const updateStaffSchema = createStaffSchema.fork(
    ['surname', 'firstName', 'gender', 'dateOfBirth', 'stateOfOrigin',
     'phone', 'email', 'staffType', 'department', 'dateOfEmployment'],
    (field) => field.optional()
);

// ─── 2.6  Update Staff Status ─────────────────────────────────────────────────

const updateStaffStatusSchema = Joi.object({
    status: Joi.string()
        .valid(...STAFF_STATUSES)
        .required()
        .messages({
            'any.only':    `Status must be one of: ${STAFF_STATUSES.join(', ')}`,
            'any.required': 'Status is required',
        }),
    reason:     Joi.string().trim().max(500).allow('').optional(),
    returnDate: Joi.date().iso().min('now').optional().messages({
        'date.min': 'Return date must be in the future',
    }),
});

// ─── 2.7  Get Payroll List (query params) ─────────────────────────────────────

const payrollQuerySchema = Joi.object({
    month:      Joi.number().integer().min(0).max(11).required().messages({
        'any.required': 'month is required (0 = January, 11 = December)',
        'number.min':   'month must be between 0 and 11',
        'number.max':   'month must be between 0 and 11',
    }),
    year:       Joi.number().integer().min(2000).max(2100).required().messages({
        'any.required': 'year is required',
    }),
    department: Joi.string().trim().allow('').optional(),
    payStatus:  Joi.string().valid(...PAY_STATUSES).optional(),
    page:       Joi.number().integer().min(1).default(1).optional(),
    limit:      Joi.number().integer().min(1).max(100).default(15).optional(),
});

// ─── 2.8  Process Payroll (Single) ───────────────────────────────────────────

const processPayrollSchema = Joi.object({
    month: Joi.number().integer().min(0).max(11).required().messages({
        'any.required': 'month is required',
    }),
    year:  Joi.number().integer().min(2000).max(2100).required().messages({
        'any.required': 'year is required',
    }),
    note:            Joi.string().trim().max(500).allow('').optional(),
    otherDeductions: Joi.number().min(0).default(0).optional(),
});

// ─── 2.9  Batch Process Payroll ───────────────────────────────────────────────

const batchProcessPayrollSchema = Joi.object({
    staffIds: Joi.array()
        .items(Joi.string().trim())
        .min(1)
        .required()
        .messages({
            'array.min':   'At least one staff ID is required',
            'any.required': 'staffIds is required',
        }),
    month: Joi.number().integer().min(0).max(11).required(),
    year:  Joi.number().integer().min(2000).max(2100).required(),
    note:  Joi.string().trim().max(500).allow('').optional(),
});

// ─── 2.10  Get Payslip (query params) ────────────────────────────────────────

const payslipQuerySchema = Joi.object({
    month: Joi.number().integer().min(0).max(11).required().messages({
        'any.required': 'month is required',
    }),
    year:  Joi.number().integer().min(2000).max(2100).required().messages({
        'any.required': 'year is required',
    }),
});

// ─── Validation runner ────────────────────────────────────────────────────────

const validate = (schema, data) =>
    schema.validate(data, { abortEarly: false, stripUnknown: true });

module.exports = {
    createStaffSchema,
    updateStaffSchema,
    updateStaffStatusSchema,
    payrollQuerySchema,
    processPayrollSchema,
    batchProcessPayrollSchema,
    payslipQuerySchema,
    validate,
};
