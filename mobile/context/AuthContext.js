import React, { createContext, useState, useEffect, useContext } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import api from '../utils/api';
import { router } from 'expo-router';

const AuthContext = createContext();

// Storage Abstraction for Web vs Native
const Storage = {
    getItem: async (key) => {
        if (Platform.OS === 'web') {
            try {
                if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
            } catch (e) { console.error("Local Storage Error", e); }
            return null;
        }
        return await SecureStore.getItemAsync(key);
    },
    setItem: async (key, value) => {
        if (Platform.OS === 'web') {
            try {
                if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
            } catch (e) { console.error("Local Storage Error", e); }
            return;
        }
        return await SecureStore.setItemAsync(key, value);
    },
    deleteItem: async (key) => {
        if (Platform.OS === 'web') {
            try {
                if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
            } catch (e) { console.error("Local Storage Error", e); }
            return;
        }
        return await SecureStore.deleteItemAsync(key);
    }
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        checkUser();
    }, []);

    const checkUser = async () => {
        try {
            const userData = await Storage.getItem('user');
            if (userData) {
                setUser(JSON.parse(userData));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const login = async (username, password) => {
        try {
            const res = await api.post('/api/login', { username, password });
            if (res.data.success) {
                const { user } = res.data;
                await Storage.setItem('user', JSON.stringify(user));
                setUser(user);

                // Navigate based on role
                if (user.role === 'admin') router.replace('/dashboard/owner');
                else router.replace('/dashboard/biller');

                return { success: true };
            } else {
                return { success: false, message: res.data.message };
            }
        } catch (error) {
            console.error("Login Auth Error:", error);
            return { success: false, message: error.response?.data?.message || "Connection Error" };
        }
    };

    const logout = async () => {
        await Storage.deleteItem('user');
        setUser(null);
        router.replace('/');
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
