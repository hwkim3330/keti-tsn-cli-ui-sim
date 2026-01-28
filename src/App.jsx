import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { DeviceProvider } from './contexts/DeviceContext'
import PTPDashboard from './pages/PTPDashboard'
import TASDashboard from './pages/TASDashboard'
import CBSDashboard from './pages/CBSDashboard'
import DeviceStatus from './pages/DeviceStatus'

function App() {
  return (
    <DeviceProvider>
      <div className="app">
        <div className="sim-badge">SIMULATION MODE</div>

        {/* Sidebar */}
        <nav className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-logo">TSN Manager</div>
            <div className="sidebar-subtitle">Simulation Dashboard</div>
          </div>

          <div className="sidebar-nav">
            <div className="nav-section">
              <div className="nav-section-title">Overview</div>
              <NavLink to="/devices" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
                <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2"/>
                  <line x1="8" y1="21" x2="16" y2="21"/>
                  <line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
                Device Status
              </NavLink>
            </div>

            <div className="nav-section">
              <div className="nav-section-title">TSN Features</div>
              <NavLink to="/ptp" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
                <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12,6 12,12 16,14"/>
                </svg>
                PTP Dashboard
              </NavLink>
              <NavLink to="/tas" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
                <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <line x1="3" y1="9" x2="21" y2="9"/>
                  <line x1="9" y1="21" x2="9" y2="9"/>
                </svg>
                TAS Dashboard
              </NavLink>
              <NavLink to="/cbs" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
                <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="20" x2="12" y2="10"/>
                  <line x1="18" y1="20" x2="18" y2="4"/>
                  <line x1="6" y1="20" x2="6" y2="16"/>
                </svg>
                CBS Dashboard
              </NavLink>
            </div>
          </div>

          <div style={{ padding: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
                <rect width="100" height="100" rx="8" fill="#0066B3"/>
                <text x="50" y="65" textAnchor="middle" fill="white" fontSize="36" fontWeight="bold" fontFamily="Arial, sans-serif">K</text>
              </svg>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#fff' }}>KETI</div>
                <div style={{ fontSize: '0.6rem', color: '#888' }}>전자부품연구원</div>
              </div>
            </div>
            <div style={{ fontSize: '0.65rem', color: '#64748b' }}>TSN Simulation v1.0.0</div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/devices" replace />} />
            <Route path="/devices" element={<DeviceStatus />} />
            <Route path="/ptp" element={<PTPDashboard />} />
            <Route path="/tas" element={<TASDashboard />} />
            <Route path="/cbs" element={<CBSDashboard />} />
          </Routes>
        </main>
      </div>
    </DeviceProvider>
  )
}

export default App
