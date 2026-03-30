/**
 * helpers/studentValidations.js
 *
 * Joi validation schemas for the Student module.
 *
 * Parent/guardian information is no longer part of the student payload.
 * When registering a student, the caller must supply `parentId` (an
 * existing Parent document) OR the full parent details via the separate
 * parent creation flow. The student service handles both paths.
 */

const Joi = require('joi');

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

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
    // ── Parent link — one of these must be supplied ────────────────────────
    /**
     * Option A: link to an existing Parent document.
     */
    parentId: Joi.string().trim().optional(),

    /**
     * Option B: provide parent details inline — the service will create
     * a Parent record and derive the parentId automatically.
     * Both father and mother are required when parentId is absent.
     */
    father: Joi.when('parentId', {
        is:        Joi.exist(),
        then:      Joi.object().optional(),
        otherwise: Joi.object({
            name:          Joi.string().trim().min(2).max(100).required(),
            occupation:    Joi.string().trim().min(2).max(100).required(),
            officeAddress: Joi.string().trim().min(5).max(200).required(),
            homeAddress:   Joi.string().trim().min(5).max(200).required(),
            homePhone:     Joi.string().trim().required(),
            whatsApp:      Joi.string().trim().required(),
            email:         Joi.string().email().lowercase().required(),
        }).required().messages({ 'any.required': 'Father details are required when parentId is not provided' }),
    }),

    mother: Joi.when('parentId', {
        is:        Joi.exist(),
        then:      Joi.object().optional(),
        otherwise: Joi.object({
            name:          Joi.string().trim().min(2).max(100).required(),
            occupation:    Joi.string().trim().min(2).max(100).required(),
            officeAddress: Joi.string().trim().min(5).max(200).required(),
            homeAddress:   Joi.string().trim().min(5).max(200).required(),
            homePhone:     Joi.string().trim().required(),
            whatsApp:      Joi.string().trim().required(),
            email:         Joi.string().email().lowercase().required(),
        }).required().messages({ 'any.required': 'Mother details are required when parentId is not provided' }),
    }),

    // Correspondence email captured here only when creating the parent inline
    correspondenceEmail: Joi.string().email().lowercase().optional(),
    howDidYouKnow:       Joi.string().trim().allow('').optional(),

    // ── Personal ──────────────────────────────────────────────────────────
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

    // ── Academic ──────────────────────────────────────────────────────────
    class: Joi.string().trim().required().messages({ 'any.required': 'Class is required' }),

    schoolingOption: Joi.string().valid('Day', 'Boarding').required().messages({
        'any.only':    'Schooling option must be Day or Boarding',
        'any.required': 'Schooling option is required',
    }),

    classPreferences: Joi.object({
        presentClass:       Joi.string().trim().optional(),
        classInterestedIn:  Joi.string().trim().optional(),
    }).optional(),

    schools: Joi.array().items(schoolAttendedSchema).optional(),

    // ── Health ────────────────────────────────────────────────────────────
    health: healthSchema.optional(),
});

// ─── Update Student (all fields optional / partial) ───────────────────────────

const updateStudentSchema = createStudentSchema.fork(
    [
        'surname', 'firstName', 'gender', 'dateOfBirth',
        'nationality', 'stateOfOrigin', 'localGovernment',
        'class', 'schoolingOption',
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

const validate = (schema, data) =>
    schema.validate(data, { abortEarly: false, stripUnknown: true });

module.exports = {
    createStudentSchema,
    updateStudentSchema,
    updateStatusSchema,
    promoteStudentsSchema,
    validate,
};
