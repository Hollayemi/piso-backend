/**
 * inventoryController.js
 *
 * HTTP request/response handling for the Inventory module (3.1 – 3.6).
 *
 * Each handler follows the same three-step pattern:
 *   1. Validate input with Joi
 *   2. Delegate to inventoryService
 *   3. Send a standardised response via sendSuccess
 *
 * No business logic or DB access lives here.
 *
 * Role access matrix (enforced on routes, documented here for reference):
 * ┌──────────────────────────────────┬────────────────────────────────────────┐
 * │ Route                            │ Allowed roles                          │
 * ├──────────────────────────────────┼────────────────────────────────────────┤
 * │ GET    /inventory                │ super_admin, admin, principal          │
 * │ GET    /inventory/summary        │ super_admin, admin, principal          │
 * │ GET    /inventory/:id            │ super_admin, admin, principal          │
 * │ POST   /inventory                │ super_admin, admin                     │
 * │ PUT    /inventory/:id            │ super_admin, admin                     │
 * │ DELETE /inventory/:id            │ super_admin, admin                     │
 * └──────────────────────────────────┴────────────────────────────────────────┘
 *
 * From the API spec Role Access Summary:
 *   super_admin → Full CRUD
 *   admin       → Full CRUD
 *   principal   → Read only
 *   accountant  → No access
 *   teacher     → No access
 */

const asyncHandler      = require('../middleware/asyncHandler');
const ErrorResponse     = require('../utils/errorResponse');
const { sendSuccess }   = require('../utils/sendResponse');
const inventoryService  = require('../services/inventoryService');

const {
    validate,
    listQuerySchema,
    createItemSchema,
    updateItemSchema,
} = require('../helpers/inventoryValidations');

// ─── Helper ───────────────────────────────────────────────────────────────────

const extractJoiErrors = (joiError) =>
    joiError.details.map((d) => ({
        field:   d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
    }));

// ═══════════════════════════════════════════════════════════════════════════════
// 3.1  GET /inventory
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Get all inventory items (paginated + filtered)
 * @route   GET /api/v1/inventory
 * @access  super_admin | admin | principal
 */
exports.getAllItems = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(listQuerySchema, req.query);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await inventoryService.getAllItems(value);
    sendSuccess(res, 200, '', result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.2  GET /inventory/:id
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Get a single inventory item by ID
 * @route   GET /api/v1/inventory/:id
 * @access  super_admin | admin | principal
 */
exports.getItemById = asyncHandler(async (req, res) => {
    const result = await inventoryService.getItemById(req.params.id);
    sendSuccess(res, 200, '', result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.3  POST /inventory
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Add a new inventory item
 * @route   POST /api/v1/inventory
 * @access  super_admin | admin
 */
exports.createItem = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(createItemSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await inventoryService.createItem(value, req.user.id);
    sendSuccess(res, 201, 'Inventory item added successfully', result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.4  PUT /inventory/:id
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Update an inventory item (partial)
 * @route   PUT /api/v1/inventory/:id
 * @access  super_admin | admin
 */
exports.updateItem = asyncHandler(async (req, res, next) => {
    const { error, value } = validate(updateItemSchema, req.body);
    if (error) {
        return next(new ErrorResponse('Validation failed', 400, extractJoiErrors(error)));
    }

    const result = await inventoryService.updateItem(req.params.id, value, req.user.id);
    sendSuccess(res, 200, 'Inventory item updated successfully', result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.5  DELETE /inventory/:id
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Delete an inventory item
 * @route   DELETE /api/v1/inventory/:id
 * @access  super_admin | admin
 */
exports.deleteItem = asyncHandler(async (req, res) => {
    await inventoryService.deleteItem(req.params.id);
    sendSuccess(res, 200, 'Inventory item deleted successfully');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.6  GET /inventory/summary
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Get full inventory summary with condition and category breakdowns
 * @route   GET /api/v1/inventory/summary
 * @access  super_admin | admin | principal
 */
exports.getInventorySummary = asyncHandler(async (req, res) => {
    const result = await inventoryService.getInventorySummary();
    sendSuccess(res, 200, '', result);
});
