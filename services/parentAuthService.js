/**
 * services/parentAuthService.js
 *
 * Authentication logic specific to parent accounts.
 * Parents log in via the same POST /auth/login endpoint.
 * This service is called by authService.login() when the user is
 * identified as a parent (no Staff record found but Parent record found).
 *
 * The JWT payload for parents:
 *   { id: parentId, role: 'parent', email, name, sessionVersion }
 *
 * The protect middleware handles parents the same as staff — it verifies
 * the JWT — but the parentAuth middleware then loads the Parent document
 * instead of the Staff document.
 */

const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const Parent       = require('../model/parent.model');
const Settings     = require('../model/settings.model');
const ErrorResponse = require('../utils/errorResponse');

// ─── ID Generation ────────────────────────────────────────────────────────────

/**
 * Generates the next sequential parent ID.
 * Format: PAR-YYYY-NNNN  e.g. PAR-2025-0001
 */
const generateParentId = async () => {
    const year   = new Date().getFullYear();
    const prefix = `PAR-${year}-`;

    const latest = await Parent.findOne(
        { parentId: { $regex: `^${prefix}` } },
        { serialNumber: 1 }
    ).sort({ serialNumber: -1 });

    const nextSerial   = latest ? latest.serialNumber + 1 : 1;
    const paddedSerial = String(nextSerial).padStart(4, '0');

    return {
        parentId:     `${prefix}${paddedSerial}`,
        serialNumber: nextSerial,
    };
};

// ─── Token factory ────────────────────────────────────────────────────────────

const signToken = (payload) =>
    jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '7d',
    });

// ─── Profile shape ────────────────────────────────────────────────────────────

const toProfileView = (doc) => ({
    id:               doc.parentId,
    name:             doc.name,
    email:            doc.email,
    phone:            doc.phone             || '',
    whatsApp:         doc.whatsApp          || '',
    occupation:       doc.occupation        || '',
    relation:         doc.relation          || 'guardian',
    homeAddress:      doc.homeAddress       || '',
    linkedStudentIds: doc.linkedStudentIds  || [],
    lastLogin:        doc.lastLogin,
    mustResetPassword: doc.mustResetPassword || false,
});

// ─── login ────────────────────────────────────────────────────────────────────

/**
 * Authenticates a parent by email + password.
 * Returns the parent profile and a signed JWT.
 *
 * Called by authService.login() when no Staff record is found for the email.
 *
 * @param {string} email
 * @param {string} password
 */
const login = async (email, password) => {
    const parent = await Parent.findOne({ email: email.toLowerCase() })
        .select('+password name email relation parentId linkedStudentIds mustResetPassword lastLogin');

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
        name:           parent.name,
        sessionVersion,
    });

    // Update lastLogin
    await Parent.findByIdAndUpdate(parent._id, { $set: { lastLogin: new Date() } });

    return { token, parent: toProfileView(parent) };
};

// ─── getProfile ───────────────────────────────────────────────────────────────

const getProfile = async (parentId) => {
    const parent = await Parent.findOne({ parentId: parentId.toUpperCase() }, { password: 0 }).lean();

    if (!parent) {
        throw new ErrorResponse('Parent account not found.', 404);
    }

    return { parent: toProfileView(parent) };
};

// ─── changePassword ───────────────────────────────────────────────────────────

const changePassword = async (parentId, currentPassword, newPassword) => {
    const parent = await Parent.findOne({ parentId: parentId.toUpperCase() })
        .select('+password mustResetPassword');

    if (!parent) {
        throw new ErrorResponse('Parent account not found.', 404);
    }

    const isMatch = await bcrypt.compare(currentPassword, parent.password || '');
    if (!isMatch) {
        throw new ErrorResponse('Current password is incorrect.', 400, [
            { code: 'INCORRECT_CURRENT_PASSWORD' },
        ]);
    }

    const isSame = await bcrypt.compare(newPassword, parent.password || '');
    if (isSame) {
        throw new ErrorResponse('New password must be different from the current password.', 400, [
            { code: 'SAME_PASSWORD' },
        ]);
    }

    const salt = await bcrypt.genSalt(12);
    parent.password          = await bcrypt.hash(newPassword, salt);
    parent.mustResetPassword = false;
    await parent.save();

    return { message: 'Password changed successfully' };
};

// ─── createParentAccount (admin utility) ──────────────────────────────────────

/**
 * Creates a parent account from a Student record's parent data.
 * Called by studentService when a student is registered and the
 * parent email does not already have an account.
 *
 * @param {object} parentData - { name, email, phone, whatsApp, relation }
 * @param {string} studentId  - The linked student ID
 * @param {string} createdBy  - Staff ID
 */
const createParentAccount = async (parentData, studentId, createdBy) => {
    // Skip if account already exists — just link the student
    const existing = await Parent.findOne({ email: parentData.email.toLowerCase() });

    if (existing) {
        // Link the student if not already linked
        if (!existing.linkedStudentIds.includes(studentId)) {
            await Parent.findByIdAndUpdate(existing._id, {
                $addToSet: { linkedStudentIds: studentId },
            });
        }
        return existing;
    }

    const { parentId, serialNumber } = await generateParentId();

    // Generate a temporary password — parent must reset on first login
    const tempPassword   = require('crypto').randomBytes(6).toString('hex');
    const salt           = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(tempPassword, salt);

    const parent = await Parent.create({
        parentId,
        serialNumber,
        name:              parentData.name,
        email:             parentData.email.toLowerCase(),
        phone:             parentData.phone     || '',
        whatsApp:          parentData.whatsApp  || '',
        occupation:        parentData.occupation || '',
        homeAddress:       parentData.homeAddress || '',
        relation:          parentData.relation  || 'guardian',
        linkedStudentIds:  [studentId],
        password:          hashedPassword,
        mustResetPassword: true,
        createdBy,
    });

    // NOTE: In production, send the tempPassword to the parent's email
    // via an email service (nodemailer). Log it here for development.
    console.log(`[ParentAuth] Created parent account ${parentId} for ${parentData.email} | temp: ${tempPassword}`);

    return parent;
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    login,
    getProfile,
    changePassword,
    createParentAccount,
    generateParentId,
    toProfileView,
};
