import { createContext, useContext, useState, useEffect } from 'react'

const DeviceContext = createContext()

// Simulated 3 boards
const SIMULATED_DEVICES = [
  {
    id: 'board-1',
    name: 'TSN Board #1',
    type: 'LAN9692',
    mac: 'E6:F4:41:C9:57:01',
    ip: '192.168.1.101',
    ports: 9,
    role: 'GM (Grandmaster)',
    status: 'online',
    uptime: 86400,
    firmware: 'v1.0.0',
  },
  {
    id: 'board-2',
    name: 'TSN Board #2',
    type: 'LAN9692',
    mac: 'FA:AE:C9:26:A4:02',
    ip: '192.168.1.102',
    ports: 9,
    role: 'BC (Boundary Clock)',
    status: 'online',
    uptime: 72000,
    firmware: 'v1.0.0',
  },
  {
    id: 'board-3',
    name: 'TSN Board #3',
    type: 'LAN9692',
    mac: 'AA:BB:CC:DD:EE:03',
    ip: '192.168.1.103',
    ports: 9,
    role: 'Slave',
    status: 'online',
    uptime: 43200,
    firmware: 'v1.0.0',
  },
]

export function DeviceProvider({ children }) {
  const [devices, setDevices] = useState(SIMULATED_DEVICES)
  const [selectedDevice, setSelectedDevice] = useState(SIMULATED_DEVICES[0])

  // Simulate uptime increment
  useEffect(() => {
    const interval = setInterval(() => {
      setDevices(prev => prev.map(d => ({
        ...d,
        uptime: d.uptime + 1
      })))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <DeviceContext.Provider value={{
      devices,
      selectedDevice,
      setSelectedDevice,
      isSimulation: true
    }}>
      {children}
    </DeviceContext.Provider>
  )
}

export function useDevices() {
  const context = useContext(DeviceContext)
  if (!context) {
    throw new Error('useDevices must be used within DeviceProvider')
  }
  return context
}
