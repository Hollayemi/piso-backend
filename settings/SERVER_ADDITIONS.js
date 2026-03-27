/**
 * SERVER.JS — ADDITIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * Add the lines below to your existing server.js.
 * Sections marked ⬇ ADD show exactly where to insert.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1.  Import the new routes  (add after the existing route imports)
// ─────────────────────────────────────────────────────────────────────────────

const authRoutes     = require('./routes/authRoutes');
const settingsRoutes = require('./routes/settingsRoutes');

// Also bring in all existing Stage-1 routes if not already mounted:
const studentRoutes   = require('./routes/studentRoutes');
const staffRoutes     = require('./routes/staffRoutes');
const academicsRoutes = require('./routes/academicsRoutes');
const financeRoutes   = require('./routes/financeRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const transportRoutes = require('./routes/transportRoutes');

// ─────────────────────────────────────────────────────────────────────────────
// 2.  Mount the routes  (add after the existing app.use('/api/v1/admissions') line)
// ─────────────────────────────────────────────────────────────────────────────

// Auth — public login + protected profile/password routes
app.use('/api/v1/auth', authRoutes);

// Settings — super_admin only
app.use('/api/v1/settings', settingsRoutes);

// Stage-1 modules (add if not already present)
app.use('/api/v1/students',  studentRoutes);
app.use('/api/v1/staff',     staffRoutes);
app.use('/api/v1/academics', academicsRoutes);
app.use('/api/v1/finance',   financeRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/transport', transportRoutes);

// ─────────────────────────────────────────────────────────────────────────────
// 3.  Required environment variables (.env)
// ─────────────────────────────────────────────────────────────────────────────

/*
  JWT_SECRET=your_super_secret_jwt_key_here
  JWT_EXPIRE=7d
  MONGO_URI=mongodb+srv://...
  NODE_ENV=development
  PORT=5001
*/

// ─────────────────────────────────────────────────────────────────────────────
// 4.  File import alias note
// ─────────────────────────────────────────────────────────────────────────────
//
// The existing Staff model is at model/staff.js (no .model suffix).
// authService and settingsService require '../model/staff.model'.
//
// Either:
//   A) Rename staff.js → staff.model.js   (recommended for consistency), or
//   B) Change the require paths in authService.js / settingsService.js:
//        require('../model/staff')   ← drop the .model suffix
//
// ─────────────────────────────────────────────────────────────────────────────
