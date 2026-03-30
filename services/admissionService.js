const path = require('path');
const fs = require('fs').promises;

const Admission = require('../model/admission.model');
const parentService = require("./parentAuthService")
const ErrorResponse = require('../utils/errorResponse');

// ─── ID Generation ────────────────────────────────────────────────────────────

const generateApplicationId = async () => {
    const year = new Date().getFullYear();
    const prefix = `APP-${year}-`;

    const latest = await Admission.findOne(
        { applicationId: { $regex: `^${prefix}` } },
        { serialNumber: 1 }
    ).sort({ serialNumber: -1 });

    const nextSerial = latest ? latest.serialNumber + 1 : 1;
    const paddedSerial = String(nextSerial).padStart(4, '0');

    return { applicationId: `${prefix}${paddedSerial}`, serialNumber: nextSerial };
};

const generateOfferId = async () => {
    const year = new Date().getFullYear();
    const prefix = `OFR-${year}-`;

    const count = await Admission.countDocuments({
        'offer.offerId': { $regex: `^${prefix}` },
    });

    return `${prefix}${String(count + 1).padStart(4, '0')}`;
};

// ─── File Upload Helpers ──────────────────────────────────────────────────────

const ALLOWED_DOC_TYPES = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'application/pdf': 'pdf',
};
const MAX_DOC_SIZE = 5 * 1024 * 1024; // 5 MB

const DOC_FIELDS = [
    'birthCertificate',
    'formerSchoolReport',
    'proofOfPayment',
    'immunizationCertificate',
    'medicalReport',
];

const saveDocuments = async (files = {}, appId) => {
    const saved = {};
    const uploadDir = path.join(__dirname, '../../uploads/admissions');

    await fs.mkdir(uploadDir, { recursive: true });

    for (const field of DOC_FIELDS) {
        const file = files[field];
        if (!file) continue;

        if (!ALLOWED_DOC_TYPES[file.mimetype]) {
            throw new ErrorResponse(
                `Invalid file type for ${field}. Accepted: JPG, PNG, PDF.`,
                400,
                [{ field, message: 'Invalid file type' }]
            );
        }
        if (file.size > MAX_DOC_SIZE) {
            throw new ErrorResponse(
                `${field} exceeds the 5 MB size limit.`,
                400,
                [{ field, message: 'File too large' }]
            );
        }

        const ext = ALLOWED_DOC_TYPES[file.mimetype];
        const filename = `${appId}_${field}_${Date.now()}.${ext}`;
        const filePath = path.join(uploadDir, filename);

        await file.mv(filePath);

        saved[field] = {
            filename,
            path: `/uploads/admissions/${filename}`,
            uploadedAt: new Date(),
        };
    }

    return saved;
};

// ─── Shape Helpers ────────────────────────────────────────────────────────────

const buildDocFlags = (documents = {}) => ({
    birthCertificate: !!(documents.birthCertificate?.filename),
    formerSchoolReport: !!(documents.formerSchoolReport?.filename),
    proofOfPayment: !!(documents.proofOfPayment?.filename),
    immunizationCard: !!(documents.immunizationCertificate?.filename),
    medicalReport: !!(documents.medicalReport?.filename),
});

const toListItem = (doc) => ({
    id: doc.applicationId,
    firstName: doc.firstName,
    surname: doc.surname,
    email: doc.correspondenceEmail,
    phone: doc.parentId.father?.homePhone || '',
    appliedClass: doc.classPreferences?.classInterestedIn || '',
    schoolingOption: doc.schoolingOption,
    dateApplied: doc.dateApplied,
    status: doc.status,
    gender: doc.gender,
    stateOfOrigin: doc.stateOfOrigin,
    docsSubmitted: Object.values(doc.documents || {}).some((d) => d && d.filename),
    reviewedBy: doc.reviewedBy || null,
    enrolledStudentId: doc.enrolledStudentId || null,
});

const toDetailView = (doc) => ({
    id: doc.applicationId,
    firstName: doc.firstName,
    surname: doc.surname,
    middleName: doc.middleName || '',
    dateOfBirth: doc.dateOfBirth,
    gender: doc.gender,
    bloodGroup: doc.bloodGroup || '',
    genotype: doc.genotype || '',
    nationality: doc.nationality,
    stateOfOrigin: doc.stateOfOrigin,
    localGovernment: doc.localGovernment,
    schoolingOption: doc.schoolingOption,
    classPreferences: doc.classPreferences,
    father: doc.father,
    mother: doc.mother,
    schools: doc.schools || [],
    health: doc.health,
    correspondenceEmail: doc.correspondenceEmail,
    howDidYouKnow: doc.howDidYouKnow || '',
    phone: doc.father?.homePhone || '',
    appliedClass: doc.classPreferences?.classInterestedIn || '',
    dateApplied: doc.dateApplied,
    status: doc.status,
    reviewedBy: doc.reviewedBy || null,
    adminNotes: doc.adminNotes || '',
    documents: buildDocFlags(doc.documents),
    screening: doc.screening,
    offer: doc.offer,
    enrolledStudentId: doc.enrolledStudentId || null,
    enrolledParentId: doc.enrolledParentId || null,
});

const toScreeningItem = (doc) => ({
    id: doc.applicationId,
    firstName: doc.firstName,
    surname: doc.surname,
    appliedClass: doc.classPreferences?.classInterestedIn || '',
    schoolingOption: doc.schoolingOption,
    gender: doc.gender,
    screeningStatus: doc.screening?.screeningStatus || 'Pending',
    assignedOfficer: doc.screening?.assignedOfficer || null,
    notes: doc.screening?.notes || '',
    docs: buildDocFlags(doc.documents),
    dateApplied: doc.dateApplied,
});

const toOfferItem = (doc) => ({
    id: doc.applicationId,
    offerId: doc.offer?.offerId || '',
    firstName: doc.firstName,
    surname: doc.surname,
    email: doc.correspondenceEmail,
    phone: doc.father?.homePhone || '',
    appliedClass: doc.classPreferences?.classInterestedIn || '',
    schoolingOption: doc.schoolingOption,
    offerSent: doc.offer?.offerSent || false,
    offerDate: doc.offer?.offerDate || null,
    acceptanceDeadline: doc.offer?.acceptanceDeadline || null,
    acceptanceStatus: doc.offer?.acceptanceStatus || 'Not Sent',
    emailSent: doc.offer?.emailSent || false,
    pdfGenerated: doc.offer?.pdfGenerated || false,
    gender: doc.gender,
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1.1  GET /admissions
// ═══════════════════════════════════════════════════════════════════════════════

const getAllApplications = async ({
    page, limit, search, status, appliedClass, schoolingOption, dateFrom,
} = {}) => {
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(parseInt(limit, 10) || 12, 100);
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    if (search) {
        filter.$or = [
            { surname: { $regex: search, $options: 'i' } },
            { firstName: { $regex: search, $options: 'i' } },
            { applicationId: { $regex: search, $options: 'i' } },
            { correspondenceEmail: { $regex: search, $options: 'i' } },
        ];
    }
    if (status) filter.status = status;
    if (schoolingOption) filter.schoolingOption = schoolingOption;
    if (appliedClass) {
        filter['classPreferences.classInterestedIn'] = { $regex: appliedClass, $options: 'i' };
    }
    if (dateFrom) {
        filter.dateApplied = { $gte: new Date(dateFrom) };
    }

    const [applications, total] = await Promise.all([
        Admission.find(filter).sort({ dateApplied: -1 }).skip(skip).limit(limitNum).lean({ virtuals: true }).populate("parentId"),
        Admission.countDocuments(filter),
    ]);

    const [statsAgg] = await Admission.aggregate([
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                pending: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
                underReview: { $sum: { $cond: [{ $eq: ['$status', 'Under Review'] }, 1, 0] } },
                approvedForScreening: { $sum: { $cond: [{ $eq: ['$status', 'Approved for Screening'] }, 1, 0] } },
                rejected: { $sum: { $cond: [{ $eq: ['$status', 'Rejected'] }, 1, 0] } },
            },
        },
        {
            $lookup: {
                from: "parents",
                localField: "parentId",
                foreignField: "_id",
                as: "parent"
            }
        }
    ]);

    console.log(applications[0])

    const stats = statsAgg
        ? { total: statsAgg.total, pending: statsAgg.pending, underReview: statsAgg.underReview, approvedForScreening: statsAgg.approvedForScreening, rejected: statsAgg.rejected }
        : { total: 0, pending: 0, underReview: 0, approvedForScreening: 0, rejected: 0 };

    return {
        applications: applications.map(toListItem),
        pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
        stats,
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1.2  GET /admissions/:id
// ═══════════════════════════════════════════════════════════════════════════════

const getApplication = async (id) => {
    const application = await Admission.findOne({ applicationId: id.toUpperCase() })
        .lean({ virtuals: true }).populate('parentId');

    console.log(application)

    if (!application) {
        throw new ErrorResponse(`Application '${id}' not found`, 404, [{ code: 'NOT_FOUND' }]);
    }

    return { application: toDetailView(application) };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1.3  POST /admissions  (public)
// ═══════════════════════════════════════════════════════════════════════════════

const submitApplication = async (body, files = {}, ip = '') => {
    // Duplicate check — same name + DOB
    const existing = await Admission.findOne({
        surname: new RegExp(`^${body.surname}$`, 'i'),
        firstName: new RegExp(`^${body.firstName}$`, 'i'),
        dateOfBirth: new Date(body.dateOfBirth),
    });

    if (existing) {
        throw new ErrorResponse(
            'An application for a child with this name and date of birth already exists.',
            409,
            [{ code: 'DUPLICATE_APPLICATION' }]
        );
    }

    const { applicationId, serialNumber } = await generateApplicationId();
    const savedDocs = await saveDocuments(files, applicationId);

    const parentInfo = await parentService.createParentAccount(
        body.father,
        body.mother,
        body.correspondenceEmail,
        body.howDidYouKnow,
    )

    const admission = await Admission.create({
        applicationId,
        parentId: parentInfo._id,
        serialNumber,
        surname: body.surname,
        firstName: body.firstName,
        middleName: body.middleName || '',
        dateOfBirth: body.dateOfBirth,
        gender: body.gender,
        bloodGroup: body.bloodGroup || '',
        genotype: body.genotype || '',
        nationality: body.nationality,
        stateOfOrigin: body.stateOfOrigin,
        localGovernment: body.localGovernment,
        schoolingOption: body.schoolingOption,
        classPreferences: body.classPreferences || {},
        correspondenceEmail: body.correspondenceEmail,
        howDidYouKnow: body.howDidYouKnow || '',
        schools: body.schools || [],
        health: body.health || {},
        documents: savedDocs,
        submittedFrom: ip,
    });

    return {
        applicationRef: admission.applicationId,
        firstName: admission.firstName,
        surname: admission.surname,
        appliedClass: admission.classPreferences?.classInterestedIn || '',
        status: admission.status,
        dateApplied: admission.dateApplied,
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1.4  PATCH /admissions/:id/status
// ═══════════════════════════════════════════════════════════════════════════════

const updateApplicationStatus = async (id, body, updatedBy) => {
    const admission = await Admission.findOne({ applicationId: id.toUpperCase() });

    if (!admission) {
        throw new ErrorResponse(`Application '${id}' not found`, 404, [{ code: 'NOT_FOUND' }]);
    }

    const update = { status: body.status, lastUpdatedBy: updatedBy };
    if (body.reviewedBy !== undefined) update.reviewedBy = body.reviewedBy;
    if (body.adminNotes !== undefined) update.adminNotes = body.adminNotes;

    if (body.status === 'Approved for Screening' && !admission.screening?.screeningStatus) {
        update['screening.screeningStatus'] = 'Pending';
        update['screening.updatedAt'] = new Date();
    }

    const updated = await Admission.findOneAndUpdate(
        { applicationId: id.toUpperCase() },
        { $set: update },
        { new: true, runValidators: true }
    ).lean();

    return { id: updated.applicationId, status: updated.status, reviewedBy: updated.reviewedBy || null };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1.5  DELETE /admissions/:id
// ═══════════════════════════════════════════════════════════════════════════════

const deleteApplication = async (id) => {
    const admission = await Admission.findOne({ applicationId: id.toUpperCase() });

    if (!admission) {
        throw new ErrorResponse(`Application '${id}' not found`, 404, [{ code: 'NOT_FOUND' }]);
    }

    const docFiles = Object.values(admission.documents || {}).filter(Boolean);
    await Promise.allSettled(
        docFiles.map(async (d) => {
            if (!d.path) return;
            try { await fs.unlink(path.join(__dirname, '../..', d.path)); } catch { /* silent */ }
        })
    );

    await admission.deleteOne();
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1.6  GET /admissions/screening
// ═══════════════════════════════════════════════════════════════════════════════

const getScreeningList = async ({ page, limit, search, screeningStatus } = {}) => {
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(parseInt(limit, 10) || 12, 100);
    const skip = (pageNum - 1) * limitNum;

    const filter = { status: 'Approved for Screening' };

    if (search) {
        filter.$or = [
            { surname: { $regex: search, $options: 'i' } },
            { firstName: { $regex: search, $options: 'i' } },
            { applicationId: { $regex: search, $options: 'i' } },
        ];
    }
    if (screeningStatus) filter['screening.screeningStatus'] = screeningStatus;

    const [applicants, total] = await Promise.all([
        Admission.find(filter).sort({ dateApplied: -1 }).skip(skip).limit(limitNum).lean(),
        Admission.countDocuments(filter),
    ]);

    const [statsAgg] = await Admission.aggregate([
        { $match: { status: 'Approved for Screening' } },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                pending: { $sum: { $cond: [{ $eq: ['$screening.screeningStatus', 'Pending'] }, 1, 0] } },
                verified: { $sum: { $cond: [{ $eq: ['$screening.screeningStatus', 'Verified'] }, 1, 0] } },
                rejected: { $sum: { $cond: [{ $eq: ['$screening.screeningStatus', 'Rejected'] }, 1, 0] } },
                assigned: {
                    $sum: { $cond: [{ $and: [{ $ne: ['$screening.assignedOfficer', ''] }, { $ne: ['$screening.assignedOfficer', null] }] }, 1, 0] },
                },
            },
        },
    ]);

    const stats = statsAgg
        ? { total: statsAgg.total, pending: statsAgg.pending, verified: statsAgg.verified, rejected: statsAgg.rejected, assigned: statsAgg.assigned }
        : { total: 0, pending: 0, verified: 0, rejected: 0, assigned: 0 };

    return {
        applicants: applicants.map(toScreeningItem),
        pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
        stats,
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1.7  PUT /admissions/:id/screening
// ═══════════════════════════════════════════════════════════════════════════════

const updateScreeningRecord = async (id, body, updatedBy) => {
    const admission = await Admission.findOne({ applicationId: id.toUpperCase() });

    if (!admission) {
        throw new ErrorResponse(`Application '${id}' not found`, 404, [{ code: 'NOT_FOUND' }]);
    }

    if (admission.status !== 'Approved for Screening') {
        throw new ErrorResponse(
            `Application '${id}' is not at the screening stage (current: ${admission.status}).`,
            400,
            [{ code: 'INVALID_STATUS' }]
        );
    }

    const screeningUpdate = {
        'screening.screeningStatus': body.screeningStatus,
        'screening.updatedAt': new Date(),
        lastUpdatedBy: updatedBy,
    };

    if (body.assignedOfficer !== undefined) screeningUpdate['screening.assignedOfficer'] = body.assignedOfficer;
    if (body.notes !== undefined) screeningUpdate['screening.notes'] = body.notes;

    if (body.docs && typeof body.docs === 'object') {
        for (const [key, val] of Object.entries(body.docs)) {
            screeningUpdate[`screening.docs.${key}`] = val;
        }
    }

    const updated = await Admission.findOneAndUpdate(
        { applicationId: id.toUpperCase() },
        { $set: screeningUpdate },
        { new: true, runValidators: true }
    ).lean();

    return {
        id: updated.applicationId,
        screeningStatus: updated.screening.screeningStatus,
        assignedOfficer: updated.screening.assignedOfficer || null,
        notes: updated.screening.notes || '',
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1.8  GET /admissions/offers
// ═══════════════════════════════════════════════════════════════════════════════

const getOffersList = async ({ page, limit, search, acceptanceStatus } = {}) => {
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(parseInt(limit, 10) || 12, 100);
    const skip = (pageNum - 1) * limitNum;

    // const filter = { 'offer.offerId': { $ne: '' } };
    const filter = { 'screening.screeningStatus': "Verified" };

    if (search) {
        filter.$or = [
            { surname: { $regex: search, $options: 'i' } },
            { firstName: { $regex: search, $options: 'i' } },
            { applicationId: { $regex: search, $options: 'i' } },
        ];
    }
    if (acceptanceStatus) filter['offer.acceptanceStatus'] = acceptanceStatus;

    const [offers, total] = await Promise.all([
        Admission.find(filter).sort({ 'offer.offerDate': -1 }).skip(skip).limit(limitNum).lean(),
        Admission.countDocuments(filter),
    ]);

    const [statsAgg] = await Admission.aggregate([
        { $match: { "screening.screeningStatus": "Verified"} },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                sent: { $sum: { $cond: [{ $eq: ['$offer.offerSent', true] }, 1, 0] } },
                accepted: { $sum: { $cond: [{ $eq: ['$offer.acceptanceStatus', 'Accepted'] }, 1, 0] } },
                pending: { $sum: { $cond: [{ $eq: ['$offer.acceptanceStatus', 'Pending'] }, 1, 0] } },
                declined: { $sum: { $cond: [{ $eq: ['$offer.acceptanceStatus', 'Declined'] }, 1, 0] } },
            },
        },
    ]);

    const stats = statsAgg
        ? { total: statsAgg.total, sent: statsAgg.sent, accepted: statsAgg.accepted, pending: statsAgg.pending, declined: statsAgg.declined }
        : { total: 0, sent: 0, accepted: 0, pending: 0, declined: 0 };

    return {
        offers: offers.map(toOfferItem),
        pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
        stats,
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1.9  POST /admissions/:id/offer
// ═══════════════════════════════════════════════════════════════════════════════

const sendOfferLetter = async (id, body, sentBy) => {
    const admission = await Admission.findOne({ applicationId: id.toUpperCase() });

    if (!admission) {
        throw new ErrorResponse(`Application '${id}' not found`, 404, [{ code: 'NOT_FOUND' }]);
    }

    if (admission.screening?.screeningStatus !== 'Verified') {
        throw new ErrorResponse(
            `Cannot send offer, screening status is '${admission.screening?.screeningStatus || 'Pending'}'. Must be 'Verified'.`,
            400,
            [{ code: 'NOT_VERIFIED' }]
        );
    }

    const deadline = new Date(body.acceptanceDeadline);
    if (isNaN(deadline.getTime()) || deadline <= new Date()) {
        throw new ErrorResponse('Acceptance deadline must be a valid future date.', 400, [
            { field: 'acceptanceDeadline', code: 'INVALID_DEADLINE' },
        ]);
    }

    if (admission.offer?.offerSent && !body.resend) {
        throw new ErrorResponse(
            'Offer letter has already been sent. Pass resend: true to send again.',
            409,
            [{ code: 'OFFER_ALREADY_SENT' }]
        );
    }

    const offerId = admission.offer?.offerId || (await generateOfferId());
    const offerDate = new Date();
    const sentAt = new Date();

    const offerUpdate = {
        'offer.offerId': offerId,
        'offer.offerSent': true,
        'offer.offerDate': offerDate,
        'offer.acceptanceDeadline': deadline,
        'offer.emailSent': true,
        'offer.pdfGenerated': true,
        'offer.acceptanceStatus': 'Pending',
        'offer.sentAt': sentAt,
        'offer.updatedAt': sentAt,
        lastUpdatedBy: sentBy,
    };

    const updated = await Admission.findOneAndUpdate(
        { applicationId: id.toUpperCase() },
        { $set: offerUpdate },
        { new: true }
    ).lean();

    return {
        offerId: updated.offer.offerId,
        id: updated.applicationId,
        emailSent: updated.offer.emailSent,
        pdfGenerated: updated.offer.pdfGenerated,
        offerDate: updated.offer.offerDate,
        acceptanceDeadline: updated.offer.acceptanceDeadline,
        acceptanceStatus: updated.offer.acceptanceStatus,
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1.10  PATCH /admissions/:id/offer/status
// ═══════════════════════════════════════════════════════════════════════════════

const updateOfferAcceptanceStatus = async (id, acceptanceStatus, updatedBy) => {
    const admission = await Admission.findOne({ applicationId: id.toUpperCase() });

    if (!admission) {
        throw new ErrorResponse(`Application '${id}' not found`, 404, [{ code: 'NOT_FOUND' }]);
    }

    if (!admission.offer?.offerSent) {
        throw new ErrorResponse(
            `No offer has been sent for application '${id}' yet.`,
            400,
            [{ code: 'NO_OFFER_SENT' }]
        );
    }

    const updated = await Admission.findOneAndUpdate(
        { applicationId: id.toUpperCase() },
        { $set: { 'offer.acceptanceStatus': acceptanceStatus, 'offer.updatedAt': new Date(), lastUpdatedBy: updatedBy } },
        { new: true }
    ).lean();

    return { id: updated.applicationId, offerId: updated.offer.offerId, acceptanceStatus: updated.offer.acceptanceStatus };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1.11  GET /admissions/stats
// ═══════════════════════════════════════════════════════════════════════════════

const getAdmissionsStats = async () => {
    const [pipelineAgg] = await Admission.aggregate([
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                pending: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
                underReview: { $sum: { $cond: [{ $eq: ['$status', 'Under Review'] }, 1, 0] } },
                approvedForScreening: { $sum: { $cond: [{ $eq: ['$status', 'Approved for Screening'] }, 1, 0] } },
                rejected: { $sum: { $cond: [{ $eq: ['$status', 'Rejected'] }, 1, 0] } },
            },
        },
    ]);

    const [screeningAgg] = await Admission.aggregate([
        { $match: { status: 'Approved for Screening' } },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                pending: { $sum: { $cond: [{ $eq: ['$screening.screeningStatus', 'Pending'] }, 1, 0] } },
                verified: { $sum: { $cond: [{ $eq: ['$screening.screeningStatus', 'Verified'] }, 1, 0] } },
                rejected: { $sum: { $cond: [{ $eq: ['$screening.screeningStatus', 'Rejected'] }, 1, 0] } },
            },
        },
    ]);

    const [offerAgg] = await Admission.aggregate([
        { $match: { 'offer.offerId': { $ne: '' } } },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                sent: { $sum: { $cond: [{ $eq: ['$offer.offerSent', true] }, 1, 0] } },
                accepted: { $sum: { $cond: [{ $eq: ['$offer.acceptanceStatus', 'Accepted'] }, 1, 0] } },
                pending: { $sum: { $cond: [{ $eq: ['$offer.acceptanceStatus', 'Pending'] }, 1, 0] } },
                declined: { $sum: { $cond: [{ $eq: ['$offer.acceptanceStatus', 'Declined'] }, 1, 0] } },
            },
        },
    ]);

    const offerTotal = offerAgg?.total || 0;
    const offerAccepted = offerAgg?.accepted || 0;
    const acceptanceRate = offerTotal > 0 ? Math.round((offerAccepted / offerTotal) * 100) : 0;

    return {
        pipeline: pipelineAgg
            ? { total: pipelineAgg.total, pending: pipelineAgg.pending, underReview: pipelineAgg.underReview, approvedForScreening: pipelineAgg.approvedForScreening, rejected: pipelineAgg.rejected }
            : { total: 0, pending: 0, underReview: 0, approvedForScreening: 0, rejected: 0 },
        screening: screeningAgg
            ? { total: screeningAgg.total, pending: screeningAgg.pending, verified: screeningAgg.verified, rejected: screeningAgg.rejected }
            : { total: 0, pending: 0, verified: 0, rejected: 0 },
        offers: { total: offerTotal, sent: offerAgg?.sent || 0, accepted: offerAccepted, pending: offerAgg?.pending || 0, declined: offerAgg?.declined || 0, acceptanceRate },
    };
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    getAllApplications,
    getApplication,
    submitApplication,
    updateApplicationStatus,
    deleteApplication,
    getScreeningList,
    updateScreeningRecord,
    getOffersList,
    sendOfferLetter,
    updateOfferAcceptanceStatus,
    getAdmissionsStats,
};
