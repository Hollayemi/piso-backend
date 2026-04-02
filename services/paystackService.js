/**
 * services/paystackService.js
 *
 * All Paystack API interactions and the school-side payment recording
 * logic that runs when a payment is confirmed.
 *
 * Flow:
 *   1. Parent calls POST /parent/payments/initiate
 *      → We call Paystack Initialize Transaction API
 *      → We save a PaystackPayment doc (status: pending)
 *      → We return { authorizationUrl, reference } to the frontend
 *
 *   2. Parent completes payment on Paystack (popup or redirect)
 *      → Paystack fires a webhook to POST /parent/payments/webhook
 *      → We verify the HMAC signature
 *      → On charge.success, we verify via Paystack Verify API and record the payment
 *
 *   3. Frontend optionally polls GET /parent/payments/verify/:reference
 *      → We call Paystack Verify API + sync our DB
 *      → Returns current status + payment details
 *
 * Environment variables required:
 *   PAYSTACK_SECRET_KEY    — your secret key (sk_live_xxx or sk_test_xxx)
 *   PAYSTACK_PUBLIC_KEY    — your public key (for frontend use, stored for reference)
 *   PAYSTACK_WEBHOOK_SECRET — same as PAYSTACK_SECRET_KEY for HMAC validation
 *
 * Paystack base URL:  https://api.paystack.co
 */

const crypto  = require('crypto');
const https   = require('https');

const PaystackPayment        = require('../model/paystackPayment.model');
const { FeeRecord, Payment } = require('../model/finance.model');
const Invoice                = require('../model/finance.model').Invoice;
const Student                = require('../model/student.model');
const Parent                 = require('../model/parent.model');
const { buildFeeStructure } = require('./financeService');
const ErrorResponse          = require('../utils/errorResponse');
const { currentTerm }        = require('./parentFinanceService');

// ─── Paystack HTTP helper ─────────────────────────────────────────────────────

/**
 * Makes an HTTPS request to the Paystack API.
 *
 * @param {string} method   - 'GET' | 'POST'
 * @param {string} path     - e.g. '/transaction/initialize'
 * @param {object} [body]   - Request body for POST requests
 * @returns {Promise<object>} Parsed JSON response
 */
const paystackRequest = (method, path, body = null) => {
    return new Promise((resolve, reject) => {
        const secretKey = process.env.PAYSTACK_SECRET_KEY;

        if (!secretKey) {
            return reject(new Error('PAYSTACK_SECRET_KEY is not configured.'));
        }

        const payload = body ? JSON.stringify(body) : null;

        const options = {
            hostname: 'api.paystack.co',
            port:     443,
            path,
            method,
            headers: {
                Authorization:  `Bearer ${secretKey}`,
                'Content-Type': 'application/json',
                ...(payload && { 'Content-Length': Buffer.byteLength(payload) }),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    reject(new Error(`Paystack returned non-JSON: ${data}`));
                }
            });
        });

        req.on('error', reject);

        if (payload) req.write(payload);
        req.end();
    });
};

// ─── Reference generator ──────────────────────────────────────────────────────

/**
 * Generates a unique payment reference.
 * Format: PISO-{studentId}-{timestamp}-{random4}
 *
 * @param {string} studentId
 */
const generateReference = (studentId) => {
    const timestamp = Date.now();
    const random    = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `PISO-${studentId}-${timestamp}-${random}`;
};

// ─── HMAC signature verification ─────────────────────────────────────────────

/**
 * Validates the Paystack HMAC-SHA512 signature on a webhook payload.
 *
 * @param {Buffer|string} rawBody   - Raw request body (must not be JSON.parsed)
 * @param {string}        signature - Value of x-paystack-signature header
 * @returns {boolean}
 */
const verifyWebhookSignature = (rawBody, signature) => {
    const secret = process.env.PAYSTACK_SECRET_KEY || '';
    const hash   = crypto
        .createHmac('sha512', secret)
        .update(rawBody)
        .digest('hex');

    return hash === signature;
};

// ─── School fee recorder ──────────────────────────────────────────────────────

/**
 * After Paystack confirms a payment, record it in the school's Finance module.
 * This mirrors what financeService.recordPayment() does for cash/POS payments,
 * but uses the Paystack-specific details.
 *
 * @param {object} paystackDoc - PaystackPayment Mongoose document
 * @param {object} txData      - Paystack transaction data from verify API
 */
const recordSchoolPayment = async (paystackDoc, txData) => {
    const { studentId, term, amountNaira, parentId } = paystackDoc;

    const upperStudentId = studentId.toUpperCase();

    // Load student
    const student = await Student.findOne(
        { studentId: upperStudentId },
        { studentId: 1, surname: 1, firstName: 1, class: 1, schoolingOption: 1 }
    ).lean();

    if (!student) {
        throw new Error(`Student '${studentId}' not found while recording Paystack payment.`);
    }

        const { lineItems, totalFee } = await buildFeeStructure(
        student.schoolingOption,
        student.class,
        paystackDoc.term
    );

    const studentName = `${student.surname} ${student.firstName}`;

    // Find or create the FeeRecord
    let feeRecord = await FeeRecord.findOne({ studentId: upperStudentId, term });

    if (!feeRecord) {
        // Build a default fee structure if the record doesn't exist yet
        const isBoarding = student.schoolingOption === 'Boarding';

        feeRecord = await FeeRecord.create({
            studentId:   upperStudentId,
            studentName,
            class:       student.class,
            schooling:   student.schoolingOption,
            term,
            totalFee,
            totalPaid:   0,
            balance:     totalFee,
            paidPercent: 0,
            status:      'Unpaid',
            createdBy:   parentId,
        });
    }

    // Guard: don't record more than the outstanding balance
    const amount = Math.min(amountNaira, feeRecord.balance);
    if (amount <= 0) {
        // Fee is already fully paid — just acknowledge
        return null;
    }

    // Generate payment ID
    const latest = await Payment.findOne(
        { studentId: upperStudentId },
        { serialNumber: 1 }
    ).sort({ serialNumber: -1 });

    const nextSerial = latest ? latest.serialNumber + 1 : 1;
    const paymentId  = `PAY-${upperStudentId}-${nextSerial}`;

    const payment = await Payment.create({
        paymentId,
        serialNumber: nextSerial,
        studentId:    upperStudentId,
        feeRecordId:  feeRecord._id,
        studentName,
        class:        student.class,
        schooling:    student.schoolingOption,
        amount,
        method:       'Online',
        reference:    paystackDoc.reference,
        date:         new Date(),
        term,
        receivedBy:   'Paystack Gateway',
        recordedBy:   parentId,
    });

    // Recompute fee record totals
    const newTotalPaid  = feeRecord.totalPaid + amount;
    const balance       = Math.max(feeRecord.totalFee - newTotalPaid, 0);
    const paidPercent   = feeRecord.totalFee > 0
        ? Math.min(Math.round((newTotalPaid / feeRecord.totalFee) * 100), 100)
        : 0;
    const status = paidPercent >= 100 ? 'Paid'
        : paidPercent >= 25            ? 'Partial'
        : paidPercent > 0              ? 'Low'
        :                                'Unpaid';

    await FeeRecord.findByIdAndUpdate(feeRecord._id, {
        $set: {
            totalPaid:       newTotalPaid,
            balance,
            paidPercent,
            status,
            lastPaymentDate: new Date(),
            lastUpdatedBy:   parentId,
        },
    });

    // Sync invoice if one exists
    await Invoice.findOneAndUpdate(
        { studentId: upperStudentId, term },
        {
            $set: {
                amountPaid:    newTotalPaid,
                balance,
                status:        status === 'Low' ? 'Partial' : status,
                lastUpdatedBy: parentId,
            },
        }
    );

    return payment.paymentId;
};

// ═══════════════════════════════════════════════════════════════════════════════
// Service methods
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 8.5  Initiate Payment ────────────────────────────────────────────────────

/**
 * Creates a Paystack transaction and saves a pending PaystackPayment record.
 *
 * @param {object} body   - { studentId, amount, term? }
 * @param {object} parent - req.parent (Parent Mongoose lean doc)
 */
const initiatePayment = async (body, parent) => {
    const { studentId, amount, term } = body;
    const upperStudentId = studentId.toUpperCase();
    const resolvedTerm   = term || currentTerm();

    // Validate student belongs to this parent
    if (!parent.linkedStudentIds.includes(upperStudentId)) {
        throw new ErrorResponse(
            'Access denied — this child is not linked to your account.',
            403,
            [{ code: 'CHILD_NOT_LINKED' }]
        );
    }

    // Validate amount is a positive number (in Naira)
    const amountNaira = parseFloat(amount);
    if (!amountNaira || amountNaira < 1) {
        throw new ErrorResponse('Amount must be at least ₦1.', 400, [
            { field: 'amount', message: 'Amount must be at least 1 Naira' },
        ]);
    }

    // Check current outstanding balance — don't allow overpayment
    const feeRecord = await FeeRecord.findOne({
        studentId: upperStudentId,
        term:      resolvedTerm,
    }).lean();

    const maxPayable = feeRecord?.balance ?? Infinity;
    if (maxPayable === 0) {
        throw new ErrorResponse(
            'This student has no outstanding balance for the selected term.',
            400,
            [{ code: 'ALREADY_PAID' }]
        );
    }
    if (amountNaira > maxPayable) {
        throw new ErrorResponse(
            `Amount (₦${amountNaira.toLocaleString()}) exceeds the outstanding balance (₦${maxPayable.toLocaleString()}).`,
            400,
            [{ field: 'amount', code: 'EXCEEDS_BALANCE' }]
        );
    }

    // Load student name for metadata
    const student = await Student.findOne(
        { studentId: upperStudentId },
        { surname: 1, firstName: 1 }
    ).lean();

    const studentName = student
        ? `${student.surname} ${student.firstName}`
        : upperStudentId;

    // Generate unique reference
    const reference = generateReference(upperStudentId);

    // Convert to Kobo (Paystack smallest unit)
    const amountKobo = Math.round(amountNaira * 100);

    // Call Paystack Initialize Transaction
    const paystackRes = await paystackRequest('POST', '/transaction/initialize', {
        email:     parent.email,
        amount:    amountKobo,
        reference,
        currency:  'NGN',
        metadata: {
            student_id:    upperStudentId,
            student_name:  studentName,
            parent_id:     parent.parentId,
            term:          resolvedTerm,
            custom_fields: [
                { display_name: 'Student',  variable_name: 'student',  value: studentName },
                { display_name: 'Term',     variable_name: 'term',     value: resolvedTerm },
                { display_name: 'Class',    variable_name: 'class',    value: feeRecord?.class || '' },
            ],
        },
        callback_url: process.env.PAYSTACK_CALLBACK_URL || `${process.env.FRONTEND_URL}/finance/payment-callback`,
    });

    if (!paystackRes.status) {
        throw new ErrorResponse(
            `Paystack error: ${paystackRes.message || 'Failed to initialize transaction.'}`,
            502,
            [{ code: 'PAYSTACK_ERROR' }]
        );
    }

    const { authorization_url: authorizationUrl, access_code: accessCode } = paystackRes.data;

    // Persist to DB
    await PaystackPayment.create({
        reference,
        authorizationUrl,
        parentId:    parent.parentId,
        studentId:   upperStudentId,
        studentName,
        term:        resolvedTerm,
        amountKobo,
        amountNaira,
        currency:    'NGN',
        status:      'pending',
        initiatedBy: parent.parentId,
    });

    return {
        reference,
        authorizationUrl,
        accessCode,
        amount:      amountNaira,
        currency:    'NGN',
        studentName,
        term:        resolvedTerm,
    };
};

// ─── 8.6  Verify Payment ──────────────────────────────────────────────────────

/**
 * Verifies a payment reference with Paystack and, if successful, records
 * the payment in the school's Finance module.
 *
 * Safe to call multiple times — idempotent for already-successful payments.
 *
 * @param {string} reference
 * @param {string} parentId  - From req.parent.parentId
 */
const verifyPayment = async (reference, parentId) => {
    // Load our record
    const paystackDoc = await PaystackPayment.findOne({ reference });

    if (!paystackDoc) {
        throw new ErrorResponse(`Payment reference '${reference}' not found.`, 404);
    }

    // Ensure this payment belongs to the requesting parent
    if (paystackDoc.parentId !== parentId) {
        throw new ErrorResponse('Access denied.', 403, [{ code: 'FORBIDDEN' }]);
    }

    // Already finalised — return cached result
    if (paystackDoc.status === 'success') {
        return {
            reference:       paystackDoc.reference,
            status:          'success',
            amount:          paystackDoc.amountNaira,
            channel:         paystackDoc.channel,
            gatewayResponse: paystackDoc.gatewayResponse,
            schoolPaymentId: paystackDoc.schoolPaymentId,
            paidAt:          paystackDoc.verifiedAt,
        };
    }

    // Call Paystack Verify
    const paystackRes = await paystackRequest('GET', `/transaction/verify/${reference}`);

    if (!paystackRes.status) {
        throw new ErrorResponse(
            `Paystack verification error: ${paystackRes.message || 'Unknown error.'}`,
            502
        );
    }

    const txData = paystackRes.data;
    const now    = new Date();

    if (txData.status === 'success') {
        // Record in school Finance module (idempotent — checks balance)
        let schoolPaymentId = paystackDoc.schoolPaymentId;

        if (!schoolPaymentId) {
            try {
                schoolPaymentId = await recordSchoolPayment(paystackDoc, txData);
            } catch (err) {
                console.error('[Paystack] recordSchoolPayment error:', err.message);
                // Don't rethrow — payment DID succeed; we'll retry on next verify call
            }
        }

        await PaystackPayment.findByIdAndUpdate(paystackDoc._id, {
            $set: {
                status:          'success',
                paystackTxId:    txData.id,
                gatewayResponse: txData.gateway_response || '',
                channel:         txData.channel          || '',
                verifiedAt:      now,
                schoolPaymentId: schoolPaymentId || null,
            },
        });

        return {
            reference,
            status:          'success',
            amount:          txData.amount / 100, // Kobo → Naira
            channel:         txData.channel,
            gatewayResponse: txData.gateway_response,
            schoolPaymentId,
            paidAt:          now,
        };
    }

    // Abandoned or failed
    const newStatus = txData.status === 'abandoned' ? 'abandoned' : 'failed';

    await PaystackPayment.findByIdAndUpdate(paystackDoc._id, {
        $set: {
            status:          newStatus,
            gatewayResponse: txData.gateway_response || '',
        },
    });

    return {
        reference,
        status:          newStatus,
        amount:          paystackDoc.amountNaira,
        gatewayResponse: txData.gateway_response || '',
    };
};

// ─── 8.7  Webhook Handler ─────────────────────────────────────────────────────

/**
 * Processes Paystack webhook events.
 * Must be called with the raw (un-parsed) request body.
 *
 * @param {Buffer}  rawBody   - Raw request body for HMAC validation
 * @param {string}  signature - x-paystack-signature header value
 */
const handleWebhookEvent = async (rawBody, signature) => {
    // 1. Verify HMAC signature
    if (!verifyWebhookSignature(rawBody, signature)) {
        throw new ErrorResponse('Invalid webhook signature.', 401, [
            { code: 'INVALID_SIGNATURE' },
        ]);
    }

    let event;
    try {
        event = JSON.parse(rawBody.toString());
    } catch {
        throw new ErrorResponse('Malformed webhook payload.', 400);
    }

    // We only care about charge.success
    if (event.event !== 'charge.success') {
        // Acknowledge other events with 200 and no action
        return { received: true, action: 'ignored', event: event.event };
    }

    const txData    = event.data;
    const reference = txData.reference;

    // Load our PaystackPayment record
    const paystackDoc = await PaystackPayment.findOne({ reference });

    if (!paystackDoc) {
        // Could be a transaction not initiated through this system — ignore
        return { received: true, action: 'ignored', reason: 'reference_not_found' };
    }

    if (paystackDoc.status === 'success') {
        // Already processed (webhook may fire more than once)
        return { received: true, action: 'already_processed' };
    }

    const now = new Date();

    // Record payment in school Finance module
    let schoolPaymentId = null;
    try {
        schoolPaymentId = await recordSchoolPayment(paystackDoc, txData);
    } catch (err) {
        console.error('[Webhook] recordSchoolPayment error:', err.message);
    }

    // Update PaystackPayment document
    await PaystackPayment.findByIdAndUpdate(paystackDoc._id, {
        $set: {
            status:            'success',
            paystackTxId:      txData.id,
            gatewayResponse:   txData.gateway_response || '',
            channel:           txData.channel          || '',
            verifiedAt:        now,
            webhookReceivedAt: now,
            webhookPayload:    txData,
            schoolPaymentId,
        },
    });

    return { received: true, action: 'payment_recorded', reference, schoolPaymentId };
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    initiatePayment,
    verifyPayment,
    handleWebhookEvent,
    verifyWebhookSignature,
};
