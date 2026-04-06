const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const Parent        = require('../model/parent.model');
const Settings      = require('../model/settings.model');
const ErrorResponse = require('../utils/errorResponse');

const generateParentId = async () => {
    const year   = new Date().getFullYear();
    const prefix = `PAR-${year}-`;

    const latest = await Parent.findOne(
        { parentId: { $regex: `^${prefix}` } },
        { serialNumber: 1 }
    ).sort({ serialNumber: -1 });

    const nextSerial   = latest ? latest.serialNumber + 1 : 1;
    const paddedSerial = String(nextSerial).padStart(4, '0');

    return { parentId: `${prefix}${paddedSerial}`, serialNumber: nextSerial };
};

const signToken = (payload) =>
    jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '7d',
    });

const toProfileView = (doc) => ({
    id:                  doc.parentId,
    familyName:          doc.familyName,
    email:               doc.email,
    correspondenceEmail: doc.correspondenceEmail || '',
    father: {
        name:          doc.father?.name          || '',
        email:         doc.father?.email         || '',
        phone:         doc.father?.homePhone      || '',
        whatsApp:      doc.father?.whatsApp       || '',
        occupation:    doc.father?.occupation     || '',
        officeAddress: doc.father?.officeAddress  || '',
        homeAddress:   doc.father?.homeAddress    || '',
    },
    mother: {
        name:          doc.mother?.name          || '',
        email:         doc.mother?.email         || '',
        phone:         doc.mother?.homePhone      || '',
        whatsApp:      doc.mother?.whatsApp       || '',
        occupation:    doc.mother?.occupation     || '',
        officeAddress: doc.mother?.officeAddress  || '',
        homeAddress:   doc.mother?.homeAddress    || '',
    },
    lastLogin:         doc.lastLogin,
    mustResetPassword: doc.mustResetPassword ?? false,
});

/**
 * Authenticates a parent using the father's email address.
 *
 * @param {string} email     — father's email (Parent.email)
 * @param {string} password
 */
const login = async (email, password) => {
    const parent = await Parent.findOne({ email: email.toLowerCase() })
        .select('+password familyName email father mother correspondenceEmail parentId mustResetPassword lastLogin');

    if (!parent) {
        throw new ErrorResponse('Invalid email or password', 401, [
            { code: 'INVALID_CREDENTIALS' },
        ]);
    }

    const isMatch = await bcrypt.compare(password, parent.password || '');
    if (!isMatch) {
        throw new ErrorResponse('Invalid email or password', 401, [
            { code: 'INVALID_CREDENTIALS' },
        ]);
    }

    const settings       = await Settings.getSingleton();
    const sessionVersion = settings.security?.sessionVersion ?? 1;

    const token = signToken({
        id:             parent.parentId,
        role:           'parent',
        email:          parent.email,
        name:           parent.familyName,
        sessionVersion,
    });

    await Parent.findByIdAndUpdate(parent._id, { $set: { lastLogin: new Date() } });

    return { token, parent: toProfileView(parent) };
};

const getProfile = async (parentId) => {
    const parent = await Parent.findOne(
        { parentId: parentId.toUpperCase() },
        { password: 0 }
    ).lean();

    if (!parent) {
        throw new ErrorResponse('Parent account not found.', 404);
    }

    return { parent: toProfileView(parent) };
};


const changePassword = async (parentId, currentPassword, newPassword) => {
    const parent = await Parent.findOne({ parentId: parentId.toUpperCase() })
        .select('+password mustResetPassword');

    if (!parent) throw new ErrorResponse('Parent account not found.', 404);

    const isMatch = await bcrypt.compare(currentPassword, parent.password || '');
    if (!isMatch) {
        throw new ErrorResponse('Current password is incorrect.', 400, [
            { code: 'INCORRECT_CURRENT_PASSWORD' },
        ]);
    }

    const isSame = await bcrypt.compare(newPassword, parent.password || '');
    if (isSame) {
        throw new ErrorResponse('New password must differ from the current password.', 400, [
            { code: 'SAME_PASSWORD' },
        ]);
    }

    const salt = await bcrypt.genSalt(12);
    parent.password          = await bcrypt.hash(newPassword, salt);
    parent.mustResetPassword = false;
    await parent.save();

    return { message: 'Password changed successfully' };
};

/**
 * @param {object} fatherData   - { name, email, homePhone, whatsApp, occupation, officeAddress, homeAddress }
 * @param {object} motherData   - same shape
 * @param {string} correspondenceEmail
 * @param {string} howDidYouKnow
 * @param {string} createdBy    - Staff ID
 * @returns {Promise<Parent>}   - The created or existing Parent document
 */

const createParentAccount = async (
    fatherData,
    motherData,
    correspondenceEmail,
    howDidYouKnow,
    createdBy
) => {
    console.log({
        fatherData,
    motherData,
    correspondenceEmail,
    howDidYouKnow,
    createdBy
    })
    const loginEmail = correspondenceEmail.toLowerCase();

    // Idempotent — return existing account if the father email is already registered
    const existing = await Parent.findOne({ email: loginEmail });
    if (existing) return existing;

    const { parentId, serialNumber } = await generateParentId();

    // Generate a temporary password — parent must change on first login
    const tempPassword   = crypto.randomBytes(6).toString('hex');
    const salt           = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash("Password123!", salt);

    const parent = await Parent.create({
        parentId,
        serialNumber,
        familyName: fatherData.name,
        email:      loginEmail,
        password:   hashedPassword,
        mustResetPassword: true,
        father: {
            name:          fatherData.name,
            email:         fatherData.email,
            homePhone:     fatherData.homePhone  || fatherData.phone || '',
            whatsApp:      fatherData.whatsApp   || '',
            occupation:    fatherData.occupation || '',
            officeAddress: fatherData.officeAddress || '',
            homeAddress:   fatherData.homeAddress   || '',
        },
        mother: {
            name:          motherData.name,
            email:         motherData.email,
            homePhone:     motherData.homePhone  || motherData.phone || '',
            whatsApp:      motherData.whatsApp   || '',
            occupation:    motherData.occupation || '',
            officeAddress: motherData.officeAddress || '',
            homeAddress:   motherData.homeAddress   || '',
        },
        correspondenceEmail: correspondenceEmail || loginEmail,
        howDidYouKnow:       howDidYouKnow       || '',
        createdBy,
    });

    // In production: send the tempPassword to the parent's email via nodemailer.
    // For development: log to console only.
    if (process.env.NODE_ENV === 'development') {
        console.log(
            `[ParentAuth] Created account ${parentId} | email: ${loginEmail} | temp password: ${tempPassword}`
        );
    }

    return parent;
};

const updateParentProfile = async (parentId, updateData) => {
    const parent = await Parent.findOne({ parentId: parentId.toUpperCase() });
    if (!parent) throw new ErrorResponse('Parent account not found.', 404);
 
    const ALLOWED_FIELDS = [
        'father', 'mother', 'correspondenceEmail', 'howDidYouKnow',
        'notificationPreferences',
    ];
 
    for (const key of ALLOWED_FIELDS) {
        if (updateData[key] !== undefined) {
            if (key === 'father' || key === 'mother') {
                // Merge nested object — don't overwrite the whole sub-doc
                Object.assign(parent[key], updateData[key]);
            } else {
                parent[key] = updateData[key];
            }
        }
    }
 
    parent.lastUpdatedBy = parentId;
    await parent.save();
 
    return { parent: toProfileView(parent.toObject()) };
};
 
// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    login,
    getProfile,
    changePassword,
    createParentAccount,
    generateParentId,
    toProfileView,
    updateParentProfile,
};
