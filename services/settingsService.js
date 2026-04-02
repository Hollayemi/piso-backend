/**
 * services/settingsService.js
 *
 * All database interactions and business logic for the Settings module (5.1 – 5.13).
 *
 *   5.1  GET    /settings/school                            → getSchoolInfo
 *   5.2  PUT    /settings/school                            → updateSchoolInfo
 *   5.3  GET    /settings/academic                          → getAcademicSettings
 *   5.4  PATCH  /settings/academic/session                  → updateAcademicSession
 *   5.5  POST   /settings/academic/terms                    → createTerm
 *   5.5  PUT    /settings/academic/terms/:id                → updateTerm
 *   5.6  DELETE /settings/academic/terms/:id                → deleteTerm
 *   5.7  PATCH  /settings/academic/terms/:id/set-current    → setCurrentTerm
 *   5.8  GET    /settings/notifications                     → getNotificationSettings
 *   5.9  PUT    /settings/notifications                     → updateNotificationSettings
 *   5.10 GET    /settings/security                          → getSecuritySettings
 *   5.11 PUT    /settings/security                          → updateSecuritySettings
 *   5.12 POST   /settings/security/force-password-reset     → forcePasswordReset
 *   5.13 POST   /settings/security/clear-sessions           → clearAllSessions
 *
 * All routes require `super_admin` role (enforced on the route layer).
 * Controllers are thin wrappers — no DB access lives there.
 */

const path = require('path');
const fs   = require('fs').promises;

const Settings     = require('../model/settings.model');
const ErrorResponse = require('../utils/errorResponse');

const {
    NOTIFICATION_IDS,
    NOTIFICATION_LABELS,
    DEFAULT_FEE_STRUCTURE,
} = require('../model/settings.model');

// ─── File upload helper ───────────────────────────────────────────────────────

const LOGO_ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/svg+xml': 'svg' };
const LOGO_MAX_SIZE = 2 * 1024 * 1024; // 2 MB

/**
 * Saves the uploaded school logo and returns its relative URL.
 *
 * @param {object} file - express-fileupload file object
 * @returns {string}    - URL path e.g. /uploads/school/logo.png
 */
const saveLogo = async (file) => {
    if (!LOGO_ALLOWED[file.mimetype]) {
        throw new ErrorResponse('Logo must be a JPG, PNG, or SVG image.', 400);
    }
    if (file.size > LOGO_MAX_SIZE) {
        throw new ErrorResponse('Logo file size must not exceed 2 MB.', 400);
    }

    const ext       = LOGO_ALLOWED[file.mimetype];
    const filename  = `school_logo_${Date.now()}.${ext}`;
    const uploadDir = path.join(__dirname, '../uploads/school');

    await fs.mkdir(uploadDir, { recursive: true });
    await file.mv(path.join(uploadDir, filename));

    return `/uploads/school/${filename}`;
};

// ─── Term ID generator ────────────────────────────────────────────────────────

/**
 * Generates the next term ID given the existing terms array.
 * Format: T1, T2, T3 …
 *
 * @param {Array} terms - Existing terms from the Settings document
 * @returns {string}
 */
const nextTermId = (terms = []) => {
    const highest = terms.reduce((max, t) => {
        const n = parseInt((t.id || '').replace('T', ''), 10) || 0;
        return n > max ? n : max;
    }, 0);
    return `T${highest + 1}`;
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5.1  GET /settings/school
// ═══════════════════════════════════════════════════════════════════════════════

const getSchoolInfo = async () => {
    const settings = await Settings.getSingleton();
    return { school: settings.school };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5.2  PUT /settings/school
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @param {object} body      - Validated request body (school fields)
 * @param {object} files     - express-fileupload files (may be undefined)
 * @param {string} updatedBy - Staff ID of the authenticated super_admin
 */
const updateSchoolInfo = async (body, files, updatedBy) => {
    const settings = await Settings.getSingleton();

    // Handle optional logo upload
    if (files?.logo) {
        body.logoUrl = await saveLogo(files.logo);
    }

    // Merge incoming fields into the existing school sub-document
    Object.assign(settings.school, body);
    settings.lastUpdatedBy = updatedBy;
    settings.markModified('school');

    await settings.save();

    return {
        school: {
            name:      settings.school.name,
            shortName: settings.school.shortName,
            motto:     settings.school.motto,
            logoUrl:   settings.school.logoUrl,
        },
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5.3  GET /settings/academic
// ═══════════════════════════════════════════════════════════════════════════════

const getAcademicSettings = async () => {
    const settings = await Settings.getSingleton();
    const { academic } = settings;

    return {
        currentSession: academic.currentSession || '',
        currentTerm:    academic.currentTerm    || '',
        terms: (academic.terms || []).map((t) => ({
            id:      t.id,
            name:    t.name,
            start:   t.start,
            end:     t.end,
            current: t.current,
        })),
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5.4  PATCH /settings/academic/session
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @param {string} currentSession - e.g. "2026/2027"
 * @param {string} updatedBy
 */
const updateAcademicSession = async (currentSession, updatedBy) => {
    const settings = await Settings.getSingleton();

    settings.academic.currentSession = currentSession;
    settings.lastUpdatedBy = updatedBy;
    settings.markModified('academic');

    await settings.save();

    return { currentSession };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5.5  POST /settings/academic/terms  — Create
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @param {object} body - { name, start, end }
 * @param {string} updatedBy
 */
const createTerm = async (body, updatedBy) => {
    const settings = await Settings.getSingleton();
    const id = nextTermId(settings.academic.terms);

    const term = {
        id,
        name:    body.name,
        start:   new Date(body.start),
        end:     new Date(body.end),
        current: false,
    };

    settings.academic.terms.push(term);
    settings.lastUpdatedBy = updatedBy;
    settings.markModified('academic');

    await settings.save();

    return { term };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5.5  PUT /settings/academic/terms/:id  — Update
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @param {string} termId - e.g. "T1"
 * @param {object} body   - Partial { name?, start?, end? }
 * @param {string} updatedBy
 */
const updateTerm = async (termId, body, updatedBy) => {
    const settings = await Settings.getSingleton();
    const idx = settings.academic.terms.findIndex((t) => t.id === termId);

    if (idx === -1) {
        throw new ErrorResponse(`Term '${termId}' not found`, 404);
    }

    const term = settings.academic.terms[idx];

    if (body.name)  term.name  = body.name;
    if (body.start) term.start = new Date(body.start);
    if (body.end)   term.end   = new Date(body.end);

    // Re-validate end > start after merge
    if (term.end <= term.start) {
        throw new ErrorResponse('End date must be after start date', 400, [
            { field: 'end', message: 'End date must be after start date' },
        ]);
    }

    settings.academic.terms[idx] = term;
    settings.lastUpdatedBy = updatedBy;
    settings.markModified('academic');

    await settings.save();

    return { term: settings.academic.terms[idx] };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5.6  DELETE /settings/academic/terms/:id
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @param {string} termId
 * @param {string} updatedBy
 */
const deleteTerm = async (termId, updatedBy) => {
    const settings = await Settings.getSingleton();
    const idx = settings.academic.terms.findIndex((t) => t.id === termId);

    if (idx === -1) {
        throw new ErrorResponse(`Term '${termId}' not found`, 404);
    }

    const term = settings.academic.terms[idx];

    if (term.current) {
        throw new ErrorResponse(
            'Cannot delete the current active term. Set another term as current first.',
            400,
            [{ code: 'CANNOT_DELETE_CURRENT_TERM' }]
        );
    }

    settings.academic.terms.splice(idx, 1);

    // If deleted term was the currentTerm reference, clear it
    if (settings.academic.currentTerm === termId) {
        settings.academic.currentTerm = '';
    }

    settings.lastUpdatedBy = updatedBy;
    settings.markModified('academic');

    await settings.save();
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5.7  PATCH /settings/academic/terms/:id/set-current
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Marks `termId` as current and clears the flag on every other term.
 *
 * @param {string} termId
 * @param {string} updatedBy
 */
const setCurrentTerm = async (termId, updatedBy) => {
    const settings = await Settings.getSingleton();
    const idx = settings.academic.terms.findIndex((t) => t.id === termId);

    if (idx === -1) {
        throw new ErrorResponse(`Term '${termId}' not found`, 404);
    }

    // Unset all, then set the target
    settings.academic.terms.forEach((t, i) => {
        settings.academic.terms[i].current = (i === idx);
    });

    settings.academic.currentTerm = termId;
    settings.lastUpdatedBy = updatedBy;
    settings.markModified('academic');

    await settings.save();

    const currentTerm = settings.academic.terms[idx];

    return {
        currentTerm: {
            id:      currentTerm.id,
            name:    currentTerm.name,
            start:   currentTerm.start,
            end:     currentTerm.end,
            current: true,
        },
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5.8  GET /settings/notifications
// ═══════════════════════════════════════════════════════════════════════════════

const getNotificationSettings = async () => {
    const settings = await Settings.getSingleton();
    const { notifications } = settings;

    // If the items array is empty (first run), seed defaults
    if (!notifications.items || notifications.items.length === 0) {
        notifications.items = NOTIFICATION_IDS.map((id) => ({
            id,
            label:   NOTIFICATION_LABELS[id],
            enabled: true,
        }));
        settings.markModified('notifications');
        await settings.save();
    }

    return {
        notifications: notifications.items.map((n) => ({
            id:      n.id,
            label:   n.label,
            enabled: n.enabled,
        })),
        senderConfig: {
            emailSenderName: notifications.senderConfig?.emailSenderName || '',
            replyToEmail:    notifications.senderConfig?.replyToEmail    || '',
        },
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5.9  PUT /settings/notifications
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @param {object} body - { notifications?: [...], senderConfig?: { ... } }
 * @param {string} updatedBy
 */
const updateNotificationSettings = async (body, updatedBy) => {
    const settings = await Settings.getSingleton();

    // Update notification toggles
    if (Array.isArray(body.notifications)) {
        for (const incoming of body.notifications) {
            const existing = settings.notifications.items.find((n) => n.id === incoming.id);
            if (existing) {
                existing.enabled = incoming.enabled;
            } else {
                // Add new notification type if it's a recognised ID
                settings.notifications.items.push({
                    id:      incoming.id,
                    label:   NOTIFICATION_LABELS[incoming.id] || incoming.id,
                    enabled: incoming.enabled,
                });
            }
        }
    }

    // Update sender config
    if (body.senderConfig) {
        if (body.senderConfig.emailSenderName !== undefined) {
            settings.notifications.senderConfig.emailSenderName = body.senderConfig.emailSenderName;
        }
        if (body.senderConfig.replyToEmail !== undefined) {
            settings.notifications.senderConfig.replyToEmail = body.senderConfig.replyToEmail;
        }
    }

    settings.lastUpdatedBy = updatedBy;
    settings.markModified('notifications');

    await settings.save();
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5.10  GET /settings/security
// ═══════════════════════════════════════════════════════════════════════════════

const getSecuritySettings = async () => {
    const settings = await Settings.getSingleton();
    const { security } = settings;

    return {
        security: {
            twoFactor:             security.twoFactor             ?? false,
            sessionTimeoutMinutes: security.sessionTimeoutMinutes ?? 60,
            passwordMinLength:     security.passwordMinLength     ?? 8,
            requireUppercase:      security.requireUppercase      ?? true,
            requireNumbers:        security.requireNumbers        ?? true,
            // sessionVersion is intentionally NOT exposed via the API
        },
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5.11  PUT /settings/security
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @param {object} body - Validated partial security settings
 * @param {string} updatedBy
 */
const updateSecuritySettings = async (body, updatedBy) => {
    const settings = await Settings.getSingleton();

    const allowed = [
        'twoFactor',
        'sessionTimeoutMinutes',
        'passwordMinLength',
        'requireUppercase',
        'requireNumbers',
    ];

    for (const key of allowed) {
        if (body[key] !== undefined) {
            settings.security[key] = body[key];
        }
    }

    settings.lastUpdatedBy = updatedBy;
    settings.markModified('security');

    await settings.save();
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5.12  POST /settings/security/force-password-reset
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sets mustResetPassword = true on every Staff document.
 * The protect middleware will block any request from a staff member whose
 * flag is set, except on the /auth/change-password route.
 *
 * @param {string} requestedBy - Staff ID of the super_admin initiating the reset
 */
const forcePasswordReset = async (requestedBy) => {
    const Staff = require('../model/staff.model');

    const result = await Staff.updateMany(
        { staffId: { $ne: requestedBy } }, // don't lock out the person requesting
        { $set: { mustResetPassword: true } }
    );

    return { affectedUsers: result.modifiedCount };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5.13  POST /settings/security/clear-sessions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Increments the global sessionVersion in Settings.
 * Any JWT token whose embedded sessionVersion is lower than the new value
 * will be rejected by the protect middleware on the next request.
 *
 * @param {string} updatedBy
 */
const clearAllSessions = async (updatedBy) => {
    const settings = await Settings.getSingleton();

    const previousVersion  = settings.security.sessionVersion ?? 1;
    const newVersion       = previousVersion + 1;

    settings.security.sessionVersion = newVersion;
    settings.lastUpdatedBy = updatedBy;
    settings.markModified('security');

    await settings.save();

    // Count approximate number of active staff accounts as a rough proxy
    // for "sessions cleared" (true active session count would need a token store)
    const Staff = require('../model/staff.model');
    const sessionsCleared = await Staff.countDocuments({ status: 'Active' });

    return { sessionsCleared };
};


// ─── Helper: resolve term slot name ──────────────────────────────────────────
const termSlotName = (termString) => {
    if (!termString) return 'firstTerm';
    const t = termString.trim();
    if (t.startsWith('2nd')) return 'secondTerm';
    if (t.startsWith('3rd')) return 'thirdTerm';
    return 'firstTerm';
};
 
// ─── Helper: derive fee category key from class + schooling ──────────────────
const deriveFeeCategory = (className = '', schoolingOption = '') => {
    const upper     = className.trim().toUpperCase();
    const isBoarding = (schoolingOption || '').toLowerCase() === 'boarding';
 
    if (upper.startsWith('JSS') || upper.startsWith('JS ') || upper.includes('JUNIOR')) {
        return isBoarding ? 'juniorBoarders' : 'juniorDay';
    }
    if (upper.startsWith('SS') || upper.startsWith('S.S') || upper.includes('SENIOR')) {
        return isBoarding ? 'seniorBoarders' : 'seniorDay';
    }
    // Primary / KG / Nursery
    return isBoarding ? 'primaryBoarders' : 'primaryDay';
};
 

// ═══════════════════════════════════════════════════════════════════════════
// GET /settings/fees
// ═══════════════════════════════════════════════════════════════════════════
 
const getFeeStructure = async () => {
    const settings = await Settings.getSingleton();
 
    // Seed defaults if feeStructure is empty
    const fs = settings.feeStructure || {};
    const CATS = ['primaryDay', 'primaryBoarders', 'juniorDay', 'juniorBoarders', 'seniorDay', 'seniorBoarders'];
    let needsSave = false;
 
    for (const cat of CATS) {
        if (!fs[cat] || !fs[cat].firstTerm || !fs[cat].firstTerm.items || !fs[cat].firstTerm.items.length) {
            fs[cat] = DEFAULT_FEE_STRUCTURE[cat];
            needsSave = true;
        }
    }
 
    if (needsSave) {
        settings.feeStructure = fs;
        settings.markModified('feeStructure');
        await settings.save();
    }
 
    return { feeStructure: settings.feeStructure };
};
 
// ═══════════════════════════════════════════════════════════════════════
// PUT /settings/fees
// ═══════════════════════════════════════════════════════════════════════
 
const updateFeeStructure = async (body, updatedBy) => {
    const settings = await Settings.getSingleton();
 
    if (body.feeStructure) {
        settings.feeStructure = body.feeStructure;
    } else {
        // Update a single category
        const { category, firstTerm, secondTerm, thirdTerm, label } = body;
        if (!settings.feeStructure) settings.feeStructure = {};
        if (!settings.feeStructure[category]) settings.feeStructure[category] = {};
 
        if (label !== undefined)      settings.feeStructure[category].label      = label;
        if (firstTerm !== undefined)  settings.feeStructure[category].firstTerm  = firstTerm;
        if (secondTerm !== undefined) settings.feeStructure[category].secondTerm = secondTerm;
        if (thirdTerm !== undefined)  settings.feeStructure[category].thirdTerm  = thirdTerm;
    }
 
    settings.lastUpdatedBy = updatedBy;
    settings.markModified('feeStructure');
    await settings.save();
 
    return { feeStructure: settings.feeStructure };
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    getSchoolInfo,
    updateSchoolInfo,
    getAcademicSettings,
    updateAcademicSession,
    createTerm,
    updateTerm,
    deleteTerm,
    setCurrentTerm,
    getNotificationSettings,
    updateNotificationSettings,
    getSecuritySettings,
    updateSecuritySettings,
    forcePasswordReset,
    clearAllSessions,

    getFeeStructure,
    updateFeeStructure,
    deriveFeeCategory,
    termSlotName

};
