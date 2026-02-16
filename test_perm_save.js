async function testSavePermissions() {
    try {
        const payload = {
            role: 'packer',
            allowedColumns: ['ID', 'Date', 'Item Name', 'Qty']
        };

        // Use appropriate backend URL (port 5000 from server/index.js)
        const response = await fetch('http://localhost:5000/api/permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const data = await response.json();
            console.log('Success:', data);
        } else {
            const text = await response.text();
            console.error('Failed:', text);
        }
    } catch (err) {
        console.error('Error:', err);
    }
}

testSavePermissions();
