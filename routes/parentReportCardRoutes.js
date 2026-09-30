/**
 * routes/parentReportCardRoutes.js
 *
 * Parent-facing report card endpoints.
 * All routes require a valid parent JWT.
 *
 *   GET  /parent/report-cards/:studentId               — current term published card
 *   GET  /parent/report-cards/:studentId/all           — all terms published cards
 *   GET  /parent/report-cards/:studentId/pdf           — download published PDF
 *
 * Mount in server.js:
 *   app.use('/api/v1', require('./routes/parentReportCardRoutes'));
 */

const express = require('express');
const router  = express.Router();

const { protect }          = require('../middleware/auth');
const parentAuthMiddleware = require('../middleware/parentAuth');
const ctrl                 = require('../controllers/reportCardController');

router.use(protect);
router.use(parentAuthMiddleware);

// ⚠️ More-specific paths before /:studentId

router.get('/report-cards/:studentId/pdf', ctrl.downloadMyReportCardPdf);
router.get('/report-cards/:studentId/all', ctrl.getMyReportCards);
router.get('/report-cards/:studentId',     ctrl.getMyReportCard);

module.exports = router;
