import { useState, useEffect, useRef } from 'react'
import { useDevices } from '../contexts/DeviceContext'

const colors = {
  text: '#1a1a1a',
  textSecondary: '#4a4a4a',
  textMuted: '#6b6b6b',
  border: '#d4d4d4',
  borderLight: '#e8e8e8',
  bgAlt: '#f0f0f0',
  success: '#16a34a',
  warning: '#ca8a04',
}

const tcColors = {
  0: '#9ca3af', 1: '#fb923c', 2: '#fbbf24', 3: '#4ade80',
  4: '#22d3ee', 5: '#60a5fa', 6: '#a78bfa', 7: '#f472b6',
}

const tcNames = ['BE(BG)', 'BE', 'EE', 'CA', 'Video', 'Voice', 'IC', 'NC']

const DEFAULT_CBS_CONFIG = [
  { tc: 0, cbsEnabled: false, idleSlope: 0, sendSlope: 0, hiCredit: 0, loCredit: 0 },
  { tc: 1, cbsEnabled: true, idleSlope: 100000, sendSlope: -900000, hiCredit: 15000, loCredit: -135000 },
  { tc: 2, cbsEnabled: true, idleSlope: 200000, sendSlope: -800000, hiCredit: 30000, loCredit: -120000 },
  { tc: 3, cbsEnabled: false, idleSlope: 0, sendSlope: 0, hiCredit: 0, loCredit: 0 },
  { tc: 4, cbsEnabled: false, idleSlope: 0, sendSlope: 0, hiCredit: 0, loCredit: 0 },
  { tc: 5, cbsEnabled: true, idleSlope: 300000, sendSlope: -700000, hiCredit: 45000, loCredit: -105000 },
  { tc: 6, cbsEnabled: false, idleSlope: 0, sendSlope: 0, hiCredit: 0, loCredit: 0 },
  { tc: 7, cbsEnabled: true, idleSlope: 400000, sendSlope: -600000, hiCredit: 60000, loCredit: -90000 },
]

export default function CBSDashboard() {
  const { devices, selectedDevice, setSelectedDevice } = useDevices()
  const [cbsConfig, setCbsConfig] = useState(DEFAULT_CBS_CONFIG)
  const [selectedPort, setSelectedPort] = useState(8)
  const [testRunning, setTestRunning] = useState(false)
  const [testProgress, setTestProgress] = useState(0)
  const [testResults, setTestResults] = useState(null)
  const [creditData, setCreditData] = useState({})
  const canvasRef = useRef(null)

  // Simulate credit fluctuation during test
  useEffect(() => {
    if (!testRunning) return

    const interval = setInterval(() => {
      setCreditData(prev => {
        const newData = {}
        cbsConfig.filter(q => q.cbsEnabled).forEach(q => {
          const history = prev[q.tc] || []
          const lastCredit = history.length > 0 ? history[history.length - 1] : 0
          const delta = (Math.random() - 0.5) * (q.hiCredit * 0.3)
          let newCredit = lastCredit + delta
          newCredit = Math.max(q.loCredit, Math.min(q.hiCredit, newCredit))
          newData[q.tc] = [...history.slice(-100), newCredit]
        })
        return newData
      })
    }, 50)

    return () => clearInterval(interval)
  }, [testRunning, cbsConfig])

  // Draw credit graph
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    const padding = { top: 20, right: 20, bottom: 30, left: 60 }

    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)

    const graphWidth = width - padding.left - padding.right
    const graphHeight = height - padding.top - padding.bottom

    // Grid
    ctx.strokeStyle = '#eee'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (graphHeight * i / 4)
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(width - padding.right, y)
      ctx.stroke()
    }

    // Zero line
    ctx.strokeStyle = '#999'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    const zeroY = padding.top + graphHeight / 2
    ctx.beginPath()
    ctx.moveTo(padding.left, zeroY)
    ctx.lineTo(width - padding.right, zeroY)
    ctx.stroke()
    ctx.setLineDash([])

    // Y-axis labels
    ctx.fillStyle = colors.textMuted
    ctx.font = '10px -apple-system, sans-serif'
    ctx.textAlign = 'right'
    const maxCredit = 80000
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (graphHeight * i / 4)
      const value = maxCredit - (maxCredit * 2 * i / 4)
      ctx.fillText(`${(value/1000).toFixed(0)}k`, padding.left - 8, y + 3)
    }

    // Draw credit lines
    cbsConfig.filter(q => q.cbsEnabled).forEach(q => {
      const history = creditData[q.tc] || []
      if (history.length < 2) return

      ctx.strokeStyle = tcColors[q.tc]
      ctx.lineWidth = 1.5
      ctx.beginPath()

      history.forEach((credit, i) => {
        const x = padding.left + (i / (history.length - 1)) * graphWidth
        const normalizedCredit = (maxCredit - credit) / (maxCredit * 2)
        const y = padding.top + normalizedCredit * graphHeight

        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    })

  }, [creditData, cbsConfig])

  const runTest = () => {
    setTestRunning(true)
    setTestProgress(0)
    setTestResults(null)
    setCreditData({})

    const duration = 5000
    const startTime = Date.now()

    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(100, (elapsed / duration) * 100)
      setTestProgress(progress)

      if (progress >= 100) {
        clearInterval(progressInterval)

        const results = {}
        cbsConfig.forEach(q => {
          const isCbs = q.cbsEnabled
          results[q.tc] = {
            txCount: 2500 + Math.floor(Math.random() * 200),
            rxCount: isCbs ? 2400 + Math.floor(Math.random() * 150) : 2500 + Math.floor(Math.random() * 200),
            avgLatency: isCbs ? 3 + Math.random() * 2 : 0.3 + Math.random() * 0.2,
            maxLatency: isCbs ? 8 + Math.random() * 4 : 0.8 + Math.random() * 0.4,
            bandwidth: isCbs ? (q.idleSlope / 10000).toFixed(1) : '-',
            jitter: isCbs ? 1.5 + Math.random() * 1 : 0.05 + Math.random() * 0.05,
          }
        })
        setTestResults(results)
        setTestRunning(false)
      }
    }, 50)
  }

  const toggleCBS = (tc) => {
    setCbsConfig(prev => prev.map(q =>
      q.tc === tc ? { ...q, cbsEnabled: !q.cbsEnabled } : q
    ))
  }

  const totalBandwidth = cbsConfig.reduce((sum, q) => sum + (q.cbsEnabled ? q.idleSlope : 0), 0) / 10000000 * 100

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Credit-Based Shaper</h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>
            Reserved: {totalBandwidth.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Board & Port Selection */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Board</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {devices.map(device => (
              <button
                key={device.id}
                onClick={() => setSelectedDevice(device)}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: selectedDevice?.id === device.id ? '2px solid #333' : `1px solid ${colors.borderLight}`,
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: '500'
                }}
              >
                {device.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Port</div>
          <select
            value={selectedPort}
            onChange={e => setSelectedPort(Number(e.target.value))}
            style={{ padding: '10px 14px', minWidth: '120px' }}
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
          <h2 className="card-title">Queue Configuration</h2>
          <span style={{ fontSize: '0.7rem', color: colors.textMuted }}>
            {selectedDevice?.name} Port {selectedPort} (1000 Mbps)
          </span>
        </div>

        <table style={{ fontSize: '0.8rem' }}>
          <thead>
            <tr>
              <th style={{ width: '70px' }}>TC</th>
              <th>Class</th>
              <th style={{ textAlign: 'center' }}>CBS</th>
              <th style={{ textAlign: 'right' }}>Idle Slope</th>
              <th style={{ textAlign: 'right' }}>Send Slope</th>
              <th style={{ textAlign: 'right' }}>Hi Credit</th>
              <th style={{ textAlign: 'right' }}>Lo Credit</th>
              <th style={{ textAlign: 'right' }}>BW</th>
            </tr>
          </thead>
          <tbody>
            {cbsConfig.map(q => (
              <tr key={q.tc}>
                <td>
                  <span style={{
                    display: 'inline-block',
                    padding: '3px 10px',
                    borderRadius: '4px',
                    background: tcColors[q.tc],
                    color: '#fff',
                    fontWeight: '500',
                    fontSize: '0.7rem'
                  }}>
                    TC{q.tc}
                  </span>
                </td>
                <td style={{ color: colors.textMuted }}>{tcNames[q.tc]}</td>
                <td style={{ textAlign: 'center' }}>
                  <button
                    onClick={() => toggleCBS(q.tc)}
                    style={{
                      padding: '3px 10px',
                      borderRadius: '4px',
                      border: 'none',
                      background: q.cbsEnabled ? '#e8f5e9' : colors.bgAlt,
                      color: q.cbsEnabled ? '#2e7d32' : colors.textMuted,
                      fontSize: '0.7rem',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    {q.cbsEnabled ? 'ON' : 'OFF'}
                  </button>
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  {q.cbsEnabled ? q.idleSlope.toLocaleString() : '-'}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  {q.cbsEnabled ? q.sendSlope.toLocaleString() : '-'}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  {q.cbsEnabled ? q.hiCredit.toLocaleString() : '-'}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  {q.cbsEnabled ? q.loCredit.toLocaleString() : '-'}
                </td>
                <td style={{ textAlign: 'right', fontWeight: '500' }}>
                  {q.cbsEnabled ? `${(q.idleSlope / 10000000 * 100).toFixed(1)}%` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Credit Monitor */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Credit Monitor</h2>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {cbsConfig.filter(q => q.cbsEnabled).map(q => (
              <span key={q.tc} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem' }}>
                <span style={{ width: '10px', height: '10px', background: tcColors[q.tc], borderRadius: '2px' }}></span>
                TC{q.tc}
              </span>
            ))}
          </div>
        </div>

        <canvas
          ref={canvasRef}
          width={900}
          height={220}
          style={{
            width: '100%',
            height: '220px',
            borderRadius: '8px',
            border: `1px solid ${colors.borderLight}`,
            background: testRunning ? '#fff' : colors.bgAlt
          }}
        />

        {!testRunning && !testResults && (
          <div style={{ textAlign: 'center', padding: '12px', color: colors.textMuted, fontSize: '0.8rem', marginTop: '-180px', position: 'relative', zIndex: 1 }}>
            Start a test to see credit fluctuation
          </div>
        )}
      </div>

      {/* Traffic Test */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Bandwidth Test</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginBottom: '6px' }}>VLAN ID</div>
            <input type="number" defaultValue={100} style={{ width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginBottom: '6px' }}>PPS / TC</div>
            <input type="number" defaultValue={500} style={{ width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginBottom: '6px' }}>Duration (s)</div>
            <input type="number" defaultValue={5} style={{ width: '100%' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              className="btn btn-primary"
              onClick={testRunning ? null : runTest}
              disabled={testRunning}
              style={{ width: '100%' }}
            >
              {testRunning ? `${testProgress.toFixed(0)}%` : 'Start Test'}
            </button>
          </div>
        </div>

        {testRunning && (
          <div style={{ height: '4px', background: colors.bgAlt, borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${testProgress}%`, height: '100%', background: '#333', transition: 'width 0.1s' }} />
          </div>
        )}
      </div>

      {/* Test Results */}
      {testResults && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Test Results</h2>
            <span style={{ fontSize: '0.7rem', color: colors.success, fontWeight: '500' }}>Complete</span>
          </div>

          <table style={{ fontSize: '0.8rem' }}>
            <thead>
              <tr>
                <th style={{ width: '70px' }}>TC</th>
                <th>Class</th>
                <th style={{ textAlign: 'center' }}>CBS</th>
                <th style={{ textAlign: 'right' }}>TX</th>
                <th style={{ textAlign: 'right' }}>RX</th>
                <th style={{ textAlign: 'right' }}>Avg Latency</th>
                <th style={{ textAlign: 'right' }}>Max Latency</th>
                <th style={{ textAlign: 'right' }}>Jitter</th>
                <th style={{ textAlign: 'right' }}>BW Alloc</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(testResults).map(([tc, stats]) => {
                const queue = cbsConfig.find(q => q.tc === parseInt(tc))
                const isCbs = queue?.cbsEnabled
                return (
                  <tr key={tc}>
                    <td>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: '4px',
                        background: tcColors[tc],
                        color: '#fff',
                        fontWeight: '500',
                        fontSize: '0.7rem'
                      }}>
                        TC{tc}
                      </span>
                    </td>
                    <td style={{ color: colors.textMuted }}>{tcNames[tc]}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: isCbs ? '#e8f5e9' : colors.bgAlt,
                        color: isCbs ? '#2e7d32' : colors.textMuted,
                        fontSize: '0.65rem',
                        fontWeight: '500'
                      }}>
                        {isCbs ? 'ON' : 'OFF'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{stats.txCount}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{stats.rxCount}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{stats.avgLatency.toFixed(2)}ms</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{stats.maxLatency.toFixed(2)}ms</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{stats.jitter.toFixed(2)}ms</td>
                    <td style={{ textAlign: 'right', fontWeight: '500' }}>{stats.bandwidth}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div style={{ marginTop: '16px', padding: '14px', background: colors.bgAlt, borderRadius: '8px', fontSize: '0.8rem', color: colors.textSecondary }}>
            <strong>Analysis:</strong> CBS-enabled queues (TC1, TC2, TC5, TC7) show controlled bandwidth allocation with bounded latency.
            Non-CBS queues use best-effort delivery.
          </div>
        </div>
      )}
    </div>
  )
}
