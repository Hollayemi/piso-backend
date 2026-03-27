/**
 * transportController.js
 *
 * HTTP request/response handling for the Transport module (4.1 – 4.12).
 *
 * Each handler follows the same pattern:
 *   1. Validate input with Joi (where applicable)
 *   2. Delegate to transportService
 *   3. Send a standardised response via sendSuccess
 *
 * No business logic or DB access lives here.
 *
 * Sub-modules:
 *   Bus Routes      → 4.1 – 4.4
 *   Bus Enrollments → 4.5 – 4.7
 *   Special Trips   → 4.8 – 4.11
 *   Stats           → 4.12
 */

const asyncHandler    = require('../middleware/asyncHandler');
const ErrorResponse   = require('../utils/errorResponse');
const { sendSuccess } = require('../utils/sendResponse');
const transportService = require('../services/transportService');

const {
    validate,
    createRouteSchema,
    updateRouteSchema,
    enrollmentQuerySchema,
    enrollStudentSchema,
    removeEnrollmentQuerySchema,
    tripQuerySchema,
    createTripSchema,
    updateTripSchema,
} = require('../helpers/transportValidations');

// ─── Helper ───────────────────────────────────────────────────────────────────

const extractJoiErrors = (joiError) =>
    joiError.details.map((d) => ({
        field:   d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
    }));

// ═══════════════════════════════════════════════════════════════════════════════
// BUS ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 4.1  GET /transport/routes ───────────────────────────────────────────────

/**
 * @desc    Get all bus routes with current-term enrollment counts
 * @route   GET /api/v1/transport/routes
 * @access  super_admin | admin | principal
 */
exports.getAllRoutes = asyncHandler(async (req, res) => {
    const result = await transportService.getAllRoutes();
    sendSuccess(res, 200, '', result);
});

// ─── 4.2  POST /transport/routes ──────────────────────────────────────────────

/**
 * @desc    Create a new bus route
 * @route   POST /api/v1/transport/routes
 * @access  super_admin | admin
 */
exports.createRoute = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(createRouteSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await transportService.createRoute(value, req.user.id);
    sendSuccess(res, 201, 'Bus route created', result);
});

// ─── 4.3  PUT /transport/routes/:id ──────────────────────────────────────────

/**
 * @desc    Update a bus route (partial)
 * @route   PUT /api/v1/transport/routes/:id
 * @access  super_admin | admin
 */
exports.updateRoute = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(updateRouteSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await transportService.updateRoute(req.params.id, value, req.user.id);
    sendSuccess(res, 200, 'Bus route updated', result);
});

// ─── 4.4  DELETE /transport/routes/:id ───────────────────────────────────────

/**
 * @desc    Delete a bus route (blocked if active enrollments exist)
 * @route   DELETE /api/v1/transport/routes/:id
 * @access  super_admin | admin
 */
exports.deleteRoute = asyncHandler(async (req, res) => {
    await transportService.deleteRoute(req.params.id);
    sendSuccess(res, 200, 'Bus route deleted');
});

// ═══════════════════════════════════════════════════════════════════════════════
// BUS ENROLLMENTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 4.5  GET /transport/enrollments ─────────────────────────────────────────

/**
 * @desc    Get all bus enrollments (paginated + filtered)
 * @route   GET /api/v1/transport/enrollments
 * @access  super_admin | admin | principal
 */
exports.getAllEnrollments = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(enrollmentQuerySchema, req.query);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await transportService.getAllEnrollments(value);
    sendSuccess(res, 200, '', result);
});

// ─── 4.6  POST /transport/enrollments ────────────────────────────────────────

/**
 * @desc    Enroll a student on a bus route
 * @route   POST /api/v1/transport/enrollments
 * @access  super_admin | admin
 */
exports.enrollStudent = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(enrollStudentSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await transportService.enrollStudent(value, req.user.id);
    sendSuccess(res, 201, 'Student enrolled for bus service', result);
});

// ─── 4.7  DELETE /transport/enrollments/:studentId ───────────────────────────

/**
 * @desc    Remove a student's bus enrollment for the given term
 * @route   DELETE /api/v1/transport/enrollments/:studentId
 * @access  super_admin | admin
 */
exports.removeEnrollment = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(removeEnrollmentQuerySchema, req.query);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    await transportService.removeEnrollment(req.params.studentId, value.term);
    sendSuccess(res, 200, 'Student removed from bus enrollment');
});

// ═══════════════════════════════════════════════════════════════════════════════
// SPECIAL TRIPS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 4.8  GET /transport/trips ────────────────────────────────────────────────

/**
 * @desc    Get all special trips with enrollment stats
 * @route   GET /api/v1/transport/trips
 * @access  super_admin | admin | principal
 */
exports.getAllTrips = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(tripQuerySchema, req.query);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await transportService.getAllTrips(value);
    sendSuccess(res, 200, '', result);
});

// ─── 4.9  POST /transport/trips ───────────────────────────────────────────────

/**
 * @desc    Create a new special trip
 * @route   POST /api/v1/transport/trips
 * @access  super_admin | admin
 */
exports.createTrip = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(createTripSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await transportService.createTrip(value, req.user.id);
    sendSuccess(res, 201, 'Special trip created', result);
});

// ─── 4.10  PUT /transport/trips/:id ──────────────────────────────────────────

/**
 * @desc    Update a special trip (partial)
 * @route   PUT /api/v1/transport/trips/:id
 * @access  super_admin | admin
 */
exports.updateTrip = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(updateTripSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await transportService.updateTrip(req.params.id, value, req.user.id);
    sendSuccess(res, 200, 'Special trip updated', result);
});

// ─── 4.11  DELETE /transport/trips/:id ───────────────────────────────────────

/**
 * @desc    Delete a special trip and all its enrollment records
 * @route   DELETE /api/v1/transport/trips/:id
 * @access  super_admin | admin
 */
exports.deleteTrip = asyncHandler(async (req, res) => {
    await transportService.deleteTrip(req.params.id);
    sendSuccess(res, 200, 'Special trip and all enrollments deleted');
});

// ═══════════════════════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 4.12  GET /transport/stats ───────────────────────────────────────────────

/**
 * @desc    Get transport summary stats (bus enrollments + trips)
 * @route   GET /api/v1/transport/stats
 * @access  super_admin | admin | principal
 */
exports.getTransportStats = asyncHandler(async (req, res) => {
    const result = await transportService.getTransportStats();
    sendSuccess(res, 200, '', result);
});
