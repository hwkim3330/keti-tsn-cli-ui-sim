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

// Generate simulated PTP data
function generatePTPData(deviceRole) {
  const isGM = deviceRole.includes('GM')
  const baseOffset = isGM ? 0 : Math.random() * 100 - 50
  const jitter = isGM ? 0 : Math.random() * 20 - 10

  return {
    offset: baseOffset + jitter,
    meanPathDelay: isGM ? 0 : 5000 + Math.random() * 2000,
    clockClass: isGM ? 6 : 248,
    clockAccuracy: isGM ? 0x21 : 0x25,
    priority1: isGM ? 128 : 255,
    priority2: isGM ? 128 : 255,
    stepsRemoved: isGM ? 0 : 1,
    portState: isGM ? 'MASTER' : 'SLAVE',
    syncInterval: -3,
    announceInterval: 0,
    pdelayReqInterval: 0,
  }
}

export default function PTPDashboard() {
  const { devices, selectedDevice, setSelectedDevice } = useDevices()
  const [ptpData, setPtpData] = useState({})
  const [offsetHistory, setOffsetHistory] = useState([])
  const [syncing, setSyncing] = useState(true)
  const canvasRef = useRef(null)

  // Update PTP data periodically
  useEffect(() => {
    const updateData = () => {
      const newData = {}
      devices.forEach(d => {
        newData[d.id] = generatePTPData(d.role)
      })
      setPtpData(newData)

      // Update offset history for selected device
      if (selectedDevice && newData[selectedDevice.id]) {
        setOffsetHistory(prev => {
          const updated = [...prev, {
            time: Date.now(),
            offset: newData[selectedDevice.id].offset
          }]
          return updated.slice(-100) // Keep last 100 points
        })
      }
    }

    updateData()
    const interval = setInterval(updateData, 1000)
    return () => clearInterval(interval)
  }, [devices, selectedDevice])

  // Draw offset graph
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || offsetHistory.length < 2) return

    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    const padding = 40

    // Clear
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

    // Y-axis labels
    ctx.fillStyle = colors.textMuted
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'right'
    const maxOffset = 100
    for (let i = 0; i <= 4; i++) {
      const y = padding + (height - 2 * padding) * i / 4
      const value = maxOffset - (maxOffset * 2 * i / 4)
      ctx.fillText(`${value.toFixed(0)}ns`, padding - 5, y + 3)
    }

    // Draw offset line
    ctx.strokeStyle = colors.primary
    ctx.lineWidth = 2
    ctx.beginPath()

    const graphWidth = width - 2 * padding
    const graphHeight = height - 2 * padding

    offsetHistory.forEach((point, i) => {
      const x = padding + (i / (offsetHistory.length - 1)) * graphWidth
      const normalizedOffset = (maxOffset - point.offset) / (maxOffset * 2)
      const y = padding + normalizedOffset * graphHeight

      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()

    // Zero line
    ctx.strokeStyle = colors.success
    ctx.lineWidth = 1
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    const zeroY = padding + graphHeight / 2
    ctx.moveTo(padding, zeroY)
    ctx.lineTo(width - padding, zeroY)
    ctx.stroke()
    ctx.setLineDash([])

  }, [offsetHistory])

  const currentData = selectedDevice ? ptpData[selectedDevice.id] : null

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">PTP Dashboard</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{
            fontSize: '0.75rem',
            padding: '4px 10px',
            background: syncing ? '#dcfce7' : '#fef2f2',
            color: syncing ? colors.success : colors.error,
            borderRadius: '6px',
            fontWeight: '600'
          }}>
            {syncing ? '● Synchronized' : '○ Not Synced'}
          </span>
          <button className="btn btn-secondary" onClick={() => setSyncing(!syncing)}>
            {syncing ? 'Stop Sync' : 'Start Sync'}
          </button>
        </div>
      </div>

      {/* Device Selector */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        {devices.map(device => (
          <button
            key={device.id}
            onClick={() => setSelectedDevice(device)}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: selectedDevice?.id === device.id ? '2px solid #3b82f6' : `1px solid ${colors.border}`,
              background: selectedDevice?.id === device.id ? '#eff6ff' : '#fff',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: '500'
            }}
          >
            <div>{device.name}</div>
            <div style={{ fontSize: '0.7rem', color: colors.textMuted }}>{device.role}</div>
          </button>
        ))}
      </div>

      {/* Main Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginBottom: '8px' }}>Clock Offset</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: Math.abs(currentData?.offset || 0) < 50 ? colors.success : colors.warning }}>
            {(currentData?.offset || 0).toFixed(1)}
          </div>
          <div style={{ fontSize: '0.7rem', color: colors.textMuted }}>nanoseconds</div>
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginBottom: '8px' }}>Mean Path Delay</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: colors.text }}>
            {((currentData?.meanPathDelay || 0) / 1000).toFixed(2)}
          </div>
          <div style={{ fontSize: '0.7rem', color: colors.textMuted }}>microseconds</div>
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginBottom: '8px' }}>Port State</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: currentData?.portState === 'MASTER' ? colors.success : colors.primary }}>
            {currentData?.portState || '-'}
          </div>
          <div style={{ fontSize: '0.7rem', color: colors.textMuted }}>current state</div>
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginBottom: '8px' }}>Steps Removed</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: colors.text }}>
            {currentData?.stepsRemoved ?? '-'}
          </div>
          <div style={{ fontSize: '0.7rem', color: colors.textMuted }}>from GM</div>
        </div>
      </div>

      {/* Offset Graph */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Clock Offset History</h2>
          <span style={{ fontSize: '0.7rem', color: colors.textMuted }}>Last 100 samples</span>
        </div>
        <canvas
          ref={canvasRef}
          width={800}
          height={250}
          style={{ width: '100%', height: '250px', borderRadius: '8px', border: `1px solid ${colors.border}` }}
        />
      </div>

      {/* PTP Configuration Details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Clock Properties</h2>
          </div>
          <table style={{ width: '100%', fontSize: '0.8rem' }}>
            <tbody>
              {[
                ['Clock Class', currentData?.clockClass],
                ['Clock Accuracy', `0x${(currentData?.clockAccuracy || 0).toString(16).toUpperCase()}`],
                ['Priority 1', currentData?.priority1],
                ['Priority 2', currentData?.priority2],
                ['Domain', 0],
                ['Profile', 'IEEE 802.1AS'],
              ].map(([label, value]) => (
                <tr key={label}>
                  <td style={{ padding: '8px 0', borderBottom: `1px solid ${colors.border}`, color: colors.textMuted }}>{label}</td>
                  <td style={{ padding: '8px 0', borderBottom: `1px solid ${colors.border}`, fontWeight: '500', textAlign: 'right' }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Timing Parameters</h2>
          </div>
          <table style={{ width: '100%', fontSize: '0.8rem' }}>
            <tbody>
              {[
                ['Sync Interval', `2^${currentData?.syncInterval || -3} = ${Math.pow(2, currentData?.syncInterval || -3) * 1000}ms`],
                ['Announce Interval', `2^${currentData?.announceInterval || 0} = ${Math.pow(2, currentData?.announceInterval || 0)}s`],
                ['Pdelay Interval', `2^${currentData?.pdelayReqInterval || 0} = ${Math.pow(2, currentData?.pdelayReqInterval || 0)}s`],
                ['Announce Timeout', '3 intervals'],
                ['Sync Timeout', '3 intervals'],
              ].map(([label, value]) => (
                <tr key={label}>
                  <td style={{ padding: '8px 0', borderBottom: `1px solid ${colors.border}`, color: colors.textMuted }}>{label}</td>
                  <td style={{ padding: '8px 0', borderBottom: `1px solid ${colors.border}`, fontWeight: '500', textAlign: 'right' }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* All Boards PTP Status */}
      <div className="card" style={{ marginTop: '16px' }}>
        <div className="card-header">
          <h2 className="card-title">All Boards PTP Status</h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr>
              <th style={{ padding: '10px', textAlign: 'left', background: colors.bgAlt, borderBottom: `1px solid ${colors.border}` }}>Board</th>
              <th style={{ padding: '10px', textAlign: 'left', background: colors.bgAlt, borderBottom: `1px solid ${colors.border}` }}>Role</th>
              <th style={{ padding: '10px', textAlign: 'left', background: colors.bgAlt, borderBottom: `1px solid ${colors.border}` }}>Port State</th>
              <th style={{ padding: '10px', textAlign: 'right', background: colors.bgAlt, borderBottom: `1px solid ${colors.border}` }}>Offset (ns)</th>
              <th style={{ padding: '10px', textAlign: 'right', background: colors.bgAlt, borderBottom: `1px solid ${colors.border}` }}>Path Delay (μs)</th>
              <th style={{ padding: '10px', textAlign: 'center', background: colors.bgAlt, borderBottom: `1px solid ${colors.border}` }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {devices.map(device => {
              const data = ptpData[device.id]
              const isSynced = Math.abs(data?.offset || 0) < 100
              return (
                <tr key={device.id} style={{ background: selectedDevice?.id === device.id ? '#eff6ff' : 'transparent' }}>
                  <td style={{ padding: '10px', borderBottom: `1px solid ${colors.border}`, fontWeight: '500' }}>{device.name}</td>
                  <td style={{ padding: '10px', borderBottom: `1px solid ${colors.border}` }}>{device.role}</td>
                  <td style={{ padding: '10px', borderBottom: `1px solid ${colors.border}` }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: data?.portState === 'MASTER' ? '#dcfce7' : '#dbeafe',
                      color: data?.portState === 'MASTER' ? '#166534' : '#1e40af',
                      fontSize: '0.7rem',
                      fontWeight: '600'
                    }}>
                      {data?.portState || '-'}
                    </span>
                  </td>
                  <td style={{ padding: '10px', borderBottom: `1px solid ${colors.border}`, textAlign: 'right', fontFamily: 'monospace' }}>
                    {(data?.offset || 0).toFixed(1)}
                  </td>
                  <td style={{ padding: '10px', borderBottom: `1px solid ${colors.border}`, textAlign: 'right', fontFamily: 'monospace' }}>
                    {((data?.meanPathDelay || 0) / 1000).toFixed(2)}
                  </td>
                  <td style={{ padding: '10px', borderBottom: `1px solid ${colors.border}`, textAlign: 'center' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: isSynced ? '#dcfce7' : '#fef3c7',
                      color: isSynced ? '#166534' : '#92400e',
                      fontSize: '0.7rem',
                      fontWeight: '600'
                    }}>
                      {isSynced ? 'Synced' : 'Syncing'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
