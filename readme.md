
# ============================================
# package.json
# ============================================

{
  "name": "school-admission-backend",
  "version": "1.0.0",
  "description": "Secure backend API for school admission applications",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest --watchAll --verbose"
  },
  "keywords": [
    "admission",
    "school",
    "api",
    "backend"
  ],
  "author": "Your Name",
  "license": "ISC",
  "dependencies": {
    "express": "^4.18.2",
    "mongoose": "^7.5.0",
    "dotenv": "^16.3.1",
    "helmet": "^7.0.0",
    "cors": "^2.8.5",
    "express-rate-limit": "^6.10.0",
    "express-mongo-sanitize": "^2.2.0",
    "hpp": "^0.2.3",
    "joi": "^17.10.0",
    "express-fileupload": "^1.4.0",
    "morgan": "^1.10.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "nodemailer": "^6.9.4"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "jest": "^29.6.4",
    "supertest": "^6.3.3"
  }
}

# ============================================
# README.md
# ============================================

# School Admission Application Backend

A secure, validated, and robust backend API for managing secondary school admission applications.

## Features

✅ **Comprehensive Validation** - All inputs validated using Joi
✅ **Security Hardened** - Helmet, rate limiting, NoSQL injection prevention
✅ **File Upload** - Secure document upload with validation
✅ **Error Handling** - Centralized error handling with detailed messages
✅ **Database** - MongoDB with Mongoose ODM
✅ **RESTful API** - Clean, organized API endpoints
✅ **Application Tracking** - Unique reference numbers for each application
✅ **Status Management** - Track application through approval process

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Create `.env` file from `.env.example`:
```bash
cp .env.example .env
```

4. Update `.env` with your MongoDB connection and other settings

5. Create uploads directory:
```bash
mkdir -p uploads/documents
```

6. Start the server:
```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### Public Endpoints

**Submit Application**
```
POST /api/v1/admissions
Content-Type: multipart/form-data

Body: All admission fields + files
```

**Get Application by Reference**
```
GET /api/v1/admissions/:ref?email=applicant@email.com
```

### Admin Endpoints (Require Authentication)

**Get All Applications**
```
GET /api/v1/admissions?status=Pending&page=1&limit=20
```

**Get Statistics**
```
GET /api/v1/admissions/stats/overview
```

**Update Application Status**
```
PUT /api/v1/admissions/:ref/status
Body: { "status": "Approved", "adminNotes": "..." }
```

**Delete Application**
```
DELETE /api/v1/admissions/:ref
```

## Security Features

- **Helmet.js** - Sets secure HTTP headers
- **Rate Limiting** - Prevents brute force attacks
- **NoSQL Injection Prevention** - Sanitizes inputs
- **File Upload Validation** - Type and size restrictions
- **CORS** - Configurable cross-origin requests
- **HPP** - HTTP Parameter Pollution prevention
- **Input Validation** - Comprehensive Joi schemas
- **IP Tracking** - Logs submission IP addresses

## Validation Rules

- **Names**: 2-50 characters, letters only
- **Dates**: Must be in the past, ISO format
- **Phone Numbers**: Nigerian format validation
- **Email**: Valid email format, lowercase
- **Blood Group**: A+, A-, B+, B-, AB+, AB-, O+, O-
- **Genotype**: AA, AS, SS, AC, SC
- **Files**: JPG, PNG, PDF only, max 5MB

## Error Handling

All errors return standardized JSON:
```json
{
  "success": false,
  "error": "Error message",
  "errors": [
    {
      "field": "fieldName",
      "message": "Specific error"
    }
  ]
}
```

## Project Structure

```
├── config/
│   └── database.js          # MongoDB connection
├── controllers/
│   └── admission.controller.js  # Business logic
├── middleware/
│   ├── asyncHandler.js      # Async error wrapper
│   └── errorHandler.js      # Global error handler
├── models/
│   └── Admission.model.js   # Mongoose schema
├── routes/
│   └── admission.routes.js  # API routes
├── utils/
│   ├── errorResponse.js     # Custom error class
│   └── fileUpload.js        # File handling
├── validators/
│   └── admission.validator.js  # Joi validation
├── uploads/
│   └── documents/           # Uploaded files
├── .env                     # Environment variables
├── server.js               # App entry point
└── package.json

```

## Environment Variables

See `.env.example` for all required variables.

## Rate Limits

- General API: 100 requests per 15 minutes per IP
- Submissions: 5 applications per hour per IP
- Duplicate Prevention: 1 submission per 24 hours per email

## Future Enhancements

- [ ] JWT Authentication for admin routes
- [ ] Email notifications for application status
- [ ] PDF generation for application forms
- [ ] Admin dashboard
- [ ] SMS notifications
- [ ] Payment gateway integration
- [ ] Automated testing suite

## Support

For issues or questions, contact: support@yourschool.com

## License

ISC