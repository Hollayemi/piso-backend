/**
 * controllers/reportCardController.js
 *
 * HTTP layer for the Report Card module.
 *
 * Admin endpoints:
 *   GET    /results?class=&subject=&term=&session=       → getClassSubjectScores
 *   POST   /results/bulk                                 → bulkSaveScores
 *   GET    /results/summary?class=&term=&session=        → getClassSummary
 *   GET    /results/subjects?class=                      → getSubjectsForClass
 *
 *   POST   /report-cards/generate                        → generateReportCards
 *   GET    /report-cards?class=&term=&session=           → getClassReportCards
 *   GET    /report-cards/student/:studentId?term=&session= → getReportCard
 *   PUT    /report-cards/student/:studentId/traits       → updateTraits
 *   POST   /report-cards/publish                         → publishReportCards
 *   GET    /report-cards/student/:studentId/pdf          → downloadReportCardPdf (admin)
 *
 * Parent endpoints:
 *   GET    /parent/report-cards/:studentId?term=&session= → getMyReportCard
 *   GET    /parent/report-cards/:studentId/all           → getMyReportCards
 *   GET    /parent/report-cards/:studentId/pdf?term=&session= → downloadMyReportCardPdf
 */

const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const { sendSuccess } = require('../utils/sendResponse');
const Joi = require('joi');

const subjectScoreService = require('../services/subjectScoreService');
const reportCardService = require('../services/reportCardService');

// ─── Validation helpers ───────────────────────────────────────────────────────

const extractJoiErrors = (joiError) =>
  joiError.details.map((d) => ({ field: d.path.join('.'), message: d.message.replace(/['"]/g, '') }));

// ─── Score entry schemas ──────────────────────────────────────────────────────

const bulkSaveSchema = Joi.object({
  class: Joi.string().trim().required().messages({ 'any.required': 'class is required' }),
  subject: Joi.string().trim().required().messages({ 'any.required': 'subject is required' }),
  term: Joi.string().trim().optional(),
  session: Joi.string().trim().optional(),
  scores: Joi.array()
    .items(
      Joi.object({
        studentId: Joi.string().trim().required(),
        test1: Joi.number().min(0).max(20).allow(null).optional(),
        test2: Joi.number().min(0).max(20).allow(null).optional(),
        exam: Joi.number().min(0).max(60).allow(null).optional(),
        firstTerm: Joi.number().min(0).max(100).allow(null).optional(),
        secondTerm: Joi.number().min(0).max(100).allow(null).optional(),
      })
    )
    .min(1)
    .required(),
});

const generateSchema = Joi.object({
  class: Joi.string().trim().required().messages({ 'any.required': 'class is required' }),
  term: Joi.string().trim().optional(),
  session: Joi.string().trim().optional(),
});

const publishSchema = Joi.object({
  class: Joi.string().trim().required().messages({ 'any.required': 'class is required' }),
  term: Joi.string().trim().optional(),
  session: Joi.string().trim().optional(),
  unpublish: Joi.boolean().optional().default(false),
});

const traitsSchema = Joi.object({
  affective: Joi.object().optional(),
  psychomotor: Joi.object().optional(),
  classTeacherComment: Joi.string().trim().allow('').optional(),
  principalComment: Joi.string().trim().allow('').optional(),
  termEndDate: Joi.string().trim().allow('').optional(),
  nextTermBegins: Joi.string().trim().allow('').optional(),
  schoolDaysOpened: Joi.alternatives().try(Joi.number(), Joi.string()).optional(),
  daysPresent: Joi.alternatives().try(Joi.number(), Joi.string()).optional(),
  daysAbsent: Joi.alternatives().try(Joi.number(), Joi.string()).optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — Score Entry
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc  Get all students' scores for a specific class + subject
 * @route GET /api/v1/results
 * @access admin | teacher | principal
 */
exports.getClassSubjectScores = asyncHandler(async (req, res) => {
  const result = await subjectScoreService.getClassSubjectScores(req.query);
  sendSuccess(res, 200, '', result);
});

/**
 * @desc  Bulk save / update scores for multiple students
 * @route POST /api/v1/results/bulk
 * @access admin | teacher
 */
exports.bulkSaveScores = asyncHandler(async (req, res, next) => {
  console.log({ scrs: req.body })
  const { error, value } = bulkSaveSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));

  const result = await subjectScoreService.bulkSaveScores(value, req.user.id);
  sendSuccess(res, 200, 'Scores saved successfully', result);
});

/**
 * @desc  Download a pre-filled CSV score template for a class + subject
 *        Every student in the class is included with their ID, surname, and
 *        first name. Existing scores are pre-populated so re-downloads never
 *        lose previously entered data.
 * @route GET /api/v1/results/template?class=&subject=&term=&session=
 * @access admin | teacher | principal
 */
exports.downloadScoreTemplate = asyncHandler(async (req, res) => {
  const { csv, filename } = await subjectScoreService.getScoreTemplate(req.query);

  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  res.send(csv);
});

/**
 * @desc  Upload a completed CSV file and save scores to the database.
 *        Accepts multipart/form-data with a single field called "csv".
 *        Query params (or body fields): class, subject, term, session.
 *        Returns a summary of saved rows and any row-level validation errors.
 * @route POST /api/v1/results/csv-upload
 * @access admin | teacher
 */
exports.uploadCsvScores = asyncHandler(async (req, res, next) => {
  const file = req.files?.csv;
  if (!file) {
    return next(new ErrorResponse('No CSV file uploaded. Send it as a multipart field named "csv".', 400));
  }

  // Accept class/subject/term/session from either query-string or form body
  const params = { ...req.query, ...req.body };

  const result = await subjectScoreService.uploadCsvScores(file, params, req.user.id);

  const message = result.hasErrors
    ? `${result.saved} score(s) saved with ${result.errors.length} warning(s)`
    : `${result.saved} score(s) saved successfully`;

  sendSuccess(res, 200, message, result);
});

/**
 * @desc  Get class summary across all subjects
 * @route GET /api/v1/results/summary
 * @access admin | principal
 */
exports.getClassSummary = asyncHandler(async (req, res) => {
  const result = await subjectScoreService.getClassSummary(req.query);
  sendSuccess(res, 200, '', result);
});

/**
 * @desc  Get list of subjects assigned to a class
 * @route GET /api/v1/results/subjects
 * @access admin | teacher | principal
 */
exports.getSubjectsForClass = asyncHandler(async (req, res) => {
  const { class: cls } = req.query;
  if (!cls) throw new ErrorResponse('class query param is required', 400);
  const result = await subjectScoreService.getSubjectsForClass(cls);
  sendSuccess(res, 200, '', result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — Report Cards
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc  Generate (compile) report cards for a class from SubjectScore data
 * @route POST /api/v1/report-cards/generate
 * @access admin | principal
 */
exports.generateReportCards = asyncHandler(async (req, res, next) => {
  const { error, value } = generateSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));

  const result = await reportCardService.generateReportCards(value, req.user.id);
  sendSuccess(res, 200, `Report cards generated: ${result.total} (${result.created} new, ${result.updated} updated)`, result);
});

/**
 * @desc  Get list of students with report card status for a class
 * @route GET /api/v1/report-cards
 * @access admin | principal | teacher
 */
exports.getClassReportCards = asyncHandler(async (req, res) => {
  const result = await reportCardService.getClassReportCards(req.query);
  sendSuccess(res, 200, '', result);
});

/**
 * @desc  Get full report card for one student
 * @route GET /api/v1/report-cards/student/:studentId
 * @access admin | principal | teacher
 */
exports.getReportCard = asyncHandler(async (req, res) => {
  const result = await reportCardService.getReportCard({
    studentId: req.params.studentId,
    term: req.query.term,
    session: req.query.session,
  });
  sendSuccess(res, 200, '', result);
});

/**
 * @desc  Update affective traits, psychomotor, comments
 * @route PUT /api/v1/report-cards/student/:studentId/traits
 * @access admin | teacher | principal
 */
exports.updateTraits = asyncHandler(async (req, res, next) => {
  const { error, value } = traitsSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));

  const result = await reportCardService.updateTraits(
    {
      studentId: req.params.studentId,
      term: req.query.term,
      session: req.query.session,
    },
    value,
    req.user.id
  );
  sendSuccess(res, 200, 'Traits and comments updated successfully', result);
});

/**
 * @desc  Publish (or unpublish) all report cards for a class
 * @route POST /api/v1/report-cards/publish
 * @access admin | principal
 */
exports.publishReportCards = asyncHandler(async (req, res, next) => {
  const { error, value } = publishSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));

  const result = await reportCardService.publishReportCards(value, req.user.id);
  const msg = value.unpublish
    ? `${result.published} report cards unpublished`
    : `${result.published} report cards published — parents can now view them`;
  sendSuccess(res, 200, msg, result);
});

/**
 * @desc  Download PDF report card (admin — any card)
 * @route GET /api/v1/report-cards/student/:studentId/pdf
 * @access admin | principal
 */
exports.downloadReportCardPdf = asyncHandler(async (req, res) => {
  const { pdfBuffer, filename } = await reportCardService.getReportCardPdf(
    req.params.studentId,
    { term: req.query.term, session: req.query.session },
    true   // adminAccess
  );

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': pdfBuffer.length,
  });
  res.send(pdfBuffer);
});

// ═══════════════════════════════════════════════════════════════════════════════
// PARENT — Report Cards
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc  Get published report card for a child (parent)
 * @route GET /api/v1/parent/report-cards/:studentId
 * @access parent
 */
exports.getMyReportCard = asyncHandler(async (req, res) => {
  const linkedStudentIds = req.parent?.linkedStudentIds || [];
  const result = await reportCardService.getMyReportCard(
    req.params.studentId,
    linkedStudentIds,
    { term: req.query.term, session: req.query.session }
  );
  sendSuccess(res, 200, '', result);
});

/**
 * @desc  Get all published report cards for a child (parent)
 * @route GET /api/v1/parent/report-cards/:studentId/all
 * @access parent
 */
exports.getMyReportCards = asyncHandler(async (req, res) => {
  const linkedStudentIds = req.parent?.linkedStudentIds || [];
  const result = await reportCardService.getMyReportCards(req.params.studentId, linkedStudentIds);
  sendSuccess(res, 200, '', result);
});

/**
 * @desc  Download published PDF report card (parent)
 * @route GET /api/v1/parent/report-cards/:studentId/pdf
 * @access parent
 */
exports.downloadMyReportCardPdf = asyncHandler(async (req, res) => {
  const linkedStudentIds = req.parent?.linkedStudentIds || [];

  // Access check
  if (!linkedStudentIds.includes(req.params.studentId.toUpperCase())) {
    throw new ErrorResponse('Access denied — this child is not linked to your account.', 403);
  }

  const { pdfBuffer, filename } = await reportCardService.getReportCardPdf(
    req.params.studentId,
    { term: req.query.term, session: req.query.session },
    false  // parentAccess — requires isPublished
  );

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': pdfBuffer.length,
  });
  res.send(pdfBuffer);
});
