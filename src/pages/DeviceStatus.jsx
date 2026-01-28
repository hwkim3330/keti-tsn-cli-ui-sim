import { useDevices } from '../contexts/DeviceContext'

const colors = {
  text: '#1e293b',
  textMuted: '#64748b',
  border: '#e2e8f0',
  bgAlt: '#f1f5f9',
  success: '#059669',
  warning: '#d97706',
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

export default function DeviceStatus() {
  const { devices, selectedDevice, setSelectedDevice } = useDevices()

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Device Status</h1>
        <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>
          {devices.length} devices connected
        </span>
      </div>

      {/* Device Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {devices.map(device => (
          <div
            key={device.id}
            onClick={() => setSelectedDevice(device)}
            className="card"
            style={{
              cursor: 'pointer',
              border: selectedDevice?.id === device.id ? '2px solid #3b82f6' : `1px solid ${colors.border}`,
              transition: 'all 0.15s'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontWeight: '600', fontSize: '1rem' }}>{device.name}</div>
              <span style={{
                fontSize: '0.7rem',
                padding: '3px 8px',
                borderRadius: '12px',
                background: device.status === 'online' ? '#dcfce7' : '#fef2f2',
                color: device.status === 'online' ? '#166534' : '#991b1b',
                fontWeight: '600'
              }}>
                {device.status === 'online' ? '● Online' : '○ Offline'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.8rem' }}>
              <div>
                <span style={{ color: colors.textMuted }}>Type:</span>
                <span style={{ marginLeft: '8px', fontWeight: '500' }}>{device.type}</span>
              </div>
              <div>
                <span style={{ color: colors.textMuted }}>Ports:</span>
                <span style={{ marginLeft: '8px', fontWeight: '500' }}>{device.ports}</span>
              </div>
              <div>
                <span style={{ color: colors.textMuted }}>Role:</span>
                <span style={{ marginLeft: '8px', fontWeight: '500' }}>{device.role}</span>
              </div>
              <div>
                <span style={{ color: colors.textMuted }}>Uptime:</span>
                <span style={{ marginLeft: '8px', fontWeight: '500' }}>{formatUptime(device.uptime)}</span>
              </div>
            </div>

            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${colors.border}`, fontSize: '0.75rem', color: colors.textMuted }}>
              <div>MAC: {device.mac}</div>
              <div>IP: {device.ip}</div>
              <div>Firmware: {device.firmware}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Network Topology Visualization */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Network Topology</h2>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '40px',
          padding: '40px',
          background: colors.bgAlt,
          borderRadius: '8px'
        }}>
          {devices.map((device, idx) => (
            <div key={device.id} style={{ display: 'flex', alignItems: 'center', gap: '40px' }}>
              <div style={{
                width: '120px',
                height: '100px',
                background: '#fff',
                border: `2px solid ${device.role.includes('GM') ? colors.success : colors.textMuted}`,
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative'
              }}>
                <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginBottom: '4px' }}>{device.type}</div>
                <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{device.name.split(' ')[2]}</div>
                <div style={{
                  position: 'absolute',
                  bottom: '-10px',
                  background: device.role.includes('GM') ? colors.success : colors.warning,
                  color: '#fff',
                  fontSize: '0.6rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontWeight: '600'
                }}>
                  {device.role.split(' ')[0]}
                </div>
              </div>
              {idx < devices.length - 1 && (
                <div style={{
                  width: '60px',
                  height: '3px',
                  background: `linear-gradient(90deg, ${colors.success}, ${colors.textMuted})`,
                  borderRadius: '2px'
                }} />
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: '16px', display: 'flex', gap: '24px', fontSize: '0.75rem', color: colors.textMuted }}>
          <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: colors.success, borderRadius: '2px', marginRight: '6px' }}></span>GM (Grandmaster)</span>
          <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: colors.warning, borderRadius: '2px', marginRight: '6px' }}></span>BC (Boundary Clock)</span>
          <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: colors.textMuted, borderRadius: '2px', marginRight: '6px' }}></span>Slave</span>
        </div>
      </div>

      {/* Port Status Table */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Port Status - {selectedDevice?.name}</h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr>
              <th style={{ padding: '10px', textAlign: 'left', background: colors.bgAlt, borderBottom: `1px solid ${colors.border}` }}>Port</th>
              <th style={{ padding: '10px', textAlign: 'left', background: colors.bgAlt, borderBottom: `1px solid ${colors.border}` }}>Status</th>
              <th style={{ padding: '10px', textAlign: 'left', background: colors.bgAlt, borderBottom: `1px solid ${colors.border}` }}>Speed</th>
              <th style={{ padding: '10px', textAlign: 'left', background: colors.bgAlt, borderBottom: `1px solid ${colors.border}` }}>VLAN</th>
              <th style={{ padding: '10px', textAlign: 'left', background: colors.bgAlt, borderBottom: `1px solid ${colors.border}` }}>PTP Role</th>
            </tr>
          </thead>
          <tbody>
            {[...Array(selectedDevice?.ports || 9)].map((_, i) => {
              const isUp = i < 6 || i === 8
              return (
                <tr key={i}>
                  <td style={{ padding: '10px', borderBottom: `1px solid ${colors.border}` }}>Port {i + 1}</td>
                  <td style={{ padding: '10px', borderBottom: `1px solid ${colors.border}` }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: isUp ? '#dcfce7' : '#fef2f2',
                      color: isUp ? '#166534' : '#991b1b',
                      fontSize: '0.7rem',
                      fontWeight: '600'
                    }}>
                      {isUp ? 'UP' : 'DOWN'}
                    </span>
                  </td>
                  <td style={{ padding: '10px', borderBottom: `1px solid ${colors.border}` }}>{isUp ? '1000 Mbps' : '-'}</td>
                  <td style={{ padding: '10px', borderBottom: `1px solid ${colors.border}` }}>100</td>
                  <td style={{ padding: '10px', borderBottom: `1px solid ${colors.border}` }}>
                    {i === 8 ? 'Master' : i < 6 ? 'Slave' : '-'}
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
