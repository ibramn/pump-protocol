/**
 * API Client for REST endpoints
 */

import { config } from '../config';

const API_BASE = `${config.apiUrl}/api`;

export interface SendCommandRequest {
  command: any;
  pumpAddress: string | number;
  control?: number;
}

export interface ConfigRequest {
  port: string;
  baudRate: number;
  pumpAddress: string | number;
}

export const api = {
  async sendCommand(request: SendCommandRequest) {
    const response = await fetch(`${API_BASE}/commands/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send command');
    }

    return response.json();
  },

  async getStatus() {
    const response = await fetch(`${API_BASE}/commands/status`);
    if (!response.ok) {
      throw new Error('Failed to get status');
    }
    return response.json();
  },

  async updateConfig(config: ConfigRequest) {
    const response = await fetch(`${API_BASE}/commands/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update configuration');
    }

    return response.json();
  },

  async getHistory() {
    const response = await fetch(`${API_BASE}/commands/history`);
    if (!response.ok) {
      throw new Error('Failed to get history');
    }
    return response.json();
  }
};

