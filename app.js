// =====================================================
// TSN Simulation Dashboard - Vanilla JS
// =====================================================

// Device Configuration - 2 Boards
const devices = [
  { id: 'board-1', name: 'TSN Board #1', type: 'LAN9692', mac: 'E6:F4:41:C9:57:01', ip: '192.168.1.101', ports: 9, role: 'GM (Grandmaster)', roleShort: 'GM', status: 'online', uptime: 86400 + Math.floor(Math.random() * 3600) },
  { id: 'board-2', name: 'TSN Board #2', type: 'LAN9692', mac: 'FA:AE:C9:26:A4:02', ip: '192.168.1.102', ports: 9, role: 'Slave', roleShort: 'Slave', status: 'online', uptime: 43200 + Math.floor(Math.random() * 3600) },
];

// Traffic Class Names
const tcNames = ['BE(BG)', 'BE', 'EE', 'CA', 'Video', 'Voice', 'IC', 'NC'];

// Default GCL: 8 slots x 125ms
const DEFAULT_GCL = [
  { gateStates: 0b00000011, timeInterval: 125000000 },
  { gateStates: 0b00000101, timeInterval: 125000000 },
  { gateStates: 0b00001001, timeInterval: 125000000 },
  { gateStates: 0b00010001, timeInterval: 125000000 },
  { gateStates: 0b00100001, timeInterval: 125000000 },
  { gateStates: 0b01000001, timeInterval: 125000000 },
  { gateStates: 0b10000001, timeInterval: 125000000 },
  { gateStates: 0b00000001, timeInterval: 125000000 },
];

// CBS Queue Configuration
const cbsQueues = [
  { queue: 0, tc: 'TC0', name: 'BE(BG)', idleSlope: 0, sendSlope: 0, cbs: false },
  { queue: 1, tc: 'TC1', name: 'BE', idleSlope: 0, sendSlope: 0, cbs: false },
  { queue: 2, tc: 'TC2', name: 'EE', idleSlope: 0, sendSlope: 0, cbs: false },
  { queue: 3, tc: 'TC3', name: 'CA', idleSlope: 0, sendSlope: 0, cbs: false },
  { queue: 4, tc: 'TC4', name: 'Video', idleSlope: 0, sendSlope: 0, cbs: false },
  { queue: 5, tc: 'TC5', name: 'Voice (SR-A)', idleSlope: 250000, sendSlope: -750000, cbs: true },
  { queue: 6, tc: 'TC6', name: 'Video (SR-B)', idleSlope: 375000, sendSlope: -625000, cbs: true },
  { queue: 7, tc: 'TC7', name: 'NC', idleSlope: 0, sendSlope: 0, cbs: false },
];

// State
let selectedDevice = devices[0];
let ptpData = {};
let offsetHistory = {};
let cbsCreditHistory = { tc5: [], tc6: [] };
let currentPage = 'ptp';

// =====================================================
// High-DPI Canvas Support
// =====================================================
function setupCanvas(canvas, width, height) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, width, height, dpr };
}

// =====================================================
// Navigation
// =====================================================
function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      showPage(page);
    });
  });

  // Handle hash navigation
  if (window.location.hash) {
    const page = window.location.hash.slice(1);
    showPage(page);
  }
}

function showPage(page) {
  currentPage = page;

  // Update nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  // Show/hide pages
  document.querySelectorAll('.page').forEach(p => {
    p.style.display = 'none';
  });
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.style.display = 'block';

  window.location.hash = page;
}

// =====================================================
// Board Selectors
// =====================================================
function renderBoardSelectors() {
  ['ptp', 'tas', 'cbs'].forEach(page => {
    const container = document.getElementById(`${page}-board-selector`);
    if (!container) return;

    container.innerHTML = devices.map(device => `
      <button class="board-btn ${selectedDevice.id === device.id ? 'active' : ''}" data-device="${device.id}">
        <span class="board-state">${ptpData[device.id]?.portState || 'MASTER'}</span>
        <div class="board-name">${device.name}</div>
        <div class="board-role">${device.role}</div>
      </button>
    `).join('');

    container.querySelectorAll('.board-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedDevice = devices.find(d => d.id === btn.dataset.device);
        renderBoardSelectors();
        updateDisplays();
      });
    });
  });
}

// =====================================================
// PTP Simulation
// =====================================================
function generatePTPData(device, prevOffset = 0) {
  const isGM = device.roleShort === 'GM';

  // Realistic PTP offset simulation - typically within ±50ns when synchronized
  const baseJitter = isGM ? 0 : 8;
  const drift = (Math.random() - 0.5) * baseJitter;

  let newOffset = isGM ? 0 : prevOffset * 0.92 + drift;
  newOffset = Math.max(-50, Math.min(50, newOffset));

  return {
    offset: newOffset,
    meanPathDelay: isGM ? 0 : 5200 + Math.random() * 300,
    clockClass: isGM ? 6 : 248,
    clockAccuracy: isGM ? 0x21 : 0x25,
    priority1: isGM ? 128 : 255,
    priority2: isGM ? 128 : 255,
    stepsRemoved: isGM ? 0 : 1,
    portState: isGM ? 'MASTER' : 'SLAVE',
    gmIdentity: 'E6:F4:41:FF:FE:C9:57:01',
  };
}

function updatePTPData() {
  devices.forEach(device => {
    const prevOffset = ptpData[device.id]?.offset || (Math.random() - 0.5) * 50;
    ptpData[device.id] = generatePTPData(device, prevOffset);
  });

  // Update offset history for selected device
  if (!offsetHistory[selectedDevice.id]) offsetHistory[selectedDevice.id] = [];
  offsetHistory[selectedDevice.id].push({
    time: Date.now(),
    offset: ptpData[selectedDevice.id].offset
  });
  if (offsetHistory[selectedDevice.id].length > 200) {
    offsetHistory[selectedDevice.id].shift();
  }
}

function renderPTPDashboard() {
  const data = ptpData[selectedDevice.id];
  if (!data) return;

  const isLocked = Math.abs(data.offset) < 50;

  // Status
  const statusEl = document.getElementById('ptp-status');
  statusEl.textContent = isLocked ? 'Locked' : 'Acquiring';
  statusEl.className = `status-badge ${isLocked ? 'success' : 'warning'}`;

  // Metrics
  const offsetEl = document.getElementById('ptp-offset');
  offsetEl.textContent = data.offset.toFixed(1);
  offsetEl.className = `metric-value ${Math.abs(data.offset) < 50 ? 'success' : 'warning'}`;

  document.getElementById('ptp-delay').textContent = (data.meanPathDelay / 1000).toFixed(2);
  document.getElementById('ptp-steps').textContent = data.stepsRemoved;
  document.getElementById('ptp-class').textContent = data.clockClass;

  // Samples
  const history = offsetHistory[selectedDevice.id] || [];
  document.getElementById('ptp-samples').textContent = `${history.length} samples @ 8Hz`;

  // Clock properties
  document.getElementById('ptp-gm-id').textContent = data.gmIdentity;
  document.getElementById('ptp-clock-class').textContent = data.clockClass;
  document.getElementById('ptp-accuracy').textContent = `0x${data.clockAccuracy.toString(16).toUpperCase()}`;
  document.getElementById('ptp-priority1').textContent = data.priority1;
  document.getElementById('ptp-priority2').textContent = data.priority2;
  document.getElementById('ptp-port-state').textContent = data.portState;

  // All boards table
  const tableBody = document.getElementById('ptp-boards-table');
  tableBody.innerHTML = devices.map(device => {
    const d = ptpData[device.id];
    const synced = d && Math.abs(d.offset) < 50;
    return `
      <tr style="${selectedDevice.id === device.id ? 'background:#f8fafc' : ''}">
        <td style="font-weight:500">${device.name}</td>
        <td>${device.roleShort}</td>
        <td><span class="status-badge ${d?.portState === 'MASTER' ? 'success' : 'info'}">${d?.portState || '-'}</span></td>
        <td style="text-align:right;font-family:monospace">${d?.offset?.toFixed(1) || '-'}</td>
        <td style="text-align:right;font-family:monospace">${d?.meanPathDelay ? (d.meanPathDelay / 1000).toFixed(2) : '-'}</td>
        <td style="text-align:center"><span class="status-badge ${synced ? 'success' : 'warning'}">${synced ? 'Synced' : 'Syncing'}</span></td>
      </tr>
    `;
  }).join('');

  // Draw graph
  drawPTPGraph();
}

function drawPTPGraph() {
  const canvas = document.getElementById('ptp-graph');
  const history = offsetHistory[selectedDevice.id] || [];
  if (!canvas || history.length < 2) return;

  const { ctx, width, height } = setupCanvas(canvas, 900, 280);
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };

  // Clear
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);

  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  // Grid lines
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (graphHeight * i / 4);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  // Y-axis labels
  ctx.fillStyle = '#64748b';
  ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'right';
  const maxOffset = 50;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (graphHeight * i / 4);
    const value = maxOffset - (maxOffset * 2 * i / 4);
    ctx.fillText(`${value.toFixed(0)}`, padding.left - 10, y + 4);
  }

  // Axis labels
  ctx.textAlign = 'center';
  ctx.fillText('Time', width / 2, height - 8);
  ctx.save();
  ctx.translate(14, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Offset (ns)', 0, 0);
  ctx.restore();

  // Zero line
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  const zeroY = padding.top + graphHeight / 2;
  ctx.beginPath();
  ctx.moveTo(padding.left, zeroY);
  ctx.lineTo(width - padding.right, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw offset line
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  ctx.beginPath();

  history.forEach((point, i) => {
    const x = padding.left + (i / (history.length - 1)) * graphWidth;
    const normalizedOffset = (maxOffset - point.offset) / (maxOffset * 2);
    const y = padding.top + normalizedOffset * graphHeight;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Current value indicator
  if (history.length > 0) {
    const lastPoint = history[history.length - 1];
    const x = width - padding.right;
    const normalizedOffset = (maxOffset - lastPoint.offset) / (maxOffset * 2);
    const y = padding.top + normalizedOffset * graphHeight;

    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// =====================================================
// TAS Dashboard
// =====================================================
function renderTASDashboard() {
  // GCL info
  document.getElementById('tas-gcl-info').textContent = `${selectedDevice.name} Port ${document.getElementById('tas-port').value}`;

  // GCL table
  const tableBody = document.getElementById('tas-gcl-table');
  tableBody.innerHTML = DEFAULT_GCL.map((entry, idx) => {
    let cells = `<td style="text-align:center;font-weight:600">#${idx}</td>`;
    for (let tc = 0; tc < 8; tc++) {
      const isOpen = (entry.gateStates >> tc) & 1;
      cells += `<td class="${isOpen ? 'gate-open' : 'gate-closed'}">${isOpen ? '●' : '○'}</td>`;
    }
    cells += `<td style="text-align:right;font-family:monospace;color:#64748b">${(entry.timeInterval / 1000000).toFixed(0)}ms</td>`;
    return `<tr>${cells}</tr>`;
  }).join('');

  // Timeline
  const timeline = document.getElementById('tas-timeline');
  timeline.innerHTML = [0,1,2,3,4,5,6,7].map(tc => {
    const slots = DEFAULT_GCL.map((entry, slotIdx) => {
      const isOpen = (entry.gateStates >> tc) & 1;
      const widthPercent = (entry.timeInterval / 1000000000) * 100;
      const colors = ['#94a3b8', '#d4a574', '#c9b458', '#6bb38a', '#5aafb8', '#7393b3', '#9683a9', '#b8849a'];
      return `<div class="timeline-slot" style="width:${widthPercent}%;background:${isOpen ? colors[tc] : '#f5f5f5'};opacity:${isOpen ? 0.8 : 0.3}"></div>`;
    }).join('');
    return `
      <div class="timeline-row">
        <div class="timeline-label" style="color:${['#94a3b8', '#d4a574', '#c9b458', '#6bb38a', '#5aafb8', '#7393b3', '#9683a9', '#b8849a'][tc]}">TC${tc}</div>
        <div class="timeline-bar">${slots}</div>
        <div class="timeline-name">${tcNames[tc]}</div>
      </div>
    `;
  }).join('');
}

function runTASTest() {
  const btn = document.getElementById('tas-test-btn');
  const progress = document.getElementById('tas-progress');
  const progressFill = document.getElementById('tas-progress-fill');
  const progressValue = document.getElementById('tas-progress-value');
  const results = document.getElementById('tas-results');

  btn.disabled = true;
  btn.textContent = 'Running...';
  progress.style.display = 'block';
  results.style.display = 'none';

  const duration = 5000;
  const startTime = Date.now();

  const interval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const percent = Math.min(100, (elapsed / duration) * 100);
    progressFill.style.width = `${percent}%`;
    progressValue.textContent = `${percent.toFixed(0)}%`;

    if (percent >= 100) {
      clearInterval(interval);
      showTASResults();
      btn.disabled = false;
      btn.textContent = 'Start Test';
      progress.style.display = 'none';
    }
  }, 50);
}

function showTASResults() {
  const results = document.getElementById('tas-results');
  const tableBody = document.getElementById('tas-results-table');

  const data = [];
  for (let tc = 0; tc < 8; tc++) {
    const openSlots = DEFAULT_GCL.filter((_, idx) => (DEFAULT_GCL[idx].gateStates >> tc) & 1).length;
    const isAlwaysOpen = tc === 0;
    const isScheduled = openSlots > 0 && openSlots < 8;

    data.push({
      tc,
      txCount: 350 + Math.floor(Math.random() * 50),
      rxCount: 340 + Math.floor(Math.random() * 40),
      avgLatency: isAlwaysOpen ? 0.8 + Math.random() * 0.4 : isScheduled ? 50 + Math.random() * 75 : 0.5 + Math.random() * 0.3,
      maxLatency: isAlwaysOpen ? 2 + Math.random() * 1 : isScheduled ? 125 + Math.random() * 10 : 1.5 + Math.random() * 0.5,
      jitter: isAlwaysOpen ? 0.3 + Math.random() * 0.2 : isScheduled ? 5 + Math.random() * 10 : 0.2 + Math.random() * 0.1,
    });
  }

  const colors = ['#94a3b8', '#d4a574', '#c9b458', '#6bb38a', '#5aafb8', '#7393b3', '#9683a9', '#b8849a'];

  tableBody.innerHTML = data.map(d => {
    const isShaped = d.avgLatency > 10;
    return `
      <tr>
        <td><span class="tc-badge" style="background:${colors[d.tc]}">TC${d.tc}</span></td>
        <td style="color:#64748b">${tcNames[d.tc]}</td>
        <td style="text-align:right;font-family:monospace">${d.txCount}</td>
        <td style="text-align:right;font-family:monospace">${d.rxCount}</td>
        <td style="text-align:right;font-family:monospace">${d.avgLatency.toFixed(2)}ms</td>
        <td style="text-align:right;font-family:monospace">${d.maxLatency.toFixed(2)}ms</td>
        <td style="text-align:right;font-family:monospace">${d.jitter.toFixed(2)}ms</td>
        <td style="text-align:center"><span class="status-badge ${isShaped ? 'warning' : 'success'}">${isShaped ? 'Shaped' : 'Direct'}</span></td>
      </tr>
    `;
  }).join('');

  results.style.display = 'block';
}

// =====================================================
// CBS Dashboard
// =====================================================
function renderCBSDashboard() {
  // Queue info
  document.getElementById('cbs-queue-info').textContent = `${selectedDevice.name} Port ${document.getElementById('cbs-port').value}`;

  // Queue table
  const tableBody = document.getElementById('cbs-queue-table');
  tableBody.innerHTML = cbsQueues.map(q => `
    <tr>
      <td style="font-weight:500">Q${q.queue}</td>
      <td><span class="tc-badge tc${q.queue}">${q.tc}</span> ${q.name}</td>
      <td style="text-align:right;font-family:monospace">${q.cbs ? q.idleSlope.toLocaleString() : '-'}</td>
      <td style="text-align:right;font-family:monospace">${q.cbs ? q.sendSlope.toLocaleString() : '-'}</td>
      <td style="text-align:center"><span class="status-badge ${q.cbs ? 'success' : ''}" style="${q.cbs ? '' : 'background:#f1f5f9;color:#64748b'}">${q.cbs ? 'ON' : 'OFF'}</span></td>
    </tr>
  `).join('');

  // Bandwidth bars
  const bwBars = document.getElementById('cbs-bandwidth-bars');
  const bwData = [
    { label: 'TC5 (Voice)', percent: 25, color: '#7393b3' },
    { label: 'TC6 (Video)', percent: 37.5, color: '#9683a9' },
    { label: 'Best Effort', percent: 37.5, color: '#9ca3af' },
  ];
  bwBars.innerHTML = bwData.map(d => `
    <div class="bandwidth-row">
      <div class="bandwidth-label">${d.label}</div>
      <div class="bandwidth-bar">
        <div class="bandwidth-fill" style="width:${d.percent}%;background:${d.color}">${d.percent}%</div>
      </div>
      <div class="bandwidth-value">${(d.percent * 10).toFixed(0)} Mbps</div>
    </div>
  `).join('');

  drawCBSGraph();
}

function updateCBSCredits() {
  // Simulate credit fluctuation
  const tc5Credit = 50000 + (Math.random() - 0.5) * 100000;
  const tc6Credit = 75000 + (Math.random() - 0.5) * 150000;

  cbsCreditHistory.tc5.push(tc5Credit);
  cbsCreditHistory.tc6.push(tc6Credit);

  if (cbsCreditHistory.tc5.length > 200) cbsCreditHistory.tc5.shift();
  if (cbsCreditHistory.tc6.length > 200) cbsCreditHistory.tc6.shift();
}

function drawCBSGraph() {
  const canvas = document.getElementById('cbs-graph');
  if (!canvas) return;

  const { ctx, width, height } = setupCanvas(canvas, 900, 280);
  const padding = { top: 20, right: 20, bottom: 30, left: 60 };

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);

  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  // Grid
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (graphHeight * i / 4);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  // Y-axis labels
  ctx.fillStyle = '#64748b';
  ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'right';
  const maxCredit = 200000;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (graphHeight * i / 4);
    const value = maxCredit - (maxCredit * 2 * i / 4);
    ctx.fillText(`${(value/1000).toFixed(0)}K`, padding.left - 10, y + 4);
  }

  // Zero line
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  const zeroY = padding.top + graphHeight / 2;
  ctx.beginPath();
  ctx.moveTo(padding.left, zeroY);
  ctx.lineTo(width - padding.right, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw TC5 line
  if (cbsCreditHistory.tc5.length > 1) {
    ctx.strokeStyle = '#7393b3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    cbsCreditHistory.tc5.forEach((credit, i) => {
      const x = padding.left + (i / (cbsCreditHistory.tc5.length - 1)) * graphWidth;
      const normalized = (maxCredit - credit) / (maxCredit * 2);
      const y = padding.top + normalized * graphHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // Draw TC6 line
  if (cbsCreditHistory.tc6.length > 1) {
    ctx.strokeStyle = '#9683a9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    cbsCreditHistory.tc6.forEach((credit, i) => {
      const x = padding.left + (i / (cbsCreditHistory.tc6.length - 1)) * graphWidth;
      const normalized = (maxCredit - credit) / (maxCredit * 2);
      const y = padding.top + normalized * graphHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

function runCBSTest() {
  const btn = document.getElementById('cbs-test-btn');
  const progress = document.getElementById('cbs-progress');
  const progressFill = document.getElementById('cbs-progress-fill');
  const progressValue = document.getElementById('cbs-progress-value');
  const results = document.getElementById('cbs-results');

  btn.disabled = true;
  btn.textContent = 'Running...';
  progress.style.display = 'block';
  results.style.display = 'none';

  const duration = 5000;
  const startTime = Date.now();

  const interval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const percent = Math.min(100, (elapsed / duration) * 100);
    progressFill.style.width = `${percent}%`;
    progressValue.textContent = `${percent.toFixed(0)}%`;

    if (percent >= 100) {
      clearInterval(interval);
      showCBSResults();
      btn.disabled = false;
      btn.textContent = 'Start Test';
      progress.style.display = 'none';
    }
  }, 50);
}

function showCBSResults() {
  const results = document.getElementById('cbs-results');
  const grid = document.getElementById('cbs-results-grid');

  const bandwidth = parseFloat(document.getElementById('cbs-bandwidth').value) || 100;

  grid.innerHTML = `
    <div class="result-item">
      <div class="result-item-label">Achieved Rate</div>
      <div class="result-item-value">${(bandwidth * 0.95 + Math.random() * 5).toFixed(1)} Mbps</div>
    </div>
    <div class="result-item">
      <div class="result-item-label">Frame Loss</div>
      <div class="result-item-value" style="color:var(--success-color)">${(Math.random() * 0.1).toFixed(3)}%</div>
    </div>
    <div class="result-item">
      <div class="result-item-label">Avg Latency</div>
      <div class="result-item-value">${(0.5 + Math.random() * 0.5).toFixed(2)} ms</div>
    </div>
    <div class="result-item">
      <div class="result-item-label">Max Burst</div>
      <div class="result-item-value">${Math.floor(3000 + Math.random() * 500)} bytes</div>
    </div>
  `;

  results.style.display = 'block';
}

// =====================================================
// Device Status
// =====================================================
function renderDeviceStatus() {
  // Device cards
  const cardsContainer = document.getElementById('device-cards');
  cardsContainer.innerHTML = devices.map(device => `
    <div class="device-card ${selectedDevice.id === device.id ? 'active' : ''}" data-device="${device.id}">
      <div class="device-header">
        <div>
          <div class="device-name">${device.name}</div>
          <div class="device-type">${device.type}</div>
        </div>
        <span class="status-badge ${device.status === 'online' ? 'success' : 'error'}">${device.status === 'online' ? 'Online' : 'Offline'}</span>
      </div>
      <div class="device-info">
        <div>
          <div class="device-info-label">Role</div>
          <div class="device-info-value">${device.roleShort}</div>
        </div>
        <div>
          <div class="device-info-label">Uptime</div>
          <div class="device-info-value">${formatUptime(device.uptime)}</div>
        </div>
        <div>
          <div class="device-info-label">IP Address</div>
          <div class="device-info-value" style="font-family:monospace;font-size:0.75rem">${device.ip}</div>
        </div>
        <div>
          <div class="device-info-label">Ports</div>
          <div class="device-info-value">${device.ports} ports</div>
        </div>
      </div>
      <div class="device-footer">${device.mac}</div>
    </div>
  `).join('');

  cardsContainer.querySelectorAll('.device-card').forEach(card => {
    card.addEventListener('click', () => {
      selectedDevice = devices.find(d => d.id === card.dataset.device);
      renderDeviceStatus();
      renderBoardSelectors();
    });
  });

  // Topology
  const topology = document.getElementById('topology');
  topology.innerHTML = devices.map((device, idx) => {
    const isGM = device.roleShort === 'GM';
    const isBC = device.roleShort === 'BC';
    return `
      <div class="topology-node ${isGM ? 'gm' : ''}">
        <div class="topology-type">${device.type}</div>
        <div class="topology-name">${device.name}</div>
        <div class="topology-ip">${device.ip}</div>
        <div class="topology-role ${isGM ? 'gm' : isBC ? 'bc' : 'slave'}">${device.roleShort}</div>
      </div>
      ${idx < devices.length - 1 ? '<div class="topology-link"><div class="topology-line"></div><div class="topology-speed">1 Gbps</div></div>' : ''}
    `;
  }).join('');

  // Port status
  document.getElementById('port-status-board').textContent = selectedDevice.name;
  const portTable = document.getElementById('port-status-table');
  const ports = [];
  for (let i = 0; i < 9; i++) {
    const isUp = i < 6 || i === 8;
    ports.push({
      port: i + 1,
      isUp,
      rxBytes: isUp ? Math.floor(Math.random() * 1000000) + 500000 : 0,
      txBytes: isUp ? Math.floor(Math.random() * 800000) + 400000 : 0,
      rxPackets: isUp ? Math.floor(Math.random() * 1000) + 500 : 0,
      txPackets: isUp ? Math.floor(Math.random() * 800) + 400 : 0,
    });
  }

  portTable.innerHTML = ports.map(p => `
    <tr>
      <td style="font-weight:500">Port ${p.port}</td>
      <td><span class="link-status ${p.isUp ? 'up' : 'down'}"><span class="link-dot"></span>${p.isUp ? 'UP' : 'DOWN'}</span></td>
      <td style="font-family:monospace;font-size:0.75rem">${p.isUp ? '1000M' : '-'}</td>
      <td style="text-align:right;font-family:monospace;font-size:0.75rem">${p.isUp ? p.rxBytes.toLocaleString() : '-'}</td>
      <td style="text-align:right;font-family:monospace;font-size:0.75rem">${p.isUp ? p.txBytes.toLocaleString() : '-'}</td>
      <td style="text-align:right;font-family:monospace;font-size:0.75rem">${p.isUp ? p.rxPackets.toLocaleString() : '-'}</td>
      <td style="text-align:right;font-family:monospace;font-size:0.75rem">${p.isUp ? p.txPackets.toLocaleString() : '-'}</td>
      <td style="font-size:0.75rem;color:${p.port === 9 ? 'var(--success-color)' : p.isUp ? 'var(--text-secondary)' : 'var(--text-secondary)'}">${p.port === 9 ? 'Master' : p.isUp ? 'Slave' : '-'}</td>
    </tr>
  `).join('');
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// =====================================================
// Update Displays
// =====================================================
function updateDisplays() {
  if (currentPage === 'ptp') {
    renderPTPDashboard();
  } else if (currentPage === 'tas') {
    renderTASDashboard();
  } else if (currentPage === 'cbs') {
    renderCBSDashboard();
  } else if (currentPage === 'devices') {
    renderDeviceStatus();
  }
}

// =====================================================
// Initialization
// =====================================================
function init() {
  initNavigation();
  renderBoardSelectors();

  // Initial data
  updatePTPData();
  updateCBSCredits();
  updateDisplays();

  // Event listeners
  document.getElementById('tas-test-btn').addEventListener('click', runTASTest);
  document.getElementById('cbs-test-btn').addEventListener('click', runCBSTest);

  document.getElementById('tas-port').addEventListener('change', renderTASDashboard);
  document.getElementById('cbs-port').addEventListener('change', renderCBSDashboard);

  // TAS toggle
  let tasEnabled = true;
  document.getElementById('tas-toggle').addEventListener('click', () => {
    tasEnabled = !tasEnabled;
    document.getElementById('tas-status').textContent = tasEnabled ? 'Enabled' : 'Disabled';
    document.getElementById('tas-status').className = `status-badge ${tasEnabled ? 'success' : ''}`;
    if (!tasEnabled) document.getElementById('tas-status').style.cssText = 'background:#f1f5f9;color:#64748b';
    else document.getElementById('tas-status').style.cssText = '';
    document.getElementById('tas-toggle').textContent = tasEnabled ? 'Disable' : 'Enable';
  });

  // Update loops
  setInterval(() => {
    updatePTPData();
    updateCBSCredits();
    if (currentPage === 'ptp') renderPTPDashboard();
    if (currentPage === 'cbs') drawCBSGraph();
  }, 125); // 8Hz

  // Update device uptime
  setInterval(() => {
    devices.forEach(d => d.uptime++);
    if (currentPage === 'devices') renderDeviceStatus();
  }, 1000);
}

// Start
document.addEventListener('DOMContentLoaded', init);
