/**
 * subjectService.js
 *
 * All database interactions and business logic for the Subject sub-module
 * (Academics 3.6 – 3.10).
 *
 * Controllers delegate here; only this layer touches MongoDB for subjects.
 */

const Subject     = require('../model/subject.model');
const Timetable   = require('../model/timetable.model');
const ErrorResponse = require('../../utils/errorResponse');

// ─── ID Generation ────────────────────────────────────────────────────────────

/**
 * Generates the next sequential subject ID.
 * Format: SUB-NNN  (global counter)
 *
 * @returns {{ subjectId: string, serialNumber: number }}
 */
const generateSubjectId = async () => {
    const latest = await Subject.findOne({}, { serialNumber: 1 }).sort({ serialNumber: -1 });
    const nextSerial   = latest ? latest.serialNumber + 1 : 1;
    const paddedSerial = String(nextSerial).padStart(3, '0');
    return { subjectId: `SUB-${paddedSerial}`, serialNumber: nextSerial };
};

// ─── Shape Helpers ────────────────────────────────────────────────────────────

/**
 * Standard list/detail shape for a subject document.
 *
 * @param {object} doc - Subject lean doc
 */
const toView = (doc) => ({
    id:             doc.subjectId,
    name:           doc.name,
    code:           doc.code,
    category:       doc.category,
    dept:           doc.dept,
    periodsPerWeek: doc.periodsPerWeek,
    color:          doc.color || '',
    teachers:       (doc.teachers || []).map((t) => ({
        id:   t.staffId,
        name: t.name,
        dept: t.dept || '',
    })),
    classes: doc.classes || [],
});

// ─── Teacher snapshot resolution ──────────────────────────────────────────────

/**
 * Resolves an array of staffIds into teacher snapshot objects.
 * Throws if any ID is invalid.
 *
 * @param {string[]} teacherIds
 * @returns {Array} Array of { staffId, name, dept }
 */
const resolveTeachers = async (teacherIds = []) => {
    if (!teacherIds.length) return [];

    const Staff     = require('../../model/staff');
    const upperIds  = teacherIds.map((id) => id.toUpperCase());
    const staffDocs = await Staff.find(
        { staffId: { $in: upperIds } },
        { staffId: 1, surname: 1, firstName: 1, department: 1 }
    ).lean();

    const foundIds = staffDocs.map((s) => s.staffId);
    const missing  = upperIds.filter((id) => !foundIds.includes(id));

    if (missing.length) {
        throw new ErrorResponse(
            `Staff ID(s) not found: ${missing.join(', ')}`,
            404,
            missing.map((id) => ({ field: 'teacherIds', message: `'${id}' not found` }))
        );
    }

    return staffDocs.map((s) => ({
        staffId: s.staffId,
        name:    `${s.surname} ${s.firstName}`,
        dept:    s.department || '',
    }));
};

// ─── 3.6  Get All Subjects ────────────────────────────────────────────────────

/**
 * Returns all subjects with optional filters and aggregate stats.
 *
 * @param {object} query - { search, category, dept }
 */
const getAllSubjects = async ({ search, category, dept }) => {
    const filter = {};

    if (search) {
        filter.$or = [
            { name:      { $regex: search, $options: 'i' } },
            { code:      { $regex: search, $options: 'i' } },
            { subjectId: { $regex: search, $options: 'i' } },
        ];
    }
    if (category) filter.category = category;
    if (dept)     filter.dept     = { $regex: dept, $options: 'i' };

    const subjects = await Subject.find(filter).sort({ name: 1 }).lean();

    // Stats
    const total    = subjects.length;
    const core     = subjects.filter((s) => s.category === 'Core').length;
    const elective = subjects.filter((s) => s.category === 'Elective').length;
    const vocational = subjects.filter((s) => s.category === 'Vocational').length;
    const avgPeriodsPerWeek = total
        ? Math.round(subjects.reduce((sum, s) => sum + (s.periodsPerWeek || 0), 0) / total)
        : 0;

    return {
        subjects: subjects.map(toView),
        stats: { total, core, elective, vocational, avgPeriodsPerWeek },
    };
};

// ─── 3.7  Get Single Subject ──────────────────────────────────────────────────

/**
 * Returns full detail for one subject.
 *
 * @param {string} id - subjectId e.g. "SUB-001"
 */
const getSubjectById = async (id) => {
    const subject = await Subject.findOne({ subjectId: id.toUpperCase() }).lean();

    if (!subject) {
        throw new ErrorResponse(`Subject '${id}' not found`, 404);
    }

    return { subject: toView(subject) };
};

// ─── 3.8  Create Subject ──────────────────────────────────────────────────────

/**
 * Creates a new subject, resolving teacher snapshots from staffIds.
 *
 * @param {object} body      - Validated request body
 * @param {string} createdBy - Staff ID of the authenticated user
 */
const createSubject = async (body, createdBy) => {
    // Name uniqueness
    const dupName = await Subject.findOne({ name: new RegExp(`^${body.name}$`, 'i') });
    if (dupName) {
        throw new ErrorResponse(
            `Subject '${body.name}' already exists.`,
            409,
            [{ code: 'DUPLICATE_NAME' }]
        );
    }

    // Code uniqueness
    const dupCode = await Subject.findOne({ code: body.code.toUpperCase() });
    if (dupCode) {
        throw new ErrorResponse(
            `Subject code '${body.code}' is already in use.`,
            409,
            [{ code: 'DUPLICATE_CODE' }]
        );
    }

    const teachers = await resolveTeachers(body.teacherIds || []);
    const { subjectId, serialNumber } = await generateSubjectId();

    const subject = await Subject.create({
        subjectId,
        serialNumber,
        name:           body.name,
        code:           body.code.toUpperCase(),
        category:       body.category,
        dept:           body.dept || 'General',
        periodsPerWeek: body.periodsPerWeek,
        color:          body.color || 'bg-gray-100 text-gray-700',
        teachers,
        classes:        body.classes || [],
        createdBy,
    });

    return { subject: toView(subject.toObject()) };
};

// ─── 3.9  Update Subject ──────────────────────────────────────────────────────

/**
 * Partially updates a subject.
 * Re-resolves teacher snapshots if teacherIds is provided.
 *
 * @param {string} id        - subjectId
 * @param {object} body      - Validated partial body
 * @param {string} updatedBy - Staff ID of the authenticated user
 */
const updateSubject = async (id, body, updatedBy) => {
    const subject = await Subject.findOne({ subjectId: id.toUpperCase() });

    if (!subject) {
        throw new ErrorResponse(`Subject '${id}' not found`, 404);
    }

    // Name uniqueness check (only when name changes)
    if (body.name && body.name.toLowerCase() !== subject.name.toLowerCase()) {
        const dup = await Subject.findOne({ name: new RegExp(`^${body.name}$`, 'i') });
        if (dup) {
            throw new ErrorResponse(
                `Subject '${body.name}' already exists.`,
                409,
                [{ code: 'DUPLICATE_NAME' }]
            );
        }
    }

    // Code uniqueness check (only when code changes)
    if (body.code && body.code.toUpperCase() !== subject.code) {
        const dup = await Subject.findOne({ code: body.code.toUpperCase() });
        if (dup) {
            throw new ErrorResponse(
                `Subject code '${body.code}' is already in use.`,
                409,
                [{ code: 'DUPLICATE_CODE' }]
            );
        }
        body.code = body.code.toUpperCase();
    }

    // Re-resolve teachers if new list is provided
    if (Array.isArray(body.teacherIds)) {
        body.teachers = await resolveTeachers(body.teacherIds);
        delete body.teacherIds;
    }

    body.lastUpdatedBy = updatedBy;

    const updated = await Subject.findOneAndUpdate(
        { subjectId: id.toUpperCase() },
        { $set: body },
        { new: true, runValidators: true }
    ).lean();

    return { subject: toView(updated) };
};

// ─── 3.10  Delete Subject ─────────────────────────────────────────────────────

/**
 * Deletes a subject and removes it from all timetable cells (cascade).
 *
 * @param {string} id - subjectId
 */
const deleteSubject = async (id) => {
    const subject = await Subject.findOne({ subjectId: id.toUpperCase() });

    if (!subject) {
        throw new ErrorResponse(`Subject '${id}' not found`, 404);
    }

    // Cascade: null-out all timetable cells that reference this subject
    const days   = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const slots  = ['T1', 'T2', 'T3', 'T5', 'T6', 'T8', 'T9'];
    const unsets = {};

    for (const day of days) {
        for (const slot of slots) {
            // We use a conditional update per timetable where the cell exists
        }
    }

    // Efficiently clear matching cells across all timetable documents
    const timetables = await Timetable.find({
        $or: days.flatMap((day) =>
            slots.map((slot) => ({
                [`slots.${day}.${slot}.subjectId`]: subject.subjectId,
            }))
        ),
    });

    for (const tt of timetables) {
        let modified = false;
        for (const day of days) {
            for (const slot of slots) {
                if (tt.slots?.[day]?.[slot]?.subjectId === subject.subjectId) {
                    tt.slots[day][slot] = null;
                    modified = true;
                }
            }
        }
        if (modified) {
            tt.markModified('slots');
            await tt.save();
        }
    }

    await subject.deleteOne();
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    getAllSubjects,
    getSubjectById,
    createSubject,
    updateSubject,
    deleteSubject,
};
