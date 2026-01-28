// KETI TSN UI Simulation - Realistic Mode
// ===========================================

// Configuration
const CONFIG = {
  tcColors: ['#94a3b8', '#64748b', '#475569', '#334155', '#1e3a5f', '#1e40af', '#3730a3', '#4c1d95'],
  tcColorsBright: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'],
  linkSpeed: 1000000, // 1 Gbps in kbps
  linkSpeedBits: 1000000000, // 1 Gbps in bits
  packetSize: 64, // bytes
  packetBits: 512, // 64 * 8 bits
  maxFrameSize: 1522, // bytes (max ethernet frame)
  maxFrameBits: 12176, // 1522 * 8 bits
  boards: [
    { id: 1, name: 'LAN9662 #1', device: '/dev/ttyACM0', mac: 'AA:BB:CC:DD:EE:01', ports: 12 },
    { id: 2, name: 'LAN9662 #2', device: '/dev/ttyACM1', mac: 'AA:BB:CC:DD:EE:02', ports: 12 },
    { id: 3, name: 'LAN9662 #3', device: '/dev/ttyACM2', mac: 'AA:BB:CC:DD:EE:03', ports: 12 },
  ]
};

// Global State
const state = {
  currentPage: 'ptp-dashboard',
  ptp: {
    enabled: true,
    gmBoard: 0,
    offsetHistory: [],
    running: false
  },
  tas: {
    enabled: true,
    cycleTime: 1000, // ms
    port: 8,
    gcl: Array(8).fill(null).map((_, i) => ({ tc: i, gates: (1 << i) | 1, time: 125 })),
    testRunning: false,
    selectedTCs: [1, 2, 3, 4, 5, 6, 7],
    txHistory: [],
    rxHistory: []
  },
  cbs: {
    port: 8,
    idleSlope: {0: 1000000, 1: 500, 2: 1000, 3: 2000, 4: 5000, 5: 10000, 6: 20000, 7: 50000},
    testRunning: true, // Auto-start
    selectedTCs: [1, 2, 3, 4, 5, 6, 7],
    monitorTCs: [1, 2, 3, 4, 5, 6, 7],
    creditHistory: [],
    credit: {}, // Current credit per TC
    queueDepth: {}, // Packets waiting per TC
    pps: 10000,
    duration: 999999 // Continuous
  },
  traffic: {
    running: false,
    stats: {}
  },
  capture: {
    running: false,
    packets: [],
    stats: {}
  }
};

// Simulation Intervals
let simIntervals = {};

// ===========================================
// Navigation
// ===========================================
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      navigateTo(page);
    });
  });

  // Handle hash navigation
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1);
    if (hash) navigateTo(hash);
  });

  // Initial page
  const hash = window.location.hash.slice(1) || 'ptp-dashboard';
  navigateTo(hash);
}

function navigateTo(page) {
  state.currentPage = page;

  // Update nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  // Update pages
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) {
    pageEl.style.display = 'block';
    renderPage(page);
  }

  window.location.hash = page;
}

function renderPage(page) {
  const el = document.getElementById('page-' + page);
  switch(page) {
    case 'ptp-dashboard': renderPTPDashboard(el); break;
    case 'tas-dashboard': renderTASDashboard(el); break;
    case 'cbs-dashboard': renderCBSDashboard(el); break;
    case 'ptp-config': renderPTPConfig(el); break;
    case 'tas-config': renderTASConfig(el); break;
    case 'cbs-config': renderCBSConfig(el); break;
    case 'ports': renderPorts(el); break;
    case 'capture': renderCapture(el); break;
    case 'traffic': renderTraffic(el); break;
    case 'settings': renderSettings(el); break;
  }
}

// ===========================================
// PTP Dashboard
// ===========================================
function renderPTPDashboard(el) {
  const boards = CONFIG.boards;
  const gmIdx = state.ptp.gmBoard;

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">PTP Dashboard</h1>
        <p class="page-description">IEEE 802.1AS Time Synchronization Monitor</p>
      </div>
      <div class="header-right">
        <span class="status-badge ${state.ptp.enabled ? 'success' : 'neutral'}">${state.ptp.enabled ? 'PTP Active' : 'PTP Disabled'}</span>
        <button class="btn btn-secondary" onclick="refreshPTP()">Refresh</button>
        <button class="btn btn-primary" onclick="togglePTPSim()">${state.ptp.running ? 'Stop' : 'Start'} Simulation</button>
      </div>
    </div>

    <!-- Metrics -->
    <div class="metrics-grid">
      ${[
        { label: 'Grandmaster', value: boards[gmIdx].name, sub: 'Board ' + boards[gmIdx].id },
        { label: 'Offset', value: (state.ptp.offsetHistory[state.ptp.offsetHistory.length-1]?.offset || 0).toFixed(0) + ' ns', cls: 'success' },
        { label: 'Sync Rate', value: '8', sub: 'messages/sec' },
        { label: 'Domains', value: '1', sub: 'Domain 0' }
      ].map(m => `
        <div class="metric-card">
          <div class="metric-label">${m.label}</div>
          <div class="metric-value ${m.cls || ''}">${m.value}</div>
          ${m.sub ? `<div class="metric-unit">${m.sub}</div>` : ''}
        </div>
      `).join('')}
    </div>

    <!-- Topology -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">Network Topology</div>
        <div class="legend">
          <div class="legend-item"><div class="legend-color" style="background:#059669"></div> Grandmaster</div>
          <div class="legend-item"><div class="legend-color" style="background:#0284c7"></div> Slave</div>
        </div>
      </div>
      <div class="topology">
        ${boards.map((b, i) => `
          ${i > 0 ? `
            <div class="topology-link">
              <div class="topology-port">P8</div>
              <div class="topology-line connected"></div>
              <div class="topology-port">P1</div>
            </div>
          ` : ''}
          <div class="topology-node ${i === gmIdx ? 'gm' : 'slave'}">
            <div class="topology-type">Board ${b.id}</div>
            <div class="topology-name">${b.name}</div>
            <div class="topology-mac">${b.mac}</div>
            <div class="topology-role ${i === gmIdx ? 'gm' : 'slave'}">${i === gmIdx ? 'GRANDMASTER' : 'SLAVE'}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Offset Graph -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">Time Offset History</div>
        <span class="status-badge info">Last 60 samples</span>
      </div>
      <canvas id="ptp-offset-canvas" height="250"></canvas>
    </div>

    <!-- Board Details -->
    <div class="grid-3">
      ${boards.map((b, i) => `
        <div class="card">
          <div class="card-header">
            <div class="card-title">${b.name}</div>
            <span class="status-badge ${i === gmIdx ? 'success' : 'info'}">${i === gmIdx ? 'GM' : 'SLAVE'}</span>
          </div>
          <div class="grid-2" style="gap:12px">
            <div class="stat-box">
              <div class="stat-label">Clock ID</div>
              <div class="stat-value">${b.mac.replace(/:/g, '-')}</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">Priority</div>
              <div class="stat-value">${i === gmIdx ? '128' : '255'}</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">Port State</div>
              <div class="stat-value ${i === gmIdx ? '' : 'success'}">${i === gmIdx ? 'Master' : 'Slave'}</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">Offset</div>
              <div class="stat-value">${i === gmIdx ? '0' : (state.ptp.offsetHistory[state.ptp.offsetHistory.length-1]?.offset || Math.random() * 100).toFixed(0)} ns</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  drawPTPGraph();
}

function togglePTPSim() {
  state.ptp.running = !state.ptp.running;
  if (state.ptp.running) {
    state.ptp.offsetHistory = [];
    simIntervals.ptp = setInterval(() => {
      const offset = Math.sin(Date.now() / 2000) * 30 + (Math.random() - 0.5) * 20;
      state.ptp.offsetHistory.push({ time: Date.now(), offset });
      if (state.ptp.offsetHistory.length > 60) state.ptp.offsetHistory.shift();
      if (state.currentPage === 'ptp-dashboard') drawPTPGraph();
    }, 500);
  } else {
    clearInterval(simIntervals.ptp);
  }
  renderPage('ptp-dashboard');
}

function refreshPTP() {
  renderPage('ptp-dashboard');
}

function drawPTPGraph() {
  const canvas = document.getElementById('ptp-offset-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth;
  const h = canvas.height = 250;
  const pad = { top: 30, right: 20, bottom: 40, left: 60 };

  ctx.clearRect(0, 0, w, h);

  const data = state.ptp.offsetHistory;
  if (data.length < 2) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Start simulation to see data', w/2, h/2);
    return;
  }

  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const maxOffset = Math.max(50, ...data.map(d => Math.abs(d.offset))) * 1.2;

  // Grid
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();

    const val = maxOffset - (maxOffset * 2 / 4) * i;
    ctx.fillStyle = '#64748b';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(0) + ' ns', pad.left - 8, y + 4);
  }

  // Zero line
  const zeroY = pad.top + chartH / 2;
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad.left, zeroY);
  ctx.lineTo(w - pad.right, zeroY);
  ctx.stroke();

  // Data line
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = pad.left + (i / (data.length - 1)) * chartW;
    const y = pad.top + chartH / 2 - (d.offset / maxOffset) * (chartH / 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Fill
  ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
  ctx.lineTo(pad.left + chartW, zeroY);
  ctx.lineTo(pad.left, zeroY);
  ctx.closePath();
  ctx.fill();

  // X axis labels
  ctx.fillStyle = '#64748b';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i <= 6; i++) {
    const x = pad.left + (chartW / 6) * i;
    ctx.fillText(`-${60 - i * 10}s`, x, h - 10);
  }

  // Title
  ctx.fillStyle = '#334155';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Time Offset (ns)', pad.left, 16);
}

// ===========================================
// TAS Dashboard
// ===========================================
function renderTASDashboard(el) {
  const cycleMs = state.tas.cycleTime;
  const slotTime = cycleMs / 8;

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">TAS Dashboard</h1>
        <p class="page-description">Time-Aware Shaper (802.1Qbv) Monitor</p>
      </div>
      <div class="header-right">
        <span class="status-badge ${state.tas.enabled ? 'success' : 'neutral'}">${state.tas.enabled ? 'TAS Active' : 'TAS Disabled'}</span>
        <button class="btn btn-secondary" onclick="toggleTASEnabled()">${state.tas.enabled ? 'Disable' : 'Enable'}</button>
        <button class="btn btn-primary" onclick="configureTAS()">Configure</button>
      </div>
    </div>

    <!-- Status Bar -->
    <div class="grid-6" style="margin-bottom:24px">
      ${[
        { label: 'PORT', value: state.tas.port },
        { label: 'TAS', value: state.tas.enabled ? 'ENABLED' : 'DISABLED', cls: state.tas.enabled ? 'success' : '' },
        { label: 'CYCLE', value: cycleMs + ' ms' },
        { label: 'GUARD', value: '256 ns' },
        { label: 'SLOTS', value: '8' },
        { label: 'SLOT TIME', value: slotTime.toFixed(1) + ' ms' }
      ].map(s => `
        <div class="stat-box">
          <div class="stat-label">${s.label}</div>
          <div class="stat-value ${s.cls || ''}">${s.value}</div>
        </div>
      `).join('')}
    </div>

    <!-- TX/RX Raster Graphs -->
    <div class="grid-2">
      <div class="card">
        <div class="card-header">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:10px;height:10px;border-radius:50%;background:#3b82f6"></div>
            <span class="card-title">TX - Transmitted</span>
          </div>
          <span style="font-size:0.7rem;color:#64748b;font-family:monospace">${state.tas.txHistory.reduce((s,d) => s + Object.values(d.tc).reduce((a,b)=>a+b,0), 0)} pkts</span>
        </div>
        <canvas id="tas-tx-canvas" height="200"></canvas>
      </div>
      <div class="card">
        <div class="card-header">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:10px;height:10px;border-radius:50%;background:#10b981"></div>
            <span class="card-title">RX - Received (Shaped)</span>
          </div>
          <span style="font-size:0.7rem;color:#64748b;font-family:monospace">${state.tas.rxHistory.reduce((s,d) => s + Object.values(d.tc).reduce((a,b)=>a+b,0), 0)} pkts</span>
        </div>
        <canvas id="tas-rx-canvas" height="200"></canvas>
      </div>
    </div>

    <!-- GCL Heatmaps -->
    <div class="grid-2">
      <div class="card">
        <div class="card-header">
          <span class="card-title">Configured GCL</span>
          <span class="status-badge ${state.tas.enabled ? 'success' : 'neutral'}">${state.tas.enabled ? 'ACTIVE' : 'INACTIVE'}</span>
        </div>
        ${renderGCLHeatmap(state.tas.gcl, true)}
        <div style="margin-top:8px;font-size:0.65rem;color:#64748b;font-family:monospace">
          Cycle: ${cycleMs}ms | Guard: 256ns
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">Observed RX Traffic (Analysis)</span>
          <span class="status-badge ${state.tas.rxHistory.length > 0 ? 'success' : 'neutral'}">${state.tas.rxHistory.length > 0 ? 'LIVE' : 'WAITING'}</span>
        </div>
        <div id="predicted-gcl-container">
          ${state.tas.rxHistory.length > 0 ? renderPredictedGCL() : '<div style="padding:40px;text-align:center;color:#94a3b8">Run traffic test to see slot-based analysis</div>'}
        </div>
      </div>
    </div>

    <!-- Traffic Test -->
    <div class="card">
      <div class="card-header">
        <div style="display:flex;align-items:center;gap:12px">
          <span class="card-title">Traffic Test</span>
          <span class="status-badge success">Ready</span>
        </div>
        <div style="display:flex;gap:8px">
          ${state.tas.testRunning ?
            '<button class="btn btn-danger" onclick="stopTASTest()">Stop</button>' :
            '<button class="btn btn-primary" onclick="startTASTest()">Start</button>'}
          <button class="btn btn-secondary" onclick="clearTASTest()">Clear</button>
        </div>
      </div>

      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
        ${[0,1,2,3,4,5,6,7].map(tc => `
          <button class="tc-btn tc${tc} ${state.tas.selectedTCs.includes(tc) ? 'active' : ''}"
            onclick="toggleTASTc(${tc})" ${state.tas.testRunning ? 'disabled' : ''}>TC${tc}</button>
        `).join('')}
      </div>

      <div class="form-row" style="margin-bottom:16px">
        <div>
          <label class="form-label">VLAN ID</label>
          <input type="number" class="form-input" value="100" id="tas-vlan">
        </div>
        <div>
          <label class="form-label">PPS/TC</label>
          <input type="number" class="form-input" value="100" id="tas-pps">
        </div>
        <div>
          <label class="form-label">Duration (s)</label>
          <input type="number" class="form-input" value="7" id="tas-duration">
        </div>
        <div>
          <label class="form-label">Total PPS</label>
          <div class="stat-box"><div class="stat-value" id="tas-total-pps">${100 * state.tas.selectedTCs.length}</div></div>
        </div>
      </div>
    </div>

    <!-- Results Table -->
    ${state.tas.rxHistory.length > 0 ? renderTASResults() : ''}
  `;

  drawTASRasterGraph('tas-tx-canvas', state.tas.txHistory, '#3b82f6');
  drawTASRasterGraph('tas-rx-canvas', state.tas.rxHistory, '#10b981');
}

function renderGCLHeatmap(gcl, isConfig) {
  let html = '<div style="display:grid;grid-template-columns:50px repeat(8, 1fr);gap:2px">';
  html += '<div></div>';
  for (let tc = 0; tc < 8; tc++) {
    html += `<div style="text-align:center;font-size:0.65rem;font-weight:600;color:${CONFIG.tcColors[tc]};padding:4px 0">TC${tc}</div>`;
  }

  for (let slot = 0; slot < 8; slot++) {
    html += `<div style="font-size:0.6rem;color:#64748b;display:flex;align-items:center;font-family:monospace">S${slot}</div>`;
    for (let tc = 0; tc < 8; tc++) {
      const open = isConfig ? ((gcl[slot]?.gates >> tc) & 1) : false;
      html += `<div class="gcl-cell ${open ? 'open' : 'closed'}" style="${open ? 'background:'+CONFIG.tcColors[tc]+';opacity:0.85' : ''}">${open ? 'O' : '-'}</div>`;
    }
  }
  html += '</div>';
  return html;
}

function renderPredictedGCL() {
  // Calculate actual RX packets per slot from history
  const slotData = {};
  for (let slot = 0; slot < 8; slot++) {
    slotData[slot] = {};
    for (let tc = 0; tc < 8; tc++) {
      slotData[slot][tc] = 0;
    }
  }

  // Aggregate RX packets by slot (based on when they were received)
  const cycleTime = state.tas.cycleTime;
  const slotDuration = cycleTime / 8;
  state.tas.rxHistory.forEach(entry => {
    const slot = Math.floor((entry.time % cycleTime) / slotDuration);
    for (let tc = 0; tc < 8; tc++) {
      if (entry.tc[tc]) {
        slotData[slot][tc] += entry.tc[tc];
      }
    }
  });

  // Find max for intensity calculation
  let maxCount = 1;
  for (let slot = 0; slot < 8; slot++) {
    for (let tc = 0; tc < 8; tc++) {
      if (slotData[slot][tc] > maxCount) maxCount = slotData[slot][tc];
    }
  }

  let html = '<div style="display:grid;grid-template-columns:50px repeat(8, 1fr);gap:2px">';
  html += '<div></div>';
  for (let tc = 0; tc < 8; tc++) {
    html += `<div style="text-align:center;font-size:0.65rem;font-weight:600;color:${CONFIG.tcColors[tc]};padding:4px 0">TC${tc}</div>`;
  }

  for (let slot = 0; slot < 8; slot++) {
    html += `<div style="font-size:0.6rem;color:#64748b;display:flex;align-items:center;font-family:monospace">S${slot}</div>`;
    for (let tc = 0; tc < 8; tc++) {
      const count = slotData[slot][tc];
      const intensity = Math.min(count / maxCount, 1);
      const hasData = count > 0;
      const isExpectedSlot = state.tas.gcl[slot] && ((state.tas.gcl[slot].gates >> tc) & 1);

      if (hasData) {
        const bgColor = isExpectedSlot ? '#059669' : '#d97706'; // Green if matches GCL, yellow if unexpected
        html += `<div class="gcl-cell" style="background:${bgColor};opacity:${0.4 + intensity * 0.6};color:#fff;font-weight:600">${count}</div>`;
      } else {
        html += `<div class="gcl-cell" style="background:#f3f4f6;border:1px solid #e2e8f0;color:#94a3b8">-</div>`;
      }
    }
  }
  html += '</div>';
  html += '<div style="margin-top:8px;font-size:0.65rem;color:#64748b"><span style="color:#059669">■</span> GATED (Expected Slot) &nbsp; <span style="color:#d97706">■</span> FREE (Unexpected)</div>';
  return html;
}

function renderTASResults() {
  const cycleMs = state.tas.cycleTime;
  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Analysis Results</span>
        <span class="status-badge success">Complete</span>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>TC</th>
            <th style="text-align:right">TX</th>
            <th style="text-align:right">RX</th>
            <th style="text-align:right">Avg Interval</th>
            <th style="text-align:right">Expected</th>
            <th style="text-align:center">Slot</th>
            <th style="text-align:center">Status</th>
          </tr>
        </thead>
        <tbody>
          ${state.tas.selectedTCs.map(tc => {
            const txTotal = state.tas.txHistory.reduce((s,d) => s + (d.tc[tc]||0), 0);
            const rxTotal = state.tas.rxHistory.reduce((s,d) => s + (d.tc[tc]||0), 0);
            const avgInterval = state.tas.enabled ? cycleMs : 10;
            const isGated = state.tas.enabled;
            return `
              <tr>
                <td><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${CONFIG.tcColors[tc]};margin-right:6px"></span><strong>TC${tc}</strong></td>
                <td style="text-align:right;font-family:monospace">${txTotal}</td>
                <td style="text-align:right;font-family:monospace;font-weight:600">${rxTotal}</td>
                <td style="text-align:right;font-family:monospace">${avgInterval.toFixed(2)} ms</td>
                <td style="text-align:right;font-family:monospace;color:#64748b">~${cycleMs} ms</td>
                <td style="text-align:center"><span style="padding:2px 6px;border-radius:3px;font-size:0.7rem;background:#f3f4f6;font-family:monospace">S${tc}</span></td>
                <td style="text-align:center"><span class="status-badge ${isGated ? 'success' : 'warning'}">${isGated ? 'GATED' : 'FREE'}</span></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function drawTASRasterGraph(canvasId, data, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth;
  const h = canvas.height = 200;
  const pad = { top: 16, right: 16, bottom: 32, left: 45 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const rowH = chartH / 8;

  ctx.clearRect(0, 0, w, h);

  // TC rows
  for (let tc = 0; tc < 8; tc++) {
    const y = pad.top + tc * rowH;
    ctx.fillStyle = state.tas.selectedTCs.includes(tc) ? CONFIG.tcColors[tc] + '10' : '#fafafa';
    ctx.fillRect(pad.left, y, chartW, rowH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(pad.left, y, chartW, rowH);

    ctx.fillStyle = state.tas.selectedTCs.includes(tc) ? CONFIG.tcColors[tc] : '#94a3b8';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('TC' + tc, pad.left - 6, y + rowH/2 + 3);
  }

  // X axis grid
  const maxTime = 9000;
  for (let t = 0; t <= maxTime; t += 1000) {
    const x = pad.left + (t / maxTime) * chartW;
    ctx.strokeStyle = '#e2e8f0';
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, h - pad.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#64748b';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((t/1000) + 's', x, h - pad.bottom + 12);
  }

  // Data bars
  const barW = Math.max(chartW / (maxTime / 500) - 2, 4);
  data.forEach(d => {
    const x = pad.left + (d.time / maxTime) * chartW;
    [0,1,2,3,4,5,6,7].forEach(tc => {
      const count = d.tc[tc] || 0;
      if (count === 0) return;
      const y = pad.top + tc * rowH + 1;
      const maxPkts = 50;
      const intensity = Math.min(count / maxPkts, 1);
      ctx.fillStyle = CONFIG.tcColors[tc];
      ctx.globalAlpha = 0.4 + intensity * 0.6;
      ctx.fillRect(x - barW/2, y, barW, rowH - 2);
      ctx.globalAlpha = 1;
    });
  });

  // Border
  ctx.strokeStyle = '#e2e8f0';
  ctx.strokeRect(pad.left, pad.top, chartW, chartH);
}

function toggleTASTc(tc) {
  if (state.tas.testRunning) return;
  const idx = state.tas.selectedTCs.indexOf(tc);
  if (idx > -1) state.tas.selectedTCs.splice(idx, 1);
  else state.tas.selectedTCs.push(tc);
  state.tas.selectedTCs.sort((a,b) => a-b);
  renderPage('tas-dashboard');
}

function toggleTASEnabled() {
  state.tas.enabled = !state.tas.enabled;
  renderPage('tas-dashboard');
}

function configureTAS() {
  state.tas.enabled = true;
  renderPage('tas-dashboard');
}

function startTASTest() {
  state.tas.testRunning = true;
  state.tas.txHistory = [];
  state.tas.rxHistory = [];
  state.tas.rxSlotAccum = {}; // Accumulated packets per TC waiting for their slot
  state.tas.selectedTCs.forEach(tc => { state.tas.rxSlotAccum[tc] = 0; });

  const pps = parseInt(document.getElementById('tas-pps')?.value) || 100;
  const duration = parseInt(document.getElementById('tas-duration')?.value) || 7;
  const maxTime = (duration + 2) * 1000;
  const cycleTime = state.tas.cycleTime;
  const slotDuration = cycleTime / 8;
  let elapsed = 0;

  simIntervals.tas = setInterval(() => {
    elapsed += 100; // 100ms intervals for smoother visualization
    if (elapsed > maxTime) {
      stopTASTest();
      return;
    }

    const txEntry = { time: elapsed, tc: {} };
    const rxEntry = { time: elapsed, tc: {} };

    state.tas.selectedTCs.forEach(tc => {
      // TX: Packets are generated uniformly
      const txPackets = Math.round((pps / state.tas.selectedTCs.length) * 0.1 * (0.8 + Math.random() * 0.4));
      txEntry.tc[tc] = txPackets;

      if (state.tas.enabled) {
        // IEEE 802.1Qbv TAS: Packets wait in queue until gate opens
        // Accumulate incoming packets
        state.tas.rxSlotAccum[tc] = (state.tas.rxSlotAccum[tc] || 0) + txPackets;

        // Find which slot this TC's gate is open in
        const gclSlot = state.tas.gcl.findIndex(entry => (entry.gates >> tc) & 1);

        // Calculate current position in cycle
        const cyclePosition = elapsed % cycleTime;
        const currentSlot = Math.floor(cyclePosition / slotDuration);

        // RX: Packets only transmitted when gate is open (in correct slot)
        if (currentSlot === gclSlot || (gclSlot === -1 && ((state.tas.gcl[0]?.gates >> tc) & 1))) {
          // Gate is open! Release accumulated packets
          const releasedPackets = state.tas.rxSlotAccum[tc];
          // Apply guard band loss (~5%)
          const guardBandLoss = Math.random() < 0.05 ? 1 : 0;
          rxEntry.tc[tc] = Math.max(0, releasedPackets - guardBandLoss);
          state.tas.rxSlotAccum[tc] = 0;
        } else {
          // Gate closed - packets wait in queue
          rxEntry.tc[tc] = 0;
        }
      } else {
        // TAS disabled: all traffic passes through immediately
        rxEntry.tc[tc] = txPackets;
      }
    });

    state.tas.txHistory.push(txEntry);
    state.tas.rxHistory.push(rxEntry);

    // Keep last 100 entries
    if (state.tas.txHistory.length > 100) state.tas.txHistory.shift();
    if (state.tas.rxHistory.length > 100) state.tas.rxHistory.shift();

    if (state.currentPage === 'tas-dashboard') {
      drawTASRasterGraph('tas-tx-canvas', state.tas.txHistory, '#3b82f6');
      drawTASRasterGraph('tas-rx-canvas', state.tas.rxHistory, '#10b981');
      // Update predicted GCL heatmap
      updatePredictedGCLHeatmap();
    }
  }, 100);

  renderPage('tas-dashboard');
}

function updatePredictedGCLHeatmap() {
  const el = document.getElementById('predicted-gcl-container');
  if (el) {
    el.innerHTML = renderPredictedGCL();
  }
}

function stopTASTest() {
  state.tas.testRunning = false;
  clearInterval(simIntervals.tas);
  renderPage('tas-dashboard');
}

function clearTASTest() {
  state.tas.txHistory = [];
  state.tas.rxHistory = [];
  renderPage('tas-dashboard');
}

// ===========================================
// CBS Dashboard
// ===========================================
function renderCBSDashboard(el) {
  const formatBw = (kbps) => {
    if (kbps >= 1000000) return (kbps / 1000000).toFixed(1) + 'Gbps';
    if (kbps >= 1000) return (kbps / 1000).toFixed(1) + 'Mbps';
    return Math.round(kbps) + 'kbps';
  };

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">CBS Dashboard</h1>
        <p class="page-description">Credit-Based Shaper (IEEE 802.1Qav) Real-Time Monitor</p>
      </div>
      <div class="header-right">
        <span class="status-badge ${state.cbs.testRunning ? 'success' : 'neutral'}">${state.cbs.testRunning ? 'LIVE' : 'STOPPED'}</span>
        <button class="btn btn-secondary" onclick="resetCBS()">Reset Slopes</button>
      </div>
    </div>

    <!-- Real-time Status Cards -->
    <div class="card" style="margin-bottom:16px;background:linear-gradient(135deg, #1e293b 0%, #334155 100%)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="color:#fff;font-weight:600;font-size:0.9rem">Real-Time Credit Status (TC1-TC7)</span>
        <span style="color:#94a3b8;font-size:0.75rem;font-family:monospace">IEEE 802.1Qav Credit-Based Shaper</span>
      </div>
      <div id="cbs-status-cards" style="display:flex;gap:8px;flex-wrap:wrap">
        ${state.cbs.monitorTCs.map(tc => {
          const latest = state.cbs.creditHistory[state.cbs.creditHistory.length - 1];
          const currentCredit = latest?.credit?.[tc] || 0;
          const isShaping = currentCredit < 0;
          return `
            <div style="padding:12px 16px;border-radius:8px;font-family:monospace;background:${isShaping ? '#fef2f2' : '#f0fdf4'};border:3px solid ${CONFIG.tcColorsBright[tc]};min-width:120px;flex:1;max-width:140px">
              <div style="color:${CONFIG.tcColorsBright[tc]};font-weight:700;font-size:1rem">TC${tc}</div>
              <div style="font-size:1.1rem;font-weight:700;color:${isShaping ? '#dc2626' : '#334155'};margin-top:4px">${Math.round(currentCredit)} bits</div>
              <div style="font-size:0.7rem;color:#64748b;margin-top:2px">Queue: 0 pkts</div>
              <div style="font-size:0.7rem;color:#64748b">Slope: ${(state.cbs.idleSlope[tc]/1000).toFixed(0)}Mbps</div>
              <div style="font-size:0.75rem;margin-top:4px;font-weight:600;color:${isShaping ? '#dc2626' : '#059669'}">${isShaping ? 'SHAPING' : 'OK'}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Connection Info -->
    <div class="grid-4" style="margin-bottom:24px">
      ${[
        { label: 'Board', value: CONFIG.boards[0].name, sub: CONFIG.boards[0].device },
        { label: 'CBS Port', value: 'Port ' + state.cbs.port },
        { label: 'Traffic Rate', value: formatBw(state.cbs.pps * CONFIG.packetSize * 8 / 1000), sub: state.cbs.pps + ' pps' },
        { label: 'Status', value: state.cbs.testRunning ? 'Monitoring' : 'Stopped', ok: state.cbs.testRunning }
      ].map((item, i) => `
        <div class="card" style="margin-bottom:0">
          <div class="stat-label">${item.label}</div>
          <div class="stat-value" style="margin-top:4px;color:${item.ok ? '#059669' : '#334155'}">${item.value}</div>
          ${item.sub ? `<div style="font-size:0.75rem;color:#64748b;margin-top:4px">${item.sub}</div>` : ''}
        </div>
      `).join('')}
    </div>

    <!-- Idle Slope Table -->
    <div class="card">
      <div class="card-header">
        <div style="display:flex;align-items:center;gap:12px">
          <span class="card-title">Idle Slope Settings (TC Bandwidth Limits)</span>
          <span class="status-badge success">CONNECTED</span>
        </div>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>TC</th>
            <th style="width:150px">Idle Slope (kbps)</th>
            <th style="text-align:center">Bandwidth</th>
            <th style="text-align:center">Traffic Rate</th>
            <th style="text-align:center">Status</th>
          </tr>
        </thead>
        <tbody>
          ${[0,1,2,3,4,5,6,7].map(tc => {
            const slope = state.cbs.idleSlope[tc];
            const isTraffic = state.cbs.selectedTCs.includes(tc);
            const ppsPerTc = state.cbs.pps / (state.cbs.selectedTCs.length || 1);
            const trafficKbps = isTraffic ? ppsPerTc * CONFIG.packetSize * 8 / 1000 : 0;
            const willShape = slope < CONFIG.linkSpeed && trafficKbps > slope;
            return `
              <tr>
                <td><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${CONFIG.tcColorsBright[tc]};margin-right:8px"></span><strong>TC${tc}</strong></td>
                <td><input type="number" class="form-input" value="${slope}" data-tc="${tc}" onchange="updateIdleSlope(${tc}, this.value)" style="text-align:right"></td>
                <td style="text-align:center;font-family:monospace;font-weight:600">${formatBw(slope)}</td>
                <td style="text-align:center;font-family:monospace">${trafficKbps > 0 ? formatBw(trafficKbps) : '-'}</td>
                <td style="text-align:center">${trafficKbps > 0 ? `<span class="status-badge ${willShape ? 'error' : 'success'}">${willShape ? 'SHAPING' : 'OK'}</span>` : '-'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- Credit Graph -->
    <div class="card">
      <div class="card-header">
        <div>
          <span class="card-title">Credit Time-Series Graph</span>
          <div style="font-size:0.75rem;color:#64748b;margin-top:4px">Y-axis: Credit (bits) | X-axis: Time (ms) | <span style="color:#dc2626;font-weight:600">Red Zone = Shaping (Credit &lt; 0)</span></div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" onclick="clearCBS()">Clear Graph</button>
        </div>
      </div>
      <canvas id="cbs-credit-canvas" height="400" style="margin-top:12px"></canvas>
    </div>

    <!-- Traffic TC Selection -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">Traffic Generator Settings</span>
      </div>
      <div class="section">
        <div class="section-title">Send Traffic to TCs (simulated incoming packets)</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
          ${[1,2,3,4,5,6,7].map(tc => `
            <button class="tc-btn tc${tc} ${state.cbs.selectedTCs.includes(tc) ? 'active' : ''}"
              onclick="toggleCBSTc('selected', ${tc}); runCBSSimulation()">TC${tc}</button>
          `).join('')}
        </div>
        <div style="font-size:0.75rem;color:#64748b;margin-top:8px">
          Selected TCs receive simulated traffic at ${Math.round(state.cbs.pps / state.cbs.selectedTCs.length)} pps each (total ${state.cbs.pps} pps)
        </div>
      </div>

      <div class="form-row" style="margin-top:16px">
        <div>
          <label class="form-label">Total PPS</label>
          <input type="number" class="form-input" value="${state.cbs.pps}" id="cbs-pps"
            onchange="state.cbs.pps = parseInt(this.value) || 5000; runCBSSimulation()">
        </div>
        <div>
          <label class="form-label">Traffic per TC</label>
          <div class="stat-box"><div class="stat-value">${Math.round(state.cbs.pps / state.cbs.selectedTCs.length)} pps</div></div>
        </div>
        <div>
          <label class="form-label">Bandwidth per TC</label>
          <div class="stat-box"><div class="stat-value">${formatBw(state.cbs.pps / state.cbs.selectedTCs.length * CONFIG.packetSize * 8 / 1000)}</div></div>
        </div>
      </div>
    </div>
  `;

  if (state.cbs.monitorTCs.length > 0) {
    drawCBSCreditGraph();
  }

  // Auto-start CBS simulation when page loads
  if (state.cbs.testRunning && !simIntervals.cbs) {
    runCBSSimulation();
  }
}

function drawCBSCreditGraph() {
  const canvas = document.getElementById('cbs-credit-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth;
  const h = canvas.height = 400;
  const pad = { top: 40, right: 140, bottom: 50, left: 80 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const data = state.cbs.creditHistory;
  if (data.length < 2) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Waiting for data... CBS simulation starting', w/2, h/2);
    return;
  }

  // Calculate ranges
  const maxTime = Math.max(data[data.length-1].time * 1.05, 3000);
  let minCredit = 0, maxCredit = 0;
  data.forEach(d => {
    state.cbs.monitorTCs.forEach(tc => {
      const val = d.credit?.[tc] || 0;
      if (val < minCredit) minCredit = val;
      if (val > maxCredit) maxCredit = val;
    });
  });
  const absMax = Math.max(Math.abs(minCredit), Math.abs(maxCredit), 500);
  minCredit = -absMax * 1.2;
  maxCredit = absMax * 1.2;

  const xScale = (time) => pad.left + (time / maxTime) * chartW;
  const yScale = (val) => pad.top + chartH - ((val - minCredit) / (maxCredit - minCredit)) * chartH;
  const zeroY = yScale(0);

  // Shaping zone background
  if (zeroY > pad.top && zeroY < h - pad.bottom) {
    ctx.fillStyle = 'rgba(220, 38, 38, 0.15)';
    ctx.fillRect(pad.left, zeroY, chartW, h - pad.bottom - zeroY);
  }

  // Grid
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 0.5;
  const yStep = (maxCredit - minCredit) / 4;
  for (let i = 0; i <= 4; i++) {
    const val = minCredit + yStep * i;
    const y = yScale(val);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(val), pad.left - 12, y + 4);
  }

  // Zero line
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad.left, zeroY);
  ctx.lineTo(w - pad.right, zeroY);
  ctx.stroke();

  // X axis
  const xStep = maxTime > 10000 ? 2000 : maxTime > 5000 ? 1000 : 500;
  for (let t = 0; t <= maxTime; t += xStep) {
    const x = xScale(t);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, h - pad.bottom);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t + 'ms', x, h - pad.bottom + 20);
  }

  // Data lines
  state.cbs.monitorTCs.forEach(tc => {
    const points = data.filter(d => d.credit?.[tc] !== undefined).map(d => ({
      x: xScale(d.time),
      y: yScale(d.credit[tc])
    }));
    if (points.length < 2) return;

    ctx.strokeStyle = CONFIG.tcColorsBright[tc];
    ctx.lineWidth = 3;
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // End point
    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = CONFIG.tcColorsBright[tc];
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // Border
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad.left, pad.top, chartW, chartH);

  // Labels
  ctx.fillStyle = '#334155';
  ctx.font = '12px sans-serif';
  ctx.save();
  ctx.translate(20, h/2);
  ctx.rotate(-Math.PI/2);
  ctx.textAlign = 'center';
  ctx.fillText('Credit (bits)', 0, 0);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillText('Time (ms)', pad.left + chartW/2, h - 10);

  // Zero label
  ctx.fillStyle = '#000';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Credit = 0', pad.left + 8, zeroY - 8);

  // Legend
  ctx.textAlign = 'left';
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText('Legend', w - pad.right + 20, pad.top);
  state.cbs.monitorTCs.forEach((tc, i) => {
    const y = pad.top + 20 + i * 35;
    ctx.strokeStyle = CONFIG.tcColorsBright[tc];
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w - pad.right + 20, y + 8);
    ctx.lineTo(w - pad.right + 50, y + 8);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(w - pad.right + 50, y + 8, 5, 0, Math.PI * 2);
    ctx.fillStyle = CONFIG.tcColorsBright[tc];
    ctx.fill();

    ctx.fillStyle = CONFIG.tcColorsBright[tc];
    ctx.font = '11px sans-serif';
    ctx.fillText('TC' + tc, w - pad.right + 60, y + 12);
    ctx.fillStyle = '#64748b';
    ctx.font = '9px sans-serif';
    ctx.fillText(((state.cbs.idleSlope[tc] || CONFIG.linkSpeed) / 1000).toFixed(0) + 'Mbps', w - pad.right + 20, y + 26);
  });
}

function updateIdleSlope(tc, value) {
  state.cbs.idleSlope[tc] = parseInt(value) || CONFIG.linkSpeed;
  renderPage('cbs-dashboard');
}

function toggleCBSTc(type, tc) {
  const arr = type === 'selected' ? state.cbs.selectedTCs : state.cbs.monitorTCs;
  const idx = arr.indexOf(tc);
  if (idx > -1) arr.splice(idx, 1);
  else arr.push(tc);
  arr.sort((a,b) => a-b);
  renderPage('cbs-dashboard');
}

function applyCBS() {
  state.cbs.port = parseInt(document.getElementById('cbs-port')?.value) || 8;
  renderPage('cbs-dashboard');
}

function refreshCBS() {
  renderPage('cbs-dashboard');
}

function resetCBS() {
  for (let tc = 0; tc < 8; tc++) {
    state.cbs.idleSlope[tc] = CONFIG.linkSpeed;
  }
  renderPage('cbs-dashboard');
}

function startCBSTest() {
  state.cbs.testRunning = true;
  simulateCBS();
}

function stopCBSTest() {
  state.cbs.testRunning = false;
  clearInterval(simIntervals.cbs);
  renderPage('cbs-dashboard');
}

function runCBSSimulation() {
  // IEEE 802.1Qav Credit-Based Shaper Simulation
  // References: IEEE 802.1Q-2014 Section 8.6.8.2, Annex L

  clearInterval(simIntervals.cbs);
  state.cbs.creditHistory = [];
  const pps = state.cbs.pps;
  const intervalMs = 50; // 50ms update interval
  let simTime = 0;

  // Initialize credit and queue for all TCs
  const credit = {};
  const queueDepth = {}; // Packets waiting in queue
  const packetsSent = {}; // Track packets sent per interval

  state.cbs.monitorTCs.forEach(tc => {
    credit[tc] = 0;
    queueDepth[tc] = 0;
    packetsSent[tc] = 0;
  });
  state.cbs.creditHistory.push({ time: 0, credit: { ...credit }, queue: { ...queueDepth } });

  simIntervals.cbs = setInterval(() => {
    simTime += intervalMs;

    state.cbs.monitorTCs.forEach(tc => {
      // IEEE 802.1Qav parameters
      const idleSlopeKbps = state.cbs.idleSlope[tc] || CONFIG.linkSpeed;
      const portRateKbps = CONFIG.linkSpeed; // 1 Gbps

      // sendSlope = idleSlope - portTransmitRate (always negative)
      const sendSlopeKbps = idleSlopeKbps - portRateKbps;

      // hiCredit = maxInterferenceSize * (idleSlope / portRate)
      // loCredit = maxFrameSize * (sendSlope / portRate)
      const hiCredit = CONFIG.maxFrameBits * (idleSlopeKbps / portRateKbps);
      const loCredit = CONFIG.maxFrameBits * (sendSlopeKbps / portRateKbps);

      // Traffic generation with burstiness
      const isTrafficTC = state.cbs.selectedTCs.includes(tc);
      const basePpsPerTc = isTrafficTC ? pps / state.cbs.selectedTCs.length : 0;

      // Add realistic burst pattern
      const burstFactor = 0.5 + Math.random() * 1.5; // 50% to 200% of base rate
      const packetsArriving = Math.round(basePpsPerTc * (intervalMs / 1000) * burstFactor);

      // Add arriving packets to queue
      queueDepth[tc] += packetsArriving;

      // Credit calculation based on IEEE 802.1Qav
      let currentCredit = credit[tc];
      let sentThisInterval = 0;

      if (queueDepth[tc] > 0) {
        // We have packets to send
        if (currentCredit >= 0) {
          // Credit positive: can transmit
          // While we have credit and packets, send packets
          while (queueDepth[tc] > 0 && currentCredit >= -CONFIG.packetBits) {
            // Transmit one packet: credit decreases by packet size
            currentCredit -= CONFIG.packetBits;
            queueDepth[tc]--;
            sentThisInterval++;

            // Apply sendSlope recovery during transmission
            // (simplified: add partial recovery per packet)
            currentCredit += (idleSlopeKbps * CONFIG.packetBits / portRateKbps);
          }

          // If still have packets but credit depleted, accumulate idle slope
          if (queueDepth[tc] > 0) {
            // Shaping: waiting for credit to recover
            currentCredit += (idleSlopeKbps * intervalMs) / 1000;
          }
        } else {
          // Credit negative: shaping in effect, accumulate credit
          currentCredit += (idleSlopeKbps * intervalMs) / 1000;
        }
      } else {
        // No packets waiting
        // Credit can accumulate up to hiCredit, or stays at 0 if already positive
        if (currentCredit < 0) {
          // Recovering from negative credit
          currentCredit += (idleSlopeKbps * intervalMs) / 1000;
        }
        // Credit doesn't accumulate above 0 when idle (IEEE 802.1Qav)
        if (currentCredit > 0) currentCredit = 0;
      }

      // Clamp to hi/lo credit bounds
      credit[tc] = Math.max(loCredit, Math.min(hiCredit, currentCredit));
      packetsSent[tc] = sentThisInterval;
    });

    state.cbs.creditHistory.push({
      time: simTime,
      credit: { ...credit },
      queue: { ...queueDepth },
      sent: { ...packetsSent }
    });

    // Keep last 200 entries (10 seconds at 50ms intervals)
    if (state.cbs.creditHistory.length > 200) state.cbs.creditHistory.shift();

    if (state.currentPage === 'cbs-dashboard') {
      drawCBSCreditGraph();
      updateCBSStatusCards();
    }
  }, intervalMs);
}

function updateCBSStatusCards() {
  const container = document.getElementById('cbs-status-cards');
  if (!container || state.cbs.creditHistory.length === 0) return;

  const latest = state.cbs.creditHistory[state.cbs.creditHistory.length - 1];

  container.innerHTML = state.cbs.monitorTCs.map(tc => {
    const currentCredit = latest.credit?.[tc] || 0;
    const queuedPackets = latest.queue?.[tc] || 0;
    const isShaping = currentCredit < 0;
    const idleSlope = state.cbs.idleSlope[tc];

    return `
      <div style="padding:12px 16px;border-radius:8px;font-family:monospace;background:${isShaping ? '#fef2f2' : '#f0fdf4'};border:3px solid ${CONFIG.tcColorsBright[tc]};min-width:120px;flex:1;max-width:140px">
        <div style="color:${CONFIG.tcColorsBright[tc]};font-weight:700;font-size:1rem">TC${tc}</div>
        <div style="font-size:1.1rem;font-weight:700;color:${isShaping ? '#dc2626' : '#334155'};margin-top:4px">${Math.round(currentCredit)} bits</div>
        <div style="font-size:0.7rem;color:#64748b;margin-top:2px">Queue: ${queuedPackets} pkts</div>
        <div style="font-size:0.7rem;color:#64748b">Slope: ${(idleSlope/1000).toFixed(0)}Mbps</div>
        <div style="font-size:0.75rem;margin-top:4px;font-weight:600;color:${isShaping ? '#dc2626' : '#059669'}">${isShaping ? 'SHAPING' : 'OK'}</div>
      </div>
    `;
  }).join('');
}

// Keep old function name for compatibility
function simulateCBS() {
  runCBSSimulation();
}

function clearCBS() {
  state.cbs.creditHistory = [];
  renderPage('cbs-dashboard');
}

// ===========================================
// Configuration Pages
// ===========================================
function renderPTPConfig(el) {
  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">PTP Configuration</h1>
      <button class="btn btn-primary" onclick="savePTPConfig()">Save Configuration</button>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">Basic Settings</div>
        <div class="form-group">
          <label class="form-label">PTP Mode</label>
          <select class="form-select">
            <option selected>Grandmaster</option>
            <option>Boundary Clock</option>
            <option>Transparent Clock</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Domain</label>
          <input type="number" class="form-input" value="0">
        </div>
        <div class="form-group">
          <label class="form-label">Priority 1</label>
          <input type="number" class="form-input" value="128">
        </div>
        <div class="form-group">
          <label class="form-label">Priority 2</label>
          <input type="number" class="form-input" value="128">
        </div>
      </div>

      <div class="card">
        <div class="card-title">Timing Parameters</div>
        <div class="form-group">
          <label class="form-label">Sync Interval</label>
          <select class="form-select">
            <option>-3 (8 msg/s)</option>
            <option selected>-2 (4 msg/s)</option>
            <option>-1 (2 msg/s)</option>
            <option>0 (1 msg/s)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Announce Interval</label>
          <select class="form-select">
            <option>-1</option>
            <option selected>0</option>
            <option>1</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Delay Mechanism</label>
          <select class="form-select">
            <option selected>P2P (Peer Delay)</option>
            <option>E2E (End-to-End)</option>
          </select>
        </div>
      </div>
    </div>
  `;
}

function renderTASConfig(el) {
  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">TAS Configuration</h1>
      <button class="btn btn-primary" onclick="saveTASConfig()">Apply Configuration</button>
    </div>

    <div class="card">
      <div class="card-title">Gate Control List</div>
      <div class="form-row" style="margin-bottom:16px">
        <div class="form-group">
          <label class="form-label">Port</label>
          <select class="form-select" id="tas-config-port">
            ${[1,2,3,4,5,6,7,8,9,10,11,12].map(p => `<option value="${p}" ${p === state.tas.port ? 'selected' : ''}>Port ${p}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Cycle Time (ms)</label>
          <input type="number" class="form-input" value="${state.tas.cycleTime}" id="tas-cycle-time">
        </div>
        <div class="form-group">
          <label class="form-label">Guard Time (ns)</label>
          <input type="number" class="form-input" value="256">
        </div>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>Slot</th>
            ${[0,1,2,3,4,5,6,7].map(tc => `<th style="text-align:center;color:${CONFIG.tcColors[tc]}">TC${tc}</th>`).join('')}
            <th>Time (ms)</th>
          </tr>
        </thead>
        <tbody>
          ${state.tas.gcl.map((entry, slot) => `
            <tr>
              <td><strong>S${slot}</strong></td>
              ${[0,1,2,3,4,5,6,7].map(tc => {
                const open = (entry.gates >> tc) & 1;
                return `<td style="text-align:center">
                  <input type="checkbox" ${open ? 'checked' : ''} onchange="toggleGCLGate(${slot}, ${tc})">
                </td>`;
              }).join('')}
              <td><input type="number" class="form-input" value="${entry.time}" style="width:80px" onchange="updateGCLTime(${slot}, this.value)"></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-title">Timeline Preview</div>
      ${renderTASTimeline()}
    </div>
  `;
}

function renderTASTimeline() {
  const total = state.tas.gcl.reduce((s, e) => s + e.time, 0);
  let html = '<div class="timeline-container">';

  for (let tc = 0; tc < 8; tc++) {
    html += `<div class="timeline-row">
      <div class="timeline-label" style="color:${CONFIG.tcColors[tc]}">TC${tc}</div>
      <div class="timeline-bar">`;

    state.tas.gcl.forEach((entry, slot) => {
      const width = (entry.time / total) * 100;
      const open = (entry.gates >> tc) & 1;
      html += `<div class="timeline-slot" style="width:${width}%;background:${open ? CONFIG.tcColors[tc] : '#f3f4f6'}"></div>`;
    });

    html += `</div>
      <div class="timeline-name">S0-S7</div>
    </div>`;
  }

  html += '</div>';
  html += '<div class="timeline-labels"><span>0ms</span><span>' + total + 'ms</span></div>';
  return html;
}

function toggleGCLGate(slot, tc) {
  state.tas.gcl[slot].gates ^= (1 << tc);
  renderPage('tas-config');
}

function updateGCLTime(slot, value) {
  state.tas.gcl[slot].time = parseInt(value) || 125;
  renderPage('tas-config');
}

function renderCBSConfig(el) {
  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">CBS Configuration</h1>
      <button class="btn btn-primary" onclick="saveCBSConfig()">Apply Configuration</button>
    </div>

    <div class="card">
      <div class="card-title">Idle Slope Settings</div>
      <div class="form-group">
        <label class="form-label">Port</label>
        <select class="form-select" style="width:200px">
          ${[1,2,3,4,5,6,7,8,9,10,11,12].map(p => `<option value="${p}" ${p === state.cbs.port ? 'selected' : ''}>Port ${p}</option>`).join('')}
        </select>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>TC</th>
            <th>Idle Slope (kbps)</th>
            <th>Preset</th>
          </tr>
        </thead>
        <tbody>
          ${[0,1,2,3,4,5,6,7].map(tc => `
            <tr>
              <td><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${CONFIG.tcColorsBright[tc]};margin-right:8px"></span><strong>TC${tc}</strong></td>
              <td><input type="number" class="form-input" value="${state.cbs.idleSlope[tc]}" data-tc="${tc}" style="width:200px"></td>
              <td>
                <select class="form-select" style="width:150px" onchange="setIdleSlopePreset(${tc}, this.value)">
                  <option value="">Custom</option>
                  <option value="500">500 kbps</option>
                  <option value="1000">1 Mbps</option>
                  <option value="5000">5 Mbps</option>
                  <option value="10000">10 Mbps</option>
                  <option value="50000">50 Mbps</option>
                  <option value="100000">100 Mbps</option>
                  <option value="1000000">1 Gbps</option>
                </select>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function setIdleSlopePreset(tc, value) {
  if (value) {
    state.cbs.idleSlope[tc] = parseInt(value);
    renderPage('cbs-config');
  }
}

function savePTPConfig() { alert('PTP configuration saved (simulation)'); }
function saveTASConfig() {
  state.tas.cycleTime = parseInt(document.getElementById('tas-cycle-time')?.value) || 1000;
  alert('TAS configuration applied (simulation)');
}
function saveCBSConfig() { alert('CBS configuration applied (simulation)'); }

// ===========================================
// Tools Pages
// ===========================================
function renderPorts(el) {
  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Port Status</h1>
      <button class="btn btn-secondary" onclick="renderPage('ports')">Refresh</button>
    </div>

    <div class="card">
      <table class="table">
        <thead>
          <tr>
            <th>Port</th>
            <th>Link</th>
            <th>Speed</th>
            <th>Duplex</th>
            <th>VLAN</th>
            <th>TX Packets</th>
            <th>RX Packets</th>
          </tr>
        </thead>
        <tbody>
          ${[1,2,3,4,5,6,7,8,9,10,11,12].map(p => {
            const up = Math.random() > 0.3;
            return `
              <tr>
                <td><strong>Port ${p}</strong></td>
                <td><span class="link-status ${up ? 'up' : 'down'}"><span class="link-dot"></span>${up ? 'UP' : 'DOWN'}</span></td>
                <td>${up ? '1000Mbps' : '-'}</td>
                <td>${up ? 'Full' : '-'}</td>
                <td>1, 100</td>
                <td style="font-family:monospace">${up ? Math.floor(Math.random() * 100000) : 0}</td>
                <td style="font-family:monospace">${up ? Math.floor(Math.random() * 100000) : 0}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderCapture(el) {
  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Packet Capture</h1>
      <div class="header-right">
        ${state.capture.running ?
          '<button class="btn btn-danger" onclick="stopCapture()">Stop Capture</button>' :
          '<button class="btn btn-primary" onclick="startCapture()">Start Capture</button>'}
        <button class="btn btn-secondary" onclick="clearCapture()">Clear</button>
      </div>
    </div>

    <div class="grid-4" style="margin-bottom:24px">
      <div class="metric-card">
        <div class="metric-label">Total Packets</div>
        <div class="metric-value">${state.capture.packets.length}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">PTP</div>
        <div class="metric-value success">${state.capture.packets.filter(p => p.type === 'PTP').length}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">VLAN Tagged</div>
        <div class="metric-value">${state.capture.packets.filter(p => p.vlan).length}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Rate</div>
        <div class="metric-value">${state.capture.running ? '~50' : '0'} pps</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Captured Packets</span>
        <span class="status-badge ${state.capture.running ? 'success' : 'neutral'}">${state.capture.running ? 'Capturing...' : 'Stopped'}</span>
      </div>
      <div class="packet-table">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Time</th>
              <th>Source</th>
              <th>Destination</th>
              <th>Type</th>
              <th>VLAN</th>
              <th>TC</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            ${state.capture.packets.slice(-50).map((p, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${p.time}</td>
                <td>${p.src}</td>
                <td>${p.dst}</td>
                <td>${p.type}</td>
                <td>${p.vlan || '-'}</td>
                <td>${p.tc !== undefined ? 'TC' + p.tc : '-'}</td>
                <td>${p.size}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function startCapture() {
  state.capture.running = true;
  state.capture.packets = [];
  let pktNum = 0;

  simIntervals.capture = setInterval(() => {
    const types = ['Ethernet', 'VLAN', 'PTP', 'ARP', 'ICMP'];
    const tc = Math.floor(Math.random() * 8);
    state.capture.packets.push({
      time: new Date().toISOString().split('T')[1].slice(0, 12),
      src: 'AA:BB:CC:' + Math.random().toString(16).slice(2, 8).toUpperCase(),
      dst: 'DD:EE:FF:' + Math.random().toString(16).slice(2, 8).toUpperCase(),
      type: types[Math.floor(Math.random() * types.length)],
      vlan: Math.random() > 0.5 ? 100 : null,
      tc: Math.random() > 0.3 ? tc : undefined,
      size: 64 + Math.floor(Math.random() * 1400)
    });
    if (state.capture.packets.length > 100) state.capture.packets.shift();
    if (state.currentPage === 'capture') renderPage('capture');
  }, 200);

  renderPage('capture');
}

function stopCapture() {
  state.capture.running = false;
  clearInterval(simIntervals.capture);
  renderPage('capture');
}

function clearCapture() {
  state.capture.packets = [];
  renderPage('capture');
}

function renderTraffic(el) {
  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Traffic Generator</h1>
      <div class="header-right">
        ${state.traffic.running ?
          '<button class="btn btn-danger" onclick="stopTrafficGen()">Stop</button>' :
          '<button class="btn btn-primary" onclick="startTrafficGen()">Start</button>'}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Traffic Settings</div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Interface</label>
          <select class="form-select">
            <option>enx00e04c681336</option>
            <option>enp11s0</option>
            <option>enp15s0</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Destination MAC</label>
          <input type="text" class="form-input" value="FA:AE:C9:26:A4:08">
        </div>
        <div class="form-group">
          <label class="form-label">VLAN ID</label>
          <input type="number" class="form-input" value="100">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Packet Size (bytes)</label>
          <input type="number" class="form-input" value="64">
        </div>
        <div class="form-group">
          <label class="form-label">Packets per Second</label>
          <input type="number" class="form-input" value="1000">
        </div>
        <div class="form-group">
          <label class="form-label">Duration (seconds)</label>
          <input type="number" class="form-input" value="10">
        </div>
      </div>

      <div class="section-header" style="margin-top:16px">
        <div class="section-title">Traffic Class Selection</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${[0,1,2,3,4,5,6,7].map(tc => `
          <button class="tc-btn tc${tc} active">TC${tc}</button>
        `).join('')}
      </div>
    </div>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">TX Packets</div>
        <div class="metric-value">${state.traffic.stats.tx || 0}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">TX Rate</div>
        <div class="metric-value">${state.traffic.running ? '~1000' : '0'} pps</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Bandwidth</div>
        <div class="metric-value">${state.traffic.running ? '512' : '0'} kbps</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Status</div>
        <div class="metric-value ${state.traffic.running ? 'success' : ''}">${state.traffic.running ? 'Running' : 'Stopped'}</div>
      </div>
    </div>
  `;
}

function startTrafficGen() {
  state.traffic.running = true;
  state.traffic.stats = { tx: 0 };
  simIntervals.traffic = setInterval(() => {
    state.traffic.stats.tx += 50;
    if (state.currentPage === 'traffic') renderPage('traffic');
  }, 50);
  renderPage('traffic');
}

function stopTrafficGen() {
  state.traffic.running = false;
  clearInterval(simIntervals.traffic);
  renderPage('traffic');
}

function renderSettings(el) {
  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Settings</h1>
      <button class="btn btn-primary" onclick="saveSettings()">Save Settings</button>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">Device Connection</div>
        <div class="form-group">
          <label class="form-label">Serial Port</label>
          <select class="form-select">
            <option>/dev/ttyACM0</option>
            <option>/dev/ttyACM1</option>
            <option>/dev/ttyUSB0</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Baud Rate</label>
          <select class="form-select">
            <option>115200</option>
            <option>9600</option>
            <option>57600</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Connection Mode</label>
          <select class="form-select">
            <option>Serial (MUP1)</option>
            <option>CoAP/UDP</option>
          </select>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Network Interfaces</div>
        <div class="form-group">
          <label class="form-label">Traffic Interface</label>
          <select class="form-select">
            <option>enx00e04c681336</option>
            <option>enp11s0</option>
            <option>enp15s0</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">TAP Interface</label>
          <select class="form-select">
            <option>enxc84d44231cc2</option>
            <option>enp11s0</option>
            <option>enp15s0</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">About</div>
      <div style="color:#64748b;font-size:0.875rem;line-height:1.8">
        <p><strong>KETI TSN CLI UI - Simulation Mode</strong></p>
        <p>Version: 2.0.0</p>
        <p>This is a simulation interface for demonstrating TSN switch management functionality.</p>
        <p>For actual device control, please use the full version with device connectivity.</p>
        <p style="margin-top:16px">
          <a href="https://github.com/hwkim3330/keti-tsn-cli-ui" target="_blank" style="color:#3b82f6">GitHub Repository</a>
        </p>
      </div>
    </div>
  `;
}

function saveSettings() {
  alert('Settings saved (simulation)');
}

// ===========================================
// Initialize
// ===========================================
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();

  // PPS update for TAS
  document.addEventListener('input', (e) => {
    if (e.target.id === 'tas-pps') {
      const pps = parseInt(e.target.value) || 100;
      const total = document.getElementById('tas-total-pps');
      if (total) total.textContent = pps * state.tas.selectedTCs.length;
    }
  });

  // Auto-start CBS simulation for realistic monitoring
  setTimeout(() => {
    if (state.cbs.testRunning) {
      runCBSSimulation();
    }
  }, 500);
});
