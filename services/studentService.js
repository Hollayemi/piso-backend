const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const Student = require('../model/student.model');
const ErrorResponse = require('../utils/errorResponse');

// ─── ID Generation ────────────────────────────────────────────────────────────

/**
 * Finds the next available serial number for the given year and
 * returns a formatted student ID.
 *
 * Format: STU-YYYY-NNNN  (e.g. STU-2025-0047)
 *
 * @param {number} year  - Admission year (defaults to current year)
 * @returns {{ studentId: string, serialNumber: number }}
 */
const generateStudentId = async (year = new Date().getFullYear()) => {
    // Find the highest serial for this admission year
    const yearPrefix = `STU-${year}-`;

    const latest = await Student.findOne(
        { studentId: { $regex: `^${yearPrefix}` } },
        { serialNumber: 1 }
    ).sort({ serialNumber: -1 });

    const nextSerial = latest ? latest.serialNumber + 1 : 1;
    const paddedSerial = String(nextSerial).padStart(4, '0');

    return {
        studentId: `${yearPrefix}${paddedSerial}`,
        serialNumber: nextSerial,
    };
};

// ─── Photo Upload ─────────────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = {
    'image/jpeg': 'jpg',
    'image/jpg':  'jpg',
    'image/png':  'png',
};

const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Validates and saves a student photo to disk.
 * Returns the relative URL path for storage in the DB.
 *
 * @param {object} photoFile  - Express-fileupload file object
 * @param {string} studentId  - Used to name the file
 * @returns {string} photoUrl - e.g. /uploads/students/STU-2025-0001.jpg
 */
const uploadStudentPhoto = async (photoFile, studentId) => {
    if (!ALLOWED_IMAGE_TYPES[photoFile.mimetype]) {
        throw new ErrorResponse(
            'Invalid photo format. Only JPG and PNG are accepted.',
            400
        );
    }
    if (photoFile.size > MAX_PHOTO_SIZE) {
        throw new ErrorResponse('Photo file size must not exceed 5MB.', 400);
    }

    const uploadDir = path.join(__dirname, '../uploads/students');
    await fs.mkdir(uploadDir, { recursive: true });

    const ext = ALLOWED_IMAGE_TYPES[photoFile.mimetype];
    const filename = `${studentId}.${ext}`;
    const filePath = path.join(uploadDir, filename);

    await photoFile.mv(filePath);

    return `/uploads/students/${filename}`;
};

/**
 * Deletes a student photo from disk (best-effort, won't throw on failure).
 *
 * @param {string} photoUrl  - The stored relative URL
 */
const deleteStudentPhoto = async (photoUrl) => {
    if (!photoUrl) return;
    try {
        const filePath = path.join(__dirname, '..', photoUrl);
        await fs.unlink(filePath);
    } catch {
        // Silently swallow — file may have already been deleted
    }
};

// ─── Shape Helpers ────────────────────────────────────────────────────────────

/**
 * Returns the flat response shape for a student list item (1.1).
 */
const toListItem = (doc) => ({
    id:                 doc.studentId,
    surname:            doc.surname,
    firstName:          doc.firstName,
    middleName:         doc.middleName || '',
    gender:             doc.gender,
    dateOfBirth:        doc.dateOfBirth,
    class:              doc.class,
    schoolingOption:    doc.schoolingOption,
    status:             doc.status,
    stateOfOrigin:      doc.stateOfOrigin,
    bloodGroup:         doc.bloodGroup || '',
    genotype:           doc.genotype || '',
    fatherName:         doc.father?.name || '',
    fatherPhone:        doc.father?.homePhone || '',
    motherName:         doc.mother?.name || '',
    motherPhone:        doc.mother?.homePhone || '',
    correspondenceEmail: doc.contact?.correspondenceEmail || '',
    admissionDate:      doc.admissionDate,
    classTeacher:       doc.classTeacher || '',
    fees:               doc.fees ?? {},
    attendance:         doc.attendancePercentage ?? 0,
    photo:              doc.photo ?? null,
});

/**
 * Returns the full detailed response shape for a single student (1.2).
 */
const toDetailView = (doc) => ({
    id:              doc.studentId,
    surname:         doc.surname,
    firstName:       doc.firstName,
    middleName:      doc.middleName || '',
    gender:          doc.gender,
    dateOfBirth:     doc.dateOfBirth,
    class:           doc.class,
    schoolingOption: doc.schoolingOption,
    status:          doc.status,
    statusReason:    doc.statusReason || '',
    stateOfOrigin:   doc.stateOfOrigin,
    localGovernment: doc.localGovernment,
    nationality:     doc.nationality,
    religion:        doc.religion || '',
    bloodGroup:      doc.bloodGroup || '',
    genotype:        doc.genotype || '',

    fatherName:          doc.father?.name,
    fatherPhone:         doc.father?.homePhone,
    fatherOccupation:    doc.father?.occupation,
    fatherOfficeAddress: doc.father?.officeAddress,
    fatherHomeAddress:   doc.father?.homeAddress,
    fatherWhatsApp:      doc.father?.whatsApp,
    fatherEmail:         doc.father?.email,

    motherName:          doc.mother?.name,
    motherPhone:         doc.mother?.homePhone,
    motherOccupation:    doc.mother?.occupation,
    motherOfficeAddress: doc.mother?.officeAddress,
    motherHomeAddress:   doc.mother?.homeAddress,
    motherWhatsApp:      doc.mother?.whatsApp,
    motherEmail:         doc.mother?.email,

    correspondenceEmail: doc.contact?.correspondenceEmail,
    howDidYouKnow:       doc.contact?.howDidYouKnow || '',

    admissionDate:    doc.admissionDate,
    classTeacher:     doc.classTeacher || '',
    classPreferences: doc.classPreferences ?? {},

    fees:             doc.fees ?? {},
    attendance:       doc.attendancePercentage ?? 0,
    health:           doc.health ?? {},
    schools:          doc.schools ?? [],
    photo:            doc.photo ?? null,
});

// ─── Service Methods ──────────────────────────────────────────────────────────

/**
 * 1.1 — Fetch a paginated, filtered list of students.
 *
 * @param {object} query  - Parsed query params from the controller
 */
const getAllStudents = async ({ page, limit, search, class: cls, status, schoolingOption, gender }) => {
    const pageNum  = Math.max(parseInt(page, 10)  || 1, 1);
    const limitNum = Math.min(parseInt(limit, 10) || 15, 100);
    const skip     = (pageNum - 1) * limitNum;

    const filter = {};

    if (search) {
        filter.$or = [
            { surname:    { $regex: search, $options: 'i' } },
            { firstName:  { $regex: search, $options: 'i' } },
            { studentId:  { $regex: search, $options: 'i' } },
        ];
    }
    if (cls)            filter.class           = { $regex: cls, $options: 'i' };
    if (status)         filter.status          = status;
    if (schoolingOption) filter.schoolingOption = schoolingOption;
    if (gender)         filter.gender          = gender;

    const [students, total] = await Promise.all([
        Student.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean({ virtuals: true }),
        Student.countDocuments(filter),
    ]);

    return {
        students:   students.map(toListItem),
        pagination: {
            total,
            page:       pageNum,
            limit:      limitNum,
            totalPages: Math.ceil(total / limitNum),
        },
    };
};

/**
 * 1.2 — Fetch a single student by studentId.
 *
 * @param {string} id  - e.g. "STU-2025-0001"
 */
const getStudentById = async (id) => {
    const student = await Student.findOne({ studentId: id.toUpperCase() }).lean({ virtuals: true });

    if (!student) {
        throw new ErrorResponse(`Student with ID '${id}' not found`, 404);
    }

    return { student: toDetailView(student) };
};

/**
 * 1.3 — Register a new student.
 *
 * @param {object} body     - Validated request body
 * @param {object} files    - express-fileupload files object (may be undefined)
 * @param {string} createdBy - Staff ID of the authenticated user
 * @param {string} ip
 */
const createStudent = async (body, files, createdBy, ip) => {
    // Duplicate check — same full name + DOB
    const existing = await Student.findOne({
        surname:   new RegExp(`^${body.surname}$`, 'i'),
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

    const year = new Date().getFullYear();
    const { studentId, serialNumber } = await generateStudentId(year);

    // Handle optional photo upload
    let photoUrl = null;
    if (files?.photo) {
        photoUrl = await uploadStudentPhoto(files.photo, studentId);
    }

    const studentData = {
        studentId,
        serialNumber,
        surname:         body.surname,
        firstName:       body.firstName,
        middleName:      body.middleName || '',
        gender:          body.gender,
        dateOfBirth:     body.dateOfBirth,
        nationality:     body.nationality,
        stateOfOrigin:   body.stateOfOrigin,
        localGovernment: body.localGovernment,
        religion:        body.religion || '',
        bloodGroup:      body.bloodGroup || '',
        genotype:        body.genotype || '',
        class:           body.class,
        schoolingOption: body.schoolingOption,
        classPreferences: body.classPreferences || {},
        schools:         body.schools || [],
        father:          body.father,
        mother:          body.mother,
        contact: {
            correspondenceEmail: body.correspondenceEmail,
            howDidYouKnow:       body.howDidYouKnow || '',
        },
        health:        body.health || {},
        photo:         photoUrl,
        submittedFrom: ip,
        createdBy,
    };

    const student = await Student.create(studentData);

    return {
        student: {
            id:           student.studentId,
            surname:      student.surname,
            firstName:    student.firstName,
            class:        student.class,
            status:       student.status,
            admissionDate: student.admissionDate,
        },
    };
};

/**
 * 1.4 — Update an existing student record (partial).
 *
 * @param {string} id         - studentId
 * @param {object} body       - Validated partial update body
 * @param {object} files      - express-fileupload files
 * @param {string} updatedBy  - Staff ID of the authenticated user
 */
const updateStudent = async (id, body, files, updatedBy) => {
    const student = await Student.findOne({ studentId: id.toUpperCase() });

    if (!student) {
        throw new ErrorResponse(`Student with ID '${id}' not found`, 404);
    }

    // Handle photo replacement
    if (files?.photo) {
        const newPhotoUrl = await uploadStudentPhoto(files.photo, student.studentId);
        // Remove old photo from disk
        if (student.photo) await deleteStudentPhoto(student.photo);
        body.photo = newPhotoUrl;
    }

    // Re-map flat contact fields into nested contact sub-document
    if (body.correspondenceEmail || body.howDidYouKnow !== undefined) {
        body.contact = {
            correspondenceEmail: body.correspondenceEmail || student.contact.correspondenceEmail,
            howDidYouKnow:       body.howDidYouKnow       ?? student.contact.howDidYouKnow,
        };
        delete body.correspondenceEmail;
        delete body.howDidYouKnow;
    }

    body.lastUpdatedBy = updatedBy;

    const updated = await Student.findOneAndUpdate(
        { studentId: id.toUpperCase() },
        { $set: body },
        { new: true, runValidators: true }
    ).lean({ virtuals: true });

    return { student: toDetailView(updated) };
};

/**
 * 1.5 — Hard-delete a student record and its photo.
 *
 * @param {string} id  - studentId
 */
const deleteStudent = async (id) => {
    const student = await Student.findOne({ studentId: id.toUpperCase() });

    if (!student) {
        throw new ErrorResponse(`Student with ID '${id}' not found`, 404);
    }

    if (student.photo) await deleteStudentPhoto(student.photo);

    await student.deleteOne();
};

/**
 * 1.6 — Update a student's status.
 *
 * @param {string} id     - studentId
 * @param {string} status - New status value
 * @param {string} reason - Optional reason
 * @param {string} updatedBy
 */
const updateStudentStatus = async (id, status, reason, updatedBy) => {
    const student = await Student.findOneAndUpdate(
        { studentId: id.toUpperCase() },
        {
            $set: {
                status,
                statusReason:  reason || '',
                lastUpdatedBy: updatedBy,
            },
        },
        { new: true, runValidators: true }
    );

    if (!student) {
        throw new ErrorResponse(`Student with ID '${id}' not found`, 404);
    }

    return {
        id:        student.studentId,
        status:    student.status,
        updatedAt: student.updatedAt,
    };
};

/**
 * 1.7 — Bulk-promote students from one class to another.
 *
 * @param {string}   fromClass
 * @param {string}   toClass
 * @param {string[]} studentIds
 * @param {string}   session
 * @param {string}   term
 * @param {string}   updatedBy
 */
const promoteStudents = async (fromClass, toClass, studentIds, session, term, updatedBy) => {
    const upperIds = studentIds.map((id) => id.toUpperCase());

    // Only promote students who are currently in fromClass
    const result = await Student.updateMany(
        {
            studentId: { $in: upperIds },
            class:     fromClass,
            status:    'Active',
        },
        {
            $set: {
                class:         toClass,
                lastUpdatedBy: updatedBy,
            },
        }
    );

    const failed = studentIds.length - result.modifiedCount;

    return {
        promoted: result.modifiedCount,
        failed,
        session:  session || null,
    };
};

/**
 * 1.8 — Get attendance summary for a student in a given term/session.
 *
 * @param {string} id      - studentId
 * @param {string} term
 * @param {string} session
 */
const getAttendanceSummary = async (id, term, session) => {
    const student = await Student.findOne(
        { studentId: id.toUpperCase() },
        { studentId: 1, attendanceRecords: 1 }
    ).lean();

    if (!student) {
        throw new ErrorResponse(`Student with ID '${id}' not found`, 404);
    }

    // Filter by term + session if provided
    let records = student.attendanceRecords || [];
    if (term)    records = records.filter((r) => r.term    === term);
    if (session) records = records.filter((r) => r.session === session);

    const totalDays      = records.length;
    const daysPresent    = records.filter((r) => r.status === 'Present').length;
    const daysAbsent     = records.filter((r) => r.status === 'Absent').length;
    const attendancePct  = totalDays > 0 ? Math.round((daysPresent / totalDays) * 100) : 0;

    const termLabel = [term, session].filter(Boolean).join(' ') || 'All Terms';

    return {
        studentId:            student.studentId,
        term:                 termLabel,
        totalDays,
        daysPresent,
        daysAbsent,
        attendancePercentage: attendancePct,
        records:              records.map(({ date, status, reason }) => ({
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
    updateStudent,
    deleteStudent,
    updateStudentStatus,
    promoteStudents,
    getAttendanceSummary,
};
