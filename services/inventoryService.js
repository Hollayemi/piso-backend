/**
 * inventoryService.js
 *
 * All database interactions and business logic for the Inventory module (3.1 – 3.6).
 *
 *   3.1  GET    /inventory           → getAllItems
 *   3.2  GET    /inventory/:id       → getItemById
 *   3.3  POST   /inventory           → createItem
 *   3.4  PUT    /inventory/:id       → updateItem
 *   3.5  DELETE /inventory/:id       → deleteItem
 *   3.6  GET    /inventory/summary   → getInventorySummary
 *
 * Controllers delegate here exclusively. No Mongoose calls live in controllers.
 */

const { InventoryItem, ITEM_CONDITIONS, ITEM_CATEGORIES } = require('../model/inventory.model');
const ErrorResponse = require('../utils/errorResponse');

// ─── ID Generation ────────────────────────────────────────────────────────────

/**
 * Generates the next sequential item ID.
 * Format: INV-NNNNN  (global counter, zero-padded to 5 digits)
 * e.g. INV-00001, INV-00312
 *
 * @returns {{ itemId: string, serialNumber: number }}
 */
const generateItemId = async () => {
    const latest = await InventoryItem.findOne(
        {},
        { serialNumber: 1 }
    ).sort({ serialNumber: -1 });

    const nextSerial   = latest ? latest.serialNumber + 1 : 1;
    const paddedSerial = String(nextSerial).padStart(5, '0');

    return { itemId: `INV-${paddedSerial}`, serialNumber: nextSerial };
};

// ─── Shape Helper ─────────────────────────────────────────────────────────────

/**
 * Standard response shape for a single inventory item.
 *
 * @param {object} doc - InventoryItem lean or Mongoose doc
 */
const toView = (doc) => ({
    id:           doc.itemId,
    name:         doc.name,
    category:     doc.category,
    location:     doc.location,
    locationType: doc.locationType,
    quantity:     doc.quantity,
    unit:         doc.unit,
    condition:    doc.condition,
    lastUpdated:  doc.lastUpdated,
    notes:        doc.notes || '',
});

// ─── Attention helper ─────────────────────────────────────────────────────────

/** Returns true when the item condition warrants attention. */
const isAttention = (condition) =>
    condition === 'Poor' || condition === 'Condemned';

// ═══════════════════════════════════════════════════════════════════════════════
// 3.1  GET /inventory
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns a paginated, filtered list of inventory items with a summary block.
 *
 * @param {object} query - { page, limit, search, locationType, location, category, condition }
 */
const getAllItems = async ({
    page,
    limit,
    search,
    locationType,
    location,
    category,
    condition,
} = {}) => {
    const pageNum  = Math.max(parseInt(page,  10) || 1,  1);
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const skip     = (pageNum - 1) * limitNum;

    const filter = {};

    if (search) {
        filter.$or = [
            { name:     { $regex: search, $options: 'i' } },
            { itemId:   { $regex: search, $options: 'i' } },
            { location: { $regex: search, $options: 'i' } },
        ];
    }
    if (locationType) filter.locationType = locationType;
    if (location)     filter.location     = { $regex: location, $options: 'i' };
    if (category)     filter.category     = category;
    if (condition)    filter.condition    = condition;

    const [items, total] = await Promise.all([
        InventoryItem.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean({ virtuals: true }),
        InventoryItem.countDocuments(filter),
    ]);

    // Summary over the FULL collection (not just the filtered set)
    const [summaryAgg] = await InventoryItem.aggregate([
        {
            $group: {
                _id:            null,
                totalItems:     { $sum: 1 },
                totalQuantity:  { $sum: '$quantity' },
                needsAttention: {
                    $sum: {
                        $cond: [
                            { $in: ['$condition', ['Poor', 'Condemned']] },
                            1,
                            0,
                        ],
                    },
                },
            },
        },
    ]);

    // Distinct location count across the full collection
    const distinctLocations = await InventoryItem.distinct('location');

    const summary = summaryAgg
        ? {
              totalItems:     summaryAgg.totalItems,
              totalQuantity:  summaryAgg.totalQuantity,
              locations:      distinctLocations.length,
              needsAttention: summaryAgg.needsAttention,
          }
        : { totalItems: 0, totalQuantity: 0, locations: 0, needsAttention: 0 };

    return {
        items: items.map(toView),
        summary,
        pagination: {
            total:      total,
            page:       pageNum,
            limit:      limitNum,
            totalPages: Math.ceil(total / limitNum),
        },
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3.2  GET /inventory/:id
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns a single inventory item by itemId.
 *
 * @param {string} id - itemId e.g. "INV-00001"
 */
const getItemById = async (id) => {
    const item = await InventoryItem.findOne({
        itemId: id.toUpperCase(),
    }).lean({ virtuals: true });

    if (!item) {
        throw new ErrorResponse(`Inventory item '${id}' not found`, 404);
    }

    return { item: toView(item) };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3.3  POST /inventory
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a new inventory item.
 *
 * @param {object} body      - Validated request body
 * @param {string} createdBy - Staff ID of the authenticated user
 */
const createItem = async (body, createdBy) => {
    const { itemId, serialNumber } = await generateItemId();

    const item = await InventoryItem.create({
        itemId,
        serialNumber,
        name:         body.name,
        category:     body.category,
        location:     body.location,
        locationType: body.locationType,
        quantity:     body.quantity,
        unit:         body.unit,
        condition:    body.condition,
        notes:        body.notes || '',
        lastUpdated:  new Date(),
        createdBy,
    });

    return { item: toView(item.toObject({ virtuals: true })) };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3.4  PUT /inventory/:id
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Partially updates an inventory item.
 * Always stamps `lastUpdated` when a meaningful field changes.
 *
 * @param {string} id        - itemId
 * @param {object} body      - Validated partial body
 * @param {string} updatedBy - Staff ID of the authenticated user
 */
const updateItem = async (id, body, updatedBy) => {
    const existing = await InventoryItem.findOne({ itemId: id.toUpperCase() });

    if (!existing) {
        throw new ErrorResponse(`Inventory item '${id}' not found`, 404);
    }

    // Stamp lastUpdated whenever a meaningful operational field changes
    const meaningfulFields = ['condition', 'quantity', 'notes', 'name', 'location', 'locationType', 'category', 'unit'];
    const hasMeaningfulChange = meaningfulFields.some((f) => f in body);

    const updatePayload = {
        ...body,
        lastUpdatedBy: updatedBy,
        ...(hasMeaningfulChange && { lastUpdated: new Date() }),
    };

    const updated = await InventoryItem.findOneAndUpdate(
        { itemId: id.toUpperCase() },
        { $set: updatePayload },
        { new: true, runValidators: true }
    ).lean({ virtuals: true });

    return {
        item: {
            id:          updated.itemId,
            name:        updated.name,
            condition:   updated.condition,
            quantity:    updated.quantity,
            notes:       updated.notes || '',
            lastUpdated: updated.lastUpdated,
        },
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3.5  DELETE /inventory/:id
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Permanently deletes an inventory item.
 *
 * @param {string} id - itemId
 */
const deleteItem = async (id) => {
    const item = await InventoryItem.findOne({ itemId: id.toUpperCase() });

    if (!item) {
        throw new ErrorResponse(`Inventory item '${id}' not found`, 404);
    }

    await item.deleteOne();
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3.6  GET /inventory/summary
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns a full aggregate summary: condition breakdown, category breakdown,
 * total items, total quantity, unique locations, and needs-attention count.
 */
const getInventorySummary = async () => {
    // ── Condition breakdown ────────────────────────────────────────────────
    const conditionAgg = await InventoryItem.aggregate([
        { $group: { _id: '$condition', count: { $sum: 1 } } },
    ]);

    const conditionBreakdown = Object.fromEntries(
        ITEM_CONDITIONS.map((c) => [c, 0])
    );
    for (const row of conditionAgg) {
        if (row._id) conditionBreakdown[row._id] = row.count;
    }

    // ── Category breakdown ─────────────────────────────────────────────────
    const categoryAgg = await InventoryItem.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);

    const categoryBreakdown = Object.fromEntries(
        ITEM_CATEGORIES.map((c) => [c, 0])
    );
    for (const row of categoryAgg) {
        if (row._id) categoryBreakdown[row._id] = row.count;
    }

    // ── Totals ─────────────────────────────────────────────────────────────
    const [totalsAgg] = await InventoryItem.aggregate([
        {
            $group: {
                _id:            null,
                totalItems:     { $sum: 1 },
                totalQuantity:  { $sum: '$quantity' },
                needsAttention: {
                    $sum: {
                        $cond: [
                            { $in: ['$condition', ['Poor', 'Condemned']] },
                            1,
                            0,
                        ],
                    },
                },
            },
        },
    ]);

    const distinctLocations = await InventoryItem.distinct('location');

    return {
        totalItems:         totalsAgg?.totalItems     || 0,
        totalQuantity:      totalsAgg?.totalQuantity  || 0,
        locations:          distinctLocations.length,
        needsAttention:     totalsAgg?.needsAttention || 0,
        conditionBreakdown,
        categoryBreakdown,
    };
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    getAllItems,
    getItemById,
    createItem,
    updateItem,
    deleteItem,
    getInventorySummary,
};
