/**
 * transportService.js
 *
 * All database interactions and business logic for the Transport module
 * (4.1 – 4.12).
 *
 * Sub-sections:
 *   A. Bus Routes      → 4.1 – 4.4
 *   B. Bus Enrollments → 4.5 – 4.7
 *   C. Special Trips   → 4.8 – 4.11
 *   D. Stats           → 4.12
 *
 * Controllers are thin wrappers; only this file touches MongoDB for transport.
 */

const BusRoute       = require('../model/busRoute.model');
const BusEnrollment  = require('../model/busEnrollment.model');
const SpecialTrip    = require('../model/specialTrip.model');
const TripEnrollment = require('../model/tripEnrollment.model');
const ErrorResponse  = require('../utils/errorResponse');

// ─── Term helper ──────────────────────────────────────────────────────────────

/** Returns the current term string derived from calendar month. */
const currentTerm = () => {
    const month = new Date().getMonth();
    const year  = new Date().getFullYear();
    if (month >= 8  && month <= 11) return `1st Term ${year}/${year + 1}`;
    if (month >= 0  && month <= 2)  return `2nd Term ${year - 1}/${year}`;
    return `3rd Term ${year - 1}/${year}`;
};

// ═══════════════════════════════════════════════════════════════════════════════
// A. BUS ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ID Generation ────────────────────────────────────────────────────────────

const generateRouteId = async () => {
    const latest = await BusRoute.findOne({}, { serialNumber: 1 }).sort({ serialNumber: -1 });
    const nextSerial   = latest ? latest.serialNumber + 1 : 1;
    const paddedSerial = String(nextSerial).padStart(2, '0');
    return { routeId: `RT-${paddedSerial}`, serialNumber: nextSerial };
};

// ─── Shape Helper ─────────────────────────────────────────────────────────────

const toRouteView = (doc, enrolledCount = 0) => ({
    id:            doc.routeId,
    name:          doc.name,
    stops:         doc.stops,
    fee:           doc.fee,
    active:        doc.active,
    enrolledCount,
});

// ─── 4.1  Get All Bus Routes ──────────────────────────────────────────────────

/**
 * Returns all routes with live enrolled-student counts.
 */
const getAllRoutes = async () => {
    const routes = await BusRoute.find({}).sort({ serialNumber: 1 }).lean();

    // Batch enrollment counts — current term only
    const term    = currentTerm();
    const agg     = await BusEnrollment.aggregate([
        { $match: { term } },
        { $group: { _id: '$routeId', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(agg.map((r) => [r._id, r.count]));

    return {
        routes: routes.map((r) => toRouteView(r, countMap[r.routeId] || 0)),
    };
};

// ─── 4.2  Create Bus Route ────────────────────────────────────────────────────

const createRoute = async (body, createdBy) => {
    // Name uniqueness
    const existing = await BusRoute.findOne({ name: new RegExp(`^${body.name}$`, 'i') });
    if (existing) {
        throw new ErrorResponse(
            `A route named '${body.name}' already exists.`,
            409,
            [{ code: 'DUPLICATE_ROUTE' }]
        );
    }

    const { routeId, serialNumber } = await generateRouteId();

    const route = await BusRoute.create({
        routeId,
        serialNumber,
        name:      body.name,
        stops:     body.stops,
        fee:       body.fee,
        active:    body.active !== undefined ? body.active : true,
        createdBy,
    });

    return { route: toRouteView(route.toObject(), 0) };
};

// ─── 4.3  Update Bus Route ────────────────────────────────────────────────────

const updateRoute = async (id, body, updatedBy) => {
    const route = await BusRoute.findOne({ routeId: id.toUpperCase() });
    if (!route) {
        throw new ErrorResponse(`Route '${id}' not found`, 404);
    }

    // Name uniqueness check (only when name changes)
    if (body.name && body.name.toLowerCase() !== route.name.toLowerCase()) {
        const dup = await BusRoute.findOne({ name: new RegExp(`^${body.name}$`, 'i') });
        if (dup) {
            throw new ErrorResponse(
                `A route named '${body.name}' already exists.`,
                409,
                [{ code: 'DUPLICATE_ROUTE' }]
            );
        }
    }

    body.lastUpdatedBy = updatedBy;

    const updated = await BusRoute.findOneAndUpdate(
        { routeId: id.toUpperCase() },
        { $set: body },
        { new: true, runValidators: true }
    ).lean();

    const term         = currentTerm();
    const enrolledCount = await BusEnrollment.countDocuments({ routeId: updated.routeId, term });

    return { route: toRouteView(updated, enrolledCount) };
};

// ─── 4.4  Delete Bus Route ────────────────────────────────────────────────────

const deleteRoute = async (id) => {
    const route = await BusRoute.findOne({ routeId: id.toUpperCase() });
    if (!route) {
        throw new ErrorResponse(`Route '${id}' not found`, 404);
    }

    // Block if active enrollments exist (any term)
    const enrolled = await BusEnrollment.countDocuments({ routeId: route.routeId });
    if (enrolled > 0) {
        throw new ErrorResponse(
            `Cannot delete route '${route.name}' — ${enrolled} student(s) are currently enrolled. Remove them first.`,
            409,
            [{ code: 'ROUTE_HAS_ENROLLMENTS' }]
        );
    }

    await route.deleteOne();
};

// ═══════════════════════════════════════════════════════════════════════════════
// B. BUS ENROLLMENTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Shape Helper ─────────────────────────────────────────────────────────────

const toEnrollmentView = (doc) => ({
    id:           doc.studentId,
    surname:      (doc.studentName || '').split(' ')[0] || '',
    firstName:    (doc.studentName || '').split(' ').slice(1).join(' ') || '',
    class:        doc.studentClass,
    routeId:      doc.routeId,
    routeName:    doc.routeName,
    stop:         doc.stop,
    termFee:      doc.termFee,
    amountPaid:   doc.amountPaid,
    balance:      doc.balance,
    payStatus:    doc.payStatus,
    enrolledDate: doc.enrolledDate,
    gender:       doc.gender,
    parentPhone:  doc.parentPhone,
});

// ─── 4.5  Get All Bus Enrollments ─────────────────────────────────────────────

const getAllEnrollments = async ({ page, limit, search, routeId, payStatus }) => {
    const pageNum  = Math.max(parseInt(page,  10) || 1,  1);
    const limitNum = Math.min(parseInt(limit, 10) || 15, 100);
    const skip     = (pageNum - 1) * limitNum;

    const filter = {};

    if (search) {
        filter.$or = [
            { studentName: { $regex: search, $options: 'i' } },
            { studentId:   { $regex: search, $options: 'i' } },
        ];
    }
    if (routeId)   filter.routeId   = routeId.toUpperCase();
    if (payStatus) filter.payStatus = payStatus;

    const [enrollments, total] = await Promise.all([
        BusEnrollment.find(filter)
            .sort({ enrolledDate: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean(),
        BusEnrollment.countDocuments(filter),
    ]);

    // Aggregate stats across all matching enrollments (not just this page)
    const [summary] = await BusEnrollment.aggregate([
        { $match: filter },
        {
            $group: {
                _id:            null,
                totalExpected:  { $sum: '$termFee' },
                totalCollected: { $sum: '$amountPaid' },
                paid:    { $sum: { $cond: [{ $eq: ['$payStatus', 'Paid'] },    1, 0] } },
                partial: { $sum: { $cond: [{ $eq: ['$payStatus', 'Partial'] }, 1, 0] } },
                unpaid:  { $sum: { $cond: [{ $eq: ['$payStatus', 'Unpaid'] },  1, 0] } },
            },
        },
    ]);

    const stats = summary
        ? {
              total:          total,
              paid:           summary.paid,
              partial:        summary.partial,
              unpaid:         summary.unpaid,
              totalExpected:  summary.totalExpected,
              totalCollected: summary.totalCollected,
          }
        : { total: 0, paid: 0, partial: 0, unpaid: 0, totalExpected: 0, totalCollected: 0 };

    return {
        enrollments: enrollments.map(toEnrollmentView),
        stats,
        pagination: {
            total,
            page:       pageNum,
            limit:      limitNum,
            totalPages: Math.ceil(total / limitNum),
        },
    };
};

// ─── 4.6  Enroll Student for Bus ──────────────────────────────────────────────

const enrollStudent = async (body, enrolledBy) => {
    const { studentId, routeId, stop, term } = body;
    const resolvedTerm = term || currentTerm();

    // Verify student exists + pull snapshot fields
    const Student = require('../../model/student');
    const student = await Student.findOne(
        { studentId: studentId.toUpperCase() },
        { studentId: 1, surname: 1, firstName: 1, class: 1, gender: 1, father: 1, mother: 1 }
    ).lean();

    if (!student) {
        throw new ErrorResponse(`Student '${studentId}' not found`, 404);
    }

    // Verify route exists and is active
    const route = await BusRoute.findOne({ routeId: routeId.toUpperCase() }).lean();
    if (!route || !route.active) {
        throw new ErrorResponse(
            `Route '${routeId}' not found or is inactive.`,
            404,
            [{ code: 'ROUTE_NOT_FOUND' }]
        );
    }

    // Validate that the requested stop belongs to this route
    const normalizedStop = stop.trim().toLowerCase();
    const validStop = route.stops.find((s) => s.toLowerCase() === normalizedStop);
    if (!validStop) {
        throw new ErrorResponse(
            `Stop '${stop}' is not on route '${route.name}'. Valid stops: ${route.stops.join(', ')}.`,
            400,
            [{ code: 'INVALID_STOP' }]
        );
    }

    // Check for duplicate enrollment this term
    const existing = await BusEnrollment.findOne({
        studentId: student.studentId,
        term:      resolvedTerm,
    });
    if (existing) {
        throw new ErrorResponse(
            `Student '${studentId}' is already enrolled for bus service in ${resolvedTerm}.`,
            409,
            [{ code: 'ALREADY_ENROLLED' }]
        );
    }

    // Resolve parent phone for display (father first, then mother)
    const parentPhone = student.father?.homePhone || student.mother?.homePhone || '';

    const enrollment = await BusEnrollment.create({
        studentId:    student.studentId,
        studentName:  `${student.surname} ${student.firstName}`,
        studentClass: student.class,
        gender:       student.gender,
        parentPhone,
        routeId:      route.routeId,
        routeName:    route.name,
        stop:         validStop,
        term:         resolvedTerm,
        termFee:      route.fee,
        amountPaid:   0,
        balance:      route.fee,
        payStatus:    'Unpaid',
        enrolledBy,
    });

    return {
        enrollment: {
            studentId:    enrollment.studentId,
            studentName:  enrollment.studentName,
            routeId:      enrollment.routeId,
            routeName:    enrollment.routeName,
            stop:         enrollment.stop,
            termFee:      enrollment.termFee,
            amountPaid:   enrollment.amountPaid,
            balance:      enrollment.balance,
            payStatus:    enrollment.payStatus,
            enrolledDate: enrollment.enrolledDate,
        },
    };
};

// ─── 4.7  Remove Bus Enrollment ───────────────────────────────────────────────

const removeEnrollment = async (studentId, term) => {
    const resolvedTerm = term || currentTerm();

    const enrollment = await BusEnrollment.findOne({
        studentId: studentId.toUpperCase(),
        term:      resolvedTerm,
    });

    if (!enrollment) {
        throw new ErrorResponse(
            `No bus enrollment found for student '${studentId}' in ${resolvedTerm}.`,
            404
        );
    }

    await enrollment.deleteOne();
};

// ═══════════════════════════════════════════════════════════════════════════════
// C. SPECIAL TRIPS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ID Generation ────────────────────────────────────────────────────────────

const generateTripId = async () => {
    const latest = await SpecialTrip.findOne({}, { serialNumber: 1 }).sort({ serialNumber: -1 });
    const nextSerial   = latest ? latest.serialNumber + 1 : 1;
    const paddedSerial = String(nextSerial).padStart(3, '0');
    return { tripId: `TRIP-${paddedSerial}`, serialNumber: nextSerial };
};

// ─── Enrollment aggregation for a set of trips ────────────────────────────────

/**
 * Fetches enrollment stats for an array of tripIds.
 * Returns a map: tripId → { enrolled, paidCount, unpaidCount, totalExpected, totalCollected }
 *
 * @param {string[]} tripIds
 */
const fetchTripEnrollmentStats = async (tripIds) => {
    if (!tripIds.length) return {};

    const agg = await TripEnrollment.aggregate([
        { $match: { tripId: { $in: tripIds } } },
        {
            $group: {
                _id:            '$tripId',
                enrolled:       { $sum: 1 },
                paidCount:      { $sum: { $cond: [{ $eq: ['$payStatus', 'Paid'] },   1, 0] } },
                unpaidCount:    { $sum: { $cond: [{ $eq: ['$payStatus', 'Unpaid'] }, 1, 0] } },
                totalExpected:  { $sum: '$fee' },
                totalCollected: { $sum: '$amountPaid' },
            },
        },
    ]);

    return Object.fromEntries(agg.map((r) => [r._id, r]));
};

// ─── Shape Helper ─────────────────────────────────────────────────────────────

const toTripView = (doc, stats = {}) => ({
    id:             doc.tripId,
    name:           doc.name,
    date:           doc.date,
    destination:    doc.destination,
    fee:            doc.fee,
    capacity:       doc.capacity,
    enrolled:       stats.enrolled       || 0,
    status:         doc.status,
    description:    doc.description      || '',
    targetClasses:  doc.targetClasses    || [],
    paidCount:      stats.paidCount      || 0,
    unpaidCount:    stats.unpaidCount    || 0,
    totalExpected:  stats.totalExpected  || 0,
    totalCollected: stats.totalCollected || 0,
});

// ─── 4.8  Get All Special Trips ───────────────────────────────────────────────

const getAllTrips = async ({ status }) => {
    const filter = {};
    if (status) filter.status = status;

    const trips = await SpecialTrip.find(filter).sort({ date: -1 }).lean();

    const tripIds  = trips.map((t) => t.tripId);
    const statsMap = await fetchTripEnrollmentStats(tripIds);

    return {
        trips: trips.map((t) => toTripView(t, statsMap[t.tripId])),
    };
};

// ─── 4.9  Create Special Trip ─────────────────────────────────────────────────

const createTrip = async (body, createdBy) => {
    const { tripId, serialNumber } = await generateTripId();

    const trip = await SpecialTrip.create({
        tripId,
        serialNumber,
        name:          body.name,
        date:          body.date,
        destination:   body.destination,
        fee:           body.fee,
        capacity:      body.capacity,
        description:   body.description   || '',
        targetClasses: body.targetClasses || [],
        status:        body.status        || 'Open',
        createdBy,
    });

    return {
        trip: {
            id:          trip.tripId,
            name:        trip.name,
            date:        trip.date,
            destination: trip.destination,
            fee:         trip.fee,
            capacity:    trip.capacity,
            enrolled:    0,
            status:      trip.status,
        },
    };
};

// ─── 4.10  Update Special Trip ────────────────────────────────────────────────

const updateTrip = async (id, body, updatedBy) => {
    const trip = await SpecialTrip.findOne({ tripId: id.toUpperCase() });
    if (!trip) {
        throw new ErrorResponse(`Trip '${id}' not found`, 404);
    }

    body.lastUpdatedBy = updatedBy;

    const updated = await SpecialTrip.findOneAndUpdate(
        { tripId: id.toUpperCase() },
        { $set: body },
        { new: true, runValidators: true }
    ).lean();

    const statsMap = await fetchTripEnrollmentStats([updated.tripId]);

    return { trip: toTripView(updated, statsMap[updated.tripId]) };
};

// ─── 4.11  Delete Special Trip ────────────────────────────────────────────────

const deleteTrip = async (id) => {
    const trip = await SpecialTrip.findOne({ tripId: id.toUpperCase() });
    if (!trip) {
        throw new ErrorResponse(`Trip '${id}' not found`, 404);
    }

    // Cascade: remove all enrollment records for this trip
    await TripEnrollment.deleteMany({ tripId: trip.tripId });

    await trip.deleteOne();
};

// ═══════════════════════════════════════════════════════════════════════════════
// D. STATS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 4.12  Get Transport Summary Stats ────────────────────────────────────────

const getTransportStats = async () => {
    const term = currentTerm();

    // Bus enrollment stats for current term
    const [busStats] = await BusEnrollment.aggregate([
        { $match: { term } },
        {
            $group: {
                _id:            null,
                total:          { $sum: 1 },
                paid:           { $sum: { $cond: [{ $eq: ['$payStatus', 'Paid'] },    1, 0] } },
                partial:        { $sum: { $cond: [{ $eq: ['$payStatus', 'Partial'] }, 1, 0] } },
                unpaid:         { $sum: { $cond: [{ $eq: ['$payStatus', 'Unpaid'] },  1, 0] } },
                totalExpected:  { $sum: '$termFee' },
                totalCollected: { $sum: '$amountPaid' },
            },
        },
    ]);

    const busEnrollments = busStats
        ? {
              total:          busStats.total,
              paid:           busStats.paid,
              partial:        busStats.partial,
              unpaid:         busStats.unpaid,
              totalExpected:  busStats.totalExpected,
              totalCollected: busStats.totalCollected,
              collectionRate: busStats.totalExpected > 0
                  ? Math.round((busStats.totalCollected / busStats.totalExpected) * 100)
                  : 0,
          }
        : {
              total: 0, paid: 0, partial: 0, unpaid: 0,
              totalExpected: 0, totalCollected: 0, collectionRate: 0,
          };

    // Trip stats — all trips regardless of term
    const [tripStats] = await SpecialTrip.aggregate([
        {
            $group: {
                _id:       null,
                total:     { $sum: 1 },
                open:      { $sum: { $cond: [{ $eq: ['$status', 'Open'] },      1, 0] } },
                closed:    { $sum: { $cond: [{ $eq: ['$status', 'Closed'] },    1, 0] } },
                cancelled: { $sum: { $cond: [{ $eq: ['$status', 'Cancelled'] }, 1, 0] } },
            },
        },
    ]);

    const trips = tripStats
        ? {
              total:     tripStats.total,
              open:      tripStats.open,
              closed:    tripStats.closed,
              cancelled: tripStats.cancelled,
          }
        : { total: 0, open: 0, closed: 0, cancelled: 0 };

    return { busEnrollments, trips };
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    // Routes
    getAllRoutes,
    createRoute,
    updateRoute,
    deleteRoute,
    // Enrollments
    getAllEnrollments,
    enrollStudent,
    removeEnrollment,
    // Special Trips
    getAllTrips,
    createTrip,
    updateTrip,
    deleteTrip,
    // Stats
    getTransportStats,
};
