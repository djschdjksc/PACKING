import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../utils/api';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function ItemsTab() {
    const { user } = useAuth();
    const [packingData, setPackingData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        fetchPackingData();
    }, []);

    const fetchPackingData = async () => {
        try {
            // Fetch packing data for the logged-in user
            const res = await api.get(`/api/packing?submittedBy=${user.username}`);
            setPackingData(res.data);
        } catch (error) {
            console.error("Fetch Packing Error:", error);
            Alert.alert("Error", "Could not fetch packing history");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleDelete = async (id) => {
        Alert.alert(
            "Confirm Delete",
            "Are you sure you want to delete this entry?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await api.delete(`/api/packing/${id}`);
                            setPackingData(packingData.filter(item => item._id !== id));
                        } catch (error) {
                            Alert.alert("Error", "Failed to delete entry");
                        }
                    }
                }
            ]
        );
    };

    const renderItem = ({ item }) => (
        <View className="bg-white p-4 rounded-xl mb-3 shadow-sm border border-gray-100 flex-row justify-between items-center">
            <View className="flex-1">
                <Text className="text-gray-800 font-bold text-lg">{item.itemName}</Text>
                <View className="flex-row items-center mt-1">
                    <MaterialCommunityIcons name="clock-outline" size={14} color="#94a3b8" />
                    <Text className="text-gray-400 text-xs ml-1">
                        {new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                </View>
                <View className="flex-row mt-2">
                    <View className="bg-blue-50 px-2 py-1 rounded-md mr-2">
                        <Text className="text-blue-600 text-xs font-bold">{item.packingType}</Text>
                    </View>
                    <View className={`px-2 py-1 rounded-md ${item.status === 'Approved' ? 'bg-green-50' : 'bg-yellow-50'}`}>
                        <Text className={`text-xs font-bold ${item.status === 'Approved' ? 'text-green-600' : 'text-yellow-600'}`}>
                            {item.status}
                        </Text>
                    </View>
                </View>
            </View>
            <View className="items-end">
                <Text className="text-2xl font-black text-blue-600">{item.qty}</Text>
                <TouchableOpacity onPress={() => handleDelete(item._id)} className="mt-2 p-1">
                    <MaterialCommunityIcons name="trash-can-outline" size={20} color="#f87171" />
                </TouchableOpacity>
            </View>
        </View>
    );

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center">
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-gray-50 p-4">
            <FlatList
                data={packingData}
                renderItem={renderItem}
                keyExtractor={item => item._id}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPackingData(); }} />
                }
                ListHeaderComponent={<Text className="text-lg font-bold text-gray-700 mb-4">Packer History</Text>}
                ListEmptyComponent={<Text className="text-center text-gray-400 mt-10">No records found</Text>}
                contentContainerStyle={{ paddingBottom: 20 }}
            />
        </View>
    );
}
