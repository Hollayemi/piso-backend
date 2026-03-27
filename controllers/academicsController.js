/**
 * academicsController.js
 *
 * HTTP request/response handling for the Academics module (3.1 – 3.14).
 *
 * Each handler follows the same pattern:
 *   1. Validate input with Joi
 *   2. Delegate to the appropriate service
 *   3. Send a standardised response via sendSuccess
 *
 * No business logic or DB access lives here.
 *
 * Sub-modules:
 *   Classes   → 3.1 – 3.5
 *   Subjects  → 3.6 – 3.10
 *   Timetable → 3.11 – 3.14
 */

const asyncHandler  = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const { sendSuccess } = require('../utils/sendResponse');

const classService     = require('../services/classService');
const subjectService   = require('../services/subjectService');
const timetableService = require('../services/timetableService');

const {
    validate,
    createClassSchema,
    updateClassSchema,
    createSubjectSchema,
    updateSubjectSchema,
    getTimetableSchema,
    saveCellSchema,
    clearCellSchema,
    clearTimetableSchema,
} = require('../helpers/academicsValidations');

// ─── Helper ───────────────────────────────────────────────────────────────────

const extractJoiErrors = (joiError) =>
    joiError.details.map((d) => ({
        field:   d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
    }));

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 3.1  GET /academics/classes ─────────────────────────────────────────────

/**
 * @desc    Get all classes (filtered)
 * @route   GET /api/v1/academics/classes
 * @access  super_admin | admin | principal | teacher
 */
exports.getAllClasses = asyncHandler(async (req, res) => {
    const result = await classService.getAllClasses(req.query);
    sendSuccess(res, 200, '', result);
});

// ─── 3.2  GET /academics/classes/:id ─────────────────────────────────────────

/**
 * @desc    Get a single class by ID
 * @route   GET /api/v1/academics/classes/:id
 * @access  super_admin | admin | principal | teacher
 */
exports.getClass = asyncHandler(async (req, res) => {
    const result = await classService.getClassById(req.params.id);
    sendSuccess(res, 200, '', result);
});

// ─── 3.3  POST /academics/classes ─────────────────────────────────────────────

/**
 * @desc    Create a new class
 * @route   POST /api/v1/academics/classes
 * @access  super_admin | admin
 */
exports.createClass = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(createClassSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await classService.createClass(value, req.user.id);
    sendSuccess(res, 201, 'Class created successfully', result);
});

// ─── 3.4  PUT /academics/classes/:id ─────────────────────────────────────────

/**
 * @desc    Update a class (partial)
 * @route   PUT /api/v1/academics/classes/:id
 * @access  super_admin | admin
 */
exports.updateClass = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(updateClassSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await classService.updateClass(req.params.id, value, req.user.id);
    sendSuccess(res, 200, 'Class updated successfully', result);
});

// ─── 3.5  DELETE /academics/classes/:id ──────────────────────────────────────

/**
 * @desc    Delete a class (also removes timetable entries)
 * @route   DELETE /api/v1/academics/classes/:id
 * @access  super_admin | admin
 */
exports.deleteClass = asyncHandler(async (req, res) => {
    await classService.deleteClass(req.params.id);
    sendSuccess(res, 200, 'Class and related timetable entries deleted');
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUBJECTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 3.6  GET /academics/subjects ─────────────────────────────────────────────

/**
 * @desc    Get all subjects (filtered)
 * @route   GET /api/v1/academics/subjects
 * @access  super_admin | admin | principal | teacher
 */
exports.getAllSubjects = asyncHandler(async (req, res) => {
    const result = await subjectService.getAllSubjects(req.query);
    sendSuccess(res, 200, '', result);
});

// ─── 3.7  GET /academics/subjects/:id ────────────────────────────────────────

/**
 * @desc    Get a single subject by ID
 * @route   GET /api/v1/academics/subjects/:id
 * @access  super_admin | admin | principal | teacher
 */
exports.getSubject = asyncHandler(async (req, res) => {
    const result = await subjectService.getSubjectById(req.params.id);
    sendSuccess(res, 200, '', result);
});

// ─── 3.8  POST /academics/subjects ────────────────────────────────────────────

/**
 * @desc    Create a new subject
 * @route   POST /api/v1/academics/subjects
 * @access  super_admin | admin
 */
exports.createSubject = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(createSubjectSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await subjectService.createSubject(value, req.user.id);
    sendSuccess(res, 201, 'Subject created successfully', result);
});

// ─── 3.9  PUT /academics/subjects/:id ────────────────────────────────────────

/**
 * @desc    Update a subject (partial)
 * @route   PUT /api/v1/academics/subjects/:id
 * @access  super_admin | admin
 */
exports.updateSubject = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(updateSubjectSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await subjectService.updateSubject(req.params.id, value, req.user.id);
    sendSuccess(res, 200, 'Subject updated successfully', result);
});

// ─── 3.10  DELETE /academics/subjects/:id ────────────────────────────────────

/**
 * @desc    Delete a subject (also removed from all timetables)
 * @route   DELETE /api/v1/academics/subjects/:id
 * @access  super_admin | admin
 */
exports.deleteSubject = asyncHandler(async (req, res) => {
    await subjectService.deleteSubject(req.params.id);
    sendSuccess(res, 200, 'Subject deleted and removed from all timetables');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TIMETABLE
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 3.11  GET /academics/timetable/:className ───────────────────────────────

/**
 * @desc    Get the timetable for a class
 * @route   GET /api/v1/academics/timetable/:className
 * @access  super_admin | admin | principal | teacher
 */
exports.getTimetable = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(getTimetableSchema, req.query);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    // Decode URL-encoded class name e.g. "JSS%201A" → "JSS 1A"
    const className = decodeURIComponent(req.params.className);
    const result    = await timetableService.getTimetableForClass(className, value);
    sendSuccess(res, 200, '', result);
});

// ─── 3.12  PUT /academics/timetable/:className/cell ──────────────────────────

/**
 * @desc    Save or update a single timetable slot
 * @route   PUT /api/v1/academics/timetable/:className/cell
 * @access  super_admin | admin
 */
exports.saveTimetableCell = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(saveCellSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const className = decodeURIComponent(req.params.className);
    const result    = await timetableService.saveTimetableCell(className, value, req.user.id);
    sendSuccess(res, 200, 'Timetable slot updated', result);
});

// ─── 3.13  DELETE /academics/timetable/:className/cell ───────────────────────

/**
 * @desc    Clear a single timetable slot
 * @route   DELETE /api/v1/academics/timetable/:className/cell
 * @access  super_admin | admin
 */
exports.clearTimetableCell = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(clearCellSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const className = decodeURIComponent(req.params.className);
    const result    = await timetableService.clearTimetableCell(className, value, req.user.id);
    sendSuccess(res, 200, 'Timetable slot cleared', result);
});

// ─── 3.14  DELETE /academics/timetable/:className ────────────────────────────

/**
 * @desc    Clear the full timetable for a class in a given session + term
 * @route   DELETE /api/v1/academics/timetable/:className
 * @access  super_admin | admin
 */
exports.clearFullTimetable = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(clearTimetableSchema, req.query);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const className = decodeURIComponent(req.params.className);
    const result    = await timetableService.clearFullTimetable(className, value, req.user.id);
    sendSuccess(res, 200, `Timetable cleared for ${className}`, result);
});
