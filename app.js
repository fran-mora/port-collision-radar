const { ipcRenderer } = require('electron');

let ports = [];
let currentView = 'radar';
let sweepAngle = 0;
let hoveredPort = null;
let sortColumn = 'port';
let sortAsc = true;
let filterText = '';
let lastFrameTime = 0;
let animationId = null;

// Sweep speed: radians per second (one full rotation every ~12s)
const SWEEP_SPEED = (Math.PI * 2) / 12;
const HIT_RADIUS_SQ = 144; // 12px hover detection radius, squared

// Cache DOM references
const canvas = document.getElementById('radar-canvas');
const ctx = canvas.getContext('2d');
const tooltipEl = document.getElementById('tooltip');
const portCountEl = document.getElementById('port-count');
const scanTimeEl = document.getElementById('scan-time');
const radarViewEl = document.getElementById('radar-view');
const listViewEl = document.getElementById('list-view');
const btnRadar = document.getElementById('btn-radar');
const btnList = document.getElementById('btn-list');
const searchEl = document.getElementById('search');
const tbody = document.getElementById('port-tbody');

const centerX = canvas.width / 2;
const centerY = canvas.height / 2;
const maxRadius = Math.min(centerX, centerY) - 10;

// --- HTML escaping ---
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Process color map ---
const processColors = {};
const colorPalette = [
  [100, 255, 218], [255, 107, 107], [255, 217, 61], [108, 92, 231],
  [162, 155, 254], [253, 121, 168], [0, 206, 201],  [225, 112, 85],
  [116, 185, 255], [85, 239, 196],  [253, 203, 110], [232, 67, 147],
];
let colorIndex = 0;

function getProcessColor(name) {
  if (!processColors[name]) {
    processColors[name] = colorPalette[colorIndex % colorPalette.length];
    colorIndex++;
  }
  return processColors[name];
}

function rgbStr(rgb) {
  return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
}

function rgbaStr(rgb, a) {
  return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')';
}

// --- Radar geometry ---
function portToAngle(port) {
  return ((port / 65535) * Math.PI * 2) - Math.PI / 2;
}

function portToRadius(port) {
  if (port <= 1023) return maxRadius * 0.3;
  if (port <= 49151) return maxRadius * 0.45 + (port / 49151) * maxRadius * 0.25;
  return maxRadius * 0.75 + ((port - 49152) / (65535 - 49152)) * maxRadius * 0.2;
}

// --- Radar drawing ---
function drawRadar(timestamp) {
  // Delta time for frame-rate-independent animation
  if (!lastFrameTime) lastFrameTime = timestamp;
  const dt = (timestamp - lastFrameTime) / 1000;
  lastFrameTime = timestamp;

  sweepAngle += SWEEP_SPEED * dt;
  if (sweepAngle > Math.PI * 2) sweepAngle -= Math.PI * 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  const bgGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius);
  bgGrad.addColorStop(0, '#1a1a2e');
  bgGrad.addColorStop(1, '#0f0f23');
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  ctx.arc(centerX, centerY, maxRadius, 0, Math.PI * 2);
  ctx.fill();

  // Concentric rings with labels
  const rings = [
    { r: maxRadius * 0.3, label: '0\u20131023' },
    { r: maxRadius * 0.7, label: '1024\u201349151' },
    { r: maxRadius * 0.95, label: '49152+' },
  ];

  ctx.strokeStyle = 'rgba(15, 52, 96, 0.6)';
  ctx.lineWidth = 1;
  for (const ring of rings) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, ring.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(136, 146, 176, 0.35)';
    ctx.font = '9px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(ring.label, centerX + 4, centerY - ring.r + 12);
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

  // Sweep trail
  ctx.save();
  for (let i = 0; i < 30; i++) {
    const a = sweepAngle - (i / 30) * 0.5;
    const alpha = (1 - i / 30) * 0.15;
    ctx.strokeStyle = 'rgba(100, 255, 218, ' + alpha + ')';
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
  const showAllLabels = ports.length <= 16;
  for (const p of ports) {
    const angle = portToAngle(p.port);
    const radius = portToRadius(p.port);
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    const isCollision = p.status === 'collision';
    const isNew = p.status === 'new';
    const rgb = isCollision ? [255, 68, 68]
      : isNew ? [255, 217, 61]
      : getProcessColor(p.process);

    // Glow
    const glowRadius = isCollision ? 10 + Math.sin(Date.now() / 200) * 3 : 8;
    ctx.fillStyle = rgbaStr(rgb, 0.2);
    ctx.beginPath();
    ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Dot
    ctx.fillStyle = rgbStr(rgb);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Port label
    if (showAllLabels || p.port <= 1023 || isCollision) {
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

  animationId = requestAnimationFrame(drawRadar);
}

function startRadar() {
  if (animationId) return;
  lastFrameTime = 0;
  animationId = requestAnimationFrame(drawRadar);
}

function stopRadar() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
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
    if (dx * dx + dy * dy < HIT_RADIUS_SQ) {
      hoveredPort = p;
      break;
    }
  }

  if (hoveredPort) {
    tooltipEl.innerHTML =
      '<div class="port-num">:' + hoveredPort.port + '</div>' +
      '<div class="process-name">' + escapeHtml(hoveredPort.process) + '</div>' +
      '<div class="pid">PID ' + hoveredPort.pid + ' \u00b7 ' + escapeHtml(hoveredPort.address) + '</div>' +
      '<div class="status-' + hoveredPort.status + '">' + hoveredPort.status + '</div>';
    tooltipEl.style.display = 'block';
    tooltipEl.style.left = (e.clientX + 12) + 'px';
    tooltipEl.style.top = (e.clientY + 12) + 'px';
  } else {
    tooltipEl.style.display = 'none';
  }
});

canvas.addEventListener('mouseleave', () => {
  tooltipEl.style.display = 'none';
});

// --- List View ---
function renderList() {
  // Copy before sorting to avoid mutating the shared ports array
  let filtered = ports.slice();
  if (filterText) {
    const f = filterText.toLowerCase();
    filtered = filtered.filter(p =>
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

  tbody.innerHTML = filtered.map(p =>
    '<tr>' +
    '<td>' + p.port + '</td>' +
    '<td>' + escapeHtml(p.process) + '</td>' +
    '<td>' + p.pid + '</td>' +
    '<td class="status-' + p.status + '">' + p.status + '</td>' +
    '</tr>'
  ).join('');
}

// --- View Toggle ---
function setView(view) {
  currentView = view;
  const isRadar = view === 'radar';
  radarViewEl.style.display = isRadar ? 'flex' : 'none';
  listViewEl.style.display = isRadar ? 'none' : 'block';
  btnRadar.classList.toggle('active', isRadar);
  btnList.classList.toggle('active', !isRadar);

  if (isRadar) {
    startRadar();
  } else {
    stopRadar();
    renderList();
  }
}

btnRadar.addEventListener('click', () => setView('radar'));
btnList.addEventListener('click', () => setView('list'));

// --- Search ---
searchEl.addEventListener('input', (e) => {
  filterText = e.target.value;
  renderList();
});

// --- Table sorting ---
document.querySelectorAll('#port-table th').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.getAttribute('data-col');
    if (sortColumn === col) {
      sortAsc = !sortAsc;
    } else {
      sortColumn = col;
      sortAsc = true;
    }
    renderList();
  });
});

// --- Pause radar when window is hidden ---
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopRadar();
  } else if (currentView === 'radar') {
    startRadar();
  }
});

// --- IPC ---
function updatePortCount() {
  portCountEl.textContent = ports.length + ' port' + (ports.length !== 1 ? 's' : '');
}

ipcRenderer.on('port-update', (_event, data) => {
  ports = data.ports;
  updatePortCount();
  scanTimeEl.textContent = new Date().toLocaleTimeString();
  if (currentView === 'list') {
    renderList();
  }
});

// Initial data request
ipcRenderer.invoke('get-ports').then(data => {
  ports = data;
  updatePortCount();
});

// Start radar animation
startRadar();
