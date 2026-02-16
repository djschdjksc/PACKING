const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// MongoDB Connection
// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000 // Fail fast if cannot connect
})
    .then(async () => {
        console.log('MongoDB Connected Successfully');
        // Drop unique index on barcode if exists (to allow duplicates)
        try {
            const collection = mongoose.connection.collection('items');
            const indexes = await collection.indexes();
            const barcodeIndex = indexes.find(idx => idx.name === 'barcode_1' || (idx.key && idx.key.barcode));

            if (barcodeIndex) {
                await collection.dropIndex(barcodeIndex.name);
                console.log('Dropped unique index on barcode (if existed)');
            }
        } catch (e) {
            console.log('Index drop check skipped/failed (non-critical):', e.message);
        }
    })
    .catch(err => {
        console.error('MongoDB Connection Error:', err.message);
        console.error('Possible causes:');
        console.error('1. IP Address not whitelisted in MongoDB Atlas (Network Access)');
        console.error('2. Invalid connection string');
        console.error('3. Firewall blocking connection');
    });

mongoose.connection.on('error', err => {
    console.error('MongoDB Runtime Connection Error:', err);
});

// Models
const Item = require('./models/Item');
const User = require('./models/User');
const PackingEntry = require('./models/PackingEntry');
const Group = require('./models/Group');

// --- API ROUTES ---

// Groups
app.get('/api/groups', async (req, res) => {
    try {
        const groups = await Group.find().sort({ createdAt: -1 });
        res.json(groups);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/groups', async (req, res) => {
    try {
        const newGroup = new Group(req.body);
        await newGroup.save();
        res.status(201).json(newGroup);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/groups/:id', async (req, res) => {
    try {
        await Group.findByIdAndDelete(req.params.id);
        res.json({ message: 'Group deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// User ManagementAUTH & USERS ===

// 1. Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password }); // Plaintext auth for now
        if (user) {
            res.json({ success: true, user: { id: user._id, name: user.name, role: user.role, username: user.username } });
        } else {
            res.status(401).json({ success: false, message: 'Invalid Credentials' });
        }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 2. Create User (Owner Only - Middleware skipped for simplicity, UI will handle)
app.post('/api/users', async (req, res) => {
    try {
        const newUser = new User(req.body);
        const savedUser = await newUser.save();
        res.status(201).json(savedUser);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// 3. List Users
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 4. Delete User
app.delete('/api/users/:id', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});



// Permissions
const RolePermission = require('./models/RolePermission');

// 7. Get Permissions
app.get('/api/permissions/:role', async (req, res) => {
    try {
        const { role } = req.params;
        const permission = await RolePermission.findOne({ role });
        res.json(permission ? permission.allowedColumns : []);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 8. Update Permissions
app.post('/api/permissions', async (req, res) => {
    try {
        const { role, allowedColumns } = req.body;
        console.log(`Received permission update for role: ${role}`, allowedColumns);
        const permission = await RolePermission.findOneAndUpdate(
            { role },
            { allowedColumns },
            { new: true, upsert: true } // Create if not exists
        );
        res.json(permission);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});


// === PACKING DATA ===

// 1. Submit Packing Data
app.post('/api/packing', async (req, res) => {
    try {
        const newEntry = new PackingEntry(req.body);
        const savedEntry = await newEntry.save();
        res.status(201).json(savedEntry);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// 1b. Bulk Import Packing Data
app.post('/api/packing/bulk', async (req, res) => {
    try {
        let entries = req.body;
        if (!Array.isArray(entries)) return res.status(400).json({ message: 'Input must be an array' });

        // Valid entries check
        const validEntries = [];
        const skippedEntries = [];

        entries.forEach((e, idx) => {
            if (e.itemName && (e.qty !== undefined && e.qty !== null && !isNaN(e.qty))) {
                validEntries.push({
                    ...e,
                    createdAt: e.date ? new Date(e.date) : (e.createdAt ? new Date(e.createdAt) : undefined)
                });
            } else {
                skippedEntries.push({ index: idx + 1, reason: 'Missing Name or Qty', data: e });
            }
        });

        if (validEntries.length === 0) {
            return res.status(400).json({
                message: 'No valid entries found.',
                skippedCount: skippedEntries.length,
                errors: skippedEntries.slice(0, 5)
            });
        }

        let insertedCount = 0;
        let insertionErrors = [];

        try {
            const result = await PackingEntry.insertMany(validEntries, { ordered: false });
            insertedCount = result.length;
        } catch (bulkError) {
            if (bulkError.writeErrors) {
                insertedCount = bulkError.insertedDocs.length;
                // Capture specific Mongoose validation errors
                insertionErrors = bulkError.writeErrors.map(e => ({
                    index: 'Unknown', // Mongoose doesn't give original index relative to input easily in unordered
                    reason: e.errmsg,
                    code: e.code
                }));
            } else {
                throw bulkError;
            }
        }

        const allErrors = [...skippedEntries, ...insertionErrors];

        res.status(201).json({
            message: `Processed. Imported: ${insertedCount}. Failed/Skipped: ${allErrors.length}`,
            insertedCount,
            skippedCount: allErrors.length,
            errors: allErrors.slice(0, 20) // Return first 20 errors
        });
    } catch (err) {
        console.error("Bulk Import Fatal Error:", err);
        res.status(500).json({ message: err.message });
    }
});

// 2. Get Packing Data (with filters)
app.get('/api/packing', async (req, res) => {
    try {
        const { submittedBy, status, startDate, endDate } = req.query;
        let query = {};
        if (submittedBy) query.submittedBy = submittedBy;
        if (status) query.status = status;

        // Date Range Filter
        // Date Range Filter
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) {
                // If it looks like a full ISO string (e.g. 2024-01-01T00:00:00.000Z), use it directly
                if (startDate.includes('T')) {
                    query.createdAt.$gte = new Date(startDate);
                } else {
                    // Legacy/Simple Date fallback: Assume Local Start of Day
                    const start = new Date(startDate);
                    start.setHours(0, 0, 0, 0);
                    query.createdAt.$gte = start;
                }
            }
            if (endDate) {
                // If it looks like a full ISO string, use it directly
                if (endDate.includes('T')) {
                    query.createdAt.$lte = new Date(endDate);
                } else {
                    // Legacy/Simple Date fallback: Assume Local End of Day
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    query.createdAt.$lte = end;
                }
            }
        }
        console.log('Constructed Query:', JSON.stringify(query));

        const entries = await PackingEntry.find(query).sort({ createdAt: -1 });
        res.json(entries);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 3. Audit Entry (Update Status)
app.patch('/api/packing/:id', async (req, res) => {
    try {
        const { status, approvedQty, notApprovedQty, auditorRemarks, auditedBy } = req.body;
        const updatedEntry = await PackingEntry.findByIdAndUpdate(
            req.params.id,
            {
                status,
                approvedQty,
                notApprovedQty,
                auditorRemarks,
                auditedBy,
                auditedAt: new Date()
            },
            { new: true }
        );
        res.json(updatedEntry);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 4b. Delete All Packing Data (Admin)
app.delete('/api/admin/cleanup-packing', async (req, res) => {
    try {
        console.log("Received request to DELETE ALL packing data");
        const result = await PackingEntry.deleteMany({});
        console.log(`Deleted ${result.deletedCount} documents`);
        res.json({ message: 'All packing data deleted successfully', deletedCount: result.deletedCount });
    } catch (err) {
        console.error("Error deleting all data:", err);
        res.status(500).json({ message: err.message });
    }
});

// 4. Delete Packing Entry
app.delete('/api/packing/:id', async (req, res) => {
    try {
        await PackingEntry.findByIdAndDelete(req.params.id);
        res.json({ message: 'Entry deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// === ITEM MASTER ===

// 1. Get All Items
app.get('/api/items', async (req, res) => {
    try {
        const items = await Item.find().sort({ createdAt: -1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 2. Add New Item
app.post('/api/items', async (req, res) => {
    try {
        const newItem = new Item(req.body);
        const savedItem = await newItem.save();
        res.status(201).json(savedItem);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// 2b. Bulk Import Items (Auto-Create Groups)
app.post('/api/items/bulk', async (req, res) => {
    try {
        let items = req.body; // Array of { barcode, itemName, group, unit }
        if (!Array.isArray(items)) return res.status(400).json({ message: 'Input must be an array' });

        // Auto-generate barcodes if missing
        items = items.map((item, index) => {
            if (!item.barcode || item.barcode.trim() === '') {
                // Generate a system barcode: SYS_<timestamp>_<index>
                return { ...item, barcode: `SYS_${Date.now()}_${index}` };
            }
            return item;
        });

        // 1. Extract Unique Groups
        const uniqueGroups = [...new Set(items.map(i => i.group).filter(g => g))];

        // 2. Find existing groups
        const existingGroups = await Group.find({ groupName: { $in: uniqueGroups } });
        const existingGroupNames = existingGroups.map(g => g.groupName);

        // 3. Filter new groups to create
        const newGroupsToCreate = uniqueGroups
            .filter(g => !existingGroupNames.includes(g))
            .map(g => ({ groupName: g }));

        // 4. Bulk Insert New Groups
        if (newGroupsToCreate.length > 0) {
            await Group.insertMany(newGroupsToCreate);
        }

        // 5. Bulk Insert Items
        let insertedCount = 0;
        let failedCount = 0;
        let errors = [];

        // We use insertion with error catching per item (or chunks) to report specific failures?
        // Actually, insertMany with ordered: false is best for performance.
        try {
            const result = await Item.insertMany(items, { ordered: false });
            insertedCount = result.length;
        } catch (bulkError) {
            if (bulkError.writeErrors) {
                insertedCount = bulkError.insertedDocs.length;
                failedCount = bulkError.writeErrors.length;
                // Capture first few errors
                errors = bulkError.writeErrors.slice(0, 5).map(e => `Row ${e.index}: ${e.errmsg}`);
            } else {
                throw bulkError;
            }
        }

        res.status(201).json({
            message: 'Bulk import processed',
            groupsCreated: newGroupsToCreate.length,
            itemsInserted: insertedCount,
            itemsFailed: failedCount,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (err) {
        console.error("Bulk Import Error:", err);
        res.status(500).json({ message: err.message });
    }
});

// 3. Update Item
app.put('/api/items/:id', async (req, res) => {
    try {
        const updatedItem = await Item.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedItem);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 4. Delete Item
app.delete('/api/items/:id', async (req, res) => {
    try {
        await Item.findByIdAndDelete(req.params.id);
        res.json({ message: 'Item deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 5. Delete All Items
app.delete('/api/items/all/cleanup', async (req, res) => {
    try {
        await Item.deleteMany({});
        res.json({ message: 'All items deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 6. Delete Items by Group
app.delete('/api/items/group/:groupName', async (req, res) => {
    try {
        const { groupName } = req.params;
        const result = await Item.deleteMany({ group: groupName });
        res.json({ message: `Deleted ${result.deletedCount} items in group ${groupName}` });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} - Bulk Import Enabled`);
});
