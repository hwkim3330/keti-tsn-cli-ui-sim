import { useState, useEffect, useRef } from 'react'
import { useDevices } from '../contexts/DeviceContext'

const colors = {
  text: '#1e293b',
  textMuted: '#64748b',
  border: '#e2e8f0',
  bgAlt: '#f1f5f9',
  success: '#059669',
  warning: '#d97706',
  error: '#dc2626',
  primary: '#3b82f6',
}

const tcColors = {
  0: '#94a3b8', 1: '#f97316', 2: '#eab308', 3: '#22c55e',
  4: '#06b6d4', 5: '#3b82f6', 6: '#8b5cf6', 7: '#ec4899',
}

const tcNames = ['BE(BG)', 'BE', 'EE', 'CA', 'Video', 'Voice', 'IC', 'NC']

// Default CBS config
const DEFAULT_CBS_CONFIG = {
  enabled: true,
  portSpeed: 1000, // Mbps
  queues: [
    { tc: 0, idleSlope: 0, sendSlope: 0, hiCredit: 0, loCredit: 0, cbsEnabled: false },
    { tc: 1, idleSlope: 100000, sendSlope: -900000, hiCredit: 15000, loCredit: -135000, cbsEnabled: true },
    { tc: 2, idleSlope: 200000, sendSlope: -800000, hiCredit: 30000, loCredit: -120000, cbsEnabled: true },
    { tc: 3, idleSlope: 0, sendSlope: 0, hiCredit: 0, loCredit: 0, cbsEnabled: false },
    { tc: 4, idleSlope: 0, sendSlope: 0, hiCredit: 0, loCredit: 0, cbsEnabled: false },
    { tc: 5, idleSlope: 300000, sendSlope: -700000, hiCredit: 45000, loCredit: -105000, cbsEnabled: true },
    { tc: 6, idleSlope: 0, sendSlope: 0, hiCredit: 0, loCredit: 0, cbsEnabled: false },
    { tc: 7, idleSlope: 400000, sendSlope: -600000, hiCredit: 60000, loCredit: -90000, cbsEnabled: true },
  ]
}

export default function CBSDashboard() {
  const { devices, selectedDevice, setSelectedDevice } = useDevices()
  const [cbsConfig, setCbsConfig] = useState(DEFAULT_CBS_CONFIG)
  const [selectedPort, setSelectedPort] = useState(8)
  const [testRunning, setTestRunning] = useState(false)
  const [testResults, setTestResults] = useState(null)
  const [creditHistory, setCreditHistory] = useState({})
  const canvasRef = useRef(null)

  // Simulate credit fluctuation
  useEffect(() => {
    if (!testRunning) return

    const interval = setInterval(() => {
      const newHistory = {}
      cbsConfig.queues.forEach(q => {
        if (!q.cbsEnabled) return
        const prev = creditHistory[q.tc] || []
        const lastCredit = prev.length > 0 ? prev[prev.length - 1].credit : 0
        const delta = (Math.random() - 0.5) * (q.hiCredit / 2)
        let newCredit = lastCredit + delta
        newCredit = Math.max(q.loCredit, Math.min(q.hiCredit, newCredit))
        newHistory[q.tc] = [...prev.slice(-50), { time: Date.now(), credit: newCredit }]
      })
      setCreditHistory(newHistory)
    }, 100)

    return () => clearInterval(interval)
  }, [testRunning, cbsConfig.queues])

  // Draw credit graph
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !testRunning) return

    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    const padding = 40

    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)

    // Grid
    ctx.strokeStyle = colors.border
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = padding + (height - 2 * padding) * i / 4
      ctx.beginPath()
      ctx.moveTo(padding, y)
      ctx.lineTo(width - padding, y)
      ctx.stroke()
    }

    // Draw zero line
    ctx.strokeStyle = colors.textMuted
    ctx.setLineDash([5, 5])
    const zeroY = padding + (height - 2 * padding) / 2
    ctx.beginPath()
    ctx.moveTo(padding, zeroY)
    ctx.lineTo(width - padding, zeroY)
    ctx.stroke()
    ctx.setLineDash([])

    // Draw credit lines for each CBS-enabled TC
    const maxCredit = 80000
    cbsConfig.queues.forEach(q => {
      if (!q.cbsEnabled || !creditHistory[q.tc]) return

      ctx.strokeStyle = tcColors[q.tc]
      ctx.lineWidth = 2
      ctx.beginPath()

      const history = creditHistory[q.tc]
      history.forEach((point, i) => {
        const x = padding + (i / (history.length - 1 || 1)) * (width - 2 * padding)
        const normalizedCredit = (maxCredit - point.credit) / (maxCredit * 2)
        const y = padding + normalizedCredit * (height - 2 * padding)

        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    })

  }, [creditHistory, cbsConfig.queues, testRunning])

  const runTest = () => {
    setTestRunning(true)
    setTestResults(null)
    setCreditHistory({})

    setTimeout(() => {
      const results = {}
      cbsConfig.queues.forEach(q => {
        const isCbs = q.cbsEnabled
        results[q.tc] = {
          txCount: 500 + Math.floor(Math.random() * 100),
          rxCount: isCbs ? 450 + Math.floor(Math.random() * 50) : 500 + Math.floor(Math.random() * 100),
          avgLatency: isCbs ? 5 + Math.random() * 3 : 0.5 + Math.random() * 0.5,
          avgJitter: isCbs ? 2 + Math.random() * 1 : 0.1 + Math.random() * 0.1,
          bandwidth: isCbs ? (q.idleSlope / 10000).toFixed(1) : '-',
        }
      })
      setTestResults(results)
      setTestRunning(false)
    }, 5000)
  }

  const toggleCBS = (tc) => {
    setCbsConfig(prev => ({
      ...prev,
      queues: prev.queues.map(q =>
        q.tc === tc ? { ...q, cbsEnabled: !q.cbsEnabled } : q
      )
    }))
  }

  const cellStyle = { padding: '8px 10px', borderBottom: `1px solid ${colors.border}`, fontSize: '0.75rem' }
  const headerStyle = { ...cellStyle, fontWeight: '600', background: colors.bgAlt }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">CBS Dashboard</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{
            fontSize: '0.75rem',
            padding: '4px 10px',
            background: cbsConfig.enabled ? '#dcfce7' : '#fef2f2',
            color: cbsConfig.enabled ? colors.success : colors.error,
            borderRadius: '6px',
            fontWeight: '600'
          }}>
            {cbsConfig.enabled ? '● CBS Enabled' : '○ CBS Disabled'}
          </span>
          <button className="btn btn-secondary" onClick={() => setCbsConfig(prev => ({ ...prev, enabled: !prev.enabled }))}>
            {cbsConfig.enabled ? 'Disable' : 'Enable'}
          </button>
          <button className="btn btn-primary">Auto Setup</button>
        </div>
      </div>

      {/* Board and Port Selection */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginBottom: '6px' }}>Select Board</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {devices.map(device => (
              <button
                key={device.id}
                onClick={() => setSelectedDevice(device)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: selectedDevice?.id === device.id ? '2px solid #3b82f6' : `1px solid ${colors.border}`,
                  background: selectedDevice?.id === device.id ? '#eff6ff' : '#fff',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: '500'
                }}
              >
                {device.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginBottom: '6px' }}>Select Port</div>
          <select
            value={selectedPort}
            onChange={e => setSelectedPort(Number(e.target.value))}
            style={{ padding: '8px 12px', borderRadius: '6px', border: `1px solid ${colors.border}`, fontSize: '0.8rem' }}
          >
            {[...Array(9)].map((_, i) => (
              <option key={i} value={i + 1}>Port {i + 1}</option>
            ))}
          </select>
        </div>
      </div>

      {/* CBS Configuration */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">CBS Queue Configuration</h2>
          <span style={{ fontSize: '0.7rem', color: colors.textMuted }}>
            {selectedDevice?.name} - Port {selectedPort} ({cbsConfig.portSpeed} Mbps)
          </span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr>
              <th style={{ ...headerStyle, width: '60px' }}>TC</th>
              <th style={headerStyle}>Name</th>
              <th style={{ ...headerStyle, textAlign: 'center' }}>CBS</th>
              <th style={{ ...headerStyle, textAlign: 'right' }}>Idle Slope (bps)</th>
              <th style={{ ...headerStyle, textAlign: 'right' }}>Send Slope (bps)</th>
              <th style={{ ...headerStyle, textAlign: 'right' }}>Hi Credit</th>
              <th style={{ ...headerStyle, textAlign: 'right' }}>Lo Credit</th>
              <th style={{ ...headerStyle, textAlign: 'right' }}>BW %</th>
            </tr>
          </thead>
          <tbody>
            {cbsConfig.queues.map(q => (
              <tr key={q.tc}>
                <td style={cellStyle}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', background: tcColors[q.tc], color: '#fff', fontWeight: '600' }}>
                    TC{q.tc}
                  </span>
                </td>
                <td style={cellStyle}>{tcNames[q.tc]}</td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>
                  <button
                    onClick={() => toggleCBS(q.tc)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: 'none',
                      background: q.cbsEnabled ? '#dcfce7' : '#fef2f2',
                      color: q.cbsEnabled ? '#166534' : '#991b1b',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    {q.cbsEnabled ? 'ON' : 'OFF'}
                  </button>
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>
                  {q.cbsEnabled ? q.idleSlope.toLocaleString() : '-'}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>
                  {q.cbsEnabled ? q.sendSlope.toLocaleString() : '-'}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>
                  {q.cbsEnabled ? q.hiCredit.toLocaleString() : '-'}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>
                  {q.cbsEnabled ? q.loCredit.toLocaleString() : '-'}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600' }}>
                  {q.cbsEnabled ? `${(q.idleSlope / 10000000).toFixed(1)}%` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: '12px', fontSize: '0.7rem', color: colors.textMuted }}>
          Total Reserved BW: {(cbsConfig.queues.reduce((sum, q) => sum + (q.cbsEnabled ? q.idleSlope : 0), 0) / 10000000).toFixed(1)}%
        </div>
      </div>

      {/* Credit Graph */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Credit Level Monitor</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {cbsConfig.queues.filter(q => q.cbsEnabled).map(q => (
              <span key={q.tc} style={{ fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '10px', height: '10px', background: tcColors[q.tc], borderRadius: '2px' }}></span>
                TC{q.tc}
              </span>
            ))}
          </div>
        </div>

        <canvas
          ref={canvasRef}
          width={800}
          height={200}
          style={{ width: '100%', height: '200px', borderRadius: '8px', border: `1px solid ${colors.border}`, background: testRunning ? '#fff' : colors.bgAlt }}
        />

        {!testRunning && (
          <div style={{ textAlign: 'center', padding: '20px', color: colors.textMuted, fontSize: '0.8rem' }}>
            Start a test to see credit fluctuation
          </div>
        )}
      </div>

      {/* Traffic Test */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Bandwidth Test</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginBottom: '4px' }}>VLAN ID</div>
            <input type="number" defaultValue={100} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: `1px solid ${colors.border}` }} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginBottom: '4px' }}>PPS per TC</div>
            <input type="number" defaultValue={500} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: `1px solid ${colors.border}` }} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginBottom: '4px' }}>Duration (s)</div>
            <input type="number" defaultValue={5} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: `1px solid ${colors.border}` }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              className={testRunning ? 'btn btn-warning' : 'btn btn-primary'}
              onClick={testRunning ? () => setTestRunning(false) : runTest}
              style={{ width: '100%' }}
            >
              {testRunning ? '● Running...' : 'Start Test'}
            </button>
          </div>
        </div>
      </div>

      {/* Test Results */}
      {testResults && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Test Results</h2>
            <span style={{ fontSize: '0.7rem', color: colors.success }}>● Complete</span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <thead>
              <tr>
                <th style={{ ...headerStyle, width: '60px' }}>TC</th>
                <th style={headerStyle}>Name</th>
                <th style={{ ...headerStyle, textAlign: 'center' }}>CBS</th>
                <th style={{ ...headerStyle, textAlign: 'right' }}>TX Count</th>
                <th style={{ ...headerStyle, textAlign: 'right' }}>RX Count</th>
                <th style={{ ...headerStyle, textAlign: 'right' }}>Avg Latency (ms)</th>
                <th style={{ ...headerStyle, textAlign: 'right' }}>Avg Jitter (ms)</th>
                <th style={{ ...headerStyle, textAlign: 'right' }}>Reserved BW</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(testResults).map(([tc, stats]) => {
                const queue = cbsConfig.queues.find(q => q.tc === parseInt(tc))
                const isCbs = queue?.cbsEnabled
                return (
                  <tr key={tc}>
                    <td style={cellStyle}>
                      <span style={{ padding: '2px 8px', borderRadius: '4px', background: tcColors[tc], color: '#fff', fontWeight: '600' }}>
                        TC{tc}
                      </span>
                    </td>
                    <td style={cellStyle}>{tcNames[tc]}</td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: isCbs ? '#dcfce7' : colors.bgAlt,
                        color: isCbs ? '#166534' : colors.textMuted,
                        fontSize: '0.65rem',
                        fontWeight: '600'
                      }}>
                        {isCbs ? 'ON' : 'OFF'}
                      </span>
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{stats.txCount}</td>
                    <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{stats.rxCount}</td>
                    <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{stats.avgLatency.toFixed(2)}</td>
                    <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{stats.avgJitter.toFixed(2)}</td>
                    <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600' }}>{stats.bandwidth}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div style={{ marginTop: '16px', padding: '12px', background: colors.bgAlt, borderRadius: '8px', fontSize: '0.75rem' }}>
            <strong>Analysis:</strong> CBS-enabled queues (TC1, TC2, TC5, TC7) show controlled latency and bandwidth allocation.
            Non-CBS queues use best-effort delivery with minimal latency.
          </div>
        </div>
      )}
    </div>
  )
}
