/**
 * settings.model.js
 *
 * Singleton document — exactly ONE record ever lives in this collection,
 * identified by the fixed _key = 'PISO_SETTINGS'.
 * Use Settings.getSingleton() to safely fetch-or-create it.
 *
 * Sub-documents:
 *   school        → API 5.1 – 5.2  (school information + logo)
 *   academic      → API 5.3 – 5.7  (session string + terms array)
 *   notifications → API 5.8 – 5.9  (notification toggles + sender config)
 *   security      → API 5.10 – 5.13 (password policy + session control)
 *
 * Session invalidation strategy (5.13):
 *   `security.sessionVersion` is a monotonically-increasing integer.
 *   Every JWT is issued with the current version embedded.
 *   POST /settings/security/clear-sessions increments this value,
 *   instantly invalidating every previously-issued token.
 *
 * Force password-reset strategy (5.12):
 *   Staff.mustResetPassword is set to true on all staff documents.
 *   The protect middleware returns 403 when this flag is set,
 *   except on the PUT /auth/change-password route.
 */

const mongoose = require('mongoose');

// ─── Constants ────────────────────────────────────────────────────────────────

const SINGLETON_KEY = 'PISO_SETTINGS';

const NOTIFICATION_IDS = [
    'fee_reminder',
    'admission_update',
    'attendance_alert',
    'result_publish',
    'trip_reminder',
    'payroll_notify',
];

const NOTIFICATION_LABELS = {
    fee_reminder:     'Fee Payment Reminders',
    admission_update: 'Admission Status Updates',
    attendance_alert: 'Attendance Alerts',
    result_publish:   'Result Publication',
    trip_reminder:    'Trip/Event Reminders',
    payroll_notify:   'Payroll Processed',
};

const VALID_SESSION_TIMEOUTS = [0, 30, 60, 120, 480];

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const SchoolInfoSchema = new mongoose.Schema(
    {
        name:          { type: String, trim: true, default: 'Progress Intellectual School' },
        shortName:     { type: String, trim: true, default: 'PISO' },
        address:       { type: String, trim: true, default: '' },
        phone:         { type: String, trim: true, default: '' },
        email:         { type: String, trim: true, lowercase: true, default: '' },
        website:       { type: String, trim: true, default: '' },
        motto:         { type: String, trim: true, default: '' },
        principalName: { type: String, trim: true, default: '' },
        logoUrl:       { type: String, trim: true, default: '' },
    },
    { _id: false }
);

const TermSchema = new mongoose.Schema(
    {
        id:      { type: String, required: true, trim: true },  // "T1", "T2" …
        name:    { type: String, required: true, trim: true },  // "1st Term"
        start:   { type: Date,   required: true },
        end:     { type: Date,   required: true },
        current: { type: Boolean, default: false },
    },
    { _id: false }
);

const AcademicSchema = new mongoose.Schema(
    {
        currentSession: { type: String, trim: true, default: '' },   // "2025/2026"
        currentTerm:    { type: String, trim: true, default: '' },   // "T1"
        terms:          { type: [TermSchema], default: [] },
    },
    { _id: false }
);

const NotificationItemSchema = new mongoose.Schema(
    {
        id:      { type: String, required: true, trim: true },
        label:   { type: String, required: true, trim: true },
        enabled: { type: Boolean, default: true },
    },
    { _id: false }
);

const SenderConfigSchema = new mongoose.Schema(
    {
        emailSenderName: { type: String, trim: true, default: 'Progress Intellectual School' },
        replyToEmail:    { type: String, trim: true, default: 'noreply@progressschools.com' },
    },
    { _id: false }
);

const NotificationsSchema = new mongoose.Schema(
    {
        items:        { type: [NotificationItemSchema], default: [] },
        senderConfig: { type: SenderConfigSchema, default: () => ({}) },
    },
    { _id: false }
);

const SecuritySchema = new mongoose.Schema(
    {
        twoFactor:             { type: Boolean, default: false },
        sessionTimeoutMinutes: { type: Number,  default: 60 },
        passwordMinLength:     { type: Number,  default: 8, min: 6, max: 32 },
        requireUppercase:      { type: Boolean, default: true },
        requireNumbers:        { type: Boolean, default: true },
        /**
         * Monotonically-increasing counter.
         * Incrementing this value invalidates ALL active JWT tokens because
         * every token embeds the version at the time of issuance.
         * The `protect` middleware rejects tokens whose embedded version
         * is lower than the current stored value.
         */
        sessionVersion: { type: Number, default: 1 },
    },
    { _id: false }
);

// ─── Main Settings Schema ─────────────────────────────────────────────────────

const SettingsSchema = new mongoose.Schema(
    {
        _key: {
            type:      String,
            default:   SINGLETON_KEY,
            unique:    true,
            immutable: true,
        },

        school:        { type: SchoolInfoSchema,   default: () => ({}) },
        academic:      { type: AcademicSchema,      default: () => ({}) },
        notifications: { type: NotificationsSchema, default: () => ({}) },
        security:      { type: SecuritySchema,       default: () => ({}) },

        lastUpdatedBy: { type: String, default: '' },
    },
    {
        timestamps: true,
    }
);

// ─── Static: fetch-or-create singleton ───────────────────────────────────────

/**
 * Returns the one Settings document, seeding it with safe defaults on
 * first use. Always call this instead of findOne() directly.
 *
 * @returns {Promise<Document>}
 */
SettingsSchema.statics.getSingleton = async function () {
    let doc = await this.findOne({ _key: SINGLETON_KEY });
    if (!doc) {
        doc = await this.create({
            notifications: {
                items: NOTIFICATION_IDS.map((id) => ({
                    id,
                    label:   NOTIFICATION_LABELS[id],
                    enabled: true,
                })),
                senderConfig: {},
            },
        });
    }
    return doc;
};

// ─── Export ───────────────────────────────────────────────────────────────────

const Settings = mongoose.model('Settings', SettingsSchema);

module.exports = Settings;
module.exports.SINGLETON_KEY          = SINGLETON_KEY;
module.exports.NOTIFICATION_IDS       = NOTIFICATION_IDS;
module.exports.NOTIFICATION_LABELS    = NOTIFICATION_LABELS;
module.exports.VALID_SESSION_TIMEOUTS = VALID_SESSION_TIMEOUTS;
