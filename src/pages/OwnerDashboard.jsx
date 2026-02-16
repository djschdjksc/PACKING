import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../config';
import Layout from '../components/Layout';
import { TrendingUp, Users, Package, AlertTriangle, CheckCircle, XCircle, Clock, Upload } from 'lucide-react';

const StatCard = ({ title, value, icon: Icon, color }) => (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
        <div>
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-full ${color}`}>
            <Icon className="h-6 w-6 text-white" />
        </div>
    </div>
);

const OwnerDashboard = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('packing');
    const [packingData, setPackingData] = useState([]);
    const [items, setItems] = useState([]);
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    useEffect(() => {
        // Fetch Packing Data
        const fetchPacking = async () => {
            try {
                let url = `${API_BASE_URL}/api/packing`;
                const params = new URLSearchParams();

                // Date Logic: Send ISO strings for Local Start/End of Day
                if (dateRange.start) {
                    const start = new Date(dateRange.start);
                    start.setHours(0, 0, 0, 0);
                    params.append('startDate', start.toISOString());
                }
                if (dateRange.end) {
                    const end = new Date(dateRange.end);
                    end.setHours(23, 59, 59, 999);
                    params.append('endDate', end.toISOString());
                }

                if (params.toString()) url += `?${params.toString()}`;

                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    // Sort by Date Descending (Newest First) - API does it but good to ensure
                    try {
                        const sorted = data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                        setPackingData(sorted);
                    } catch (sortErr) {
                        console.error("Sort Error Owner:", sortErr);
                        setPackingData(data);
                    }
                }
            } catch (err) { console.error(err); }
        };

        // Fetch Items
        const fetchItems = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/items`);
                if (response.ok) setItems(await response.json());
            } catch (err) { console.error(err); }
        };

        fetchPacking();
        fetchItems();
    }, [dateRange]);

    // Import Packing Data
    const handlePackingImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            const text = evt.target.result;
            const lines = text.split(/\r\n|\n/).map(r => r.trim()).filter(r => r);
            if (lines.length === 0) return;

            // Detect Delimiter
            const firstLine = lines[0];
            let delimiter = ',';
            if (firstLine.includes('\t')) delimiter = '\t';
            else if (firstLine.includes(';')) delimiter = ';';

            // Parse Headers (try to find columns by name)
            const headers = firstLine.toLowerCase().split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));

            // Map known column names to their index
            let nameIndex = headers.findIndex(h => h === 'item name' || h === 'itemname' || h.includes('item name'));
            let qtyIndex = headers.findIndex(h => h === 'qty' || h === 'quantity' || h.includes('qty'));
            let dateIndex = headers.findIndex(h => h === 'date' || h.includes('date') || h === 'createdat'); // Find Date Column
            let submittedByIndex = headers.findIndex(h => h.includes('submitted') || h === 'packer');
            let statusIndex = headers.findIndex(h => h === 'status');
            let packingTypeIndex = headers.findIndex(h => h.includes('packing') || h.includes('type'));

            // Fallback strategy if headers not found via name matching
            if (nameIndex === -1 || qtyIndex === -1) {
                // User Format: ID, DATE, ITEM NAME, QTY, Submitted By, Group...
                if (headers.length >= 10 && (headers[0].includes('id') || headers[1].includes('date'))) {
                    dateIndex = 1;
                    nameIndex = 2;
                    qtyIndex = 3;
                    submittedByIndex = 4;
                    statusIndex = 6;
                    packingTypeIndex = 9;
                }
            }

            if (nameIndex === -1 || qtyIndex === -1) {
                console.error('Debug Headers:', headers);
                alert(`Could not detect 'Item Name' or 'Qty' columns.\nHeaders found: ${headers.join(', ')}`);
                return;
            }

            const data = lines.slice(1).map((row, idx) => {
                const values = row.split(delimiter);

                // Safety check
                if (values.length <= Math.max(nameIndex, qtyIndex)) return null;

                let itemName = values[nameIndex]?.replace(/^"|"$/g, '').replace(/[^\x20-\x7E]/g, '').trim();
                let qtyStr = values[qtyIndex]?.replace(/^"|"$/g, '').replace(/[^\x20-\x7E]/g, '').trim();

                let qty = parseFloat(qtyStr);

                if (!itemName || isNaN(qty)) {
                    console.warn(`Skipping row ${idx + 2}: Invalid Name or Qty`, row);
                    return null;
                }

                let packingType = 'Box';
                let submittedBy = 'Imported';
                let status = 'Pending';
                let dateStr = null;

                if (packingTypeIndex !== -1 && values[packingTypeIndex]) packingType = values[packingTypeIndex].replace(/^"|"$/g, '').trim() || 'Box';
                if (statusIndex !== -1 && values[statusIndex]) status = values[statusIndex].replace(/^"|"$/g, '').trim() || 'Pending';
                if (submittedByIndex !== -1 && values[submittedByIndex]) {
                    submittedBy = values[submittedByIndex].replace(/^"|"$/g, '').trim();
                }
                if (dateIndex !== -1 && values[dateIndex]) {
                    dateStr = values[dateIndex].replace(/^"|"$/g, '').trim();
                    // Attempt to parse DD/MM/YYYY or DD-MM-YYYY to ISO
                    const dmy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
                    if (dmy) {
                        // Create valid ISO string: YYYY-MM-DD
                        dateStr = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
                    }
                }

                // Status Validation
                const validStatuses = ['Pending', 'Approved', 'Rejected'];
                if (!validStatuses.includes(status)) status = 'Pending';

                let approvedQty = (status === 'Approved') ? qty : 0;
                let notApprovedQty = (status === 'Rejected') ? qty : 0;

                return {
                    itemName,
                    qty,
                    submittedBy: submittedBy || 'Owner',
                    packingType,
                    status,
                    approvedQty,
                    notApprovedQty,
                    date: dateStr // Send date to backend
                };
            }).filter(i => i);

            if (data.length === 0) {
                alert("No valid data found. Pls check format.");
                return;
            }

            if (window.confirm(`Found ${data.length} entries. Import?`)) {
                try {
                    const res = await fetch(`${API_BASE_URL}/api/packing/bulk`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });

                    if (res.ok) {
                        const result = await res.json();
                        let msg = `Import Success!\nInserted: ${result.insertedCount}`;

                        if (result.skippedCount > 0) {
                            msg += `\nSkipped/Failed: ${result.skippedCount}`;
                            msg += `\n\nErrors (First 20):\n` + result.errors.map(e =>
                                `Row ${e.index || '?'}: ${e.reason}`
                            ).join('\n');
                        }

                        alert(msg);

                        // Refresh
                        const response = await fetch(`${API_BASE_URL}/api/packing`);
                        if (response.ok) {
                            const data = await response.json();
                            const sorted = data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                            setPackingData(sorted);
                        }
                    } else {
                        const err = await res.json();
                        let errMsg = "Import Failed: " + (err.message || "Unknown error");
                        if (err.errors && err.errors.length > 0) {
                            errMsg += `\n\nDetails:\n` + err.errors.map(e => `Row ${e.index || '?'}: ${e.reason}`).join('\n');
                        }
                        alert(errMsg);
                    }
                } catch (error) {
                    console.error("Import error", error);
                    alert("Import Error: " + error.message);
                }
            }
            e.target.value = null; // Reset
        };
        reader.readAsText(file);
    };

    // Export to CSV
    const downloadCSV = () => {
        if (packingData.length === 0) {
            alert("No data to export");
            return;
        }

        const itemGroupMap = {};
        items.forEach(i => {
            itemGroupMap[i.itemName] = i.group;
        });

        const headers = [
            "ID", "DATE", "ITEM NAME", "QTY", "Submitted By", "Group",
            "Status", "Auditor Remarks", "Username", "Packing Type",
            "Approved Qty", "Not Approved Qty"
        ];

        const rows = packingData.map(row => {
            // Calculations
            const qty = row.qty || 0;
            const approved = row.approvedQty || 0;
            const rejected = row.notApprovedQty || 0;
            // Balance logic removed

            // Format Date
            const dateObj = new Date(row.createdAt);
            const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString();

            return [
                packingData.length - index, // Export Sequential ID
                dateStr,
                `"${(row.itemName || '').replace(/"/g, '""')}"`, // Escape quotes
                qty,
                row.submittedBy,
                `"${(itemGroupMap[row.itemName] || 'N/A').replace(/"/g, '""')}"`, // Group lookup
                row.status,
                `"${(row.auditorRemarks || '').replace(/"/g, '""')}"`,
                row.auditedBy || '', // "Username" column (Auditor)
                row.packingType,
                approved,
                rejected
            ].join(",");
        });

        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Packing_List_Export_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDeleteEntry = async (id) => {
        if (window.confirm('Are you sure you want to delete this entry? This cannot be undone.')) {
            try {
                const response = await fetch(`${API_BASE_URL}/api/packing/${id}`, {
                    method: 'DELETE'
                });
                if (response.ok) {
                    setPackingData(packingData.filter(item => item._id !== id));
                } else {
                    alert('Failed to delete entry');
                }
            } catch (error) {
                console.error("Error deleting entry", error);
            }
        }
    };

    return (
        <Layout title="Owner Dashboard">
            <div className="space-y-6">

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard title="Total Items" value={items.length} icon={Package} color="bg-blue-500" />
                    <StatCard title="Total Packed" value={packingData.length} icon={TrendingUp} color="bg-green-500" />
                    <StatCard title="Pending Audit" value={packingData.filter(i => i.status === 'Pending').length} icon={AlertTriangle} color="bg-yellow-500" />
                    <StatCard title="Active Packers" value="3" icon={Users} color="bg-purple-500" />
                </div>

                <div className="flex justify-end space-x-4">
                    <button
                        onClick={() => navigate('/users')}
                        className="bg-purple-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-purple-700 flex items-center"
                    >
                        <Users className="h-5 w-5 mr-2" />
                        Manage Users
                    </button>
                    <button
                        onClick={() => navigate('/item-master')}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 flex items-center"
                    >
                        <Package className="h-5 w-5 mr-2" />
                        Item Master
                    </button>
                </div>

                {/* Tabs Section */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden min-h-[400px]">
                    <div className="flex border-b border-gray-100 justify-between items-center bg-gray-50 px-2 py-2">
                        <div className="flex items-center space-x-4">
                            <div className="flex">
                                <button
                                    onClick={() => setActiveTab('packing')}
                                    className={`px-4 py-2 text-sm font-medium rounded-lg ${activeTab === 'packing' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Packing List
                                </button>
                                <button
                                    onClick={() => setActiveTab('items')}
                                    className={`px-4 py-2 text-sm font-medium rounded-lg ${activeTab === 'items' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Item Master
                                </button>
                            </div>

                            {/* Date Filter */}
                            {activeTab === 'packing' && (
                                <div className="flex items-center space-x-2 bg-white p-1 rounded-lg border border-gray-200">
                                    <span className="text-xs text-gray-400 pl-2">Filter:</span>
                                    <input
                                        type="date"
                                        className="text-xs p-1 border rounded text-gray-600"
                                        value={dateRange.start}
                                        onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                                        title="From Date"
                                    />
                                    <span className="text-gray-300">-</span>
                                    <input
                                        type="date"
                                        className="text-xs p-1 border rounded text-gray-600"
                                        value={dateRange.end}
                                        onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                                        title="To Date"
                                    />
                                    {(dateRange.start || dateRange.end) && (
                                        <button
                                            onClick={() => setDateRange({ start: '', end: '' })}
                                            className="text-xs text-red-500 hover:text-red-700 px-1"
                                            title="Clear Date Filter"
                                        >
                                            <XCircle className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {activeTab === 'packing' && (
                            <div className="flex space-x-2">
                                <label className="cursor-pointer text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 flex items-center shadow-sm">
                                    <Upload className="h-3 w-3 mr-1" /> Import
                                    <input type="file" accept=".csv" className="hidden" onChange={handlePackingImport} />
                                </label>
                                <button onClick={downloadCSV} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 flex items-center shadow-sm">
                                    <TrendingUp className="h-3 w-3 mr-1" /> Export
                                </button>
                                <button
                                    onClick={async () => {
                                        if (window.confirm("Are you sure you want to DELETE ALL packing data? This cannot be undone.")) {
                                            const pwd = prompt("Enter password to confirm:");
                                            if (pwd && pwd.trim() === "2024") {
                                                try {
                                                    const res = await fetch(`${API_BASE_URL}/api/admin/cleanup-packing`, { method: 'DELETE' });
                                                    if (res.ok) {
                                                        alert("All data deleted.");
                                                        setPackingData([]);
                                                    } else {
                                                        const err = await res.json();
                                                        console.error("Delete failed:", err);
                                                        alert(`Failed to delete: ${err.message || res.statusText}`);
                                                    }
                                                } catch (e) {
                                                    console.error("Delete error:", e);
                                                    alert(`Error: ${e.message}`);
                                                }
                                            } else if (pwd !== null) {
                                                alert("Incorrect password.");
                                            }
                                        }
                                    }}
                                    className="text-xs bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 flex items-center shadow-sm"
                                >
                                    <XCircle className="h-3 w-3 mr-1" /> Delete All
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="p-0">
                        {/* Packing List Table */}
                        {activeTab === 'packing' && (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Name</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Group</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Packer</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pkg Status</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Appr / Rej</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Audited By</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {packingData.length === 0 ? (
                                            <tr><td colSpan="9" className="p-4 text-center text-gray-500">No data found.</td></tr>
                                        ) : packingData.map((row, index) => {
                                            const itemGroup = items.find(i => i.itemName === row.itemName)?.group || '-';
                                            return (
                                                <tr key={row._id} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600">
                                                        {packingData.length - index}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                        {new Date(row.createdAt).toLocaleDateString()}
                                                        <span className="block text-xs text-gray-400">{new Date(row.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.itemName}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{itemGroup}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{row.submittedBy}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.qty}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">{row.packingStatus || 'New'}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        {row.status === 'Approved' && (
                                                            <span className="flex items-center text-green-600 font-medium text-sm">
                                                                <div className="p-1 bg-green-100 rounded-full mr-2"><CheckCircle className="h-3 w-3" /></div>
                                                                Approved
                                                            </span>
                                                        )}
                                                        {row.status === 'Pending' && (
                                                            <span className="flex items-center text-yellow-600 font-medium text-sm">
                                                                <div className="p-1 bg-yellow-100 rounded-full mr-2"><Clock className="h-3 w-3" /></div>
                                                                Pending
                                                            </span>
                                                        )}
                                                        {row.status === 'Rejected' && (
                                                            <span className="flex items-center text-red-600 font-medium text-sm">
                                                                <div className="p-1 bg-red-100 rounded-full mr-2"><XCircle className="h-3 w-3" /></div>
                                                                Rejected
                                                            </span>
                                                        )}
                                                        {row.auditorRemarks && <div className="text-xs text-gray-400 italic mt-1 max-w-[150px] truncate">{row.auditorRemarks}</div>}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                        <span className="text-green-600">{row.approvedQty || 0}</span> / <span className="text-red-600">{row.notApprovedQty || 0}</span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                        {row.auditedBy || '-'}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                        <button
                                                            onClick={() => handleDeleteEntry(row._id)}
                                                            className="text-red-500 hover:text-red-700 bg-red-50 p-2 rounded-full hover:bg-red-100"
                                                            title="Delete Entry"
                                                        >
                                                            <XCircle className="h-5 w-5" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Item Master List */}
                        {activeTab === 'items' && (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Barcode</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Name</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Group</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {items.map((item) => (
                                            <tr key={item._id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.barcode}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.itemName}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.group}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.unit}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </Layout>
    );
};

export default OwnerDashboard;
