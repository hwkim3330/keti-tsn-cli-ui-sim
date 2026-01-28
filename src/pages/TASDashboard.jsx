import { useState, useEffect } from 'react'
import { useDevices } from '../contexts/DeviceContext'

const colors = {
  text: '#1e293b',
  textMuted: '#64748b',
  border: '#e2e8f0',
  bgAlt: '#f1f5f9',
  success: '#059669',
  warning: '#d97706',
  error: '#dc2626',
}

const tcColors = {
  0: '#94a3b8', 1: '#f97316', 2: '#eab308', 3: '#22c55e',
  4: '#06b6d4', 5: '#3b82f6', 6: '#8b5cf6', 7: '#ec4899',
}

const tcNames = ['BE(BG)', 'BE', 'EE', 'CA', 'Video', 'Voice', 'IC', 'NC']

// Default TAS config: 8 slots x 125ms = 1s cycle
const DEFAULT_TAS_CONFIG = {
  gateEnabled: true,
  cycleTimeNs: 1000000000, // 1 second
  adminGateStates: 255,
  guardBandNs: 256,
  adminControlList: [
    { gateStates: 0b00000011, timeInterval: 125000000 }, // Slot 0: TC0+TC1
    { gateStates: 0b00000101, timeInterval: 125000000 }, // Slot 1: TC0+TC2
    { gateStates: 0b00001001, timeInterval: 125000000 }, // Slot 2: TC0+TC3
    { gateStates: 0b00010001, timeInterval: 125000000 }, // Slot 3: TC0+TC4
    { gateStates: 0b00100001, timeInterval: 125000000 }, // Slot 4: TC0+TC5
    { gateStates: 0b01000001, timeInterval: 125000000 }, // Slot 5: TC0+TC6
    { gateStates: 0b10000001, timeInterval: 125000000 }, // Slot 6: TC0+TC7
    { gateStates: 0b00000001, timeInterval: 125000000 }, // Slot 7: TC0 only
  ]
}

export default function TASDashboard() {
  const { devices, selectedDevice, setSelectedDevice } = useDevices()
  const [tasConfig, setTasConfig] = useState(DEFAULT_TAS_CONFIG)
  const [testRunning, setTestRunning] = useState(false)
  const [testResults, setTestResults] = useState(null)
  const [selectedPort, setSelectedPort] = useState(8)

  // Simulate test
  const runTest = () => {
    setTestRunning(true)
    setTestResults(null)

    // Simulate test running for 5 seconds
    setTimeout(() => {
      // Generate simulated results
      const results = {}
      for (let tc = 0; tc < 8; tc++) {
        const isOpen = (tasConfig.adminControlList[tc]?.gateStates >> tc) & 1
        results[tc] = {
          count: 50 + Math.floor(Math.random() * 50),
          avgMs: isOpen ? 10 + Math.random() * 5 : 100 + Math.random() * 50,
          minMs: isOpen ? 5 + Math.random() * 3 : 80 + Math.random() * 20,
          maxMs: isOpen ? 15 + Math.random() * 10 : 150 + Math.random() * 50,
        }
      }
      setTestResults(results)
      setTestRunning(false)
    }, 3000)
  }

  const toggleGate = () => {
    setTasConfig(prev => ({ ...prev, gateEnabled: !prev.gateEnabled }))
  }

  const cellStyle = { padding: '8px 10px', borderBottom: `1px solid ${colors.border}`, fontSize: '0.75rem' }
  const headerStyle = { ...cellStyle, fontWeight: '600', background: colors.bgAlt }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">TAS Dashboard</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{
            fontSize: '0.75rem',
            padding: '4px 10px',
            background: tasConfig.gateEnabled ? '#dcfce7' : '#fef2f2',
            color: tasConfig.gateEnabled ? colors.success : colors.error,
            borderRadius: '6px',
            fontWeight: '600'
          }}>
            {tasConfig.gateEnabled ? '● TAS Enabled' : '○ TAS Disabled'}
          </span>
          <button className="btn btn-secondary" onClick={toggleGate}>
            {tasConfig.gateEnabled ? 'Disable' : 'Enable'}
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

      {/* Main Grid: TAS Config + Traffic Test */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        {/* TAS Configuration Matrix */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Gate Control List</h2>
            <span style={{ fontSize: '0.7rem', color: colors.textMuted }}>
              {selectedDevice?.name} - Port {selectedPort}
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem', fontFamily: 'monospace' }}>
              <thead>
                <tr>
                  <th style={{ ...headerStyle, width: '50px', textAlign: 'center' }}>Slot</th>
                  {[0,1,2,3,4,5,6,7].map(tc => (
                    <th key={tc} style={{ ...headerStyle, width: '40px', textAlign: 'center', background: tcColors[tc], color: '#fff' }}>
                      TC{tc}
                    </th>
                  ))}
                  <th style={{ ...headerStyle, textAlign: 'center' }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {tasConfig.adminControlList.map((entry, idx) => (
                  <tr key={idx}>
                    <td style={{ ...cellStyle, textAlign: 'center', fontWeight: '600' }}>#{idx}</td>
                    {[0,1,2,3,4,5,6,7].map(tc => {
                      const isOpen = (entry.gateStates >> tc) & 1
                      return (
                        <td key={tc} style={{ ...cellStyle, textAlign: 'center', background: isOpen ? '#dcfce7' : '#fef2f2' }}>
                          {isOpen ? '●' : '○'}
                        </td>
                      )
                    })}
                    <td style={{ ...cellStyle, textAlign: 'center', color: colors.textMuted }}>
                      {(entry.timeInterval / 1000000).toFixed(0)}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '0.7rem', color: colors.textMuted }}>
            <span>Cycle: {(tasConfig.cycleTimeNs / 1000000).toFixed(0)}ms</span>
            <span>Entries: {tasConfig.adminControlList.length}</span>
            <span>Guard: {tasConfig.guardBandNs}ns</span>
          </div>
        </div>

        {/* Traffic Test */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Traffic Test</h2>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginBottom: '8px' }}>Traffic Classes to Test:</div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[0,1,2,3,4,5,6,7].map(tc => (
                <div key={tc} style={{
                  padding: '6px 10px',
                  borderRadius: '4px',
                  background: tcColors[tc],
                  color: '#fff',
                  fontSize: '0.7rem',
                  fontWeight: '600'
                }}>
                  TC{tc}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginBottom: '4px' }}>VLAN ID</div>
              <input type="number" defaultValue={100} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: `1px solid ${colors.border}` }} />
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginBottom: '4px' }}>PPS</div>
              <input type="number" defaultValue={100} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: `1px solid ${colors.border}` }} />
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginBottom: '4px' }}>Duration (s)</div>
              <input type="number" defaultValue={5} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: `1px solid ${colors.border}` }} />
            </div>
          </div>

          <button
            className={testRunning ? 'btn btn-warning' : 'btn btn-primary'}
            onClick={testRunning ? () => setTestRunning(false) : runTest}
            style={{ width: '100%' }}
          >
            {testRunning ? '● Running...' : 'Start Test'}
          </button>

          {testRunning && (
            <div style={{ marginTop: '12px', padding: '12px', background: '#fffbeb', borderRadius: '6px', fontSize: '0.75rem', color: '#92400e' }}>
              Capturing packets... Please wait.
            </div>
          )}
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
                <th style={{ ...headerStyle, width: '80px' }}>TC</th>
                <th style={headerStyle}>Name</th>
                <th style={{ ...headerStyle, textAlign: 'right' }}>Count</th>
                <th style={{ ...headerStyle, textAlign: 'right' }}>Avg (ms)</th>
                <th style={{ ...headerStyle, textAlign: 'right' }}>Min (ms)</th>
                <th style={{ ...headerStyle, textAlign: 'right' }}>Max (ms)</th>
                <th style={{ ...headerStyle, textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(testResults).map(([tc, stats]) => {
                const isShaping = stats.avgMs > 50
                return (
                  <tr key={tc}>
                    <td style={cellStyle}>
                      <span style={{ padding: '2px 8px', borderRadius: '4px', background: tcColors[tc], color: '#fff', fontWeight: '600' }}>
                        TC{tc}
                      </span>
                    </td>
                    <td style={cellStyle}>{tcNames[tc]}</td>
                    <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{stats.count}</td>
                    <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{stats.avgMs.toFixed(2)}</td>
                    <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{stats.minMs.toFixed(2)}</td>
                    <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{stats.maxMs.toFixed(2)}</td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: isShaping ? '#fef3c7' : '#dcfce7',
                        color: isShaping ? '#92400e' : '#166534',
                        fontSize: '0.65rem',
                        fontWeight: '600'
                      }}>
                        {isShaping ? 'Shaped' : 'Pass-through'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* GCL Timeline Visualization */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">GCL Timeline</h2>
          <span style={{ fontSize: '0.7rem', color: colors.textMuted }}>1 second cycle</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {[0,1,2,3,4,5,6,7].map(tc => (
            <div key={tc} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '40px', fontSize: '0.7rem', fontWeight: '600', color: tcColors[tc] }}>TC{tc}</div>
              <div style={{ flex: 1, display: 'flex', height: '20px', borderRadius: '4px', overflow: 'hidden', border: `1px solid ${colors.border}` }}>
                {tasConfig.adminControlList.map((entry, slotIdx) => {
                  const isOpen = (entry.gateStates >> tc) & 1
                  const widthPercent = (entry.timeInterval / tasConfig.cycleTimeNs) * 100
                  return (
                    <div
                      key={slotIdx}
                      style={{
                        width: `${widthPercent}%`,
                        background: isOpen ? tcColors[tc] : '#f1f5f9',
                        opacity: isOpen ? 1 : 0.3,
                        borderRight: slotIdx < 7 ? `1px solid ${colors.border}` : 'none'
                      }}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.65rem', color: colors.textMuted }}>
          <span>0ms</span>
          <span>250ms</span>
          <span>500ms</span>
          <span>750ms</span>
          <span>1000ms</span>
        </div>
      </div>
    </div>
  )
}
