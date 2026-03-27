const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const { sendSuccess } = require('../utils/sendResponse');
const studentService = require('../services/studentService');
const {
    createStudentSchema,
    updateStudentSchema,
    updateStatusSchema,
    promoteStudentsSchema,
    validate,
} = require('../helpers/studentValidations');


const extractJoiErrors = (joiError) =>
    joiError.details.map((d) => ({
        field:   d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
    }));

// ─── 1.1  GET /students ───────────────────────────────────────────────────────

/**
 * @desc    Get all students (paginated + filtered)
 * @route   GET /api/v1/students
 * @access  super_admin | admin | principal
 */
exports.getAllStudents = asyncHandler(async (req, res) => {
    const result = await studentService.getAllStudents(req.query);

    sendSuccess(res, 200, '', { ...result });
});

// ─── 1.2  GET /students/:id ───────────────────────────────────────────────────

/**
 * @desc    Get a single student by ID
 * @route   GET /api/v1/students/:id
 * @access  super_admin | admin | principal
 */
exports.getStudent = asyncHandler(async (req, res) => {
    const result = await studentService.getStudentById(req.params.id);

    sendSuccess(res, 200, '', result);
});

// ─── 1.3  POST /students ─────────────────────────────────────────────────────

/**
 * @desc    Register a new student
 * @route   POST /api/v1/students
 * @access  super_admin | admin
 */
exports.addStudent = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(createStudentSchema, req.body);

    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await studentService.createStudent(
        value,
        req.files || null,
        req.user.id,
        req.ip || req.connection?.remoteAddress
    );

    sendSuccess(res, 201, 'Student registered successfully', result);
});

// ─── 1.4  PUT /students/:id ───────────────────────────────────────────────────

/**
 * @desc    Update a student record (partial)
 * @route   PUT /api/v1/students/:id
 * @access  super_admin | admin
 */
exports.updateStudent = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(updateStudentSchema, req.body);

    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await studentService.updateStudent(
        req.params.id,
        value,
        req.files || null,
        req.user.id
    );

    sendSuccess(res, 200, 'Student updated successfully', result);
});

// ─── 1.5  DELETE /students/:id ────────────────────────────────────────────────

/**
 * @desc    Delete a student record
 * @route   DELETE /api/v1/students/:id
 * @access  super_admin | admin
 */
exports.deleteStudent = asyncHandler(async (req, res) => {
    await studentService.deleteStudent(req.params.id);

    sendSuccess(res, 200, 'Student record deleted successfully');
});

// ─── 1.6  PATCH /students/:id/status ─────────────────────────────────────────

/**
 * @desc    Update student status (Active | Inactive | Graduated | Suspended | Transferred)
 * @route   PATCH /api/v1/students/:id/status
 * @access  super_admin | admin
 */
exports.updateStudentStatus = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(updateStatusSchema, req.body);

    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await studentService.updateStudentStatus(
        req.params.id,
        value.status,
        value.reason || '',
        req.user.id
    );

    sendSuccess(res, 200, `Student status updated to ${value.status}`, result);
});

// ─── 1.7  POST /students/promote ─────────────────────────────────────────────

/**
 * @desc    Bulk promote students from one class to another
 * @route   POST /api/v1/students/promote
 * @access  super_admin | admin
 */
exports.promoteStudents = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(promoteStudentsSchema, req.body);

    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await studentService.promoteStudents(
        value.fromClass,
        value.toClass,
        value.studentIds,
        value.session,
        value.term,
        req.user.id
    );

    const msg = `${result.promoted} student(s) promoted from ${value.fromClass} to ${value.toClass}`;

    sendSuccess(res, 200, msg, result);
});

// ─── 1.8  GET /students/:id/attendance ───────────────────────────────────────

/**
 * @desc    Get attendance summary for a student
 * @route   GET /api/v1/students/:id/attendance
 * @access  super_admin | admin | principal
 */
exports.getAttendanceSummary = asyncHandler(async (req, res) => {
    const { term, session } = req.query;

    const result = await studentService.getAttendanceSummary(
        req.params.id,
        term,
        session
    );

    sendSuccess(res, 200, '', result);
});
