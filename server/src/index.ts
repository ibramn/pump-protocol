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

serialHandler.on('message', (message) => {
  console.log('Received pump message:', message.transaction.type);
  wsHandler.broadcastPumpMessage(message);
});

serialHandler.on('frameError', (error) => {
  console.error('Frame error:', error);
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

