import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../config';
import Layout from '../components/Layout';
import { Plus, Trash2, User, Shield, Save, X, Loader, Settings } from 'lucide-react';

const ColumnAccessControl = () => {
    const [activeRole, setActiveRole] = useState('packer'); // 'packer' or 'auditor'
    const [permissions, setPermissions] = useState({
        packer: [],
        auditor: []
    });
    const [loading, setLoading] = useState(true);

    const availableColumns = [
        'ID', 'Date', 'Item Name', 'Qty',
        'Submitted By', 'Group', 'Status',
        'Auditor Remarks', 'Audited By',
        'Packing Type', 'Packing Status', 'Approved Qty', 'Not Approved Qty'
    ];

    useEffect(() => {
        const fetchPermissions = async () => {
            try {
                const [packerRes, auditorRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/permissions/packer`),
                    fetch(`${API_BASE_URL}/api/permissions/auditor`)
                ]);

                const packerData = await packerRes.json();
                const auditorData = await auditorRes.json();

                setPermissions({
                    packer: packerData,
                    auditor: auditorData
                });
                setLoading(false);
            } catch (err) {
                console.error("Error fetching permissions", err);
                setLoading(false);
            }
        };
        fetchPermissions();
    }, []);

    const toggleColumn = (column) => {
        const current = permissions[activeRole] || [];
        let updated;
        if (current.includes(column)) {
            updated = current.filter(c => c !== column);
        } else {
            updated = [...current, column];
        }
        setPermissions({ ...permissions, [activeRole]: updated });
    };

    const handleSave = async () => {
        try {
            console.log(`Sending permissions for ${activeRole}:`, permissions[activeRole]);
            const response = await fetch(`${API_BASE_URL}/api/permissions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: activeRole,
                    allowedColumns: permissions[activeRole] || []
                })
            });
            if (response.ok) {
                const data = await response.json();
                console.log('Permissions saved:', data);
                alert(`Permissions saved for ${activeRole}`);
            } else {
                const errorText = await response.text();
                // Try to parse JSON error if possible
                let errorMessage = errorText;
                try {
                    const errorJson = JSON.parse(errorText);
                    if (errorJson.message) errorMessage = errorJson.message;
                } catch (e) { /* ignore */ }

                console.error('Failed to save:', errorText);
                alert(`Failed to save permissions: ${errorMessage}`);
            }
        } catch (err) {
            console.error("Error saving permissions", err);
            alert("Failed to save permissions");
        }
    };

    if (loading) return <div>Loading permissions...</div>;

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mt-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                <Settings className="h-5 w-5 mr-2 text-gray-600" />
                Column Access Control
            </h3>

            <div className="flex space-x-4 mb-4 border-b border-gray-100">
                <button
                    onClick={() => setActiveRole('packer')}
                    className={`pb-2 px-4 font-medium text-sm ${activeRole === 'packer' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
                >
                    Packer View
                </button>
                <button
                    onClick={() => setActiveRole('auditor')}
                    className={`pb-2 px-4 font-medium text-sm ${activeRole === 'auditor' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
                >
                    Auditor View
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {availableColumns.map(col => (
                    <label key={col} className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={permissions[activeRole]?.includes(col)}
                            onChange={() => toggleColumn(col)}
                            className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{col}</span>
                    </label>
                ))}
            </div>

            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center shadow-sm"
                >
                    <Save className="h-4 w-4 mr-2" />
                    Save Configuration
                </button>
            </div>
        </div>
    );
};

const UserManagement = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newUser, setNewUser] = useState({
        username: '',
        password: '',
        name: '',
        role: 'packer'
    });

    const fetchUsers = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/users`);
            const data = await response.json();
            setUsers(data);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching users:', error);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this user?')) {
            try {
                await fetch(`${API_BASE_URL}/api/users/${id}`, { method: 'DELETE' });
                setUsers(users.filter(u => u._id !== id));
            } catch (error) {
                console.error('Error deleting user:', error);
            }
        }
    };

    const handleAddSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch(`${API_BASE_URL}/api/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser),
            });

            if (response.ok) {
                const savedUser = await response.json();
                setUsers([savedUser, ...users]);
                setNewUser({ username: '', password: '', name: '', role: 'packer' });
                setShowAddForm(false);
            } else {
                alert('Failed to create user. Username might be taken.');
            }
        } catch (error) {
            console.error('Error creating user:', error);
        }
    };

    return (
        <Layout title="User Management">
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">System Users</h2>
                    <button
                        onClick={() => setShowAddForm(true)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
                    >
                        <Plus className="h-5 w-5 mr-2" />
                        Add User
                    </button>
                </div>

                {/* Add User Form */}
                {showAddForm && (
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 animate-fadeIn">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-semibold text-blue-800">New User Details</h3>
                            <button onClick={() => setShowAddForm(false)} className="text-gray-500 hover:text-gray-700"><X className="h-5 w-5" /></button>
                        </div>
                        <form onSubmit={handleAddSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                                <input
                                    required
                                    value={newUser.name}
                                    onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                                    className="w-full p-2 border rounded-md"
                                    placeholder="Full Name"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                                <select
                                    className="w-full p-2 border rounded-md bg-white"
                                    value={newUser.role}
                                    onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                                >
                                    <option value="packer">Packer</option>
                                    <option value="auditor">Auditor</option>
                                    <option value="owner">Owner</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Username (Login ID)</label>
                                <input
                                    required
                                    value={newUser.username}
                                    onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                                    className="w-full p-2 border rounded-md"
                                    placeholder="e.g. packer1"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
                                <input
                                    required
                                    type="text"
                                    value={newUser.password}
                                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                    className="w-full p-2 border rounded-md"
                                    placeholder="Enter Password"
                                />
                            </div>
                            <div className="md:col-span-2 flex justify-end mt-2">
                                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                                    <Save className="h-4 w-4 inline mr-1" /> Create User
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* User List */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    {loading ? (
                        <div className="p-8 text-center text-gray-500 flex justify-center items-center">
                            <Loader className="animate-spin h-8 w-8 text-blue-500" />
                            <span className="ml-2">Loading users...</span>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {users.map((user) => (
                                        <tr key={user._id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap flex items-center">
                                                <div className="bg-gray-100 p-2 rounded-full mr-3"><User className="h-4 w-4 text-gray-600" /></div>
                                                <span className="text-sm font-medium text-gray-900">{user.name}</span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{user.username}</td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                                ${user.role === 'owner' ? 'bg-purple-100 text-purple-800' :
                                                        user.role === 'auditor' ? 'bg-blue-100 text-blue-800' :
                                                            'bg-green-100 text-green-800'}`}>
                                                    {user.role}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <button
                                                    onClick={() => handleDelete(user._id)}
                                                    className="text-red-600 hover:text-red-900 bg-red-50 p-2 rounded-full hover:bg-red-100 transition-colors"
                                                    title="Delete User"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <ColumnAccessControl />
            </div>
        </Layout>
    );
};

export default UserManagement;
