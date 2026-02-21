const mongoose = require('mongoose');

const PackingEntrySchema = new mongoose.Schema({
    itemName: { type: String, required: true },
    qty: { type: Number, required: true },
    packingType: { type: String, required: true, enum: ['Box', 'Gatta'] },
    packingStatus: { type: String, default: 'New' },
    submittedBy: { type: String, required: true }, // Username

    // Status
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected', 'Partially Approved'],
        default: 'Pending'
    },

    // Audit Fields
    approvedQty: { type: Number, default: 0 },
    notApprovedQty: { type: Number, default: 0 },
    auditorRemarks: { type: String },
    auditedBy: { type: String },
    auditedAt: { type: Date },
    isPrintRequested: { type: Boolean, default: false },
    isPrintConfirmed: { type: Boolean, default: false }

}, { timestamps: true });

module.exports = mongoose.model('PackingEntry', PackingEntrySchema);
