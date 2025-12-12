/**
 * Configuration for API and WebSocket endpoints
 * Set these environment variables or update the defaults
 */

// Get API base URL from environment variable or use default
// For Raspberry Pi, set VITE_API_URL=http://raspberry-pi-ip:3001
// Example: VITE_API_URL=http://192.168.1.100:3001
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Extract hostname and port for WebSocket
const apiUrl = new URL(API_URL);
const WS_URL = `ws://${apiUrl.hostname}:${apiUrl.port || '3001'}/ws`;

export const config = {
  apiUrl: API_URL,
  wsUrl: WS_URL
};

// Log configuration in development
if (import.meta.env.DEV) {
  console.log('API Configuration:', {
    apiUrl: config.apiUrl,
    wsUrl: config.wsUrl
  });
}

