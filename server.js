// server.js
const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit    = require('express-rate-limit');
const hpp          = require('hpp');
const dotenv       = require('dotenv');
const morgan       = require('morgan');
const fileUpload   = require('express-fileupload');
const path         = require('path');

dotenv.config();

const errorHandler  = require('./middleware/errorHandler');
const connectDB     = require('./config/database');

const app = express();

connectDB();

// ─── Security Middleware ──────────────────────────────────────────────────────

app.use(helmet());
app.use(mongoSanitize());
app.use(hpp());

// ─── CORS ─────────────────────────────────────────────────────────────────────

const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
        'http://localhost:3000',
        'https://piso-demo.vercel.app',
    ],
    credentials:         true,
    optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// ─── Rate Limiting ────────────────────────────────────────────────────────────

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max:      100,
    message:  'Too many requests from this IP, please try again later.',
});

const submissionLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max:      10,
    message:  'Too many request applications submitted. Please try again later.',
});

app.use('/api/', globalLimiter);

// ─── Body Parsers ─────────────────────────────────────────────────────────────

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── File Upload ──────────────────────────────────────────────────────────────

app.use(
    fileUpload({
        limits:           { fileSize: 5 * 1024 * 1024 },
        abortOnLimit:     true,
        createParentPath: true,
        useTempFiles:     true,
        tempFileDir:      '/tmp/',
        preserveExtension: true,
        safeFileNames:    true,
    })
);

// ─── Logging ──────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// ─── Static Files ─────────────────────────────────────────────────────────────

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
    res.status(200).json({
        success:   true,
        message:   'API is running',
        timestamp: new Date().toISOString(),
    });
});

// ─── Route Imports ────────────────────────────────────────────────────────────

const authRoutes      = require('./routes/authRoutes');
const admissionRoutes = require('./routes/admissionRoutes');
const studentRoutes   = require('./routes/studentRoutes');
const staffRoutes     = require('./routes/staffRoutes');
const academicsRoutes = require('./routes/academicsRoutes');
const financeRoutes   = require('./routes/financeRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const transportRoutes = require('./routes/transportRoutes');
const settingsRoutes  = require('./routes/settingsRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const { seedStaff } = require('./scripts/seedStaffs');
const parentFinanceRoutes = require('./routes/parentFinanceRoutes');
const parentAdmissionsRoutes = require('./routes/parentAdmissionsRoutes');
const parentChildrenRoutes = require('./routes/parentChildrenRoutes');
// ─── Route Mounts ─────────────────────────────────────────────────────────────

app.use('/api/v1/auth',       authRoutes);
app.use('/api/v1/admissions', submissionLimiter, admissionRoutes); // public POST + protected routes
app.use('/api/v1/students',   studentRoutes);
app.use('/api/v1/staff',      staffRoutes);
app.use('/api/v1/academics',  academicsRoutes);
app.use('/api/v1/finance',    financeRoutes);
app.use('/api/v1/inventory',  inventoryRoutes);
app.use('/api/v1/transport',  transportRoutes);
app.use('/api/v1/settings',   settingsRoutes);
app.use('/api/v1/dashboard',  dashboardRoutes);
app.use('/api/v1/parent/admissions', parentAdmissionsRoutes); 
app.use('/api/v1', parentChildrenRoutes);
app.use('/api/v1', parentFinanceRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────────

app.use((req, res) => {
    res.status(404).json({
        type:    'error',
        message: `Route '${req.originalUrl}' not found`,
    });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT   = process.env.PORT || 5001;
const server = app.listen(PORT, () => {
    console.log(
        `[${new Date().toISOString()}] Server running in ${process.env.NODE_ENV} mode on port ${PORT}`
    );
});

process.on('unhandledRejection', (err) => {
    console.error(`Unhandled Rejection: ${err.message}`);
    server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
    console.error(`Uncaught Exception: ${err.message}`);
    process.exit(1);
});

module.exports = app;


// seedStaff()
