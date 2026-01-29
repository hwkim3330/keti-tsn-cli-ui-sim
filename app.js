// KETI TSN UI - LAN9692
// ===========================================

// Configuration
const CONFIG = {
  // Muted blue-gray tones for TC colors
  tcColors: ['#94a3b8', '#64748b', '#475569', '#334155', '#1e3a5f', '#1e40af', '#3730a3', '#4c1d95'],
  linkSpeed: 1000000, // 1 Gbps in kbps
  linkSpeedBits: 1000000000, // 1 Gbps in bits
  packetSize: 64, // bytes
  packetBits: 512, // 64 * 8 bits
  maxFrameSize: 1522, // bytes (max ethernet frame)
  maxFrameBits: 12176, // 1522 * 8 bits
  boards: [
    { id: 1, name: 'LAN9692 #1', device: '/dev/ttyACM0', mac: 'AA:BB:CC:DD:EE:01', ports: 12 },
    { id: 2, name: 'LAN9692 #2', device: '/dev/ttyACM1', mac: 'AA:BB:CC:DD:EE:02', ports: 12 },
    { id: 3, name: 'LAN9692 #3', device: '/dev/ttyACM2', mac: 'AA:BB:CC:DD:EE:03', ports: 12 },
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
    // Idle slopes in kbps - traffic rate ~10Mbps per TC, so slopes show clear shaping
    // TC1: 1% pass, TC2: 5%, TC3: 10%, TC4: 25%, TC5: 50%, TC6: 80%, TC7: 100%
    idleSlope: {0: 1000000, 1: 100, 2: 500, 3: 1000, 4: 2500, 5: 5000, 6: 8000, 7: 15000},
    testRunning: false,
    selectedTCs: [1, 2, 3, 4, 5, 6, 7],
    txHistory: [],
    rxHistory: [],
    pps: 140000,  // 20000 pps per TC = ~10Mbps per TC
    duration: 10
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

// Timer Intervals
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
        <button class="btn btn-primary" onclick="togglePTPSim()">${state.ptp.running ? 'Stop' : 'Start'} Monitor</button>
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
    ctx.fillText('Start monitor to see data', w/2, h/2);
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

  const cycleTime = state.tas.cycleTime;
  const slotDuration = cycleTime / 8;
  const maxTime = 9000;

  // Draw slot background stripes for RX graph (to show staircase expectation)
  const isRxGraph = canvasId.includes('rx');
  if (isRxGraph && state.tas.enabled) {
    for (let t = 0; t < maxTime; t += cycleTime) {
      for (let slot = 0; slot < 8; slot++) {
        const slotStart = t + slot * slotDuration;
        const slotEnd = slotStart + slotDuration;
        const x1 = pad.left + (slotStart / maxTime) * chartW;
        const x2 = pad.left + (slotEnd / maxTime) * chartW;
        const y = pad.top + slot * rowH;

        // Highlight the expected slot for this TC
        ctx.fillStyle = CONFIG.tcColors[slot] + '15';
        ctx.fillRect(x1, y, x2 - x1, rowH);
      }
    }
  }

  // TC rows
  for (let tc = 0; tc < 8; tc++) {
    const y = pad.top + tc * rowH;
    if (!isRxGraph) {
      ctx.fillStyle = state.tas.selectedTCs.includes(tc) ? CONFIG.tcColors[tc] + '08' : '#fafafa';
      ctx.fillRect(pad.left, y, chartW, rowH);
    }
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(pad.left, y, chartW, rowH);

    ctx.fillStyle = state.tas.selectedTCs.includes(tc) ? CONFIG.tcColors[tc] : '#94a3b8';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('TC' + tc, pad.left - 6, y + rowH/2 + 3);
  }

  // X axis grid
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

  // Scatter plot - draw dots for each packet burst
  data.forEach(d => {
    const x = pad.left + (d.time / maxTime) * chartW;
    [0,1,2,3,4,5,6,7].forEach(tc => {
      const count = d.tc[tc] || 0;
      if (count === 0) return;

      const yCenter = pad.top + tc * rowH + rowH / 2;
      // Larger dots for better visibility
      const dotRadius = Math.min(4 + count * 0.5, 12);
      const intensity = Math.min(count / 20, 1);

      // Draw filled circle
      ctx.beginPath();
      ctx.arc(x, yCenter, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = CONFIG.tcColors[tc];
      ctx.globalAlpha = 0.7 + intensity * 0.3;
      ctx.fill();

      // Add border for clarity
      ctx.strokeStyle = CONFIG.tcColors[tc];
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Show packet count
      if (count >= 3 && dotRadius >= 6) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(count, x, yCenter + 3);
      }
    });
  });

  // Border
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
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
  state.tas.rxSlotAccum = {};
  state.tas.selectedTCs.forEach(tc => { state.tas.rxSlotAccum[tc] = 0; });

  const pps = parseInt(document.getElementById('tas-pps')?.value) || 100;
  const duration = parseInt(document.getElementById('tas-duration')?.value) || 7;
  const maxTime = (duration + 2) * 1000;
  const cycleTime = state.tas.cycleTime;
  const slotDuration = cycleTime / 8; // 125ms per slot
  let elapsed = 0;
  let lastSlot = -1;

  // Use slot duration as interval - ONE data point per slot for CLEAR staircase
  const interval = slotDuration;

  simIntervals.tas = setInterval(() => {
    elapsed += interval;
    if (elapsed > maxTime) {
      stopTASTest();
      return;
    }

    const txEntry = { time: elapsed, tc: {} };
    const rxEntry = { time: elapsed, tc: {} };

    // Current slot (0-7) - this determines which TC outputs
    const currentSlot = Math.floor((elapsed % cycleTime) / slotDuration) % 8;

    state.tas.selectedTCs.forEach(tc => {
      // TX: ALL TCs generate packets uniformly
      const baseRate = pps / state.tas.selectedTCs.length * (interval / 1000);
      const txPackets = Math.round(baseRate * (0.8 + Math.random() * 0.4));
      txEntry.tc[tc] = txPackets;

      if (state.tas.enabled) {
        // Accumulate for this TC
        state.tas.rxSlotAccum[tc] = (state.tas.rxSlotAccum[tc] || 0) + txPackets;

        // PERFECT STAIRCASE: ONLY the TC matching current slot outputs
        // Slot 0 -> no selected TC (TC0 not selected)
        // Slot 1 -> TC1 outputs
        // Slot 2 -> TC2 outputs
        // ... etc
        if (tc === currentSlot) {
          // This TC's slot - release ALL accumulated packets as one burst
          rxEntry.tc[tc] = state.tas.rxSlotAccum[tc];
          state.tas.rxSlotAccum[tc] = 0;
        } else {
          // NOT this TC's slot - absolutely NO output
          rxEntry.tc[tc] = 0;
        }
      } else {
        rxEntry.tc[tc] = txPackets;
      }
    });

    state.tas.txHistory.push(txEntry);
    state.tas.rxHistory.push(rxEntry);

    if (state.tas.txHistory.length > 200) state.tas.txHistory.shift();
    if (state.tas.rxHistory.length > 200) state.tas.rxHistory.shift();

    if (state.currentPage === 'tas-dashboard') {
      drawTASRasterGraph('tas-tx-canvas', state.tas.txHistory, '#3b82f6');
      drawTASRasterGraph('tas-rx-canvas', state.tas.rxHistory, '#10b981');
      updatePredictedGCLHeatmap();
    }
  }, interval);

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
        <p class="page-description">Credit-Based Shaper (IEEE 802.1Qav) Monitor</p>
      </div>
      <div class="header-right">
        <span class="status-badge ${state.cbs.testRunning ? 'success' : 'neutral'}">${state.cbs.testRunning ? 'CBS Active' : 'CBS Ready'}</span>
        <button class="btn btn-primary" onclick="configureCBS()">Configure</button>
      </div>
    </div>

    <!-- Status Bar -->
    <div class="grid-6" style="margin-bottom:24px">
      ${[
        { label: 'PORT', value: state.cbs.port },
        { label: 'CBS', value: 'ENABLED', cls: 'success' },
        { label: 'LINK', value: '1 Gbps' },
        { label: 'TRAFFIC', value: state.cbs.pps + ' pps' },
        { label: 'TCs', value: state.cbs.selectedTCs.length },
        { label: 'DURATION', value: state.cbs.duration + 's' }
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
          <span style="font-size:0.7rem;color:#64748b;font-family:monospace">${state.cbs.txHistory.reduce((s,d) => s + Object.values(d.tc).reduce((a,b)=>a+b,0), 0)} pkts</span>
        </div>
        <canvas id="cbs-tx-canvas" height="200"></canvas>
      </div>
      <div class="card">
        <div class="card-header">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:10px;height:10px;border-radius:50%;background:#10b981"></div>
            <span class="card-title">RX - Received (Shaped)</span>
          </div>
          <span style="font-size:0.7rem;color:#64748b;font-family:monospace">${state.cbs.rxHistory.reduce((s,d) => s + Object.values(d.tc).reduce((a,b)=>a+b,0), 0)} pkts</span>
        </div>
        <canvas id="cbs-rx-canvas" height="200"></canvas>
      </div>
    </div>

    <!-- Estimated Idle Slope Graph -->
    <div class="card">
      <div class="card-header">
        <div>
          <span class="card-title">Estimated Idle Slope (from RX Traffic)</span>
          <div style="font-size:0.75rem;color:#64748b;margin-top:4px">Configured vs Estimated based on observed throughput</div>
        </div>
        <span class="status-badge ${state.cbs.rxHistory.length > 0 ? 'success' : 'neutral'}">${state.cbs.rxHistory.length > 0 ? 'ESTIMATED' : 'WAITING'}</span>
      </div>
      <canvas id="cbs-slope-canvas" height="250"></canvas>
    </div>

    <!-- Idle Slope Settings & Analysis -->
    <div class="grid-2">
      <div class="card">
        <div class="card-header">
          <span class="card-title">Idle Slope Configuration</span>
          <span class="status-badge success">ACTIVE</span>
        </div>
        ${renderCBSIdleSlopeTable(formatBw)}
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">Shaping Analysis (TX vs RX)</span>
          <span class="status-badge ${state.cbs.rxHistory.length > 0 ? 'success' : 'neutral'}">${state.cbs.rxHistory.length > 0 ? 'ANALYZED' : 'WAITING'}</span>
        </div>
        <div id="cbs-analysis-container">
          ${state.cbs.rxHistory.length > 0 ? renderCBSAnalysis(formatBw) : '<div style="padding:40px;text-align:center;color:#94a3b8">Run traffic test to analyze shaping</div>'}
        </div>
      </div>
    </div>

    <!-- Traffic Test -->
    <div class="card">
      <div class="card-header">
        <div style="display:flex;align-items:center;gap:12px">
          <span class="card-title">Traffic Test</span>
          <span class="status-badge ${state.cbs.testRunning ? 'success' : 'neutral'}">${state.cbs.testRunning ? 'Running' : 'Ready'}</span>
        </div>
        <div style="display:flex;gap:8px">
          ${state.cbs.testRunning ?
            '<button class="btn btn-danger" onclick="stopCBSTest()">Stop</button>' :
            '<button class="btn btn-primary" onclick="startCBSTest()">Start Test</button>'}
          <button class="btn btn-secondary" onclick="clearCBS()">Clear</button>
        </div>
      </div>

      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
        ${[1,2,3,4,5,6,7].map(tc => `
          <button class="tc-btn tc${tc} ${state.cbs.selectedTCs.includes(tc) ? 'active' : ''}"
            onclick="toggleCBSTc(${tc})" ${state.cbs.testRunning ? 'disabled' : ''}>TC${tc}</button>
        `).join('')}
      </div>

      <div class="form-row" style="margin-bottom:16px">
        <div>
          <label class="form-label">VLAN ID</label>
          <input type="number" class="form-input" value="100" id="cbs-vlan">
        </div>
        <div>
          <label class="form-label">PPS/TC</label>
          <input type="number" class="form-input" value="${Math.round(state.cbs.pps / state.cbs.selectedTCs.length)}" id="cbs-pps-tc" onchange="updateCBSPps()">
        </div>
        <div>
          <label class="form-label">Duration (s)</label>
          <input type="number" class="form-input" value="${state.cbs.duration}" id="cbs-duration">
        </div>
        <div>
          <label class="form-label">Total PPS</label>
          <div class="stat-box"><div class="stat-value" id="cbs-total-pps">${state.cbs.pps}</div></div>
        </div>
      </div>
    </div>

    <!-- Results Table -->
    ${state.cbs.rxHistory.length > 0 ? renderCBSResults(formatBw) : ''}
  `;

  drawCBSRasterGraph('cbs-tx-canvas', state.cbs.txHistory, '#3b82f6');
  drawCBSRasterGraph('cbs-rx-canvas', state.cbs.rxHistory, '#10b981');
  drawCBSSlopeGraph();
}

function renderCBSIdleSlopeTable(formatBw) {
  let html = '<div style="display:grid;grid-template-columns:60px repeat(7, 1fr);gap:4px;font-size:0.75rem">';
  html += '<div style="font-weight:600;color:#64748b">TC</div>';
  for (let tc = 1; tc <= 7; tc++) {
    html += `<div style="text-align:center;font-weight:600;color:${CONFIG.tcColors[tc]}">TC${tc}</div>`;
  }
  html += '<div style="color:#64748b">Slope</div>';
  for (let tc = 1; tc <= 7; tc++) {
    const slope = state.cbs.idleSlope[tc];
    html += `<div style="text-align:center;font-family:monospace;font-weight:600">${formatBw(slope)}</div>`;
  }
  html += '</div>';
  return html;
}

function renderCBSAnalysis(formatBw) {
  let html = '<div style="display:grid;grid-template-columns:80px repeat(7, 1fr);gap:4px;font-size:0.7rem">';
  html += '<div style="font-weight:600;color:#64748b">Metric</div>';
  for (let tc = 1; tc <= 7; tc++) {
    html += `<div style="text-align:center;font-weight:600;color:${CONFIG.tcColors[tc]}">TC${tc}</div>`;
  }

  // TX packets
  html += '<div style="color:#64748b">TX pkts</div>';
  for (let tc = 1; tc <= 7; tc++) {
    const txTotal = state.cbs.txHistory.reduce((s, d) => s + (d.tc[tc] || 0), 0);
    html += `<div style="text-align:center;font-family:monospace">${txTotal}</div>`;
  }

  // RX packets
  html += '<div style="color:#64748b">RX pkts</div>';
  for (let tc = 1; tc <= 7; tc++) {
    const rxTotal = state.cbs.rxHistory.reduce((s, d) => s + (d.tc[tc] || 0), 0);
    html += `<div style="text-align:center;font-family:monospace;font-weight:600">${rxTotal}</div>`;
  }

  // Shaping ratio
  html += '<div style="color:#64748b">Shaped</div>';
  for (let tc = 1; tc <= 7; tc++) {
    const txTotal = state.cbs.txHistory.reduce((s, d) => s + (d.tc[tc] || 0), 0);
    const rxTotal = state.cbs.rxHistory.reduce((s, d) => s + (d.tc[tc] || 0), 0);
    const ratio = txTotal > 0 ? ((txTotal - rxTotal) / txTotal * 100).toFixed(0) : 0;
    const isShaped = ratio > 5;
    html += `<div style="text-align:center;font-weight:600;color:${isShaped ? '#dc2626' : '#059669'}">${ratio}%</div>`;
  }

  // Status
  html += '<div style="color:#64748b">Status</div>';
  for (let tc = 1; tc <= 7; tc++) {
    const txTotal = state.cbs.txHistory.reduce((s, d) => s + (d.tc[tc] || 0), 0);
    const rxTotal = state.cbs.rxHistory.reduce((s, d) => s + (d.tc[tc] || 0), 0);
    const isShaped = txTotal > 0 && (txTotal - rxTotal) / txTotal > 0.05;
    html += `<div style="text-align:center"><span style="padding:2px 4px;border-radius:3px;font-size:0.6rem;background:${isShaped ? '#fef2f2' : '#f0fdf4'};color:${isShaped ? '#dc2626' : '#059669'}">${isShaped ? 'SHAPED' : 'OK'}</span></div>`;
  }

  html += '</div>';
  return html;
}

function renderCBSResults(formatBw) {
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
            <th style="text-align:right">Idle Slope</th>
            <th style="text-align:right">TX Rate</th>
            <th style="text-align:right">RX Rate</th>
            <th style="text-align:center">Shaping</th>
          </tr>
        </thead>
        <tbody>
          ${state.cbs.selectedTCs.map(tc => {
            const txTotal = state.cbs.txHistory.reduce((s, d) => s + (d.tc[tc] || 0), 0);
            const rxTotal = state.cbs.rxHistory.reduce((s, d) => s + (d.tc[tc] || 0), 0);
            const duration = state.cbs.duration || 10;
            const txRate = txTotal / duration;
            const rxRate = rxTotal / duration;
            const slope = state.cbs.idleSlope[tc];
            const isShaped = txTotal > 0 && (txTotal - rxTotal) / txTotal > 0.05;
            return `
              <tr>
                <td><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${CONFIG.tcColors[tc]};margin-right:6px"></span><strong>TC${tc}</strong></td>
                <td style="text-align:right;font-family:monospace">${txTotal}</td>
                <td style="text-align:right;font-family:monospace;font-weight:600">${rxTotal}</td>
                <td style="text-align:right;font-family:monospace">${formatBw(slope)}</td>
                <td style="text-align:right;font-family:monospace">${txRate.toFixed(0)} pps</td>
                <td style="text-align:right;font-family:monospace">${rxRate.toFixed(0)} pps</td>
                <td style="text-align:center"><span class="status-badge ${isShaped ? 'error' : 'success'}">${isShaped ? 'SHAPED' : 'OK'}</span></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function drawCBSRasterGraph(canvasId, data, color) {
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

  const isRxGraph = canvasId.includes('rx');

  // TC rows
  for (let tc = 0; tc < 8; tc++) {
    const y = pad.top + tc * rowH;

    // For RX graph, show shaping indicator based on idle slope
    if (isRxGraph && state.cbs.selectedTCs.includes(tc)) {
      const slope = state.cbs.idleSlope[tc] || 0;
      const maxSlope = 50000;
      const shapingLevel = 1 - Math.min(slope / maxSlope, 1);
      // Higher shaping (lower slope) = more red tint
      ctx.fillStyle = `rgba(239, 68, 68, ${shapingLevel * 0.15})`;
    } else {
      ctx.fillStyle = state.cbs.selectedTCs.includes(tc) ? CONFIG.tcColors[tc] + '10' : '#fafafa';
    }
    ctx.fillRect(pad.left, y, chartW, rowH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(pad.left, y, chartW, rowH);

    ctx.fillStyle = state.cbs.selectedTCs.includes(tc) ? CONFIG.tcColors[tc] : '#94a3b8';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('TC' + tc, pad.left - 6, y + rowH/2 + 3);
  }

  // X axis grid
  const duration = state.cbs.duration || 10;
  const maxTime = (duration + 2) * 1000;
  for (let t = 0; t <= maxTime; t += 2000) {
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

  // Scatter plot - draw dots with size based on packet count
  data.forEach(d => {
    const x = pad.left + (d.time / maxTime) * chartW;
    [0,1,2,3,4,5,6,7].forEach(tc => {
      const count = d.tc[tc] || 0;
      if (count === 0) return;

      const yCenter = pad.top + tc * rowH + rowH / 2;
      // Size proportional to packet count - VERY visible difference
      const dotRadius = Math.min(3 + count * 0.15, 10);
      const intensity = Math.min(count / 150, 1);

      // Filled circle
      ctx.beginPath();
      ctx.arc(x, yCenter, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = CONFIG.tcColors[tc];
      ctx.globalAlpha = 0.6 + intensity * 0.4;
      ctx.fill();

      // Border for clarity
      ctx.strokeStyle = CONFIG.tcColors[tc];
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Show count on dots
      if (count >= 50 && dotRadius >= 6) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 7px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(count, x, yCenter + 2);
      }
    });
  });

  // Border
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad.left, pad.top, chartW, chartH);
}

function drawCBSSlopeGraph() {
  const canvas = document.getElementById('cbs-slope-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth;
  const h = canvas.height = 250;
  const pad = { top: 30, right: 30, bottom: 50, left: 80 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const tcs = [1, 2, 3, 4, 5, 6, 7];
  const barGroupWidth = chartW / tcs.length;
  const barWidth = barGroupWidth * 0.35;
  const gap = barGroupWidth * 0.1;

  // Calculate max slope for scaling
  let maxSlope = 0;
  tcs.forEach(tc => {
    const configured = state.cbs.idleSlope[tc] || 0;
    if (configured > maxSlope) maxSlope = configured;
  });
  maxSlope = Math.max(maxSlope * 1.2, 1000); // At least 1Mbps for scale

  const formatBw = (kbps) => {
    if (kbps >= 1000) return (kbps / 1000).toFixed(0) + 'M';
    return Math.round(kbps) + 'k';
  };

  // Y axis grid
  ctx.strokeStyle = '#e2e8f0';
  ctx.fillStyle = '#64748b';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (chartH / 4) * i;
    const val = maxSlope - (maxSlope / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillText(formatBw(val), pad.left - 8, y + 4);
  }

  // Draw bars for each TC
  tcs.forEach((tc, i) => {
    const x = pad.left + i * barGroupWidth + barGroupWidth / 2;

    // Configured idle slope (gray bar)
    const configuredSlope = state.cbs.idleSlope[tc] || 0;
    const configuredHeight = (configuredSlope / maxSlope) * chartH;

    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x - barWidth - gap/2, pad.top + chartH - configuredHeight, barWidth, configuredHeight);

    // Estimated idle slope based on RX traffic (colored bar)
    let estimatedSlope = 0;
    if (state.cbs.rxHistory.length > 0 && state.cbs.txHistory.length > 0) {
      const txTotal = state.cbs.txHistory.reduce((s, d) => s + (d.tc[tc] || 0), 0);
      const rxTotal = state.cbs.rxHistory.reduce((s, d) => s + (d.tc[tc] || 0), 0);
      const duration = state.cbs.duration || 10;

      if (txTotal > 0) {
        // RX rate in kbps = (packets / duration) * packet_bits / 1000
        const rxRateKbps = (rxTotal / duration) * CONFIG.packetBits / 1000;
        estimatedSlope = rxRateKbps;

        // If no shaping occurred, estimated slope = at least TX rate
        const txRateKbps = (txTotal / duration) * CONFIG.packetBits / 1000;
        if (rxTotal >= txTotal * 0.95) {
          estimatedSlope = Math.max(configuredSlope, txRateKbps);
        }
      }
    }

    const estimatedHeight = (estimatedSlope / maxSlope) * chartH;
    ctx.fillStyle = CONFIG.tcColors[tc];
    ctx.fillRect(x + gap/2, pad.top + chartH - estimatedHeight, barWidth, estimatedHeight);

    // TC label
    ctx.fillStyle = CONFIG.tcColors[tc];
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TC' + tc, x, h - pad.bottom + 15);

    // Value labels on bars
    if (configuredHeight > 15) {
      ctx.fillStyle = '#fff';
      ctx.font = '9px sans-serif';
      ctx.fillText(formatBw(configuredSlope), x - barWidth/2 - gap/2, pad.top + chartH - configuredHeight + 12);
    }
    if (estimatedHeight > 15 && estimatedSlope > 0) {
      ctx.fillStyle = '#fff';
      ctx.font = '9px sans-serif';
      ctx.fillText(formatBw(estimatedSlope), x + barWidth/2 + gap/2, pad.top + chartH - estimatedHeight + 12);
    }
  });

  // Legend
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(w - pad.right - 150, pad.top, 12, 12);
  ctx.fillStyle = '#334155';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Configured', w - pad.right - 133, pad.top + 10);

  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(w - pad.right - 150, pad.top + 18, 12, 12);
  ctx.fillStyle = '#334155';
  ctx.fillText('Estimated (RX)', w - pad.right - 133, pad.top + 28);

  // Y axis label
  ctx.save();
  ctx.translate(15, h/2);
  ctx.rotate(-Math.PI/2);
  ctx.fillStyle = '#334155';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Idle Slope (kbps)', 0, 0);
  ctx.restore();

  // Border
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad.left, pad.top, chartW, chartH);
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
    ctx.fillText('Waiting for data...', w/2, h/2);
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

    ctx.strokeStyle = CONFIG.tcColors[tc];
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
    ctx.fillStyle = CONFIG.tcColors[tc];
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
    ctx.strokeStyle = CONFIG.tcColors[tc];
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w - pad.right + 20, y + 8);
    ctx.lineTo(w - pad.right + 50, y + 8);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(w - pad.right + 50, y + 8, 5, 0, Math.PI * 2);
    ctx.fillStyle = CONFIG.tcColors[tc];
    ctx.fill();

    ctx.fillStyle = CONFIG.tcColors[tc];
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
  state.cbs.txHistory = [];
  state.cbs.rxHistory = [];

  const ppsPerTc = parseInt(document.getElementById('cbs-pps-tc')?.value) || Math.round(state.cbs.pps / state.cbs.selectedTCs.length);
  state.cbs.pps = ppsPerTc * state.cbs.selectedTCs.length;
  state.cbs.duration = parseInt(document.getElementById('cbs-duration')?.value) || 10;

  const duration = state.cbs.duration;
  const maxTime = (duration + 2) * 1000;
  let elapsed = 0;

  // Traffic rate per TC in kbps (for comparison with idle slope)
  const trafficRateKbps = ppsPerTc * CONFIG.packetSize * 8 / 1000;

  simIntervals.cbs = setInterval(() => {
    elapsed += 100;
    if (elapsed > maxTime) {
      stopCBSTest();
      return;
    }

    const txEntry = { time: elapsed, tc: {} };
    const rxEntry = { time: elapsed, tc: {} };

    state.cbs.selectedTCs.forEach(tc => {
      // TX: ALL TCs generate same amount of packets (uniform)
      const txPackets = Math.round(ppsPerTc * 0.1 * (0.85 + Math.random() * 0.3));
      txEntry.tc[tc] = txPackets;

      // RX: CBS shaping - DRAMATIC difference based on idle slope
      const idleSlope = state.cbs.idleSlope[tc];

      // Shaping ratio = idle_slope / traffic_rate
      // Lower idle slope = more shaping = much fewer packets
      let rxPackets;
      if (trafficRateKbps > idleSlope) {
        // Heavy shaping - limit to idle slope rate
        const shapingRatio = idleSlope / trafficRateKbps;
        // Add variance but keep it clear
        rxPackets = Math.round(txPackets * shapingRatio * (0.8 + Math.random() * 0.4));
        // Occasionally drop to 0 for very low slopes (heavy shaping visual)
        if (shapingRatio < 0.1 && Math.random() < 0.3) {
          rxPackets = 0;
        }
      } else {
        // No shaping - almost all packets pass
        rxPackets = Math.round(txPackets * (0.95 + Math.random() * 0.05));
      }

      rxEntry.tc[tc] = Math.max(0, rxPackets);
    });

    state.cbs.txHistory.push(txEntry);
    state.cbs.rxHistory.push(rxEntry);

    if (state.cbs.txHistory.length > 150) state.cbs.txHistory.shift();
    if (state.cbs.rxHistory.length > 150) state.cbs.rxHistory.shift();

    if (state.currentPage === 'cbs-dashboard') {
      drawCBSRasterGraph('cbs-tx-canvas', state.cbs.txHistory, '#3b82f6');
      drawCBSRasterGraph('cbs-rx-canvas', state.cbs.rxHistory, '#10b981');
      drawCBSSlopeGraph();
      updateCBSAnalysis();
    }
  }, 100);

  renderPage('cbs-dashboard');
}

function stopCBSTest() {
  state.cbs.testRunning = false;
  clearInterval(simIntervals.cbs);
  simIntervals.cbs = null;
  renderPage('cbs-dashboard');
}

function updateCBSAnalysis() {
  const container = document.getElementById('cbs-analysis-container');
  if (!container) return;
  const formatBw = (kbps) => {
    if (kbps >= 1000000) return (kbps / 1000000).toFixed(1) + 'Gbps';
    if (kbps >= 1000) return (kbps / 1000).toFixed(1) + 'Mbps';
    return Math.round(kbps) + 'kbps';
  };
  container.innerHTML = renderCBSAnalysis(formatBw);
}

function toggleCBSTc(tc) {
  if (state.cbs.testRunning) return;
  const idx = state.cbs.selectedTCs.indexOf(tc);
  if (idx > -1) state.cbs.selectedTCs.splice(idx, 1);
  else state.cbs.selectedTCs.push(tc);
  state.cbs.selectedTCs.sort((a,b) => a-b);
  renderPage('cbs-dashboard');
}

function updateCBSPps() {
  const ppsPerTc = parseInt(document.getElementById('cbs-pps-tc')?.value) || 100;
  state.cbs.pps = ppsPerTc * state.cbs.selectedTCs.length;
  const totalEl = document.getElementById('cbs-total-pps');
  if (totalEl) totalEl.textContent = state.cbs.pps;
}

function configureCBS() {
  navigateTo('cbs-config');
}

function clearCBS() {
  state.cbs.txHistory = [];
  state.cbs.rxHistory = [];
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
              <td><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${CONFIG.tcColors[tc]};margin-right:8px"></span><strong>TC${tc}</strong></td>
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

function savePTPConfig() { alert('PTP configuration saved'); }
function saveTASConfig() {
  state.tas.cycleTime = parseInt(document.getElementById('tas-cycle-time')?.value) || 1000;
  alert('TAS configuration applied');
}
function saveCBSConfig() { alert('CBS configuration applied'); }

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
        <p><strong>KETI TSN CLI UI</strong></p>
        <p>Version: 2.0.0</p>
        <p>TSN Switch Management Interface for LAN9692</p>
        <p>IEEE 802.1AS (PTP), 802.1Qbv (TAS), 802.1Qav (CBS)</p>
        <p style="margin-top:16px">
          <a href="https://github.com/hwkim3330/keti-tsn-cli-ui" target="_blank" style="color:#3b82f6">GitHub Repository</a>
        </p>
      </div>
    </div>
  `;
}

function saveSettings() {
  alert('Settings saved');
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

});
