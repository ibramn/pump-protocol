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
      const address = pumpAddress.startsWith('0x')
        ? pumpAddress
        : `0x${parseInt(pumpAddress, 10).toString(16).toUpperCase().padStart(2, '0')}`;

      await api.updateConfig({
        port,
        baudRate,
        pumpAddress: address
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
        <label className="label">Pump Address (Hex, 50-6F)</label>
        <input
          type="text"
          className="input"
          value={pumpAddress}
          onChange={(e) => setPumpAddress(e.target.value)}
          placeholder="50"
        />
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

