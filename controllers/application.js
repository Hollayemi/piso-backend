const { validateAdmission } = require('../helpers/inputValidations');
const { uploadDocuments, deleteDocuments } = require('../utils/fileUpload');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/asyncHandler');
const Admission = require('../model/application');
const { classCodeMap } = require('../helpers/stringGenerator');

/**
 * @desc    Submit new admission application
 * @route   POST /api/v1/admissions
 * @access  Public
 */

// Function to get the highest serial number for a class and year
exports.getHighestSerial = async (className, submissionDate = new Date().getFullYear()) => {
    try {
        const highestAdmission = await Admission.findOne({
            submittedAt: submissionDate,
            "classPreferences.classInterestedIn": className
        })
            .sort({ serialNumber: -1 })
            .select('serialNumber applicationRef');

        if (highestAdmission) {
            return {
                highestSerial: highestAdmission.serialNumber,
                applicationRef: highestAdmission.applicationRef,
                nextSerial: highestAdmission.serialNumber + 1
            };
        } else {
            return {
                highestSerial: 0,
                applicationRef: null,
                nextSerial: 1
            };
        }
    } catch (error) {
        throw new Error(`Error finding highest serial: ${error.message}`);
    }
};

// Updated applicationRef function that auto-increments serial
exports.generateApplicationRef = async (className, submissionDate = new Date().getFullYear()) => {
    try {

        const serialData = await this.getHighestSerial(className, submissionDate);
        const nextSerial = serialData.nextSerial;

        const classCode = classCodeMap[className.toLowerCase()] || 'XX';
        const year = String(submissionDate).slice(-2);
        const randomNum = Math.floor(10000 + Math.random() * 90000);

        const formattedSerial = String(nextSerial).padStart(3, '0');

        const applicationRef = `PISO${year}${classCode}${formattedSerial}`;

        return {
            applicationRef,
            serialNumber: nextSerial,
            submissionDate,
            className
        };
    } catch (error) {
        throw new Error(`Error generating application reference: ${error.message}`);
    }
};

exports.submitApplication = asyncHandler(async (req, res, next) => {
    // Validate request body
    const { error, value } = validateAdmission(req.body);

    if (error) {
        const errors = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
        }));

        return next(new ErrorResponse('Validation failed', 400, errors));
    }

    // Check for duplicate email submissions (prevent spam)
    const existingApplication = await Admission.findOne({
        'contact.correspondenceEmail': value.contact.correspondenceEmail,
        submittedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    });

    if (existingApplication) {
        return next(new ErrorResponse(
            'You have already submitted an application within the last 24 hours. Please check your email for the application reference.',
            429
        ));
    }

    // Handle file uploads
    let uploadedDocs = {};
    if (req.files) {
        try {
            uploadedDocs = await uploadDocuments(req.files);
        } catch (err) {
            return next(new ErrorResponse(`File upload failed: ${err.message}`, 400));
        }
    }




    const applicationRef = await (await this.generateApplicationRef(req.body?.classPreferences?.classInterestedIn)).applicationRef
    console.log({ applicationRef })
    // Create admission application
    const admission = await new Admission({
        ...value,
        applicationRef,
        documents: uploadedDocs,
        submittedFrom: req.ip || req.connection.remoteAddress
    }).save();

    // Send response with application reference
    res.status(201).json({
        success: true,
        message: 'Application submitted successfully',
        data: {
            applicationRef: admission.applicationRef,
            submittedAt: admission.submittedAt,
            applicantName: `${admission.firstName} ${admission.surname}`,
            status: admission.status
        }
    });
});

/**
 * @desc    Get application by reference number
 * @route   GET /api/v1/admissions/:ref
 * @access  Public (with reference number)
 */
exports.getApplication = asyncHandler(async (req, res, next) => {
    const { ref } = req.params;
    const { email } = req.query;

    if (!email) {
        return next(new ErrorResponse('Email is required to retrieve application', 400));
    }

    const admission = await Admission.findOne({
        applicationRef: ref.toUpperCase(),
        'contact.correspondenceEmail': email.toLowerCase()
    }).select('-__v -submittedFrom');

    if (!admission) {
        return next(new ErrorResponse('Application not found or email mismatch', 404));
    }

    res.status(200).json({
        success: true,
        data: admission
    });
});

/**
 * @desc    Get all applications (Admin only - add authentication middleware)
 * @route   GET /api/v1/admissions
 * @access  Private/Admin
 */
exports.getAllApplications = asyncHandler(async (req, res, next) => {
    const { status, page = 1, limit = 20, sortBy = '-submittedAt' } = req.query;

    const query = {};
    if (status) {
        query.status = status;
    }

    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sort: sortBy
    };

    const admissions = await Admission.find(query)
        .sort(options.sort)
        .limit(options.limit)
        .skip((options.page - 1) * options.limit)
        .select('-__v');

    const total = await Admission.countDocuments(query);

    res.status(200).json({
        success: true,
        count: admissions.length,
        total,
        page: options.page,
        pages: Math.ceil(total / options.limit),
        data: admissions
    });
});

/**
 * @desc    Update application status (Admin only)
 * @route   PUT /api/v1/admissions/:ref/status
 * @access  Private/Admin
 */
exports.updateApplicationStatus = asyncHandler(async (req, res, next) => {
    const { ref } = req.params;
    const { status, adminNotes } = req.body;

    const validStatuses = ['Pending', 'Under Review', 'Approved', 'Rejected', 'Waitlisted'];

    if (!validStatuses.includes(status)) {
        return next(new ErrorResponse('Invalid status', 400));
    }

    const admission = await Admission.findOneAndUpdate(
        { applicationRef: ref.toUpperCase() },
        {
            status,
            adminNotes: adminNotes || '',
            lastUpdated: Date.now()
        },
        { new: true, runValidators: true }
    );

    if (!admission) {
        return next(new ErrorResponse('Application not found', 404));
    }

    res.status(200).json({
        success: true,
        message: 'Application status updated successfully',
        data: admission
    });
});

/**
 * @desc    Delete application (Admin only - soft delete)
 * @route   DELETE /api/v1/admissions/:ref
 * @access  Private/Admin
 */
exports.deleteApplication = asyncHandler(async (req, res, next) => {
    const { ref } = req.params;

    const admission = await Admission.findOne({
        applicationRef: ref.toUpperCase()
    });

    if (!admission) {
        return next(new ErrorResponse('Application not found', 404));
    }

    // Delete associated files
    if (admission.documents) {
        try {
            await deleteDocuments(admission.documents);
        } catch (err) {
            console.error('Error deleting files:', err);
        }
    }

    await admission.deleteOne();

    res.status(200).json({
        success: true,
        message: 'Application deleted successfully',
        data: {}
    });
});

/**
 * @desc    Get application statistics (Admin only)
 * @route   GET /api/v1/admissions/stats/overview
 * @access  Private/Admin
 */
exports.getStatistics = asyncHandler(async (req, res, next) => {
    const stats = await Admission.aggregate([
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);

    const total = await Admission.countDocuments();
    const today = await Admission.countDocuments({
        submittedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
    });

    const thisWeek = await Admission.countDocuments({
        submittedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });

    res.status(200).json({
        success: true,
        data: {
            total,
            today,
            thisWeek,
            byStatus: stats
        }
    });
});