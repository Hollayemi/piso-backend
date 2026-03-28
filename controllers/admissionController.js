/**
 * admissionController.js
 *
 * Thin HTTP layer for the Admissions module.
 * All business logic and DB access lives in admissionService.js.
 *
 * Response shape follows the project convention:
 *   { type: 'success', message?, data? }
 */

const asyncHandler   = require('../middleware/asyncHandler');
const admissionService = require('../services/admissionService');
const { sendSuccess }  = require('../utils/sendResponse');

// ─── 1.1  GET /admissions ─────────────────────────────────────────────────────

exports.getAllApplications = asyncHandler(async (req, res) => {
    const data = await admissionService.getAllApplications(req.query);
    sendSuccess(res, 200, '', data);
});

// ─── 1.2  GET /admissions/:id ─────────────────────────────────────────────────

exports.getApplication = asyncHandler(async (req, res) => {
    const data = await admissionService.getApplication(req.params.id);
    sendSuccess(res, 200, '', data);
});

// ─── 1.3  POST /admissions  (public) ─────────────────────────────────────────

exports.submitApplication = asyncHandler(async (req, res) => {
    const files = req.files || {};
    const ip    = req.ip || req.connection.remoteAddress || '';
    const data  = await admissionService.submitApplication(req.body, files, ip);
    sendSuccess(res, 201, 'Application submitted successfully', data);
});

// ─── 1.4  PATCH /admissions/:id/status ───────────────────────────────────────

exports.updateApplicationStatus = asyncHandler(async (req, res) => {
    const data = await admissionService.updateApplicationStatus(
        req.params.id,
        req.body,
        req.user.id
    );
    sendSuccess(res, 200, 'Application status updated', data);
});

// ─── 1.5  DELETE /admissions/:id ─────────────────────────────────────────────

exports.deleteApplication = asyncHandler(async (req, res) => {
    await admissionService.deleteApplication(req.params.id);
    sendSuccess(res, 200, 'Application deleted successfully');
});

// ─── 1.6  GET /admissions/screening ──────────────────────────────────────────

exports.getScreeningList = asyncHandler(async (req, res) => {
    const data = await admissionService.getScreeningList(req.query);
    sendSuccess(res, 200, '', data);
});

// ─── 1.7  PUT /admissions/:id/screening ──────────────────────────────────────

exports.updateScreeningRecord = asyncHandler(async (req, res) => {
    const data = await admissionService.updateScreeningRecord(
        req.params.id,
        req.body,
        req.user.id
    );
    sendSuccess(res, 200, 'Screening record updated', data);
});

// ─── 1.8  GET /admissions/offers ─────────────────────────────────────────────

exports.getOffersList = asyncHandler(async (req, res) => {
    const data = await admissionService.getOffersList(req.query);
    sendSuccess(res, 200, '', data);
});

// ─── 1.9  POST /admissions/:id/offer ─────────────────────────────────────────

exports.sendOfferLetter = asyncHandler(async (req, res) => {
    const data = await admissionService.sendOfferLetter(
        req.params.id,
        req.body,
        req.user.id
    );
    sendSuccess(res, 200, 'Offer letter sent successfully', data);
});

// ─── 1.10  PATCH /admissions/:id/offer/status ────────────────────────────────

exports.updateOfferAcceptanceStatus = asyncHandler(async (req, res) => {
    const data = await admissionService.updateOfferAcceptanceStatus(
        req.params.id,
        req.body.acceptanceStatus,
        req.user.id
    );
    sendSuccess(res, 200, 'Offer acceptance status updated', data);
});

// ─── 1.11  GET /admissions/stats ─────────────────────────────────────────────

exports.getAdmissionsStats = asyncHandler(async (req, res) => {
    const data = await admissionService.getAdmissionsStats();
    sendSuccess(res, 200, '', data);
});
