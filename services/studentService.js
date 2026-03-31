/**
 * services/studentService.js
 *
 * All database interactions and business logic for the Student module.
 *
 * Key changes from the previous version:
 *   - No father/mother/contact fields on Student.
 *   - Student now holds only parentId (FK → Parent).
 *   - createStudent() automatically creates a Parent account via
 *     parentAuthService.createParentAccount() when father + mother details
 *     are provided inline, or validates an existing parentId.
 *   - All read methods populate the parent document on demand.
 */

const path = require('path');
const fs = require('fs').promises;
const Student = require('../model/student.model');
const Admission = require('../model/admission.model');
const Parent = require('../model/parent.model');
const { createParentAccount } = require('./parentAuthService');
const ErrorResponse = require('../utils/errorResponse');

// ─── ID Generation ────────────────────────────────────────────────────────────

const generateStudentId = async (year = new Date().getFullYear()) => {
    const yearPrefix = `STU-${year}-`;

    const latest = await Student.findOne(
        { studentId: { $regex: `^${yearPrefix}` } },
        { serialNumber: 1 }
    ).sort({ serialNumber: -1 });

    const nextSerial = latest ? latest.serialNumber + 1 : 1;
    const paddedSerial = String(nextSerial).padStart(4, '0');

    return { studentId: `${yearPrefix}${paddedSerial}`, serialNumber: nextSerial };
};

// ─── Photo Upload ─────────────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
};
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB

const uploadStudentPhoto = async (photoFile, studentId) => {
    if (!ALLOWED_IMAGE_TYPES[photoFile.mimetype]) {
        throw new ErrorResponse('Invalid photo format. Only JPG and PNG are accepted.', 400);
    }
    if (photoFile.size > MAX_PHOTO_SIZE) {
        throw new ErrorResponse('Photo file size must not exceed 5 MB.', 400);
    }

    const uploadDir = path.join(__dirname, '../uploads/students');
    await fs.mkdir(uploadDir, { recursive: true });

    const ext = ALLOWED_IMAGE_TYPES[photoFile.mimetype];
    const filename = `${studentId}.${ext}`;
    const filePath = path.join(uploadDir, filename);

    await photoFile.mv(filePath);
    return `/uploads/students/${filename}`;
};

const deleteStudentPhoto = async (photoUrl) => {
    if (!photoUrl) return;
    try {
        await fs.unlink(path.join(__dirname, '..', photoUrl));
    } catch { /* silently ignore */ }
};

// ─── Shape Helpers ────────────────────────────────────────────────────────────

/**
 * List-item shape — lean parent embedded for convenience.
 */
const toListItem = (doc) => {
    const p = doc.parent || {};
    return {
        id: doc.studentId,
        parentId: doc.parentId,
        surname: doc.surname,
        firstName: doc.firstName,
        middleName: doc.middleName || '',
        gender: doc.gender,
        dateOfBirth: doc.dateOfBirth,
        class: doc.class,
        schoolingOption: doc.schoolingOption,
        status: doc.status,
        stateOfOrigin: doc.stateOfOrigin,
        bloodGroup: doc.bloodGroup || '',
        genotype: doc.genotype || '',
        // Derived from parent
        familyName: p.familyName || '',
        fatherName: p.father?.name || '',
        fatherPhone: p.father?.homePhone || '',
        motherName: p.mother?.name || '',
        motherPhone: p.mother?.homePhone || '',
        correspondenceEmail: p.correspondenceEmail || '',
        admissionDate: doc.admissionDate,
        classTeacher: doc.classTeacher || '',
        fees: doc.fees ?? {},
        attendance: doc.attendancePercentage ?? 0,
        photo: doc.photo ?? null,
    };
};

/**
 * Full detail shape including complete parent data.
 */
const toDetailView = (doc) => {
    const p = doc.parent || {};
    return {
        id: doc.studentId,
        parentId: doc.parentId,
        surname: doc.surname,
        firstName: doc.firstName,
        middleName: doc.middleName || '',
        gender: doc.gender,
        dateOfBirth: doc.dateOfBirth,
        class: doc.class,
        schoolingOption: doc.schoolingOption,
        status: doc.status,
        statusReason: doc.statusReason || '',
        stateOfOrigin: doc.stateOfOrigin,
        localGovernment: doc.localGovernment,
        nationality: doc.nationality,
        religion: doc.religion || '',
        bloodGroup: doc.bloodGroup || '',
        genotype: doc.genotype || '',
        admissionDate: doc.admissionDate,
        classTeacher: doc.classTeacher || '',
        classPreferences: doc.classPreferences ?? {},
        schools: doc.schools ?? [],
        health: doc.health ?? {},
        fees: doc.fees ?? {},
        attendance: doc.attendancePercentage ?? 0,
        photo: doc.photo ?? null,
        // Full parent block
        parent: {
            id: p.parentId || '',
            familyName: p.familyName || '',
            correspondenceEmail: p.correspondenceEmail || '',
            father: {
                name: p.father?.name || '',
                email: p.father?.email || '',
                phone: p.father?.homePhone || '',
                whatsApp: p.father?.whatsApp || '',
                occupation: p.father?.occupation || '',
                officeAddress: p.father?.officeAddress || '',
                homeAddress: p.father?.homeAddress || '',
            },
            mother: {
                name: p.mother?.name || '',
                email: p.mother?.email || '',
                phone: p.mother?.homePhone || '',
                whatsApp: p.mother?.whatsApp || '',
                occupation: p.mother?.occupation || '',
                officeAddress: p.mother?.officeAddress || '',
                homeAddress: p.mother?.homeAddress || '',
            },
        },
    };
};

// ─── 1.1  Get All Students ────────────────────────────────────────────────────

const getAllStudents = async ({ page, limit, search, class: cls, status, schoolingOption, gender }) => {
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(parseInt(limit, 10) || 15, 100);
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    if (search) {
        // Search across both student fields and parent fields via a pipeline,
        // but for simplicity keep the basic approach and include name searches.
        filter.$or = [
            { surname: { $regex: search, $options: 'i' } },
            { firstName: { $regex: search, $options: 'i' } },
            { studentId: { $regex: search, $options: 'i' } },
        ];
    }
    if (cls) filter.class = { $regex: cls, $options: 'i' };
    if (status) filter.status = status;
    if (schoolingOption) filter.schoolingOption = schoolingOption;
    if (gender) filter.gender = gender;

    const [students, total] = await Promise.all([
        Student.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .populate('parent', '-password -__v')
            .lean({ virtuals: true }),
        Student.countDocuments(filter),
    ]);

    return {
        students: students.map(toListItem),
        pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
        },
    };
};

// ─── 1.2  Get Single Student ──────────────────────────────────────────────────

const getStudentById = async (id) => {
    const student = await Student.findOne({ studentId: id.toUpperCase() })
        .populate('parent', '-password -__v')
        .lean({ virtuals: true });

    if (!student) {
        throw new ErrorResponse(`Student with ID '${id}' not found.`, 404);
    }

    return { student: toDetailView(student) };
};

// ─── 1.3  Create Student ──────────────────────────────────────────────────────

/**
 * Registers a new student.
 *
 * Two modes:
 *   Mode A — parentId provided:  validate the parent exists, link it.
 *   Mode B — father + mother provided: create/find the Parent account, link it.
 */
const createStudent = async (body, files, createdBy, ip) => {
    // ── Duplicate check ────────────────────────────────────────────────────
    const existing = await Student.findOne({
        surname: new RegExp(`^${body.surname}$`, 'i'),
        firstName: new RegExp(`^${body.firstName}$`, 'i'),
        dateOfBirth: body.dateOfBirth,
    });

    if (existing) {
        throw new ErrorResponse(
            'A student with the same name and date of birth already exists.',
            409,
            [{ code: 'DUPLICATE_STUDENT' }]
        );
    }

    // ── Resolve parentId ───────────────────────────────────────────────────
    let parentId;

    if (body.parentId) {
        // Mode A: validate existing parent
        const parentDoc = await Parent.findOne({ parentId: body.parentId.toUpperCase() });
        if (!parentDoc) {
            throw new ErrorResponse(
                `Parent '${body.parentId}' not found.`,
                404,
                [{ field: 'parentId', code: 'PARENT_NOT_FOUND' }]
            );
        }
        parentId = parentDoc.parentId;
    } else {
        // Mode B: create parent from father + mother details
        const parentDoc = await createParentAccount(
            body.father,
            body.mother,
            body.correspondenceEmail || body.father.email,
            body.howDidYouKnow || '',
            createdBy
        );
        parentId = parentDoc.parentId;
    }

    // ── Generate student ID ────────────────────────────────────────────────
    const year = new Date().getFullYear();
    const { studentId, serialNumber } = await generateStudentId(year);

    // ── Handle photo upload ────────────────────────────────────────────────
    let photoUrl = null;
    if (files?.photo) {
        photoUrl = await uploadStudentPhoto(files.photo, studentId);
    }

    // ── Create student ─────────────────────────────────────────────────────
    const studentData = {
        studentId,
        serialNumber,
        parentId,
        surname: body.surname,
        firstName: body.firstName,
        middleName: body.middleName || '',
        gender: body.gender,
        dateOfBirth: body.dateOfBirth,
        nationality: body.nationality,
        stateOfOrigin: body.stateOfOrigin,
        localGovernment: body.localGovernment,
        religion: body.religion || '',
        bloodGroup: body.bloodGroup || '',
        genotype: body.genotype || '',
        class: body.class,
        schoolingOption: body.schoolingOption,
        classPreferences: body.classPreferences || {},
        schools: body.schools || [],
        health: body.health || {},
        photo: photoUrl,
        submittedFrom: ip,
        createdBy,
    };

    const student = await Student.create(studentData);

    return {
        student: {
            id: student.studentId,
            parentId: student.parentId,
            surname: student.surname,
            firstName: student.firstName,
            class: student.class,
            status: student.status,
            admissionDate: student.admissionDate,
        },
    };
};


const migrateStudent = async (applicationId, parentId) => {
    const applicant = await Admission.findOne({ applicationId: applicationId.toUpperCase() })
    const year = new Date().getFullYear();
    const { studentId, serialNumber } = await generateStudentId(year);

    console.log({applicant, studentId, serialNumber})

    const studentData = {
        studentId,
        serialNumber,
        parentId,
        surname: applicant.surname,
        firstName: applicant.firstName,
        middleName: applicant.middleName || '',
        gender: applicant.gender,
        dateOfBirth: applicant.dateOfBirth,
        nationality: applicant.nationality,
        stateOfOrigin: applicant.stateOfOrigin,
        localGovernment: applicant.localGovernment,
        religion: applicant.religion || '',
        bloodGroup: applicant.bloodGroup || '',
        genotype: applicant.genotype || '',
        class: applicant?.offer?.class || applicant.classPreferences.classInterestedIn,
        schoolingOption: applicant.schoolingOption,
        classPreferences: applicant.classPreferences || {},
        schools: applicant.schools || [],
        health: applicant.health || {},
        // photo: photoUrl,
        createdBy: "parent",
    };

    const student = await Student.create(studentData);

    return {
        student: {
            id: student.studentId,
            parentId: student.parentId,
            surname: student.surname,
            firstName: student.firstName,
            class: student.class,
            status: student.status,
            admissionDate: student.admissionDate,
        },
    };
}
// ─── 1.4  Update Student ──────────────────────────────────────────────────────

/**
 * Partial update.
 * Parent info is updated via the Parent model, not here.
 * Passing parentId re-links a student to a different parent (admin action).
 */
const updateStudent = async (id, body, files, updatedBy) => {
    const student = await Student.findOne({ studentId: id.toUpperCase() });

    if (!student) {
        throw new ErrorResponse(`Student with ID '${id}' not found.`, 404);
    }

    // Validate new parentId if being changed
    if (body.parentId && body.parentId !== student.parentId) {
        const parentDoc = await Parent.findOne({ parentId: body.parentId.toUpperCase() });
        if (!parentDoc) {
            throw new ErrorResponse(
                `Parent '${body.parentId}' not found.`,
                404,
                [{ field: 'parentId', code: 'PARENT_NOT_FOUND' }]
            );
        }
    }

    // Handle photo replacement
    if (files?.photo) {
        const newPhotoUrl = await uploadStudentPhoto(files.photo, student.studentId);
        if (student.photo) await deleteStudentPhoto(student.photo);
        body.photo = newPhotoUrl;
    }

    // Strip any parent sub-documents that might have been accidentally included
    delete body.father;
    delete body.mother;
    delete body.contact;
    delete body.correspondenceEmail;

    body.lastUpdatedBy = updatedBy;

    const updated = await Student.findOneAndUpdate(
        { studentId: id.toUpperCase() },
        { $set: body },
        { new: true, runValidators: true }
    )
        .populate('parent', '-password -__v')
        .lean({ virtuals: true });

    return { student: toDetailView(updated) };
};

// ─── 1.5  Delete Student ──────────────────────────────────────────────────────

const deleteStudent = async (id) => {
    const student = await Student.findOne({ studentId: id.toUpperCase() });

    if (!student) {
        throw new ErrorResponse(`Student with ID '${id}' not found.`, 404);
    }

    if (student.photo) await deleteStudentPhoto(student.photo);

    await student.deleteOne();
};

// ─── 1.6  Update Status ───────────────────────────────────────────────────────

const updateStudentStatus = async (id, status, reason, updatedBy) => {
    const student = await Student.findOneAndUpdate(
        { studentId: id.toUpperCase() },
        { $set: { status, statusReason: reason || '', lastUpdatedBy: updatedBy } },
        { new: true, runValidators: true }
    );

    if (!student) {
        throw new ErrorResponse(`Student with ID '${id}' not found.`, 404);
    }

    return { id: student.studentId, status: student.status, updatedAt: student.updatedAt };
};

// ─── 1.7  Promote Students ───────────────────────────────────────────────────

const promoteStudents = async (fromClass, toClass, studentIds, session, term, updatedBy) => {
    const upperIds = studentIds.map((id) => id.toUpperCase());

    const result = await Student.updateMany(
        { studentId: { $in: upperIds }, class: fromClass, status: 'Active' },
        { $set: { class: toClass, lastUpdatedBy: updatedBy } }
    );

    const failed = studentIds.length - result.modifiedCount;

    return { promoted: result.modifiedCount, failed, session: session || null };
};

// ─── 1.8  Attendance Summary ──────────────────────────────────────────────────

const getAttendanceSummary = async (id, term, session) => {
    const student = await Student.findOne(
        { studentId: id.toUpperCase() },
        { studentId: 1, attendanceRecords: 1 }
    ).lean();

    if (!student) {
        throw new ErrorResponse(`Student with ID '${id}' not found.`, 404);
    }

    let records = student.attendanceRecords || [];
    if (term) records = records.filter((r) => r.term === term);
    if (session) records = records.filter((r) => r.session === session);

    const totalDays = records.length;
    const daysPresent = records.filter((r) => r.status === 'Present').length;
    const daysAbsent = records.filter((r) => r.status === 'Absent').length;
    const attendancePct = totalDays > 0 ? Math.round((daysPresent / totalDays) * 100) : 0;

    const termLabel = [term, session].filter(Boolean).join(' ') || 'All Terms';

    return {
        studentId: student.studentId,
        term: termLabel,
        totalDays,
        daysPresent,
        daysAbsent,
        attendancePercentage: attendancePct,
        records: records.map(({ date, status, reason }) => ({
            date,
            status,
            ...(reason && { reason }),
        })),
    };
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    getAllStudents,
    getStudentById,
    createStudent,
    migrateStudent,
    updateStudent,
    deleteStudent,
    updateStudentStatus,
    promoteStudents,
    getAttendanceSummary,
};
