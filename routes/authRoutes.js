/**
 * routes/authRoutes.js
 *
 * Auth module routes.
 *
 * Role access matrix:
 * ┌──────────────────────────────────┬────────────────────────────────────────┐
 * │ Route                            │ Access                                 │
 * ├──────────────────────────────────┼────────────────────────────────────────┤
 * │ POST  /auth/login                │ Public                                 │
 * │ POST  /auth/logout               │ Any authenticated role                 │
 * │ GET   /auth/me                   │ Any authenticated role                 │
 * │ PUT   /auth/change-password      │ Any authenticated role (also           │
 * │                                  │ allowed when mustResetPassword = true) │
 * └──────────────────────────────────┴────────────────────────────────────────┘
 *
 * Mount in server.js:
 *   app.use('/api/v1/auth', require('./routes/authRoutes'));
 *
 * ⚠️  /change-password is listed in the protect middleware's RESET_EXEMPT_PATHS,
 *     so staff with mustResetPassword = true can still reach it.
 */

const express = require('express');

const router = express.Router();

const { protect }    = require('../middleware/auth');
const {
    login,
    logout,
    getProfile,
    changePassword,
} = require('../controllers/authController');

// ─── Public ───────────────────────────────────────────────────────────────────

// POST /login
router.post('/login', login);

// ─── Protected — any authenticated role ──────────────────────────────────────

// POST /logout
router.post('/logout', protect, logout);

// GET /me
router.get('/me', protect, getProfile);

// PUT /change-password
// ⚠️  protect is applied here so we have req.user.id, but the middleware
//     will NOT block this route even when mustResetPassword = true
//     (RESET_EXEMPT_PATHS includes '/change-password').
router.put('/change-password', protect, changePassword);

module.exports = router;
