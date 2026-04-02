/**
 * services/eventService.js
 *
 * All database interactions and business logic for the Events module.
 *
 *   GET    /events                → getAllEvents
 *   GET    /events/:id            → getEvent
 *   POST   /events                → createEvent
 *   PUT    /events/:id            → updateEvent
 *   DELETE /events/:id            → deleteEvent
 *   POST   /events/:id/notify     → notifyParents
 *
 * Controllers are thin wrappers; only this layer touches MongoDB.
 */

const Event = require('../model/event.model');
const { EVENT_TYPES, EVENT_STATUSES, TARGET_AUDIENCES } = require('../model/event.model');
const ErrorResponse = require('../utils/errorResponse');

// ─── ID Generation ────────────────────────────────────────────────────────────

/**
 * Generates the next sequential event ID.
 * Format: EVT-YYYY-NNNN  e.g. EVT-2025-0001
 *
 * @returns {{ eventId: string, serialNumber: number }}
 */
const generateEventId = async () => {
    const year   = new Date().getFullYear();
    const prefix = `EVT-${year}-`;

    const latest = await Event.findOne(
        { eventId: { $regex: `^${prefix}` } },
        { serialNumber: 1 }
    ).sort({ serialNumber: -1 });

    const nextSerial   = latest ? latest.serialNumber + 1 : 1;
    const paddedSerial = String(nextSerial).padStart(4, '0');

    return { eventId: `${prefix}${paddedSerial}`, serialNumber: nextSerial };
};

// ─── Auto-status updater ──────────────────────────────────────────────────────

/**
 * Derives the appropriate status based on the event dates.
 * Only applied when the caller does NOT explicitly pass a status value.
 *
 * @param {Date}       date
 * @param {Date|null}  endDate
 * @param {string}     currentStatus
 * @returns {string}
 */
const deriveStatus = (date, endDate, currentStatus) => {
    // If already cancelled, keep it
    if (currentStatus === 'Cancelled') return 'Cancelled';

    const now     = new Date();
    const start   = new Date(date);
    const finish  = endDate ? new Date(endDate) : new Date(date);

    // Set finish to end of that day
    finish.setHours(23, 59, 59, 999);

    if (now < start)  return 'Upcoming';
    if (now > finish) return 'Completed';
    return 'Ongoing';
};

// ─── Shape Helpers ────────────────────────────────────────────────────────────

/**
 * Standard list-item shape.
 * Excludes heavy fields like `description` for performance.
 *
 * @param {object} doc - Event lean doc (with virtuals)
 */
const toListItem = (doc) => ({
    id:              doc.eventId,
    title:           doc.title,
    type:            doc.type,
    date:            doc.date,
    endDate:         doc.endDate    || null,
    time:            doc.time       || '',
    location:        doc.location   || '',
    status:          doc.status,
    targetAudience:  doc.targetAudience,
    requiresPayment: doc.requiresPayment,
    paymentAmount:   doc.paymentAmount   || 0,
    paymentDeadline: doc.paymentDeadline || null,
    notifiedAt:      doc.notifiedAt      || null,
    isNew:           doc.isNew,
    isPast:          doc.isPast,
    createdAt:       doc.createdAt,
});

/**
 * Full detail shape including description + audit fields.
 *
 * @param {object} doc - Event lean doc (with virtuals)
 */
const toDetailView = (doc) => ({
    ...toListItem(doc),
    description:    doc.description    || '',
    markedNewUntil: doc.markedNewUntil || null,
    createdBy:      doc.createdBy      || '',
    lastUpdatedBy:  doc.lastUpdatedBy  || '',
    updatedAt:      doc.updatedAt,
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /events
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns a paginated, filtered list of events.
 *
 * @param {object} query - { page, limit, search, type, status,
 *                           requiresPayment, audience, upcoming, past }
 */
const getAllEvents = async ({
    page,
    limit,
    search,
    type,
    status,
    requiresPayment,
    audience,
    upcoming,
    past,
} = {}) => {
    const pageNum  = Math.max(parseInt(page,  10) || 1,  1);
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const skip     = (pageNum - 1) * limitNum;

    const filter = {};

    // Full-text search on title + description
    if (search) {
        filter.$or = [
            { title:       { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { type:        { $regex: search, $options: 'i' } },
            { location:    { $regex: search, $options: 'i' } },
        ];
    }

    if (type)   filter.type   = type;
    if (status) filter.status = status;

    if (requiresPayment !== undefined && requiresPayment !== '') {
        filter.requiresPayment = requiresPayment === true || requiresPayment === 'true';
    }

    if (audience) {
        filter.targetAudience = { $in: [audience, 'All'] };
    }

    // Date range shortcuts
    const now = new Date();
    if (upcoming === 'true' || upcoming === true) {
        filter.date = { $gte: now };
    } else if (past === 'true' || past === true) {
        filter.date = { $lt: now };
    }

    const [events, total] = await Promise.all([
        Event.find(filter)
            .sort({ date: 1 })   // chronological — upcoming first
            .skip(skip)
            .limit(limitNum)
            .lean({ virtuals: true }),
        Event.countDocuments(filter),
    ]);

    // Stats aggregation (type breakdown + upcoming count)
    const [statsAgg] = await Event.aggregate([
        {
            $group: {
                _id:            null,
                total:          { $sum: 1 },
                upcoming:       { $sum: { $cond: [{ $gte: ['$date', now] }, 1, 0] } },
                requirePayment: { $sum: { $cond: ['$requiresPayment', 1, 0] } },
            },
        },
    ]);

    // Type breakdown
    const typeAgg = await Event.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort:  { count: -1 } },
    ]);

    const typeBreakdown = Object.fromEntries(typeAgg.map((t) => [t._id, t.count]));

    const stats = statsAgg
        ? {
              total:          statsAgg.total,
              upcoming:       statsAgg.upcoming,
              requirePayment: statsAgg.requirePayment,
              typeBreakdown,
          }
        : { total: 0, upcoming: 0, requirePayment: 0, typeBreakdown: {} };

    return {
        events: events.map(toListItem),
        stats,
        pagination: {
            total,
            page:       pageNum,
            limit:      limitNum,
            totalPages: Math.ceil(total / limitNum),
        },
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /events/:id
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns full detail for a single event.
 *
 * @param {string} id - eventId e.g. "EVT-2025-0001"
 */
const getEvent = async (id) => {
    const event = await Event.findOne({
        eventId: id.toUpperCase(),
    }).lean({ virtuals: true });

    if (!event) {
        throw new ErrorResponse(`Event '${id}' not found`, 404, [{ code: 'NOT_FOUND' }]);
    }

    return { event: toDetailView(event) };
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /events
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a new event.
 *
 * @param {object} body      - Validated request body
 * @param {string} createdBy - Staff ID of the authenticated user
 */
const createEvent = async (body, createdBy) => {
    const { eventId, serialNumber } = await generateEventId();

    // Auto-derive status from dates if not explicitly provided
    const status = body.status || deriveStatus(body.date, body.endDate || null, 'Upcoming');

    const event = await Event.create({
        eventId,
        serialNumber,
        title:           body.title,
        type:            body.type            || 'General',
        description:     body.description     || '',
        date:            new Date(body.date),
        endDate:         body.endDate         ? new Date(body.endDate) : null,
        time:            body.time            || '',
        location:        body.location        || '',
        targetAudience:  body.targetAudience  || ['All'],
        status,
        requiresPayment: body.requiresPayment || false,
        paymentAmount:   body.requiresPayment ? (body.paymentAmount || 0) : 0,
        paymentDeadline: body.requiresPayment && body.paymentDeadline
            ? new Date(body.paymentDeadline)
            : null,
        markedNewUntil:  body.markedNewUntil
            ? new Date(body.markedNewUntil)
            : null,
        createdBy,
    });

    return { event: toDetailView(event.toObject({ virtuals: true })) };
};

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /events/:id
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Partially updates an event.
 *
 * @param {string} id        - eventId
 * @param {object} body      - Validated partial body
 * @param {string} updatedBy - Staff ID
 */
const updateEvent = async (id, body, updatedBy) => {
    const existing = await Event.findOne({ eventId: id.toUpperCase() });

    if (!existing) {
        throw new ErrorResponse(`Event '${id}' not found`, 404, [{ code: 'NOT_FOUND' }]);
    }

    // Parse date fields
    if (body.date)            body.date            = new Date(body.date);
    if (body.endDate)         body.endDate         = new Date(body.endDate);
    if (body.paymentDeadline) body.paymentDeadline = new Date(body.paymentDeadline);
    if (body.markedNewUntil)  body.markedNewUntil  = new Date(body.markedNewUntil);

    // Clear payment fields when requiresPayment is toggled off
    if (body.requiresPayment === false) {
        body.paymentAmount   = 0;
        body.paymentDeadline = null;
    }

    // Re-derive status from updated dates unless caller explicitly set it
    if (!body.status) {
        const newDate    = body.date    || existing.date;
        const newEndDate = body.endDate !== undefined ? body.endDate : existing.endDate;
        body.status      = deriveStatus(newDate, newEndDate, existing.status);
    }

    body.lastUpdatedBy = updatedBy;

    const updated = await Event.findOneAndUpdate(
        { eventId: id.toUpperCase() },
        { $set: body },
        { new: true, runValidators: true }
    ).lean({ virtuals: true });

    return { event: toDetailView(updated) };
};

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /events/:id
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Permanently deletes an event.
 *
 * @param {string} id - eventId
 */
const deleteEvent = async (id) => {
    const event = await Event.findOne({ eventId: id.toUpperCase() });

    if (!event) {
        throw new ErrorResponse(`Event '${id}' not found`, 404, [{ code: 'NOT_FOUND' }]);
    }

    await event.deleteOne();
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /events/:id/notify
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Records that a notification was sent to parents and timestamps it.
 * In production this would fire an email/SMS batch via nodemailer/Twilio.
 *
 * @param {string} id        - eventId
 * @param {string} sentBy    - Staff ID
 */
const notifyParents = async (id, sentBy) => {
    const event = await Event.findOne({ eventId: id.toUpperCase() });

    if (!event) {
        throw new ErrorResponse(`Event '${id}' not found`, 404, [{ code: 'NOT_FOUND' }]);
    }

    if (event.status === 'Cancelled') {
        throw new ErrorResponse(
            'Cannot notify parents for a cancelled event.',
            400,
            [{ code: 'EVENT_CANCELLED' }]
        );
    }

    const notifiedAt = new Date();

    await Event.findByIdAndUpdate(event._id, {
        $set: {
            notifiedAt,
            lastUpdatedBy: sentBy,
        },
    });

    // ── Production hook ────────────────────────────────────────────────────
    // In a real deployment you would query Parent.find({}) here and send
    // individual emails/SMS messages via your notification provider.
    // e.g. await notificationService.broadcastEvent(event, notifiedAt);
    // ──────────────────────────────────────────────────────────────────────

    if (process.env.NODE_ENV === 'development') {
        console.log(
            `[EventService] Notification broadcast for ${event.eventId} — "${event.title}" at ${notifiedAt.toISOString()}`
        );
    }

    return {
        eventId:     event.eventId,
        title:       event.title,
        notifiedAt,
        notifiedBy:  sentBy,
    };
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    getAllEvents,
    getEvent,
    createEvent,
    updateEvent,
    deleteEvent,
    notifyParents,
};
