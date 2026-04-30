/**
 * Sofire-IT CRM — Electron Desktop App
 * main.js — Main process entry point
 */

const { app, BrowserWindow, Menu, shell, ipcMain, Notification, dialog } = require('electron');
const path  = require('path');
const Store = require('electron-store');

// Persistent settings store (window size, position etc)
const store = new Store();

// Keep reference to prevent garbage collection
let mainWindow = null;

function createWindow() {
  const winBounds = store.get('windowBounds', { width: 1280, height: 800 });

  mainWindow = new BrowserWindow({
    width:  winBounds.width  || 1280,
    height: winBounds.height || 800,
    x:      winBounds.x,
    y:      winBounds.y,
    minWidth:  900,
    minHeight: 600,
    title: 'Sofire-IT CRM',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#0a0a0f',
    show: false, // show after ready-to-show to prevent flash
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      // Allow localStorage to persist
      partition: 'persist:sofire-crm',
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  // Load the CRM app
  // In production: loads the bundled index.html
  // In dev: could load from localhost for hot reload
  mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));

  // Show window once fully loaded (prevents white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Focus the window
    if (process.platform === 'darwin') app.dock.show();
  });

  // Save window size/position on close
  mainWindow.on('close', () => {
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
      store.set('windowBounds', mainWindow.getBounds());
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in system browser, not Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') || url.startsWith('mailto')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Allow Netlify functions to be called (CORS)
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({
      requestHeaders: {
        ...details.requestHeaders,
        'Origin': 'https://sofire-it-finance-crm.netlify.app',
      }
    });
  });

  buildMenu();
}

function buildMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // App menu (Mac only)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),

    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New Invoice',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.executeJavaScript("nav('create')"),
        },
        { type: 'separator' },
        {
          label: 'Export Backup',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow?.webContents.executeJavaScript("exportData()"),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: 'Exit' },
      ]
    },

    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ]
    },

    // View menu
    {
      label: 'View',
      submenu: [
        {
          label: 'Dashboard',
          accelerator: 'CmdOrCtrl+1',
          click: () => mainWindow?.webContents.executeJavaScript("nav('dashboard')"),
        },
        {
          label: 'Invoices',
          accelerator: 'CmdOrCtrl+2',
          click: () => mainWindow?.webContents.executeJavaScript("nav('invoices')"),
        },
        {
          label: 'Payments',
          accelerator: 'CmdOrCtrl+3',
          click: () => mainWindow?.webContents.executeJavaScript("nav('payments')"),
        },
        {
          label: 'Expenses',
          accelerator: 'CmdOrCtrl+4',
          click: () => mainWindow?.webContents.executeJavaScript("nav('expenses')"),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ]
    },

    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
        ] : [
          { role: 'close' },
        ]),
      ]
    },

    // Help menu
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open in Browser',
          click: () => shell.openExternal('https://sofire-it-finance-crm.netlify.app'),
        },
        { type: 'separator' },
        {
          label: 'About Sofire-IT CRM',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Sofire-IT CRM',
              message: 'Sofire-IT CRM',
              detail: `Version ${app.getVersion()}\n\nBuilt for Sofire-IT Support\njuan@sofire-it.co.za\n+27 671 371 638\n\nPowered by Electron + Supabase`,
              icon: path.join(__dirname, 'assets', 'icon.png'),
            });
          }
        },
      ]
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── App lifecycle
app.whenReady().then(() => {
  createWindow();

  // macOS: re-create window when dock icon clicked and no windows open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC: Desktop notifications from renderer
ipcMain.on('notify', (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body, icon: path.join(__dirname, 'assets', 'icon.png') }).show();
  }
});

// ── IPC: Open file save dialog for PDF download
ipcMain.handle('save-pdf', async (event, { filename, base64data }) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: filename || 'invoice.pdf',
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
  });
  if (!filePath) return { cancelled: true };
  const fs = require('fs');
  fs.writeFileSync(filePath, Buffer.from(base64data, 'base64'));
  shell.openPath(filePath); // open PDF after saving
  return { success: true, filePath };
});

// ── Security: prevent navigation away from the app
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, url) => {
    const appUrl = 'file://';
    if (!url.startsWith(appUrl) && !url.includes('netlify')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
});
