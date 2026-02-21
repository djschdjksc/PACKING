const { app, BrowserWindow, ipcMain, dialog, nativeImage, clipboard } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const net = require('net');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development';
const PORT = 5000; // Backend Port

// Helper to wait for port
function waitForPort(port, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const interval = setInterval(() => {
            const socket = new net.Socket();
            socket.on('connect', () => {
                socket.destroy();
                clearInterval(interval);
                resolve();
            });
            socket.on('error', (err) => {
                socket.destroy();
                if (Date.now() - start > timeout) {
                    clearInterval(interval);
                    reject(new Error('Timeout waiting for server port'));
                }
            });
            socket.connect(port, '127.0.0.1');
        }, 500);
    });
}

function startServer() {
    console.log('Starting server process...');

    // Set environment variables for the server
    if (!process.env.MONGO_URI) {
        process.env.MONGO_URI = 'mongodb+srv://Rohit:Verma%4099@packingtracker.jk2fg7e.mongodb.net/packing_db?retryWrites=true&w=majority&appName=PackingTracker';
    }
    if (!process.env.PORT) {
        process.env.PORT = PORT;
    }

    try {
        // In production, the app is packaged as an ASAR file.
        // Files are accessed relative to app.getAppPath() or __dirname
        const serverPath = path.join(__dirname, '..', 'server', 'index.js');
        console.log(`Loading server from: ${serverPath}`);

        // require() handles ASAR paths automatically in Electron
        require(serverPath);
        console.log('Server started successfully in main process');
    } catch (err) {
        console.error('Failed to start server:', err);
    }

    // Wait for port to be ready
    return waitForPort(PORT);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: path.join(__dirname, '..', 'public', 'vite.svg'), // Todo: Add a real icon
        autoHideMenuBar: true
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173'); // Vite Dev Server
        mainWindow.webContents.openDevTools();
    } else {
        // Load the React build
        mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// IPC Handler for Saving Files
ipcMain.handle('save-file-dialog', async (event, { data, filename }) => {
    try {
        const { filePath } = await dialog.showSaveDialog({
            defaultPath: filename,
            filters: [
                { name: 'PDF Files', extensions: ['pdf'] },
                { name: 'Images', extensions: ['png', 'jpg'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (filePath) {
            // Remove Base64 header if present (Robust Regex)
            const base64Data = data.replace(/^data:.*?;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            await fs.promises.writeFile(filePath, buffer);
            return { success: true, filePath };
        }
        return { canceled: true };
    } catch (error) {
        console.error('Save File Error:', error);
        return { success: false, error: error.message };
    }
});

// IPC Handler for Copying Images to Clipboard
ipcMain.handle('copy-image-to-clipboard', async (event, { dataUrl }) => {
    try {
        const base64Data = dataUrl.replace(/^data:image\/.*?;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const image = nativeImage.createFromBuffer(buffer);
        clipboard.writeImage(image);
        return { success: true };
    } catch (error) {
        console.error('Clipboard Copy Error:', error);
        return { success: false, error: error.message };
    }
});

app.whenReady().then(async () => {
    try {
        await startServer();
        createWindow();
    } catch (err) {
        console.error('Error starting app:', err);
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

