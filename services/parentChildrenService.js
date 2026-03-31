/**
 * services/parentChildrenService.js
 *
 * All database interactions and business logic for parent-facing
 * "children" endpoints per the PISO Parent Portal API guide.
 *
 * Endpoints served:
 *   4.  GET /parent/children          → getChildren
 *   5.  GET /parent/children/:id      → getChildProfile
 *
 * Access control:
 *   Every method that takes a studentId validates it against the
 *   parent's linkedStudentIds (populated by parentAuth middleware).
 *   A 403 is thrown if the requested child does not belong to the parent.
 *
 * Design notes:
 *   - Attendance is computed in-memory from the embedded attendanceRecords
 *     array on the Student document.
 *   - Results are only returned where isPublished === true.
 *   - Level ('Junior' | 'Senior') is derived from the class name because
 *     the Student model stores class as a free string ('JSS 1A', 'SS 2 Science').
 *   - Fee records are fetched from FeeRecord; transport from BusEnrollment.
 *   - The parent's father/mother details come from the populated Parent doc.
 */

const Student       = require('../model/student.model');
const Result        = require('../model/result.model');
const { FeeRecord, Payment } = require('../model/finance.model');
const BusEnrollment = require('../model/busEnrollment.model');
const ErrorResponse = require('../utils/errorResponse');

// ─── Term / Session helpers ───────────────────────────────────────────────────

/**
 * Returns the current full-term string matching the format used across
 * all Finance, Transport and Result models.
 * e.g. "1st Term 2025/2026"
 */
const currentTerm = () => {
    const month = new Date().getMonth();
    const year  = new Date().getFullYear();
    if (month >= 8 && month <= 11) return `1st Term ${year}/${year + 1}`;
    if (month >= 0 && month <= 2)  return `2nd Term ${year - 1}/${year}`;
    return `3rd Term ${year - 1}/${year}`;
};

/**
 * Returns the current academic session string.
 * e.g. "2025/2026"
 */
const currentSession = () => {
    const now  = new Date();
    const year = now.getFullYear();
    return now.getMonth() >= 8 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
};

// ─── Utility: Level derivation ────────────────────────────────────────────────

/**
 * Derives 'Junior' or 'Senior' from a class name string.
 * Nigerian school levels:
 *   Junior  → KG, Nursery, Primary, JSS
 *   Senior  → SS
 *
 * @param {string} className - e.g. "JSS 1A", "SS 2 Science"
 * @returns {'Junior'|'Senior'}
 */
const deriveLevel = (className = '') => {
    const upper = className.trim().toUpperCase();
    if (
        upper.startsWith('JSS') ||
        upper.startsWith('JSS') ||
        upper.startsWith('NURSERY') ||
        upper.startsWith('PRIMARY') ||
        upper.startsWith('KG') ||
        upper.startsWith('PRIM')
    ) {
        return 'Junior';
    }
    return 'Senior';
};

// ─── Guard: child access ──────────────────────────────────────────────────────

/**
 * Throws 403 if studentId is not in the parent's linked list.
 *
 * @param {string}   studentId
 * @param {string[]} linkedStudentIds - From req.parent.linkedStudentIds
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

// ─── Utility: Attendance computation ─────────────────────────────────────────

/**
 * Computes attendance summary from the embedded attendanceRecords array.
 * Optionally filters by term and/or session.
 *
 * @param {Array}   records - Student.attendanceRecords
 * @param {string}  [term]
 * @param {string}  [session]
 * @returns {{ present, absent, late, total, pct }}
 */
const computeAttendance = (records = [], term = null, session = null) => {
    let filtered = records;

    if (term)    filtered = filtered.filter((r) => r.term    === term);
    if (session) filtered = filtered.filter((r) => r.session === session);

    const total   = filtered.length;
    const present = filtered.filter((r) => r.status === 'Present').length;
    const absent  = filtered.filter((r) => r.status === 'Absent').length;
    const late    = filtered.filter((r) => r.status === 'Late').length;
    const pct     = total > 0 ? Math.round((present / total) * 100) : 0;

    return { present, absent, late, total, pct };
};

// ─── Utility: Alert builder ───────────────────────────────────────────────────

/**
 * Generates actionable alert objects for a child based on their current
 * attendance and fee status.
 *
 * @param {{ pct: number, total: number }} attendance
 * @param {object|null}                    feeRecord  - FeeRecord lean doc or null
 * @returns {{ type: string, text: string }[]}
 */
const buildAlerts = (attendance, feeRecord) => {
    const alerts = [];

    // Low attendance warning — only flag if we have sufficient data
    if (attendance.total >= 5 && attendance.pct < 75) {
        alerts.push({
            type: 'attendance',
            text: `Attendance is below 75% (currently ${attendance.pct}%)`,
        });
    }

    // Outstanding fee alerts
    if (feeRecord) {
        if (feeRecord.status === 'Unpaid' && feeRecord.totalFee > 0) {
            alerts.push({
                type: 'finance',
                text: `No payment recorded — outstanding: ₦${(feeRecord.balance || 0).toLocaleString()}`,
            });
        } else if (feeRecord.status === 'Low') {
            alerts.push({
                type: 'finance',
                text: `Less than 25% of fees paid — balance: ₦${(feeRecord.balance || 0).toLocaleString()}`,
            });
        }
    }

    return alerts;
};

// ─── Shape: fee summary ───────────────────────────────────────────────────────

const toFeeSummary = (feeRecord) => {
    if (!feeRecord) {
        return { paid: 0, total: 0, balance: 0, status: 'Unpaid' };
    }
    return {
        paid:    feeRecord.totalPaid,
        total:   feeRecord.totalFee,
        balance: feeRecord.balance,
        status:  feeRecord.status,
    };
};

// ─── Shape: result summary ────────────────────────────────────────────────────

const toLastResultSummary = (result) => {
    if (!result) return null;
    return {
        avg:       result.avg,
        position:  result.position,
        classSize: result.classSize,
        term:      result.term,
        session:   result.session,
    };
};

// ─── Shape: recent subject result ────────────────────────────────────────────

const toRecentResult = (result) => {
    if (!result || !result.subjects || !result.subjects.length) return null;

    // Return the highest-scoring subject for the dashboard "recent result" widget
    const top = [...result.subjects].sort((a, b) => b.totalScore - a.totalScore)[0];
    return {
        subject: top.name,
        score:   top.totalScore,
        grade:   top.grade,
        term:    result.term,
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 4.  GET /parent/children
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns a summary list of all children linked to the authenticated parent.
 *
 * Each child entry includes:
 *   - Personal details (name, gender, class, DOB, blood group, genotype)
 *   - Attendance summary for the current term
 *   - Fee summary for the current term
 *   - Most recent published result summary
 *   - Actionable alerts (low attendance, unpaid fees)
 *
 * @param {string} parentId - Parent.parentId from req.parent
 */
const getChildren = async (parentId) => {
    const resolvedTerm = currentTerm();

    // ── Fetch all students linked to this parent ────────────────────────────
    // Include non-active statuses so parents can see graduated/transferred children
    const students = await Student.find({ parentId })
        .sort({ firstName: 1 })
        .lean({ virtuals: true });

    if (!students.length) {
        return { children: [] };
    }

    const studentIds = students.map((s) => s.studentId);

    // ── Batch: fee records (current term) ──────────────────────────────────
    const feeRecords = await FeeRecord.find({
        studentId: { $in: studentIds },
        term:      resolvedTerm,
    }).lean();

    const feeMap = Object.fromEntries(feeRecords.map((f) => [f.studentId, f]));

    // ── Batch: most recent published result per student ────────────────────
    const latestResults = await Result.aggregate([
        {
            $match: {
                studentId:   { $in: studentIds },
                isPublished: true,
            },
        },
        { $sort: { createdAt: -1 } },
        {
            $group: {
                _id: '$studentId',
                doc: { $first: '$$ROOT' },
            },
        },
    ]);

    const resultMap = Object.fromEntries(latestResults.map((r) => [r._id, r.doc]));

    // ── Build response ─────────────────────────────────────────────────────
    const children = students.map((student) => {
        const fee        = feeMap[student.studentId]    || null;
        const result     = resultMap[student.studentId] || null;
        const attendance = computeAttendance(
            student.attendanceRecords || [],
            resolvedTerm
        );
        const alerts = buildAlerts(attendance, fee);

        return {
            id:              student.studentId,
            firstName:       student.firstName,
            surname:         student.surname,
            middleName:      student.middleName || '',
            gender:          student.gender,
            class:           student.class,
            level:           deriveLevel(student.class),
            schoolingOption: student.schoolingOption,
            status:          student.status,
            dateOfBirth:     student.dateOfBirth,
            bloodGroup:      student.bloodGroup || '',
            genotype:        student.genotype   || '',
            photo:           student.photo      || null,
            attendance,
            fees:            toFeeSummary(fee),
            lastResult:      toLastResultSummary(result),
            recentResult:    toRecentResult(result),
            nextExam:        null,   // Populated once an ExamSchedule model exists
            alerts,
        };
    });

    return { children };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5.  GET /parent/children/:id
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns the full profile for a single child.
 *
 * Validates that the requested student belongs to the authenticated parent,
 * then aggregates:
 *   - Full personal details
 *   - Father / Mother info from the linked Parent document
 *   - Schools attended, health, documents checklist
 *   - Attendance summary (and optionally per-day records)
 *   - Fee record with full payment history
 *   - All published academic results
 *   - Current transport enrollment
 *
 * @param {string}   studentId        - Path param :id
 * @param {string[]} linkedStudentIds - From req.parent.linkedStudentIds
 * @param {object}   query            - { term?, session?, detailed? }
 */
const getChildProfile = async (studentId, linkedStudentIds, query = {}) => {
    guardChildAccess(studentId, linkedStudentIds);

    const upperStudentId  = studentId.toUpperCase();
    const resolvedTerm    = query.term    || currentTerm();
    const resolvedSession = query.session || currentSession();
    const detailed        = query.detailed === 'true' || query.detailed === true;

    // ── Student + Parent (populated) ───────────────────────────────────────
    const student = await Student.findOne({ studentId: upperStudentId })
        .populate('parent', '-password -__v')
        .lean({ virtuals: true });

    if (!student) {
        throw new ErrorResponse(
            `Student '${studentId}' not found.`,
            404,
            [{ code: 'CHILD_NOT_FOUND' }]
        );
    }

    const parent = student.parent || {};

    // ── Attendance ─────────────────────────────────────────────────────────
    const allRecords   = student.attendanceRecords || [];
    const attendance   = computeAttendance(allRecords, resolvedTerm, resolvedSession);

    // Detailed daily records (only returned when ?detailed=true)
    const attendanceRecords = detailed
        ? allRecords
              .filter((r) => {
                  if (resolvedTerm    && r.term    !== resolvedTerm)    return false;
                  if (resolvedSession && r.session !== resolvedSession) return false;
                  return true;
              })
              .sort((a, b) => new Date(b.date) - new Date(a.date))
              .map((r) => ({
                  date:   r.date,
                  status: r.status,
                  note:   r.reason || '',
              }))
        : undefined;

    // ── Fee record + payment history ───────────────────────────────────────
    const feeRecord = await FeeRecord.findOne({
        studentId: upperStudentId,
        term:      resolvedTerm,
    }).lean();

    const payments = feeRecord
        ? await Payment.find({ feeRecordId: feeRecord._id })
              .sort({ date: -1 })
              .lean()
        : [];

    // ── Invoice due date ───────────────────────────────────────────────────
    // Try to get due date from the corresponding Invoice if one exists
    let dueDate = null;
    try {
        const { Invoice } = require('../model/finance.model');
        const invoice = await Invoice.findOne({
            studentId: upperStudentId,
            term:      resolvedTerm,
        }, { dueDate: 1 }).lean();
        if (invoice) dueDate = invoice.dueDate;
    } catch { /* non-critical */ }

    // ── Published academic results ─────────────────────────────────────────
    const results = await Result.find({
        studentId:   upperStudentId,
        isPublished: true,
    })
        .sort({ createdAt: -1 })
        .lean();

    // ── Transport enrollment (current term) ────────────────────────────────
    const busEnrollment = await BusEnrollment.findOne({
        studentId: upperStudentId,
        term:      resolvedTerm,
    }).lean();

    // ── Documents checklist ────────────────────────────────────────────────
    const docs = student.documents || {};
    const documents = {
        birthCertificate:    !!(docs.birthCertificate?.filename),
        formerSchoolReport:  !!(docs.formerSchoolReport?.filename),
        medicalReport:       !!(docs.medicalReport?.filename),
        proofOfPayment:      false,          // Stored on Admission, not Student
        immunizationCertificate: false,
    };

    // ── Build response ─────────────────────────────────────────────────────
    const child = {
        // Personal
        id:              student.studentId,
        firstName:       student.firstName,
        surname:         student.surname,
        middleName:      student.middleName || '',
        gender:          student.gender,
        dateOfBirth:     student.dateOfBirth,
        bloodGroup:      student.bloodGroup  || '',
        genotype:        student.genotype    || '',
        nationality:     student.nationality,
        stateOfOrigin:   student.stateOfOrigin,
        localGovernment: student.localGovernment,
        religion:        student.religion    || '',
        photo:           student.photo       || null,

        // Academic
        class:           student.class,
        level:           deriveLevel(student.class),
        schoolingOption: student.schoolingOption,
        status:          student.status,
        statusReason:    student.statusReason || '',
        admissionDate:   student.admissionDate,
        classTeacher:    student.classTeacher || null,

        // Parent / Guardian details — pulled from populated Parent doc
        father: {
            name:          parent.father?.name          || '',
            occupation:    parent.father?.occupation     || '',
            phone:         parent.father?.homePhone      || '',
            whatsApp:      parent.father?.whatsApp       || '',
            email:         parent.father?.email          || '',
            homeAddress:   parent.father?.homeAddress    || '',
            officeAddress: parent.father?.officeAddress  || '',
        },
        mother: {
            name:          parent.mother?.name          || '',
            occupation:    parent.mother?.occupation     || '',
            phone:         parent.mother?.homePhone      || '',
            whatsApp:      parent.mother?.whatsApp       || '',
            email:         parent.mother?.email          || '',
            homeAddress:   parent.mother?.homeAddress    || '',
            officeAddress: parent.mother?.officeAddress  || '',
        },

        // Previous schools
        schools: (student.schools || []).map((s) => ({
            name:  s.name      || '',
            start: s.startDate || null,
            end:   s.endDate   || null,
        })),

        // Health
        health: {
            vaccinations:      student.health?.vaccinations      || {},
            otherVaccination:  student.health?.otherVaccination  || '',
            infectiousDisease: student.health?.infectiousDisease || '',
            foodAllergy:       student.health?.foodAllergy       || '',
        },

        // Documents checklist (boolean flags)
        documents,

        // Attendance
        attendance: {
            ...attendance,
            term: resolvedTerm,
            ...(detailed && { records: attendanceRecords }),
        },

        // Finance
        fees: {
            total:       feeRecord?.totalFee    ?? 0,
            paid:        feeRecord?.totalPaid   ?? 0,
            balance:     feeRecord?.balance     ?? 0,
            paidPercent: feeRecord?.paidPercent ?? 0,
            status:      feeRecord?.status      ?? 'Unpaid',
            term:        resolvedTerm,
            dueDate,
            payments: payments.map((p) => ({
                id:         p.paymentId,
                date:       p.date,
                amount:     p.amount,
                method:     p.method,
                ref:        p.reference  || '',
                receivedBy: p.receivedBy || '',
                term:       p.term,
            })),
        },

        // Academic results (published only)
        results: results.map((r) => ({
            term:            r.term,
            session:         r.session,
            avg:             r.avg,
            classAvg:        r.classAvg,
            position:        r.position,
            classSize:       r.classSize,
            isPublished:     r.isPublished,
            principalRemark: r.principalRemark || '',
            teacherRemark:   r.teacherRemark   || '',
            nextTermResumption: r.nextTermResumption || null,
            subjects: r.subjects.map((s) => ({
                name:      s.name,
                code:      s.code      || '',
                caScore:   s.caScore,
                examScore: s.examScore,
                score:     s.totalScore,
                grade:     s.grade,
                remark:    s.remark,
            })),
        })),

        // Transport
        transport: {
            enrolled:  !!busEnrollment,
            route:     busEnrollment?.routeName || null,
            stop:      busEnrollment?.stop      || null,
            payStatus: busEnrollment?.payStatus || null,
            termFee:   busEnrollment?.termFee   || null,
        },
    };

    return { child };
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    getChildren,
    getChildProfile,
    // Utility helpers exported so other services can reuse them
    currentTerm,
    currentSession,
    deriveLevel,
    guardChildAccess,
    computeAttendance,
};
