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
        startDate:   { type: Date,   required: true },
        endDate:     { type: Date,   required: true },
        current: { type: Boolean, default: false },
    },
    { _id: false }
);

const SessionSchema = new mongoose.Schema(
    {
        id:         { type: String, required: true, trim: true, unique: true }, // "SESS_2025_2026"
        name:       { type: String, required: true, trim: true },                // "2025/2026"
        startDate:  { type: Date,   required: true },
        endDate:    { type: Date,   required: true },
        current:  { type: Boolean, default: false },
        terms:      { type: [TermSchema], default: [] },
    },
    { _id: false }
);

// ─── Academic Schema with session management ─────────────────────────────────
const AcademicSchema = new mongoose.Schema(
    {
        sessions:       { type: [SessionSchema], default: [] },
        currentSession: { type: String, trim: true, default: '' }, // Session ID
        currentTerm:    { type: String, trim: true, default: '' }, // Term ID
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


/**
 * Create a new academic session
 * @param {Object} sessionData - { name, startDate, endDate }
 * @returns {Promise<Object>} - The created session
 */
SettingsSchema.methods.createSession = async function(sessionData) {
    const sessionId = `SESS_${sessionData.name.replace(/\//g, '_')}`;
    
    // Check if session already exists
    if (this.academic.sessions.some(s => s.id === sessionId)) {
        throw new Error('Session already exists');
    }
    
    const newSession = {
        id: sessionId,
        name: sessionData.name,
        startDate: new Date(sessionData.startDate),
        endDate: new Date(sessionData.endDate),
        current: false,
        terms: [],
    };
    
    this.academic.sessions.push(newSession);
    await this.save();
    return newSession;
};

/**
 * Update an existing session
 * @param {string} sessionId - Session ID
 * @param {Object} updates - { name, startDate, endDate }
 * @returns {Promise<Object>} - Updated session
 */
SettingsSchema.methods.updateSession = async function(sessionId, updates) {
    const session = this.academic.sessions.find(s => s.id === sessionId);
    if (!session) {
        throw new Error('Session not found');
    }
    
    if (updates.name) session.name = updates.name;
    if (updates.startDate) session.startDate = new Date(updates.startDate);
    if (updates.endDate) session.endDate = new Date(updates.endDate);
    
    await this.save();
    return session;
};

/**
 * Delete a session and all its terms
 * @param {string} sessionId - Session ID
 * @returns {Promise<boolean>}
 */
SettingsSchema.methods.deleteSession = async function(sessionId) {
    const session = this.academic.sessions.find(s => s.id === sessionId);
    if (!session) {
        throw new Error('Session not found');
    }
    
    if (session.current) {
        throw new Error('Cannot delete the current session');
    }
    
    this.academic.sessions = this.academic.sessions.filter(s => s.id !== sessionId);
    
    // Clear current session/term if they were deleted
    if (this.academic.currentSession === sessionId) {
        this.academic.currentSession = '';
        this.academic.currentTerm = '';
    }
    
    await this.save();
    return true;
};

/**
 * Set a session as the current session
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object>} - Updated session
 */
SettingsSchema.methods.setCurrentSession = async function(sessionId) {
    // Remove current flag from all sessions
    this.academic.sessions.forEach(s => {
        s.current = (s.id === sessionId);
    });
    
    this.academic.currentSession = sessionId;
    await this.save();
    
    return this.academic.sessions.find(s => s.id === sessionId);
};

/**
 * Create a new term under a session
 * @param {string} sessionId - Session ID
 * @param {Object} termData - { name, startDate, endDate }
 * @returns {Promise<Object>} - Created term
 */
SettingsSchema.methods.createTerm = async function(sessionId, termData) {
    const session = this.academic.sessions.find(s => s.id === sessionId);
    if (!session) {
        throw new Error('Session not found');
    }
    
    const termId = `TERM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check for duplicate term names within the same session
    if (session.terms.some(t => t.name === termData.name)) {
        throw new Error('Term with this name already exists in the session');
    }
    
    const newTerm = {
        id: termId,
        name: termData.name,
        startDate: new Date(termData.startDate),
        endDate: new Date(termData.endDate),
        current: false,
    };
    
    session.terms.push(newTerm);
    await this.save();
    return newTerm;
};

/**
 * Update an existing term
 * @param {string} termId - Term ID
 * @param {Object} updates - { name, startDate, endDate }
 * @returns {Promise<Object>} - Updated term
 */
SettingsSchema.methods.updateTerm = async function(termId, updates) {
    let foundTerm = null;
    let foundSession = null;
    
    // Find the term across all sessions
    for (const session of this.academic.sessions) {
        const term = session.terms.find(t => t.id === termId);
        if (term) {
            foundTerm = term;
            foundSession = session;
            break;
        }
    }
    
    if (!foundTerm) {
        throw new Error('Term not found');
    }
    
    if (updates.name) foundTerm.name = updates.name;
    if (updates.startDate) foundTerm.startDate = new Date(updates.startDate);
    if (updates.endDate) foundTerm.endDate = new Date(updates.endDate);
    
    await this.save();
    return foundTerm;
};

/**
 * Delete a term
 * @param {string} termId - Term ID
 * @returns {Promise<boolean>}
 */
SettingsSchema.methods.deleteTerm = async function(termId) {
    let foundSession = null;
    let termIndex = -1;
    
    // Find the term across all sessions
    for (const session of this.academic.sessions) {
        const index = session.terms.findIndex(t => t.id === termId);
        if (index !== -1) {
            foundSession = session;
            termIndex = index;
            break;
        }
    }
    
    if (!foundSession) {
        throw new Error('Term not found');
    }
    
    const term = foundSession.terms[termIndex];
    if (term.current) {
        throw new Error('Cannot delete the current term');
    }
    
    foundSession.terms.splice(termIndex, 1);
    
    // Clear current term if it was deleted
    if (this.academic.currentTerm === termId) {
        this.academic.currentTerm = '';
    }
    
    await this.save();
    return true;
};

/**
 * Set a term as the current term
 * @param {string} termId - Term ID
 * @returns {Promise<Object>} - Updated term
 */
SettingsSchema.methods.setCurrentTerm = async function(termId) {
    let foundTerm = null;
    
    // Remove current flag from all terms across all sessions
    for (const session of this.academic.sessions) {
        session.terms.forEach(term => {
            console.log(term.id, termId)
            if (term.id === termId) {
                term.current = true;
                foundTerm = term;
            } else {
                term.current = false;
            }
        });
    }
    
    if (!foundTerm) {
        throw new Error('Term not found');
    }
    
    this.academic.currentTerm = termId;
    await this.save();
    return foundTerm;
};

/**
 * Get all terms for a specific session
 * @param {string} sessionId - Session ID
 * @returns {Array} - Array of terms
 */
SettingsSchema.methods.getTermsBySession = function(sessionId) {
    const session = this.academic.sessions.find(s => s.id === sessionId);
    return session ? session.terms : [];
};

/**
 * Get the current session with its terms
 * @returns {Object|null} - Current session object or null
 */
SettingsSchema.methods.getCurrentSession = function() {
    return this.academic.sessions.find(s => s.current) || null;
};

/**
 * Get the current term
 * @returns {Object|null} - Current term object or null
 */
SettingsSchema.methods.getCurrentTerm = function() {
    for (const session of this.academic.sessions) {
        const term = session.terms.find(t => t.current);
        if (term) return term;
    }
    return null;
};



const Settings = mongoose.model('Settings', SettingsSchema);

module.exports = Settings;
module.exports.SINGLETON_KEY          = SINGLETON_KEY;
module.exports.NOTIFICATION_IDS       = NOTIFICATION_IDS;
module.exports.NOTIFICATION_LABELS    = NOTIFICATION_LABELS;
module.exports.VALID_SESSION_TIMEOUTS = VALID_SESSION_TIMEOUTS;
