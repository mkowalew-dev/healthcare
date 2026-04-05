'use strict';

const {
  app, BrowserWindow, Menu, Tray,
  shell, ipcMain, Notification, nativeImage,
  session,
} = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const APP_URL       = 'https://careconnect.retaildemo.net';
const APP_NAME      = 'CareConnect EHR';
const CISCO_DARK    = '#1D4289';
const CISCO_BLUE    = '#049FD9';

// ThousandEyes Endpoint Agent extension ID
const TE_EXT_ID = 'ddnennmeinlkhkmajmmfaojcnpddnpgb';

let mainWindow    = null;
let tray          = null;
let teExtLoaded   = false;

// ── ThousandEyes Extension ────────────────────────────────────

function findTeExtensionPath() {
  // Search Chrome and Edge profiles for the installed extension
  const home = os.homedir();
  const candidates = [];

  if (process.platform === 'darwin') {
    candidates.push(
      path.join(home, 'Library/Application Support/Google/Chrome/Default/Extensions', TE_EXT_ID),
      path.join(home, 'Library/Application Support/Google/Chrome Beta/Default/Extensions', TE_EXT_ID),
      path.join(home, 'Library/Application Support/Microsoft Edge/Default/Extensions', TE_EXT_ID),
    );
  } else if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || '';
    candidates.push(
      path.join(local, 'Google/Chrome/User Data/Default/Extensions', TE_EXT_ID),
      path.join(local, 'Microsoft/Edge/User Data/Default/Extensions', TE_EXT_ID),
    );
  } else {
    candidates.push(
      path.join(home, '.config/google-chrome/Default/Extensions', TE_EXT_ID),
      path.join(home, '.config/microsoft-edge/Default/Extensions', TE_EXT_ID),
    );
  }

  for (const extDir of candidates) {
    if (!fs.existsSync(extDir)) continue;
    // Extensions are stored as <ext-id>/<version>/ — find the latest version dir
    const versions = fs.readdirSync(extDir)
      .filter(v => fs.statSync(path.join(extDir, v)).isDirectory())
      .sort()
      .reverse();
    if (versions.length > 0) {
      return path.join(extDir, versions[0]);
    }
  }
  return null;
}

async function loadThousandEyesExtension() {
  const extPath = findTeExtensionPath();

  if (!extPath) {
    console.log('[TE] ThousandEyes Endpoint Agent not found in Chrome/Edge profiles.');
    console.log('[TE] Install it from: https://chromewebstore.google.com/detail/' + TE_EXT_ID);
    return false;
  }

  try {
    await session.defaultSession.loadExtension(extPath, { allowFileAccess: true });
    console.log(`[TE] ThousandEyes Endpoint Agent loaded from: ${extPath}`);
    teExtLoaded = true;
    return true;
  } catch (err) {
    console.error('[TE] Failed to load extension:', err.message);
    return false;
  }
}

// ── Window ────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width:     1440,
    height:    900,
    minWidth:  960,
    minHeight: 640,
    title:     APP_NAME,
    titleBarStyle: 'default',
    frame: true,
    backgroundColor: CISCO_DARK,   // eliminates white flash before first paint
    webPreferences: {
      preload:                   path.join(__dirname, 'preload.js'),
      contextIsolation:          true,
      nodeIntegration:           false,
      sandbox:                   false,  // sandbox+preload causes input issues on macOS
      webSecurity:               true,
      allowRunningInsecureContent: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
  });

  // Windows: colour the caption-button bar to match the app header
  if (process.platform === 'win32') {
    mainWindow.setTitleBarOverlay({
      color:       CISCO_DARK,
      symbolColor: '#ffffff',
      height:      40,
    });
  }

  // Show branded splash first; navigate to the live URL after it paints
  mainWindow.loadFile(path.join(__dirname, 'splash.html'));

  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.show();
    mainWindow.loadURL(APP_URL);
  });

  // Keep all navigation inside the app domain
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL) && !url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Prevent new Electron windows; open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_URL)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Show offline splash on load failure
  mainWindow.webContents.on('did-fail-load', (_event, errorCode) => {
    if (errorCode === -3) return; // ERR_ABORTED — normal mid-navigation cancel
    mainWindow.loadFile(path.join(__dirname, 'splash.html'));
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.executeJavaScript(
        `document.getElementById('status').textContent = 'Unable to connect. Check your network.';
         document.getElementById('spinner').style.display = 'none';`
      );
    });
  });

  // Restore from tray on click (Windows/Linux)
  mainWindow.on('close', (event) => {
    if (process.platform !== 'darwin' && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// ── Navigate helper ───────────────────────────────────────────

function navigate(pagePath) {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
  mainWindow.loadURL(`${APP_URL}${pagePath}`);
}

// ── Tray ──────────────────────────────────────────────────────

function createTray() {
  const iconFile = process.platform === 'darwin' ? 'tray-iconTemplate.png' : 'tray-icon.png';
  const iconPath = path.join(__dirname, 'assets', iconFile);

  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (process.platform === 'darwin') trayIcon.setTemplateImage(true);
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip(APP_NAME);

  const menu = Menu.buildFromTemplate([
    { label: 'Open CareConnect',  click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Patient Portal',   click: () => navigate('/patient/dashboard') },
    { label: 'Provider Portal',  click: () => navigate('/provider/dashboard') },
    { label: 'Admin Dashboard',  click: () => navigate('/admin/dashboard') },
    { type: 'separator' },
    { label: 'Sign Out', click: () => {
        mainWindow.show();
        mainWindow.webContents.executeJavaScript(
          `localStorage.removeItem('cc_token'); localStorage.removeItem('cc_user'); window.location.href = '/login';`
        );
      }
    },
    { type: 'separator' },
    { label: 'Quit CareConnect', role: 'quit' },
  ]);

  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (mainWindow.isVisible()) mainWindow.focus();
    else mainWindow.show();
  });
}

// ── Application Menu ──────────────────────────────────────────

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
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
        { role: 'quit' },
      ],
    }] : []),

    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: createWindow,
        },
        { type: 'separator' },
        {
          label: 'Sign Out',
          click: () => {
            mainWindow.webContents.executeJavaScript(
              `localStorage.removeItem('cc_token'); localStorage.removeItem('cc_user'); window.location.href = '/login';`
            );
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },

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
      ],
    },

    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        {
          label: 'Developer Tools',
          accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: () => mainWindow.webContents.toggleDevTools(),
        },
      ],
    },

    {
      label: 'Go',
      submenu: [
        { label: 'Patient Dashboard',  accelerator: 'CmdOrCtrl+1', click: () => navigate('/patient/dashboard') },
        { label: 'Appointments',       accelerator: 'CmdOrCtrl+2', click: () => navigate('/patient/appointments') },
        { label: 'Messages',           accelerator: 'CmdOrCtrl+3', click: () => navigate('/patient/messages') },
        { label: 'Lab Results',        accelerator: 'CmdOrCtrl+4', click: () => navigate('/patient/labs') },
        { label: 'Medications',        accelerator: 'CmdOrCtrl+5', click: () => navigate('/patient/medications') },
        { label: 'Billing',            accelerator: 'CmdOrCtrl+6', click: () => navigate('/patient/billing') },
        { type: 'separator' },
        { label: 'Provider Dashboard', click: () => navigate('/provider/dashboard') },
        { label: 'Admin Dashboard',    click: () => navigate('/admin/dashboard') },
        { type: 'separator' },
        { label: 'Back',    role: 'navigateBack' },
        { label: 'Forward', role: 'navigateForward' },
      ],
    },

    {
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front' }]
          : [{ role: 'close' }]
        ),
      ],
    },

    {
      role: 'help',
      submenu: [
        { label: `Version ${app.getVersion()}`, enabled: false },
        { type: 'separator' },
        {
          label: teExtLoaded
            ? '✓ ThousandEyes Endpoint Agent Active'
            : '⚠ ThousandEyes Agent Not Found — Click to Install',
          enabled: !teExtLoaded,
          click: () => shell.openExternal(
            `https://chromewebstore.google.com/detail/${TE_EXT_ID}`
          ),
        },
        { type: 'separator' },
        { label: 'Report a Problem…', click: () => shell.openExternal('mailto:support@retaildemo.net') },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC — native notifications ────────────────────────────────

ipcMain.on('notify', (_event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({
      title,
      body,
      icon: path.join(__dirname, 'assets', 'icon.png'),
    }).show();
  }
});

ipcMain.handle('get-version',    () => app.getVersion());
ipcMain.handle('te-agent-status', () => teExtLoaded);

// ── App lifecycle ─────────────────────────────────────────────

app.whenReady().then(async () => {
  createWindow();
  createTray();
  buildMenu();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else mainWindow.show();
});
