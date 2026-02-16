const isCapacitor = window.Capacitor !== undefined;
// DETECTS IF RUNNING IN CAPACITOR (Android App)
// If yes, use the computer's IP address.
// If no (Web Browser), use relative path which goes through Vite proxy.

const API_BASE_URL = isCapacitor
    ? 'http://10.0.2.2:5000'
    : '';

export default API_BASE_URL;
