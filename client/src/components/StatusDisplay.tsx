import { PumpState, PumpStatus } from '../types/protocol';
import './StatusDisplay.css';

interface StatusDisplayProps {
  pumpState: PumpState | null;
}

const statusLabels: Record<number, string> = {
  [PumpStatus.PUMP_NOT_PROGRAMMED]: 'Not Programmed',
  [PumpStatus.RESET]: 'Reset',
  [PumpStatus.AUTHORIZED]: 'Authorized',
  [PumpStatus.FILLING]: 'Filling',
  [PumpStatus.FILLING_COMPLETED]: 'Filling Completed',
  [PumpStatus.MAX_AMOUNT_VOLUME_REACHED]: 'Max Amount/Volume Reached',
  [PumpStatus.SWITCHED_OFF]: 'Switched Off',
  [PumpStatus.SUSPENDED]: 'Suspended'
};

const statusColors: Record<number, string> = {
  [PumpStatus.PUMP_NOT_PROGRAMMED]: '#95a5a6',
  [PumpStatus.RESET]: '#3498db',
  [PumpStatus.AUTHORIZED]: '#2ecc71',
  [PumpStatus.FILLING]: '#f39c12',
  [PumpStatus.FILLING_COMPLETED]: '#27ae60',
  [PumpStatus.MAX_AMOUNT_VOLUME_REACHED]: '#e67e22',
  [PumpStatus.SWITCHED_OFF]: '#e74c3c',
  [PumpStatus.SUSPENDED]: '#9b59b6'
};

export function StatusDisplay({ pumpState }: StatusDisplayProps) {
  if (!pumpState) {
    return (
      <div className="card status-display">
        <h2 className="card-title">Pump Status</h2>
        <div className="no-data">No pump data received yet</div>
      </div>
    );
  }

  const statusLabel = statusLabels[pumpState.status] || 'Unknown';
  const statusColor = statusColors[pumpState.status] || '#95a5a6';

  return (
    <div className="card status-display">
      <h2 className="card-title">Pump Status</h2>

      <div className="status-grid">
        <div className="status-item">
          <span className="status-label">Status:</span>
          <span
            className="status-value"
            style={{ color: statusColor }}
          >
            {statusLabel}
          </span>
        </div>

        <div className="status-item">
          <span className="status-label">Address:</span>
          <span className="status-value">0x{pumpState.address.toString(16).toUpperCase()}</span>
        </div>

        {pumpState.volume !== undefined && (
          <div className="status-item">
            <span className="status-label">Volume:</span>
            <span className="status-value">{pumpState.volume.toFixed(2)} L</span>
          </div>
        )}

        {pumpState.amount !== undefined && (
          <div className="status-item">
            <span className="status-label">Amount:</span>
            <span className="status-value">{pumpState.amount.toFixed(2)} SAR</span>
          </div>
        )}

        {pumpState.nozzle !== undefined && (
          <div className="status-item">
            <span className="status-label">Nozzle:</span>
            <span className="status-value">
              #{pumpState.nozzle} {pumpState.nozzleOut ? '(Out)' : '(In)'}
            </span>
          </div>
        )}

        {pumpState.price !== undefined && (
          <div className="status-item">
            <span className="status-label">Price:</span>
            <span className="status-value">{pumpState.price.toFixed(4)} SAR/L</span>
          </div>
        )}

        {pumpState.identity && (
          <div className="status-item">
            <span className="status-label">Identity:</span>
            <span className="status-value">{pumpState.identity}</span>
          </div>
        )}

        <div className="status-item">
          <span className="status-label">Last Update:</span>
          <span className="status-value">
            {pumpState.lastUpdate.toLocaleTimeString()}
          </span>
        </div>
      </div>
    </div>
  );
}

