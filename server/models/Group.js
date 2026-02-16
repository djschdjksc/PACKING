const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
    groupName: { type: String, required: true, unique: true, trim: true }
}, { timestamps: true });

module.exports = mongoose.model('Group', groupSchema);
