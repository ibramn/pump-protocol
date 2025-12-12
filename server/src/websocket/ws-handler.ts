/**
 * WebSocket Server Handler
 * Broadcasts pump responses and command acknowledgments to connected clients
 */

import { WebSocketServer, WebSocket } from 'ws';
import { DecodedMessage } from '../types/protocol';

export class WebSocketHandler {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();

  constructor(server: any, path: string = '/ws') {
    this.wss = new WebSocketServer({ server, path });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      console.log(`WebSocket client connected. Total clients: ${this.clients.size}`);

      // Send welcome message
      this.sendToClient(ws, {
        type: 'connected',
        message: 'Connected to DART Pump Protocol Server'
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(`WebSocket client disconnected. Total clients: ${this.clients.size}`);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      ws.on('message', (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleClientMessage(ws, data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });
    });
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(data: any): void {
    const message = JSON.stringify(data);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Send message to a specific client
   */
  sendToClient(client: WebSocket, data: any): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  }

  /**
   * Broadcast pump message
   */
  broadcastPumpMessage(message: DecodedMessage): void {
    this.broadcast({
      type: 'pumpMessage',
      data: {
        address: message.address,
        timestamp: message.timestamp.toISOString(),
        transaction: {
          type: message.transaction.type,
          data: message.transaction.data
        },
        rawHex: message.rawFrame.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
      }
    });
  }

  /**
   * Broadcast command acknowledgment
   */
  broadcastCommandAck(commandId: string, success: boolean, error?: string): void {
    this.broadcast({
      type: 'commandAck',
      data: {
        commandId,
        success,
        error,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Broadcast serial connection status
   */
  broadcastConnectionStatus(connected: boolean, error?: string): void {
    this.broadcast({
      type: 'connectionStatus',
      data: {
        connected,
        error,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Handle message from client
   */
  private handleClientMessage(client: WebSocket, data: any): void {
    switch (data.type) {
      case 'ping':
        this.sendToClient(client, { type: 'pong' });
        break;
      default:
        console.log('Unknown client message type:', data.type);
    }
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }
}

