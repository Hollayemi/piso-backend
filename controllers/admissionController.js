const asyncHandler   = require('../middleware/asyncHandler');
const admissionService = require('../services/admissionService');
const { sendSuccess }  = require('../utils/sendResponse');

exports.getAllApplications = asyncHandler(async (req, res) => {
    const data = await admissionService.getAllApplications(req.query);
    sendSuccess(res, 200, '', data);
});

exports.getApplication = asyncHandler(async (req, res) => {
    const data = await admissionService.getApplication(req.params.id);
    sendSuccess(res, 200, '', data);
});

exports.submitApplication = asyncHandler(async (req, res) => {
    const files = req.files || {};
    const ip    = req.ip || req.connection.remoteAddress || '';
    const data  = await admissionService.submitApplication(req.body, files, ip);
    sendSuccess(res, 201, 'Application submitted successfully', data);
});

exports.updateApplicationStatus = asyncHandler(async (req, res) => {
    const data = await admissionService.updateApplicationStatus(
        req.params.id,
        req.body,
        req.user.id
    );
    sendSuccess(res, 200, 'Application status updated', data);
});

exports.deleteApplication = asyncHandler(async (req, res) => {
    await admissionService.deleteApplication(req.params.id);
    sendSuccess(res, 200, 'Application deleted successfully');
});

exports.getScreeningList = asyncHandler(async (req, res) => {
    const data = await admissionService.getScreeningList(req.query);
    sendSuccess(res, 200, '', data);
});

exports.updateScreeningRecord = asyncHandler(async (req, res) => {
    const data = await admissionService.updateScreeningRecord(
        req.params.id,
        req.body,
        req.user.id
    );
    sendSuccess(res, 200, 'Screening record updated', data);
});

exports.getOffersList = asyncHandler(async (req, res) => {
    const data = await admissionService.getOffersList(req.query);
    sendSuccess(res, 200, '', data);
});

exports.sendOfferLetter = asyncHandler(async (req, res) => {
    const data = await admissionService.sendOfferLetter(
        req.params.id,
        req.body,
        req.user.id
    );
    sendSuccess(res, 200, 'Offer letter sent successfully', data);
});

exports.updateOfferAcceptanceStatus = asyncHandler(async (req, res) => {
    const data = await admissionService.updateOfferAcceptanceStatus(
        req.params.id,
        req.body.acceptanceStatus,
        req.user.id
    );
    sendSuccess(res, 200, 'Offer acceptance status updated', data);
});

exports.getAdmissionsStats = asyncHandler(async (req, res) => {
    const data = await admissionService.getAdmissionsStats();
    sendSuccess(res, 200, '', data);
});
