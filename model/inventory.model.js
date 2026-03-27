/**
 * inventory.model.js
 *
 * Single model for the Inventory module (3.1 – 3.6).
 *
 * One InventoryItem document represents a specific asset or consumable
 * stored at a named location within the school.
 *
 * Design decisions:
 *   - ID format: INV-NNNNN  (global, zero-padded to 5 digits) e.g. INV-00001
 *   - `needsAttention` is a virtual — true when condition is 'Poor' or 'Condemned'
 *   - `locationType` distinguishes classroom resources from office/facility resources
 *   - `lastUpdated` is a plain Date field (not the Mongoose updatedAt) so it can
 *     be set explicitly when a partial update touches condition/quantity/notes,
 *     and remains unchanged for metadata-only edits (createdBy etc.)
 */

const mongoose = require('mongoose');

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_CONDITIONS = ['Excellent', 'Good', 'Fair', 'Poor', 'Condemned'];

const ITEM_CATEGORIES = [
    'Furniture',
    'Electronics',
    'Books/Stationery',
    'Lab Equipment',
    'Sports',
    'Cleaning',
    'Office Supplies',
    'Teaching Aids',
    'Miscellaneous',
];

const LOCATION_TYPES = ['class', 'office'];

const ITEM_UNITS = ['piece', 'set', 'box', 'ream', 'volume', 'pair', 'pack', 'unit'];

// ─── Main Schema ──────────────────────────────────────────────────────────────

const InventoryItemSchema = new mongoose.Schema(
    {
        // ── System / Identity ──────────────────────────────────────────────
        itemId: {
            type:     String,
            unique:   true,
            required: true,
            trim:     true,
            // Format: INV-NNNNN  e.g. INV-00001
        },

        serialNumber: {
            type:     Number,
            required: true,
        },

        // ── Core Fields ────────────────────────────────────────────────────
        name: {
            type:      String,
            required:  [true, 'Item name is required'],
            trim:      true,
            maxlength: [150, 'Item name cannot exceed 150 characters'],
        },

        category: {
            type:     String,
            required: [true, 'Category is required'],
            enum:     ITEM_CATEGORIES,
        },

        location: {
            type:     String,
            required: [true, 'Location is required'],
            trim:     true,
            maxlength: [100, 'Location name cannot exceed 100 characters'],
            // e.g. "JSS 1A", "Science Laboratory", "School Library"
        },

        locationType: {
            type:     String,
            required: [true, 'Location type is required'],
            enum:     LOCATION_TYPES,
            // 'class' = classroom arm  |  'office' = office / lab / facility
        },

        quantity: {
            type:     Number,
            required: [true, 'Quantity is required'],
            min:      [0, 'Quantity cannot be negative'],
            default:  0,
        },

        unit: {
            type:     String,
            required: [true, 'Unit is required'],
            trim:     true,
            // Stored as free text to allow flexibility beyond the enum list
        },

        condition: {
            type:     String,
            required: [true, 'Condition is required'],
            enum:     ITEM_CONDITIONS,
        },

        notes: {
            type:    String,
            trim:    true,
            default: '',
            maxlength: [500, 'Notes cannot exceed 500 characters'],
        },

        /**
         * Set explicitly whenever a meaningful change is recorded
         * (condition, quantity, notes). Updated in the service layer.
         */
        lastUpdated: {
            type:    Date,
            default: Date.now,
        },

        // ── Audit ──────────────────────────────────────────────────────────
        createdBy:     { type: String, default: '' },
        lastUpdatedBy: { type: String, default: '' },
    },
    {
        timestamps: true,
        toJSON:     { virtuals: true },
        toObject:   { virtuals: true },
    }
);

// ─── Virtual ──────────────────────────────────────────────────────────────────

/**
 * needsAttention — true when condition is 'Poor' or 'Condemned'.
 * Used for dashboard alerts and summary counts.
 */
InventoryItemSchema.virtual('needsAttention').get(function () {
    return this.condition === 'Poor' || this.condition === 'Condemned';
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

InventoryItemSchema.index({ itemId:       1 });
InventoryItemSchema.index({ category:     1 });
InventoryItemSchema.index({ location:     1 });
InventoryItemSchema.index({ locationType: 1 });
InventoryItemSchema.index({ condition:    1 });
InventoryItemSchema.index({ name:         'text' }); // text index for search
InventoryItemSchema.index({ createdAt:   -1 });

// ─── Exports ──────────────────────────────────────────────────────────────────

const InventoryItem = mongoose.model('InventoryItem', InventoryItemSchema);

module.exports = {
    InventoryItem,
    ITEM_CONDITIONS,
    ITEM_CATEGORIES,
    LOCATION_TYPES,
    ITEM_UNITS,
};
