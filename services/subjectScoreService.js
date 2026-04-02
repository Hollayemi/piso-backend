/**
 * services/subjectScoreService.js
 *
 * Manages individual subject scores for the admin results entry page.
 *
 * Endpoints served:
 *   GET  /results?class=&subject=&term=&session=       → getClassSubjectScores
 *   POST /results/bulk                                 → bulkSaveScores
 *   GET  /results/summary?class=&term=&session=        → getClassSummary
 *   GET  /results/subjects?class=&term=&session=       → getSubjectsForClass
 */

const SubjectScore   = require('../model/subjectScore.model');
const Student        = require('../model/student.model');
const ErrorResponse  = require('../utils/errorResponse');

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

const getGrade = (pct) => {
  if (pct === null || pct === undefined) return { grade: '—', remark: '—' };
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

// ─── getClassSubjectScores ────────────────────────────────────────────────────

/**
 * Returns all students in a class with their scores for a specific subject+term.
 * Students with no score entry yet are still included (with null scores).
 *
 * @param {object} query - { class, subject, term, session }
 */
const getClassSubjectScores = async ({ class: cls, subject, term, session }) => {
  if (!cls)     throw new ErrorResponse('class is required',   400);
  if (!subject) throw new ErrorResponse('subject is required', 400);

  const resolvedTerm    = term    || currentTerm();
  const resolvedSession = session || currentSession();

  // All active students in this class
  const students = await Student.find(
    { class: cls, status: 'Active' },
    { studentId: 1, surname: 1, firstName: 1 }
  ).sort({ surname: 1, firstName: 1 }).lean();

  // Existing score records for this class/subject/term/session
  const scoreRecords = await SubjectScore.find({
    class:       cls,
    subjectName: subject,
    term:        resolvedTerm,
    session:     resolvedSession,
  }).lean({ virtuals: true });

  const scoreMap = Object.fromEntries(scoreRecords.map((r) => [r.studentId, r]));

  // Merge students with scores
  const scores = students.map((s) => {
    const rec   = scoreMap[s.studentId];
    const total = rec
      ? ((rec.test1 ?? 0) + (rec.test2 ?? 0) + (rec.exam ?? 0))
      : null;
    const allEntered = rec && rec.test1 !== null && rec.test2 !== null && rec.exam !== null;
    const { grade, remark } = allEntered ? getGrade(total) : { grade: '—', remark: '—' };

    return {
      id:        s.studentId,
      surname:   s.surname,
      firstName: s.firstName,
      test1:     rec?.test1     ?? null,
      test2:     rec?.test2     ?? null,
      exam:      rec?.exam      ?? null,
      firstTerm: rec?.firstTermTotal  ?? null,
      total:     allEntered ? total : null,
      grade,
      remark,
    };
  });

  // Stats
  const entered  = scores.filter((s) => s.total !== null);
  const totals   = entered.map((s) => s.total);
  const avg      = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
  const highest  = totals.length ? Math.max(...totals) : 0;
  const passing  = totals.filter((t) => t >= 40).length;

  return {
    class:    cls,
    subject,
    term:     resolvedTerm,
    session:  resolvedSession,
    scores,
    stats: {
      total:    students.length,
      entered:  entered.length,
      avg,
      highest,
      passing,
    },
  };
};

// ─── bulkSaveScores ───────────────────────────────────────────────────────────

/**
 * Upserts scores for multiple students in a single request.
 * Each entry: { studentId, test1, test2, exam, firstTermTotal?, secondTermTotal? }
 *
 * @param {object} body - { class, subject, term, session, scores[] }
 * @param {string} enteredBy - Staff ID
 */
const bulkSaveScores = async (body, enteredBy) => {
  const {
    class: cls,
    subject,
    term,
    session,
    scores,
  } = body;

  if (!cls)     throw new ErrorResponse('class is required',   400);
  if (!subject) throw new ErrorResponse('subject is required', 400);
  if (!Array.isArray(scores) || !scores.length) {
    throw new ErrorResponse('scores array is required', 400);
  }

  const resolvedTerm    = term    || currentTerm();
  const resolvedSession = session || currentSession();

  // Fetch student names for denormalisation
  const studentIds = scores.map((s) => s.studentId?.toUpperCase()).filter(Boolean);
  const students   = await Student.find(
    { studentId: { $in: studentIds } },
    { studentId: 1, surname: 1, firstName: 1 }
  ).lean();
  const studentMap = Object.fromEntries(students.map((s) => [s.studentId, `${s.surname} ${s.firstName}`]));

  const operations = scores.map((s) => ({
    updateOne: {
      filter: {
        studentId:   s.studentId.toUpperCase(),
        subjectName: subject,
        term:        resolvedTerm,
        session:     resolvedSession,
      },
      update: {
        $set: {
          studentId:       s.studentId.toUpperCase(),
          studentName:     studentMap[s.studentId.toUpperCase()] || '',
          class:           cls,
          subjectName:     subject,
          term:            resolvedTerm,
          session:         resolvedSession,
          test1:           s.test1 !== undefined ? s.test1 : null,
          test2:           s.test2 !== undefined ? s.test2 : null,
          exam:            s.exam  !== undefined ? s.exam  : null,
          firstTermTotal:  s.firstTerm  !== undefined ? s.firstTerm  : undefined,
          secondTermTotal: s.secondTerm !== undefined ? s.secondTerm : undefined,
          lastUpdatedBy:   enteredBy,
          enteredBy:       enteredBy,
        },
      },
      upsert: true,
    },
  }));

  const result = await SubjectScore.bulkWrite(operations, { ordered: false });

  return {
    saved:     result.upsertedCount + result.modifiedCount,
    upserted:  result.upsertedCount,
    modified:  result.modifiedCount,
    class:     cls,
    subject,
    term:      resolvedTerm,
    session:   resolvedSession,
  };
};

// ─── getClassSummary ──────────────────────────────────────────────────────────

/**
 * Returns all subjects with grade distribution for a class summary view.
 *
 * @param {object} query - { class, term, session }
 */
const getClassSummary = async ({ class: cls, term, session }) => {
  if (!cls) throw new ErrorResponse('class is required', 400);

  const resolvedTerm    = term    || currentTerm();
  const resolvedSession = session || currentSession();

  const scores = await SubjectScore.find({
    class:   cls,
    term:    resolvedTerm,
    session: resolvedSession,
  }).lean({ virtuals: true });

  // Group by subject
  const subjectMap = {};
  scores.forEach((s) => {
    if (!subjectMap[s.subjectName]) {
      subjectMap[s.subjectName] = { subject: s.subjectName, scores: [] };
    }
    const total = (s.test1 ?? 0) + (s.test2 ?? 0) + (s.exam ?? 0);
    if (s.test1 !== null && s.test2 !== null && s.exam !== null) {
      subjectMap[s.subjectName].scores.push(total);
    }
  });

  const subjects = Object.values(subjectMap).map(({ subject, scores: subScores }) => {
    const avg     = subScores.length ? +(subScores.reduce((a, b) => a + b, 0) / subScores.length).toFixed(1) : 0;
    const highest = subScores.length ? Math.max(...subScores) : 0;
    const lowest  = subScores.length ? Math.min(...subScores) : 0;
    const distribution = { A1: 0, B2: 0, B3: 0, C4: 0, C5: 0, C6: 0, D7: 0, E8: 0, F9: 0 };
    subScores.forEach((t) => {
      const { grade } = getGrade(t);
      if (grade in distribution) distribution[grade]++;
    });
    return { subject, entered: subScores.length, avg, highest, lowest, distribution };
  });

  return {
    class:    cls,
    term:     resolvedTerm,
    session:  resolvedSession,
    subjects,
  };
};

// ─── getSubjectsForClass ──────────────────────────────────────────────────────

/**
 * Returns the unique list of subject names that have been assigned to a class
 * (from the Subject model) combined with any subjects that already have scores.
 *
 * @param {string} cls
 */
const getSubjectsForClass = async (cls) => {
  const Subject = require('../model/subject.model');
  const subjectDocs = await Subject.find({ classes: cls }, { name: 1 }).sort({ name: 1 }).lean();

  const subjectsFromDocs = subjectDocs.map((s) => s.name);

  // Also pick up any subjects that were scored but might not be in Subject.classes
  const scoredSubjects = await SubjectScore.distinct('subjectName', { class: cls });
  const merged = [...new Set([...subjectsFromDocs, ...scoredSubjects])].sort();

  return { class: cls, subjects: merged };
};

// ─── getScoreTemplate ─────────────────────────────────────────────────────────

/**
 * Generates a pre-filled CSV template for a class + subject + term.
 * Every student in the class is included with their ID, surname, and
 * first name. Any existing scores are pre-populated so re-downloads
 * never lose previously entered data.
 *
 * @param {object} query - { class, subject, term, session }
 * @returns {{ csv: string, filename: string }}
 */
const getScoreTemplate = async ({ class: cls, subject, term, session }) => {
  if (!cls)     throw new ErrorResponse('class is required',   400);
  if (!subject) throw new ErrorResponse('subject is required', 400);

  const resolvedTerm    = term    || currentTerm();
  const resolvedSession = session || currentSession();

  // Fetch all active students in the class, sorted by surname
  const students = await Student.find(
    { class: cls, status: 'Active' },
    { studentId: 1, surname: 1, firstName: 1 }
  ).sort({ surname: 1, firstName: 1 }).lean();

  if (!students.length) {
    throw new ErrorResponse(`No active students found in class '${cls}'.`, 404);
  }

  // Fetch any existing scores so we can pre-fill
  const existingScores = await SubjectScore.find({
    class:       cls,
    subjectName: subject,
    term:        resolvedTerm,
    session:     resolvedSession,
    studentId:   { $in: students.map((s) => s.studentId) },
  }).lean();

  const scoreMap = Object.fromEntries(existingScores.map((r) => [r.studentId, r]));

  // Build CSV
  const INSTRUCTIONS = [
    '# INSTRUCTIONS: Do NOT change StudentID, Surname or FirstName columns.',
    `# Class: ${cls} | Subject: ${subject} | Term: ${resolvedTerm} | Session: ${resolvedSession}`,
    '# Test1 max = 20, Test2 max = 20, Exam max = 60, FirstTerm max = 100 (leave blank if not applicable)',
    '# Delete these comment lines before uploading.',
  ];

  const HEADER = 'StudentID,Surname,FirstName,Test1_20,Test2_20,Exam_60,FirstTerm_100';

  const dataRows = students.map((s) => {
    const rec = scoreMap[s.studentId];
    const t1  = rec?.test1          != null ? rec.test1          : '';
    const t2  = rec?.test2          != null ? rec.test2          : '';
    const ex  = rec?.exam           != null ? rec.exam           : '';
    const ft  = rec?.firstTermTotal != null ? rec.firstTermTotal : '';
    // Quote name fields in case they contain commas
    const surname   = `"${(s.surname   || '').replace(/"/g, '""')}"`;
    const firstName = `"${(s.firstName || '').replace(/"/g, '""')}"`;
    return `${s.studentId},${surname},${firstName},${t1},${t2},${ex},${ft}`;
  });

  const csv = [...INSTRUCTIONS, HEADER, ...dataRows].join('\r\n');

  const safeCls     = cls.replace(/\s+/g, '_');
  const safeSubject = subject.replace(/\s+/g, '_');
  const safeTerm    = resolvedTerm.replace(/\s+/g, '_');
  const filename    = `Scores_${safeCls}_${safeSubject}_${safeTerm}_${resolvedSession.replace('/', '-')}.csv`;

  return { csv, filename };
};

// ─── uploadCsvScores ──────────────────────────────────────────────────────────

/**
 * Parses an uploaded CSV file (from express-fileupload) and upserts scores.
 *
 * Expected CSV format (header row required, comment rows starting with # ignored):
 *   StudentID,Surname,FirstName,Test1_20,Test2_20,Exam_60,FirstTerm_100
 *
 * Validation rules per row:
 *   - StudentID must exist in the DB and belong to the target class
 *   - Test1, Test2 must be 0–20 (or blank)
 *   - Exam must be 0–60 (or blank)
 *   - FirstTerm must be 0–100 (or blank)
 *
 * Returns a summary of saved rows and any validation errors.
 *
 * @param {object} file       - express-fileupload file object (req.files.csv)
 * @param {object} body       - { class, subject, term, session }
 * @param {string} enteredBy  - Staff ID
 */
const uploadCsvScores = async (file, body, enteredBy) => {
  const { class: cls, subject, term, session } = body;

  if (!cls)     throw new ErrorResponse('class is required',   400);
  if (!subject) throw new ErrorResponse('subject is required', 400);
  if (!file)    throw new ErrorResponse('CSV file is required', 400);

  // Only accept text/csv or application/vnd.ms-excel
  const validMimes = ['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream'];
  if (!validMimes.includes(file.mimetype) && !file.name.endsWith('.csv')) {
    throw new ErrorResponse('Only CSV files are accepted.', 400);
  }

  const resolvedTerm    = term    || currentTerm();
  const resolvedSession = session || currentSession();

  // Parse CSV from buffer
  const rawText = file.data.toString('utf8');
  const lines   = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));   // strip blank and comment lines

  if (!lines.length) throw new ErrorResponse('CSV file is empty.', 400);

  // Locate header row
  const headerLineIdx = lines.findIndex((l) =>
    l.toUpperCase().includes('STUDENTID')
  );
  if (headerLineIdx === -1) {
    throw new ErrorResponse('CSV must contain a header row with StudentID column.', 400);
  }

  const headerParts = lines[headerLineIdx]
    .split(',')
    .map((h) => h.trim().replace(/^"|"$/g, '').toUpperCase());

  // Map column names → indices (flexible — extra columns are ignored)
  const col = (name) => {
    const idx = headerParts.findIndex((h) => h.startsWith(name.toUpperCase()));
    return idx === -1 ? null : idx;
  };

  const COL = {
    studentId: col('STUDENTID'),
    test1:     col('TEST1'),
    test2:     col('TEST2'),
    exam:      col('EXAM'),
    firstTerm: col('FIRSTTERM') ?? col('FIRST_TERM'),
  };

  if (COL.studentId === null) {
    throw new ErrorResponse('CSV is missing the StudentID column.', 400);
  }

  const dataLines = lines.slice(headerLineIdx + 1).filter(Boolean);
  if (!dataLines.length) throw new ErrorResponse('CSV has no data rows.', 400);

  // Parse a single quoted-CSV cell
  const parseCell = (row, idx) => {
    if (idx === null || idx >= row.length) return '';
    return row[idx].trim().replace(/^"|"$/g, '');
  };

  const toScore = (raw, max, label, rowNum, errors) => {
    if (raw === '' || raw == null) return null;
    const n = Number(raw);
    if (isNaN(n)) {
      errors.push(`Row ${rowNum}: ${label} "${raw}" is not a number`);
      return null;
    }
    if (n < 0 || n > max) {
      errors.push(`Row ${rowNum}: ${label} ${n} is out of range (0–${max})`);
      return null;
    }
    return n;
  };

  // Load all valid students in the class for membership check
  const classStudents = await Student.find(
    { class: cls, status: 'Active' },
    { studentId: 1, surname: 1, firstName: 1 }
  ).lean();

  const validStudentIds = new Set(classStudents.map((s) => s.studentId.toUpperCase()));
  const studentNameMap  = Object.fromEntries(
    classStudents.map((s) => [s.studentId.toUpperCase(), `${s.surname} ${s.firstName}`])
  );

  const rowErrors  = [];
  const validRows  = [];
  const seenIds    = new Set();

  // Split a CSV line correctly (handles quoted fields with commas)
  const splitCsvLine = (line) => {
    const result = [];
    let current  = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  };

  dataLines.forEach((line, i) => {
    const rowNum = i + 2 + headerLineIdx; // 1-based, offset for header
    const parts  = splitCsvLine(line);

    const studentId = parseCell(parts, COL.studentId).toUpperCase();

    if (!studentId) {
      rowErrors.push(`Row ${rowNum}: StudentID is blank — skipped`);
      return;
    }

    if (!validStudentIds.has(studentId)) {
      rowErrors.push(`Row ${rowNum}: StudentID "${studentId}" not found in class '${cls}'`);
      return;
    }

    if (seenIds.has(studentId)) {
      rowErrors.push(`Row ${rowNum}: Duplicate StudentID "${studentId}" — only first occurrence will be used`);
      return;
    }
    seenIds.add(studentId);

    const rowErrs = [];
    const test1   = toScore(parseCell(parts, COL.test1),     20,  'Test1',     rowNum, rowErrs);
    const test2   = toScore(parseCell(parts, COL.test2),     20,  'Test2',     rowNum, rowErrs);
    const exam    = toScore(parseCell(parts, COL.exam),      60,  'Exam',      rowNum, rowErrs);
    const firstTm = toScore(parseCell(parts, COL.firstTerm), 100, 'FirstTerm', rowNum, rowErrs);

    if (rowErrs.length) {
      rowErrors.push(...rowErrs);
      // Still include the row with whatever valid data we have (partial save)
    }

    validRows.push({
      studentId,
      studentName: studentNameMap[studentId] || '',
      test1,
      test2,
      exam,
      firstTermTotal: firstTm,
    });
  });

  if (!validRows.length) {
    throw new ErrorResponse(
      'No valid rows found in CSV. Check that StudentIDs belong to this class.',
      400,
      rowErrors.map((e) => ({ message: e }))
    );
  }

  // Build bulkWrite operations
  const operations = validRows.map((row) => ({
    updateOne: {
      filter: {
        studentId:   row.studentId,
        subjectName: subject,
        term:        resolvedTerm,
        session:     resolvedSession,
      },
      update: {
        $set: {
          studentId:       row.studentId,
          studentName:     row.studentName,
          class:           cls,
          subjectName:     subject,
          term:            resolvedTerm,
          session:         resolvedSession,
          ...(row.test1          !== null && { test1:          row.test1          }),
          ...(row.test2          !== null && { test2:          row.test2          }),
          ...(row.exam           !== null && { exam:           row.exam           }),
          ...(row.firstTermTotal !== null && { firstTermTotal: row.firstTermTotal }),
          lastUpdatedBy: enteredBy,
          enteredBy,
        },
      },
      upsert: true,
    },
  }));

  const result = await SubjectScore.bulkWrite(operations, { ordered: false });

  return {
    saved:       result.upsertedCount + result.modifiedCount,
    upserted:    result.upsertedCount,
    modified:    result.modifiedCount,
    totalRows:   dataLines.length,
    skipped:     dataLines.length - validRows.length,
    errors:      rowErrors,
    hasErrors:   rowErrors.length > 0,
    class:       cls,
    subject,
    term:        resolvedTerm,
    session:     resolvedSession,
  };
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getClassSubjectScores,
  bulkSaveScores,
  getClassSummary,
  getSubjectsForClass,
  getScoreTemplate,
  uploadCsvScores,
};
