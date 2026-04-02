const mongoose = require('mongoose');
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
        sessionVersion: { type: Number, default: 1 },
    },
    { _id: false }
);


const FeeLineItemSchema = new mongoose.Schema(
    {
        description: { type: String, required: true, trim: true },
        amount:      { type: Number, required: true, min: 0 },
    },
    { _id: false }
);
 
const FeeTermSchema = new mongoose.Schema(
    {
        items: { type: [FeeLineItemSchema], default: [] },
    },
    { _id: false }
);
 
const FeeCategorySchema = new mongoose.Schema(
    {
        label:      { type: String, trim: true, default: '' },
        firstTerm:  { type: FeeTermSchema, default: () => ({ items: [] }) },
        secondTerm: { type: FeeTermSchema, default: () => ({ items: [] }) },
        thirdTerm:  { type: FeeTermSchema, default: () => ({ items: [] }) },
    },
    { _id: false }
);
 
const FeeStructureSchema = new mongoose.Schema(
    {
        primaryDay:      { type: FeeCategorySchema, default: () => ({}) },
        primaryBoarders: { type: FeeCategorySchema, default: () => ({}) },
        juniorDay:       { type: FeeCategorySchema, default: () => ({}) },
        juniorBoarders:  { type: FeeCategorySchema, default: () => ({}) },
        seniorDay:       { type: FeeCategorySchema, default: () => ({}) },
        seniorBoarders:  { type: FeeCategorySchema, default: () => ({}) },
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
        feeStructure: { type: FeeStructureSchema, default: () => ({}) },

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

const DEFAULT_FEE_STRUCTURE = {
    primaryDay: {
        label: 'Primary (Day)',
        firstTerm:  { items: [{ description: 'Tuition', amount: 120000 }, { description: 'Uniform & Shoes', amount: 26000 }, { description: 'Books & Stationery', amount: 30000 }, { description: 'Development Levy', amount: 3000 }, { description: 'Computer Levy', amount: 500 }, { description: 'Sport Wears', amount: 14000 }, { description: 'Other Levies', amount: 12500 }] },
        secondTerm: { items: [{ description: 'Tuition', amount: 120000 }, { description: 'Health Levy', amount: 1000 }, { description: 'Exam Fees', amount: 2000 }] },
        thirdTerm:  { items: [{ description: 'Tuition', amount: 120000 }, { description: 'Health Levy', amount: 1000 }, { description: 'Exam Fees', amount: 2000 }, { description: 'End of Session', amount: 8000 }] },
    },
    primaryBoarders: {
        label: 'Primary (Boarders)',
        firstTerm:  { items: [{ description: 'Tuition', amount: 185000 }, { description: 'Uniform', amount: 15000 }, { description: 'Shoes', amount: 10000 }, { description: 'Examination', amount: 1000 }, { description: 'Computer', amount: 500 }, { description: 'Development Levy', amount: 3000 }, { description: 'Chair Levy', amount: 2000 }, { description: 'Science Levy', amount: 500 }, { description: 'Coaching', amount: 3000 }, { description: 'Cardigan', amount: 7000 }, { description: 'Student File', amount: 500 }, { description: 'Report Sheet', amount: 1000 }, { description: 'Health & Laundry', amount: 6000 }, { description: 'Exercise Books', amount: 6000 }, { description: 'Sport Wears', amount: 14000 }, { description: 'Hostel Wears', amount: 24000 }, { description: 'Social Wears', amount: 25000 }, { description: 'End of Session', amount: 8000 }, { description: 'Textbooks', amount: 30000 }] },
        secondTerm: { items: [{ description: 'Tuition', amount: 260500 }, { description: 'Health & Laundry', amount: 6000 }, { description: 'Exercise Books', amount: 6000 }, { description: 'Exam Fees', amount: 1000 }, { description: 'Coaching', amount: 3000 }, { description: 'Miscellaneous', amount: 1500 }] },
        thirdTerm:  { items: [{ description: 'Tuition', amount: 260500 }, { description: 'Health & Laundry', amount: 6000 }, { description: 'Exercise Books', amount: 6000 }, { description: 'Exam Fees', amount: 1000 }, { description: 'Coaching', amount: 3000 }, { description: 'End of Session', amount: 8000 }, { description: 'Miscellaneous', amount: 1500 }] },
    },
    juniorDay: {
        label: 'Junior Secondary (Day)',
        firstTerm:  { items: [{ description: 'Tuition', amount: 50000 }, { description: 'Uniform', amount: 20000 }, { description: 'Shoes', amount: 11000 }, { description: 'Computer Levy', amount: 3000 }, { description: 'Skill Acquisition', amount: 3000 }, { description: 'Development Levy', amount: 6000 }, { description: 'Chair Levy', amount: 2000 }, { description: 'Science Levy', amount: 1000 }, { description: 'Coaching', amount: 4000 }, { description: 'Identity Card', amount: 2000 }, { description: 'Cardigan', amount: 7000 }, { description: 'Student File', amount: 1000 }, { description: 'Report Sheet', amount: 1000 }, { description: 'Health Levy', amount: 1000 }, { description: 'Exercise Books', amount: 10000 }, { description: 'Sport Wears', amount: 14000 }, { description: 'Textbooks', amount: 50000 }] },
        secondTerm: { items: [{ description: 'Tuition', amount: 142000 }, { description: 'Health Levy', amount: 1000 }, { description: 'Exercise Books', amount: 5000 }, { description: 'Exam Fees', amount: 2000 }, { description: 'Anniversary', amount: 4000 }, { description: 'Coaching', amount: 4000 }, { description: 'Miscellaneous', amount: 13000 }] },
        thirdTerm:  { items: [{ description: 'Tuition', amount: 142000 }, { description: 'Health Levy', amount: 1000 }, { description: 'Exercise Books', amount: 5000 }, { description: 'Exam Fees', amount: 2000 }, { description: 'End of Session', amount: 8000 }, { description: 'Coaching', amount: 4000 }, { description: 'Miscellaneous', amount: 17000 }] },
    },
    juniorBoarders: {
        label: 'Junior Secondary (Boarders)',
        firstTerm:  { items: [{ description: 'Tuition', amount: 215000 }, { description: 'Uniform', amount: 20000 }, { description: 'Shoes', amount: 11000 }, { description: 'Computer Levy', amount: 3000 }, { description: 'Skill Acquisition', amount: 3000 }, { description: 'Development Levy', amount: 3000 }, { description: 'Chair Levy', amount: 2000 }, { description: 'Science Levy', amount: 1000 }, { description: 'Coaching', amount: 3000 }, { description: 'Identity Card', amount: 2000 }, { description: 'Cardigan', amount: 7000 }, { description: 'Student File', amount: 1000 }, { description: 'Report Sheet', amount: 1000 }, { description: 'Health & Laundry', amount: 6000 }, { description: 'Exercise Books', amount: 11000 }, { description: 'Sport Wears', amount: 14000 }, { description: 'Hostel Wears', amount: 16000 }, { description: 'Church Wears', amount: 25000 }, { description: 'Anniversary', amount: 4000 }, { description: 'Textbooks', amount: 50000 }] },
        secondTerm: { items: [{ description: 'Tuition', amount: 273000 }, { description: 'Health & Laundry', amount: 6000 }, { description: 'Exercise Books', amount: 6000 }, { description: 'Exam Fees', amount: 2000 }, { description: 'Coaching', amount: 3000 }, { description: 'End of Session', amount: 8000 }, { description: 'Miscellaneous', amount: 4000 }] },
        thirdTerm:  { items: [{ description: 'Tuition', amount: 273000 }, { description: 'Health & Laundry', amount: 6000 }, { description: 'Exercise Books', amount: 6000 }, { description: 'Exam Fees', amount: 2000 }, { description: 'Coaching', amount: 3000 }, { description: 'End of Session', amount: 8000 }, { description: 'Miscellaneous', amount: 12000 }] },
    },
    seniorDay: {
        label: 'Senior Secondary (Day)',
        firstTerm:  { items: [{ description: 'Tuition', amount: 50000 }, { description: 'Uniform', amount: 22000 }, { description: 'Shoes', amount: 11000 }, { description: 'Computer Levy', amount: 3000 }, { description: 'Skill Acquisition', amount: 3000 }, { description: 'Development Levy', amount: 6000 }, { description: 'Chair Levy', amount: 2000 }, { description: 'Science Levy', amount: 2000 }, { description: 'Coaching', amount: 3000 }, { description: 'Identity Card', amount: 2000 }, { description: 'Cardigan', amount: 7000 }, { description: 'Student File', amount: 1000 }, { description: 'Report Sheet', amount: 1000 }, { description: 'Health Levy', amount: 1000 }, { description: 'Exercise Books', amount: 11000 }, { description: 'Sport Wears', amount: 14000 }, { description: 'Textbooks', amount: 50000 }] },
        secondTerm: { items: [{ description: 'Tuition', amount: 148000 }, { description: 'Health Levy', amount: 1000 }, { description: 'Exercise Books', amount: 5000 }, { description: 'Exam Fees', amount: 2000 }, { description: 'Anniversary', amount: 4000 }, { description: 'Coaching', amount: 3000 }, { description: 'Miscellaneous', amount: 13000 }] },
        thirdTerm:  { items: [{ description: 'Tuition', amount: 148000 }, { description: 'Health Levy', amount: 1000 }, { description: 'Exercise Books', amount: 5000 }, { description: 'Exam Fees', amount: 2000 }, { description: 'End of Session', amount: 8000 }, { description: 'Coaching', amount: 3000 }, { description: 'Miscellaneous', amount: 16000 }] },
    },
    seniorBoarders: {
        label: 'Senior Secondary (Boarders)',
        firstTerm:  { items: [{ description: 'Tuition', amount: 219000 }, { description: 'Uniform', amount: 20000 }, { description: 'Shoes', amount: 11000 }, { description: 'Computer Levy', amount: 3000 }, { description: 'Skill Acquisition', amount: 3000 }, { description: 'Development Levy', amount: 3000 }, { description: 'Chair Levy', amount: 2000 }, { description: 'Science Levy', amount: 2000 }, { description: 'Coaching', amount: 3000 }, { description: 'Identity Card', amount: 2000 }, { description: 'Cardigan', amount: 7000 }, { description: 'Student File', amount: 1000 }, { description: 'Report Sheet', amount: 1000 }, { description: 'Health & Laundry', amount: 6000 }, { description: 'Exercise Books', amount: 11000 }, { description: 'Sport Wears', amount: 14000 }, { description: 'Hostel Wears', amount: 20000 }, { description: 'Church Wears', amount: 25000 }, { description: 'Anniversary', amount: 4000 }, { description: 'Textbooks', amount: 50000 }] },
        secondTerm: { items: [{ description: 'Tuition', amount: 277000 }, { description: 'Health & Laundry', amount: 6000 }, { description: 'Exercise Books', amount: 6000 }, { description: 'Exam Fees', amount: 2000 }, { description: 'Coaching', amount: 3000 }, { description: 'End of Session', amount: 8000 }, { description: 'Miscellaneous', amount: 5000 }] },
        thirdTerm:  { items: [{ description: 'Tuition', amount: 277000 }, { description: 'Health & Laundry', amount: 6000 }, { description: 'Exercise Books', amount: 6000 }, { description: 'Exam Fees', amount: 2000 }, { description: 'Coaching', amount: 3000 }, { description: 'End of Session', amount: 8000 }, { description: 'Miscellaneous', amount: 13000 }] },
    },
};


module.exports.DEFAULT_FEE_STRUCTURE = DEFAULT_FEE_STRUCTURE