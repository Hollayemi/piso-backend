/**
 * services/parentChildrenService.js
 *
 * Parent-facing "children" endpoints.
 *
 *   GET /parent/children          → getChildren
 *   GET /parent/children/:id      → getChildProfile
 *
 * Maps Parent → Students via Student.parentId === Parent.parentId
 */

const Student        = require('../model/student.model');
const ReportCard     = require('../model/reportCard.model');
const { FeeRecord, Payment, Invoice } = require('../model/finance.model');
const BusEnrollment  = require('../model/busEnrollment.model');
const ErrorResponse  = require('../utils/errorResponse');

// ─── Term / Session helpers ───────────────────────────────────────────────────

const currentTerm = () => {
  const month = new Date().getMonth();
  const year  = new Date().getFullYear();
  if (month >= 8 && month <= 11) return `1st Term ${year}/${year + 1}`;
  if (month >= 0 && month <= 2)  return `2nd Term ${year - 1}/${year}`;
  return `3rd Term ${year - 1}/${year}`;
};

const currentSession = () => {
  const now  = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 8 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
};

// ─── Utility helpers ──────────────────────────────────────────────────────────

const deriveLevel = (className = '') => {
  const u = className.trim().toUpperCase();
  if (u.startsWith('JSS') || u.startsWith('NURSERY') || u.startsWith('PRIMARY') || u.startsWith('KG')) {
    return 'Junior';
  }
  return 'Senior';
};

const guardChildAccess = (studentId, linkedStudentIds) => {
  if (!linkedStudentIds.includes(studentId.toUpperCase())) {
    throw new ErrorResponse(
      'Access denied — this child is not linked to your account.',
      403,
      [{ code: 'CHILD_NOT_LINKED' }]
    );
  }
};

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

const buildAlerts = (attendance, feeRecord) => {
  const alerts = [];
  if (attendance.total >= 5 && attendance.pct < 75) {
    alerts.push({ type: 'attendance', text: `Attendance is below 75% (currently ${attendance.pct}%)` });
  }
  if (feeRecord) {
    if (feeRecord.status === 'Unpaid' && feeRecord.totalFee > 0) {
      alerts.push({ type: 'finance', text: `No payment recorded — outstanding: ₦${(feeRecord.balance || 0).toLocaleString()}` });
    } else if (feeRecord.status === 'Low') {
      alerts.push({ type: 'finance', text: `Less than 25% of fees paid — balance: ₦${(feeRecord.balance || 0).toLocaleString()}` });
    }
  }
  return alerts;
};

// ─── Shape helpers ────────────────────────────────────────────────────────────

const toFeeSummary = (feeRecord) => {
  if (!feeRecord) return { paid: 0, total: 0, balance: 0, status: 'Unpaid' };
  return {
    paid:    feeRecord.totalPaid,
    total:   feeRecord.totalFee,
    balance: feeRecord.balance,
    status:  feeRecord.status,
  };
};

/**
 * Shape for last result from ReportCard model.
 * Returns data compatible with parentSlice → getChildProfile → results[]
 */
const toLastResultSummary = (card) => {
  if (!card) return null;
  return {
    term:      card.term,
    session:   card.session,
    avg:       card.classInfo?.studentAvg ?? 0,
    position:  card.classInfo?.positionInClass ?? '-',
    classSize: card.classInfo?.studentsInClass ?? 0,
    subjects:  (card.subjects || []).map((s) => ({
      name:        s.name,
      score:       s.cumulativeAvg,
      totalScore:  s.cumulativeAvg,
      cumulativeAvg: s.cumulativeAvg,
      grade:       s.grade,
    })),
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /parent/children
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns summary list for all students where Student.parentId === parentId.
 * Matches the shape expected by AllChildrenPage / ChildCard in the frontend.
 *
 * Shape returned per child (matches parentSlice):
 *   id, firstName, surname, class, level, schoolingOption, status,
 *   dateOfBirth, bloodGroup, genotype, photo,
 *   attendance: { present, absent, late, total, pct },
 *   fees: { paid, total, balance, status },
 *   lastResult: { avg, position, classSize, term, session },
 *   alerts: [{ type, text }]
 */
const getChildren = async (parentId) => {
  const resolvedTerm = currentTerm();

  // ── All students belonging to this parent ──────────────────────────────────
  const students = await Student.find({ parentId })
    .sort({ firstName: 1 })
    .lean({ virtuals: true });

  if (!students.length) return { children: [] };

  const studentIds = students.map((s) => s.studentId);

  // ── Batch fee records ──────────────────────────────────────────────────────
  const feeRecords = await FeeRecord.find({
    studentId: { $in: studentIds },
    term:      resolvedTerm,
  }).lean();
  const feeMap = Object.fromEntries(feeRecords.map((f) => [f.studentId, f]));

  // ── Most recent published report card per student ──────────────────────────
  const latestCards = await ReportCard.aggregate([
    { $match: { studentId: { $in: studentIds }, isPublished: true } },
    { $sort:  { createdAt: -1 } },
    { $group: { _id: '$studentId', doc: { $first: '$$ROOT' } } },
  ]);
  const cardMap = Object.fromEntries(latestCards.map((r) => [r._id, r.doc]));

  // ── Build response ─────────────────────────────────────────────────────────
  const children = students.map((student) => {
    const fee        = feeMap[student.studentId]    || null;
    const card       = cardMap[student.studentId]   || null;
    const attendance = computeAttendance(student.attendanceRecords || [], resolvedTerm);
    const alerts     = buildAlerts(attendance, fee);

    const lastResult = card
      ? {
          term:      card.term,
          session:   card.session,
          avg:       card.classInfo?.studentAvg       ?? 0,
          position:  card.classInfo?.positionInClass  ?? '-',
          classSize: card.classInfo?.studentsInClass  ?? 0,
        }
      : null;

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
      fees: {
        ...toFeeSummary(fee),
        // extra field expected by ChildCard
        status: fee?.status || 'Unpaid',
      },
      lastResult,
      alerts,
    };
  });

  return { children };
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /parent/children/:id
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Full profile for a single child.
 * Shape matches ChildProfilePage tabs: overview, results, attendance, finance, profile.
 *
 * results[] shape (matches getChildProfile in parentSlice + ChildProfilePage):
 *   term, session, avg, position, classSize, principalRemark, subjects[]
 *     subjects: { name, score, grade }
 */
const getChildProfile = async (studentId, linkedStudentIds, query = {}) => {
  guardChildAccess(studentId, linkedStudentIds);

  const upperStudentId  = studentId.toUpperCase();
  const resolvedTerm    = query.term    || currentTerm();
  const resolvedSession = query.session || currentSession();
  const detailed        = query.detailed === 'true';

  // ── Student with populated Parent ─────────────────────────────────────────
  const student = await Student.findOne({ studentId: upperStudentId })
    .populate('parent', '-password -__v')
    .lean({ virtuals: true });

  if (!student) {
    throw new ErrorResponse(`Student '${studentId}' not found.`, 404, [{ code: 'CHILD_NOT_FOUND' }]);
  }

  const parent = student.parent || {};

  // ── Attendance ─────────────────────────────────────────────────────────────
  const allRecords    = student.attendanceRecords || [];
  const attendance    = computeAttendance(allRecords, resolvedTerm, resolvedSession);

  const attendanceRecords = detailed
    ? allRecords
        .filter((r) => {
          if (resolvedTerm    && r.term    !== resolvedTerm)    return false;
          if (resolvedSession && r.session !== resolvedSession) return false;
          return true;
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .map((r) => ({ date: r.date, status: r.status, note: r.reason || '' }))
    : undefined;

  // ── Fee record + payments ──────────────────────────────────────────────────
  const feeRecord = await FeeRecord.findOne({ studentId: upperStudentId, term: resolvedTerm }).lean();
  const payments  = feeRecord
    ? await Payment.find({ feeRecordId: feeRecord._id }).sort({ date: -1 }).lean()
    : [];

  // Due date from invoice
  let dueDate = null;
  try {
    const inv = await Invoice.findOne({ studentId: upperStudentId, term: resolvedTerm }, { dueDate: 1 }).lean();
    if (inv) dueDate = inv.dueDate;
  } catch { /* non-critical */ }

  // ── Published report cards (all terms) ────────────────────────────────────
  // Using ReportCard model (not legacy Result model)
  const reportCards = await ReportCard.find({ studentId: upperStudentId, isPublished: true })
    .sort({ createdAt: -1 })
    .lean();

  /**
   * Map each ReportCard to the shape expected by ChildProfilePage results tab.
   * Also shape matches what AllChildrenPage / overview uses for lastResult.subjects
   */
  const results = reportCards.map((card) => ({
    term:            card.term,
    session:         card.session,
    avg:             card.classInfo?.studentAvg      ?? 0,
    classAvg:        card.classInfo?.classSectionAvg ?? 0,
    position:        card.classInfo?.positionInClass ?? '-',
    classSize:       card.classInfo?.studentsInClass ?? 0,
    isPublished:     card.isPublished,
    principalRemark: card.principalComment || '',
    teacherRemark:   card.classTeacherComment || '',
    subjects: (card.subjects || []).map((s) => ({
      name:         s.name,
      code:         '',
      score:        s.cumulativeAvg,
      totalScore:   s.cumulativeAvg,
      cumulativeAvg: s.cumulativeAvg,
      grade:        s.grade,
      remark:       s.remark,
    })),
  }));

  // ── Transport ──────────────────────────────────────────────────────────────
  const busEnrollment = await BusEnrollment.findOne({ studentId: upperStudentId, term: resolvedTerm }).lean();

  // ── Documents checklist ────────────────────────────────────────────────────
  const docs = student.documents || {};
  const documents = {
    birthCertificate:        !!(docs.birthCertificate?.filename),
    formerSchoolReport:      !!(docs.formerSchoolReport?.filename),
    medicalReport:           !!(docs.medicalReport?.filename),
    proofOfPayment:          false,
    immunizationCertificate: false,
  };

  // ── Build response ─────────────────────────────────────────────────────────
  const child = {
    // Identity
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

    // Guardian info from populated Parent
    father: {
      name:          parent.father?.name          || '',
      occupation:    parent.father?.occupation    || '',
      phone:         parent.father?.homePhone     || '',
      whatsApp:      parent.father?.whatsApp      || '',
      email:         parent.father?.email         || '',
      homeAddress:   parent.father?.homeAddress   || '',
      officeAddress: parent.father?.officeAddress || '',
    },
    mother: {
      name:          parent.mother?.name          || '',
      occupation:    parent.mother?.occupation    || '',
      phone:         parent.mother?.homePhone     || '',
      whatsApp:      parent.mother?.whatsApp      || '',
      email:         parent.mother?.email         || '',
      homeAddress:   parent.mother?.homeAddress   || '',
      officeAddress: parent.mother?.officeAddress || '',
    },

    // Schools attended
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

    // Documents
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
        reference:  p.reference  || '',
        receivedBy: p.receivedBy || '',
        term:       p.term,
      })),
    },

    // Academic results (published report cards)
    results,

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
  currentTerm,
  currentSession,
  deriveLevel,
  guardChildAccess,
  computeAttendance,
};
