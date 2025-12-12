# DART Pump Protocol Testing Web Application

A modern web application for testing and monitoring DART pump protocol communications. Built with Node.js/TypeScript backend and React frontend.

## Features

- **Full Protocol Support**: Implements all DART protocol transactions (CD1-DC103)
- **Real-time Monitoring**: WebSocket-based real-time updates from pumps
- **Command Testing**: Easy-to-use UI for testing all protocol commands
- **Transaction History**: Complete log of all communications
- **Visual Status Display**: Real-time pump status visualization
- **Serial Port Management**: Configure and manage RS485 serial connections

## Architecture

- **Backend**: Node.js/TypeScript with Express, WebSocket server, and serial port communication
- **Frontend**: React + Vite with TypeScript
- **Protocol**: Full DART line protocol (Level 2) and application protocol (Level 3) implementation

## Prerequisites

- Node.js 18+ and npm
- Raspberry Pi with USB to RS485 adapter
- Access to serial port (typically `/dev/ttyUSB0` on Linux)

## Installation

1. Install dependencies:
```bash
npm run install:all
```

Or install separately:
```bash
cd server && npm install
cd ../client && npm install
```

## Usage

### Development Mode

#### If server and client are on the same machine:

Start the backend server:
```bash
npm run dev:server
# or
cd server && npm run dev
```

Start the frontend development server:
```bash
npm run dev:client
# or
cd client && npm run dev
```

The frontend will be available at `http://localhost:3000`
The backend API will be available at `http://localhost:3001`

#### If server is on Raspberry Pi and client is on your laptop:

1. **On Raspberry Pi**: Start the server
   ```bash
   cd server && npm run dev
   ```

2. **On your laptop**: Configure the API URL
   ```bash
   cd client
   # Create .env.local file with your Raspberry Pi IP
   echo "VITE_API_URL=http://192.168.1.100:3001" > .env.local
   # Replace 192.168.1.100 with your Raspberry Pi's actual IP
   npm run dev
   ```

3. Open `http://localhost:3000` on your laptop

See [SETUP.md](SETUP.md) for detailed setup instructions.

### Production Build

Build both server and client:
```bash
npm run build:server
npm run build:client
```

Start the production server:
```bash
cd server && npm start
```

## Configuration

1. Open the web application in your browser
2. Go to the "Serial Configuration" panel
3. Configure:
   - Serial Port (e.g., `/dev/ttyUSB0`)
   - Baud Rate (default: 9600)
   - Pump Address (hex, 0x50-0x6F)
4. Click "Update Configuration" to connect

## Protocol Commands

The application supports all DART protocol commands:

### Basic Commands
- Return Status
- Reset
- Authorize
- Stop
- Switch Off
- Get Pump Identity
- Get Filling Information

### Control Commands
- Suspend/Resume
- Preset Volume/Amount
- Price Updates
- Nozzle Control

### Advanced Commands
- Output Control
- Pump Parameters
- Total Counters
- Filling Type

## Project Structure

```
pump-protocol/
├── server/              # Backend server
│   ├── src/
│   │   ├── protocol/   # DART protocol implementation
│   │   ├── serial/      # Serial port handling
│   │   ├── websocket/   # WebSocket server
│   │   └── api/         # REST API routes
│   └── package.json
├── client/              # Frontend application
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── hooks/       # Custom hooks
│   │   └── services/    # API client
│   └── package.json
└── README.md
```

## Protocol Implementation

The implementation follows the DART Pump Interface Protocol Specification v2.11:

- **Line Protocol (Level 2)**: CRC calculation, frame construction, device addressing
- **Application Protocol (Level 3)**: All CD and DC transactions
- **BCD Encoding**: Proper packed BCD encoding for volumes, amounts, and prices

## Firewall Configuration

If your server is on a Raspberry Pi and you want to access it from another machine, you need to allow port 3001 through the firewall.

### Quick Setup (UFW):
```bash
sudo ufw allow 3001/tcp
sudo ufw status
```

For detailed firewall setup instructions, see [FIREWALL_SETUP.md](FIREWALL_SETUP.md)

## Troubleshooting

### Serial Port Issues

- Ensure the serial port device exists: `ls -l /dev/ttyUSB*`
- Check permissions: `sudo chmod 666 /dev/ttyUSB0`
- Verify baud rate matches pump configuration

### WebSocket Connection Issues

- Ensure backend server is running on port 3001
- Check firewall settings
- Verify WebSocket URL in browser console

### Protocol Errors

- Verify pump address is correct (0x50-0x6F)
- Check transaction log for detailed error messages
- Ensure CRC validation passes

## License

This project is for testing and development purposes.

## References

- DART Pump Interface Protocol Specification v2.11
- Dresser Wayne AB Protocol Documentation

