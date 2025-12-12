import { useState } from 'react';
import { api, SendCommandRequest } from '../services/api';
import { PumpCommand } from '../types/protocol';
import './CommandPanel.css';

interface CommandPanelProps {
  onCommandSent: (command: any, frameHex: string) => void;
}

export function CommandPanel({ onCommandSent }: CommandPanelProps) {
  const [pumpAddress, setPumpAddress] = useState('50');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Command-specific state
  const [nozzles, setNozzles] = useState('1,2,3');
  const [presetVolume, setPresetVolume] = useState('');
  const [presetAmount, setPresetAmount] = useState('');
  const [prices, setPrices] = useState('2.18');
  const [outputFunction, setOutputFunction] = useState('0x0A');
  const [outputCommand, setOutputCommand] = useState('0x01');
  const [fillingType, setFillingType] = useState('0');
  const [suspendNozzle, setSuspendNozzle] = useState('0');
  const [resumeNozzle, setResumeNozzle] = useState('0');
  const [counter, setCounter] = useState('0x01');

  const sendCommand = async (commandType: string, commandData: any) => {
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

      const request: SendCommandRequest = {
        command: {
          type: commandType,
          data: commandData
        },
        pumpAddress: addressValue
      };

      const response = await api.sendCommand(request);
      setSuccess('Command sent successfully');
      onCommandSent(request.command, response.frame.hex);
    } catch (err: any) {
      setError(err.message || 'Failed to send command');
    } finally {
      setLoading(false);
    }
  };

  const handleBasicCommand = (command: PumpCommand) => {
    // For AUTHORIZE, include allowed nozzles if specified
    if (command === PumpCommand.AUTHORIZE && nozzles.trim()) {
      const nozzleArray = nozzles.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n) && n > 0);
      if (nozzleArray.length > 0) {
        sendCommand('CD1', { 
          command,
          allowedNozzles: nozzleArray
        });
        return;
      }
    }
    sendCommand('CD1', { command });
  };

  const handleAllowedNozzles = () => {
    const nozzleArray = nozzles.split(',').map(n => parseInt(n.trim(), 10));
    sendCommand('CD2', { nozzles: nozzleArray });
  };

  const handlePresetVolume = () => {
    sendCommand('CD3', { volume: parseFloat(presetVolume) });
  };

  const handlePresetAmount = () => {
    sendCommand('CD4', { amount: parseFloat(presetAmount) });
  };

  const handlePriceUpdate = () => {
    const priceArray = prices.split(',').map(p => parseFloat(p.trim()));
    sendCommand('CD5', { prices: priceArray });
  };

  const handleCommandToOutput = () => {
    sendCommand('CD7', {
      outputFunction: parseInt(outputFunction, 16),
      command: parseInt(outputCommand, 16)
    });
  };

  const handleSetFillingType = () => {
    sendCommand('CD13', { fillingType: parseInt(fillingType, 10) });
  };

  const handleSuspend = () => {
    sendCommand('CD14', { nozzle: parseInt(suspendNozzle, 10) });
  };

  const handleResume = () => {
    sendCommand('CD15', { nozzle: parseInt(resumeNozzle, 10) });
  };

  const handleRequestCounters = () => {
    sendCommand('CD101', { counter: parseInt(counter, 16) });
  };

  return (
    <div className="card command-panel">
      <h2 className="card-title">Command Panel</h2>

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

      <div className="command-sections">
        <section className="command-section">
          <h3>Basic Commands</h3>
          <div style={{ 
            padding: '10px', 
            marginBottom: '10px', 
            backgroundColor: '#fff3cd', 
            border: '1px solid #ffc107', 
            borderRadius: '4px',
            fontSize: '0.9rem'
          }}>
            <strong>⚠️ Important:</strong> If pump shows "NOT PROGRAMMED", send a <strong>Price Update</strong> first, then RESET, then AUTHORIZE.
          </div>
          <div className="button-group">
            <button
              className="button"
              onClick={() => handleBasicCommand(PumpCommand.RETURN_STATUS)}
              disabled={loading}
            >
              Return Status
            </button>
            <button
              className="button"
              onClick={() => handleBasicCommand(PumpCommand.RESET)}
              disabled={loading}
              title="Send RESET before AUTHORIZE to prepare the pump"
            >
              Reset
            </button>
            <button
              className="button button-success"
              onClick={() => handleBasicCommand(PumpCommand.AUTHORIZE)}
              disabled={loading}
            >
              Authorize
            </button>
            <button
              className="button button-danger"
              onClick={() => handleBasicCommand(PumpCommand.STOP)}
              disabled={loading}
            >
              Stop
            </button>
            <button
              className="button"
              onClick={() => handleBasicCommand(PumpCommand.SWITCH_OFF)}
              disabled={loading}
            >
              Switch Off
            </button>
            <button
              className="button"
              onClick={() => handleBasicCommand(PumpCommand.RETURN_PUMP_IDENTITY)}
              disabled={loading}
            >
              Get Identity
            </button>
            <button
              className="button"
              onClick={() => handleBasicCommand(PumpCommand.RETURN_FILLING_INFORMATION)}
              disabled={loading}
            >
              Get Filling Info
            </button>
          </div>
        </section>

        <section className="command-section">
          <h3>Nozzle Control</h3>
          <div className="form-group">
            <label className="label">Allowed Nozzles (comma-separated)</label>
            <input
              type="text"
              className="input"
              value={nozzles}
              onChange={(e) => setNozzles(e.target.value)}
              placeholder="1,2,3"
            />
            <button
              className="button"
              onClick={handleAllowedNozzles}
              disabled={loading}
            >
              Set Allowed Nozzles
            </button>
          </div>
        </section>

        <section className="command-section">
          <h3>Presets</h3>
          <div className="form-group">
            <label className="label">Preset Volume (liters)</label>
            <input
              type="number"
              className="input"
              value={presetVolume}
              onChange={(e) => setPresetVolume(e.target.value)}
              placeholder="100.00"
            />
            <button
              className="button"
              onClick={handlePresetVolume}
              disabled={loading}
            >
              Set Preset Volume
            </button>
          </div>
          <div className="form-group">
            <label className="label">Preset Amount (SAR)</label>
            <input
              type="number"
              className="input"
              value={presetAmount}
              onChange={(e) => setPresetAmount(e.target.value)}
              placeholder="200.00"
            />
            <button
              className="button"
              onClick={handlePresetAmount}
              disabled={loading}
            >
              Set Preset Amount
            </button>
          </div>
        </section>

        <section className="command-section">
          <h3>Price Management</h3>
          <div className="form-group">
            <label className="label">Prices (comma-separated, SAR/L)</label>
            <input
              type="text"
              className="input"
              value={prices}
              onChange={(e) => setPrices(e.target.value)}
              placeholder="2.18"
            />
            <button
              className="button"
              onClick={handlePriceUpdate}
              disabled={loading}
            >
              Update Prices
            </button>
          </div>
        </section>

        <section className="command-section">
          <h3>Control Commands</h3>
          <div className="form-group">
            <label className="label">Suspend Nozzle</label>
            <input
              type="number"
              className="input"
              value={suspendNozzle}
              onChange={(e) => setSuspendNozzle(e.target.value)}
              placeholder="0"
            />
            <button
              className="button"
              onClick={handleSuspend}
              disabled={loading}
            >
              Suspend
            </button>
          </div>
          <div className="form-group">
            <label className="label">Resume Nozzle</label>
            <input
              type="number"
              className="input"
              value={resumeNozzle}
              onChange={(e) => setResumeNozzle(e.target.value)}
              placeholder="0"
            />
            <button
              className="button"
              onClick={handleResume}
              disabled={loading}
            >
              Resume
            </button>
          </div>
        </section>

        <section className="command-section">
          <h3>Advanced Commands</h3>
          <div className="form-group">
            <label className="label">Output Function (Hex)</label>
            <input
              type="text"
              className="input"
              value={outputFunction}
              onChange={(e) => setOutputFunction(e.target.value)}
              placeholder="0x0A"
            />
            <label className="label">Output Command (Hex)</label>
            <input
              type="text"
              className="input"
              value={outputCommand}
              onChange={(e) => setOutputCommand(e.target.value)}
              placeholder="0x01"
            />
            <button
              className="button"
              onClick={handleCommandToOutput}
              disabled={loading}
            >
              Send Output Command
            </button>
          </div>
          <div className="form-group">
            <label className="label">Filling Type (0=Cash, 1=Credit)</label>
            <input
              type="number"
              className="input"
              value={fillingType}
              onChange={(e) => setFillingType(e.target.value)}
              placeholder="0"
            />
            <button
              className="button"
              onClick={handleSetFillingType}
              disabled={loading}
            >
              Set Filling Type
            </button>
          </div>
          <div className="form-group">
            <label className="label">Counter Number (Hex)</label>
            <input
              type="text"
              className="input"
              value={counter}
              onChange={(e) => setCounter(e.target.value)}
              placeholder="0x01"
            />
            <button
              className="button"
              onClick={handleRequestCounters}
              disabled={loading}
            >
              Request Counters
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

