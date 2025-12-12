import { useState, useEffect } from 'react';
import { api } from '../services/api';
import './ConfigPanel.css';

export function ConfigPanel() {
  const [port, setPort] = useState('/dev/ttyUSB0');
  const [baudRate, setBaudRate] = useState(9600);
  const [pumpAddress, setPumpAddress] = useState('50');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const s = await api.getStatus();
      setStatus(s);
      if (s.config) {
        setPort(s.config.port || port);
        setBaudRate(s.config.baudRate || baudRate);
        const addr = s.config.pumpAddress?.replace('0x', '') || pumpAddress;
        setPumpAddress(addr);
      }
    } catch (err) {
      console.error('Failed to load status:', err);
    }
  };

  const handleUpdate = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Parse and validate pump address
      let addressValue: string | number = pumpAddress;
      
      // Remove whitespace
      const cleanAddress = pumpAddress.trim();
      
      if (cleanAddress.startsWith('0x') || cleanAddress.startsWith('0X')) {
        // Already has hex prefix
        const num = parseInt(cleanAddress, 16);
        if (isNaN(num) || num < 0x50 || num > 0x6F) {
          throw new Error(`Invalid pump address: ${cleanAddress}. Must be between 0x50-0x6F (hex) or 80-111 (decimal)`);
        }
        addressValue = `0x${num.toString(16).toUpperCase().padStart(2, '0')}`;
      } else if (cleanAddress.match(/^[0-9A-Fa-f]+$/)) {
        // Hex-like string (digits and A-F), try hex first
        const hexNum = parseInt(cleanAddress, 16);
        if (!isNaN(hexNum) && hexNum >= 0x50 && hexNum <= 0x6F) {
          // Valid hex in range
          addressValue = `0x${hexNum.toString(16).toUpperCase().padStart(2, '0')}`;
        } else {
          // Try as decimal
          const decNum = parseInt(cleanAddress, 10);
          if (!isNaN(decNum) && decNum >= 80 && decNum <= 111) {
            addressValue = `0x${decNum.toString(16).toUpperCase().padStart(2, '0')}`;
          } else {
            throw new Error(`Invalid pump address: ${cleanAddress}. Must be between 0x50-0x6F (hex) or 80-111 (decimal)`);
          }
        }
      } else {
        throw new Error(`Invalid pump address format: ${cleanAddress}. Use hex (50, 0x50) or decimal (80)`);
      }

      await api.updateConfig({
        port,
        baudRate,
        pumpAddress: addressValue
      });

      setSuccess('Configuration updated successfully');
      await loadStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to update configuration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card config-panel">
      <h2 className="card-title">Serial Configuration</h2>

      <div className="form-group">
        <label className="label">Serial Port</label>
        <input
          type="text"
          className="input"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          placeholder="/dev/ttyUSB0"
        />
      </div>

      <div className="form-group">
        <label className="label">Baud Rate</label>
        <select
          className="input"
          value={baudRate}
          onChange={(e) => setBaudRate(parseInt(e.target.value, 10))}
        >
          <option value="9600">9600</option>
          <option value="19200">19200</option>
          <option value="38400">38400</option>
          <option value="57600">57600</option>
          <option value="115200">115200</option>
        </select>
      </div>

      <div className="form-group">
        <label className="label">Pump Address (Hex: 50-6F or Decimal: 80-111)</label>
        <input
          type="text"
          className="input"
          value={pumpAddress}
          onChange={(e) => setPumpAddress(e.target.value)}
          placeholder="50 or 0x50 or 80"
        />
        <small style={{ color: '#666', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
          Accepts: 50, 0x50, or 80 (all represent the same address)
        </small>
      </div>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <button
        className="button"
        onClick={handleUpdate}
        disabled={loading}
      >
        {loading ? 'Updating...' : 'Update Configuration'}
      </button>

      {status && (
        <div className="status-info">
          <div className="status-item">
            <span className="status-label">Connection:</span>
            <span className={`status-value ${status.connected ? 'connected' : 'disconnected'}`}>
              {status.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

