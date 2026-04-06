
const mongoose = require('mongoose');

const GuardianSchema = new mongoose.Schema(
    {
        name:          { type: String, trim: true, default: '' },
        occupation:    { type: String, trim: true, default: '' },
        officeAddress: { type: String, trim: true, default: '' },
        homeAddress:   { type: String, trim: true, default: '' },
        homePhone:     { type: String, trim: true, default: '' },
        whatsApp:      { type: String, trim: true, default: '' },
        // email:         { type: String, lowercase: true, trim: true, default: '' },
    },
    { _id: false }
);


const ParentSchema = new mongoose.Schema(
    {
        parentId: {
            type:     String,
            unique:   true,
            required: true,
            trim:     true,
            // Format: PAR-YYYY-NNNN
        },

        serialNumber: {
            type:     Number,
            required: true,
        },
        familyName: {
            type:     String,
            required: [true, 'Family name is required'],
            trim:     true,
        },
        email: {
            type:      String,
            required:  [true, 'Email is required'],
            unique:    true,
            lowercase: true,
            trim:      true,
        },

        password: {
            type:   String,
            select: false,
        },

        mustResetPassword: {
            type:    Boolean,
            default: true,
        },

        lastLogin: {
            type:    Date,
            default: null,
        },
        father: {
            type:    GuardianSchema,
            default: () => ({}),
        },
        mother: {
            type:    GuardianSchema,
            default: () => ({}),
        },
        correspondenceEmail: {
            type:      String,
            lowercase: true,
            trim:      true,
            default:   '',
        },

        howDidYouKnow: {
            type:    String,
            trim:    true,
            default: '',
        },
        notificationPreferences: {
            email: { type: Boolean, default: true },
            sms:   { type: Boolean, default: false },
        },

        createdBy:     { type: String, default: '' },
        lastUpdatedBy: { type: String, default: '' },
    },
    {
        timestamps: true,
        toJSON:     { virtuals: true },
        toObject:   { virtuals: true },
    }
);

ParentSchema.virtual('students', {
    ref:          'Student',
    localField:   'parentId',
    foreignField: 'parentId',
});


ParentSchema.index({ parentId:            1 });
ParentSchema.index({ email:               1 });
ParentSchema.index({ correspondenceEmail: 1 });
ParentSchema.index({ createdAt:          -1 });


module.exports = mongoose.model('Parent', ParentSchema);
