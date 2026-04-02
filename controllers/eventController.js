/**
 * controllers/eventController.js
 *
 * HTTP request/response handling for the Events module.
 *
 * Each handler follows the same three-step pattern:
 *   1. Validate input with Joi
 *   2. Delegate to eventService
 *   3. Send a standardised response via sendSuccess
 *
 * No business logic or DB access lives here.
 *
 * Role access matrix (enforced on routes, documented here for clarity):
 * ┌─────────────────────────────────┬─────────────────────────────────────────┐
 * │ Route                           │ Allowed roles                           │
 * ├─────────────────────────────────┼─────────────────────────────────────────┤
 * │ GET    /events                  │ All authenticated + parent              │
 * │ GET    /events/:id              │ All authenticated + parent              │
 * │ POST   /events                  │ super_admin, admin, principal           │
 * │ PUT    /events/:id              │ super_admin, admin, principal           │
 * │ DELETE /events/:id              │ super_admin, admin                      │
 * │ POST   /events/:id/notify       │ super_admin, admin, principal           │
 * └─────────────────────────────────┴─────────────────────────────────────────┘
 */

const asyncHandler  = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const { sendSuccess } = require('../utils/sendResponse');
const eventService  = require('../services/eventService');

const {
    validate,
    createEventSchema,
    updateEventSchema,
    eventQuerySchema,
} = require('../helpers/eventValidations');

// ─── Helper ───────────────────────────────────────────────────────────────────

const extractJoiErrors = (joiError) =>
    joiError.details.map((d) => ({
        field:   d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
    }));

// ─── GET /events ──────────────────────────────────────────────────────────────

/**
 * @desc    Get all events (paginated + filtered)
 * @route   GET /api/v1/events
 * @access  All authenticated roles + parent
 */
exports.getAllEvents = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(eventQuerySchema, req.query);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await eventService.getAllEvents(value);
    sendSuccess(res, 200, '', result);
});

// ─── GET /events/:id ──────────────────────────────────────────────────────────

/**
 * @desc    Get a single event by ID
 * @route   GET /api/v1/events/:id
 * @access  All authenticated roles + parent
 */
exports.getEvent = asyncHandler(async (req, res) => {
    const result = await eventService.getEvent(req.params.id);
    sendSuccess(res, 200, '', result);
});

// ─── POST /events ─────────────────────────────────────────────────────────────

/**
 * @desc    Create a new event
 * @route   POST /api/v1/events
 * @access  super_admin | admin | principal
 */
exports.createEvent = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(createEventSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await eventService.createEvent(value, req.user.id);
    sendSuccess(res, 201, 'Event created successfully', result);
});

// ─── PUT /events/:id ──────────────────────────────────────────────────────────

/**
 * @desc    Update an event (partial)
 * @route   PUT /api/v1/events/:id
 * @access  super_admin | admin | principal
 */
exports.updateEvent = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(updateEventSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await eventService.updateEvent(req.params.id, value, req.user.id);
    sendSuccess(res, 200, 'Event updated successfully', result);
});

// ─── DELETE /events/:id ───────────────────────────────────────────────────────

/**
 * @desc    Delete an event
 * @route   DELETE /api/v1/events/:id
 * @access  super_admin | admin
 */
exports.deleteEvent = asyncHandler(async (req, res) => {
    await eventService.deleteEvent(req.params.id);
    sendSuccess(res, 200, 'Event deleted successfully');
});

// ─── POST /events/:id/notify ──────────────────────────────────────────────────

/**
 * @desc    Push an event notification to all parents
 * @route   POST /api/v1/events/:id/notify
 * @access  super_admin | admin | principal
 */
exports.notifyParents = asyncHandler(async (req, res) => {
    const result = await eventService.notifyParents(req.params.id, req.user.id);
    sendSuccess(res, 200, `Notification sent for "${result.title}"`, result);
});
