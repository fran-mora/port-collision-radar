const { app, ipcMain, Menu } = require('electron');
const { menubar } = require('menubar');
const { exec } = require('child_process');
const path = require('path');
const { parseLsofOutput } = require('./scanner');
const { CollisionDetector } = require('./collisions');
const { createTrayIcon } = require('./createIcon');
const { autoUpdater } = require('electron-updater');

const detector = new CollisionDetector();
let mb;
let scanInterval;
let lastCollisionState = false;

function scanPorts() {
  return new Promise((resolve) => {
    exec('/usr/sbin/lsof -iTCP -sTCP:LISTEN -P -n', (error, stdout) => {
      // lsof returns exit code 1 when no results found
      if (error && error.code !== 1) {
        resolve([]);
        return;
      }
      resolve(parseLsofOutput(stdout || ''));
    });
  });
}

async function performScan() {
  const ports = await scanPorts();
  const collisions = detector.update(ports);
  const portData = detector.getPortData();

  // Only update tray icon when collision state changes
  if (mb && mb.tray) {
    const hasCollision = detector.hasCollisions();
    if (hasCollision !== lastCollisionState) {
      mb.tray.setImage(createTrayIcon(hasCollision));
      lastCollisionState = hasCollision;
    }
    mb.tray.setToolTip(
      hasCollision
        ? `Port Collision Detected! (${portData.length} ports)`
        : `Port Radar \u2014 ${portData.length} ports`
    );
  }

  // Send to renderer if window exists
  if (mb && mb.window) {
    mb.window.webContents.send('port-update', { ports: portData, collisions });
  }
}

app.whenReady().then(() => {
  mb = menubar({
    icon: createTrayIcon(false),
    index: `file://${path.join(__dirname, 'index.html')}`,
    browserWindow: {
      width: 420,
      height: 520,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    },
    preloadWindow: true,
  });

  mb.on('ready', () => {
    // Right-click context menu
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Port Collision Radar', enabled: false },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]);
    mb.tray.on('right-click', () => {
      mb.tray.popUpContextMenu(contextMenu);
    });

    performScan();
    scanInterval = setInterval(performScan, 4000);

    // Check for updates silently — downloads and installs on quit
    autoUpdater.logger = null;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.checkForUpdatesAndNotify();
    // Re-check every 4 hours for long-running sessions
    setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 4 * 60 * 60 * 1000);
  });

  ipcMain.on('quit-app', () => app.quit());

  ipcMain.handle('get-ports', () => {
    // Return current data without triggering an extra scan
    return detector.getPortData();
  });
});

app.on('before-quit', () => {
  if (scanInterval) clearInterval(scanInterval);
});
