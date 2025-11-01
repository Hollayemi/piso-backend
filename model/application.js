const mongoose = require('mongoose');
const crypto = require('crypto');
const { generateWebToken } = require('../helpers/stringGenerator');

const AdmissionSchema = new mongoose.Schema({
    // Unique application reference number
    applicationRef: {
        type: String,
        unique: true,
        required: true
    },

    // Personal Information
    surname: {
        type: String,
        required: [true, 'Surname is required'],
        trim: true,
        maxlength: [50, 'Surname cannot exceed 50 characters']
    },
    firstName: {
        type: String,
        required: [true, 'First name is required'],
        trim: true,
        maxlength: [50, 'First name cannot exceed 50 characters']
    },
    middleName: {
        type: String,
        trim: true,
        maxlength: [50, 'Middle name cannot exceed 50 characters']
    },
    dateOfBirth: {
        type: Date,
        required: [true, 'Date of birth is required']
    },
    gender: {
        type: String,
        required: [true, 'Gender is required'],
        enum: ['male', 'female']
    },
    bloodGroup: {
        type: String,
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', ""]
    },
    genotype: {
        type: String,
        enum: ['AA', 'AS', 'SS', 'AC', 'SC', ""]
    },
    nationality: {
        type: String,
        required: [true, 'Nationality is required'],
        trim: true
    },
    stateOfOrigin: {
        type: String,
        required: [true, 'State of origin is required'],
        trim: true
    },
    localGovernment: {
        type: String,
        required: [true, 'Local government is required'],
        trim: true
    },
    schoolingOption: {
        type: String,
        required: [true, 'Schooling option is required'],
        enum: ['day', 'boarding']
    },

    // Father's Details
    father: {
        name: {
            type: String,
            required: [true, "Father's name is required"],
            trim: true
        },
        occupation: {
            type: String,
            required: [true, "Father's occupation is required"],
            trim: true
        },
        officeAddress: {
            type: String,
            required: [true, "Father's office address is required"],
            trim: true
        },
        homeAddress: {
            type: String,
            required: [true, "Father's home address is required"],
            trim: true
        },
        homePhone: {
            type: String,
            required: [true, "Father's phone number is required"]
        },
        whatsApp: {
            type: String,
            required: [true, "Father's WhatsApp number is required"]
        },
        email: {
            type: String,
            required: [true, "Father's email is required"],
            lowercase: true,
            trim: true
        }
    },

    // Mother's Details
    mother: {
        name: {
            type: String,
            required: [true, "Mother's name is required"],
            trim: true
        },
        occupation: {
            type: String,
            required: [true, "Mother's occupation is required"],
            trim: true
        },
        officeAddress: {
            type: String,
            required: [true, "Mother's office address is required"],
            trim: true
        },
        homeAddress: {
            type: String,
            required: [true, "Mother's home address is required"],
            trim: true
        },
        homePhone: {
            type: String,
            required: [true, "Mother's phone number is required"]
        },
        whatsApp: {
            type: String,
            required: [true, "Mother's WhatsApp number is required"]
        },
        email: {
            type: String,
            required: [true, "Mother's email is required"],
            lowercase: true,
            trim: true
        }
    },

    // Schools Attended
    schools: {
        school1: {
            type: String,
            // required: [true, 'At least one school is required'],
            trim: true
        },
        school1StartDate: {
            type: Date,
            // required: [true, 'School start date is required']
        },
        school1EndDate: {
            type: Date,
            // required: [true, 'School end date is required']
        },
        school2: {
            type: String,
            trim: true
        },
        school2StartDate: Date,
        school2EndDate: Date,
        school3: {
            type: String,
            trim: true
        },
        school3StartDate: Date,
        school3EndDate: Date
    },

    // Class Preferences
    classPreferences: {
        presentClass: {
            type: String,
            required: [true, 'Present class is required'],
            // enum: ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3', 'Primary']
        },
        classInterestedIn: {
            type: String,
            required: [true, 'Class interested in is required'],
            // enum: ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3']
        },

    },


    // Health Information
    health: {
        infectiousDisease: String,
        foodAllergy: String
    },

    // Supporting Documents (file paths)
    documents: {
        birthCertificate: {
            filename: String,
            path: String,
            uploadedAt: Date
        },
        formerSchoolReport: {
            filename: String,
            path: String,
            uploadedAt: Date
        },
        medicalReport: {
            filename: String,
            path: String,
            uploadedAt: Date
        },
    },

    // Contact Information
    contact: {
        correspondenceEmail: {
            type: String,
            lowercase: true,
            trim: true
        },
        howDidYouKnow: {
            type: String,
            required: [true, 'Please tell us how you heard about us'],
            enum: ['Social Media', 'Friend/Family', 'Website', 'Advertisement', 'Former Student', 'Other']
        }
    },

    // Application Status
    status: {
        type: String,
        enum: ['Pending', 'Under Review', 'Approved', 'Rejected', 'Waitlisted'],
        default: 'Pending'
    },

    // Admin notes
    adminNotes: {
        type: String,
        default: ''
    },

    // IP Address for tracking
    submittedFrom: {
        type: String
    },
   
    serialNumber: {
        type: Number,
    },
    // Submission metadata
    submittedAt: {
        type: Date,
        default: Date.now
    },

    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Generate unique application reference before saving
AdmissionSchema.pre('save', async function (next) {
    console.log("here----------")
    if (!this.applicationRef) {
        const year = new Date().getFullYear();
        console.log("here----------")
        const randomStr = generateWebToken(4).toUpperCase();
        this.applicationRef = `PICO${year}${randomStr}`;

        console.log(this.applicationRef)
    }
    next();
});

// Index for faster queries
AdmissionSchema.index({ applicationRef: 1 });
AdmissionSchema.index({ 'contact.correspondenceEmail': 1 });
AdmissionSchema.index({ status: 1 });
AdmissionSchema.index({ submittedAt: -1 });

module.exports = mongoose.model('Admission', AdmissionSchema);