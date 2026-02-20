# Port Collision Radar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a macOS menubar app that continuously scans listening TCP ports, displays them on a radar visualization, and detects port collisions.

**Architecture:** Electron app using the `menubar` npm package. Main process runs `lsof` on an interval to scan ports, sends structured data to the renderer via IPC. Renderer draws a radar + list hybrid UI on HTML Canvas.

**Tech Stack:** Electron, `menubar` npm package, HTML Canvas, vanilla JS, Node.js `child_process` for `lsof`

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `main.js` (empty entry point)
- Create: `index.html` (empty shell)

**Step 1: Create package.json**

```json
{
  "name": "port-collision-radar",
  "version": "1.0.0",
  "description": "macOS menubar app that monitors listening TCP ports and detects collisions",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "test": "node --test test/"
  },
  "devDependencies": {
    "electron": "^33.0.0"
  },
  "dependencies": {
    "menubar": "^9.5.0"
  }
}
```

**Step 2: Create empty main.js**

```js
// Entry point - will be implemented in Task 2
```

**Step 3: Create empty index.html**

```html
<!DOCTYPE html>
<html>
<head><title>Port Collision Radar</title></head>
<body><p>Loading...</p></body>
</html>
```

**Step 4: Install dependencies**

Run: `cd port-collision-radar && npm install`
Expected: node_modules created, electron and menubar installed

**Step 5: Create .gitignore**

```
node_modules/
```

**Step 6: Commit**

```bash
git add package.json main.js index.html .gitignore
git commit -m "feat: scaffold port-collision-radar electron project"
```

---

### Task 2: Port Scanner Module

**Files:**
- Create: `scanner.js`
- Create: `test/scanner.test.js`

**Step 1: Write failing tests for lsof output parsing**

```js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseLsofOutput } = require('../scanner');

describe('parseLsofOutput', () => {
  it('parses a single listening port', () => {
    const raw = `COMMAND   PID   USER   FD   TYPE   DEVICE SIZE/OFF NODE NAME
node    12345   user   22u  IPv4  0x1234   0t0  TCP *:3000 (LISTEN)`;
    const result = parseLsofOutput(raw);
    assert.deepStrictEqual(result, [{
      port: 3000,
      pid: 12345,
      process: 'node',
      address: '*',
    }]);
  });

  it('parses multiple listening ports', () => {
    const raw = `COMMAND   PID   USER   FD   TYPE   DEVICE SIZE/OFF NODE NAME
node    12345   user   22u  IPv4  0x1234   0t0  TCP *:3000 (LISTEN)
postgres  6789   user   5u  IPv6  0x5678   0t0  TCP [::1]:5432 (LISTEN)
python3  11111   user   3u  IPv4  0x9abc   0t0  TCP 127.0.0.1:8000 (LISTEN)`;
    const result = parseLsofOutput(raw);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].port, 3000);
    assert.strictEqual(result[0].process, 'node');
    assert.strictEqual(result[1].port, 5432);
    assert.strictEqual(result[1].process, 'postgres');
    assert.strictEqual(result[1].address, '[::1]');
    assert.strictEqual(result[2].port, 8000);
    assert.strictEqual(result[2].address, '127.0.0.1');
  });

  it('returns empty array for empty output', () => {
    const result = parseLsofOutput('');
    assert.deepStrictEqual(result, []);
  });

  it('skips malformed lines', () => {
    const raw = `COMMAND   PID   USER   FD   TYPE   DEVICE SIZE/OFF NODE NAME
this is not valid
node    12345   user   22u  IPv4  0x1234   0t0  TCP *:3000 (LISTEN)`;
    const result = parseLsofOutput(raw);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].port, 3000);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd port-collision-radar && npm test`
Expected: FAIL — `parseLsofOutput` not defined

**Step 3: Implement parseLsofOutput**

```js
function parseLsofOutput(raw) {
  if (!raw || !raw.trim()) return [];
  const lines = raw.trim().split('\n');
  // Skip header line
  const dataLines = lines.slice(1);
  const results = [];

  for (const line of dataLines) {
    // lsof output columns are whitespace-separated
    // COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
    const parts = line.trim().split(/\s+/);
    if (parts.length < 9) continue;

    const process = parts[0];
    const pid = parseInt(parts[1], 10);
    const name = parts[parts.length - 1]; // Last part before (LISTEN)
    // Check this is a LISTEN line
    if (!line.includes('(LISTEN)')) continue;

    // NAME format: address:port
    // Examples: *:3000, 127.0.0.1:8000, [::1]:5432
    const nameField = parts[parts.length - 2]; // The address:port part
    const lastColon = nameField.lastIndexOf(':');
    if (lastColon === -1) continue;

    const address = nameField.substring(0, lastColon);
    const port = parseInt(nameField.substring(lastColon + 1), 10);
    if (isNaN(port) || isNaN(pid)) continue;

    results.push({ port, pid, process, address });
  }

  return results;
}

module.exports = { parseLsofOutput };
```

**Step 4: Run tests to verify they pass**

Run: `cd port-collision-radar && npm test`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add scanner.js test/scanner.test.js
git commit -m "feat: add lsof output parser with tests"
```

---

### Task 3: Collision Detection Module

**Files:**
- Create: `collisions.js`
- Create: `test/collisions.test.js`

**Step 1: Write failing tests for collision detection**

```js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { CollisionDetector } = require('../collisions');

describe('CollisionDetector', () => {
  it('reports no collisions on first scan', () => {
    const detector = new CollisionDetector();
    const ports = [
      { port: 3000, pid: 100, process: 'node', address: '*' },
    ];
    const collisions = detector.update(ports);
    assert.deepStrictEqual(collisions, []);
  });

  it('reports no collision when same process keeps port', () => {
    const detector = new CollisionDetector();
    const ports = [
      { port: 3000, pid: 100, process: 'node', address: '*' },
    ];
    detector.update(ports);
    const collisions = detector.update(ports);
    assert.deepStrictEqual(collisions, []);
  });

  it('detects collision when different process takes over a port', () => {
    const detector = new CollisionDetector();
    detector.update([
      { port: 3000, pid: 100, process: 'node', address: '*' },
    ]);
    const collisions = detector.update([
      { port: 3000, pid: 200, process: 'python3', address: '*' },
    ]);
    assert.strictEqual(collisions.length, 1);
    assert.strictEqual(collisions[0].port, 3000);
    assert.strictEqual(collisions[0].previousProcess, 'node');
    assert.strictEqual(collisions[0].currentProcess, 'python3');
  });

  it('tracks new ports as status "new"', () => {
    const detector = new CollisionDetector();
    detector.update([
      { port: 3000, pid: 100, process: 'node', address: '*' },
    ]);
    detector.update([
      { port: 3000, pid: 100, process: 'node', address: '*' },
      { port: 8080, pid: 200, process: 'python3', address: '*' },
    ]);
    const statuses = detector.getStatuses();
    assert.strictEqual(statuses.get(3000), 'healthy');
    assert.strictEqual(statuses.get(8080), 'new');
  });

  it('clears collision status after a few scans', () => {
    const detector = new CollisionDetector();
    detector.update([
      { port: 3000, pid: 100, process: 'node', address: '*' },
    ]);
    detector.update([
      { port: 3000, pid: 200, process: 'python3', address: '*' },
    ]);
    // After several stable scans, collision should clear
    for (let i = 0; i < 5; i++) {
      detector.update([
        { port: 3000, pid: 200, process: 'python3', address: '*' },
      ]);
    }
    const statuses = detector.getStatuses();
    assert.strictEqual(statuses.get(3000), 'healthy');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd port-collision-radar && npm test`
Expected: FAIL — `CollisionDetector` not defined

**Step 3: Implement CollisionDetector**

```js
class CollisionDetector {
  constructor() {
    // Map<port, { pid, process, address, firstSeen, status, collisionAge }>
    this.portMap = new Map();
  }

  update(ports) {
    const collisions = [];
    const currentPorts = new Set();

    for (const entry of ports) {
      currentPorts.add(entry.port);
      const prev = this.portMap.get(entry.port);

      if (!prev) {
        // New port
        this.portMap.set(entry.port, {
          ...entry,
          firstSeen: Date.now(),
          status: this.portMap.size === 0 ? 'healthy' : 'new',
          collisionAge: 0,
        });
      } else if (prev.pid !== entry.pid) {
        // Different process on same port — collision
        collisions.push({
          port: entry.port,
          previousProcess: prev.process,
          previousPid: prev.pid,
          currentProcess: entry.process,
          currentPid: entry.pid,
        });
        this.portMap.set(entry.port, {
          ...entry,
          firstSeen: Date.now(),
          status: 'collision',
          collisionAge: 0,
        });
      } else {
        // Same process, age the status
        const record = this.portMap.get(entry.port);
        record.collisionAge++;
        if (record.status === 'collision' && record.collisionAge > 3) {
          record.status = 'healthy';
        } else if (record.status === 'new' && record.collisionAge > 2) {
          record.status = 'healthy';
        }
      }
    }

    // Remove ports that are no longer listening
    for (const port of this.portMap.keys()) {
      if (!currentPorts.has(port)) {
        this.portMap.delete(port);
      }
    }

    return collisions;
  }

  getStatuses() {
    const statuses = new Map();
    for (const [port, record] of this.portMap) {
      statuses.set(port, record.status);
    }
    return statuses;
  }

  getPortData() {
    return Array.from(this.portMap.entries()).map(([port, record]) => ({
      port,
      pid: record.pid,
      process: record.process,
      address: record.address,
      status: record.status,
    }));
  }
}

module.exports = { CollisionDetector };
```

**Step 4: Run tests to verify they pass**

Run: `cd port-collision-radar && npm test`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add collisions.js test/collisions.test.js
git commit -m "feat: add collision detection with port history tracking"
```

---

### Task 4: Main Process — Menubar App with Port Scanning

**Files:**
- Create: `main.js` (overwrite placeholder)
- Create: `icon.png` (16x16 menubar icon — generate programmatically)
- Create: `icons/` directory

**Step 1: Create a simple menubar tray icon**

Use a Node script to generate a 16x16 PNG (or use a template icon). For now, create a minimal SVG-based icon converted to a data URL, or use Electron's `nativeImage` to create one programmatically.

Create `createIcon.js`:
```js
const { nativeImage } = require('electron');

function createTrayIcon(hasCollision = false) {
  // Create a 22x22 icon (standard macOS menubar size)
  const size = 22;
  const canvas = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="11" cy="11" r="9" fill="none" stroke="${hasCollision ? '#ff4444' : '#666'}" stroke-width="1.5"/>
      <circle cx="11" cy="11" r="5" fill="none" stroke="${hasCollision ? '#ff4444' : '#666'}" stroke-width="1"/>
      <circle cx="11" cy="11" r="2" fill="${hasCollision ? '#ff4444' : '#666'}"/>
      <line x1="11" y1="11" x2="18" y2="6" stroke="${hasCollision ? '#ff4444' : '#4CAF50'}" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`;
  const buffer = Buffer.from(canvas);
  return nativeImage.createFromBuffer(buffer);
}

module.exports = { createTrayIcon };
```

**Step 2: Implement main.js**

```js
const { app, ipcMain } = require('electron');
const { menubar } = require('menubar');
const { exec } = require('child_process');
const path = require('path');
const { parseLsofOutput } = require('./scanner');
const { CollisionDetector } = require('./collisions');

const detector = new CollisionDetector();
let mb;
let scanInterval;

function scanPorts() {
  return new Promise((resolve, reject) => {
    exec('lsof -iTCP -sTCP:LISTEN -P -n', (error, stdout) => {
      // lsof returns exit code 1 when no results found — not an error
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

  if (mb.window) {
    mb.window.webContents.send('port-update', { ports: portData, collisions });
  }
}

app.whenReady().then(() => {
  mb = menubar({
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
    // Start scanning
    performScan();
    scanInterval = setInterval(performScan, 4000);
  });

  mb.on('after-close', () => {
    // Keep scanning even when window is hidden
  });

  ipcMain.handle('get-ports', async () => {
    await performScan();
    return detector.getPortData();
  });
});

app.on('before-quit', () => {
  if (scanInterval) clearInterval(scanInterval);
});
```

**Step 3: Verify the app launches**

Run: `cd port-collision-radar && npm start`
Expected: Electron launches, menubar icon appears, clicking it opens a window showing "Loading..."

**Step 4: Commit**

```bash
git add main.js createIcon.js
git commit -m "feat: wire up menubar app with port scanning"
```

---

### Task 5: Renderer — Radar Visualization

**Files:**
- Modify: `index.html`
- Create: `app.js`
- Create: `styles.css`

**Step 1: Build the HTML shell with Canvas and view toggle**

`index.html`:
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Port Collision Radar</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app">
    <header>
      <h1>Port Radar</h1>
      <div class="view-toggle">
        <button id="btn-radar" class="active">Radar</button>
        <button id="btn-list">List</button>
      </div>
    </header>
    <div id="radar-view">
      <canvas id="radar-canvas" width="380" height="380"></canvas>
    </div>
    <div id="list-view" style="display:none;">
      <input type="text" id="search" placeholder="Filter ports...">
      <table id="port-table">
        <thead>
          <tr><th>Port</th><th>Process</th><th>PID</th><th>Status</th></tr>
        </thead>
        <tbody id="port-tbody"></tbody>
      </table>
    </div>
    <div id="tooltip" class="tooltip" style="display:none;"></div>
    <footer>
      <span id="port-count">0 ports</span>
      <span id="scan-time"></span>
    </footer>
  </div>
  <script src="app.js"></script>
</body>
</html>
```

**Step 2: Create styles.css**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
  background: #1a1a2e;
  color: #e0e0e0;
  overflow: hidden;
  user-select: none;
}

#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 12px;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

h1 {
  font-size: 14px;
  font-weight: 600;
  color: #8892b0;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.view-toggle {
  display: flex;
  gap: 2px;
  background: #16213e;
  border-radius: 6px;
  padding: 2px;
}

.view-toggle button {
  background: none;
  border: none;
  color: #8892b0;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}

.view-toggle button.active {
  background: #0f3460;
  color: #64ffda;
}

#radar-view {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

#radar-canvas {
  border-radius: 50%;
}

/* List View */
#list-view {
  flex: 1;
  overflow-y: auto;
}

#search {
  width: 100%;
  padding: 8px 12px;
  background: #16213e;
  border: 1px solid #0f3460;
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 12px;
  margin-bottom: 8px;
  outline: none;
  font-family: inherit;
}

#search:focus {
  border-color: #64ffda;
}

#port-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

#port-table th {
  text-align: left;
  padding: 6px 8px;
  color: #8892b0;
  border-bottom: 1px solid #0f3460;
  font-weight: 500;
  cursor: pointer;
}

#port-table td {
  padding: 5px 8px;
  border-bottom: 1px solid rgba(15, 52, 96, 0.5);
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.status-healthy { color: #64ffda; }
.status-collision { color: #ff4444; animation: pulse 1s infinite; }
.status-new { color: #ffd93d; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.tooltip {
  position: fixed;
  background: #16213e;
  border: 1px solid #0f3460;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  pointer-events: none;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}

.tooltip .port-num { color: #64ffda; font-weight: 600; }
.tooltip .process-name { color: #e0e0e0; }
.tooltip .pid { color: #8892b0; }

footer {
  display: flex;
  justify-content: space-between;
  padding-top: 8px;
  font-size: 11px;
  color: #8892b0;
}
```

**Step 3: Implement app.js with radar drawing and list view**

```js
const { ipcRenderer } = require('electron');

let ports = [];
let currentView = 'radar';
let sweepAngle = 0;
let hoveredPort = null;
let sortColumn = 'port';
let sortAsc = true;
let filterText = '';

// --- Process color map ---
const processColors = {};
const colorPalette = [
  '#64ffda', '#ff6b6b', '#ffd93d', '#6c5ce7',
  '#a29bfe', '#fd79a8', '#00cec9', '#e17055',
  '#74b9ff', '#55efc4', '#fdcb6e', '#e84393',
];
let colorIndex = 0;

function getProcessColor(name) {
  if (!processColors[name]) {
    processColors[name] = colorPalette[colorIndex % colorPalette.length];
    colorIndex++;
  }
  return processColors[name];
}

// --- Radar ---
const canvas = document.getElementById('radar-canvas');
const ctx = canvas.getContext('2d');
const centerX = canvas.width / 2;
const centerY = canvas.height / 2;
const maxRadius = Math.min(centerX, centerY) - 10;

function portToAngle(port) {
  // Distribute ports around the circle based on port number
  return ((port / 65535) * Math.PI * 2) - Math.PI / 2;
}

function portToRadius(port) {
  // Inner: well-known (0-1023), Middle: registered (1024-49151), Outer: ephemeral (49152+)
  if (port <= 1023) return maxRadius * 0.3;
  if (port <= 49151) return maxRadius * 0.45 + (port / 49151) * maxRadius * 0.25;
  return maxRadius * 0.75 + ((port - 49152) / (65535 - 49152)) * maxRadius * 0.2;
}

function drawRadar() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  const bgGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius);
  bgGrad.addColorStop(0, '#1a1a2e');
  bgGrad.addColorStop(1, '#0f0f23');
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  ctx.arc(centerX, centerY, maxRadius, 0, Math.PI * 2);
  ctx.fill();

  // Concentric rings
  const rings = [
    { r: maxRadius * 0.3, label: '0-1023' },
    { r: maxRadius * 0.7, label: '1024-49151' },
    { r: maxRadius * 0.95, label: '49152+' },
  ];

  ctx.strokeStyle = 'rgba(15, 52, 96, 0.6)';
  ctx.lineWidth = 1;
  for (const ring of rings) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, ring.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Cross lines
  ctx.strokeStyle = 'rgba(15, 52, 96, 0.3)';
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + Math.cos(angle) * maxRadius, centerY + Math.sin(angle) * maxRadius);
    ctx.stroke();
  }

  // Sweep line
  sweepAngle += 0.02;
  if (sweepAngle > Math.PI * 2) sweepAngle -= Math.PI * 2;

  const sweepGrad = ctx.createConicalGradient
    ? null // Not all browsers support this
    : null;

  // Sweep trail
  ctx.save();
  for (let i = 0; i < 30; i++) {
    const a = sweepAngle - (i / 30) * 0.5;
    const alpha = (1 - i / 30) * 0.15;
    ctx.strokeStyle = `rgba(100, 255, 218, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + Math.cos(a) * maxRadius, centerY + Math.sin(a) * maxRadius);
    ctx.stroke();
  }
  ctx.restore();

  // Main sweep line
  ctx.strokeStyle = 'rgba(100, 255, 218, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(centerX + Math.cos(sweepAngle) * maxRadius, centerY + Math.sin(sweepAngle) * maxRadius);
  ctx.stroke();

  // Port dots
  for (const p of ports) {
    const angle = portToAngle(p.port);
    const radius = portToRadius(p.port);
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    const color = p.status === 'collision' ? '#ff4444'
      : p.status === 'new' ? '#ffd93d'
      : getProcessColor(p.process);

    // Glow
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 12);
    glow.addColorStop(0, color.replace(')', ', 0.6)').replace('rgb', 'rgba').replace('#', ''));
    glow.addColorStop(1, 'transparent');

    ctx.fillStyle = `${color}33`;
    ctx.beginPath();
    ctx.arc(x, y, p.status === 'collision' ? 10 + Math.sin(Date.now() / 200) * 3 : 8, 0, Math.PI * 2);
    ctx.fill();

    // Dot
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Port label for well-known ports or collisions
    if (p.port <= 1023 || p.status === 'collision') {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.port, x, y - 10);
    }

    // Store position for hover detection
    p._x = x;
    p._y = y;
  }

  // Center dot
  ctx.fillStyle = '#64ffda';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
  ctx.fill();

  requestAnimationFrame(drawRadar);
}

// --- Hover detection ---
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  hoveredPort = null;
  for (const p of ports) {
    if (p._x === undefined) continue;
    const dx = mx - p._x;
    const dy = my - p._y;
    if (dx * dx + dy * dy < 144) { // 12px radius
      hoveredPort = p;
      break;
    }
  }

  const tooltip = document.getElementById('tooltip');
  if (hoveredPort) {
    tooltip.innerHTML = `
      <div class="port-num">:${hoveredPort.port}</div>
      <div class="process-name">${hoveredPort.process}</div>
      <div class="pid">PID ${hoveredPort.pid} &middot; ${hoveredPort.address}</div>
      <div class="status-${hoveredPort.status}">${hoveredPort.status}</div>
    `;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX + 12) + 'px';
    tooltip.style.top = (e.clientY + 12) + 'px';
  } else {
    tooltip.style.display = 'none';
  }
});

canvas.addEventListener('mouseleave', () => {
  document.getElementById('tooltip').style.display = 'none';
});

// --- List View ---
function renderList() {
  const tbody = document.getElementById('port-tbody');
  let filtered = ports;
  if (filterText) {
    const f = filterText.toLowerCase();
    filtered = ports.filter(p =>
      String(p.port).includes(f) ||
      p.process.toLowerCase().includes(f) ||
      String(p.pid).includes(f)
    );
  }

  filtered.sort((a, b) => {
    const va = a[sortColumn];
    const vb = b[sortColumn];
    const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return sortAsc ? cmp : -cmp;
  });

  tbody.innerHTML = filtered.map(p => `
    <tr>
      <td>${p.port}</td>
      <td>${p.process}</td>
      <td>${p.pid}</td>
      <td class="status-${p.status}">${p.status}</td>
    </tr>
  `).join('');
}

// --- View Toggle ---
document.getElementById('btn-radar').addEventListener('click', () => {
  currentView = 'radar';
  document.getElementById('radar-view').style.display = 'flex';
  document.getElementById('list-view').style.display = 'none';
  document.getElementById('btn-radar').classList.add('active');
  document.getElementById('btn-list').classList.remove('active');
});

document.getElementById('btn-list').addEventListener('click', () => {
  currentView = 'list';
  document.getElementById('radar-view').style.display = 'none';
  document.getElementById('list-view').style.display = 'block';
  document.getElementById('btn-radar').classList.remove('active');
  document.getElementById('btn-list').classList.add('active');
  renderList();
});

// --- Search ---
document.getElementById('search').addEventListener('input', (e) => {
  filterText = e.target.value;
  renderList();
});

// --- Table sorting ---
document.querySelectorAll('#port-table th').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.textContent.toLowerCase();
    if (sortColumn === col) {
      sortAsc = !sortAsc;
    } else {
      sortColumn = col;
      sortAsc = true;
    }
    renderList();
  });
});

// --- IPC ---
ipcRenderer.on('port-update', (_event, data) => {
  ports = data.ports;
  document.getElementById('port-count').textContent = `${ports.length} port${ports.length !== 1 ? 's' : ''}`;
  document.getElementById('scan-time').textContent = new Date().toLocaleTimeString();
  if (currentView === 'list') {
    renderList();
  }
});

// Initial data request
ipcRenderer.invoke('get-ports').then(data => {
  ports = data;
  document.getElementById('port-count').textContent = `${ports.length} port${ports.length !== 1 ? 's' : ''}`;
});

// Start radar animation
drawRadar();
```

**Step 4: Verify the full app works**

Run: `cd port-collision-radar && npm start`
Expected: Menubar icon appears. Clicking it shows the radar view with port dots. Toggle to list view works. Ports from lsof appear.

**Step 5: Commit**

```bash
git add index.html app.js styles.css
git commit -m "feat: add radar visualization and list view UI"
```

---

### Task 6: Polish and Final Integration

**Files:**
- Modify: `main.js` — add tray icon with collision indicator
- Modify: `app.js` — minor UX polish

**Step 1: Add tray icon that changes on collision**

In `main.js`, after `menubar` is ready, update the tray icon when collisions are detected. Use Electron's `nativeImage` to draw a simple radar-style icon.

Add to `main.js` after the `performScan` function:

```js
function updateTrayIcon(hasCollisions) {
  if (!mb.tray) return;
  // Electron supports template images for macOS menubar
  // For simplicity, change the title/tooltip
  mb.tray.setToolTip(hasCollisions ? 'Port Collision Detected!' : 'Port Radar - All clear');
}
```

Call `updateTrayIcon(collisions.length > 0)` inside `performScan` after detecting collisions.

**Step 2: Test the complete app end-to-end**

Run: `cd port-collision-radar && npm start`

Manual test checklist:
- [ ] Menubar icon appears
- [ ] Clicking icon shows radar with active ports
- [ ] Dots are color-coded by process
- [ ] Sweep line animates
- [ ] Hovering a dot shows tooltip with port/process/PID
- [ ] Toggling to list view shows ports in a table
- [ ] Search filters the list
- [ ] Clicking column headers sorts the table
- [ ] Footer shows port count and last scan time

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: polish menubar integration and tray tooltip"
```
