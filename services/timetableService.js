/**
 * timetableService.js
 *
 * All database interactions and business logic for the Timetable sub-module
 * (Academics 3.11 – 3.14).
 *
 * One Timetable document represents the full week grid for
 * one class arm × one session × one term.
 */

const Timetable   = require('../model/timetable.model');
const Class       = require('../model/class.model');
const Subject     = require('../model/subject.model');
const ErrorResponse = require('../../utils/errorResponse');

const {
    DAYS_OF_WEEK,
    TEACH_SLOT_IDS,
    BREAK_SLOT_IDS,
    ALL_SLOT_IDS,
} = require('../model/timetable.model');

// ─── Defaults ─────────────────────────────────────────────────────────────────

/** Returns the current academic session string e.g. "2025/2026" */
const currentSession = () => {
    const now  = new Date();
    const year = now.getFullYear();
    // Nigerian school year: Sept – July
    return now.getMonth() >= 8 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
};

/** Returns the current term string based on month */
const currentTerm = () => {
    const month = new Date().getMonth(); // 0-based
    if (month >= 8 && month <= 11) return '1st Term';
    if (month >= 0 && month <= 2)  return '2nd Term';
    return '3rd Term';
};

// ─── Shape Helpers ────────────────────────────────────────────────────────────

/**
 * Builds the timetable response grid, injecting break slot markers
 * and computing stats.
 *
 * @param {object} doc - Timetable Mongoose lean doc
 */
const buildTimetableResponse = (doc) => {
    const timetable = {};
    let   filledSlots      = 0;
    const teacherSet       = new Set();

    for (const day of DAYS_OF_WEEK) {
        timetable[day] = {};
        const dayData  = doc.slots?.[day] || {};

        for (const slotId of ALL_SLOT_IDS) {
            if (BREAK_SLOT_IDS.includes(slotId)) {
                // Inject break marker — never stored in DB
                timetable[day][slotId] = { isBreak: true };
                continue;
            }

            const cell = dayData[slotId];
            if (cell && cell.subjectId) {
                filledSlots++;
                if (cell.teacherId) teacherSet.add(cell.teacherId);

                timetable[day][slotId] = {
                    subject: {
                        id:    cell.subjectId,
                        name:  cell.subjectName,
                        code:  cell.subjectCode,
                        color: cell.color || '',
                    },
                    teacher: {
                        id:       cell.teacherId,
                        name:     cell.teacherName,
                        initials: (cell.teacherName || '')
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase(),
                    },
                    note: cell.note || '',
                };
            } else {
                timetable[day][slotId] = null;
            }
        }
    }

    const totalSlots       = DAYS_OF_WEEK.length * TEACH_SLOT_IDS.length;
    const completionPercent = Math.round((filledSlots / totalSlots) * 100);

    return {
        className: doc.className,
        session:   doc.session,
        term:      doc.term,
        timetable,
        stats: {
            filledSlots,
            totalSlots,
            completionPercent,
            teachersInvolved: teacherSet.size,
        },
    };
};

// ─── Find or Create Timetable ─────────────────────────────────────────────────

/**
 * Finds a timetable document for className+session+term,
 * creating an empty one if it doesn't exist yet.
 *
 * @param {string} className
 * @param {string} session
 * @param {string} term
 * @param {string} [userId]  - For createdBy audit on first create
 */
const findOrCreate = async (className, session, term, userId = '') => {
    let tt = await Timetable.findOne({ className, session, term });
    if (!tt) {
        tt = await Timetable.create({
            className,
            session,
            term,
            slots:     {},
            createdBy: userId,
        });
    }
    return tt;
};

// ─── 3.11  Get Timetable for Class ────────────────────────────────────────────

/**
 * Retrieves the timetable for a class + session + term.
 * Returns an empty grid if none exists yet.
 *
 * @param {string} className - URL-decoded class name
 * @param {object} query     - { session?, term? }
 */
const getTimetableForClass = async (className, { session, term } = {}) => {
    // Verify the class exists in the DB
    const cls = await Class.findOne({ name: new RegExp(`^${className}$`, 'i') }).lean();
    if (!cls) {
        throw new ErrorResponse(`Class '${className}' not found`, 404);
    }

    const resolvedSession = session || currentSession();
    const resolvedTerm    = term    || currentTerm();

    const tt = await Timetable.findOne({
        className: cls.name,
        session:   resolvedSession,
        term:      resolvedTerm,
    }).lean();

    if (!tt) {
        // Return an empty grid rather than a 404 — class exists, timetable not yet built
        const emptyGrid = {};
        for (const day of DAYS_OF_WEEK) {
            emptyGrid[day] = {};
            for (const slotId of ALL_SLOT_IDS) {
                emptyGrid[day][slotId] = BREAK_SLOT_IDS.includes(slotId)
                    ? { isBreak: true }
                    : null;
            }
        }
        return {
            className: cls.name,
            session:   resolvedSession,
            term:      resolvedTerm,
            timetable: emptyGrid,
            stats: {
                filledSlots:        0,
                totalSlots:         DAYS_OF_WEEK.length * TEACH_SLOT_IDS.length,
                completionPercent:  0,
                teachersInvolved:   0,
            },
        };
    }

    return buildTimetableResponse(tt);
};

// ─── 3.12  Save / Update Timetable Cell ──────────────────────────────────────

/**
 * Assigns a subject + teacher to a single slot.
 *
 * Business rules enforced:
 *   1. Break slots cannot be written to (validated in Joi schema too).
 *   2. Teacher cannot be assigned to two classes in the same slot+day+session+term.
 *
 * @param {string} className - URL-decoded class name
 * @param {object} body      - Validated request body
 * @param {string} userId    - Auth user ID (for audit)
 */
const saveTimetableCell = async (className, body, userId) => {
    const { day, slotId, subjectId, teacherId, note, session, term } = body;

    // Guard: break slots (belt-and-suspenders; Joi already blocks BREAK_SLOT_IDS)
    if (BREAK_SLOT_IDS.includes(slotId)) {
        throw new ErrorResponse(
            `Slot '${slotId}' is a break period and cannot be assigned.`,
            400,
            [{ code: 'BREAK_SLOT' }]
        );
    }

    // Verify class exists
    const cls = await Class.findOne({ name: new RegExp(`^${className}$`, 'i') }).lean();
    if (!cls) {
        throw new ErrorResponse(`Class '${className}' not found`, 404, [{ code: 'CLASS_NOT_FOUND' }]);
    }

    // Resolve subject snapshot
    const subject = await Subject.findOne({ subjectId: subjectId.toUpperCase() }).lean();
    if (!subject) {
        throw new ErrorResponse(`Subject '${subjectId}' not found`, 404);
    }

    // Resolve teacher snapshot
    const Staff = require('../../model/staff');
    const staff = await Staff.findOne(
        { staffId: teacherId.toUpperCase() },
        { staffId: 1, surname: 1, firstName: 1 }
    ).lean();
    if (!staff) {
        throw new ErrorResponse(`Staff member '${teacherId}' not found`, 404);
    }

    const resolvedSession = session || currentSession();
    const resolvedTerm    = term    || currentTerm();

    // Clash detection: same teacher, same day, same slot, different class, same session+term
    const clashQuery = {
        className: { $ne: cls.name },
        session:   resolvedSession,
        term:      resolvedTerm,
        [`slots.${day}.${slotId}.teacherId`]: staff.staffId,
    };
    const clash = await Timetable.findOne(clashQuery, { className: 1 }).lean();
    if (clash) {
        throw new ErrorResponse(
            `Teacher '${staff.surname} ${staff.firstName}' is already assigned to '${clash.className}' on ${day} slot ${slotId}.`,
            409,
            [{ code: 'TEACHER_CLASH' }]
        );
    }

    // Find or create the timetable document
    const tt = await findOrCreate(cls.name, resolvedSession, resolvedTerm, userId);

    // Write the cell
    const cellPath = `slots.${day}.${slotId}`;
    tt.set(cellPath, {
        subjectId:   subject.subjectId,
        subjectName: subject.name,
        subjectCode: subject.code,
        color:       subject.color || '',
        teacherId:   staff.staffId,
        teacherName: `${staff.surname} ${staff.firstName}`,
        note:        note || '',
    });

    tt.lastUpdatedBy = userId;
    tt.markModified('slots');
    await tt.save();

    return {
        className: cls.name,
        day,
        slotId,
        subject: {
            id:   subject.subjectId,
            name: subject.name,
            code: subject.code,
        },
        teacher: {
            id:   staff.staffId,
            name: `${staff.surname} ${staff.firstName}`,
        },
        note: note || '',
    };
};

// ─── 3.13  Clear Timetable Cell ───────────────────────────────────────────────

/**
 * Removes subject + teacher assignment from a single slot.
 *
 * @param {string} className
 * @param {object} body - { day, slotId, session?, term? }
 * @param {string} userId
 */
const clearTimetableCell = async (className, body, userId) => {
    const { day, slotId, session, term } = body;

    const cls = await Class.findOne({ name: new RegExp(`^${className}$`, 'i') }).lean();
    if (!cls) {
        throw new ErrorResponse(`Class '${className}' not found`, 404, [{ code: 'CLASS_NOT_FOUND' }]);
    }

    const resolvedSession = session || currentSession();
    const resolvedTerm    = term    || currentTerm();

    const tt = await Timetable.findOne({
        className: cls.name,
        session:   resolvedSession,
        term:      resolvedTerm,
    });

    if (!tt) {
        // Nothing to clear — idempotent success
        return { className: cls.name, day, slotId };
    }

    tt.set(`slots.${day}.${slotId}`, null);
    tt.lastUpdatedBy = userId;
    tt.markModified('slots');
    await tt.save();

    return { className: cls.name, day, slotId };
};

// ─── 3.14  Clear Full Timetable for Class ─────────────────────────────────────

/**
 * Removes ALL slot assignments for a class in a given session + term.
 *
 * @param {string} className
 * @param {object} query - { session?, term? }
 * @param {string} userId
 */
const clearFullTimetable = async (className, { session, term } = {}, userId) => {
    const cls = await Class.findOne({ name: new RegExp(`^${className}$`, 'i') }).lean();
    if (!cls) {
        throw new ErrorResponse(`Class '${className}' not found`, 404, [{ code: 'CLASS_NOT_FOUND' }]);
    }

    const resolvedSession = session || currentSession();
    const resolvedTerm    = term    || currentTerm();

    const tt = await Timetable.findOne({
        className: cls.name,
        session:   resolvedSession,
        term:      resolvedTerm,
    });

    if (!tt) {
        return { className: cls.name, slotsCleared: 0 };
    }

    // Count filled slots before wiping
    let slotsCleared = 0;
    for (const day of DAYS_OF_WEEK) {
        for (const slotId of TEACH_SLOT_IDS) {
            if (tt.slots?.[day]?.[slotId]?.subjectId) slotsCleared++;
        }
    }

    // Reset slots to empty
    tt.slots = {};
    tt.lastUpdatedBy = userId;
    tt.markModified('slots');
    await tt.save();

    return { className: cls.name, slotsCleared };
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    getTimetableForClass,
    saveTimetableCell,
    clearTimetableCell,
    clearFullTimetable,
};
