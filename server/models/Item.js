const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
    barcode: { type: String, required: true },
    itemName: { type: String, required: true },
    group: { type: String, required: true },
    unit: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Item', ItemSchema);
