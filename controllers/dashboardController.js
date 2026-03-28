/**
 * dashboardController.js
 *
 * Thin HTTP layer for the Dashboard module.
 * All aggregation logic lives in dashboardService.js.
 */

const asyncHandler       = require('../middleware/asyncHandler');
const dashboardService   = require('../services/dashboardService');
const { sendSuccess }    = require('../utils/sendResponse');

// ─── 6.1  GET /dashboard/summary ─────────────────────────────────────────────

exports.getDashboardSummary = asyncHandler(async (req, res) => {
    const data = await dashboardService.getDashboardSummary(req.query);
    sendSuccess(res, 200, '', data);
});
