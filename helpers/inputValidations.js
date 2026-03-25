const Joi = require('joi');

// Custom validator for Nigerian phone numbers
const nigerianPhone = (value, helpers) => {
    const phoneRegex = /^(\+234|0)(70|80|81|90|91)\d{8}$/;
    if (!phoneRegex.test(value)) {
        return helpers.error('any.invalid');
    }
    return value;
};

// Custom validator for dates (must be in the past)
const pastDate = (value, helpers) => {
    if (new Date(value) >= new Date()) {
        return helpers.error('date.past');
    }
    return value;
};

const admissionSchema = Joi.object({
    // Personal Information
    surname: Joi.string()
        .trim()
        .min(2)
        .max(50)
        .pattern(/^[a-zA-Z\s'-]+$/)
        .required()
        .messages({
            'string.pattern.base': 'Surname must contain only letters, spaces, hyphens, and apostrophes',
            'string.min': 'Surname must be at least 2 characters long',
            'any.required': 'Surname is required'
        }),

    firstName: Joi.string()
        .trim()
        .min(2)
        .max(50)
        .pattern(/^[a-zA-Z\s'-]+$/)
        .required()
        .messages({
            'string.pattern.base': 'First name must contain only letters',
            'any.required': 'First name is required'
        }),

    middleName: Joi.string()
        .trim()
        .max(50)
        .pattern(/^[a-zA-Z\s'-]+$/)
        .allow('')
        .optional(),

    dateOfBirth: Joi.date()
        .iso()
        .max('now')
        .min('1990-01-01')
        .required()
        .messages({
            'date.max': 'Date of birth must be in the past',
            'date.min': 'Invalid date of birth',
            'any.required': 'Date of birth is required'
        }),

    gender: Joi.string()
        .valid('male', 'female')
        .required()
        .messages({
            'any.only': 'Gender must be either Male or Female',
            'any.required': 'Gender is required'
        }),

    bloodGroup: Joi.string()
        .valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', "")
        .allow("")
        .messages({
            'any.only': 'Invalid blood group',
            'any.required': 'Blood group is required'
        }),

    genotype: Joi.string()
        .valid('AA', 'AS', 'SS', 'AC', 'SC', "")
        .allow("")
        .messages({
            'any.only': 'Invalid genotype',
            'any.required': 'Genotype is required'
        }),

    nationality: Joi.string()
        .trim()
        .min(2)
        .max(50)
        .required()
        .messages({
            'any.required': 'Nationality is required'
        }),

    stateOfOrigin: Joi.string()
        .trim()
        .min(2)
        .max(50)
        .required()
        .messages({
            'any.required': 'State of origin is required'
        }),

    localGovernment: Joi.string()
        .trim()
        .min(2)
        .max(50)
        .required()
        .messages({
            'any.required': 'Local government is required'
        }),

    schoolingOption: Joi.string()
        .valid('day', 'boarding')
        .required()
        .messages({
            'any.only': 'Schooling option must be either Day or Boarding',
            'any.required': 'Schooling option is required'
        }),

    // Father's Details
    father: Joi.object({
        name: Joi.string().trim().min(2).max(100).required(),
        occupation: Joi.string().trim().min(2).max(100).required(),
        officeAddress: Joi.string().trim().min(5).max(200).required(),
        homeAddress: Joi.string().trim().min(5).max(200).required(),
        homePhone: Joi.string().custom(nigerianPhone).required().messages({
            'any.invalid': 'Invalid Nigerian phone number format'
        }),
        whatsApp: Joi.string().custom(nigerianPhone).required().messages({
            'any.invalid': 'Invalid WhatsApp number format'
        }),
        email: Joi.string().email().lowercase().required()
    }).required(),

    // Mother's Details
    mother: Joi.object({
        name: Joi.string().trim().min(2).max(100).required(),
        occupation: Joi.string().trim().min(2).max(100).required(),
        officeAddress: Joi.string().trim().min(5).max(200).required(),
        homeAddress: Joi.string().trim().min(5).max(200).required(),
        homePhone: Joi.string().custom(nigerianPhone).required().messages({
            'any.invalid': 'Invalid Nigerian phone number format'
        }),
        whatsApp: Joi.string().custom(nigerianPhone).required().messages({
            'any.invalid': 'Invalid WhatsApp number format'
        }),
        email: Joi.string().email().lowercase().required()
    }).required(),

    // Schools Attended
    schools: Joi.object({
        school1: Joi.string().trim().min(2).max(200).optional(),
        school1StartDate: Joi.date().iso().max('now').optional(),
        school1EndDate: Joi.date().iso().max('now').greater(Joi.ref('school1StartDate')).optional(),
        school2: Joi.string().trim().max(200).allow('').optional(),
        school2StartDate: Joi.date().iso().max('now').optional().allow(''),
        school2EndDate: Joi.date().iso().max('now').optional().allow(''),
        school3: Joi.string().trim().max(200).allow('').optional(),
        school3StartDate: Joi.date().iso().max('now').optional().allow(''),
        school3EndDate: Joi.date().iso().max('now').optional().allow('')
    }).required(),

    // Class Preferences
    classPreferences: Joi.object({
        presentClass: Joi.string()
            // .valid('JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3', 'Primary')
            .required(),
        classInterestedIn: Joi.string()
            // .valid('JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3')
            .required()
    }).required(),

   
    // Health Information
    health: Joi.object({
        infectiousDisease: Joi.string().trim().max(200).allow('').optional(),
        foodAllergy: Joi.string().trim().max(200).allow('').optional()
    }).required(),

    // Contact Information
    contact: Joi.object({
        correspondenceEmail: Joi.string().email().lowercase().required(),
        howDidYouKnow: Joi.string()
            // .valid("",'Social Media', 'Friend/Family', 'Website', 'Advertisement', 'Former Student', 'Other')
            .allow("")
    }).required()
});

// Validate admission data
const validateAdmission = (data) => {
    return admissionSchema.validate(data, {
        abortEarly: false,
        stripUnknown: true
    });
};

module.exports = {
    validateAdmission,
    admissionSchema
};