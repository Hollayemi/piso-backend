/**
 * services/authService.js
 *
 * Business logic and DB access for the Auth module.
 *
 * Endpoints served:
 *   POST /auth/login           → login
 *   POST /auth/logout          → logout  (token-rotation hint; main work is client-side)
 *   GET  /auth/me              → getProfile
 *   PUT  /auth/change-password → changePassword
 *
 * JWT payload shape:
 *   { id, role, email, name, sessionVersion }
 *
 * Notes:
 *   - bcryptjs is used for password hashing (already in package.json).
 *   - Staff.password is selected: false in the model, so we always
 *     explicitly select it with +password when we need to compare.
 *   - sessionVersion is read from the Settings singleton and embedded
 *     in every issued token so the protect middleware can validate it.
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const Staff = require('../model/staff.model');
const Settings = require('../model/settings.model');
const ErrorResponse = require('../utils/errorResponse');

const parentAuthService = require("./parentAuthService")

// ─── Token factory ────────────────────────────────────────────────────────────

/**
 * Signs and returns a JWT.
 *
 * @param {object} payload - { id, role, email, name, sessionVersion }
 * @returns {string}
 */
const signToken = (payload) =>
    jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '7d',
    });

// ─── Response shape helpers ───────────────────────────────────────────────────

/**
 * Compact profile shape used by both login and GET /me responses.
 *
 * @param {object} doc - Staff Mongoose lean doc
 */
const toProfileView = (doc) => ({
    id: doc.staffId,
    surname: doc.surname,
    firstName: doc.firstName,
    middleName: doc.middleName || '',
    fullName: [doc.surname, doc.firstName, doc.middleName].filter(Boolean).join(' '),
    email: doc.email,
    role: doc.role || doc.staffType,   // role is stored as staffType on the model
    staffType: doc.staffType,
    department: doc.department,
    phone: doc.phone,
    status: doc.status,
    photo: doc.photo ?? null,
    mustResetPassword: doc.mustResetPassword ?? false,
});

// ═══════════════════════════════════════════════════════════════════════════════
// login
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Authenticates a staff member by email + password.
 * Returns the staff profile and a signed JWT.
 *
 * @param {string} email
 * @param {string} password
 */
const login = async (email, password, login_type) => {
    // Explicitly select password (select: false in schema)
    const userType = ""
    if (login_type === "admin") {
        const staff = await Staff.findOne({ email: email.toLowerCase() })
            .select('+password email staffType surname firstName middleName status mustResetPassword staffId _id');

        console.log(staff)

        if (!staff) {
            throw new ErrorResponse('Invalid email or password', 401, [
                { code: 'INVALID_CREDENTIALS' },
            ]);
        }

        if (staff.status === 'Inactive') {
            throw new ErrorResponse(
                'Your account has been deactivated. Please contact the administrator.',
                403,
                [{ code: 'ACCOUNT_INACTIVE' }]
            );
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, staff.password);
        if (!isMatch) {
            throw new ErrorResponse('Invalid email or password', 401, [
                { code: 'INVALID_CREDENTIALS' },
            ]);
        }

        // Read current sessionVersion from Settings
        const settings = await Settings.getSingleton();
        const sessionVersion = settings.security?.sessionVersion ?? 1;

        // Build the role for the JWT — the Staff model stores role as staffType.
        // Map privileged staffTypes to system roles; everyone else is 'teacher'.
        const role = resolveRole(staff.staffType);

        const token = signToken({
            id: staff.staffId,
            role,
            email: staff.email,
            name: `${staff.surname} ${staff.firstName}`,
            sessionVersion,
        });

        return {
            token,
            staff: toProfileView(staff),
        }
    } else if (login_type === "parent") {
        return await parentAuthService.login(email, password);
    }
};

// ─── Role resolver ────────────────────────────────────────────────────────────

/**
 * Maps a Staff.staffType to one of the five system roles.
 * The system roles are: super_admin | admin | principal | accountant | teacher
 *
 * Adjust this mapping to match your school's org chart.
 *
 * @param {string} staffType
 * @returns {string}
 */
const resolveRole = (staffType) => {
    const roleMap = {
        super_admin: 'super_admin',
        principal: 'super_admin',
        vice_principal_academic: 'principal',
        vice_principal_admin: 'principal',
        bursar: 'accountant',
        // All teaching roles → teacher
        teacher: 'teacher',
        class_teacher: 'teacher',
        hod_science: 'teacher',
        hod_arts: 'teacher',
        hod_commercial: 'teacher',
        ict_instructor: 'teacher',
        // Support / admin roles → admin
        secretary: 'admin',
        librarian: 'admin',
        lab_technician: 'admin',
        nurse: 'admin',
        counselor: 'admin',
        boarding_master: 'admin',
        security: 'admin',
        driver: 'admin',
        cook: 'admin',
        cleaner: 'admin',
        maintenance: 'admin',
    };

    return roleMap[staffType] ?? 'teacher';
};

// ═══════════════════════════════════════════════════════════════════════════════
// logout
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Logout is primarily a client-side concern (discard the token).
 * This function exists as a hook for future server-side token blacklisting.
 * Currently it simply returns a success payload.
 */
const logout = async () => ({ message: 'Logged out successfully' });

// ═══════════════════════════════════════════════════════════════════════════════
// getProfile  —  GET /auth/me
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns the full profile of the currently authenticated staff member.
 *
 * @param {string} staffId - Decoded from JWT (req.user.id)
 */
const getProfile = async (staffId) => {
    const staff = await Staff.findOne(
        { staffId: staffId.toUpperCase() },
        { password: 0 }  // explicitly exclude password
    ).lean();

    if (!staff) {
        throw new ErrorResponse('Staff member not found', 404);
    }

    return { staff: toProfileView(staff) };
};

// ═══════════════════════════════════════════════════════════════════════════════
// changePassword  —  PUT /auth/change-password
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Changes the authenticated staff member's password.
 * Clears the mustResetPassword flag on success.
 *
 * @param {string} staffId         - Decoded from JWT
 * @param {string} currentPassword - Must match the stored hash
 * @param {string} newPassword     - Plaintext; will be hashed before storage
 */
const changePassword = async (staffId, currentPassword, newPassword) => {
    const staff = await Staff.findOne({ staffId: staffId.toUpperCase() })
        .select('+password mustResetPassword');

    if (!staff) {
        throw new ErrorResponse('Staff member not found', 404);
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, staff.password || '');
    if (!isMatch) {
        throw new ErrorResponse('Current password is incorrect', 400, [
            { code: 'INCORRECT_CURRENT_PASSWORD' },
        ]);
    }

    // Validate new password is different
    const isSame = await bcrypt.compare(newPassword, staff.password || '');
    if (isSame) {
        throw new ErrorResponse(
            'New password must be different from the current password',
            400,
            [{ code: 'SAME_PASSWORD' }]
        );
    }

    // Hash and save
    const salt = await bcrypt.genSalt(12);
    staff.password = await bcrypt.hash(newPassword, salt);
    staff.mustResetPassword = false;
    await staff.save();

    return { message: 'Password changed successfully' };
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    login,
    logout,
    getProfile,
    changePassword,
    resolveRole,
};
