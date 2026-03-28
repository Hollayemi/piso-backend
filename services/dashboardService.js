/**
 * dashboardService.js
 *
 * Single aggregation service for the admin dashboard summary (6.1).
 *
 *   GET /dashboard/summary → getDashboardSummary
 *
 * Pulls data from:
 *   Student, Staff, FeeRecord, Payment, Admission, BusEnrollment, InventoryItem, Settings
 *
 * No data is cached here — aggregations run on every request.
 * For production, consider a Redis cache with a 5-min TTL.
 */

const Student      = require('../model/student.model');
const Staff        = require('../model/staff.model');
const { FeeRecord, Payment } = require('../model/finance.model');
const Admission    = require('../model/admission.model');
const BusEnrollment = require('../model/busEnrollment.model');
const { InventoryItem } = require('../model/inventory.model');
const Settings     = require('../model/settings.model');

// ─── Term helpers ─────────────────────────────────────────────────────────────

/** Derives current term string from calendar month (Nigerian school year) */
const deriveTerm = () => {
    const month = new Date().getMonth();
    const year  = new Date().getFullYear();
    if (month >= 8  && month <= 11) return `1st Term ${year}/${year + 1}`;
    if (month >= 0  && month <= 2)  return `2nd Term ${year - 1}/${year}`;
    return `3rd Term ${year - 1}/${year}`;
};

/** Derives current session string (e.g. "2025/2026") */
const deriveSession = () => {
    const now  = new Date();
    const year = now.getFullYear();
    return now.getMonth() >= 8 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
};

/**
 * Formats a term object from Settings into a human-readable date range.
 * e.g. "Sep 8 – Dec 13, 2025"
 */
const formatTermDates = (termObj) => {
    if (!termObj?.start || !termObj?.end) return '';
    const fmt = (d) =>
        new Date(d).toLocaleDateString('en-GB', {
            day:   'numeric',
            month: 'short',
            year:  'numeric',
        });
    return `${fmt(termObj.start)} – ${fmt(termObj.end)}`;
};

// ═══════════════════════════════════════════════════════════════════════════════
// 6.1  GET /dashboard/summary
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Aggregates all dashboard metrics in a single call.
 *
 * @param {object} query - { session?, term? }
 */
const getDashboardSummary = async ({ session, term } = {}) => {
    // ── Resolve session / term ─────────────────────────────────────────────
    const resolvedSession = session || deriveSession();
    const resolvedTerm    = term    || deriveTerm();

    // Pull current term dates from Settings singleton (best-effort)
    let termDates = '';
    try {
        const settings   = await Settings.getSingleton();
        const termId     = settings.academic?.currentTerm;
        const termRecord = settings.academic?.terms?.find((t) => t.id === termId);
        termDates        = formatTermDates(termRecord);
    } catch { /* non-critical */ }

    // ── Run aggregations in parallel ────────────────────────────────────────
    const [
        studentAgg,
        staffAgg,
        financeAgg,
        admissionAgg,
        busAgg,
        inventoryAgg,
        recentPayments,
        recentAdmissions,
    ] = await Promise.all([

        // People — students
        Student.aggregate([
            { $match: { status: 'Active' } },
            {
                $group: {
                    _id:         null,
                    total:       { $sum: 1 },
                    boarders:    { $sum: { $cond: [{ $eq: ['$schoolingOption', 'Boarding'] }, 1, 0] } },
                    dayStudents: { $sum: { $cond: [{ $eq: ['$schoolingOption', 'Day']      }, 1, 0] } },
                },
            },
        ]),

        // People — staff
        Staff.aggregate([
            {
                $group: {
                    _id:       null,
                    total:     { $sum: 1 },
                    active:    { $sum: { $cond: [{ $eq: ['$status', 'Active']  }, 1, 0] } },
                    onLeave:   { $sum: { $cond: [{ $eq: ['$status', 'On Leave']}, 1, 0] } },
                },
            },
        ]),

        // Finance — fee records for current term
        FeeRecord.aggregate([
            { $match: { term: resolvedTerm } },
            {
                $group: {
                    _id:           null,
                    totalExpected: { $sum: '$totalFee'  },
                    totalCollected:{ $sum: '$totalPaid' },
                    total:         { $sum: 1 },
                    fullyPaid:     { $sum: { $cond: [{ $eq: ['$status', 'Paid']    }, 1, 0] } },
                    partial:       { $sum: { $cond: [{ $eq: ['$status', 'Partial'] }, 1, 0] } },
                    unpaid:        { $sum: { $cond: [{ $eq: ['$status', 'Unpaid']  }, 1, 0] } },
                    atRisk:        { $sum: { $cond: [{ $in:  ['$status', ['Low', 'Unpaid']] }, 1, 0] } },
                },
            },
        ]),

        // Admissions
        Admission.aggregate([
            {
                $group: {
                    _id:                  null,
                    total:                { $sum: 1 },
                    pending:              { $sum: { $cond: [{ $eq: ['$status', 'Pending']                }, 1, 0] } },
                    screening:            { $sum: { $cond: [{ $eq: ['$status', 'Approved for Screening'] }, 1, 0] } },
                    approved:             { $sum: { $cond: [{ $eq: ['$offer.acceptanceStatus', 'Accepted'] }, 1, 0] } },
                    rejected:             { $sum: { $cond: [{ $eq: ['$status', 'Rejected']               }, 1, 0] } },
                },
            },
        ]),

        // Transport — bus enrollments for current term
        BusEnrollment.aggregate([
            { $match: { term: resolvedTerm } },
            {
                $group: {
                    _id:         null,
                    enrolled:    { $sum: 1 },
                    paid:        { $sum: { $cond: [{ $eq: ['$payStatus', 'Paid'] }, 1, 0] } },
                    outstanding: { $sum: { $cond: [{ $ne: ['$payStatus', 'Paid'] }, 1, 0] } },
                },
            },
        ]),

        // Inventory
        InventoryItem.aggregate([
            {
                $group: {
                    _id:       null,
                    total:     { $sum: 1 },
                    poor:      { $sum: { $cond: [{ $eq: ['$condition', 'Poor']      }, 1, 0] } },
                    condemned: { $sum: { $cond: [{ $eq: ['$condition', 'Condemned'] }, 1, 0] } },
                },
            },
        ]),

        // Recent payments (last 5)
        Payment.find({ term: resolvedTerm })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean(),

        // Recent admissions (last 5)
        Admission.find({})
            .sort({ dateApplied: -1 })
            .limit(5)
            .lean(),
    ]);

    // ── Shape results ──────────────────────────────────────────────────────

    const students = studentAgg[0] || { total: 0, boarders: 0, dayStudents: 0 };
    const staffData = staffAgg[0]  || { total: 0, active: 0, onLeave: 0 };
    const finance   = financeAgg[0] || {
        totalExpected: 0, totalCollected: 0, total: 0,
        fullyPaid: 0, partial: 0, unpaid: 0, atRisk: 0,
    };
    const admissions = admissionAgg[0] || {
        total: 0, pending: 0, screening: 0, approved: 0, rejected: 0,
    };
    const transport  = busAgg[0]        || { enrolled: 0, paid: 0, outstanding: 0 };
    const inventory  = inventoryAgg[0]  || { total: 0, poor: 0, condemned: 0 };

    const collectionRate = finance.totalExpected > 0
        ? Math.round((finance.totalCollected / finance.totalExpected) * 100)
        : 0;

    // ── Alerts ────────────────────────────────────────────────────────────
    const alerts = [];

    if (finance.atRisk > 0) {
        alerts.push({
            id:   'alert_finance_at_risk',
            type: 'warning',
            text: `${finance.atRisk} student${finance.atRisk > 1 ? 's' : ''} have paid less than 25% of term fees`,
            link: '/portals/admin/finance/fees?filter=at-risk',
        });
    }

    if (admissions.screening > 0) {
        alerts.push({
            id:   'alert_admissions_screening',
            type: 'info',
            text: `${admissions.screening} admission application${admissions.screening > 1 ? 's' : ''} awaiting screening`,
            link: '/portals/admin/admissions/screening',
        });
    }

    const needsAttentionCount = (inventory.poor || 0) + (inventory.condemned || 0);
    if (needsAttentionCount > 0) {
        alerts.push({
            id:   'alert_inventory_attention',
            type: 'warning',
            text: `${needsAttentionCount} inventory item${needsAttentionCount > 1 ? 's' : ''} need attention (poor/condemned)`,
            link: '/portals/admin/inventory',
        });
    }

    return {
        meta: {
            session:     resolvedSession,
            term:        resolvedTerm,
            termDates,
            generatedAt: new Date().toISOString(),
        },
        people: {
            totalStudents: students.total,
            totalStaff:    staffData.total,
            boarders:      students.boarders,
            dayStudents:   students.dayStudents,
            activeStaff:   staffData.active,
            staffOnLeave:  staffData.onLeave,
        },
        finance: {
            totalExpected:    finance.totalExpected,
            totalCollected:   finance.totalCollected,
            totalOutstanding: finance.totalExpected - finance.totalCollected,
            collectionRate,
            fullyPaid:        finance.fullyPaid,
            partial:          finance.partial,
            unpaid:           finance.unpaid,
            totalStudents:    finance.total,
            atRiskCount:      finance.atRisk,
        },
        admissions: {
            total:     admissions.total,
            pending:   admissions.pending,
            screening: admissions.screening,
            approved:  admissions.approved,
            rejected:  admissions.rejected,
        },
        transport: {
            enrolled:    transport.enrolled,
            paid:        transport.paid,
            outstanding: transport.outstanding,
        },
        inventory: {
            totalItems: inventory.total,
            poor:       inventory.poor,
            condemned:  inventory.condemned,
        },
        alerts,
        recentPayments: recentPayments.map((p) => ({
            studentName: p.studentName,
            studentId:   p.studentId,
            class:       p.class,
            amount:      p.amount,
            method:      p.method,
            date:        p.date,
        })),
        recentAdmissions: recentAdmissions.map((a) => ({
            name:   `${a.surname} ${a.firstName}`,
            id:     a.applicationId,
            class:  a.classPreferences?.classInterestedIn || '',
            status: a.status,
            date:   a.dateApplied,
        })),
    };
};

module.exports = { getDashboardSummary };
