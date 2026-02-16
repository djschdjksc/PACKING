const mongoose = require('mongoose');

const RolePermissionSchema = new mongoose.Schema({
    role: { type: String, required: true, unique: true }, // 'auditor', 'packer'
    allowedColumns: [{ type: String }] // List of column keys/names
}, { timestamps: true });

module.exports = mongoose.model('RolePermission', RolePermissionSchema);
