'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal, safe bridge to the web app.
// The web app detects window.electronBridge to enable desktop-specific features.
contextBridge.exposeInMainWorld('electronBridge', {
  isElectron: true,
  platform:   process.platform,

  // Trigger a native OS notification
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),

  // Get the app version (async)
  getVersion: () => ipcRenderer.invoke('get-version'),

  // ThousandEyes Endpoint Agent status
  teAgentLoaded: () => ipcRenderer.invoke('te-agent-status'),
});
