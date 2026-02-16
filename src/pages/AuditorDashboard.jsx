import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../config';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { CheckCircle, XCircle, AlertTriangle, ChevronRight, X, Clock, AlertCircle } from 'lucide-react';

const AuditorDashboard = () => {
    const { user } = useAuth();
    const [packingData, setPackingData] = useState([]);
    const [items, setItems] = useState([]);
    const [allowedColumns, setAllowedColumns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [editingId, setEditingId] = useState(null);
    const [editValue, setEditValue] = useState('');

    // Fetch Static Data
    useEffect(() => {
        const fetchStaticData = async () => {
            try {
                const [permRes, itemsRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/permissions/auditor`),
                    fetch(`${API_BASE_URL}/api/items`)
                ]);

                if (permRes.ok) {
                    const data = await permRes.json();
                    setAllowedColumns(Array.isArray(data) ? data : []);
                }

                if (itemsRes.ok) {
                    const data = await itemsRes.json();
                    setItems(Array.isArray(data) ? data : []);
                }
            } catch (error) {
                console.error("Error fetching static data", error);
            }
        };
        fetchStaticData();
    }, []);

    // Fetch Packing Data
    useEffect(() => {
        const fetchPackingData = async () => {
            setLoading(true);
            try {
                let url = `${API_BASE_URL}/api/packing`;
                const params = new URLSearchParams();
                if (dateRange.start) params.append('startDate', dateRange.start);
                if (dateRange.end) params.append('endDate', dateRange.end);

                if (params.toString()) url += `?${params.toString()}`;

                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    if (Array.isArray(data)) {
                        setPackingData(data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
                    } else {
                        setPackingData([]);
                    }
                }
            } catch (error) {
                console.error("Error fetching data", error);
            } finally {
                setLoading(false);
            }
        };
        fetchPackingData();
    }, [dateRange]);

    const startEditing = (item) => {
        setEditingId(item._id);
        // Default to remaining quantity
        const remaining = item.qty - (item.approvedQty || 0);
        setEditValue(remaining > 0 ? remaining : 0);
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditValue('');
    };

    const saveAudit = async (item) => {
        const inputQty = Number(editValue);
        if (isNaN(inputQty) || inputQty < 0) {
            alert("Please enter a valid quantity");
            return;
        }

        // Cumulative Logic
        const previousApproved = item.approvedQty || 0;
        const previousRejected = item.notApprovedQty || 0; // We aren't changing rejected inline for now, or assume 0 change

        const finalApprovedQty = previousApproved + inputQty;

        // Determine Status
        let newStatus = 'Pending';
        if (finalApprovedQty >= item.qty) {
            newStatus = 'Approved';
        } else if (finalApprovedQty > 0) {
            newStatus = 'Partially Approved';
        }

        // Auto-generate remark for inline edit
        const newRemarks = item.auditorRemarks ?
            `${item.auditorRemarks} | ${new Date().toLocaleDateString()}: Added ${inputQty}` :
            `${new Date().toLocaleDateString()}: Added ${inputQty}`;

        const payload = {
            status: newStatus,
            approvedQty: finalApprovedQty,
            notApprovedQty: previousRejected, // Keep existing rejected
            auditorRemarks: newRemarks,
            auditedBy: user.username
        };

        try {
            const response = await fetch(`/api/packing/${item._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                // Refresh Data
                const refresh = await fetch('/api/packing');
                if (refresh.ok) {
                    const data = await refresh.json();
                    setPackingData(data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
                }
                setEditingId(null);
                setEditValue('');
            } else {
                alert("Audit submission failed.");
            }
        } catch (error) {
            console.error("Error submitting audit", error);
        }
    };

    return (
        <Layout title="Auditor Dashboard">
            {/* Modal Removed */}

            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="font-semibold text-gray-700">Packing List</h2>

                    {/* Date Filter */}
                    <div className="flex items-center space-x-2 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
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
                    <p className="text-center py-10 text-gray-500">Loading...</p>
                ) : (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        {allowedColumns.includes('ID') && <th className="px-2 py-3 md:px-6 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>}
                                        {allowedColumns.includes('Date') && <th className="px-2 py-3 md:px-6 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>}
                                        {allowedColumns.includes('Item Name') && <th className="px-2 py-3 md:px-6 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>}
                                        {allowedColumns.includes('Group') && <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Group</th>}
                                        {allowedColumns.includes('Qty') && <th className="px-2 py-3 md:px-6 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>}
                                        {allowedColumns.includes('Packing Type') && <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>}
                                        {allowedColumns.includes('Packing Status') && <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pkg Status</th>}
                                        {allowedColumns.includes('Submitted By') && <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Packer</th>}
                                        {allowedColumns.includes('Status') && <th className="px-2 py-3 md:px-6 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>}
                                        {allowedColumns.includes('Approved Qty') && <th className="px-2 py-3 md:px-6 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Appr/Rej</th>}
                                        {allowedColumns.includes('Not Approved Qty') && <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Not Approved</th>}
                                        {allowedColumns.includes('Auditor Remarks') && <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Remarks</th>}
                                        {allowedColumns.includes('Audited By') && <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Audited By</th>}
                                        <th className="px-2 py-3 md:px-6 md:py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {packingData.length === 0 ? (
                                        <tr><td colSpan="13" className="p-4 text-center text-gray-500">No data found.</td></tr>
                                    ) : packingData.map((row, index) => {
                                        const itemGroup = items.find(i => i.itemName === row.itemName)?.group || '-';
                                        return (
                                            <tr key={row._id} className="hover:bg-gray-50 transition-colors">
                                                {allowedColumns.includes('ID') && (
                                                    <td className="px-2 py-3 md:px-6 md:py-4 whitespace-nowrap text-sm font-bold text-blue-600">
                                                        {packingData.length - index}
                                                    </td>
                                                )}
                                                {allowedColumns.includes('Date') && (
                                                    <td className="px-2 py-3 md:px-6 md:py-4 whitespace-nowrap text-sm text-gray-500">
                                                        <div className="flex flex-col">
                                                            <span>{new Date(row.createdAt).toLocaleDateString()}</span>
                                                            <span className="text-xs text-gray-400">{new Date(row.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                        </div>
                                                    </td>
                                                )}
                                                {allowedColumns.includes('Item Name') && <td className="px-2 py-3 md:px-6 md:py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.itemName}</td>}
                                                {allowedColumns.includes('Group') && <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-500">{itemGroup}</td>}
                                                {allowedColumns.includes('Qty') && <td className="px-2 py-3 md:px-6 md:py-4 whitespace-nowrap text-sm text-gray-900">{row.qty}</td>}
                                                {allowedColumns.includes('Packing Type') && <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.packingType}</td>}
                                                {allowedColumns.includes('Packing Status') && <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">{row.packingStatus || 'New'}</td>}
                                                {allowedColumns.includes('Submitted By') && <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.submittedBy}</td>}

                                                {allowedColumns.includes('Status') && (
                                                    <td className="px-2 py-3 md:px-6 md:py-4 whitespace-nowrap">
                                                        <span className={`text-xs px-2 py-0.5 rounded-full flex items-center w-fit justify-center
                                                        ${row.status === 'Approved' ? 'bg-green-100 text-green-700' :
                                                                row.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                                                                    row.status === 'Partially Approved' ? 'bg-blue-100 text-blue-700' :
                                                                        'bg-yellow-100 text-yellow-700'}`}>
                                                            {row.status === 'Approved' && <CheckCircle className="w-3 h-3 md:mr-1" />}
                                                            {row.status === 'Pending' && <Clock className="w-3 h-3 md:mr-1" />}
                                                            {row.status === 'Rejected' && <AlertCircle className="w-3 h-3 md:mr-1" />}
                                                            {row.status === 'Partially Approved' && <AlertTriangle className="w-3 h-3 md:mr-1" />}
                                                            <span className="hidden md:inline">{row.status}</span>
                                                        </span>
                                                    </td>
                                                )}

                                                {allowedColumns.includes('Approved Qty') && (
                                                    <td className="px-2 py-3 md:px-6 md:py-4 whitespace-nowrap text-sm font-medium">
                                                        <span className="text-green-600">{row.approvedQty || 0}</span>
                                                        <span className="md:hidden text-gray-400 mx-1">/</span>
                                                        <span className="md:hidden text-red-600">{row.notApprovedQty || 0}</span>
                                                    </td>
                                                )}
                                                {allowedColumns.includes('Not Approved Qty') && (
                                                    <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">
                                                        {row.notApprovedQty || 0}
                                                    </td>
                                                )}
                                                {allowedColumns.includes('Auditor Remarks') && <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-500 italic">{row.auditorRemarks || '-'}</td>}
                                                {allowedColumns.includes('Audited By') && <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.auditedBy || '-'}</td>}

                                                <td className="px-2 py-3 md:px-6 md:py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    {(row.status === 'Pending' || row.status === 'Partially Approved') && (
                                                        editingId === row._id ? (
                                                            <div className="flex items-center space-x-2">
                                                                <input
                                                                    type="number"
                                                                    autoFocus
                                                                    className="w-20 p-1 border rounded text-sm"
                                                                    value={editValue}
                                                                    onChange={(e) => setEditValue(e.target.value)}
                                                                />
                                                                <button onClick={() => saveAudit(row)} className="text-green-600 hover:text-green-800 font-bold">Save</button>
                                                                <button onClick={cancelEditing} className="text-red-500 hover:text-red-700">Cancel</button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => startEditing(row)}
                                                                className="text-white bg-blue-600 px-3 py-1 rounded hover:bg-blue-700"
                                                            >
                                                                {row.status === 'Partially Approved' ? 'Resume' : 'Audit'}
                                                            </button>
                                                        )
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default AuditorDashboard;
