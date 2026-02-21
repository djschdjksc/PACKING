import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../utils/api';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function DayWiseTab() {
    const { user } = useAuth();
    const [packingData, setPackingData] = useState([]);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedDate, setExpandedDate] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [packingRes, itemsRes] = await Promise.all([
                api.get(`/api/packing?submittedBy=${user.username}`),
                api.get('/api/items')
            ]);
            setPackingData(packingRes.data);
            setItems(itemsRes.data);
        } catch (error) {
            console.error("Fetch Data Error:", error);
            Alert.alert("Error", "Could not fetch data");
        } finally {
            setLoading(false);
        }
    };

    const dayWiseData = useMemo(() => {
        const groups = {};
        packingData.forEach(entry => {
            const date = new Date(entry.createdAt).toLocaleDateString();
            if (!groups[date]) groups[date] = { totalQty: 0, entries: [] };
            groups[date].totalQty += entry.qty;
            groups[date].entries.push(entry);
        });
        return Object.entries(groups).map(([date, data]) => ({
            date,
            totalQty: data.totalQty,
            details: data.entries
        })).sort((a, b) => new Date(b.date) - new Date(a.date));
    }, [packingData]);

    const getItemInfo = (itemName) => {
        return items.find(i => i.itemName === itemName) || {};
    };

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
                data={dayWiseData}
                keyExtractor={item => item.date}
                ListHeaderComponent={
                    <View className="flex-row justify-between mb-4 px-2">
                        <Text className="text-sm font-bold text-gray-400 uppercase">Date</Text>
                        <Text className="text-sm font-bold text-gray-400 uppercase">Total Qty</Text>
                    </View>
                }
                renderItem={({ item }) => (
                    <View className="mb-3">
                        <TouchableOpacity
                            onPress={() => setExpandedDate(expandedDate === item.date ? null : item.date)}
                            className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex-row justify-between items-center"
                        >
                            <View className="flex-row items-center">
                                <MaterialCommunityIcons name="calendar" size={20} color="#2563eb" />
                                <Text className="text-gray-800 font-bold ml-2 text-lg">{item.date}</Text>
                            </View>
                            <Text className="text-2xl font-black text-blue-600">{item.totalQty}</Text>
                        </TouchableOpacity>

                        {expandedDate === item.date && (
                            <View className="bg-gray-100/50 mt-1 rounded-2xl p-4 border border-gray-200">
                                {item.details.map((entry, idx) => {
                                    const info = getItemInfo(entry.itemName);
                                    return (
                                        <View key={entry._id || idx} className="flex-row justify-between py-2 border-b border-gray-200 last:border-0">
                                            <View className="flex-1">
                                                <Text className="text-gray-700 font-medium">{entry.itemName}</Text>
                                                <Text className="text-gray-400 text-xs">{info.group || 'N/A'}</Text>
                                            </View>
                                            <Text className="text-blue-600 font-black">{entry.qty}</Text>
                                        </View>
                                    );
                                })}
                            </View>
                        )}
                    </View>
                )}
                ListEmptyComponent={<Text className="text-center text-gray-400 mt-10">No data found</Text>}
            />
        </View>
    );
}
