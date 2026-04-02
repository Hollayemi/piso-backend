/**
 * services/parentFinanceService.js
 *
 * Finance-related DB logic for the Parent Portal (API 8.1 – 8.4).
 *
 *   8.1  GET /parent/children/:id/fees       → getChildFeeRecord
 *   8.2  GET /parent/fees                    → getAllChildrenFees
 *   8.3  GET /parent/invoices                → listInvoices
 *   8.4  GET /parent/invoices/:invoiceId     → getInvoice
 *
 * Access control enforced upstream (parentAuth middleware):
 *   - req.parent.linkedStudentIds contains the IDs the parent may access.
 *   - Every method here validates the requested studentId is in that list.
 */

const { FeeRecord, Payment, Invoice } = require('../model/finance.model');
const Student       = require('../model/student.model');
const ErrorResponse = require('../utils/errorResponse');
const SettingsModel = require("../model/settings.model")

// ─── Term helper ──────────────────────────────────────────────────────────────

const currentTerm = async () => {
    const settings = await SettingsModel.getSingleton();
    const term = await settings.getCurrentTerm();
    return term.name
};

const currentSession = async () => {
    const settings = await SettingsModel.getSingleton();
    const session = await settings.getCurrentSession();
    return session.name
};

// ─── Guard helper ─────────────────────────────────────────────────────────────

/**
 * Throws 403 if the parent does not have access to the given studentId.
 *
 * @param {string}   studentId
 * @param {string[]} linkedStudentIds
 */
const guardChildAccess = (studentId, linkedStudentIds) => {
    if (!linkedStudentIds.includes(studentId.toUpperCase())) {
        throw new ErrorResponse(
            'Access denied — this child is not linked to your account.',
            403,
            [{ code: 'CHILD_NOT_LINKED' }]
        );
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 8.1  GET /parent/children/:id/fees
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns the fee record, line items, and payment history for a single child.
 *
 * @param {string}   studentId
 * @param {string[]} linkedStudentIds  - From req.parent
 * @param {object}   query             - { term?, session? }
 */
const getChildFeeRecord = async (studentId, linkedStudentIds, { term, session } = {}) => {
    const upperStudentId = studentId.toUpperCase();
    guardChildAccess(upperStudentId, linkedStudentIds);

    const resolvedTerm = term || currentTerm();

    // Load student snapshot
    const student = await Student.findOne(
        { studentId: upperStudentId, status: 'Active' },
        { studentId: 1, surname: 1, firstName: 1, class: 1, schoolingOption: 1 }
    ).lean();

    if (!student) {
        throw new ErrorResponse(`Student '${studentId}' not found or not active.`, 404);
    }

    // Load fee record for this term
    const feeRecord = await FeeRecord.findOne({
        studentId: upperStudentId,
        term:      resolvedTerm,
    }).lean();

    // Load corresponding invoice for line items + due date
    const invoice = await Invoice.findOne({
        studentId: upperStudentId,
        term:      resolvedTerm,
    }).lean();

    // Load payment history
    const payments = feeRecord
        ? await Payment.find({ feeRecordId: feeRecord._id })
            .sort({ date: 1 })
            .lean()
        : [];

    return {
        studentId:      student.studentId,
        studentName:    `${student.surname} ${student.firstName}`,
        class:          student.class,
        schoolingOption: student.schoolingOption,
        term:           resolvedTerm,
        totalFee:       feeRecord?.totalFee        ?? 0,
        totalPaid:      feeRecord?.totalPaid       ?? 0,
        balance:        feeRecord?.balance         ?? 0,
        paidPercent:    feeRecord?.paidPercent     ?? 0,
        status:         feeRecord?.status          ?? 'Unpaid',
        dueDate:        invoice?.dueDate           ?? null,
        lineItems:      invoice?.lineItems         ?? [],
        payments: payments.map((p) => ({
            id:         p.paymentId,
            date:       p.date,
            amount:     p.amount,
            method:     p.method,
            reference:  p.reference  || '',
            receivedBy: p.receivedBy || '',
        })),
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 8.2  GET /parent/fees
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns a consolidated fee summary across ALL linked children.
 *
 * @param {string[]} linkedStudentIds
 * @param {object}   query - { term? }
 */
const getAllChildrenFees = async (linkedStudentIds, { term } = {}) => {
    if (!linkedStudentIds.length) {
        return { children: [], totalExpected: 0, totalPaid: 0, totalOutstanding: 0 };
    }

    
    const resolvedTerm = term || await currentTerm();
    
    console.log({linkedStudentIds, resolvedTerm})
    // Pull all student snapshots in one query
    const students = await Student.find(
        { studentId: { $in: linkedStudentIds }, status: 'Active' },
        { studentId: 1, surname: 1, firstName: 1, class: 1, schoolingOption: 1 }
    ).lean();

    // Pull all fee records for these students + term in one query
    const feeRecords = await FeeRecord.find({
        studentId: { $in: linkedStudentIds },
        term:      resolvedTerm,
    }).lean();

    const feeMap = Object.fromEntries(feeRecords.map((r) => [r.studentId, r]));

    const children = students.map((s) => {
        const fr = feeMap[s.studentId];
        return {
            studentId:   s.studentId,
            studentName: `${s.surname} ${s.firstName}`,
            class:       s.class,
            schooling:   s.schoolingOption,
            term:        resolvedTerm,
            totalFee:    fr?.totalFee    ?? 0,
            totalPaid:   fr?.totalPaid   ?? 0,
            balance:     fr?.balance     ?? 0,
            paidPercent: fr?.paidPercent ?? 0,
            status:      fr?.status      ?? 'Unpaid',
        };
    });

    const totalExpected    = children.reduce((sum, c) => sum + c.totalFee,  0);
    const totalPaid        = children.reduce((sum, c) => sum + c.totalPaid, 0);
    const totalOutstanding = children.reduce((sum, c) => sum + c.balance,   0);

    return { children, totalExpected, totalPaid, totalOutstanding };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 8.3  GET /parent/invoices
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns paginated invoices across all linked children.
 *
 * @param {string[]} linkedStudentIds
 * @param {object}   query - { status?, term?, page?, limit? }
 */
const listInvoices = async (linkedStudentIds, { status, term, page, limit } = {}) => {
    if (!linkedStudentIds.length) {
        return {
            invoices:   [],
            pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
        };
    }

    const pageNum  = Math.max(parseInt(page,  10) || 1,  1);
    const limitNum = Math.min(parseInt(limit, 10) || 10, 50);
    const skip     = (pageNum - 1) * limitNum;

    const filter = { studentId: { $in: linkedStudentIds } };
    if (status) filter.status = status;
    if (term)   filter.term   = term;

    const [invoices, total] = await Promise.all([
        Invoice.find(filter)
            .sort({ issuedDate: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean(),
        Invoice.countDocuments(filter),
    ]);

    return {
        invoices: invoices.map((inv) => ({
            invoiceId:    inv.invoiceId,
            studentId:    inv.studentId,
            studentName:  inv.studentName,
            class:        inv.class,
            term:         inv.term,
            totalFee:     inv.totalFee,
            amountPaid:   inv.amountPaid,
            balance:      inv.balance,
            status:       inv.status,
            issuedDate:   inv.issuedDate,
            dueDate:      inv.dueDate,
            sentToParent: inv.sentToParent,
        })),
        pagination: {
            total,
            page:       pageNum,
            limit:      limitNum,
            totalPages: Math.ceil(total / limitNum),
        },
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 8.4  GET /parent/invoices/:invoiceId
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns full detail for a single invoice.
 * Guards that the invoice belongs to one of the parent's linked children.
 *
 * @param {string}   invoiceId
 * @param {string[]} linkedStudentIds
 */
const getInvoice = async (invoiceId, linkedStudentIds) => {
    const invoice = await Invoice.findOne({
        invoiceId: invoiceId.toUpperCase(),
    }).lean();

    if (!invoice) {
        throw new ErrorResponse(`Invoice '${invoiceId}' not found.`, 404);
    }

    // Ensure this invoice belongs to one of the parent's children
    guardChildAccess(invoice.studentId, linkedStudentIds);

    // Load payment history from the linked fee record
    const payments = invoice.feeRecordId
        ? await Payment.find({ feeRecordId: invoice.feeRecordId })
            .sort({ date: 1 })
            .lean()
        : [];

    return {
        invoice: {
            invoiceId:    invoice.invoiceId,
            studentName:  invoice.studentName,
            class:        invoice.class,
            schooling:    invoice.schooling,
            term:         invoice.term,
            totalFee:     invoice.totalFee,
            amountPaid:   invoice.amountPaid,
            balance:      invoice.balance,
            status:       invoice.status,
            issuedDate:   invoice.issuedDate,
            dueDate:      invoice.dueDate,
            sentToParent: invoice.sentToParent,
            lineItems:    invoice.lineItems || [],
            payments: payments.map((p) => ({
                id:        p.paymentId,
                amount:    p.amount,
                method:    p.method,
                date:      p.date,
                reference: p.reference || '',
            })),
        },
    };
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    getChildFeeRecord,
    getAllChildrenFees,
    listInvoices,
    getInvoice,
    // Exported so Paystack service can use the same term resolver
    currentTerm,
};
