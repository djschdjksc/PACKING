const isCapacitor = window.Capacitor !== undefined;
// DETECTS IF RUNNING IN CAPACITOR (Android App)
// If yes, use the computer's IP address.
// If no (Web Browser), use relative path which goes through Vite proxy.


const isElectron = window.navigator.userAgent.toLowerCase().includes(' electron/') || (window.process && window.process.versions && window.process.versions.electron);

const API_BASE_URL = isCapacitor
    ? 'https://packing-server.onrender.com' // Cloud API for Android
    : isElectron
        ? 'http://localhost:5000' // Local for Electron (Optional, can also use cloud)
        : 'https://packing-server.onrender.com'; // Cloud API for Web Browser

export default API_BASE_URL;
