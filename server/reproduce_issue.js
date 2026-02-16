const mongoose = require('mongoose');
const PackingEntry = require('./models/PackingEntry');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function testFilter() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB");

        // 1. Create a test entry for TODAY (Now)
        const now = new Date();
        const testEntry = new PackingEntry({
            itemName: "Test Item " + now.getTime(),
            qty: 100,
            packingType: "Box",
            submittedBy: "tester",
            status: "Pending",
            createdAt: now // Explicitly set to now
        });
        await testEntry.save();
        console.log(`Created Entry at: ${now.toISOString()} (Local: ${now.toString()})`);

        // 2. Simulate Filter with ISO Strings (New Logic)
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);

        console.log(`Testing Filter with ISO Range: ${startDate.toISOString()} - ${endDate.toISOString()}`);

        const queryStartDate = startDate.toISOString();
        const queryEndDate = endDate.toISOString();

        let query = {};
        query.createdAt = {};

        // Backend Logic Simulation (New)
        if (queryStartDate) {
            if (queryStartDate.includes('T')) {
                query.createdAt.$gte = new Date(queryStartDate);
            } else {
                const start = new Date(queryStartDate);
                start.setHours(0, 0, 0, 0);
                query.createdAt.$gte = start;
            }
        }
        if (queryEndDate) {
            if (queryEndDate.includes('T')) {
                query.createdAt.$lte = new Date(queryEndDate);
            } else {
                const end = new Date(queryEndDate);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }

        // 3. Search
        const results = await PackingEntry.find({
            _id: testEntry._id,
            ...query
        });

        if (results.length > 0) {
            console.log("SUCCESS: Found the entry using the filter.");
        } else {
            console.log("FAILURE: Did NOT find the entry.");
            console.log("Entry time:", now.toISOString());
            console.log("Query range:", query.createdAt);
        }

        // Cleanup
        await PackingEntry.findByIdAndDelete(testEntry._id);
        console.log("Cleaned up test entry");

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

testFilter();
