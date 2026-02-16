import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import API_BASE_URL from '../config';
import { useAuth } from '../context/AuthContext';
import { ClipboardList, CheckCircle, Clock, AlertCircle, Save, Trash2 } from 'lucide-react';

const PackerDashboard = () => {
    const { user } = useAuth();
    const [items, setItems] = useState([]); // List of items for dropdown
    const [packingData, setPackingData] = useState([]);
    const [allowedColumns, setAllowedColumns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    const [formData, setFormData] = useState({
        itemName: '',
        qty: '',
        packingType: 'Box',
        packingStatus: 'New'
    });

    // Fetch Static Data (Items & Permissions)
    useEffect(() => {
        const fetchStaticData = async () => {
            try {
                const [itemsRes, permRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/items`),
                    fetch(`${API_BASE_URL}/api/permissions/packer`)
                ]);

                if (itemsRes.ok) {
                    const data = await itemsRes.json();
                    setItems(Array.isArray(data) ? data : []);
                }

                if (permRes.ok) {
                    const data = await permRes.json();
                    setAllowedColumns(Array.isArray(data) ? data : []);
                }
            } catch (error) {
                console.error("Error fetching static data", error);
            }
        };
        fetchStaticData();
    }, []);

    // Fetch Packing Data (Depends on User & Date)
    useEffect(() => {
        const fetchPackingData = async () => {
            if (!user?.username) {
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                let url = `${API_BASE_URL}/api/packing?submittedBy=${user.username}`;

                // Append date params with Timezone Correction (Send ISO Strings)
                if (dateRange.start) {
                    const startDate = new Date(dateRange.start);
                    startDate.setHours(0, 0, 0, 0);
                    url += `&startDate=${startDate.toISOString()}`;
                }
                if (dateRange.end) {
                    const endDate = new Date(dateRange.end);
                    endDate.setHours(23, 59, 59, 999);
                    url += `&endDate=${endDate.toISOString()}`;
                }

                const packingRes = await fetch(url);
                if (packingRes.ok) {
                    const data = await packingRes.json();
                    if (Array.isArray(data)) {
                        // Safe Sort
                        try {
                            const sorted = data.sort((a, b) => {
                                const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
                                const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
                                return dateB - dateA;
                            });
                            setPackingData(sorted);
                        } catch (sortErr) {
                            console.error("Sort Error:", sortErr);
                            setPackingData(data); // Fallback to unsorted
                        }
                    } else {
                        console.error("Packing data is not an array:", data);
                        setPackingData([]);
                    }
                } else {
                    console.error("Fetch failed:", packingRes.status, packingRes.statusText);
                    // Optional: setPackingData([]) if we want to clear on error, but keeping old data might be better?
                    // Actually, if filter fails, we should probably show nothing or error.
                    // But user said "components disappear", which implies crash.
                    // We doing nothing here is safe.
                }
            } catch (error) {
                console.error("Error fetching packing data", error);
            } finally {
                setLoading(false);
            }
        };

        fetchPackingData();
    }, [user, dateRange]);

    const handleDelete = async (id) => {
        const password = prompt("Enter password to delete:");
        if (password && password.trim() === "2024") {
            try {
                const response = await fetch(`${API_BASE_URL}/api/packing/${id}`, { method: 'DELETE' });
                if (response.ok) {
                    setPackingData(packingData.filter(item => item._id !== id));
                    alert("Entry deleted successfully.");
                } else {
                    const err = await response.json();
                    alert(`Failed to delete entry: ${err.message}`);
                }
            } catch (error) {
                console.error("Error deleting entry", error);
                alert(`Error deleting entry: ${error.message}`);
            }
        } else if (password !== null) { // If user didn't cancel
            alert("Incorrect password!");
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const newEntry = {
            ...formData,
            qty: Number(formData.qty),
            submittedBy: user.username,
            status: 'Pending'
        };

        try {
            const response = await fetch(`${API_BASE_URL}/api/packing`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newEntry)
            });

            if (response.ok) {
                const savedEntry = await response.json();
                // Add to list and resort
                const updated = [savedEntry, ...packingData].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                setPackingData(updated);
                setFormData({ itemName: '', qty: '', packingType: 'Box', packingStatus: 'New' });
                alert("Packing data submitted successfully!");
            } else {
                alert("Failed to submit data.");
            }
        } catch (error) {
            console.error("Error submitting data", error);
            alert("Error submitting data.");
        }
    };

    return (
        <Layout title="Packer Dashboard">
            <div className="space-y-6">

                {/* Submission Form */}
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                        <ClipboardList className="w-5 h-5 mr-2 text-blue-600" />
                        New Packing Entry
                    </h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
                                <input
                                    list="item-options"
                                    type="text"
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                    placeholder="Search or Select Item"
                                    value={formData.itemName}
                                    onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
                                    required
                                />
                                <datalist id="item-options">
                                    {items.map(item => (
                                        <option key={item._id} value={item.itemName} />
                                    ))}
                                </datalist>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                                <input
                                    type="number"
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                    placeholder="Enter Qty"
                                    value={formData.qty}
                                    onChange={(e) => setFormData({ ...formData, qty: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Packing Status</label>
                                <select
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white"
                                    value={formData.packingStatus}
                                    onChange={(e) => setFormData({ ...formData, packingStatus: e.target.value })}
                                >
                                    <option value="New">New</option>
                                    <option value="Repack">Repack</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Packing Type</label>
                                <select
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white"
                                    value={formData.packingType}
                                    onChange={(e) => setFormData({ ...formData, packingType: e.target.value })}
                                >
                                    <option value="Box">Box</option>
                                    <option value="Gatta">Gatta</option>
                                </select>
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3 px-4 rounded-xl hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200"
                        >
                            Submit Packing Entry
                        </button>
                    </form>
                </div>

                {/* Packing History Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="text-md font-semibold text-gray-700">My Packing History</h3>

                        {/* Date Filter */}
                        <div className="flex items-center space-x-2 bg-gray-50 p-1 rounded-lg border border-gray-200">
                            <input
                                type="date"
                                className="text-xs p-1 border rounded text-gray-600 bg-white"
                                value={dateRange.start}
                                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                            />
                            <span className="text-gray-300">-</span>
                            <input
                                type="date"
                                className="text-xs p-1 border rounded text-gray-600 bg-white"
                                value={dateRange.end}
                                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                            />
                            {(dateRange.start || dateRange.end) && (
                                <button
                                    onClick={() => setDateRange({ start: '', end: '' })}
                                    className="text-xs text-red-500 hover:text-red-700 px-1"
                                >
                                    <XCircle className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {loading ? (
                        <p className="p-4 text-center">Loading...</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        {allowedColumns.includes('ID') && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>}
                                        {allowedColumns.includes('Date') && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>}
                                        {allowedColumns.includes('Item Name') && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Name</th>}
                                        {allowedColumns.includes('Group') && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Group</th>}
                                        {allowedColumns.includes('Qty') && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>}
                                        {allowedColumns.includes('Packing Type') && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>}
                                        {allowedColumns.includes('Packing Status') && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pkg Status</th>}
                                        {allowedColumns.includes('Status') && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>}
                                        {allowedColumns.includes('Approved Qty') && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Approved</th>}
                                        {allowedColumns.includes('Not Approved Qty') && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rejected</th>}
                                        {allowedColumns.includes('Auditor Remarks') && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Remarks</th>}
                                        {allowedColumns.includes('Audited By') && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Audited By</th>}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {packingData.length === 0 ? (
                                        <tr><td colSpan="12" className="p-4 text-center text-gray-500">No data found.</td></tr>
                                    ) : packingData.map((row, index) => {
                                        if (!row) return null; // Safety check
                                        const itemGroup = items?.find(i => i?.itemName === row.itemName)?.group || '-';
                                        return (
                                            <tr key={row._id} className="hover:bg-gray-50 transition-colors">
                                                {allowedColumns.includes('ID') && (
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600">
                                                        {packingData.length - index}
                                                    </td>
                                                )}
                                                {allowedColumns.includes('Date') && (
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                        {new Date(row.createdAt).toLocaleDateString()} {new Date(row.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </td>
                                                )}
                                                {allowedColumns.includes('Item Name') && <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.itemName}</td>}
                                                {allowedColumns.includes('Group') && <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{itemGroup}</td>}
                                                {allowedColumns.includes('Qty') && <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.qty}</td>}
                                                {allowedColumns.includes('Packing Type') && <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.packingType}</td>}
                                                {allowedColumns.includes('Packing Status') && <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">{row.packingStatus || 'New'}</td>}

                                                {allowedColumns.includes('Status') && (
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className={`text-xs px-2 py-0.5 rounded-full flex items-center w-fit
                                                        ${row.status === 'Approved' ? 'bg-green-100 text-green-700' :
                                                                row.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                                                                    'bg-yellow-100 text-yellow-700'}`}>
                                                            {row.status === 'Approved' && <CheckCircle className="w-3 h-3 mr-1" />}
                                                            {row.status === 'Pending' && <Clock className="w-3 h-3 mr-1" />}
                                                            {row.status === 'Rejected' && <AlertCircle className="w-3 h-3 mr-1" />}
                                                            {row.status}
                                                        </span>
                                                    </td>
                                                )}

                                                {allowedColumns.includes('Approved Qty') && <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">{row.approvedQty || 0}</td>}
                                                {allowedColumns.includes('Not Approved Qty') && <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">{row.notApprovedQty || 0}</td>}
                                                {allowedColumns.includes('Auditor Remarks') && <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 italic">{row.auditorRemarks || '-'}</td>}
                                                {allowedColumns.includes('Audited By') && <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.auditedBy || '-'}</td>}

                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                                    <button
                                                        onClick={() => handleDelete(row._id)}
                                                        className="text-red-500 hover:text-red-700 p-1"
                                                        title="Delete Entry"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

            </div>
        </Layout>
    );
};

export default PackerDashboard;
