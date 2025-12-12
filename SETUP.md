# Setup Guide for Raspberry Pi + Laptop Configuration

This guide explains how to set up the application when the server runs on a Raspberry Pi and the client runs on your laptop.

## Architecture

- **Server (Raspberry Pi)**: Runs on port 3001, connected to pump via USB-to-RS485
- **Client (Your Laptop)**: Runs on port 3000, connects to Raspberry Pi via network

## Step 1: Setup Raspberry Pi (Server)

1. **Install Node.js** (if not already installed):
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Clone/Copy the project** to your Raspberry Pi

3. **Install server dependencies**:
   ```bash
   cd pump-protocol/server
   npm install
   ```

4. **Start the server**:
   ```bash
   npm run dev
   # or for production:
   npm run build
   npm start
   ```

5. **Note your Raspberry Pi's IP address**:
   ```bash
   hostname -I
   # or
   ip addr show
   ```
   Example output: `192.168.1.100`

6. **Configure firewall** (if needed):
   ```bash
   sudo ufw allow 3001/tcp
   ```

## Step 2: Setup Your Laptop (Client)

1. **Install Node.js** on your laptop (if not already installed)

2. **Navigate to client directory**:
   ```bash
   cd pump-protocol/client
   ```

3. **Create environment file**:
   ```bash
   cp .env.example .env.local
   ```

4. **Edit `.env.local`** and set your Raspberry Pi's IP:
   ```bash
   # Replace 192.168.1.100 with your Raspberry Pi's actual IP
   VITE_API_URL=http://192.168.1.100:3001
   ```

5. **Install client dependencies**:
   ```bash
   npm install
   ```

6. **Start the client**:
   ```bash
   npm run dev
   ```

7. **Open browser** to `http://localhost:3000`

## Step 3: Alternative - Set Environment Variable Directly

Instead of using `.env.local`, you can set the environment variable when starting the client:

```bash
VITE_API_URL=http://192.168.1.100:3001 npm run dev
```

Or on Windows (PowerShell):
```powershell
$env:VITE_API_URL="http://192.168.1.100:3001"; npm run dev
```

## Step 4: Verify Connection

1. Open the web application in your browser
2. Check the connection status indicator in the top-right corner
3. It should show "Connected" if the WebSocket connection is working
4. Go to "Serial Configuration" panel and configure your serial port

## Troubleshooting

### Client can't connect to server

1. **Check Raspberry Pi IP address**:
   - Make sure you're using the correct IP
   - Verify with `hostname -I` on Raspberry Pi

2. **Check network connectivity**:
   ```bash
   # From your laptop, ping the Raspberry Pi
   ping 192.168.1.100
   ```

3. **Check if server is running**:
   ```bash
   # From your laptop, test the API
   curl http://192.168.1.100:3001/health
   ```

4. **Check firewall**:
   - Ensure port 3001 is open on Raspberry Pi
   - Check if any firewall is blocking the connection

5. **Check server logs**:
   - Look at the Raspberry Pi console for any errors

### WebSocket connection fails

1. **Check browser console** for WebSocket errors
2. **Verify WebSocket URL** in browser console:
   - Should be: `ws://192.168.1.100:3001/ws`
3. **Check if proxy is interfering**:
   - Some corporate networks block WebSocket connections

### CORS errors

If you see CORS errors, the server already has CORS enabled, but you can verify in `server/src/index.ts` that `cors()` middleware is enabled.

## Production Build

For production, build the client with the correct API URL:

```bash
cd client
VITE_API_URL=http://192.168.1.100:3001 npm run build
```

The built files will be in `client/dist/` and can be served by any web server.

## Quick Reference

- **Server URL**: `http://RASPBERRY_PI_IP:3001`
- **WebSocket URL**: `ws://RASPBERRY_PI_IP:3001/ws`
- **Client URL**: `http://localhost:3000` (on your laptop)

Replace `RASPBERRY_PI_IP` with your actual Raspberry Pi IP address (e.g., `192.168.1.100`).

