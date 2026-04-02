/**
 * routes/reportCardRoutes.js
 *
 * Admin report card routes with JWT + role guards.
 *
 * Score entry:
 *   GET  /results?class=&subject=&term=&session=          get class scores for one subject
 *   POST /results/bulk                                    save/update scores (JSON) in bulk
 *   GET  /results/template?class=&subject=&term=&session= download pre-filled CSV template
 *   POST /results/csv-upload                              upload completed CSV and save scores
 *   GET  /results/summary                                 class summary across all subjects
 *   GET  /results/subjects?class=                         subjects assigned to a class
 *
 * Report cards:
 *   POST /report-cards/generate                           compile scores into report cards
 *   GET  /report-cards                                    class report card list
 *   GET  /report-cards/student/:studentId                 single report card
 *   PUT  /report-cards/student/:studentId/traits          update traits and comments
 *   POST /report-cards/publish                            publish or unpublish class cards
 *   GET  /report-cards/student/:studentId/pdf             download PDF
 *
 * Mount in server.js:
 *   app.use('/api/v1', require('./routes/reportCardRoutes'));
 */

const express = require('express');
const router  = express.Router();

const { protect, authorize, ROLES } = require('../middleware/auth');
const ctrl = require('../controllers/reportCardController');

// Role groups
const READ_ROLES  = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.TEACHER];
const WRITE_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.TEACHER];
const CRUD_ROLES  = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRINCIPAL];

router.use(protect);

// Score entry — static sub-routes BEFORE parameterised ones
router.get('/results/summary',     authorize(...READ_ROLES),  ctrl.getClassSummary);
router.get('/results/subjects',    authorize(...READ_ROLES),  ctrl.getSubjectsForClass);
router.get('/results/template',    authorize(...READ_ROLES),  ctrl.downloadScoreTemplate);
router.get('/results',             authorize(...READ_ROLES),  ctrl.getClassSubjectScores);
router.post('/results/bulk',       authorize(...WRITE_ROLES), ctrl.bulkSaveScores);
router.post('/results/csv-upload', authorize(...WRITE_ROLES), ctrl.uploadCsvScores);

// Report cards — specific sub-paths BEFORE generic /:studentId
router.post('/report-cards/generate', authorize(...CRUD_ROLES), ctrl.generateReportCards);
router.post('/report-cards/publish',  authorize(...CRUD_ROLES), ctrl.publishReportCards);
router.get('/report-cards',           authorize(...READ_ROLES),  ctrl.getClassReportCards);
router.get('/report-cards/student/:studentId/pdf',    authorize(...CRUD_ROLES),  ctrl.downloadReportCardPdf);
router.put('/report-cards/student/:studentId/traits', authorize(...WRITE_ROLES), ctrl.updateTraits);
router.get('/report-cards/student/:studentId',        authorize(...READ_ROLES),  ctrl.getReportCard);

module.exports = router;
