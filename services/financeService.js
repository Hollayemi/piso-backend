/**
 * financeService.js
 *
 * All database interactions and business logic for the Finance module (2.1 – 2.9).
 *
 *   2.1  GET  /finance/summary               → getFinanceSummary
 *   2.2  GET  /finance/fees                  → getAllFeeRecords
 *   2.3  GET  /finance/fees/:studentId       → getStudentFeeRecord
 *   2.4  POST /finance/payments              → recordPayment
 *   2.5  GET  /finance/payments              → getAllPayments
 *   2.6  GET  /finance/invoices              → getAllInvoices
 *   2.7  GET  /finance/invoices/:invoiceId   → getInvoice
 *   2.8  POST /finance/invoices/generate     → generateInvoices
 *   2.9  POST /finance/invoices/:invoiceId/send → sendInvoiceToParent
 *
 * Controllers delegate here exclusively. No Mongoose calls live in controllers.
 *
 * Fee status derivation (single source of truth):
 *   paidPercent === 100              → 'Paid'
 *   paidPercent >= 25 && < 100       → 'Partial'
 *   paidPercent > 0  && < 25         → 'Low'
 *   paidPercent === 0                → 'Unpaid'
 */

const { FeeRecord, Payment, Invoice } = require('../model/finance.model');
const ErrorResponse = require('../utils/errorResponse');
const { deriveFeeCategory, termSlotName } = require('./settingsService');
// const { deriveFeeCategory } = require('./settingsService');

// ─── Term helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the current term string e.g. "1st Term 2025/2026".
 * Nigerian school year: Sept – July.
 */
const currentTerm = () => {
    const now   = new Date();
    const month = now.getMonth(); // 0-based
    const year  = now.getFullYear();

    if (month >= 8 && month <= 11) return `1st Term ${year}/${year + 1}`;
    if (month >= 0 && month <= 2)  return `2nd Term ${year - 1}/${year}`;
    return `3rd Term ${year - 1}/${year}`;
};

// ─── Status derivation ────────────────────────────────────────────────────────

/**
 * Derives the fee status string from paidPercent.
 *
 * @param {number} paidPercent  0–100
 * @returns {'Paid'|'Partial'|'Low'|'Unpaid'}
 */
const deriveStatus = (paidPercent) => {
    if (paidPercent >= 100) return 'Paid';
    if (paidPercent >= 25)  return 'Partial';
    if (paidPercent > 0)    return 'Low';
    return 'Unpaid';
};

/**
 * Recomputes balance, paidPercent, and status from totalFee + totalPaid.
 * Returns the three derived fields ready for $set.
 *
 * @param {number} totalFee
 * @param {number} totalPaid
 */
const recomputeFeeFields = (totalFee, totalPaid) => {
    const safeFee    = Math.max(totalFee, 0);
    const safePaid   = Math.max(totalPaid, 0);
    const balance    = Math.max(safeFee - safePaid, 0);
    const paidPercent = safeFee > 0 ? Math.min(Math.round((safePaid / safeFee) * 100), 100) : 0;
    const status      = deriveStatus(paidPercent);
    return { balance, paidPercent, status };
};

// ─── Payment ID generation ────────────────────────────────────────────────────

/**
 * Returns the next payment ID for a given student.
 * Format:  PAY-{studentId}-{serial}  e.g. PAY-STU-2024-0001-3
 *
 * @param {string} studentId
 */
const generatePaymentId = async (studentId) => {
    const latest = await Payment.findOne(
        { studentId: studentId.toUpperCase() },
        { serialNumber: 1 }
    ).sort({ serialNumber: -1 });

    const nextSerial = latest ? latest.serialNumber + 1 : 1;
    return {
        paymentId:    `PAY-${studentId.toUpperCase()}-${nextSerial}`,
        serialNumber: nextSerial,
    };
};

// ─── Invoice ID generation ────────────────────────────────────────────────────

/**
 * Returns the next global invoice ID.
 * Format:  INV-YYYY-NNNN  e.g. INV-2025-1001
 */
const generateInvoiceId = async () => {
    const year   = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    const latest = await Invoice.findOne(
        { invoiceId: { $regex: `^${prefix}` } },
        { serialNumber: 1 }
    ).sort({ serialNumber: -1 });

    const nextSerial   = latest ? latest.serialNumber + 1 : 1001;
    const paddedSerial = String(nextSerial);

    return {
        invoiceId:    `${prefix}${paddedSerial}`,
        serialNumber: nextSerial,
    };
};
 
/**
 * Builds the invoice line items for a student based on their class and
 * schooling option. Fee structure is configurable — in production this would
 * come from a Settings collection. Here we use representative defaults.
 *
 * @param {string} schooling   'Day' | 'Boarding'
 * @returns {{ lineItems: Array, totalFee: number }}
 */
const buildFeeStructure = async (schoolingOption, className, termString) => {
    const Settings = require('../model/settings.model');
    const settings = await Settings.getSingleton();
    const feeStructure = settings || {};
 
    const categoryKey = deriveFeeCategory(className, schoolingOption);
    const termKey     = termSlotName(termString || currentTerm());
    const category    = feeStructure[categoryKey];
 
    if (category && category[termKey] && category[termKey].items && category[termKey].items.length) {
        const lineItems = category[termKey].items.map((i) => ({
            description: i.description,
            amount:      i.amount,
        }));
        const totalFee = lineItems.reduce((sum, i) => sum + i.amount, 0);
        return { lineItems, totalFee };
    }
 
    // Fallback to hardcoded defaults if DB has no data
    const isBoarding = (schoolingOption || '').toLowerCase() === 'boarding';
    const lineItems = [
        { description: 'School Fees',        amount: 181200 },
        { description: 'Development Levy',   amount: 24160  },
        { description: 'ICT / Computer',     amount: 6040   },
        { description: 'Books & Stationery', amount: 30200  },
        ...(isBoarding ? [{ description: 'Boarding (Feeding + Hostel)', amount: 60400 }] : []),
    ];
    const totalFee = lineItems.reduce((sum, i) => sum + i.amount, 0);
    return { lineItems, totalFee };
};

// ─── Due date helper ──────────────────────────────────────────────────────────

/**
 * Returns a sensible invoice due date ~60 days after issuedDate.
 *
 * @param {Date} [issuedDate]
 * @returns {Date}
 */
const computeDueDate = (issuedDate = new Date()) => {
    const d = new Date(issuedDate);
    d.setDate(d.getDate() + 60);
    return d;
};

// ─── Lazy Student model loader ─────────────────────────────────────────────────

const getStudent = () => require('../model/student');

// ═══════════════════════════════════════════════════════════════════════════════
// 2.1  GET /finance/summary
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns top-level collection metrics for the finance dashboard.
 *
 * @param {object} query - { term? }
 */
const getFinanceSummary = async ({ term } = {}) => {
    const resolvedTerm = term || currentTerm();

    // ── Aggregate FeeRecord totals ─────────────────────────────────────────
    const [agg] = await FeeRecord.aggregate([
        { $match: { term: resolvedTerm } },
        {
            $group: {
                _id:              null,
                totalExpected:    { $sum: '$totalFee'  },
                totalCollected:   { $sum: '$totalPaid' },
                total:            { $sum: 1 },
                fullyPaid:        { $sum: { $cond: [{ $eq: ['$status', 'Paid']    }, 1, 0] } },
                partial:          { $sum: { $cond: [{ $eq: ['$status', 'Partial'] }, 1, 0] } },
                low:              { $sum: { $cond: [{ $eq: ['$status', 'Low']     }, 1, 0] } },
                unpaid:           { $sum: { $cond: [{ $eq: ['$status', 'Unpaid']  }, 1, 0] } },
            },
        },
    ]);

    const totals = agg || {
        totalExpected: 0, totalCollected: 0,
        total: 0, fullyPaid: 0, partial: 0, low: 0, unpaid: 0,
    };

    const totalOutstanding = totals.totalExpected - totals.totalCollected;
    const collectionRate   = totals.totalExpected > 0
        ? Math.round((totals.totalCollected / totals.totalExpected) * 100)
        : 0;

    // Students at risk = paid < 25 % of their term fee (status === 'Low' or 'Unpaid')
    const atRiskCount = totals.low + totals.unpaid;

    // ── Payment method breakdown ───────────────────────────────────────────
    const methodAgg = await Payment.aggregate([
        { $match: { term: resolvedTerm } },
        {
            $group: {
                _id:    '$method',
                count:  { $sum: 1 },
                amount: { $sum: '$amount' },
            },
        },
    ]);

    const paymentMethodBreakdown = {
        bankTransfer: { count: 0, amount: 0 },
        pos:          { count: 0, amount: 0 },
        cash:         { count: 0, amount: 0 },
        online:       { count: 0, amount: 0 },
    };

    const methodKeyMap = {
        'Bank Transfer': 'bankTransfer',
        'POS':           'pos',
        'Cash':          'cash',
        'Online':        'online',
    };

    for (const m of methodAgg) {
        const key = methodKeyMap[m._id];
        if (key) paymentMethodBreakdown[key] = { count: m.count, amount: m.amount };
    }

    // ── Class-level summary ────────────────────────────────────────────────
    const classAgg = await FeeRecord.aggregate([
        { $match: { term: resolvedTerm } },
        {
            $group: {
                _id:         '$class',
                expected:    { $sum: '$totalFee'  },
                collected:   { $sum: '$totalPaid' },
                students:    { $sum: 1 },
                unpaidCount: { $sum: { $cond: [{ $ne: ['$status', 'Paid'] }, 1, 0] } },
            },
        },
        { $sort: { _id: 1 } },
    ]);

    const classSummary = classAgg.map((c) => ({
        class:          c._id,
        expected:       c.expected,
        collected:      c.collected,
        students:       c.students,
        unpaidCount:    c.unpaidCount,
        collectionRate: c.expected > 0
            ? Math.round((c.collected / c.expected) * 100)
            : 0,
    }));

    // ── Recent payments (last 10) ──────────────────────────────────────────
    const recentPayments = await Payment.find({ term: resolvedTerm })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

    return {
        term:             resolvedTerm,
        totalExpected:    totals.totalExpected,
        totalCollected:   totals.totalCollected,
        totalOutstanding,
        collectionRate,
        studentCounts: {
            total:     totals.total,
            fullyPaid: totals.fullyPaid,
            partial:   totals.partial,
            unpaid:    totals.unpaid,
        },
        atRiskCount,
        paymentMethodBreakdown,
        classSummary,
        recentPayments: recentPayments.map((p) => ({
            id:          p.paymentId,
            studentId:   p.studentId,
            studentName: p.studentName,
            class:       p.class,
            amount:      p.amount,
            method:      p.method,
            date:        p.date,
            receivedBy:  p.receivedBy,
        })),
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2.2  GET /finance/fees
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns paginated fee records with optional filters.
 *
 * @param {object} query - { page, limit, search, class, status,
 *                           schoolingOption, paidPercentLessThan, term }
 */
const getAllFeeRecords = async ({
    page,
    limit,
    search,
    class: cls,
    status,
    schoolingOption,
    paidPercentLessThan,
    term,
} = {}) => {
    const resolvedTerm = term || currentTerm();
    const pageNum      = Math.max(parseInt(page,  10) || 1,  1);
    const limitNum     = Math.min(parseInt(limit, 10) || 20, 100);
    const skip         = (pageNum - 1) * limitNum;

    const filter = { term: resolvedTerm };

    if (search) {
        filter.$or = [
            { studentName: { $regex: search, $options: 'i' } },
            { studentId:   { $regex: search, $options: 'i' } },
        ];
    }
    if (cls)            filter.class    = { $regex: cls,            $options: 'i' };
    if (status)         filter.status   = status;
    if (schoolingOption) filter.schooling = schoolingOption;
    if (paidPercentLessThan !== undefined) {
        filter.paidPercent = { $lt: parseInt(paidPercentLessThan, 10) };
    }

    const [records, total] = await Promise.all([
        FeeRecord.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
        FeeRecord.countDocuments(filter),
    ]);

    // Attach payment history for each record
    const recordIds    = records.map((r) => r._id);
    const allPayments  = await Payment.find({ feeRecordId: { $in: recordIds } })
        .sort({ date: 1 })
        .lean();

    const paymentsByRecord = {};
    for (const p of allPayments) {
        const key = String(p.feeRecordId);
        if (!paymentsByRecord[key]) paymentsByRecord[key] = [];
        paymentsByRecord[key].push({
            id:         p.paymentId,
            amount:     p.amount,
            method:     p.method,
            date:       p.date,
            reference:  p.reference,
            receivedBy: p.receivedBy,
            term:       p.term,
        });
    }

    // Summary aggregation for the filtered set (ignoring pagination)
    const [summaryAgg] = await FeeRecord.aggregate([
        { $match: filter },
        {
            $group: {
                _id:           null,
                totalExpected: { $sum: '$totalFee'  },
                totalCollected:{ $sum: '$totalPaid' },
                total:         { $sum: 1 },
                fullyPaid:     { $sum: { $cond: [{ $eq: ['$status', 'Paid']    }, 1, 0] } },
                partial:       { $sum: { $cond: [{ $in: ['$status', ['Partial', 'Low']] }, 1, 0] } },
                unpaid:        { $sum: { $cond: [{ $eq: ['$status', 'Unpaid']  }, 1, 0] } },
            },
        },
    ]);

    const summary = summaryAgg
        ? {
              totalExpected:    summaryAgg.totalExpected,
              totalCollected:   summaryAgg.totalCollected,
              totalOutstanding: summaryAgg.totalExpected - summaryAgg.totalCollected,
              collectionRate:   summaryAgg.totalExpected > 0
                  ? Math.round((summaryAgg.totalCollected / summaryAgg.totalExpected) * 100)
                  : 0,
              total:     summaryAgg.total,
              fullyPaid: summaryAgg.fullyPaid,
              partial:   summaryAgg.partial,
              unpaid:    summaryAgg.unpaid,
          }
        : {
              totalExpected: 0, totalCollected: 0,
              totalOutstanding: 0, collectionRate: 0,
              total: 0, fullyPaid: 0, partial: 0, unpaid: 0,
          };

    const students = records.map((r) => ({
        id:              r.studentId,
        surname:         (r.studentName || '').split(' ')[0] || '',
        firstName:       (r.studentName || '').split(' ').slice(1).join(' ') || '',
        class:           r.class,
        schooling:       r.schooling,
        totalFee:        r.totalFee,
        totalPaid:       r.totalPaid,
        balance:         r.balance,
        paidPercent:     r.paidPercent,
        status:          r.status,
        lastPaymentDate: r.lastPaymentDate,
        term:            r.term,
        payments:        paymentsByRecord[String(r._id)] || [],
    }));

    return {
        students,
        summary,
        pagination: {
            total:      total,
            page:       pageNum,
            limit:      limitNum,
            totalPages: Math.ceil(total / limitNum),
        },
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2.3  GET /finance/fees/:studentId
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns the fee record + payment history for one student.
 *
 * @param {string} studentId
 * @param {string} [term]
 */
const getStudentFeeRecord = async (studentId, term) => {
    const resolvedTerm = term || currentTerm();
    const upperStudentId = studentId.toUpperCase();

    // Verify student exists
    const Student = getStudent();
    const student = await Student.findOne(
        { studentId: upperStudentId },
        { studentId: 1, surname: 1, firstName: 1, class: 1, schoolingOption: 1 }
    ).lean();

    if (!student) {
        throw new ErrorResponse(`Student '${studentId}' not found`, 404);
    }

    // Find or build an empty fee record
    let feeRecord = await FeeRecord.findOne({
        studentId: upperStudentId,
        term:      resolvedTerm,
    }).lean();

    const payments = feeRecord
        ? await Payment.find({ feeRecordId: feeRecord._id }).sort({ date: 1 }).lean()
        : [];

    return {
        student: {
            id:        student.studentId,
            surname:   student.surname,
            firstName: student.firstName,
            class:     student.class,
            schooling: student.schoolingOption,
        },
        feeRecord: feeRecord
            ? {
                  term:            feeRecord.term,
                  totalFee:        feeRecord.totalFee,
                  totalPaid:       feeRecord.totalPaid,
                  balance:         feeRecord.balance,
                  paidPercent:     feeRecord.paidPercent,
                  status:          feeRecord.status,
                  payments: payments.map((p) => ({
                      id:         p.paymentId,
                      amount:     p.amount,
                      method:     p.method,
                      date:       p.date,
                      reference:  p.reference,
                      receivedBy: p.receivedBy,
                      term:       p.term,
                  })),
              }
            : {
                  term:        resolvedTerm,
                  totalFee:    0,
                  totalPaid:   0,
                  balance:     0,
                  paidPercent: 0,
                  status:      'Unpaid',
                  payments:    [],
              },
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2.4  POST /finance/payments
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Records a payment and atomically updates the student's FeeRecord.
 * Also syncs the balance on the corresponding Invoice if one exists.
 *
 * @param {object} body      - Validated request body
 * @param {string} recordedBy - Staff ID of the authenticated user
 */
const recordPayment = async (body, recordedBy) => {
    const {
        studentId,
        amount,
        method,
        reference,
        date,
        term,
        receivedBy,
    } = body;

    const resolvedTerm    = term || currentTerm();
    const upperStudentId  = studentId.toUpperCase();

    // ── Verify student ─────────────────────────────────────────────────────
    const Student = getStudent();
    const student = await Student.findOne(
        { studentId: upperStudentId },
        { studentId: 1, surname: 1, firstName: 1, class: 1, schoolingOption: 1 }
    ).lean();

    if (!student) {
        throw new ErrorResponse(`Student '${studentId}' not found`, 404, [
            { code: 'STUDENT_NOT_FOUND' },
        ]);
    }

    const studentName = `${student.surname} ${student.firstName}`;

    // ── Find or create FeeRecord ───────────────────────────────────────────
    let feeRecord = await FeeRecord.findOne({
        studentId: upperStudentId,
        term:      resolvedTerm,
    });

    if (!feeRecord) {
        // Create a new fee record using the school's fee structure
        const { lineItems, totalFee } = buildFeeStructure(student.schoolingOption);

        feeRecord = await FeeRecord.create({
            studentId:   upperStudentId,
            studentName,
            class:       student.class,
            schooling:   student.schoolingOption,
            term:        resolvedTerm,
            totalFee,
            totalPaid:   0,
            balance:     totalFee,
            paidPercent: 0,
            status:      'Unpaid',
            createdBy:   recordedBy,
        });
    }

    // ── Guard: amount must not exceed outstanding balance ──────────────────
    if (amount > feeRecord.balance) {
        throw new ErrorResponse(
            `Payment amount (${amount}) exceeds outstanding balance (${feeRecord.balance}).`,
            400,
            [{ code: 'AMOUNT_EXCEEDS_BALANCE' }]
        );
    }

    // ── Generate Payment ID ────────────────────────────────────────────────
    const { paymentId, serialNumber } = await generatePaymentId(upperStudentId);

    // ── Create Payment document ────────────────────────────────────────────
    const payment = await Payment.create({
        paymentId,
        serialNumber,
        studentId:   upperStudentId,
        feeRecordId: feeRecord._id,
        studentName,
        class:       student.class,
        schooling:   student.schoolingOption,
        amount,
        method,
        reference:   reference || '',
        date:        new Date(date),
        term:        resolvedTerm,
        receivedBy:  receivedBy || '',
        recordedBy,
    });

    // ── Update FeeRecord ───────────────────────────────────────────────────
    const newTotalPaid = feeRecord.totalPaid + amount;
    const derived      = recomputeFeeFields(feeRecord.totalFee, newTotalPaid);

    await FeeRecord.findByIdAndUpdate(
        feeRecord._id,
        {
            $set: {
                totalPaid:       newTotalPaid,
                balance:         derived.balance,
                paidPercent:     derived.paidPercent,
                status:          derived.status,
                lastPaymentDate: new Date(date),
                lastUpdatedBy:   recordedBy,
            },
        },
        { new: true }
    );

    // ── Sync Invoice if one exists ─────────────────────────────────────────
    await Invoice.findOneAndUpdate(
        { studentId: upperStudentId, term: resolvedTerm },
        {
            $set: {
                amountPaid:    newTotalPaid,
                balance:       derived.balance,
                status:        derived.status === 'Low' ? 'Partial' : derived.status,
                lastUpdatedBy: recordedBy,
            },
        }
    );

    return {
        payment: {
            id:          payment.paymentId,
            studentId:   payment.studentId,
            studentName: payment.studentName,
            amount:      payment.amount,
            method:      payment.method,
            reference:   payment.reference,
            date:        payment.date,
            term:        payment.term,
            receivedBy:  payment.receivedBy,
        },
        updatedFeeRecord: {
            totalFee:    feeRecord.totalFee,
            totalPaid:   newTotalPaid,
            balance:     derived.balance,
            paidPercent: derived.paidPercent,
            status:      derived.status,
        },
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2.5  GET /finance/payments
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns a paginated log of all payment transactions.
 *
 * @param {object} query - { page, limit, search, method, dateFrom, dateTo, term }
 */
const getAllPayments = async ({
    page,
    limit,
    search,
    method,
    dateFrom,
    dateTo,
    term,
} = {}) => {
    const resolvedTerm = term || currentTerm();
    const pageNum      = Math.max(parseInt(page,  10) || 1,  1);
    const limitNum     = Math.min(parseInt(limit, 10) || 20, 100);
    const skip         = (pageNum - 1) * limitNum;

    const filter = { term: resolvedTerm };

    if (search) {
        filter.$or = [
            { studentName: { $regex: search, $options: 'i' } },
            { studentId:   { $regex: search, $options: 'i' } },
            { reference:   { $regex: search, $options: 'i' } },
        ];
    }
    if (method)   filter.method = method;
    if (dateFrom || dateTo) {
        filter.date = {};
        if (dateFrom) filter.date.$gte = new Date(dateFrom);
        if (dateTo)   filter.date.$lte = new Date(dateTo);
    }

    const [payments, total] = await Promise.all([
        Payment.find(filter).sort({ date: -1 }).skip(skip).limit(limitNum).lean(),
        Payment.countDocuments(filter),
    ]);

    // Total amount for the full filtered set (not just this page)
    const [totalAgg] = await Payment.aggregate([
        { $match: filter },
        { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);

    return {
        payments: payments.map((p) => ({
            id:          p.paymentId,
            studentId:   p.studentId,
            studentName: p.studentName,
            class:       p.class,
            schooling:   p.schooling,
            amount:      p.amount,
            method:      p.method,
            reference:   p.reference,
            date:        p.date,
            receivedBy:  p.receivedBy,
            term:        p.term,
        })),
        totals: {
            count:       totalAgg?.count       || 0,
            totalAmount: totalAgg?.totalAmount || 0,
        },
        pagination: {
            total:      total,
            page:       pageNum,
            limit:      limitNum,
            totalPages: Math.ceil(total / limitNum),
        },
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2.6  GET /finance/invoices
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns paginated invoices with filters.
 *
 * @param {object} query - { page, limit, search, status, term }
 */
const getAllInvoices = async ({ page, limit, search, status, term } = {}) => {
    const resolvedTerm = term || currentTerm();
    const pageNum      = Math.max(parseInt(page,  10) || 1,  1);
    const limitNum     = Math.min(parseInt(limit, 10) || 15, 100);
    const skip         = (pageNum - 1) * limitNum;

    const filter = { term: resolvedTerm };

    if (search) {
        filter.$or = [
            { studentName: { $regex: search, $options: 'i' } },
            { studentId:   { $regex: search, $options: 'i' } },
            { invoiceId:   { $regex: search, $options: 'i' } },
            { class:       { $regex: search, $options: 'i' } },
        ];
    }
    if (status) filter.status = status;

    const [invoices, total] = await Promise.all([
        Invoice.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
        Invoice.countDocuments(filter),
    ]);

    // Stats aggregation for the full filtered set
    const [statsAgg] = await Invoice.aggregate([
        { $match: filter },
        {
            $group: {
                _id:        null,
                total:      { $sum: 1 },
                paid:       { $sum: { $cond: [{ $eq: ['$status', 'Paid']    }, 1, 0] } },
                partial:    { $sum: { $cond: [{ $eq: ['$status', 'Partial'] }, 1, 0] } },
                unpaid:     { $sum: { $cond: [{ $eq: ['$status', 'Unpaid']  }, 1, 0] } },
                totalValue: { $sum: '$totalFee' },
            },
        },
    ]);

    const stats = statsAgg
        ? {
              total:      statsAgg.total,
              paid:       statsAgg.paid,
              partial:    statsAgg.partial,
              unpaid:     statsAgg.unpaid,
              totalValue: statsAgg.totalValue,
          }
        : { total: 0, paid: 0, partial: 0, unpaid: 0, totalValue: 0 };

    return {
        invoices: invoices.map((inv) => ({
            invoiceId:    inv.invoiceId,
            studentId:    inv.studentId,
            studentName:  inv.studentName,
            class:        inv.class,
            schooling:    inv.schooling,
            term:         inv.term,
            totalFee:     inv.totalFee,
            amountPaid:   inv.amountPaid,
            balance:      inv.balance,
            status:       inv.status,
            issuedDate:   inv.issuedDate,
            dueDate:      inv.dueDate,
            sentToParent: inv.sentToParent,
        })),
        stats,
        pagination: {
            total:      total,
            page:       pageNum,
            limit:      limitNum,
            totalPages: Math.ceil(total / limitNum),
        },
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2.7  GET /finance/invoices/:invoiceId
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns full invoice detail including line items and payment history.
 *
 * @param {string} invoiceId
 */
const getInvoice = async (invoiceId) => {
    const invoice = await Invoice.findOne({
        invoiceId: invoiceId.toUpperCase(),
    }).lean();

    if (!invoice) {
        throw new ErrorResponse(`Invoice '${invoiceId}' not found`, 404);
    }

    // Fetch payments attached to the linked FeeRecord
    const payments = await Payment.find({
        feeRecordId: invoice.feeRecordId,
    }).sort({ date: 1 }).lean();

    return {
        invoice: {
            invoiceId:    invoice.invoiceId,
            studentId:    invoice.studentId,
            studentName:  invoice.studentName,
            class:        invoice.class,
            schooling:    invoice.schooling,
            term:         invoice.term,
            issuedDate:   invoice.issuedDate,
            dueDate:      invoice.dueDate,
            lineItems:    invoice.lineItems,
            totalFee:     invoice.totalFee,
            amountPaid:   invoice.amountPaid,
            balance:      invoice.balance,
            status:       invoice.status,
            sentToParent: invoice.sentToParent,
            payments: payments.map((p) => ({
                id:        p.paymentId,
                amount:    p.amount,
                method:    p.method,
                date:      p.date,
                reference: p.reference,
            })),
        },
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2.8  POST /finance/invoices/generate
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Bulk-generates invoices for all active students for a given term.
 * If `overwrite` is false, students who already have an invoice are skipped.
 *
 * @param {object} body - { term, overwrite }
 * @param {string} generatedBy
 */
const generateInvoices = async ({ term, overwrite }, generatedBy) => {
    const resolvedTerm = term || currentTerm();

    // Fetch all active students
    const Student  = getStudent();
    const students = await Student.find(
        { status: 'Active' },
        { studentId: 1, surname: 1, firstName: 1, class: 1, schoolingOption: 1 }
    ).lean();

    let created = 0;
    let skipped = 0;

    for (const student of students) {
        const studentName = `${student.surname} ${student.firstName}`;

        // Check if invoice already exists
        const existing = await Invoice.findOne({
            studentId: student.studentId,
            term:      resolvedTerm,
        });

        if (existing && !overwrite) {
            skipped++;
            continue;
        }

        // Ensure FeeRecord exists
        let feeRecord = await FeeRecord.findOne({
            studentId: student.studentId,
            term:      resolvedTerm,
        });

        const { lineItems, totalFee } = buildFeeStructure(student.schoolingOption);

        if (!feeRecord) {
            feeRecord = await FeeRecord.create({
                studentId:   student.studentId,
                studentName,
                class:       student.class,
                schooling:   student.schoolingOption,
                term:        resolvedTerm,
                totalFee,
                totalPaid:   0,
                balance:     totalFee,
                paidPercent: 0,
                status:      'Unpaid',
                createdBy:   generatedBy,
            });
        }

        const issuedDate = new Date();
        const dueDate    = computeDueDate(issuedDate);
        const { invoiceId, serialNumber } = await generateInvoiceId();

        if (existing && overwrite) {
            // Update in place
            await Invoice.findByIdAndUpdate(existing._id, {
                $set: {
                    lineItems,
                    totalFee,
                    amountPaid:    feeRecord.totalPaid,
                    balance:       feeRecord.balance,
                    status:        feeRecord.status === 'Low' ? 'Partial' : feeRecord.status,
                    issuedDate,
                    dueDate,
                    lastUpdatedBy: generatedBy,
                },
            });
        } else {
            await Invoice.create({
                invoiceId,
                serialNumber,
                studentId:   student.studentId,
                feeRecordId: feeRecord._id,
                studentName,
                class:       student.class,
                schooling:   student.schoolingOption,
                term:        resolvedTerm,
                issuedDate,
                dueDate,
                lineItems,
                totalFee,
                amountPaid:  feeRecord.totalPaid,
                balance:     feeRecord.balance,
                status:      feeRecord.status === 'Low' ? 'Partial' : feeRecord.status,
                generatedBy,
            });
        }

        created++;
    }

    return { created, skipped, term: resolvedTerm };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2.9  POST /finance/invoices/:invoiceId/send
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Marks an invoice as sent to the parent (email simulation).
 * In production this would integrate with nodemailer.
 *
 * @param {string} invoiceId
 */
const sendInvoiceToParent = async (invoiceId) => {
    const invoice = await Invoice.findOne({
        invoiceId: invoiceId.toUpperCase(),
    });

    if (!invoice) {
        throw new ErrorResponse(`Invoice '${invoiceId}' not found`, 404);
    }

    // Resolve the parent's correspondence email from the Student record
    const Student = getStudent();
    const student = await Student.findOne(
        { studentId: invoice.studentId },
        { 'contact.correspondenceEmail': 1 }
    ).lean();

    if (!student?.contact?.correspondenceEmail) {
        throw new ErrorResponse(
            `No correspondence email on record for student '${invoice.studentId}'.`,
            400,
            [{ code: 'NO_EMAIL' }]
        );
    }

    const sentAt = new Date();

    // Mark as sent
    await Invoice.findByIdAndUpdate(invoice._id, {
        $set: {
            sentToParent: true,
            sentAt,
        },
    });

    // NOTE: Real email dispatch via nodemailer would happen here.
    // e.g. await emailService.sendInvoice(student.contact.correspondenceEmail, invoice);

    return {
        invoiceId: invoice.invoiceId,
        sentTo:    student.contact.correspondenceEmail,
        sentAt,
    };
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    getFinanceSummary,
    getAllFeeRecords,
    getStudentFeeRecord,
    recordPayment,
    getAllPayments,
    getAllInvoices,
    getInvoice,
    generateInvoices,
    sendInvoiceToParent,
};
