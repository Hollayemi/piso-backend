/**
 * PATCH — model/staff.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Add the two fields below to the existing StaffSchema inside staff.model.js.
 * Place them in the "Authentication" section, just below the `password` field.
 *
 * These fields power:
 *   - 5.12  Force Password Reset  (mustResetPassword)
 *   - Auth  changePassword route  (mustResetPassword cleared on success)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FIND this block in staff.model.js (around line 200):
 *
 *     // ── Authentication ────────────────────────────────────────────────
 *     password: {
 *         type:   String,
 *         select: false,
 *     },
 *
 * REPLACE with:
 *
 *     // ── Authentication ────────────────────────────────────────────────
 *     password: {
 *         type:   String,
 *         select: false,
 *     },
 *
 *     /**
 *      * Set to true by POST /settings/security/force-password-reset.
 *      * The protect middleware blocks all requests except /auth/change-password
 *      * when this flag is true. Cleared automatically after a successful
 *      * password change.
 *      *\/
 *     mustResetPassword: {
 *         type:    Boolean,
 *         default: false,
 *     },
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Also ensure the model export alias matches what authService imports:
 *
 *   Current:  module.exports = mongoose.model('Staff', StaffSchema);
 *   Required: same — no change needed.
 *
 *   authService requires '../model/staff.model'
 *   settingsService requires '../model/staff.model'
 *
 *   If your file is named `staff.js` (not `staff.model.js`), update the
 *   require paths in authService.js and settingsService.js accordingly,
 *   or rename the file to staff.model.js for consistency with the rest of
 *   the codebase (class.model.js, inventory.model.js, etc.).
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Standalone snippet to copy into StaffSchema ───────────────────────────────

/**
 * mustResetPassword: Boolean
 *
 * When true, the protect middleware returns 403 on all routes except
 * /auth/change-password. Cleared automatically after a successful
 * password change via authService.changePassword().
 *
 * Set to true for all staff via:
 *   POST /api/v1/settings/security/force-password-reset
 */
const mustResetPasswordField = {
    mustResetPassword: {
        type:    Boolean,
        default: false,
    },
};

module.exports = mustResetPasswordField; // exported only for reference; do NOT import this file
