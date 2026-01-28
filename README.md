# KETI TSN CLI UI - Simulation

TSN (Time-Sensitive Networking) Dashboard Simulation for demonstration purposes.

## Features

- **Device Status**: View 3 simulated LAN9692 TSN boards with network topology
- **PTP Dashboard**: IEEE 802.1AS PTP synchronization visualization with real-time offset graphs
- **TAS Dashboard**: Time-Aware Shaper gate control list configuration and testing
- **CBS Dashboard**: Credit-Based Shaper bandwidth allocation and monitoring

## Simulated Devices

- **Board #1**: LAN9692 - GM (Grandmaster)
- **Board #2**: LAN9692 - BC (Boundary Clock)
- **Board #3**: LAN9692 - Slave

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Tech Stack

- React 19
- Vite
- React Router DOM

## Screenshots

The dashboard includes:
- Real-time PTP offset monitoring with canvas-based graphs
- 8x8 TAS gate control list matrix visualization
- CBS credit level monitoring
- Traffic class (TC0-TC7) status visualization

---

KETI TSN Demo - Simulation Mode
