import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../config';
import Layout from '../components/Layout';
import { Plus, Trash2, Upload, Search, Save, X, Loader, FolderPlus, Edit, Download } from 'lucide-react'; // Added Edit, Download via Lucide if available, else standard icons

const ItemMaster = () => {
    const [items, setItems] = useState([]);
    const [groups, setGroups] = useState([]);
    const [subGroups, setSubGroups] = useState([]); // SubGroups State
    const [parties, setParties] = useState([]); // Parties State
    const [activeTab, setActiveTab] = useState('items'); // 'items' | 'parties'
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);

    // Group Modal State
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');

    // SubGroup Modal State
    const [showSubGroupModal, setShowSubGroupModal] = useState(false);
    const [newSubGroupName, setNewSubGroupName] = useState('');

    const [newItem, setNewItem] = useState({
        barcode: '',
        itemName: '',
        group: '',
        unit: '',
        subGroup: '',
        short: '' // New Short field
    });

    // New Features State
    const [selectedGroup, setSelectedGroup] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState(null);

    // Filter Items
    let filteredItems = items.filter(item => {
        const matchesGroup = selectedGroup ? item.group === selectedGroup : true;
        return matchesGroup;
    });

    // Optimization: Limit to 1000 items if no group is selected to prevent browser lag
    if (!selectedGroup) {
        filteredItems = filteredItems.slice(0, 1000);
    }

    // Fetch Data
    const fetchData = async () => {
        try {
            const [itemsRes, groupsRes, subGroupsRes, partiesRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/items`),
                fetch(`${API_BASE_URL}/api/groups`),
                fetch(`${API_BASE_URL}/api/subgroups`),
                fetch(`${API_BASE_URL}/api/parties`)
            ]);

            if (itemsRes.ok) setItems(await itemsRes.json());
            if (groupsRes.ok) setGroups(await groupsRes.json());
            if (subGroupsRes.ok) setSubGroups(await subGroupsRes.json());
            if (partiesRes.ok) setParties(await partiesRes.json());

            setLoading(false);
        } catch (error) {
            console.error('Error fetching data:', error);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // ... (Keep existing Delete functions: handleDelete, handleDeleteAll, handleDeleteGroup)

    // Delete Item
    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this item?')) {
            const password = window.prompt("Enter Admin Password to delete:");
            if (password !== "2024") {
                alert("Incorrect Password!");
                return;
            }

            try {
                await fetch(`${API_BASE_URL}/api/items/${id}`, { method: 'DELETE' });
                setItems(items.filter(item => item._id !== id));
            } catch (error) {
                console.error('Error deleting item:', error);
            }
        }
    };

    // Delete All Items
    const handleDeleteAll = async () => {
        if (window.confirm('DANGER: This will delete ALL items. Are you sure?')) {
            if (window.confirm('Double Check: Are you really sure?')) {
                const password = window.prompt("Enter Admin Password to delete:");
                if (password !== "2024") {
                    alert("Incorrect Password!");
                    return;
                }

                try {
                    await fetch(`${API_BASE_URL}/api/items/all/cleanup`, { method: 'DELETE' });
                    setItems([]);
                    alert('All items deleted.');
                } catch (error) {
                    alert('Error deleting all items: ' + error.message);
                }
            }
        }
    };

    // Delete Group Items
    const handleDeleteGroup = async () => {
        if (!selectedGroup) return alert('Please select a group to delete items from.');
        if (window.confirm(`Are you sure you want to delete ALL items in group "${selectedGroup}"?`)) {
            const password = window.prompt("Enter Admin Password to delete:");
            if (password !== "2024") {
                alert("Incorrect Password!");
                return;
            }

            try {
                const res = await fetch(`${API_BASE_URL}/api/items/group/${selectedGroup}`, { method: 'DELETE' });
                const data = await res.json();
                alert(data.message);
                fetchData();
            } catch (error) {
                alert('Error deleting group items: ' + error.message);
            }
        }
    };

    // Add / Update Item
    const handleAddSubmit = async (e) => {
        e.preventDefault();
        const url = isEditing ? `${API_BASE_URL}/api/items/${editId}` : `${API_BASE_URL}/api/items`;
        const method = isEditing ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newItem),
            });

            if (response.ok) {
                const savedItem = await response.json();
                if (isEditing) {
                    setItems(items.map(i => i._id === editId ? savedItem : i));
                    setIsEditing(false);
                    setEditId(null);
                    alert('Item Updated Successfully');
                } else {
                    setItems([savedItem, ...items]);
                }
                setNewItem({ barcode: '', itemName: '', group: '', unit: '', subGroup: '', short: '' });
                // Don't close form, allows rapid entry
            } else {
                alert('Failed to save item. Check if barcode exists.');
            }
        } catch (error) {
            console.error('Error saving item:', error);
        }
    };

    const handleEditClick = (item) => {
        setNewItem({
            barcode: item.barcode,
            itemName: item.itemName,
            group: item.group,
            unit: item.unit,
            subGroup: item.subGroup || '',
            short: item.short || ''
        });
        setIsEditing(true);
        setEditId(item._id);
        setShowAddForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditId(null);
        setNewItem({ barcode: '', itemName: '', group: '', unit: '', subGroup: '', short: '' });
    };

    // Export Logic ... 
    const handleExport = () => {
        if (items.length === 0) return alert('No items to export.');
        const headers = ['Barcode', 'Item Name', 'Group', 'Unit', 'Subgroup', 'Short'];
        const csvContent = items.map(item =>
            [item.barcode, item.itemName, item.group, item.unit, item.subGroup, item.short].map(field =>
                `"${String(field || '').replace(/"/g, '""')}"`
            ).join(',')
        );
        const csvString = [headers.join(','), ...csvContent].join('\n');

        // Download
        const blob = new Blob([csvString], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'item_master_export.csv';
        a.click();
        window.URL.revokeObjectURL(url);
    };

    // --- Party Logic ---
    const handleDeleteParty = async (id) => {
        if (!window.confirm('Delete this party?')) return;
        try {
            await fetch(`${API_BASE_URL}/api/parties/${id}`, { method: 'DELETE' });
            setParties(parties.filter(p => p._id !== id));
        } catch (error) {
            console.error('Error deleting party:', error);
        }
    };

    const handleImportParties = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            const rows = text.split('\n').filter(r => r.trim() !== '').slice(1); // Skip header, filter empty

            const newParties = rows.map(row => {
                // CSV Format: Name, Station, Mobile
                const cols = row.split(',').map(c => c ? c.trim() : '');
                const name = cols[0];
                const station = cols[1];
                const mobile = cols[2];

                if (name) return { name, station, mobile };
                return null;
            }).filter(Boolean);

            if (newParties.length === 0) return alert("No valid data found");

            try {
                const res = await fetch(`${API_BASE_URL}/api/parties/bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newParties)
                });
                if (res.ok) {
                    alert('Parties Imported Successfully!');
                    fetchData(); // Refresh
                } else {
                    alert('Import Failed');
                }
            } catch (error) {
                console.error('Import Error:', error);
                alert('Import Error');
            }
        };
        reader.readAsText(file);
    };


    // Add Group
    const handleAddGroup = async (e) => {
        e.preventDefault();
        if (!newGroupName.trim()) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/groups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groupName: newGroupName }),
            });

            if (response.ok) {
                const savedGroup = await response.json();
                setGroups([savedGroup, ...groups]);
                setNewItem({ ...newItem, group: savedGroup.groupName }); // Auto-select
                setNewGroupName('');
                setShowGroupModal(false);
            } else {
                const errorData = await response.json();
                alert(`Failed to create group: ${errorData.error || 'Name might exist'}`);
            }
        } catch (error) {
            console.error('Error saving group:', error);
        }
    };

    // Add SubGroup
    const handleAddSubGroup = async (e) => {
        e.preventDefault();
        if (!newSubGroupName.trim()) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/subgroups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subGroupName: newSubGroupName }),
            });

            if (response.ok) {
                const savedSubGroup = await response.json();
                setSubGroups([savedSubGroup, ...subGroups]);
                setNewItem({ ...newItem, subGroup: savedSubGroup.subGroupName }); // Auto-select
                setNewSubGroupName('');
                setShowSubGroupModal(false);
            } else {
                const errorData = await response.json();
                alert(`Failed to create subgroup: ${errorData.error || 'Name might exist'}`);
            }
        } catch (error) {
            console.error('Error saving subgroup:', error);
        }
    };

    // Import Handler (Updated to allow missing barcodes)
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            const text = evt.target.result;
            const lines = text.split(/\r\n|\n/).map(r => r.trim()).filter(r => r);
            if (lines.length === 0) return;

            // Detect Delimiter (Comma, Tab, Semicolon)
            const firstLine = lines[0];
            let delimiter = ',';
            if (firstLine.includes('\t')) delimiter = '\t';
            else if (firstLine.includes(';')) delimiter = ';';

            console.log("Detected Delimiter:", delimiter === '\t' ? 'TAB' : delimiter);

            // Parse Data - UPDATED FOR SUBGROUP
            const data = lines.slice(1).map(row => {
                const values = row.split(delimiter);
                return {
                    barcode: values[0]?.trim(),
                    itemName: values[1]?.trim(),
                    group: values[2]?.trim() || 'General',
                    unit: values[3]?.trim() || 'Pcs',
                    subGroup: values[4]?.trim() || '',
                    short: values[5]?.trim() || '' // Map 6th column to Short
                };
            }).filter(i => i.itemName);

            if (data.length === 0) {
                alert("No valid data found or all rows were empty. Please check your CSV format (Barcode, Name, Group, Unit, Subgroup).");
                return;
            }

            try {
                setLoading(true);
                const response = await fetch(`${API_BASE_URL}/api/items/bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                // ... (Existing response handling is fine)
                if (response.ok) {
                    const result = await response.json();
                    let msg = `Import Processed!\n\nGroups Created: ${result.groupsCreated}\nItems Inserted: ${result.itemsInserted}\nDuplicates/Failed: ${result.itemsFailed}`;
                    if (result.errors && result.errors.length > 0) {
                        msg += `\n\nSample Errors:\n${result.errors.join('\n')}`;
                    }
                    alert(msg);
                    fetchData();
                } else {
                    const errorText = await response.text();
                    try {
                        const errorJson = JSON.parse(errorText);
                        alert(`Import Failed: ${errorJson.message}`);
                    } catch (e) {
                        alert(`Import Failed (Server Error): ${errorText.substring(0, 100)}...`);
                    }
                }
            } catch (error) {
                console.error("Import error", error);
                alert("Error during import: " + error.message);
            } finally {
                setLoading(false);
                e.target.value = null; // Reset input
            }
        };
        reader.readAsText(file);
    };

    return (
        <Layout title="Item Master Management">
            <div className="space-y-6">

                {/* Group Creation Modal */}
                {showGroupModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-fadeIn">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-gray-800">Add New Group</h3>
                                <button onClick={() => setShowGroupModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
                            </div>
                            <form onSubmit={handleAddGroup}>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Group Name</label>
                                <input
                                    autoFocus
                                    className="w-full p-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none mb-4"
                                    placeholder="e.g. Electric, Mechanical"
                                    value={newGroupName}
                                    onChange={(e) => setNewGroupName(e.target.value)}
                                />
                                <div className="flex space-x-3">
                                    <button type="button" onClick={() => setShowGroupModal(false)} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancel</button>
                                    <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">create</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* SubGroup Creation Modal */}
                {showSubGroupModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-fadeIn">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-gray-800">Add New Subgroup</h3>
                                <button onClick={() => setShowSubGroupModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
                            </div>
                            <form onSubmit={handleAddSubGroup}>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Subgroup Name</label>
                                <input
                                    autoFocus
                                    className="w-full p-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none mb-4"
                                    placeholder="e.g. Wiring, Switches"
                                    value={newSubGroupName}
                                    onChange={(e) => setNewSubGroupName(e.target.value)}
                                />
                                <div className="flex space-x-3">
                                    <button type="button" onClick={() => setShowSubGroupModal(false)} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancel</button>
                                    <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">create</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Action Bar ... (No change needed here for now) */}
                {activeTab === 'items' && (
                    <>
                        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center space-y-4 xl:space-y-0 gap-4">

                            {/* Search & Filter */}
                            <div className="flex flex-col sm:flex-row gap-2 w-full xl:w-auto">
                                <div className="relative flex-grow sm:flex-grow-0 sm:w-64">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Search className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="Search items..."
                                    // Search input logic can be added here if we want real-time filtering
                                    />
                                </div>

                                <select
                                    className="bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={selectedGroup}
                                    onChange={(e) => setSelectedGroup(e.target.value)}
                                >
                                    <option value="">All Groups</option>
                                    {groups.map(g => (
                                        <option key={g._id} value={g.groupName}>{g.groupName}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-wrap gap-2 w-full xl:w-auto justify-end">
                                {/* Delete Menu */}
                                {items.length > 0 && (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleDeleteAll}
                                            className="bg-red-50 text-red-600 px-3 py-2 rounded-lg hover:bg-red-100 transition-colors border border-red-200 text-sm font-medium whitespace-nowrap"
                                        >
                                            Delete All
                                        </button>
                                        {selectedGroup && (
                                            <button
                                                onClick={handleDeleteGroup}
                                                className="bg-orange-50 text-orange-600 px-3 py-2 rounded-lg hover:bg-orange-100 transition-colors border border-orange-200 text-sm font-medium whitespace-nowrap"
                                            >
                                                Delete {selectedGroup}
                                            </button>
                                        )}
                                    </div>
                                )}

                                <button
                                    onClick={handleExport}
                                    className="bg-green-50 text-green-700 px-4 py-2 rounded-lg hover:bg-green-100 transition-colors border border-green-200 flex items-center"
                                >
                                    <FolderPlus className="h-5 w-5 mr-2" />
                                    Export CSV
                                </button>

                                <label className="flex items-center justify-center bg-white text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors border border-gray-300 cursor-pointer">
                                    <Upload className="h-5 w-5 mr-2" />
                                    Import CSV
                                    <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                                </label>

                                <button
                                    onClick={() => setShowAddForm(!showAddForm)}
                                    className={`flex items-center justify-center px-4 py-2 rounded-lg transition-colors border ${showAddForm ? 'bg-gray-100 text-gray-700 border-gray-300' : 'bg-blue-600 text-white border-transparent hover:bg-blue-700'}`}
                                >
                                    <Plus className={`h-5 w-5 mr-2 ${showAddForm ? 'transform rotate-45' : ''}`} />
                                    {showAddForm ? 'Hide Form' : 'Add Item'}
                                </button>
                            </div>
                        </div>

                        {/* Add/Edit Item Form */}
                        {showAddForm && (
                            <div className={`p-4 rounded-xl border animate-fadeIn relative ${isEditing ? 'bg-yellow-50 border-yellow-200' : 'bg-blue-50 border-blue-100'}`}>
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className={`font-semibold ${isEditing ? 'text-yellow-800' : 'text-blue-800'}`}>
                                        {isEditing ? 'Edit Item Details' : 'New Item Details'}
                                    </h3>
                                    {isEditing && (
                                        <button onClick={handleCancelEdit} className="text-sm text-gray-500 underline hover:text-gray-800">Cancel Edit</button>
                                    )}
                                </div>
                                <form onSubmit={handleAddSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Barcode</label>
                                        <input

                                            value={newItem.barcode}
                                            onChange={e => setNewItem({ ...newItem, barcode: e.target.value })}
                                            className="w-full p-2 border rounded-md focus:border-blue-500 outline-none"
                                            placeholder={isEditing ? "Leave empty to keep" : "Scan/Type (Optional)"}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Short Name</label>
                                        <input
                                            value={newItem.short}
                                            onChange={e => setNewItem({ ...newItem, short: e.target.value })}
                                            className="w-full p-2 border rounded-md focus:border-blue-500 outline-none"
                                            placeholder="Optional (e.g. A1)"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Item Name</label>
                                        <input
                                            required
                                            value={newItem.itemName}
                                            onChange={e => setNewItem({ ...newItem, itemName: e.target.value })}
                                            className="w-full p-2 border rounded-md focus:border-blue-500 outline-none"
                                            placeholder="Enter Name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Subgroup</label>
                                        <div className="flex">
                                            <select
                                                value={newItem.subGroup}
                                                onChange={e => setNewItem({ ...newItem, subGroup: e.target.value })}
                                                className="w-full p-2 border rounded-l-md bg-white focus:border-blue-500 outline-none"
                                            >
                                                <option value="">Select Existing</option>
                                                {subGroups.map(sg => (
                                                    <option key={sg._id} value={sg.subGroupName}>{sg.subGroupName}</option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={() => setShowSubGroupModal(true)}
                                                className="bg-blue-200 text-blue-800 px-2 rounded-r-md hover:bg-blue-300"
                                                title="Create New Subgroup"
                                            >
                                                <Plus className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Group</label>
                                        <div className="flex">
                                            <select
                                                required
                                                value={newItem.group}
                                                onChange={e => setNewItem({ ...newItem, group: e.target.value })}
                                                className="w-full p-2 border rounded-l-md bg-white focus:border-blue-500 outline-none"
                                            >
                                                <option value="">Select Group</option>
                                                {groups.map(g => (
                                                    <option key={g._id} value={g.groupName}>{g.groupName}</option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={() => setShowGroupModal(true)}
                                                className="bg-blue-200 text-blue-800 px-2 rounded-r-md hover:bg-blue-300"
                                                title="Create New Group"
                                            >
                                                <Plus className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Unit</label>
                                        <select
                                            className="w-full p-2 border rounded-md bg-white focus:border-blue-500 outline-none"
                                            value={newItem.unit}
                                            onChange={e => setNewItem({ ...newItem, unit: e.target.value })}
                                        >
                                            <option value="">Select</option>
                                            <option value="Pcs">Pcs</option>
                                            <option value="Box">Box</option>
                                            <option value="Set">Set</option>
                                            <option value="Kg">Kg</option>
                                        </select>
                                    </div>
                                    <div className="md:col-span-1 md:col-start-5 flex justify-end mt-2">
                                        <button type="submit" className={`${isEditing ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-blue-600 hover:bg-blue-700'} text-white px-4 py-2 rounded-lg text-sm font-medium w-full`}>
                                            <Save className="h-4 w-4 inline mr-1" /> {isEditing ? 'Update' : 'Save'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {/* Data Table */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                            {loading ? (
                                <div className="p-8 text-center text-gray-500 flex justify-center items-center">
                                    <Loader className="animate-spin h-8 w-8 text-blue-500" />
                                    <span className="ml-2">Loading items...</span>
                                </div>
                            ) : (
                                <>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Barcode</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Name</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Group</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subgroup</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Short</th>
                                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {filteredItems.map((item) => (
                                                    <tr key={item._id} className="hover:bg-gray-50 transition-colors">
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.barcode}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.itemName}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                            <span className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full text-xs font-medium">{item.group}</span>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.unit}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.subGroup}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.short}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                            <button
                                                                onClick={() => handleEditClick(item)}
                                                                className="text-blue-600 hover:text-blue-900 bg-blue-50 p-2 rounded-full hover:bg-blue-100 transition-colors mr-2"
                                                                title="Edit Item"
                                                            >
                                                                <span className="text-xs font-bold">EDIT</span>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(item._id)}
                                                                className="text-red-600 hover:text-red-900 bg-red-50 p-2 rounded-full hover:bg-red-100 transition-colors"
                                                                title="Delete Item"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {filteredItems.length === 0 && (
                                        <div className="p-8 text-center text-gray-500">
                                            No items found.
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </>
                )}

                {/* TAB CONTENT: PARTIES */}
                {activeTab === 'parties' && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-gray-700">Party List</h3>
                            <p className="text-sm text-gray-500">Total: {parties.length}</p>
                        </div>
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Party Name</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Station</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mobile (Opt)</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {parties.map((party) => (
                                    <tr key={party._id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{party.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{party.station}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{party.mobile}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button onClick={() => handleDeleteParty(party._id)} className="text-red-600 hover:text-red-900 bg-red-50 p-2 rounded-full hover:bg-red-100 transition-colors" title="Delete Party">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {parties.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="px-6 py-12 text-center text-gray-400">
                                            No parties found. Import a CSV to get started.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

            </div>
        </Layout >
    );
};

export default ItemMaster;
