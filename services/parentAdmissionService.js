/**
 * services/parentAdmissionService.js
 *
 * Business logic for the Parent Admission module.
 *
 *   GET    /parent/admissions         → getMyApplications
 *   GET    /parent/admissions/:id     → getMyApplication
 *   POST   /parent/admissions         → submitApplicationAsParent
 *   PATCH  /parent/admissions/:id/offer → respondToOffer
 */

const path = require('path');
const fs = require('fs').promises;

const Admission = require('../model/admission.model');
const Parent = require('../model/parent.model');
const studentService = require('./studentService')
const ErrorResponse = require('../utils/errorResponse');

// ─── Application ID generator ─────────────────────────────────────────────────

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

// ─── Document upload helpers ──────────────────────────────────────────────────

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
    const uploadDir = path.join(__dirname, '../uploads/admissions');
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
            throw new ErrorResponse(`${field} exceeds the 5 MB size limit.`, 400);
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

// ─── Response shape helpers ───────────────────────────────────────────────────

const toDocFlags = (documents = {}) => ({
    birthCertificate: !!(documents.birthCertificate?.filename),
    formerSchoolReport: !!(documents.formerSchoolReport?.filename),
    proofOfPayment: !!(documents.proofOfPayment?.filename),
    immunizationCard: !!(documents.immunizationCertificate?.filename),
    medicalReport: !!(documents.medicalReport?.filename),
});

/**
 * Shapes an Admission document into the response a parent sees.
 * Returns the full pipeline including screening + offer details.
 */
const toParentView = (doc) => {
    const hasScreening = doc.status === 'Approved for Screening' ||
        doc.screening?.screeningStatus !== 'Pending' ||
        doc.screening?.assignedOfficer;

    const offerSent = doc.offer?.offerSent === true;

    return {
        id: doc.applicationId,
        studentName: `${doc.surname} ${doc.firstName}`,
        firstName: doc.firstName,
        surname: doc.surname,
        middleName: doc.middleName || '',
        dateOfBirth: doc.dateOfBirth,
        gender: doc.gender,
        bloodGroup: doc.bloodGroup || '',
        genotype: doc.genotype || '',
        classApplied: doc.classPreferences?.classInterestedIn || '',
        currentClass: doc.classPreferences?.presentClass || '',
        schoolingOption: doc.schoolingOption,
        submittedAt: doc.dateApplied,
        lastUpdated: doc.updatedAt,
        status: doc.status,
        adminNotes: doc.adminNotes || '',
        documents: toDocFlags(doc.documents),
        docsSubmitted: Object.values(toDocFlags(doc.documents)).some(Boolean),

        // Screening panel — only populated once the app reaches that stage
        screening: hasScreening
            ? {
                status: doc.screening?.screeningStatus || 'Pending',
                assignedOfficer: doc.screening?.assignedOfficer || null,
                notes: doc.screening?.notes || '',
                docs: doc.screening?.docs || {},
                updatedAt: doc.screening?.updatedAt || null,
            }
            : null,

        // Offer panel — only populated once an offer letter has been sent
        offer: offerSent
            ? {
                offerId: doc.offer.offerId || '',
                sent: true,
                offerDate: doc.offer.offerDate || null,
                acceptanceDeadline: doc.offer.acceptanceDeadline || null,
                acceptanceStatus: doc.offer.acceptanceStatus || 'Pending',
                emailSent: doc.offer.emailSent || false,
                pdfGenerated: doc.offer.pdfGenerated || false,
                sentAt: doc.offer.sentAt || null,
            }
            : null,
    };
};

// ─── Resolve parent _id from parentId string ──────────────────────────────────

const resolveParent = async (parentId) => {
    // parentId might be the string "PAR-2025-0001" or come directly from req.user
    const parent = await Parent.findOne({ parentId }).lean();
    if (!parent) {
        throw new ErrorResponse('Parent account not found.', 404);
    }
    return parent;
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /parent/admissions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns all admission applications submitted by this parent,
 * grouped with pipeline stats.
 *
 * @param {string} parentId - Parent.parentId (e.g. "PAR-2025-0001")
 */
const getMyApplications = async (parentId) => {
    const parent = await resolveParent(parentId);
    const applications = await Admission.find({ parentId: parent._id })
        .sort({ dateApplied: -1 })
        .lean({ virtuals: true });

    const stats = {
        total: applications.length,
        pending: applications.filter(a => ['Pending', 'Under Review'].includes(a.status)).length,
        inScreening: applications.filter(a => a.status === 'Approved for Screening').length,
        offersPending: applications.filter(a => a.offer?.offerSent && a.offer?.acceptanceStatus === 'Pending').length,
        accepted: applications.filter(a => a.offer?.acceptanceStatus === 'Accepted').length,
        rejected: applications.filter(a => a.status === 'Rejected' || a.offer?.acceptanceStatus === 'Declined').length,
    };

    return {
        applications: applications.map(toParentView),
        stats,
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /parent/admissions/:id
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns full detail for a single admission application owned by this parent.
 *
 * @param {string} parentId
 * @param {string} applicationId - e.g. "APP-2025-0001"
 */
const getMyApplication = async (parentId, applicationId) => {
    const parent = await resolveParent(parentId);

    const application = await Admission.findOne({
        applicationId: applicationId.toUpperCase(),
        parentId: parent._id,
    }).lean({ virtuals: true });

    if (!application) {
        throw new ErrorResponse(
            `Application '${applicationId}' not found or does not belong to your account.`,
            404,
            [{ code: 'NOT_FOUND' }]
        );
    }

    return { application: toParentView(application) };
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /parent/admissions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Submits a new admission application on behalf of a logged-in parent.
 * Unlike the public route, this reuses the parent's existing account
 * and does NOT create a new one.
 *
 * @param {string} parentId - Authenticated parent's ID
 * @param {object} body     - Validated request body (child details only)
 * @param {object} files    - express-fileupload files
 */
const submitApplicationAsParent = async (parentId, body, files = {}) => {
    const parent = await resolveParent(parentId);

    console.log({ parentId, body })

    // Duplicate check — same child name + DOB for this parent
    const existing = await Admission.findOne({
        parentId: parent._id,
        surname: new RegExp(`^${body.surname}$`, 'i'),
        firstName: new RegExp(`^${body.firstName}$`, 'i'),
        dateOfBirth: new Date(body.dateOfBirth),
    });

    if (existing) {
        throw new ErrorResponse(
            'An application for a child with this name and date of birth already exists in your account.',
            409,
            [{ code: 'DUPLICATE_APPLICATION', existingId: existing.applicationId }]
        );
    }

    const { applicationId, serialNumber } = await generateApplicationId();
    const savedDocs = await saveDocuments(files, applicationId);

    console.log(applicationId, serialNumber)

    const admission = await Admission.create({
        applicationId,
        serialNumber,
        parentId: parent._id,
        surname: body.surname,
        firstName: body.firstName,
        middleName: body.middleName || '',
        dateOfBirth: body.dateOfBirth,
        gender: body.gender,
        bloodGroup: body.bloodGroup || '',
        genotype: body.genotype || '',
        nationality: body.nationality || 'Nigerian',
        stateOfOrigin: body.stateOfOrigin || '',
        localGovernment: body.localGovernment || '',
        schoolingOption: body.schoolingOption,
        classPreferences: body.classPreferences || {},
        correspondenceEmail: body.correspondenceEmail
            || parent.correspondenceEmail
            || parent.email,
        howDidYouKnow: body.howDidYouKnow || parent.howDidYouKnow || '',
        schools: body.schools || [],
        health: body.health || {},
        documents: savedDocs,
        createdBy: parentId,
    });

    return {
        applicationRef: admission.applicationId,
        firstName: admission.firstName,
        surname: admission.surname,
        classApplied: admission.classPreferences?.classInterestedIn || '',
        schoolingOption: admission.schoolingOption,
        status: admission.status,
        dateApplied: admission.dateApplied,
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /parent/admissions/:id/offer
// ═══════════════════════════════════════════════════════════════════════════════

/**
 *
 * @param {string} parentId
 * @param {string} applicationId
 * @param {'Accepted'|'Declined'} acceptanceStatus
 */
const respondToOffer = async (parentId, applicationId, acceptanceStatus) => {
    const parent = await resolveParent(parentId);

    const admission = await Admission.findOne({
        applicationId: applicationId.toUpperCase(),
        parentId: parent._id,
    });

    if (!admission) {
        throw new ErrorResponse('Application not found.', 404, [{ code: 'NOT_FOUND' }]);
    }

    if (!admission.offer?.offerSent) {
        throw new ErrorResponse(
            'No offer letter has been sent for this application yet.',
            400,
            [{ code: 'NO_OFFER_SENT' }]
        );
    }

    if (['Accepted', 'Declined'].includes(admission.offer.acceptanceStatus)) {
        throw new ErrorResponse(
            `This offer has already been ${admission.offer.acceptanceStatus.toLowerCase()}. Contact the school to make changes.`,
            409,
            [{ code: 'OFFER_ALREADY_DECIDED' }]
        );
    }

    // Check deadline
    const deadline = admission.offer.acceptanceDeadline;
    if (deadline && new Date(deadline) < new Date()) {
        // Allow but flag it — school staff can override if needed
        console.warn(`[ParentAdmission] Parent responding to offer past deadline: ${applicationId}`);
    }

    const updated = await Admission.findOneAndUpdate(
        { applicationId: applicationId.toUpperCase() },
        {
            $set: {
                'offer.acceptanceStatus': acceptanceStatus,
                'offer.updatedAt': new Date(),
                lastUpdatedBy: parentId,
            },
        },
        { new: true }
    ).lean();

    if(updated.offer.acceptanceStatus === "Accepted"){
       await studentService.migrateStudent(applicationId, parentId)
    }

    return {
        id: updated.applicationId,
        offerId: updated.offer.offerId,
        acceptanceStatus: updated.offer.acceptanceStatus,
        updatedAt: updated.offer.updatedAt,
    };
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    getMyApplications,
    getMyApplication,
    submitApplicationAsParent,
    respondToOffer,
};
