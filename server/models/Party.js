const mongoose = require('mongoose');

const PartySchema = new mongoose.Schema({
    name: { type: String, required: true },
    station: { type: String, default: '' },
    mobile: { type: String, default: '' } // Keeping mobile as optional
}, { timestamps: true });

module.exports = mongoose.model('Party', PartySchema);
