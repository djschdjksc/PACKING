import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useAuth } from '../../context/AuthContext';

export default function OwnerDashboard() {
    const { logout, user } = useAuth();

    return (
        <View className="flex-1 justify-center items-center bg-gray-100">
            <Text className="text-xl font-bold mb-4">Welcome Owner, {user?.name}</Text>
            <TouchableOpacity
                className="bg-red-500 px-6 py-3 rounded-lg"
                onPress={logout}
            >
                <Text className="text-white font-bold">Logout</Text>
            </TouchableOpacity>
        </View>
    );
}
