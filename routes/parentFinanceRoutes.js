/**
 * parentFinanceRoutes.js
 *
 * Finance endpoints for the Parent Portal:
 *
 * ┌──────────────────────────────────────────────────────────────┬───────────────────────────────────┐
 * │ Route                                                        │ Description                       │
 * ├──────────────────────────────────────────────────────────────┼───────────────────────────────────┤
 * │ GET  /parent/children/:id/fees                               │ 8.1 Fee record + payment history  │
 * │ GET  /parent/fees                                            │ 8.2 All children fee summary      │
 * │ GET  /parent/invoices                                        │ 8.3 List invoices                 │
 * │ GET  /parent/invoices/:invoiceId                             │ 8.4 Single invoice detail         │
 * │ POST /parent/payments/initiate                               │ 8.5 Initiate Paystack payment     │
 * │ GET  /parent/payments/verify/:reference                      │ 8.6 Verify payment reference      │
 * │ POST /parent/payments/webhook                                │ 8.7 Paystack webhook (public)     │
 * └──────────────────────────────────────────────────────────────┴───────────────────────────────────┘
 *
 * Mount in server.js BEFORE the general parent router:
 *   app.use('/api/v1', require('./routes/parentFinanceRoutes'));
 *
 * Note: Webhook route (8.7) is PUBLIC — no JWT guard — but verifies
 * Paystack HMAC signature internally.
 */

const express = require('express');
const router  = express.Router();

const { protect }           = require('../middleware/auth');
const parentAuthMiddleware  = require('../middleware/parentAuth');
const parentFinanceController = require('../controllers/parentFinanceController');
const paystackController    = require('../controllers/paystackController');

// ─── Webhook — PUBLIC (no JWT) ────────────────────────────────────────────────
// Must be mounted with raw body parser to validate HMAC signature.
// Use express.raw() on this route only.

router.post(
    '/parent/payments/webhook',
    express.raw({ type: 'application/json' }),
    paystackController.handleWebhook
);

// ─── All other routes require parent JWT ─────────────────────────────────────

router.use(protect);
router.use(parentAuthMiddleware);

// 8.1  Fee record for a single child
router.get('/parent/children/:id/fees', parentFinanceController.getChildFeeRecord);

// 8.2  Aggregated fees for all children
router.get('/parent/fees', parentFinanceController.getAllChildrenFees);

// 8.3  List invoices for all children
router.get('/parent/invoices', parentFinanceController.listInvoices);

// 8.4  Single invoice detail
router.get('/parent/invoices/:invoiceId', parentFinanceController.getInvoice);

// 8.5  Initiate Paystack payment
router.post('/parent/payments/initiate', paystackController.initiatePayment);

// 8.6  Verify / poll Paystack payment
router.get('/parent/payments/verify/:reference', paystackController.verifyPayment);

module.exports = router;
