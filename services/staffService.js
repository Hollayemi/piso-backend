/**
 * staffService.js
 *
 * All database interactions and business logic for the Staff module,
 * including the full payroll sub-module (2.7 – 2.10).
 *
 * Controllers delegate here; this layer is the only place that
 * touches MongoDB directly for staff-related operations.
 */

const path   = require('path');
const fs     = require('fs').promises;
const bcrypt = require('bcryptjs');

const Staff   = require('../model/staff.model');
const Payroll = require('../model/payroll.model');
const { MONTH_NAMES } = require('../model/payroll.model');
const ErrorResponse   = require('../utils/errorResponse');

// ─── Constants ────────────────────────────────────────────────────────────────

/** Nigerian statutory pension contribution rate (employee share) */
const PENSION_RATE = 0.08;

/** Simplified PAYE rate used for demonstration */
const TAX_RATE = 0.05;

const ALLOWED_DOC_TYPES = {
    'image/jpeg':        'jpg',
    'image/jpg':         'jpg',
    'image/png':         'png',
    'application/pdf':   'pdf',
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// ─── ID Generation ────────────────────────────────────────────────────────────

/**
 * Generates the next sequential staff ID.
 * Format: STF-NNNN  (global counter, not year-scoped like students)
 *
 * @returns {{ staffId: string, serialNumber: number }}
 */
const generateStaffId = async () => {
    const latest = await Staff.findOne(
        {},
        { serialNumber: 1 }
    ).sort({ serialNumber: -1 });

    const nextSerial   = latest ? latest.serialNumber + 1 : 1;
    const paddedSerial = String(nextSerial).padStart(4, '0');

    return { staffId: `STF-${paddedSerial}`, serialNumber: nextSerial };
};

// ─── File Uploads ─────────────────────────────────────────────────────────────

/**
 * Saves a single uploaded file (photo, cv, certificate, medicalReport).
 * Returns a document object { filename, path, uploadedAt }.
 *
 * @param {object} file       - express-fileupload file object
 * @param {string} staffId    - Used for naming
 * @param {string} docType    - 'photo' | 'cv' | 'certificate' | 'medicalReport'
 */
const saveFile = async (file, staffId, docType) => {
    if (!ALLOWED_DOC_TYPES[file.mimetype]) {
        throw new ErrorResponse(
            `Invalid file type for ${docType}. Accepted: JPG, PNG, PDF.`,
            400
        );
    }
    if (file.size > MAX_FILE_SIZE) {
        throw new ErrorResponse(`${docType} exceeds the 5 MB size limit.`, 400);
    }

    const ext      = ALLOWED_DOC_TYPES[file.mimetype];
    const subDir   = docType === 'photo' ? 'staff/photos' : 'staff/documents';
    const uploadDir = path.join(__dirname, `../uploads/${subDir}`);

    await fs.mkdir(uploadDir, { recursive: true });

    const filename = `${staffId}_${docType}_${Date.now()}.${ext}`;
    const filePath = path.join(uploadDir, filename);

    await file.mv(filePath);

    return {
        filename,
        path:       `/uploads/${subDir}/${filename}`,
        uploadedAt: new Date(),
    };
};

/**
 * Deletes a file from disk (best-effort — swallows errors).
 */
const removeFile = async (filePath) => {
    if (!filePath) return;
    try {
        await fs.unlink(path.join(__dirname, '..', filePath));
    } catch { /* intentionally silent */ }
};

// ─── Payroll Calculations ─────────────────────────────────────────────────────

/**
 * Derives all payroll figures from a Staff document.
 *
 * @param {object} staff           - Staff Mongoose doc (or plain object)
 * @param {number} otherDeductions - Any extra one-off deduction
 * @returns {object} payrollFigures
 */
const calculatePayroll = (staff, otherDeductions = 0) => {
    const baseSalary         = staff.salary              || 0;
    const transportAllowance = staff.transportAllowance  || 0;
    const housingAllowance   = staff.housingAllowance    || 0;
    const medicalAllowance   = staff.medicalAllowance    || 0;

    const grossPay = baseSalary + transportAllowance + housingAllowance + medicalAllowance;

    const pension        = Math.round(grossPay * PENSION_RATE);
    const tax            = Math.round(grossPay * TAX_RATE);
    const totalDeductions = pension + tax + otherDeductions;
    const netPay         = grossPay - totalDeductions;

    return {
        baseSalary,
        transportAllowance,
        housingAllowance,
        medicalAllowance,
        grossPay,
        pension,
        tax,
        otherDeductions,
        totalDeductions,
        netPay,
    };
};

// ─── Response Shape Helpers ───────────────────────────────────────────────────

/** Compact list-item shape for GET /staff (2.1) */
const toListItem = (doc) => ({
    id:               doc.staffId,
    surname:          doc.surname,
    firstName:        doc.firstName,
    middleName:       doc.middleName || '',
    staffType:        doc.staffType,
    department:       doc.department,
    gender:           doc.gender,
    phone:            doc.phone,
    email:            doc.email,
    qualification:    doc.qualification || '',
    dateOfEmployment: doc.dateOfEmployment,
    dateOfBirth:      doc.dateOfBirth,
    salary:           doc.salary || 0,
    status:           doc.status,
    stateOfOrigin:    doc.stateOfOrigin,
    subjects:         doc.subjects || [],
    class:            doc.assignedClass || '',
    bankAccount: {
        bank:   doc.bankAccount?.bank   || '',
        number: doc.bankAccount?.accountNumber || '',
    },
    photo: doc.photo ?? null,
});

/** Full detail shape for GET /staff/:id (2.2) */
const toDetailView = (doc) => ({
    id:               doc.staffId,
    surname:          doc.surname,
    firstName:        doc.firstName,
    middleName:       doc.middleName || '',
    gender:           doc.gender,
    dateOfBirth:      doc.dateOfBirth,
    maritalStatus:    doc.maritalStatus || '',
    religion:         doc.religion || '',
    nin:              doc.nin || '',
    stateOfOrigin:    doc.stateOfOrigin,
    staffType:        doc.staffType,
    department:       doc.department,
    qualification:    doc.qualification || '',
    specialization:   doc.specialization || '',
    dateOfEmployment: doc.dateOfEmployment,
    employmentType:   doc.employmentType || 'Full-time',
    subjects:         doc.subjects || [],
    class:            doc.assignedClass || '',
    phone:            doc.phone,
    alternativePhone: doc.alternativePhone || '',
    email:            doc.email,
    address:          doc.address || '',
    emergencyContact:  doc.emergencyContact || '',
    emergencyPhone:    doc.emergencyPhone || '',
    emergencyRelation: doc.emergencyRelation || '',
    salary:             doc.salary || 0,
    transportAllowance: doc.transportAllowance || 0,
    housingAllowance:   doc.housingAllowance || 0,
    medicalAllowance:   doc.medicalAllowance || 0,
    grossPay: (
        (doc.salary || 0) +
        (doc.transportAllowance || 0) +
        (doc.housingAllowance || 0) +
        (doc.medicalAllowance || 0)
    ),
    bank:          doc.bankAccount?.bank          || '',
    accountNumber: doc.bankAccount?.accountNumber || '',
    accountName:   doc.bankAccount?.accountName   || '',
    pensionId:     doc.pensionId || '',
    taxId:         doc.taxId || '',
    status:        doc.status,
    statusReason:  doc.statusReason || '',
    returnDate:    doc.returnDate || null,
    photo:         doc.photo ?? null,
});

// ─── 2.1  Get All Staff ───────────────────────────────────────────────────────

const getAllStaff = async ({ page, limit, search, staffType, department, status }) => {
    const pageNum  = Math.max(parseInt(page, 10)  || 1, 1);
    const limitNum = Math.min(parseInt(limit, 10) || 15, 100);
    const skip     = (pageNum - 1) * limitNum;

    const filter = {};

    if (search) {
        filter.$or = [
            { surname:   { $regex: search, $options: 'i' } },
            { firstName: { $regex: search, $options: 'i' } },
            { staffId:   { $regex: search, $options: 'i' } },
        ];
    }
    if (staffType)  filter.staffType  = staffType;
    if (department) filter.department = { $regex: department, $options: 'i' };
    if (status)     filter.status     = status;

    const [staffList, total] = await Promise.all([
        Staff.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean(),
        Staff.countDocuments(filter),
    ]);

    return {
        staff: staffList.map(toListItem),
        pagination: {
            total,
            page:       pageNum,
            limit:      limitNum,
            totalPages: Math.ceil(total / limitNum),
        },
    };
};

// ─── 2.2  Get Single Staff ────────────────────────────────────────────────────

const getStaffById = async (id) => {
    const staff = await Staff.findOne({ staffId: id.toUpperCase() }).lean();

    if (!staff) {
        throw new ErrorResponse(`Staff member with ID '${id}' not found`, 404);
    }

    return { staff: toDetailView(staff) };
};

// ─── 2.3  Create Staff ────────────────────────────────────────────────────────

const createStaff = async (body, files, createdBy, ip) => {
    // Duplicate email check
    const existing = await Staff.findOne({ email: body.email.toLowerCase() });
    if (existing) {
        throw new ErrorResponse(
            `A staff member with email '${body.email}' already exists.`,
            409,
            [{ code: 'DUPLICATE_EMAIL' }]
        );
    }

    const { staffId, serialNumber } = await generateStaffId();

    // Handle file uploads
    let photoPath      = null;
    let cvDoc          = null;
    let certificateDoc = null;
    let medicalDoc     = null;

    if (files) {
        if (files.photo)         photoPath      = (await saveFile(files.photo,         staffId, 'photo')).path;
        if (files.cv)            cvDoc          = await saveFile(files.cv,             staffId, 'cv');
        if (files.certificate)   certificateDoc = await saveFile(files.certificate,    staffId, 'certificate');
        if (files.medicalReport) medicalDoc     = await saveFile(files.medicalReport,  staffId, 'medicalReport');
    }

    // Hash password
    let hashedPassword;
    if (body.password) {
        const salt     = await bcrypt.genSalt(12);
        hashedPassword = await bcrypt.hash(body.password, salt);
    }

    const staffData = {
        staffId,
        serialNumber,
        surname:          body.surname,
        firstName:        body.firstName,
        middleName:       body.middleName || '',
        gender:           body.gender,
        dateOfBirth:      body.dateOfBirth,
        maritalStatus:    body.maritalStatus,
        religion:         body.religion || '',
        nin:              body.nin || '',
        nationality:      body.nationality || 'Nigerian',
        stateOfOrigin:    body.stateOfOrigin,
        localGovernment:  body.localGovernment || '',
        address:          body.address || '',
        phone:            body.phone,
        alternativePhone: body.alternativePhone || '',
        email:            body.email.toLowerCase(),
        emergencyContact:  body.emergencyContact || '',
        emergencyPhone:    body.emergencyPhone || '',
        emergencyRelation: body.emergencyRelation || '',
        staffType:         body.staffType,
        department:        body.department,
        qualification:     body.qualification || '',
        specialization:    body.specialization || '',
        dateOfEmployment:  body.dateOfEmployment,
        employmentType:    body.employmentType || 'Full-time',
        subjects:          body.subjects || [],
        assignedClass:     body.assignedClass || '',
        salary:             body.salary             || 0,
        transportAllowance: body.transportAllowance || 0,
        housingAllowance:   body.housingAllowance   || 0,
        medicalAllowance:   body.medicalAllowance   || 0,
        bankAccount: {
            bank:          body.bank          || '',
            accountNumber: body.accountNumber || '',
            accountName:   body.accountName   || '',
        },
        pensionId:  body.pensionId || '',
        taxId:      body.taxId || '',
        password:   hashedPassword,
        photo:      photoPath,
        documents: {
            cv:            cvDoc,
            certificate:   certificateDoc,
            medicalReport: medicalDoc,
        },
        createdBy,
    };

    const staff = await Staff.create(staffData);

    return {
        staff: {
            id:               staff.staffId,
            surname:          staff.surname,
            firstName:        staff.firstName,
            staffType:        staff.staffType,
            department:       staff.department,
            status:           staff.status,
            dateOfEmployment: staff.dateOfEmployment,
        },
    };
};

// ─── 2.4  Update Staff ────────────────────────────────────────────────────────

const updateStaff = async (id, body, files, updatedBy) => {
    const staff = await Staff.findOne({ staffId: id.toUpperCase() });

    if (!staff) {
        throw new ErrorResponse(`Staff member with ID '${id}' not found`, 404);
    }

    // Email uniqueness check (only when email is being changed)
    if (body.email && body.email.toLowerCase() !== staff.email) {
        const emailTaken = await Staff.findOne({ email: body.email.toLowerCase() });
        if (emailTaken) {
            throw new ErrorResponse(
                `Email '${body.email}' is already in use by another staff member.`,
                409,
                [{ code: 'DUPLICATE_EMAIL' }]
            );
        }
    }

    // File uploads
    if (files) {
        if (files.photo) {
            await removeFile(staff.photo);
            body.photo = (await saveFile(files.photo, staff.staffId, 'photo')).path;
        }
        if (files.cv)            body['documents.cv']            = await saveFile(files.cv,             staff.staffId, 'cv');
        if (files.certificate)   body['documents.certificate']   = await saveFile(files.certificate,    staff.staffId, 'certificate');
        if (files.medicalReport) body['documents.medicalReport']  = await saveFile(files.medicalReport, staff.staffId, 'medicalReport');
    }

    // Re-nest bank fields if provided flat
    if (body.bank || body.accountNumber || body.accountName) {
        body.bankAccount = {
            bank:          body.bank          ?? staff.bankAccount?.bank,
            accountNumber: body.accountNumber ?? staff.bankAccount?.accountNumber,
            accountName:   body.accountName   ?? staff.bankAccount?.accountName,
        };
        delete body.bank;
        delete body.accountNumber;
        delete body.accountName;
    }

    // Hash new password if provided
    if (body.password) {
        const salt    = await bcrypt.genSalt(12);
        body.password = await bcrypt.hash(body.password, salt);
    }

    body.lastUpdatedBy = updatedBy;

    const updated = await Staff.findOneAndUpdate(
        { staffId: id.toUpperCase() },
        { $set: body },
        { new: true, runValidators: true }
    ).lean();

    return { staff: toDetailView(updated) };
};

// ─── 2.5  Delete Staff ────────────────────────────────────────────────────────

const deleteStaff = async (id) => {
    const staff = await Staff.findOne({ staffId: id.toUpperCase() });

    if (!staff) {
        throw new ErrorResponse(`Staff member with ID '${id}' not found`, 404);
    }

    // Remove all associated files
    const cleanupPaths = [
        staff.photo,
        staff.documents?.cv?.path,
        staff.documents?.certificate?.path,
        staff.documents?.medicalReport?.path,
    ];
    await Promise.allSettled(cleanupPaths.map(removeFile));

    await staff.deleteOne();
};

// ─── 2.6  Update Staff Status ─────────────────────────────────────────────────

const updateStaffStatus = async (id, status, reason, returnDate, updatedBy) => {
    const update = {
        status,
        statusReason:  reason || '',
        lastUpdatedBy: updatedBy,
    };

    if (returnDate) update.returnDate = returnDate;

    const staff = await Staff.findOneAndUpdate(
        { staffId: id.toUpperCase() },
        { $set: update },
        { new: true, runValidators: true }
    );

    if (!staff) {
        throw new ErrorResponse(`Staff member with ID '${id}' not found`, 404);
    }

    return {
        id:         staff.staffId,
        status:     staff.status,
        returnDate: staff.returnDate || null,
        updatedAt:  staff.updatedAt,
    };
};

// ─── 2.7  Get Payroll List ────────────────────────────────────────────────────

const getPayrollList = async ({ month, year, department, payStatus, page, limit }) => {
    const pageNum  = Math.max(parseInt(page, 10)  || 1, 1);
    const limitNum = Math.min(parseInt(limit, 10) || 15, 100);
    const skip     = (pageNum - 1) * limitNum;

    const filter = {
        month: parseInt(month, 10),
        year:  parseInt(year, 10),
    };

    if (department) filter.department = { $regex: department, $options: 'i' };
    if (payStatus)  filter.payStatus  = payStatus;

    const [records, total] = await Promise.all([
        Payroll.find(filter)
            .sort({ department: 1, surname: 1 })
            .skip(skip)
            .limit(limitNum)
            .lean(),
        Payroll.countDocuments(filter),
    ]);

    // Summary aggregation for the requested month/year
    const [summary] = await Payroll.aggregate([
        { $match: { month: parseInt(month, 10), year: parseInt(year, 10) } },
        {
            $group: {
                _id:             null,
                totalGross:      { $sum: '$grossPay' },
                totalNet:        { $sum: '$netPay' },
                totalDeductions: { $sum: '$totalDeductions' },
                staffPaid:       { $sum: { $cond: [{ $eq: ['$payStatus', 'Paid'] }, 1, 0] } },
                staffPending:    { $sum: { $cond: [{ $ne:  ['$payStatus', 'Paid'] }, 1, 0] } },
            },
        },
    ]);

    return {
        month:    MONTH_NAMES[parseInt(month, 10)],
        year:     parseInt(year, 10),
        summary:  summary
            ? { totalGross: summary.totalGross, totalNet: summary.totalNet,
                totalDeductions: summary.totalDeductions,
                staffPaid: summary.staffPaid, staffPending: summary.staffPending }
            : { totalGross: 0, totalNet: 0, totalDeductions: 0, staffPaid: 0, staffPending: 0 },
        payroll: records,
        pagination: {
            total,
            page:       pageNum,
            limit:      limitNum,
            totalPages: Math.ceil(total / limitNum),
        },
    };
};

// ─── 2.8  Process Payroll — Single ────────────────────────────────────────────

/**
 * Computes and saves a payroll record for one staff member.
 * Idempotent for the same staffId+month+year — updates if already processed.
 */
const processPayroll = async (staffId, { month, year, note, otherDeductions }, processedBy) => {
    const staff = await Staff.findOne({ staffId: staffId.toUpperCase() }).lean();

    if (!staff) {
        throw new ErrorResponse(`Staff member with ID '${staffId}' not found`, 404);
    }

    if (staff.status === 'Inactive') {
        throw new ErrorResponse(
            `Cannot process payroll for inactive staff member '${staffId}'.`,
            400
        );
    }

    const figures = calculatePayroll(staff, otherDeductions || 0);

    const payDate    = new Date();
    const monthCode  = MONTH_NAMES[month].toUpperCase().slice(0, 3);
    const reference  = `PAY-${staff.staffId}-${monthCode}${year}`;

    const payrollData = {
        reference,
        staffId:   staff.staffId,
        staffName: [staff.surname, staff.firstName, staff.middleName].filter(Boolean).join(' '),
        staffType: staff.staffType,
        department: staff.department,
        month,
        year,
        ...figures,
        bank:          staff.bankAccount?.bank          || '',
        accountNumber: staff.bankAccount?.accountNumber || '',
        payStatus:   'Paid',
        payDate,
        note:        note || '',
        processedBy,
    };

    // Upsert — safe to re-process (e.g. corrections)
    const record = await Payroll.findOneAndUpdate(
        { staffId: staff.staffId, month, year },
        { $set: payrollData },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    );

    return {
        staffId:   record.staffId,
        netPay:    record.netPay,
        payStatus: record.payStatus,
        payDate:   record.payDate,
        reference: record.reference,
    };
};

// ─── 2.9  Process Payroll — Batch ─────────────────────────────────────────────

const batchProcessPayroll = async ({ staffIds, month, year, note }, processedBy) => {
    const upperIds = staffIds.map((id) => id.toUpperCase());

    const results = [];
    let totalDisburse = 0;
    let failed        = 0;

    // Process sequentially to keep the audit trail clean and avoid race conditions
    for (const id of upperIds) {
        try {
            const result = await processPayroll(id, { month, year, note }, processedBy);
            results.push({ staffId: result.staffId, status: result.payStatus, netPay: result.netPay });
            totalDisburse += result.netPay;
        } catch (err) {
            failed++;
            results.push({ staffId: id, status: 'Failed', error: err.message });
        }
    }

    return {
        processed:    results.filter((r) => r.status === 'Paid').length,
        failed,
        totalDisburse,
        results,
    };
};

// ─── 2.10  Get Payslip ────────────────────────────────────────────────────────

const getPayslip = async (staffId, month, year) => {
    const record = await Payroll.findOne({
        staffId: staffId.toUpperCase(),
        month:   parseInt(month, 10),
        year:    parseInt(year, 10),
    }).lean();

    if (!record) {
        throw new ErrorResponse(
            `No payslip found for staff '${staffId}' for ${MONTH_NAMES[month]} ${year}.`,
            404
        );
    }

    return {
        payslip: {
            staffId:    record.staffId,
            staffName:  record.staffName,
            staffType:  record.staffType,
            department: record.department,
            month:      record.monthName,
            year:       record.year,
            earnings: {
                baseSalary:         record.baseSalary,
                transportAllowance: record.transportAllowance,
                housingAllowance:   record.housingAllowance,
                medicalAllowance:   record.medicalAllowance,
                grossPay:           record.grossPay,
            },
            deductions: {
                pension:          record.pension,
                tax:              record.tax,
                other:            record.otherDeductions,
                totalDeductions:  record.totalDeductions,
            },
            netPay:        record.netPay,
            bank:          record.bank,
            accountNumber: record.accountNumber,
            payStatus:     record.payStatus,
            payDate:       record.payDate,
            reference:     record.reference,
        },
    };
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    getAllStaff,
    getStaffById,
    createStaff,
    updateStaff,
    deleteStaff,
    updateStaffStatus,
    getPayrollList,
    processPayroll,
    batchProcessPayroll,
    getPayslip,
};
