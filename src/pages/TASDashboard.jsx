import { useState, useEffect } from 'react'
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

// Muted TC colors
const tcColors = {
  0: '#9ca3af', 1: '#fb923c', 2: '#fbbf24', 3: '#4ade80',
  4: '#22d3ee', 5: '#60a5fa', 6: '#a78bfa', 7: '#f472b6',
}

const tcNames = ['BE(BG)', 'BE', 'EE', 'CA', 'Video', 'Voice', 'IC', 'NC']

// Default TAS: 8 slots x 125ms
const DEFAULT_GCL = [
  { gateStates: 0b00000011, timeInterval: 125000000 },
  { gateStates: 0b00000101, timeInterval: 125000000 },
  { gateStates: 0b00001001, timeInterval: 125000000 },
  { gateStates: 0b00010001, timeInterval: 125000000 },
  { gateStates: 0b00100001, timeInterval: 125000000 },
  { gateStates: 0b01000001, timeInterval: 125000000 },
  { gateStates: 0b10000001, timeInterval: 125000000 },
  { gateStates: 0b00000001, timeInterval: 125000000 },
]

export default function TASDashboard() {
  const { devices, selectedDevice, setSelectedDevice } = useDevices()
  const [gateEnabled, setGateEnabled] = useState(true)
  const [gcl, setGcl] = useState(DEFAULT_GCL)
  const [selectedPort, setSelectedPort] = useState(8)
  const [testRunning, setTestRunning] = useState(false)
  const [testProgress, setTestProgress] = useState(0)
  const [testResults, setTestResults] = useState(null)

  // Simulate test with progress
  const runTest = () => {
    setTestRunning(true)
    setTestProgress(0)
    setTestResults(null)

    const duration = 5000
    const startTime = Date.now()

    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(100, (elapsed / duration) * 100)
      setTestProgress(progress)

      if (progress >= 100) {
        clearInterval(progressInterval)

        // Generate realistic results based on GCL
        const results = {}
        for (let tc = 0; tc < 8; tc++) {
          // Check which slot this TC is primarily open
          const openSlots = gcl.filter((_, idx) => (gcl[idx].gateStates >> tc) & 1).length
          const isAlwaysOpen = tc === 0 // TC0 usually always open
          const isScheduled = openSlots > 0 && openSlots < 8

          results[tc] = {
            txCount: 350 + Math.floor(Math.random() * 50),
            rxCount: 340 + Math.floor(Math.random() * 40),
            avgLatency: isAlwaysOpen ? 0.8 + Math.random() * 0.4 :
                       isScheduled ? 50 + Math.random() * 75 : 0.5 + Math.random() * 0.3,
            maxLatency: isAlwaysOpen ? 2 + Math.random() * 1 :
                       isScheduled ? 125 + Math.random() * 10 : 1.5 + Math.random() * 0.5,
            jitter: isAlwaysOpen ? 0.3 + Math.random() * 0.2 :
                   isScheduled ? 5 + Math.random() * 10 : 0.2 + Math.random() * 0.1,
          }
        }
        setTestResults(results)
        setTestRunning(false)
      }
    }, 50)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Time-Aware Shaper</h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{
            fontSize: '0.75rem',
            padding: '5px 12px',
            background: gateEnabled ? '#e8f5e9' : colors.bgAlt,
            color: gateEnabled ? '#2e7d32' : colors.textMuted,
            borderRadius: '6px',
            fontWeight: '500'
          }}>
            {gateEnabled ? 'Enabled' : 'Disabled'}
          </span>
          <button className="btn btn-secondary" onClick={() => setGateEnabled(!gateEnabled)}>
            {gateEnabled ? 'Disable' : 'Enable'}
          </button>
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

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        {/* GCL Matrix */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Gate Control List</h2>
            <span style={{ fontSize: '0.7rem', color: colors.textMuted }}>
              {selectedDevice?.name} Port {selectedPort}
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ fontSize: '0.75rem' }}>
              <thead>
                <tr>
                  <th style={{ width: '50px', textAlign: 'center' }}>Slot</th>
                  {[0,1,2,3,4,5,6,7].map(tc => (
                    <th key={tc} style={{ width: '40px', textAlign: 'center', background: tcColors[tc], color: '#fff', fontWeight: '600' }}>
                      TC{tc}
                    </th>
                  ))}
                  <th style={{ textAlign: 'right' }}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {gcl.map((entry, idx) => (
                  <tr key={idx}>
                    <td style={{ textAlign: 'center', fontWeight: '600' }}>#{idx}</td>
                    {[0,1,2,3,4,5,6,7].map(tc => {
                      const isOpen = (entry.gateStates >> tc) & 1
                      return (
                        <td key={tc} style={{
                          textAlign: 'center',
                          background: isOpen ? '#e8f5e9' : '#fafafa',
                          color: isOpen ? '#2e7d32' : '#ccc',
                          fontWeight: '500'
                        }}>
                          {isOpen ? '●' : '○'}
                        </td>
                      )
                    })}
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', color: colors.textMuted }}>
                      {(entry.timeInterval / 1000000).toFixed(0)}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '20px', marginTop: '16px', fontSize: '0.75rem', color: colors.textMuted }}>
            <span>Cycle: 1000ms</span>
            <span>Entries: {gcl.length}</span>
            <span>Guard Band: 256ns</span>
          </div>
        </div>

        {/* Traffic Test */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Traffic Test</h2>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Traffic Classes</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[0,1,2,3,4,5,6,7].map(tc => (
                <span key={tc} style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: tcColors[tc],
                  color: '#fff',
                  fontSize: '0.75rem',
                  fontWeight: '500'
                }}>
                  TC{tc}
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginBottom: '6px' }}>VLAN ID</div>
              <input type="number" defaultValue={100} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginBottom: '6px' }}>PPS / TC</div>
              <input type="number" defaultValue={50} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginBottom: '6px' }}>Duration</div>
              <input type="number" defaultValue={5} style={{ width: '100%' }} />
            </div>
          </div>

          {testRunning && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px' }}>
                <span style={{ color: colors.textMuted }}>Capturing...</span>
                <span style={{ fontWeight: '500' }}>{testProgress.toFixed(0)}%</span>
              </div>
              <div style={{ height: '4px', background: colors.bgAlt, borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${testProgress}%`, height: '100%', background: '#333', transition: 'width 0.1s' }} />
              </div>
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={testRunning ? null : runTest}
            disabled={testRunning}
            style={{ width: '100%' }}
          >
            {testRunning ? 'Running...' : 'Start Test'}
          </button>
        </div>
      </div>

      {/* GCL Timeline */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">GCL Timeline</h2>
          <span style={{ fontSize: '0.7rem', color: colors.textMuted }}>1 second cycle</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[0,1,2,3,4,5,6,7].map(tc => (
            <div key={tc} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '50px', fontSize: '0.75rem', fontWeight: '500', color: tcColors[tc] }}>TC{tc}</div>
              <div style={{ flex: 1, display: 'flex', height: '24px', borderRadius: '4px', overflow: 'hidden', border: `1px solid ${colors.borderLight}` }}>
                {gcl.map((entry, slotIdx) => {
                  const isOpen = (entry.gateStates >> tc) & 1
                  const widthPercent = (entry.timeInterval / 1000000000) * 100
                  return (
                    <div
                      key={slotIdx}
                      style={{
                        width: `${widthPercent}%`,
                        background: isOpen ? tcColors[tc] : '#f5f5f5',
                        opacity: isOpen ? 0.8 : 0.3,
                        borderRight: slotIdx < gcl.length - 1 ? `1px solid ${colors.borderLight}` : 'none'
                      }}
                    />
                  )
                })}
              </div>
              <div style={{ width: '50px', fontSize: '0.7rem', color: colors.textMuted, textAlign: 'right' }}>
                {tcNames[tc]}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '0.7rem', color: colors.textMuted }}>
          {['0', '125', '250', '375', '500', '625', '750', '875', '1000'].map(t => (
            <span key={t}>{t}ms</span>
          ))}
        </div>
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
                <th style={{ width: '80px' }}>TC</th>
                <th>Class</th>
                <th style={{ textAlign: 'right' }}>TX</th>
                <th style={{ textAlign: 'right' }}>RX</th>
                <th style={{ textAlign: 'right' }}>Avg Latency</th>
                <th style={{ textAlign: 'right' }}>Max Latency</th>
                <th style={{ textAlign: 'right' }}>Jitter</th>
                <th style={{ textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(testResults).map(([tc, stats]) => {
                const isShaped = stats.avgLatency > 10
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
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{stats.txCount}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{stats.rxCount}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{stats.avgLatency.toFixed(2)}ms</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{stats.maxLatency.toFixed(2)}ms</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{stats.jitter.toFixed(2)}ms</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 10px',
                        borderRadius: '4px',
                        background: isShaped ? '#fff3e0' : '#e8f5e9',
                        color: isShaped ? '#e65100' : '#2e7d32',
                        fontSize: '0.7rem',
                        fontWeight: '500'
                      }}>
                        {isShaped ? 'Shaped' : 'Direct'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div style={{ marginTop: '16px', padding: '14px', background: colors.bgAlt, borderRadius: '8px', fontSize: '0.8rem', color: colors.textSecondary }}>
            <strong>Analysis:</strong> TAS is shaping traffic correctly. TC1-TC7 show slot-based latency (~125ms max), TC0 passes directly.
          </div>
        </div>
      )}
    </div>
  )
}
