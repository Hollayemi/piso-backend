/**
 * academicsValidations.js
 *
 * Joi validation schemas for the Academics module:
 *   - Classes   (3.3 / 3.4)
 *   - Subjects  (3.8 / 3.9)
 *   - Timetable (3.11 – 3.14)
 */

const Joi = require('joi');
const { CLASS_LEVELS, CLASS_GROUPS } = require('../model/class.model');
const { SUBJECT_CATEGORIES, SUBJECT_DEPTS } = require('../model/subject.model');
const { DAYS_OF_WEEK, TEACH_SLOT_IDS } = require('../model/timetable.model');

// ─── Generic validation runner ────────────────────────────────────────────────

/**
 * Validates `data` against `schema`.
 * Returns { error, value } — matches Joi's native pattern.
 *
 * @param {object} schema - Joi schema
 * @param {object} data   - Raw request body / query
 */
const validate = (schema, data) =>
    schema.validate(data, { abortEarly: false, stripUnknown: true });

// ─── 3.3  Create Class ────────────────────────────────────────────────────────

const createClassSchema = Joi.object({
    name: Joi.string().trim().min(2).max(50).required().messages({
        'any.required': 'Class name is required',
        'string.min':   'Class name must be at least 2 characters',
    }),

    level: Joi.string()
        .valid(...CLASS_LEVELS)
        .required()
        .messages({
            'any.only':    `Level must be one of: ${CLASS_LEVELS.join(', ')}`,
            'any.required': 'Level is required',
        }),

    arm: Joi.string().trim().max(20).allow('').optional(),

    group: Joi.string()
        .valid(...CLASS_GROUPS)
        .required()
        .messages({
            'any.only':    `Group must be one of: ${CLASS_GROUPS.join(', ')}`,
            'any.required': 'Group is required',
        }),

    capacity: Joi.number().integer().min(1).required().messages({
        'number.min':   'Capacity must be at least 1',
        'any.required': 'Capacity is required',
    }),

    classTeacherId: Joi.string().trim().allow('').optional(),
});

// ─── 3.4  Update Class (all fields optional) ──────────────────────────────────

const updateClassSchema = createClassSchema.fork(
    ['name', 'level', 'group', 'capacity'],
    (field) => field.optional()
);

// ─── 3.8  Create Subject ──────────────────────────────────────────────────────

const createSubjectSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required().messages({
        'any.required': 'Subject name is required',
    }),

    code: Joi.string()
        .trim()
        .uppercase()
        .min(2)
        .max(6)
        .required()
        .messages({
            'any.required': 'Subject code is required',
            'string.max':   'Subject code cannot exceed 6 characters',
        }),

    category: Joi.string()
        .valid(...SUBJECT_CATEGORIES)
        .required()
        .messages({
            'any.only':    `Category must be one of: ${SUBJECT_CATEGORIES.join(', ')}`,
            'any.required': 'Category is required',
        }),

    dept: Joi.string()
        .valid(...SUBJECT_DEPTS)
        .default('General')
        .optional()
        .messages({
            'any.only': `Dept must be one of: ${SUBJECT_DEPTS.join(', ')}`,
        }),

    periodsPerWeek: Joi.number().integer().min(1).max(10).required().messages({
        'any.required': 'periodsPerWeek is required',
        'number.min':   'Must have at least 1 period per week',
        'number.max':   'Cannot exceed 10 periods per week',
    }),

    color: Joi.string().trim().allow('').optional(),

    teacherIds: Joi.array().items(Joi.string().trim()).default([]).optional(),

    classes: Joi.array().items(Joi.string().trim()).default([]).optional(),
});

// ─── 3.9  Update Subject (all fields optional) ────────────────────────────────

const updateSubjectSchema = createSubjectSchema.fork(
    ['name', 'code', 'category', 'periodsPerWeek'],
    (field) => field.optional()
);

// ─── 3.11  Get Timetable — query params ──────────────────────────────────────

const getTimetableSchema = Joi.object({
    session: Joi.string().trim().allow('').optional(),
    term:    Joi.string().trim().allow('').optional(),
});

// ─── 3.12  Save / Update Timetable Cell ──────────────────────────────────────

const saveCellSchema = Joi.object({
    day: Joi.string()
        .valid(...DAYS_OF_WEEK)
        .required()
        .messages({
            'any.only':    `Day must be one of: ${DAYS_OF_WEEK.join(', ')}`,
            'any.required': 'Day is required',
        }),

    slotId: Joi.string()
        .valid(...TEACH_SLOT_IDS)
        .required()
        .messages({
            'any.only':    `slotId must be a teaching slot (${TEACH_SLOT_IDS.join(', ')})`,
            'any.required': 'slotId is required',
        }),

    subjectId: Joi.string().trim().required().messages({
        'any.required': 'subjectId is required',
    }),

    teacherId: Joi.string().trim().required().messages({
        'any.required': 'teacherId is required',
    }),

    note:    Joi.string().trim().max(300).allow('').optional(),
    session: Joi.string().trim().allow('').optional(),
    term:    Joi.string().trim().allow('').optional(),
});

// ─── 3.13  Clear Timetable Cell ───────────────────────────────────────────────

const clearCellSchema = Joi.object({
    day: Joi.string()
        .valid(...DAYS_OF_WEEK)
        .required()
        .messages({
            'any.only':    `Day must be one of: ${DAYS_OF_WEEK.join(', ')}`,
            'any.required': 'Day is required',
        }),

    slotId: Joi.string().trim().required().messages({
        'any.required': 'slotId is required',
    }),

    session: Joi.string().trim().allow('').optional(),
    term:    Joi.string().trim().allow('').optional(),
});

// ─── 3.14  Clear Full Timetable — query params ────────────────────────────────

const clearTimetableSchema = Joi.object({
    session: Joi.string().trim().allow('').optional(),
    term:    Joi.string().trim().allow('').optional(),
});

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    validate,
    createClassSchema,
    updateClassSchema,
    createSubjectSchema,
    updateSubjectSchema,
    getTimetableSchema,
    saveCellSchema,
    clearCellSchema,
    clearTimetableSchema,
};
