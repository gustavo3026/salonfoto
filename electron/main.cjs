const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const isDev = require('electron-is-dev');

let mainWindow;
let pythonServer;

function createPythonServer() {
    const pythonExecutable = process.platform === 'win32' ? 'py' : 'python3';
    const scriptPath = path.join(__dirname, '../server/main.py');

    // Use spawn to run python server
    console.log(`Starting python server at: ${scriptPath}`);
    pythonServer = spawn(pythonExecutable, [scriptPath], {
        cwd: path.join(__dirname, '../'), // Set CWD to root so it finds requirements etc if needed
        // stdio: 'inherit' // Useful for debugging in terminal
    });

    pythonServer.stdout.on('data', (data) => {
        console.log(`Python: ${data}`);
    });

    pythonServer.stderr.on('data', (data) => {
        console.error(`Python Error: ${data}`);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false, // Simplifying for this PoC
            webSecurity: false // Allow local fetch to localhost if needed, though usually fine
        },
    });

    const startUrl = isDev
        ? 'http://localhost:5173'
        : `file://${path.join(__dirname, '../dist/index.html')}`;

    mainWindow.loadURL(startUrl);

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => (mainWindow = null));
}

app.on('ready', () => {
    createPythonServer();
    // Give server a second to breathe? Or wait-on in prod?
    // For now just launch window.
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

app.on('will-quit', () => {
    if (pythonServer) {
        pythonServer.kill();
    }
});
