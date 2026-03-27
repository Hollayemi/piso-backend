/**
 * classService.js
 *
 * All database interactions and business logic for the Class sub-module
 * (Academics 3.1 – 3.5).
 *
 * Controllers are thin wrappers; this layer is the only place that
 * touches MongoDB for class-related operations.
 */

const Class       = require('../model/class.model');
const Timetable   = require('../model/timetable.model');
const ErrorResponse = require('../../utils/errorResponse');

// ─── ID Generation ────────────────────────────────────────────────────────────

/**
 * Generates the next sequential class ID.
 * Format: CLS-NNN  (global counter, not year-scoped)
 *
 * @returns {{ classId: string, serialNumber: number }}
 */
const generateClassId = async () => {
    const latest = await Class.findOne({}, { serialNumber: 1 }).sort({ serialNumber: -1 });
    const nextSerial   = latest ? latest.serialNumber + 1 : 1;
    const paddedSerial = String(nextSerial).padStart(3, '0');
    return { classId: `CLS-${paddedSerial}`, serialNumber: nextSerial };
};

// ─── Shape Helpers ────────────────────────────────────────────────────────────

/**
 * List-item shape for GET /academics/classes (3.1).
 * Adds live student count from Student collection.
 *
 * @param {object} doc          - Class Mongoose lean doc
 * @param {number} studentCount - Count resolved by the service
 */
const toListItem = (doc, studentCount = 0) => ({
    id:           doc.classId,
    name:         doc.name,
    level:        doc.level,
    arm:          doc.arm || '',
    group:        doc.group,
    capacity:     doc.capacity,
    studentCount,
    classTeacher: doc.classTeacher?.staffId
        ? {
              id:      doc.classTeacher.staffId,
              name:    doc.classTeacher.name,
              subject: doc.classTeacher.subject || '',
          }
        : null,
});

/**
 * Full detail shape for GET /academics/classes/:id (3.2).
 * Adds embedded student list and subject list.
 *
 * @param {object} doc      - Class Mongoose lean doc
 * @param {Array}  students - Lean student docs for this class
 * @param {Array}  subjects - Subject names assigned to this class
 */
const toDetailView = (doc, students = [], subjects = [], studentCount = 0) => ({
    id:           doc.classId,
    name:         doc.name,
    level:        doc.level,
    arm:          doc.arm || '',
    group:        doc.group,
    capacity:     doc.capacity,
    studentCount,
    classTeacher: doc.classTeacher?.staffId
        ? {
              id:      doc.classTeacher.staffId,
              name:    doc.classTeacher.name,
              subject: doc.classTeacher.subject || '',
          }
        : null,
    students: students.map((s) => ({
        id:        s.studentId,
        surname:   s.surname,
        firstName: s.firstName,
        gender:    s.gender,
    })),
    subjects,
});

// ─── 3.1  Get All Classes ─────────────────────────────────────────────────────

/**
 * Returns all classes with optional search / level / group filters.
 * Includes live student counts and aggregate stats.
 *
 * @param {object} query - Parsed query params
 */
const getAllClasses = async ({ search, level, group }) => {
    // Avoid circular require — lazy-load Student to prevent import cycles
    const Student = require('../../model/student');
    const Subject = require('../model/subject.model');

    const filter = {};

    if (search) {
        filter.$or = [
            { name:    { $regex: search, $options: 'i' } },
            { classId: { $regex: search, $options: 'i' } },
        ];
    }
    if (level) filter.level = level;
    if (group) filter.group = group;

    const classes = await Class.find(filter).sort({ group: 1, arm: 1 }).lean();

    // Batch student counts in one aggregation
    const studentAgg = await Student.aggregate([
        { $match: { status: 'Active' } },
        { $group: { _id: '$class', count: { $sum: 1 } } },
    ]);

    const countMap = Object.fromEntries(studentAgg.map((r) => [r._id, r.count]));

    const result = classes.map((cls) => toListItem(cls, countMap[cls.name] || 0));

    // Stats
    const total         = classes.length;
    const junior        = classes.filter((c) => c.level === 'Junior').length;
    const senior        = classes.filter((c) => c.level === 'Senior').length;
    const totalStudents = Object.values(countMap).reduce((a, b) => a + b, 0);

    return {
        classes: result,
        stats:   { total, junior, senior, totalStudents },
    };
};

// ─── 3.2  Get Single Class ────────────────────────────────────────────────────

/**
 * Returns full detail for one class including student list and subjects.
 *
 * @param {string} id - classId e.g. "CLS-001"
 */
const getClassById = async (id) => {
    const Student = require('../../model/student');
    const Subject = require('../model/subject.model');

    const cls = await Class.findOne({ classId: id.toUpperCase() }).lean();

    if (!cls) {
        throw new ErrorResponse(`Class '${id}' not found`, 404);
    }

    // Students currently in this class
    const students = await Student.find(
        { class: cls.name, status: 'Active' },
        { studentId: 1, surname: 1, firstName: 1, gender: 1 }
    ).lean();

    // Subject names assigned to this class
    const subjectDocs = await Subject.find({ classes: cls.name }, { name: 1 }).lean();
    const subjectNames = subjectDocs.map((s) => s.name);

    return {
        class: toDetailView(cls, students, subjectNames, students.length),
    };
};

// ─── 3.3  Create Class ────────────────────────────────────────────────────────

/**
 * Registers a new class arm.
 *
 * @param {object} body      - Validated request body
 * @param {string} createdBy - Staff ID of the authenticated user
 */
const createClass = async (body, createdBy) => {
    // Duplicate name check
    const existing = await Class.findOne({ name: body.name.trim() });
    if (existing) {
        throw new ErrorResponse(
            `A class named '${body.name}' already exists.`,
            409,
            [{ code: 'DUPLICATE_CLASS' }]
        );
    }

    const { classId, serialNumber } = await generateClassId();

    // Resolve class teacher snapshot if provided
    let classTeacher = {};
    if (body.classTeacherId) {
        const Staff = require('../../model/staff');
        const staff = await Staff.findOne(
            { staffId: body.classTeacherId.toUpperCase() },
            { staffId: 1, surname: 1, firstName: 1, subjects: 1 }
        ).lean();

        if (!staff) {
            throw new ErrorResponse(
                `Staff member '${body.classTeacherId}' not found.`,
                404,
                [{ code: 'STAFF_NOT_FOUND' }]
            );
        }

        classTeacher = {
            staffId: staff.staffId,
            name:    `${staff.surname} ${staff.firstName}`,
            subject: staff.subjects?.[0] || '',
        };
    }

    const cls = await Class.create({
        classId,
        serialNumber,
        name:         body.name.trim(),
        level:        body.level,
        arm:          body.arm || '',
        group:        body.group,
        capacity:     body.capacity,
        classTeacher,
        createdBy,
    });

    return {
        class: {
            id:           cls.classId,
            name:         cls.name,
            level:        cls.level,
            arm:          cls.arm || '',
            group:        cls.group,
            capacity:     cls.capacity,
            studentCount: 0,
            classTeacher: cls.classTeacher?.staffId ? {
                id:      cls.classTeacher.staffId,
                name:    cls.classTeacher.name,
                subject: cls.classTeacher.subject,
            } : null,
        },
    };
};

// ─── 3.4  Update Class ────────────────────────────────────────────────────────

/**
 * Partially updates a class record.
 *
 * @param {string} id        - classId
 * @param {object} body      - Validated partial body
 * @param {string} updatedBy - Staff ID of the authenticated user
 */
const updateClass = async (id, body, updatedBy) => {
    const cls = await Class.findOne({ classId: id.toUpperCase() });

    if (!cls) {
        throw new ErrorResponse(`Class '${id}' not found`, 404);
    }

    // Name uniqueness check (only when name changes)
    if (body.name && body.name.trim() !== cls.name) {
        const duplicate = await Class.findOne({ name: body.name.trim() });
        if (duplicate) {
            throw new ErrorResponse(
                `A class named '${body.name}' already exists.`,
                409,
                [{ code: 'DUPLICATE_CLASS' }]
            );
        }
    }

    // Resolve new class teacher snapshot if being updated
    if (body.classTeacherId !== undefined) {
        if (body.classTeacherId) {
            const Staff = require('../../model/staff');
            const staff = await Staff.findOne(
                { staffId: body.classTeacherId.toUpperCase() },
                { staffId: 1, surname: 1, firstName: 1, subjects: 1 }
            ).lean();

            if (!staff) {
                throw new ErrorResponse(
                    `Staff member '${body.classTeacherId}' not found.`,
                    404,
                    [{ code: 'STAFF_NOT_FOUND' }]
                );
            }

            body.classTeacher = {
                staffId: staff.staffId,
                name:    `${staff.surname} ${staff.firstName}`,
                subject: staff.subjects?.[0] || '',
            };
        } else {
            body.classTeacher = {};
        }
        delete body.classTeacherId;
    }

    body.lastUpdatedBy = updatedBy;

    const updated = await Class.findOneAndUpdate(
        { classId: id.toUpperCase() },
        { $set: body },
        { new: true, runValidators: true }
    ).lean();

    const Student = require('../../model/student');
    const count   = await Student.countDocuments({ class: updated.name, status: 'Active' });

    return { class: toListItem(updated, count) };
};

// ─── 3.5  Delete Class ────────────────────────────────────────────────────────

/**
 * Deletes a class and cascades to timetable entries.
 * Blocks deletion if active students are enrolled.
 *
 * @param {string} id - classId
 */
const deleteClass = async (id) => {
    const cls = await Class.findOne({ classId: id.toUpperCase() });

    if (!cls) {
        throw new ErrorResponse(`Class '${id}' not found`, 404);
    }

    // Block if students are enrolled
    const Student    = require('../../model/student');
    const enrolled   = await Student.countDocuments({ class: cls.name, status: 'Active' });

    if (enrolled > 0) {
        throw new ErrorResponse(
            `Cannot delete '${cls.name}' — ${enrolled} active student(s) are still enrolled.`,
            400,
            [{ code: 'CLASS_HAS_STUDENTS' }]
        );
    }

    // Cascade: remove all timetable documents for this class
    await Timetable.deleteMany({ className: cls.name });

    await cls.deleteOne();
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    getAllClasses,
    getClassById,
    createClass,
    updateClass,
    deleteClass,
};
