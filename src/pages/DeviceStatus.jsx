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

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (days > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`
  return `${mins}m ${secs}s`
}

export default function DeviceStatus() {
  const { devices, selectedDevice, setSelectedDevice } = useDevices()
  const [portStats, setPortStats] = useState({})

  // Simulate port traffic
  useEffect(() => {
    const interval = setInterval(() => {
      const stats = {}
      devices.forEach(d => {
        stats[d.id] = {}
        for (let i = 0; i < 9; i++) {
          const isUp = i < 6 || i === 8
          stats[d.id][i] = {
            rxBytes: isUp ? Math.floor(Math.random() * 1000000) + 500000 : 0,
            txBytes: isUp ? Math.floor(Math.random() * 800000) + 400000 : 0,
            rxPackets: isUp ? Math.floor(Math.random() * 1000) + 500 : 0,
            txPackets: isUp ? Math.floor(Math.random() * 800) + 400 : 0,
          }
        }
      })
      setPortStats(stats)
    }, 1000)
    return () => clearInterval(interval)
  }, [devices])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Device Status</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>
            {devices.filter(d => d.status === 'online').length} / {devices.length} online
          </span>
          <button className="btn btn-secondary">Refresh</button>
        </div>
      </div>

      {/* Device Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {devices.map(device => (
          <div
            key={device.id}
            onClick={() => setSelectedDevice(device)}
            className="card"
            style={{
              cursor: 'pointer',
              borderColor: selectedDevice?.id === device.id ? '#333' : colors.borderLight,
              borderWidth: selectedDevice?.id === device.id ? '2px' : '1px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ fontWeight: '600', fontSize: '1rem', marginBottom: '2px' }}>{device.name}</div>
                <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>{device.type}</div>
              </div>
              <span style={{
                fontSize: '0.7rem',
                padding: '4px 10px',
                borderRadius: '6px',
                background: device.status === 'online' ? '#e8f5e9' : '#ffebee',
                color: device.status === 'online' ? '#2e7d32' : '#c62828',
                fontWeight: '500'
              }}>
                {device.status === 'online' ? 'Online' : 'Offline'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.8rem', marginBottom: '16px' }}>
              <div>
                <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>Role</span>
                <div style={{ fontWeight: '500', marginTop: '2px' }}>{device.role.split(' ')[0]}</div>
              </div>
              <div>
                <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>Uptime</span>
                <div style={{ fontWeight: '500', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>{formatUptime(device.uptime)}</div>
              </div>
              <div>
                <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>IP Address</span>
                <div style={{ fontWeight: '500', marginTop: '2px', fontFamily: 'monospace', fontSize: '0.75rem' }}>{device.ip}</div>
              </div>
              <div>
                <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>Ports</span>
                <div style={{ fontWeight: '500', marginTop: '2px' }}>{device.ports} ports</div>
              </div>
            </div>

            <div style={{ paddingTop: '12px', borderTop: `1px solid ${colors.borderLight}`, fontSize: '0.7rem', color: colors.textMuted }}>
              <div style={{ fontFamily: 'monospace' }}>{device.mac}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Network Topology */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Network Topology</h2>
          <span style={{ fontSize: '0.7rem', color: colors.textMuted }}>PTP Hierarchy</span>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px',
          padding: '40px 20px',
          background: colors.bgAlt,
          borderRadius: '8px'
        }}>
          {devices.map((device, idx) => (
            <div key={device.id} style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <div style={{
                width: '140px',
                padding: '16px',
                background: '#fff',
                border: `2px solid ${device.role.includes('GM') ? colors.success : '#888'}`,
                borderRadius: '10px',
                textAlign: 'center',
                position: 'relative'
              }}>
                <div style={{ fontSize: '0.65rem', color: colors.textMuted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{device.type}</div>
                <div style={{ fontWeight: '600', fontSize: '0.9rem', marginBottom: '8px' }}>{device.name}</div>
                <div style={{ fontSize: '0.7rem', color: colors.textMuted }}>{device.ip}</div>
                <div style={{
                  position: 'absolute',
                  bottom: '-12px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: device.role.includes('GM') ? colors.success : device.role.includes('BC') ? colors.warning : '#666',
                  color: '#fff',
                  fontSize: '0.6rem',
                  padding: '3px 10px',
                  borderRadius: '4px',
                  fontWeight: '600',
                  whiteSpace: 'nowrap'
                }}>
                  {device.role.split(' ')[0]}
                </div>
              </div>
              {idx < devices.length - 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '60px', height: '2px', background: '#aaa' }} />
                  <div style={{ fontSize: '0.6rem', color: colors.textMuted }}>1 Gbps</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Port Status Table */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Port Status</h2>
          <span style={{ fontSize: '0.75rem', color: colors.textMuted, fontWeight: '500' }}>
            {selectedDevice?.name}
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Port</th>
                <th>Link</th>
                <th>Speed</th>
                <th style={{ textAlign: 'right' }}>RX Bytes</th>
                <th style={{ textAlign: 'right' }}>TX Bytes</th>
                <th style={{ textAlign: 'right' }}>RX Pkts</th>
                <th style={{ textAlign: 'right' }}>TX Pkts</th>
                <th>PTP Role</th>
              </tr>
            </thead>
            <tbody>
              {[...Array(selectedDevice?.ports || 9)].map((_, i) => {
                const isUp = i < 6 || i === 8
                const stats = portStats[selectedDevice?.id]?.[i] || {}
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: '500' }}>Port {i + 1}</td>
                    <td>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '3px 10px',
                        borderRadius: '4px',
                        background: isUp ? '#e8f5e9' : colors.bgAlt,
                        color: isUp ? '#2e7d32' : colors.textMuted,
                        fontSize: '0.7rem',
                        fontWeight: '500'
                      }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isUp ? '#2e7d32' : '#999' }}></span>
                        {isUp ? 'UP' : 'DOWN'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{isUp ? '1000M' : '-'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {isUp ? (stats.rxBytes || 0).toLocaleString() : '-'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {isUp ? (stats.txBytes || 0).toLocaleString() : '-'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {isUp ? (stats.rxPackets || 0).toLocaleString() : '-'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {isUp ? (stats.txPackets || 0).toLocaleString() : '-'}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', color: i === 8 ? colors.success : isUp ? colors.textSecondary : colors.textMuted }}>
                        {i === 8 ? 'Master' : isUp ? 'Slave' : '-'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
