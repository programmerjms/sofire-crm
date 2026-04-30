/**
 * preload.js — Secure context bridge
 * Exposes only specific APIs to the renderer (web app)
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Send desktop notification
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),

  // Save PDF to disk via native save dialog
  savePDF: (filename, base64data) => ipcRenderer.invoke('save-pdf', { filename, base64data }),

  // Platform info
  platform: process.platform,
  isDesktop: true,
  version: process.env.npm_package_version || '1.0.0',
});
