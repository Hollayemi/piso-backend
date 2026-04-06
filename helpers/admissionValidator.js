const Joi = require('joi');

// ─── Reusable sub-schemas ─────────────────────────────────────────────────────

const guardianSchema = Joi.object({
    name:          Joi.string().trim().required().label('Name'),
    occupation:    Joi.string().trim().optional().allow("").label('Occupation'),
    officeAddress: Joi.string().trim().required().label('Office Address'),
    homeAddress:   Joi.string().trim().required().label('Home Address'),
    homePhone:     Joi.string().trim().required().label('Home Phone'),
    whatsApp:      Joi.string().trim().optional().allow("").label('WhatsApp'),
    // email:         Joi.string().email().lowercase().trim().required().label('Email'),
});


const vaccinationSchema = Joi.object({
    polio:         Joi.boolean().optional(),
    smallPox:      Joi.boolean().optional(),
    measles:       Joi.boolean().optional(),
    tetanus:       Joi.boolean().optional(),
    yellowFever:   Joi.boolean().optional(),
    whoopingCough: Joi.boolean().optional(),
    diphtheria:    Joi.boolean().optional(),
    cholera:       Joi.boolean().optional(),
});

const healthSchema = Joi.object({
    vaccinations:      vaccinationSchema.optional(),
    otherVaccination:  Joi.string().allow('').optional(),
    infectiousDisease: Joi.string().allow('').optional(),
    foodAllergy:       Joi.string().allow('').optional(),
});

// ─── 1.3  Submit Application ──────────────────────────────────────────────────

const submitApplicationSchema = Joi.object({
    // Child details
    surname:         Joi.string().trim().max(50).required().label('Surname'),
    firstName:       Joi.string().trim().max(50).required().label('First Name'),
    middleName:      Joi.string().trim().max(50).allow('').optional(),
    dateOfBirth:     Joi.date().iso().max('now').required().label('Date of Birth'),
    gender:          Joi.string().valid('male', 'female').required().label('Gender'),
    bloodGroup:      Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', '').optional(),
    genotype:        Joi.string().valid('AA', 'AS', 'SS', 'AC', 'SC', '').optional(),
    nationality:     Joi.string().trim().required().label('Nationality'),
    stateOfOrigin:   Joi.string().trim().required().label('State of Origin'),
    localGovernment: Joi.string().trim().required().label('Local Government'),
    schoolingOption: Joi.string().valid('day', 'boarding').required().label('Schooling Option'),

    classPreferences: Joi.object({
        presentClass:      Joi.string().trim().allow('').optional(),
        classInterestedIn: Joi.string().trim().allow('').optional(),
    }).optional(),

    // Parents — required on the application
    father: guardianSchema.required().label('Father'),
    mother: guardianSchema.required().label('Mother'),

    correspondenceEmail: Joi.string().email().lowercase().trim().required()
        .label('Correspondence Email'),

    howDidYouKnow: Joi.string().trim().allow('').optional(),

    schools: Joi.object().optional(),
    health:  healthSchema.optional(),
});

// ─── 1.4  Update Application Status ──────────────────────────────────────────

const updateApplicationStatusSchema = Joi.object({
    status: Joi.string()
        .valid('Pending', 'Under Review', 'Approved for Screening', 'Rejected')
        .required()
        .label('Status'),
    reviewedBy: Joi.string().trim().allow('').optional(),
    adminNotes: Joi.string().trim().allow('').optional(),
});

// ─── 1.7  Update Screening Record ────────────────────────────────────────────

const updateScreeningRecordSchema = Joi.object({
    screeningStatus: Joi.string()
        .valid('Pending', 'Verified', 'Rejected')
        .required()
        .label('Screening Status'),
    docs: Joi.object({
        birthCertificate:   Joi.boolean().optional(),
        formerSchoolReport: Joi.boolean().optional(),
        proofOfPayment:     Joi.boolean().optional(),
        immunizationCard:   Joi.boolean().optional(),
        medicalReport:      Joi.boolean().optional(),
    }).optional(),
    assignedOfficer: Joi.string().trim().allow('').optional(),
    notes:           Joi.string().trim().allow('').optional(),
});

// ─── 1.9  Send Offer Letter ───────────────────────────────────────────────────

const sendOfferLetterSchema = Joi.object({
    acceptanceDeadline: Joi.date().iso().greater('now').required()
        .label('Acceptance Deadline')
        .messages({ 'date.greater': 'Acceptance deadline must be a future date' }),
    resend: Joi.boolean().optional().default(false),
});

// ─── 1.10  Update Offer Acceptance Status ────────────────────────────────────

const updateOfferAcceptanceStatusSchema = Joi.object({
    acceptanceStatus: Joi.string()
        .valid('Accepted', 'Declined', 'Pending')
        .required()
        .label('Acceptance Status'),
});

// ─── Middleware factory ───────────────────────────────────────────────────────

const validate = (schema) => (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
        abortEarly:   false,
        stripUnknown: true,
    });

    if (error) {
        const errors = error.details.map((d) => ({
            field:   d.path.join('.'),
            message: d.message.replace(/"/g, ''),
        }));

        return res.status(400).json({
            type:    'error',
            message: 'Validation failed',
            code:    'VALIDATION_ERROR',
            errors,
        });
    }

    req.body = value;
    next();
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    validateSubmitApplication:           validate(submitApplicationSchema),
    validateUpdateApplicationStatus:     validate(updateApplicationStatusSchema),
    validateUpdateScreeningRecord:       validate(updateScreeningRecordSchema),
    validateSendOfferLetter:             validate(sendOfferLetterSchema),
    validateUpdateOfferAcceptanceStatus: validate(updateOfferAcceptanceStatusSchema),
};
