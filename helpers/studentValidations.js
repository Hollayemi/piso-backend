const Joi = require('joi');

const nigerianPhone = (value, helpers) => {
    const phoneRegex = /^(\+234|0)(70|80|81|90|91)\d{8}$/;
    if (!phoneRegex.test(value)) {
        return helpers.error('any.invalid');
    }
    return value;
};

const parentSchema = Joi.object({
    name:          Joi.string().trim().min(2).max(100).required(),
    occupation:    Joi.string().trim().min(2).max(100).required(),
    officeAddress: Joi.string().trim().min(5).max(200).required(),
    homeAddress:   Joi.string().trim().min(5).max(200).required(),
    homePhone:     Joi.string().custom(nigerianPhone).required().messages({
        'any.invalid': 'Invalid Nigerian phone number format',
    }),
    whatsApp: Joi.string().custom(nigerianPhone).required().messages({
        'any.invalid': 'Invalid WhatsApp number format',
    }),
    email: Joi.string().email().lowercase().required(),
});

const schoolAttendedSchema = Joi.object({
    name:      Joi.string().trim().max(200).allow('').optional(),
    startDate: Joi.date().iso().max('now').optional().allow('', null),
    endDate:   Joi.date().iso().max('now').optional().allow('', null),
});

const vaccinationSchema = Joi.object({
    polio:         Joi.boolean().default(false),
    smallPox:      Joi.boolean().default(false),
    measles:       Joi.boolean().default(false),
    tetanus:       Joi.boolean().default(false),
    yellowFever:   Joi.boolean().default(false),
    whoopingCough: Joi.boolean().default(false),
    diphtheria:    Joi.boolean().default(false),
    cholera:       Joi.boolean().default(false),
}).default({});

const healthSchema = Joi.object({
    vaccinations:      vaccinationSchema.optional(),
    otherVaccination:  Joi.string().trim().max(200).allow('').optional(),
    infectiousDisease: Joi.string().trim().max(200).allow('').optional(),
    foodAllergy:       Joi.string().trim().max(200).allow('').optional(),
}).default({});

// ─── Create Student ───────────────────────────────────────────────────────────

const createStudentSchema = Joi.object({
    // Personal
    surname:    Joi.string().trim().min(2).max(50).pattern(/^[a-zA-Z\s'-]+$/).required().messages({
        'string.pattern.base': 'Surname must contain only letters, spaces, hyphens, and apostrophes',
        'any.required':        'Surname is required',
    }),
    firstName:  Joi.string().trim().min(2).max(50).pattern(/^[a-zA-Z\s'-]+$/).required().messages({
        'string.pattern.base': 'First name must contain only letters',
        'any.required':        'First name is required',
    }),
    middleName: Joi.string().trim().max(50).pattern(/^[a-zA-Z\s'-]+$/).allow('').optional(),

    gender:      Joi.string().valid('Male', 'Female').required().messages({
        'any.only':    'Gender must be Male or Female',
        'any.required': 'Gender is required',
    }),
    dateOfBirth: Joi.date().iso().max('now').min('1990-01-01').required().messages({
        'date.max':    'Date of birth must be in the past',
        'date.min':    'Invalid date of birth',
        'any.required': 'Date of birth is required',
    }),

    nationality:     Joi.string().trim().min(2).max(50).required(),
    stateOfOrigin:   Joi.string().trim().min(2).max(50).required(),
    localGovernment: Joi.string().trim().min(2).max(50).required(),
    religion:        Joi.string().trim().max(50).allow('').optional(),

    bloodGroup: Joi.string()
        .valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', '')
        .allow('')
        .optional(),
    genotype: Joi.string().valid('AA', 'AS', 'SS', 'AC', 'SC', '').allow('').optional(),

    // Academic
    class:          Joi.string().trim().required().messages({ 'any.required': 'Class is required' }),
    schoolingOption: Joi.string().valid('Day', 'Boarding').required().messages({
        'any.only':    'Schooling option must be Day or Boarding',
        'any.required': 'Schooling option is required',
    }),

    classPreferences: Joi.object({
        presentClass:       Joi.string().trim().optional(),
        classInterestedIn:  Joi.string().trim().optional(),
    }).optional(),

    schools: Joi.array().items(schoolAttendedSchema).optional(),

    // Parents
    father: parentSchema.required(),
    mother: parentSchema.required(),

    // Contact
    correspondenceEmail: Joi.string().email().lowercase().required().messages({
        'any.required': 'Correspondence email is required',
    }),
    howDidYouKnow: Joi.string().trim().allow('').optional(),

    // Health
    health: healthSchema.optional(),

    // Photo is handled separately as a file upload
});

// ─── Update Student (all fields optional / partial) ───────────────────────────

const updateStudentSchema = createStudentSchema.fork(
    [
        'surname', 'firstName', 'gender', 'dateOfBirth',
        'nationality', 'stateOfOrigin', 'localGovernment',
        'class', 'schoolingOption', 'correspondenceEmail',
        'father', 'mother',
    ],
    (field) => field.optional()
);

// ─── Update Status ────────────────────────────────────────────────────────────

const updateStatusSchema = Joi.object({
    status: Joi.string()
        .valid('Active', 'Inactive', 'Graduated', 'Suspended', 'Transferred')
        .required()
        .messages({
            'any.only':    'Invalid status value',
            'any.required': 'Status is required',
        }),
    reason: Joi.string().trim().max(500).allow('').optional(),
});

// ─── Promote Students ─────────────────────────────────────────────────────────

const promoteStudentsSchema = Joi.object({
    fromClass:  Joi.string().trim().required().messages({ 'any.required': 'fromClass is required' }),
    toClass:    Joi.string().trim().required().messages({ 'any.required': 'toClass is required' }),
    studentIds: Joi.array().items(Joi.string().trim()).min(1).required().messages({
        'array.min':   'At least one student ID is required',
        'any.required': 'studentIds array is required',
    }),
    session: Joi.string().trim().optional(),
    term:    Joi.string().trim().optional(),
});

// ─── Validation runner ────────────────────────────────────────────────────────

/**
 * Validates data against a Joi schema.
 * Returns { error, value } — matches existing Joi pattern in the codebase.
 *
 * @param {object} schema  - Joi schema object
 * @param {object} data    - Raw request body
 */
const validate = (schema, data) =>
    schema.validate(data, { abortEarly: false, stripUnknown: true });

module.exports = {
    createStudentSchema,
    updateStudentSchema,
    updateStatusSchema,
    promoteStudentsSchema,
    validate,
};
