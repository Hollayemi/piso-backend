const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

// Allowed file types
const ALLOWED_TYPES = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'application/pdf': 'pdf'
};

/**
 * Upload and validate documents
 */
const uploadDocuments = async (files) => {
    const uploadedDocs = {};
    const uploadDir = path.join(__dirname, '../uploads/documents');

    // Ensure upload directory exists
    try {
        await fs.mkdir(uploadDir, { recursive: true });
    } catch (err) {
        console.error('Error creating upload directory:', err);
    }

    const allowedDocs = [
        'birthCertificate',
        'formerSchoolReport',
        'immunizationCertificate',
        'medicalReport',
        'proofOfPayment'
    ];

    for (const docType of allowedDocs) {
        if (files[docType]) {
            const file = files[docType];

            // Validate file type
            if (!ALLOWED_TYPES[file.mimetype]) {
                throw new Error(`Invalid file type for ${docType}. Only JPG, PNG, and PDF are allowed.`);
            }

            // Validate file size (5MB)
            if (file.size > 5 * 1024 * 1024) {
                throw new Error(`File ${docType} exceeds 5MB limit.`);
            }

            // Generate unique filename
            const fileExt = ALLOWED_TYPES[file.mimetype];
            const uniqueName = `${docType}_${crypto.randomBytes(8).toString('hex')}_${Date.now()}.${fileExt}`;
            const filePath = path.join(uploadDir, uniqueName);

            // Move file to uploads directory
            try {
                await file.mv(filePath);

                uploadedDocs[docType] = {
                    filename: uniqueName,
                    path: `/uploads/documents/${uniqueName}`,
                    uploadedAt: new Date()
                };
            } catch (err) {
                throw new Error(`Failed to upload ${docType}: ${err.message}`);
            }
        }
    }

    return uploadedDocs;
};

/**
 * Delete documents from filesystem
 */
const deleteDocuments = async (documents) => {
    const uploadDir = path.join(__dirname, '../uploads/documents');

    for (const docType in documents) {
        if (documents[docType] && documents[docType].filename) {
            const filePath = path.join(uploadDir, documents[docType].filename);

            try {
                await fs.unlink(filePath);
            } catch (err) {
                console.error(`Error deleting file ${filePath}:`, err);
            }
        }
    }
};

module.exports = {
    uploadDocuments,
    deleteDocuments
};
