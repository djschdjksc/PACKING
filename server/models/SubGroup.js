const mongoose = require('mongoose');

const subGroupSchema = new mongoose.Schema({
    subGroupName: { type: String, required: true, unique: true, trim: true }
}, { timestamps: true });

module.exports = mongoose.model('SubGroup', subGroupSchema);
