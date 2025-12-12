/**
 * DART Pump Protocol Server
 * Main entry point
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketHandler } from './websocket/ws-handler';
import { SerialHandler } from './serial/serial-handler';
import { createCommandsRouter } from './api/commands';
import { SerialConfig, PumpAddress } from './types/protocol';

const app = express();
const server = createServer(app);

// Middleware - CORS configuration
app.use(cors({
  origin: true, // Allow all origins (for development)
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Default configuration
const defaultConfig: SerialConfig = {
  port: '/dev/ttyUSB0',
  baudRate: 9600,
  pumpAddress: 0x50 as PumpAddress
};

// Initialize serial handler
const serialHandler = new SerialHandler(defaultConfig);

// Initialize WebSocket handler
const wsHandler = new WebSocketHandler(server, '/ws');

// Set up serial handler event listeners
serialHandler.on('connected', () => {
  console.log('Serial port connected');
  wsHandler.broadcastConnectionStatus(true);
});

serialHandler.on('disconnected', () => {
  console.log('Serial port disconnected');
  wsHandler.broadcastConnectionStatus(false);
});

// Track last status to detect rapid switching
let lastStatus: { address: number; status: number; timestamp: number } | null = null;

serialHandler.on('message', (message) => {
  // Log with transaction type name for clarity
  const txNames: { [key: number]: string } = {
    1: 'DC1_STATUS',
    2: 'DC2_VOLUME_AMOUNT',
    3: 'DC3_NOZZLE_PRICE',
    9: 'DC9_IDENTITY'
  };
  const txName = txNames[message.transaction.type] || `DC${message.transaction.type}`;
  
  // For status messages, check if we're getting rapid status switches
  if (message.transaction.type === 1) {
    const status = message.transaction.data.status;
    const now = Date.now();
    
    if (lastStatus && 
        lastStatus.address === message.address && 
        lastStatus.status !== status) {
      const timeSinceLastStatus = now - lastStatus.timestamp;
      if (timeSinceLastStatus < 1000) {
        console.warn(`⚠️  Rapid status switch detected: ${lastStatus.status} -> ${status} (${timeSinceLastStatus}ms apart)`);
      }
    }
    
    lastStatus = {
      address: message.address,
      status: status,
      timestamp: now
    };
  }
  
  // Only log every 10th message to reduce console spam
  if (Math.random() < 0.1) {
    console.log(`[${txName}]`, {
      address: `0x${message.address.toString(16)}`,
      data: message.transaction.data,
      frameLength: message.rawFrame.length
    });
  }
  
  wsHandler.broadcastPumpMessage(message);
});

serialHandler.on('frameError', (error) => {
  // Log frame errors but don't treat them as fatal
  // Many frames may not parse correctly but still contain valid data
  const frameHex = error.frame.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  console.warn('Frame parsing warning:', error.error, 'Frame length:', error.frame.length, 'Hex:', frameHex);
});

serialHandler.on('unknownTransaction', (data) => {
  const frameHex = data.rawFrame.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  console.log('Unknown transaction:', {
    address: `0x${data.address.toString(16)}`,
    transaction: data.transaction.trans,
    length: data.transaction.lng,
    data: data.transaction.data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
    frameHex
  });
});

serialHandler.on('error', (error) => {
  console.error('Serial error:', error);
  wsHandler.broadcastConnectionStatus(false, error.message);
});

// API routes
app.use('/api/commands', createCommandsRouter(serialHandler));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    serialConnected: serialHandler.getConnectionStatus(),
    wsClients: wsHandler.getClientCount()
  });
});

// Start server
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0'; // Listen on all interfaces by default

server.listen(PORT, HOST, async () => {
  console.log(`Server running on ${HOST}:${PORT}`);
  console.log(`WebSocket server available at ws://${HOST}:${PORT}/ws`);
  console.log(`API available at http://${HOST}:${PORT}/api`);
  
  // Try to connect to serial port
  try {
    await serialHandler.connect();
    console.log('Serial port connected successfully');
  } catch (error: any) {
    console.error('Failed to connect to serial port:', error.message);
    console.log('Server will continue running. Connect via /api/config endpoint.');
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await serialHandler.disconnect();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

