// routes/admission.routes.js
const express = require('express');
const router = express.Router();
const {
    submitApplication,
    getApplication,
    getAllApplications,
    updateApplicationStatus,
    deleteApplication,
    getStatistics
} = require('../controllers/application');

// Import auth middleware (implement this for admin routes)
// const { protect, authorize } = require('../middleware/auth');

// Public routes
router.post('/', submitApplication);
router.get('/:ref', getApplication);

// Admin routes (add auth middleware when implemented)
// router.use(protect); // Protect all routes below
// router.use(authorize('admin')); // Only admin can access

router.get('/', getAllApplications);
router.get('/stats/overview', getStatistics);
router.put('/:ref/status', updateApplicationStatus);
router.delete('/:ref', deleteApplication);

module.exports = router;