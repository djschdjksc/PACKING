import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../components/Layout';
import API_BASE_URL from '../config';
import { useAuth } from '../context/AuthContext';
import { ClipboardList, CheckCircle, Clock, AlertCircle, Trash2, Calendar, Users, List, ChevronRight, ChevronDown, XCircle } from 'lucide-react';

const PackerDashboard = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('form'); // 'form', 'all', 'daywise', 'userwise'
    const [items, setItems] = useState([]);
    const [packingData, setPackingData] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [allowedColumns, setAllowedColumns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [expandedDate, setExpandedDate] = useState(null);

    const [formData, setFormData] = useState({
        itemName: '',
        qty: '',
        packingType: 'Box',
        packingStatus: 'New'
    });

    // Fetch Static Data
    useEffect(() => {
        const fetchStaticData = async () => {
            try {
                const [itemsRes, permRes, usersRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/items`),
                    fetch(`${API_BASE_URL}/api/permissions/packer`),
                    fetch(`${API_BASE_URL}/api/users`)
                ]);

                if (itemsRes.ok) setItems(await itemsRes.json());
                if (permRes.ok) setAllowedColumns(await permRes.json());
                if (usersRes.ok) setAllUsers(await usersRes.json());
            } catch (error) {
                console.error("Error fetching data", error);
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

                // If user is not admin, restrict to their own data
                if (user?.role !== 'admin') {
                    url += `?submittedBy=${user.username}`;
                }

                if (dateRange.start) {
                    const startDate = new Date(dateRange.start);
                    startDate.setHours(0, 0, 0, 0);
                    url += (url.includes('?') ? '&' : '?') + `startDate=${startDate.toISOString()}`;
                }
                if (dateRange.end) {
                    const endDate = new Date(dateRange.end);
                    endDate.setHours(23, 59, 59, 999);
                    url += (url.includes('?') ? '&' : '?') + `endDate=${endDate.toISOString()}`;
                }

                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    setPackingData(Array.isArray(data) ? data : []);
                }
            } catch (error) {
                console.error("Error fetching packing data", error);
            } finally {
                setLoading(false);
            }
        };

        if (user?.username) fetchPackingData();
    }, [user, dateRange, activeTab]);

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
                setPackingData([savedEntry, ...packingData]);
                setFormData({ itemName: '', qty: '', packingType: 'Box', packingStatus: 'New' });
                alert("Packing data submitted successfully!");
            }
        } catch (error) {
            console.error("Error submitting data", error);
        }
    };

    const handleDelete = async (id) => {
        const password = prompt("Enter password to delete:");
        if (password === "2024") {
            try {
                const response = await fetch(`${API_BASE_URL}/api/packing/${id}`, { method: 'DELETE' });
                if (response.ok) {
                    setPackingData(packingData.filter(item => item._id !== id));
                    alert("Entry deleted successfully.");
                }
            } catch (error) {
                console.error("Error deleting entry", error);
            }
        }
    };

    const handlePrintToggle = async (id) => {
        // Optimistic Update: If either is true, untick both. Else requested = true.
        setPackingData(prevData => prevData.map(item => {
            if (item._id === id) {
                if (item.isPrintRequested || item.isPrintConfirmed) {
                    return { ...item, isPrintRequested: false, isPrintConfirmed: false };
                } else {
                    return { ...item, isPrintRequested: true };
                }
            }
            return item;
        }));

        try {
            const response = await fetch(`${API_BASE_URL}/api/packing/${id}/print`, { method: 'PATCH' });
            if (!response.ok) {
                // Rollback if failed
                const res = await fetch(`${API_BASE_URL}/api/packing/${id}`);
                if (res.ok) {
                    const original = await res.json();
                    setPackingData(prevData => prevData.map(item => item._id === id ? original : item));
                }
                console.error("Failed to toggle print status");
            } else {
                const updated = await response.json();
                setPackingData(prevData => prevData.map(item => item._id === id ? updated : item));
            }
        } catch (error) {
            console.error("Error toggling print status", error);
        }
    };

    const handleBulkPrintConfirm = async () => {
        const selectedCount = packingData.filter(p => p.isPrintRequested).length;
        if (selectedCount === 0) return;

        if (!window.confirm(`Save ${selectedCount} items for barcode printing?`)) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/packing/bulk-print-confirm`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ submittedBy: user.username })
            });
            if (response.ok) {
                // Refresh data
                const res = await fetch(`${API_BASE_URL}/api/packing?submittedBy=${user.username}`);
                if (res.ok) setPackingData(await res.json());
                alert("Confirmed for Print!");
            }
        } catch (error) {
            console.error("Error confirming prints", error);
        }
    };

    const handleBulkPrintClear = async () => {
        const selectedCount = packingData.filter(p => p.isPrintRequested).length;
        if (selectedCount === 0) return;

        if (!window.confirm("Untick all selected items?")) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/packing/bulk-print-clear`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ submittedBy: user.username })
            });
            if (response.ok) {
                // Refresh data
                const res = await fetch(`${API_BASE_URL}/api/packing?submittedBy=${user.username}`);
                if (res.ok) setPackingData(await res.json());
            }
        } catch (error) {
            console.error("Error clearing prints", error);
        }
    };

    const getStatusEmoji = (status) => {
        switch (status) {
            case 'Approved': return '✅';
            case 'Rejected': return '❌';
            case 'Partially Approved': return '⚠️';
            default: return '⏳';
        }
    };

    // --- Computed Data ---

    // Day Wise Aggregation (Date -> Group -> Items)
    const dayWiseData = useMemo(() => {
        const groupsByDate = {};

        packingData.forEach(entry => {
            const date = new Date(entry.createdAt).toLocaleDateString();
            if (!groupsByDate[date]) groupsByDate[date] = { totalQty: 0, groups: {} };

            groupsByDate[date].totalQty += entry.qty;

            // Get item group
            const itemInfo = items.find(i => i.itemName === entry.itemName);
            const groupName = itemInfo?.group || 'Uncategorized';

            if (!groupsByDate[date].groups[groupName]) {
                groupsByDate[date].groups[groupName] = { groupTotal: 0, items: [] };
            }

            groupsByDate[date].groups[groupName].groupTotal += entry.qty;
            groupsByDate[date].groups[groupName].items.push({
                ...entry,
                short: itemInfo?.short || ''
            });
        });

        return Object.entries(groupsByDate).map(([date, data]) => ({
            date,
            totalQty: data.totalQty,
            groups: Object.entries(data.groups).map(([groupName, groupData]) => ({
                groupName,
                groupTotal: groupData.groupTotal,
                items: groupData.items
            }))
        })).sort((a, b) => new Date(b.date) - new Date(a.date));
    }, [packingData, items]);

    // User Wise Aggregation
    const userWiseData = useMemo(() => {
        const stats = {};
        allUsers.forEach(u => {
            stats[u.username] = { name: u.name, totalQty: 0, entries: 0, role: u.role };
        });

        packingData.forEach(entry => {
            if (stats[entry.submittedBy]) {
                stats[entry.submittedBy].totalQty += entry.qty;
                stats[entry.submittedBy].entries += 1;
            } else {
                stats[entry.submittedBy] = { name: entry.submittedBy, totalQty: entry.qty, entries: 1 };
            }
        });

        return Object.values(stats).sort((a, b) => b.totalQty - a.totalQty);
    }, [packingData, allUsers]);

    return (
        <Layout title="Packer Dashboard">
            <div className={`space-y-6 ${activeTab !== 'form' ? 'pb-28' : 'pb-24'}`}>

                {/* Filters Row */}
                {activeTab !== 'form' && (
                    <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-2">Date Range</span>
                            <div className="flex items-center bg-gray-50 border border-gray-100 rounded-2xl p-1 px-3">
                                <input
                                    type="date"
                                    className="text-sm bg-transparent outline-none font-bold text-gray-700"
                                    value={dateRange.start}
                                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                                />
                                <span className="mx-2 text-gray-300 font-black">→</span>
                                <input
                                    type="date"
                                    className="text-sm bg-transparent outline-none font-bold text-gray-700"
                                    value={dateRange.end}
                                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                                />
                                {(dateRange.start || dateRange.end) && (
                                    <button
                                        onClick={() => setDateRange({ start: '', end: '' })}
                                        className="ml-2 text-gray-400 hover:text-red-500 transition-colors"
                                    >
                                        <XCircle className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-2xl border border-blue-100">
                            <List className="w-4 h-4" />
                            <span className="text-xs font-black uppercase tracking-widest">{packingData.length} Records</span>
                        </div>
                    </div>
                )}

                {/* Tab Content */}
                <div className="min-h-[500px]">
                    {activeTab === 'form' && (
                        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-2xl mx-auto">
                            <h2 className="text-2xl font-black text-gray-800 mb-8 border-l-4 border-blue-600 pl-4">New Packing Entry</h2>
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider">Item Name</label>
                                    <input
                                        list="item-options"
                                        className="w-full p-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-gray-50 text-lg font-medium"
                                        placeholder="Type or select item..."
                                        value={formData.itemName}
                                        onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
                                        required
                                    />
                                    <datalist id="item-options">
                                        {items.map(item => <option key={item._id} value={item.itemName} />)}
                                    </datalist>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider">Quantity</label>
                                        <input
                                            type="number"
                                            className="w-full p-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-gray-50 text-xl font-bold"
                                            placeholder="0"
                                            value={formData.qty}
                                            onChange={(e) => setFormData({ ...formData, qty: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider">Type</label>
                                            <div className="flex flex-col gap-2">
                                                {['Box', 'Gatta'].map(type => (
                                                    <button
                                                        key={type}
                                                        type="button"
                                                        onClick={() => setFormData({ ...formData, packingType: type })}
                                                        className={`p-3 rounded-xl border transition-all font-bold ${formData.packingType === type ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-white border-gray-200 text-gray-500 hover:border-blue-400'}`}
                                                    >
                                                        {type}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider">Status</label>
                                            <div className="flex flex-col gap-2">
                                                {['New', 'Repack'].map(status => (
                                                    <button
                                                        key={status}
                                                        type="button"
                                                        onClick={() => setFormData({ ...formData, packingStatus: status })}
                                                        className={`p-3 rounded-xl border transition-all font-bold ${formData.packingStatus === status ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-400'}`}
                                                    >
                                                        {status}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black py-5 rounded-2xl hover:scale-[1.02] shadow-xl shadow-blue-200 transition-all flex justify-center items-center text-xl mt-4">
                                    <CheckCircle className="w-6 h-6 mr-3" />
                                    Save Entry
                                </button>
                            </form>
                        </div>
                    )}

                    {activeTab === 'all' && (
                        <div className="mb-6 space-y-4">
                            {/* Print Selection Toolbar */}
                            {packingData.filter(p => p.isPrintRequested).length > 0 && (
                                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-5 shadow-xl flex flex-col md:flex-row justify-between items-center animate-in slide-in-from-top-4 duration-300">
                                    <div className="flex items-center text-white mb-4 md:mb-0">
                                        <div className="bg-white/20 p-3 rounded-2xl mr-4">
                                            <ClipboardList className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold opacity-80 uppercase tracking-widest">Selected for Print</div>
                                            <div className="text-2xl font-black">{packingData.filter(p => p.isPrintRequested).length} Items</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-3 w-full md:w-auto">
                                        <button
                                            onClick={handleBulkPrintClear}
                                            className="flex-1 md:flex-none py-3 px-6 bg-white/10 hover:bg-white/20 text-white rounded-xl font-black transition-all border border-white/20"
                                        >
                                            Untick All My Prints
                                        </button>
                                        <button
                                            onClick={handleBulkPrintConfirm}
                                            className="flex-1 md:flex-none py-3 px-6 bg-white text-blue-600 rounded-xl font-black shadow-lg hover:scale-105 active:scale-95 transition-all"
                                        >
                                            Save Print Selection
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50/50">
                                            <tr>
                                                <th className="px-6 py-5 text-left text-xs font-black text-gray-400 uppercase tracking-widest">Print</th>
                                                <th className="px-6 py-5 text-left text-xs font-black text-gray-400 uppercase tracking-widest">Timestamp</th>
                                                <th className="px-6 py-5 text-left text-xs font-black text-gray-400 uppercase tracking-widest">Item / Category</th>
                                                <th className="px-6 py-5 text-center text-xs font-black text-gray-400 uppercase tracking-widest">Qty</th>
                                                <th className="px-6 py-5 text-left text-xs font-black text-gray-400 uppercase tracking-widest">Configuration</th>
                                                <th className="px-6 py-5 text-left text-xs font-black text-gray-400 uppercase tracking-widest">Audit</th>
                                                <th className="px-6 py-5 text-right"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {packingData.length === 0 ? (
                                                <tr><td colSpan="7" className="p-20 text-center"><div className="text-gray-400 font-bold">No data matches your filters.</div></td></tr>
                                            ) : packingData.map(row => (
                                                <tr key={row._id} className="hover:bg-blue-50/30 transition-all group">
                                                    <td className="px-6 py-5">
                                                        <input
                                                            type="checkbox"
                                                            checked={row.isPrintRequested || row.isPrintConfirmed || false}
                                                            onChange={() => handlePrintToggle(row._id)}
                                                            className="w-5 h-5 rounded-md border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-5 whitespace-nowrap text-sm font-medium text-gray-500">
                                                        <div className="font-bold text-gray-700">{new Date(row.createdAt).toLocaleDateString()}</div>
                                                        <div className="text-xs">{new Date(row.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                    </td>
                                                    <td className="px-6 py-5 whitespace-nowrap">
                                                        <div className="text-base font-black text-gray-900">{row.itemName}</div>
                                                        <div className="text-xs font-bold text-blue-500 uppercase">{items.find(i => i.itemName === row.itemName)?.group || '-'}</div>
                                                    </td>
                                                    <td className="px-6 py-5 whitespace-nowrap text-center">
                                                        <span className="text-xl font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">
                                                            {row.qty}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-5 whitespace-nowrap">
                                                        <div className="flex gap-2">
                                                            <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">{row.packingType}</span>
                                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-tighter ${row.packingStatus === 'Repack' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                                                                {row.packingStatus || 'New'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-5 whitespace-nowrap">
                                                        <span className="text-2xl" title={row.status}>
                                                            {getStatusEmoji(row.status)}
                                                        </span>
                                                        {row.isPrintConfirmed && (
                                                            <span className="ml-2 bg-indigo-100 text-indigo-600 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter shadow-sm" title="Confirmed for Print">
                                                                Conf 📤
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-5 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => handleDelete(row._id)} className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg">
                                                            <Trash2 className="w-5 h-5" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'daywise' && (
                        <div className="space-y-6">
                            {/* Print Selection Toolbar (Shared logic) */}
                            {packingData.filter(p => p.isPrintRequested).length > 0 && (
                                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-5 shadow-xl flex flex-col md:flex-row justify-between items-center mb-6">
                                    <div className="flex items-center text-white mb-4 md:mb-0">
                                        <div className="bg-white/20 p-3 rounded-2xl mr-4">
                                            <ClipboardList className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold opacity-80 uppercase tracking-widest">Selected for Print</div>
                                            <div className="text-2xl font-black">{packingData.filter(p => p.isPrintRequested).length} Items</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-3 w-full md:w-auto">
                                        <button
                                            onClick={handleBulkPrintClear}
                                            className="flex-1 md:flex-none py-3 px-6 bg-white/10 hover:bg-white/20 text-white rounded-xl font-black transition-all border border-white/20"
                                        >
                                            Untick All My Prints
                                        </button>
                                        <button
                                            onClick={handleBulkPrintConfirm}
                                            className="flex-1 md:flex-none py-3 px-6 bg-white text-blue-600 rounded-xl font-black shadow-lg hover:scale-105 active:scale-95 transition-all"
                                        >
                                            Save Print Selection
                                        </button>
                                    </div>
                                </div>
                            )}

                            {dayWiseData.length === 0 ? (
                                <div className="bg-white p-20 rounded-3xl text-center text-gray-400 border-2 border-dashed border-gray-100">
                                    <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-200" />
                                    <p className="font-bold">No date records found for the selected filter.</p>
                                </div>
                            ) : dayWiseData.map((day, idx) => (
                                <div key={idx} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                                    <button
                                        onClick={() => setExpandedDate(expandedDate === day.date ? null : day.date)}
                                        className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-all"
                                    >
                                        <div className="flex items-center">
                                            <div className="w-14 h-14 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl flex justify-center items-center text-blue-600 mr-5 border border-blue-100">
                                                <Calendar className="w-7 h-7" />
                                            </div>
                                            <div className="text-left">
                                                <div className="text-xl font-black text-gray-800">{day.date}</div>
                                                <div className="text-sm font-bold text-gray-400 uppercase tracking-widest">{day.groups.length} Groups Active</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center">
                                            <div className="text-right mr-8">
                                                <div className="text-xs uppercase text-gray-400 font-black tracking-widest mb-1">Total Packing</div>
                                                <div className="text-3xl font-black text-blue-600">{day.totalQty}</div>
                                            </div>
                                            <div className={`w-10 h-10 rounded-full flex justify-center items-center transition-all ${expandedDate === day.date ? 'bg-blue-600 text-white rotate-180' : 'bg-gray-100 text-gray-400'}`}>
                                                <ChevronDown className="w-6 h-6" />
                                            </div>
                                        </div>
                                    </button>

                                    {expandedDate === day.date && (
                                        <div className="bg-gray-50 border-t border-gray-100 p-6 space-y-6 animate-in slide-in-from-top-4 duration-300">
                                            {day.groups.map((group, gIdx) => (
                                                <div key={gIdx} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                                    <div className="bg-blue-600 p-3 px-5 flex justify-between items-center">
                                                        <h4 className="text-white font-black uppercase tracking-widest text-sm">{group.groupName}</h4>
                                                        <span className="bg-white text-blue-600 text-xs font-black px-3 py-1 rounded-full shadow-sm">
                                                            {group.groupTotal} Qty
                                                        </span>
                                                    </div>
                                                    <div className="p-0">
                                                        <table className="min-w-full">
                                                            <thead className="bg-gray-50">
                                                                <tr className="text-[10px] text-gray-400 uppercase font-black tracking-widest">
                                                                    <th className="text-left py-3 px-6 w-10">Print</th>
                                                                    <th className="text-left py-3 px-6">Item Name</th>
                                                                    <th className="text-center py-3 px-6">Qty</th>
                                                                    <th className="text-left py-3 px-6">Status</th>
                                                                    <th className="text-left py-3 px-6">Staff</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100">
                                                                {group.items.map((entry, eIdx) => (
                                                                    <tr key={eIdx} className="hover:bg-gray-50/50 transition-colors">
                                                                        <td className="py-3 px-6">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={entry.isPrintRequested || entry.isPrintConfirmed || false}
                                                                                onChange={() => handlePrintToggle(entry._id)}
                                                                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                                            />
                                                                        </td>
                                                                        <td className="py-3 px-6 text-sm font-bold text-gray-800">{entry.itemName}</td>
                                                                        <td className="py-3 px-6 text-sm font-black text-center text-blue-600">{entry.qty}</td>
                                                                        <td className="py-3 px-6">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className={`text-[10px] font-black uppercase tracking-tighter px-2 py-0.5 rounded-full ${entry.packingStatus === 'Repack' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                                                                                    {entry.packingStatus || 'New'}
                                                                                </span>
                                                                                {entry.isPrintConfirmed && (
                                                                                    <span className="bg-indigo-100 text-indigo-600 text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-sm" title="Confirmed for Print">
                                                                                        📤
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-3 px-6 text-xs font-bold text-gray-500">{entry.submittedBy}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'userwise' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {userWiseData.map((u, idx) => (
                                <div key={idx} className="bg-white group relative p-6 pt-10 rounded-3xl shadow-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
                                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <div className="absolute -top-6 -right-6 w-24 h-24 bg-blue-50 rounded-full opacity-50 group-hover:scale-110 transition-transform"></div>

                                    <div className="flex flex-col items-center mb-6 text-center">
                                        <div className="w-20 h-20 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl flex justify-center items-center mb-4 border border-blue-100 shadow-sm">
                                            <span className="text-3xl font-black text-blue-600">
                                                {u.name?.charAt(0) || u.username?.charAt(0)}
                                            </span>
                                        </div>
                                        <div className="text-xl font-black text-gray-900 group-hover:text-blue-600 transition-colors">{u.name || u.username}</div>
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">ID: {u.username}</div>
                                    </div>

                                    <div className="flex justify-between items-center bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                        <div>
                                            <div className="text-[10px] uppercase text-gray-400 font-black tracking-widest mb-1">Total Packed</div>
                                            <div className="text-3xl font-black text-gray-900 tracking-tighter">{u.totalQty}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs font-black text-blue-600 mb-1">{u.entries} Entries</div>
                                            <div className="text-[10px] uppercase text-gray-400 font-bold px-2 py-0.5 border border-gray-200 rounded-full bg-white">
                                                {u.role || 'Staff'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Bottom Navigation Bar */}
                <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-2 pointer-events-none">
                    <div className="max-w-xl mx-auto flex items-center justify-around bg-white/80 backdrop-blur-xl border border-white/20 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] rounded-3xl p-2 pointer-events-auto">
                        {[
                            { id: 'form', icon: ClipboardList, label: 'Form' },
                            { id: 'all', icon: List, label: 'History' },
                            { id: 'daywise', icon: Calendar, label: 'Day-wise' },
                            { id: 'userwise', icon: Users, label: 'Users' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all duration-300 flex-1 relative ${activeTab === tab.id ? 'text-blue-600 scale-110' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                {activeTab === tab.id && (
                                    <div className="absolute inset-0 bg-blue-50 rounded-2xl -z-10 animate-in fade-in zoom-in duration-300"></div>
                                )}
                                <tab.icon className={`w-6 h-6 mb-1 ${activeTab === tab.id ? 'stroke-[3px]' : 'stroke-[2px]'}`} />
                                <span className={`text-[10px] font-black uppercase tracking-tighter ${activeTab === tab.id ? 'opacity-100' : 'opacity-80'}`}>{tab.label}</span>
                                {activeTab === tab.id && (
                                    <div className="w-1 h-1 bg-blue-600 rounded-full mt-1"></div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default PackerDashboard;
