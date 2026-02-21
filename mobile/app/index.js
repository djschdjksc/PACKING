import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
    const { login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (!username || !password) {
            Alert.alert('Error', 'Please enter username and password');
            return;
        }

        setLoading(true);
        const result = await login(username, password);
        setLoading(false);

        if (!result.success) {
            Alert.alert('Login Failed', result.message);
        }
    };

    return (
        <View className="flex-1 justify-center items-center bg-gray-100 p-4">
            <View className="bg-white p-6 rounded-2xl shadow-lg w-full max-w-sm">
                <Text className="text-2xl font-bold text-center mb-6 text-gray-800">Packing Data App</Text>

                <Text className="text-gray-600 mb-2">Username</Text>
                <TextInput
                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-lg mb-4"
                    placeholder="Enter Username"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                />

                <Text className="text-gray-600 mb-2">Password</Text>
                <TextInput
                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-lg mb-6"
                    placeholder="Enter Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />

                <TouchableOpacity
                    className="w-full bg-blue-600 p-4 rounded-lg flex items-center"
                    onPress={handleLogin}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text className="text-white font-bold text-lg">Login</Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}
