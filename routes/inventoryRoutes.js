/**
 * inventoryRoutes.js
 *
 * All Inventory module routes with JWT + role guards (3.1 – 3.6).
 *
 * Role access matrix (per API spec Role Access Summary):
 *
 * ┌──────────────────────────────────────────────┬────────────────────────────────────────────┐
 * │ Route                                        │ Allowed roles                              │
 * ├──────────────────────────────────────────────┼────────────────────────────────────────────┤
 * │ GET    /inventory                            │ super_admin, admin, principal              │
 * │ GET    /inventory/summary                    │ super_admin, admin, principal              │
 * │ GET    /inventory/:id                        │ super_admin, admin, principal              │
 * │ POST   /inventory                            │ super_admin, admin                         │
 * │ PUT    /inventory/:id                        │ super_admin, admin                         │
 * │ DELETE /inventory/:id                        │ super_admin, admin                         │
 * └──────────────────────────────────────────────┴────────────────────────────────────────────┘
 *
 * Notes:
 *   - accountant has NO access to any Inventory endpoint.
 *   - teacher   has NO access to any Inventory endpoint.
 *   - principal is READ ONLY.
 *   - admin has FULL CRUD (unlike Finance where admin is read-only).
 *
 * ⚠️  Route ordering:
 *   GET /summary  → declared BEFORE GET /:id to prevent Express
 *                   matching the literal "summary" as an :id param.
 *
 * Mount in server.js:
 *   app.use('/api/v1/inventory', require('./routes/inventoryRoutes'));
 */

const express = require('express');

const router = express.Router();

const { protect, authorize, ROLES } = require('../middleware/auth');
const {
    getAllItems,
    getItemById,
    createItem,
    updateItem,
    deleteItem,
    getInventorySummary,
} = require('../controllers/inventoryController');

// ─── Role groups ──────────────────────────────────────────────────────────────

/** Full CRUD — super_admin and admin */
const CRUD_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

/**
 * Read-only access — super_admin, admin, principal.
 * accountant and teacher are intentionally excluded.
 */
const READ_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRINCIPAL];

// ─── Apply JWT guard to every route in this router ───────────────────────────

router.use(protect);

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ⚠️  Declared BEFORE /:id to avoid "summary" being matched as a param value
// ═══════════════════════════════════════════════════════════════════════════════

// GET /summary
router.get('/summary', authorize(...READ_ROLES), getInventorySummary);

// ═══════════════════════════════════════════════════════════════════════════════
// COLLECTION  —  /inventory
// ═══════════════════════════════════════════════════════════════════════════════

router
    .route('/')
    .get(authorize(...READ_ROLES),  getAllItems)
    .post(authorize(...CRUD_ROLES), createItem);

// ═══════════════════════════════════════════════════════════════════════════════
// INDIVIDUAL ITEM  —  /inventory/:id
// ═══════════════════════════════════════════════════════════════════════════════

router
    .route('/:id')
    .get(authorize(...READ_ROLES),  getItemById)
    .put(authorize(...CRUD_ROLES),  updateItem)
    .delete(authorize(...CRUD_ROLES), deleteItem);

module.exports = router;
