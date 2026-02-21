const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
    barcode: { type: String, required: true },
    itemName: { type: String, required: true },
    group: { type: String, required: true },
    unit: { type: String, required: true },
    subGroup: { type: String, default: '' },
    short: { type: String, default: '' }, // Optional Short Name
    rate: { type: Number, default: 0 }, // Deprecated but kept for schema compatibility
}, { timestamps: true });

module.exports = mongoose.model('Item', ItemSchema);
