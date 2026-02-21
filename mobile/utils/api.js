import axios from 'axios';
// import * as SecureStore from 'expo-secure-store';

// REPLACE WITH YOUR LOCAL IP
const API_BASE_URL = 'http://localhost:5000';

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add token interceptor if backend adds JWT later
// api.interceptors.request.use(async (config) => {
//     const token = await SecureStore.getItemAsync('token');
//     if (token) {
//         config.headers.Authorization = `Bearer ${token}`;
//     }
//     return config;
// });

export default api;
