/**
 * controllers/parentChildrenController.js
 *
 * HTTP request/response handling for the Parent Children module.
 *
 * Each handler follows the same three-step pattern:
 *   1. Extract request params / query
 *   2. Delegate to parentChildrenService
 *   3. Send standardised response via sendSuccess
 *
 * No business logic or DB access lives here.
 *
 * Endpoints:
 *   4.  GET /parent/children        → getChildren
 *   5.  GET /parent/children/:id    → getChildProfile
 */

const asyncHandler            = require('../middleware/asyncHandler');
const { sendSuccess }         = require('../utils/sendResponse');
const parentChildrenService   = require('../services/parentChildrenService');

// ─── 4.  GET /parent/children ─────────────────────────────────────────────────

/**
 * @desc    List all children linked to the authenticated parent
 * @route   GET /api/v1/parent/children
 * @access  parent
 *
 * Returns a summary list including attendance, fee status, last result,
 * and actionable alerts for each child. No query params required.
 */
exports.getChildren = asyncHandler(async (req, res) => {
    const data = await parentChildrenService.getChildren(req.parent.parentId);
    sendSuccess(res, 200, '', data);
});

// ─── 5.  GET /parent/children/:id ────────────────────────────────────────────

/**
 * @desc    Full profile for a single child
 * @route   GET /api/v1/parent/children/:id
 * @access  parent
 *
 * Query Parameters:
 *   term     - Override term (default: current term)
 *   session  - Override session (default: current session)
 *   detailed - Set to 'true' to include daily attendance records
 *
 * Returns complete child data: personal info, parent contacts, health,
 * documents checklist, attendance, fees with payment history,
 * all published results, and transport enrollment.
 *
 * Throws 403 if the child is not linked to the authenticated parent.
 * Throws 404 if the student ID does not exist.
 */
exports.getChildProfile = asyncHandler(async (req, res) => {
    const data = await parentChildrenService.getChildProfile(
        req.params.id,
        req.parent.linkedStudentIds,
        req.query
    );
    sendSuccess(res, 200, '', data);
});
