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
  accent: '#333',
}

// Realistic PTP simulation
function generatePTPData(deviceRole, prevOffset = 0) {
  const isGM = deviceRole.includes('GM')
  const isBC = deviceRole.includes('BC')

  // GM has perfect clock (0 offset)
  // BC has small offset, Slave has slightly larger
  const baseJitter = isGM ? 0 : isBC ? 5 : 15
  const drift = (Math.random() - 0.5) * baseJitter

  // Offset tends to stabilize around 0 with some oscillation
  let newOffset = isGM ? 0 : prevOffset * 0.95 + drift
  newOffset = Math.max(-100, Math.min(100, newOffset))

  return {
    offset: newOffset,
    meanPathDelay: isGM ? 0 : 4500 + Math.random() * 1000,
    clockClass: isGM ? 6 : isBC ? 7 : 248,
    clockAccuracy: isGM ? 0x21 : isBC ? 0x22 : 0x25,
    priority1: isGM ? 128 : 255,
    priority2: isGM ? 128 : 255,
    stepsRemoved: isGM ? 0 : isBC ? 1 : 2,
    portState: isGM ? 'MASTER' : 'SLAVE',
    gmIdentity: 'E6:F4:41:FF:FE:C9:57:01',
    parentPortId: isGM ? '-' : isBC ? '1' : '1',
  }
}

export default function PTPDashboard() {
  const { devices, selectedDevice, setSelectedDevice } = useDevices()
  const [ptpData, setPtpData] = useState({})
  const [offsetHistory, setOffsetHistory] = useState({})
  const canvasRef = useRef(null)

  // Initialize and update PTP data
  useEffect(() => {
    const interval = setInterval(() => {
      setPtpData(prev => {
        const newData = {}
        devices.forEach(d => {
          const prevOffset = prev[d.id]?.offset || (Math.random() - 0.5) * 50
          newData[d.id] = generatePTPData(d.role, prevOffset)
        })
        return newData
      })
    }, 125) // 8Hz sync rate

    return () => clearInterval(interval)
  }, [devices])

  // Update offset history
  useEffect(() => {
    if (!selectedDevice || !ptpData[selectedDevice.id]) return

    setOffsetHistory(prev => {
      const history = prev[selectedDevice.id] || []
      const updated = [...history, {
        time: Date.now(),
        offset: ptpData[selectedDevice.id].offset
      }].slice(-200)
      return { ...prev, [selectedDevice.id]: updated }
    })
  }, [ptpData, selectedDevice])

  // Draw offset graph
  useEffect(() => {
    const canvas = canvasRef.current
    const history = offsetHistory[selectedDevice?.id] || []
    if (!canvas || history.length < 2) return

    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    const padding = { top: 20, right: 20, bottom: 30, left: 50 }

    // Clear
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)

    const graphWidth = width - padding.left - padding.right
    const graphHeight = height - padding.top - padding.bottom

    // Grid lines
    ctx.strokeStyle = '#eee'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (graphHeight * i / 4)
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(width - padding.right, y)
      ctx.stroke()
    }

    // Y-axis labels
    ctx.fillStyle = colors.textMuted
    ctx.font = '11px -apple-system, sans-serif'
    ctx.textAlign = 'right'
    const maxOffset = 100
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (graphHeight * i / 4)
      const value = maxOffset - (maxOffset * 2 * i / 4)
      ctx.fillText(`${value.toFixed(0)}`, padding.left - 8, y + 4)
    }

    // X-axis label
    ctx.textAlign = 'center'
    ctx.fillText('Time', width / 2, height - 5)

    // Y-axis label
    ctx.save()
    ctx.translate(12, height / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('Offset (ns)', 0, 0)
    ctx.restore()

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

    // Draw offset line
    ctx.strokeStyle = colors.accent
    ctx.lineWidth = 1.5
    ctx.beginPath()

    history.forEach((point, i) => {
      const x = padding.left + (i / (history.length - 1)) * graphWidth
      const normalizedOffset = (maxOffset - point.offset) / (maxOffset * 2)
      const y = padding.top + normalizedOffset * graphHeight

      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()

    // Current value indicator
    if (history.length > 0) {
      const lastPoint = history[history.length - 1]
      const x = width - padding.right
      const normalizedOffset = (maxOffset - lastPoint.offset) / (maxOffset * 2)
      const y = padding.top + normalizedOffset * graphHeight

      ctx.fillStyle = colors.accent
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fill()
    }

  }, [offsetHistory, selectedDevice])

  const currentData = selectedDevice ? ptpData[selectedDevice.id] : null
  const isLocked = currentData && Math.abs(currentData.offset) < 50

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">PTP Synchronization</h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{
            fontSize: '0.75rem',
            padding: '5px 12px',
            background: isLocked ? '#e8f5e9' : '#fff3e0',
            color: isLocked ? '#2e7d32' : '#e65100',
            borderRadius: '6px',
            fontWeight: '500'
          }}>
            {isLocked ? 'Locked' : 'Acquiring'}
          </span>
        </div>
      </div>

      {/* Board Selector */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        {devices.map(device => {
          const data = ptpData[device.id]
          return (
            <button
              key={device.id}
              onClick={() => setSelectedDevice(device)}
              style={{
                flex: 1,
                padding: '14px 16px',
                borderRadius: '10px',
                border: selectedDevice?.id === device.id ? '2px solid #333' : `1px solid ${colors.borderLight}`,
                background: '#fff',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{device.name}</span>
                <span style={{
                  fontSize: '0.65rem',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: data?.portState === 'MASTER' ? '#e8f5e9' : colors.bgAlt,
                  color: data?.portState === 'MASTER' ? '#2e7d32' : colors.textMuted,
                  fontWeight: '500'
                }}>
                  {data?.portState || '-'}
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>{device.role}</div>
            </button>
          )
        })}
      </div>

      {/* Main Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ textAlign: 'center', padding: '20px' }}>
          <div style={{ fontSize: '0.7rem', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Clock Offset</div>
          <div style={{
            fontSize: '2rem',
            fontWeight: '600',
            fontVariantNumeric: 'tabular-nums',
            color: Math.abs(currentData?.offset || 0) < 50 ? colors.success : colors.warning
          }}>
            {currentData?.offset?.toFixed(1) || '0.0'}
          </div>
          <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginTop: '4px' }}>nanoseconds</div>
        </div>

        <div className="card" style={{ textAlign: 'center', padding: '20px' }}>
          <div style={{ fontSize: '0.7rem', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Path Delay</div>
          <div style={{ fontSize: '2rem', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
            {((currentData?.meanPathDelay || 0) / 1000).toFixed(2)}
          </div>
          <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginTop: '4px' }}>microseconds</div>
        </div>

        <div className="card" style={{ textAlign: 'center', padding: '20px' }}>
          <div style={{ fontSize: '0.7rem', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Steps Removed</div>
          <div style={{ fontSize: '2rem', fontWeight: '600' }}>
            {currentData?.stepsRemoved ?? '-'}
          </div>
          <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginTop: '4px' }}>from GM</div>
        </div>

        <div className="card" style={{ textAlign: 'center', padding: '20px' }}>
          <div style={{ fontSize: '0.7rem', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Clock Class</div>
          <div style={{ fontSize: '2rem', fontWeight: '600' }}>
            {currentData?.clockClass ?? '-'}
          </div>
          <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginTop: '4px' }}>IEEE 1588</div>
        </div>
      </div>

      {/* Offset Graph */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Clock Offset History</h2>
          <span style={{ fontSize: '0.7rem', color: colors.textMuted }}>
            {(offsetHistory[selectedDevice?.id] || []).length} samples @ 8Hz
          </span>
        </div>
        <canvas
          ref={canvasRef}
          width={900}
          height={280}
          style={{ width: '100%', height: '280px', borderRadius: '8px', border: `1px solid ${colors.borderLight}` }}
        />
      </div>

      {/* Clock Details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Clock Properties</h2>
          </div>
          <table>
            <tbody>
              {[
                ['GM Identity', currentData?.gmIdentity || '-'],
                ['Clock Class', currentData?.clockClass],
                ['Clock Accuracy', currentData?.clockAccuracy ? `0x${currentData.clockAccuracy.toString(16).toUpperCase()}` : '-'],
                ['Priority 1', currentData?.priority1],
                ['Priority 2', currentData?.priority2],
                ['Domain', 0],
              ].map(([label, value]) => (
                <tr key={label}>
                  <td style={{ color: colors.textMuted, width: '50%' }}>{label}</td>
                  <td style={{ fontWeight: '500', fontFamily: 'monospace' }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Port Configuration</h2>
          </div>
          <table>
            <tbody>
              {[
                ['Port State', currentData?.portState || '-'],
                ['Sync Interval', '125ms (2^-3)'],
                ['Announce Interval', '1s (2^0)'],
                ['Pdelay Interval', '1s (2^0)'],
                ['Profile', 'IEEE 802.1AS'],
                ['Transport', 'L2 (Ethernet)'],
              ].map(([label, value]) => (
                <tr key={label}>
                  <td style={{ color: colors.textMuted, width: '50%' }}>{label}</td>
                  <td style={{ fontWeight: '500' }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* All Boards Summary */}
      <div className="card" style={{ marginTop: '16px' }}>
        <div className="card-header">
          <h2 className="card-title">All Boards Status</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Board</th>
              <th>Role</th>
              <th>State</th>
              <th style={{ textAlign: 'right' }}>Offset (ns)</th>
              <th style={{ textAlign: 'right' }}>Path Delay (μs)</th>
              <th style={{ textAlign: 'center' }}>Sync Status</th>
            </tr>
          </thead>
          <tbody>
            {devices.map(device => {
              const data = ptpData[device.id]
              const synced = data && Math.abs(data.offset) < 50
              return (
                <tr key={device.id} style={{ background: selectedDevice?.id === device.id ? colors.bgAlt : 'transparent' }}>
                  <td style={{ fontWeight: '500' }}>{device.name}</td>
                  <td>{device.role.split(' ')[0]}</td>
                  <td>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: data?.portState === 'MASTER' ? '#e8f5e9' : colors.bgAlt,
                      color: data?.portState === 'MASTER' ? '#2e7d32' : colors.textSecondary,
                      fontSize: '0.7rem',
                      fontWeight: '500'
                    }}>
                      {data?.portState || '-'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{data?.offset?.toFixed(1) || '-'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{data?.meanPathDelay ? (data.meanPathDelay / 1000).toFixed(2) : '-'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{
                      padding: '2px 10px',
                      borderRadius: '4px',
                      background: synced ? '#e8f5e9' : '#fff3e0',
                      color: synced ? '#2e7d32' : '#e65100',
                      fontSize: '0.7rem',
                      fontWeight: '500'
                    }}>
                      {synced ? 'Synced' : 'Syncing'}
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
