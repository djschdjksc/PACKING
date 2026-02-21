import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, FlatList, ActivityIndicator, Alert, ScrollView } from 'react-native';
import api from '../../../utils/api';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function UserWiseTab() {
    const [packingData, setPackingData] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            // Here we might need to fetch ALL packing data to see other users' stats,
            // or if limited by backend, only the logged-in user.
            // But the requirement says "sabhi user ki details ayegi".
            // So we fetch all packing data (backend must support this or we fetch what we can).
            const [packingRes, usersRes] = await Promise.all([
                api.get('/api/packing'), // Fetch all (if allowed)
                api.get('/api/users')
            ]);
            setPackingData(packingRes.data);
            setUsers(usersRes.data);
        } catch (error) {
            console.error("Fetch Data Error:", error);
            Alert.alert("Error", "Could not fetch user stats");
        } finally {
            setLoading(false);
        }
    };

    const userWiseData = useMemo(() => {
        const stats = {};
        // Initialize with all users
        users.forEach(u => {
            stats[u.username] = { name: u.name, totalQty: 0, entries: 0 };
        });

        packingData.forEach(entry => {
            if (stats[entry.submittedBy]) {
                stats[entry.submittedBy].totalQty += entry.qty;
                stats[entry.submittedBy].entries += 1;
            } else {
                // For users not found in the users list but present in data
                stats[entry.submittedBy] = { name: entry.submittedBy, totalQty: entry.qty, entries: 1 };
            }
        });

        return Object.values(stats).sort((a, b) => b.totalQty - a.totalQty);
    }, [packingData, users]);

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center">
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        );
    }

    return (
        <ScrollView className="flex-1 bg-gray-50 p-4">
            <Text className="text-lg font-bold text-gray-700 mb-4 px-2">User Performance</Text>
            <View className="flex-row flex-wrap justify-between">
                {userWiseData.map((u, idx) => (
                    <View key={idx} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-4 w-[48%]">
                        <View className="bg-blue-50 w-10 h-10 rounded-full flex justify-center items-center mb-3">
                            <MaterialCommunityIcons name="account" size={24} color="#2563eb" />
                        </View>
                        <Text className="text-gray-800 font-bold text-lg" numberOfLines={1}>{u.name || u.username}</Text>
                        <Text className="text-gray-400 text-xs mt-1">{u.entries} entries</Text>

                        <View className="mt-4 pt-3 border-t border-gray-50">
                            <Text className="text-blue-600 font-black text-xl">{u.totalQty}</Text>
                            <Text className="text-gray-400 text-[10px] uppercase font-bold">Total Qty</Text>
                        </View>
                    </View>
                ))}
            </View>
            <View className="h-10" />
        </ScrollView>
    );
}
