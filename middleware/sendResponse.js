/**
 * Sends a standardised success response.
 *
 * @param {import('express').Response} res
 * @param {number}  statusCode  - HTTP status code
 * @param {string}  message     - Human-readable message (optional)
 * @param {object}  data        - Response payload (optional)
 */
const sendSuccess = (res, statusCode = 200, message = '', data = null) => {
    const body = { type: 'success' };
    if (message) body.message = message;
    if (data !== null) body.data = data;
    return res.status(statusCode).json(body);
};

module.exports = { sendSuccess };
