// utils/errorResponse.js
class ErrorResponse extends Error {
    constructor(message, statusCode, errors = null) {
        super(message);
        this.statusCode = statusCode;
        this.errors = errors;
    }
}

module.exports = ErrorResponse;
