const isCapacitor = window.Capacitor !== undefined;
// DETECTS IF RUNNING IN CAPACITOR (Android App)
// If yes, use the computer's IP address.
// If no (Web Browser), use relative path which goes through Vite proxy.


const isElectron = window.navigator.userAgent.toLowerCase().includes(' electron/') || (window.process && window.process.versions && window.process.versions.electron);

const API_BASE_URL = isCapacitor
    ? 'http://172.27.129.102:5000' // Your detected PC IP. Use this for Physical Android Devices.
    : isElectron
        ? 'http://localhost:5000'
        : `http://${window.location.hostname || 'localhost'}:5000`; // Dynamically use localhost or Network IP

export default API_BASE_URL;
