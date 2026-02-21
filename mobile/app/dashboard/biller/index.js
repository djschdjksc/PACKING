import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, FlatList } from 'react-native';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../utils/api';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function FormTab() {
    const { user } = useAuth();
    const [items, setItems] = useState([]);
    const [filteredItems, setFilteredItems] = useState([]);
    const [search, setSearch] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);
    const [qty, setQty] = useState('');
    const [packingType, setPackingType] = useState('Box'); // Box or Gatta
    const [packingStatus, setPackingStatus] = useState('New'); // New or Repack
    const [loading, setLoading] = useState(false);
    const [fetchingItems, setFetchingItems] = useState(true);

    useEffect(() => {
        fetchItems();
    }, []);

    const fetchItems = async () => {
        try {
            const res = await api.get('/api/items');
            setItems(res.data);
            setFetchingItems(false);
        } catch (error) {
            console.error("Fetch Items Error:", error);
            Alert.alert("Error", "Could not fetch items");
            setFetchingItems(false);
        }
    };

    const handleSearch = (text) => {
        setSearch(text);
        if (text.trim() === '') {
            setFilteredItems([]);
        } else {
            const filtered = items.filter(item =>
                item.itemName.toLowerCase().includes(text.toLowerCase()) ||
                (item.short && item.short.toLowerCase().includes(text.toLowerCase()))
            ).slice(0, 10);
            setFilteredItems(filtered);
        }
    };

    const selectItem = (item) => {
        setSelectedItem(item);
        setSearch(item.itemName);
        setFilteredItems([]);
    };

    const handleSubmit = async () => {
        if (!selectedItem || !qty || !packingType) {
            Alert.alert("Error", "Please select item and enter quantity");
            return;
        }

        setLoading(true);
        try {
            const payload = {
                itemName: selectedItem.itemName,
                qty: parseFloat(qty),
                packingType: packingType,
                packingStatus: packingStatus,
                submittedBy: user.username,
                status: 'Pending'
            };

            await api.post('/api/packing', payload);
            Alert.alert("Success", "Packing data submitted successfully");
            setSelectedItem(null);
            setQty('');
            setSearch('');
            setPackingStatus('New');
        } catch (error) {
            console.error("Submit Error:", error);
            Alert.alert("Error", "Failed to submit data");
        } finally {
            setLoading(false);
        }
    };

    if (fetchingItems) {
        return (
            <View className="flex-1 justify-center items-center">
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        );
    }

    return (
        <ScrollView className="flex-1 bg-gray-50 p-4">
            <View className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
                <Text className="text-xl font-bold text-gray-800 mb-6">New Packing Entry</Text>

                <Text className="text-gray-600 font-medium mb-2">Search Item</Text>
                <View className="relative z-10">
                    <TextInput
                        className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl mb-1"
                        placeholder="Search by name or code..."
                        value={search}
                        onChangeText={handleSearch}
                    />
                    {filteredItems.length > 0 && (
                        <View className="absolute top-14 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
                            {filteredItems.map((item, index) => (
                                <TouchableOpacity
                                    key={item._id || index}
                                    className="p-4 border-b border-gray-100"
                                    onPress={() => selectItem(item)}
                                >
                                    <Text className="text-gray-800 font-medium">{item.itemName}</Text>
                                    <Text className="text-gray-400 text-xs">{item.group} - {item.short}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>

                {selectedItem && (
                    <View className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                        <Text className="text-blue-800 font-bold">Selected: {selectedItem.itemName}</Text>
                        <Text className="text-blue-600 text-sm">Group: {selectedItem.group}</Text>
                    </View>
                )}

                <View className="mt-6 flex-row gap-4">
                    <View className="flex-1">
                        <Text className="text-gray-600 font-medium mb-2">Quantity</Text>
                        <TextInput
                            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl"
                            placeholder="Qty"
                            keyboardType="numeric"
                            value={qty}
                            onChangeText={setQty}
                        />
                    </View>
                    <View className="flex-1">
                        <Text className="text-gray-600 font-medium mb-2">Status</Text>
                        <View className="flex-row bg-gray-100 p-1 rounded-xl">
                            <TouchableOpacity
                                className={`flex-1 py-3 items-center rounded-lg ${packingStatus === 'New' ? 'bg-white shadow-sm shadow-gray-200' : ''}`}
                                onPress={() => setPackingStatus('New')}
                            >
                                <Text className={`font-bold text-xs ${packingStatus === 'New' ? 'text-blue-600' : 'text-gray-400'}`}>New</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                className={`flex-1 py-3 items-center rounded-lg ${packingStatus === 'Repack' ? 'bg-white shadow-sm shadow-gray-200' : ''}`}
                                onPress={() => setPackingStatus('Repack')}
                            >
                                <Text className={`font-bold text-xs ${packingStatus === 'Repack' ? 'text-blue-600' : 'text-gray-400'}`}>Repack</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                <View className="my-6">
                    <Text className="text-gray-600 font-medium mb-2">Packing Type</Text>
                    <View className="flex-row">
                        <TouchableOpacity
                            className={`flex-1 p-4 rounded-xl mr-2 flex-row justify-center items-center ${packingType === 'Box' ? 'bg-blue-600' : 'bg-gray-100'}`}
                            onPress={() => setPackingType('Box')}
                        >
                            <MaterialCommunityIcons name="package-variant" size={20} color={packingType === 'Box' ? 'white' : '#64748b'} />
                            <Text className={`ml-2 font-bold ${packingType === 'Box' ? 'white' : 'text-gray-500'}`}>Box</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            className={`flex-1 p-4 rounded-xl ml-2 flex-row justify-center items-center ${packingType === 'Gatta' ? 'bg-blue-600' : 'bg-gray-100'}`}
                            onPress={() => setPackingType('Gatta')}
                        >
                            <MaterialCommunityIcons name="newspaper" size={20} color={packingType === 'Gatta' ? 'white' : '#64748b'} />
                            <Text className={`ml-2 font-bold ${packingType === 'Gatta' ? 'white' : 'text-gray-500'}`}>Gatta</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <TouchableOpacity
                    className={`w-full p-5 rounded-xl flex-row justify-center items-center ${loading ? 'bg-blue-300' : 'bg-blue-600 shadow-md shadow-blue-200'}`}
                    onPress={handleSubmit}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <>
                            <MaterialCommunityIcons name="check-circle" size={22} color="white" />
                            <Text className="text-white font-bold text-lg ml-2">Submit Packing Data</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>

            <View className="p-4 items-center mb-10">
                <Text className="text-gray-400 text-xs">Logged in as {user?.name} ({user?.username})</Text>
            </View>
        </ScrollView>
    );
}
