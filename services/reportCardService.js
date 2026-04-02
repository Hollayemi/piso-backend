/**
 * services/reportCardService.js
 *
 * Core service for Report Card operations:
 *
 *   generateReportCards   — compile SubjectScores → ReportCard documents
 *   getClassReportCards   — list all cards for a class (admin view)
 *   getReportCard         — single full card (admin)
 *   updateTraits          — edit affective/psychomotor/comments
 *   publishReportCards    — flip isPublished=true for a class
 *   getReportCardPdf      — generate + stream PDF
 *   getMyReportCard       — parent-facing: single published card for a child
 *   getMyReportCards      — parent-facing: all published cards for a child
 */

const SubjectScore  = require('../model/subjectScore.model');
const ReportCard    = require('../model/reportCard.model');
const Student       = require('../model/student.model');
const Settings      = require('../model/settings.model');
const ErrorResponse = require('../utils/errorResponse');
const { generateReportCardPdf } = require('../utils/reportCardPdf');

const { AFFECTIVE_TRAITS, PSYCHOMOTOR_SKILLS } = require('../model/reportCard.model');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const currentSession = () => {
  const now  = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 8 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
};

const currentTerm = () => {
  const month = new Date().getMonth();
  if (month >= 8 && month <= 11) return '1st Term';
  if (month >= 0 && month <= 2)  return '2nd Term';
  return '3rd Term';
};

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const round2 = (n) => Math.round(n * 100) / 100;

const getGrade = (pct) => {
  if (pct === null || pct === undefined) return { grade: 'F9', remark: 'Fail' };
  if (pct >= 75) return { grade: 'A1', remark: 'Excellent'  };
  if (pct >= 70) return { grade: 'B2', remark: 'Very Good'  };
  if (pct >= 65) return { grade: 'B3', remark: 'Good'       };
  if (pct >= 60) return { grade: 'C4', remark: 'Credit'     };
  if (pct >= 55) return { grade: 'C5', remark: 'Credit'     };
  if (pct >= 50) return { grade: 'C6', remark: 'Credit'     };
  if (pct >= 45) return { grade: 'D7', remark: 'Pass'       };
  if (pct >= 40) return { grade: 'E8', remark: 'Pass'       };
  return { grade: 'F9', remark: 'Fail' };
};

const termNumber = (term) => {
  if (term.includes('1st')) return 1;
  if (term.includes('2nd')) return 2;
  return 3;
};

// ─── ID generation ────────────────────────────────────────────────────────────

const generateReportCardId = async () => {
  const year   = new Date().getFullYear();
  const prefix = `RC-${year}-`;

  const latest = await ReportCard.findOne(
    { reportCardId: { $regex: `^${prefix}` } },
    { serialNumber: 1 }
  ).sort({ serialNumber: -1 });

  const nextSerial   = latest ? latest.serialNumber + 1 : 1;
  const paddedSerial = String(nextSerial).padStart(4, '0');

  return { reportCardId: `${prefix}${paddedSerial}`, serialNumber: nextSerial };
};

// ─── 1. generateReportCards ───────────────────────────────────────────────────

/**
 * Compiles SubjectScore records into ReportCard documents for all students
 * in a class for a given term/session. Existing cards are overwritten (re-generated).
 *
 * @param {object} params - { class, term, session }
 * @param {string} generatedBy - Staff ID
 */
const generateReportCards = async ({ class: cls, term, session }, generatedBy) => {
  if (!cls) throw new ErrorResponse('class is required', 400);

  const resolvedTerm    = term    || currentTerm();
  const resolvedSession = session || currentSession();
  const numTerms        = termNumber(resolvedTerm); // 1, 2, or 3

  // ── Load all students in the class ──────────────────────────────────────────
  const students = await Student.find(
    { class: cls, status: 'Active' },
    { studentId: 1, surname: 1, firstName: 1, studentId: 1, parentId: 1, photo: 1 }
  ).lean();

  if (!students.length) {
    throw new ErrorResponse(`No active students found in class '${cls}'.`, 404);
  }

  const studentIds = students.map((s) => s.studentId);

  // ── Load all scores for this class/term/session ──────────────────────────────
  const allScores = await SubjectScore.find({
    class:   cls,
    term:    resolvedTerm,
    session: resolvedSession,
    studentId: { $in: studentIds },
  }).lean({ virtuals: true });

  // Group by subject: { subjectName: [ {studentId, test1, test2, exam, firstTermTotal, ...} ] }
  const bySubject = {};
  allScores.forEach((s) => {
    if (!bySubject[s.subjectName]) bySubject[s.subjectName] = [];
    bySubject[s.subjectName].push(s);
  });

  // For each subject, calculate class stats
  const subjectStats = {};
  Object.entries(bySubject).forEach(([subjectName, scoresList]) => {
    const enteredList = scoresList.filter(
      (s) => s.test1 !== null && s.test2 !== null && s.exam !== null
    );

    const currentTotals = enteredList.map((s) => (s.test1 || 0) + (s.test2 || 0) + (s.exam || 0));

    // Compute cumulative totals per student (current term + carry-overs)
    const cumulativeTotals = enteredList.map((s) => {
      let total = (s.test1 || 0) + (s.test2 || 0) + (s.exam || 0);
      if (numTerms >= 2 && s.firstTermTotal !== null)  total += s.firstTermTotal  || 0;
      if (numTerms >= 3 && s.secondTermTotal !== null) total += s.secondTermTotal || 0;
      return { studentId: s.studentId, total };
    });

    const cumulativeMap = Object.fromEntries(cumulativeTotals.map((e) => [e.studentId, e.total]));

    // Sort for positions
    const sorted = [...cumulativeTotals].sort((a, b) => b.total - a.total);

    // Class average (based on current term totals for class avg display)
    const classAvg = currentTotals.length
      ? round2(currentTotals.reduce((a, b) => a + b, 0) / currentTotals.length)
      : 0;

    // Highest and lowest (current term)
    const highest = currentTotals.length ? Math.max(...currentTotals) : 0;
    const lowest  = currentTotals.length ? Math.min(...currentTotals) : 0;

    // Position map
    const positionMap = {};
    sorted.forEach((e, idx) => {
      positionMap[e.studentId] = ordinal(idx + 1);
    });

    subjectStats[subjectName] = {
      classAvg,
      highest,
      lowest,
      positionMap,
      cumulativeMap,
    };
  });

  // ── Build report cards ───────────────────────────────────────────────────────
  const studentScoreMap = {};
  allScores.forEach((s) => {
    if (!studentScoreMap[s.studentId]) studentScoreMap[s.studentId] = {};
    studentScoreMap[s.studentId][s.subjectName] = s;
  });

  // Get subject names in a consistent order
  const subjectNames = Object.keys(bySubject).sort();

  // Per-student cumulative averages (over ALL subjects)
  const studentTotalMap = {};
  students.forEach((stu) => {
    let total = 0;
    let count = 0;
    subjectNames.forEach((subjectName) => {
      const sc  = studentScoreMap[stu.studentId]?.[subjectName];
      const stats = subjectStats[subjectName];
      if (sc && sc.test1 !== null && sc.test2 !== null && sc.exam !== null && stats) {
        total += stats.cumulativeMap[stu.studentId] || 0;
        count++;
      }
    });
    studentTotalMap[stu.studentId] = { total, count };
  });

  // Sort students by total for class positions
  const studentsSorted = students
    .filter((s) => studentTotalMap[s.studentId]?.count > 0)
    .sort((a, b) => studentTotalMap[b.studentId].total - studentTotalMap[a.studentId].total);

  const classPositionMap = {};
  studentsSorted.forEach((s, idx) => { classPositionMap[s.studentId] = ordinal(idx + 1); });

  // Class stats
  const allStudentTotals = studentsSorted.map((s) => studentTotalMap[s.studentId].total);
  const allStudentAvgs   = studentsSorted.map((s) => {
    const { total, count } = studentTotalMap[s.studentId];
    return count > 0 ? round2(total / count / numTerms) : 0;
  });

  const classSectionAvg     = allStudentAvgs.length ? round2(allStudentAvgs.reduce((a, b) => a + b, 0) / allStudentAvgs.length) : 0;
  const highestAvgInSection = allStudentAvgs.length ? round2(Math.max(...allStudentAvgs)) : 0;
  const lowestAvgInSection  = allStudentAvgs.length ? round2(Math.min(...allStudentAvgs)) : 0;

  // ── Upsert each student's report card ──────────────────────────────────────
  let created = 0;
  let updated = 0;

  for (const student of students) {
    const subjectResults = subjectNames.map((subjectName) => {
      const sc    = studentScoreMap[student.studentId]?.[subjectName];
      const stats = subjectStats[subjectName];

      const test1 = sc?.test1 ?? 0;
      const test2 = sc?.test2 ?? 0;
      const exam  = sc?.exam  ?? 0;
      const hasScores = sc && sc.test1 !== null && sc.test2 !== null && sc.exam !== null;

      const currentTermTotal = hasScores ? test1 + test2 + exam : 0;
      const firstTerm  = sc?.firstTermTotal  ?? null;
      const secondTerm = sc?.secondTermTotal ?? null;

      let total = currentTermTotal;
      if (numTerms >= 2 && firstTerm  !== null) total += firstTerm  || 0;
      if (numTerms >= 3 && secondTerm !== null) total += secondTerm || 0;

      const cumulativeAvg = numTerms > 0 ? round2(total / numTerms) : 0;
      const { grade, remark } = getGrade(cumulativeAvg);

      return {
        subjectId:        '',
        name:             subjectName,
        test1,
        test2,
        exam,
        firstTerm,
        secondTerm,
        currentTermTotal,
        total,
        cumulativeAvg,
        grade,
        remark,
        position: stats?.positionMap?.[student.studentId] ?? '-',
        classAvg: stats?.classAvg ?? 0,
        highest:  stats?.highest  ?? 0,
        lowest:   stats?.lowest   ?? 0,
      };
    });

    const { total: stuTotal, count: stuCount } = studentTotalMap[student.studentId] || { total: 0, count: 0 };
    const studentAvg = stuCount > 0 ? round2(stuTotal / stuCount / numTerms) : 0;

    const classInfo = {
      positionInClass:     classPositionMap[student.studentId] || '-',
      positionInSection:   classPositionMap[student.studentId] || '-',
      studentsInClass:     students.length,
      studentsInSection:   students.length,
      classSectionAvg,
      lowestAvgInSection,
      highestAvgInSection,
      totalScore:          stuTotal,
      studentAvg,
      overallPerformance:  studentAvg >= 40 ? 'Pass' : 'Fail',
      schoolDaysOpened:    '-',
      daysPresent:         '-',
      daysAbsent:          '-',
    };

    // Upsert
    const existing = await ReportCard.findOne({
      studentId: student.studentId,
      term:      resolvedTerm,
      session:   resolvedSession,
    });

    if (existing) {
      await ReportCard.findByIdAndUpdate(existing._id, {
        $set: {
          classInfo,
          subjects:      subjectResults,
          studentName:   `${student.surname} ${student.firstName}`,
          parentId:      student.parentId || '',
          photo:         student.photo || null,
          generatedAt:   new Date(),
          generatedBy,
          lastUpdatedBy: generatedBy,
        },
      });
      updated++;
    } else {
      const { reportCardId, serialNumber } = await generateReportCardId();
      await ReportCard.create({
        reportCardId,
        serialNumber,
        studentId:   student.studentId,
        parentId:    student.parentId || '',
        studentName: `${student.surname} ${student.firstName}`,
        class:       cls,
        term:        resolvedTerm,
        session:     resolvedSession,
        classInfo,
        subjects:    subjectResults,
        affective:   Object.fromEntries(AFFECTIVE_TRAITS.map((t) => [t, 0])),
        psychomotor: Object.fromEntries(PSYCHOMOTOR_SKILLS.map((s) => [s, 0])),
        generatedAt: new Date(),
        generatedBy,
        createdBy:   generatedBy,
      });
      created++;
    }
  }

  return {
    class:    cls,
    term:     resolvedTerm,
    session:  resolvedSession,
    created,
    updated,
    total:    created + updated,
  };
};

// ─── 2. getClassReportCards ───────────────────────────────────────────────────

/**
 * Returns the list of report cards for a class (for the admin sidebar student list).
 */
const getClassReportCards = async ({ class: cls, term, session }) => {
  if (!cls) throw new ErrorResponse('class is required', 400);

  const resolvedTerm    = term    || currentTerm();
  const resolvedSession = session || currentSession();

  const cards = await ReportCard.find({
    class:   cls,
    term:    resolvedTerm,
    session: resolvedSession,
  }).select('studentId studentName classInfo.studentAvg isPublished').sort({ studentName: 1 }).lean();

  // Supplement with students who don't have cards yet
  const students = await Student.find(
    { class: cls, status: 'Active' },
    { studentId: 1, surname: 1, firstName: 1 }
  ).sort({ surname: 1, firstName: 1 }).lean();

  const cardMap = Object.fromEntries(cards.map((c) => [c.studentId, c]));

  const studentList = students.map((s) => {
    const card = cardMap[s.studentId];
    return {
      id:          s.studentId,
      name:        `${s.surname} ${s.firstName}`,
      avg:         card?.classInfo?.studentAvg ?? null,
      isPublished: card?.isPublished ?? false,
      hasCard:     !!card,
    };
  });

  const publishedCount   = cards.filter((c) => c.isPublished).length;
  const unpublishedCount = cards.filter((c) => !c.isPublished).length;

  return {
    class:    cls,
    term:     resolvedTerm,
    session:  resolvedSession,
    students: studentList,
    stats: {
      total:      students.length,
      generated:  cards.length,
      published:  publishedCount,
      unpublished: unpublishedCount,
    },
  };
};

// ─── 3. getReportCard ─────────────────────────────────────────────────────────

/**
 * Returns the full report card for one student.
 */
const getReportCard = async ({ studentId, term, session }) => {
  if (!studentId) throw new ErrorResponse('studentId is required', 400);

  const resolvedTerm    = term    || currentTerm();
  const resolvedSession = session || currentSession();

  const card = await ReportCard.findOne({
    studentId: studentId.toUpperCase(),
    term:      resolvedTerm,
    session:   resolvedSession,
  }).lean();

  if (!card) {
    throw new ErrorResponse(
      `No report card found for student '${studentId}' in ${resolvedTerm} ${resolvedSession}. Generate it first.`,
      404
    );
  }

  return { reportCard: card };
};

// ─── 4. updateTraits ─────────────────────────────────────────────────────────

/**
 * Updates affective traits, psychomotor skills, and teacher/principal comments.
 * Also allows updating termEndDate, nextTermBegins, and attendance data.
 */
const updateTraits = async ({ studentId, term, session }, body, updatedBy) => {
  const resolvedTerm    = term    || currentTerm();
  const resolvedSession = session || currentSession();

  const card = await ReportCard.findOne({
    studentId: studentId.toUpperCase(),
    term:      resolvedTerm,
    session:   resolvedSession,
  });

  if (!card) {
    throw new ErrorResponse(`Report card not found. Generate it first.`, 404);
  }

  const updateFields = { lastUpdatedBy: updatedBy };

  if (body.affective)                              updateFields.affective                              = body.affective;
  if (body.psychomotor)                            updateFields.psychomotor                            = body.psychomotor;
  if (body.classTeacherComment !== undefined)      updateFields.classTeacherComment                    = body.classTeacherComment;
  if (body.principalComment    !== undefined)      updateFields.principalComment                       = body.principalComment;
  if (body.termEndDate         !== undefined)      updateFields.termEndDate                            = body.termEndDate;
  if (body.nextTermBegins      !== undefined)      updateFields.nextTermBegins                         = body.nextTermBegins;
  if (body.schoolDaysOpened    !== undefined)      updateFields['classInfo.schoolDaysOpened']          = body.schoolDaysOpened;
  if (body.daysPresent         !== undefined)      updateFields['classInfo.daysPresent']               = body.daysPresent;
  if (body.daysAbsent          !== undefined)      updateFields['classInfo.daysAbsent']                = body.daysAbsent;

  const updated = await ReportCard.findByIdAndUpdate(
    card._id,
    { $set: updateFields },
    { new: true }
  ).lean();

  return { reportCard: updated };
};

// ─── 5. publishReportCards ────────────────────────────────────────────────────

/**
 * Publishes all report cards for a class (makes them visible to parents).
 * Can also unpublish with { unpublish: true }.
 */
const publishReportCards = async ({ class: cls, term, session, unpublish = false }, publishedBy) => {
  if (!cls) throw new ErrorResponse('class is required', 400);

  const resolvedTerm    = term    || currentTerm();
  const resolvedSession = session || currentSession();

  const update = unpublish
    ? { $set: { isPublished: false, publishedBy: '', publishedAt: null, lastUpdatedBy: publishedBy } }
    : { $set: { isPublished: true,  publishedBy,  publishedAt: new Date(), lastUpdatedBy: publishedBy } };

  const result = await ReportCard.updateMany(
    { class: cls, term: resolvedTerm, session: resolvedSession },
    update
  );

  return {
    class:     cls,
    term:      resolvedTerm,
    session:   resolvedSession,
    published: result.modifiedCount,
    action:    unpublish ? 'unpublished' : 'published',
  };
};

// ─── 6. getReportCardPdf ──────────────────────────────────────────────────────

/**
 * Generates a PDF for a report card and returns the Buffer.
 * Admin can download any card; parent can only download published cards.
 *
 * @param {string} studentId
 * @param {object} query - { term, session }
 * @param {boolean} adminAccess - if false, requires isPublished=true
 */
const getReportCardPdf = async (studentId, { term, session }, adminAccess = false) => {
  const resolvedTerm    = term    || currentTerm();
  const resolvedSession = session || currentSession();

  const card = await ReportCard.findOne({
    studentId: studentId.toUpperCase(),
    term:      resolvedTerm,
    session:   resolvedSession,
  }).lean();

  if (!card) {
    throw new ErrorResponse(`Report card not found for ${studentId}.`, 404);
  }

  if (!adminAccess && !card.isPublished) {
    throw new ErrorResponse('Report card has not been published yet.', 403);
  }

  // Load school settings for header
  let school = {};
  try {
    const settings = await Settings.getSingleton();
    school = settings.school || {};
  } catch { /* non-critical */ }

  const pdfBuffer = await generateReportCardPdf(card, school);

  const filename = `ReportCard_${card.studentName.replace(/\s+/g, '_')}_${resolvedTerm.replace(/\s+/g, '_')}_${resolvedSession.replace('/', '-')}.pdf`;

  return { pdfBuffer, filename };
};

// ─── 7. getMyReportCard (parent) ─────────────────────────────────────────────

/**
 * Returns a single published report card for a parent's child.
 */
const getMyReportCard = async (studentId, linkedStudentIds, { term, session }) => {
  const upperStudentId = studentId.toUpperCase();

  if (!linkedStudentIds.includes(upperStudentId)) {
    throw new ErrorResponse('Access denied — this child is not linked to your account.', 403);
  }

  const resolvedTerm    = term    || currentTerm();
  const resolvedSession = session || currentSession();

  const card = await ReportCard.findOne({
    studentId:   upperStudentId,
    term:        resolvedTerm,
    session:     resolvedSession,
    isPublished: true,
  }).lean();

  if (!card) {
    return { reportCard: null, published: false };
  }

  return { reportCard: card, published: true };
};

// ─── 8. getMyReportCards (parent — list all terms) ────────────────────────────

/**
 * Returns all published report cards for a child (across all terms).
 */
const getMyReportCards = async (studentId, linkedStudentIds) => {
  const upperStudentId = studentId.toUpperCase();

  if (!linkedStudentIds.includes(upperStudentId)) {
    throw new ErrorResponse('Access denied — this child is not linked to your account.', 403);
  }

  const cards = await ReportCard.find({
    studentId:   upperStudentId,
    isPublished: true,
  }).sort({ createdAt: -1 }).lean();

  return { reportCards: cards };
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  generateReportCards,
  getClassReportCards,
  getReportCard,
  updateTraits,
  publishReportCards,
  getReportCardPdf,
  getMyReportCard,
  getMyReportCards,
};
