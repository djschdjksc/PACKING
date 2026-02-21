const mongoose = require('mongoose');

const BillSchema = new mongoose.Schema({
    billNo: { type: String, required: true },
    date: { type: Date, default: Date.now },
    customerDetails: {
        name: { type: String, required: true },
        station: { type: String },
        vehicleNo: { type: String },
        vehicleType: { type: String }
    },
    items: [{
        sr: Number,
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' }, // Optional reference
        itemName: { type: String, required: true },
        qty: { type: Number, required: true },
        uCap: String, // Keeping as String to match frontend flexibility
        lCap: String,
        rate: Number, // Item Rate (base) or Effective Rate if stored
        amount: Number, // Calculated amount
        group: String,
        subGroup: String
    }],
    adjustments: [{
        id: String, // Frontend ID
        type: { type: String, enum: ['add', 'deduct'] },
        desc: String,
        amount: Number
    }],
    grandTotal: { type: Number, required: true }, // Store final total for quick listing
    createdBy: { type: String, default: 'Biller' } // Could be User ID later
}, { timestamps: true });

module.exports = mongoose.model('Bill', BillSchema);
