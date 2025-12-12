import { PumpState, PumpStatus } from '../types/protocol';
import './PumpVisualization.css';

interface PumpVisualizationProps {
  pumpState: PumpState | null;
}

export function PumpVisualization({ pumpState }: PumpVisualizationProps) {
  if (!pumpState) {
    return (
      <div className="card pump-visualization">
        <h2 className="card-title">Pump Visualization</h2>
        <div className="no-data">No pump data available</div>
      </div>
    );
  }

  const isActive = pumpState.status === PumpStatus.FILLING || 
                   pumpState.status === PumpStatus.AUTHORIZED;

  return (
    <div className="card pump-visualization">
      <h2 className="card-title">Pump Visualization</h2>

      <div className="pump-display">
        <div className={`pump-body ${isActive ? 'active' : ''}`}>
          <div className="pump-screen">
            <div className="screen-line">
              <span className="screen-label">Status:</span>
              <span className="screen-value">{getStatusLabel(pumpState.status)}</span>
            </div>
            {pumpState.volume !== undefined && (
              <div className="screen-line">
                <span className="screen-label">Volume:</span>
                <span className="screen-value">{pumpState.volume.toFixed(2)} L</span>
              </div>
            )}
            {pumpState.amount !== undefined && (
              <div className="screen-line">
                <span className="screen-label">Amount:</span>
                <span className="screen-value">{pumpState.amount.toFixed(2)} SAR</span>
              </div>
            )}
            {pumpState.price !== undefined && (
              <div className="screen-line">
                <span className="screen-label">Price:</span>
                <span className="screen-value">{pumpState.price.toFixed(2)} SAR/L</span>
              </div>
            )}
          </div>

          {pumpState.nozzle !== undefined && (
            <div className="nozzle-display">
              <div className={`nozzle ${pumpState.nozzleOut ? 'out' : 'in'}`}>
                <span className="nozzle-label">Nozzle #{pumpState.nozzle}</span>
                <span className="nozzle-status">
                  {pumpState.nozzleOut ? '● Out' : '○ In'}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="pump-indicator">
          <div className={`indicator ${isActive ? 'on' : 'off'}`}></div>
          <span>{isActive ? 'Active' : 'Inactive'}</span>
        </div>
      </div>
    </div>
  );
}

function getStatusLabel(status: PumpStatus): string {
  const labels: Record<number, string> = {
    [PumpStatus.PUMP_NOT_PROGRAMMED]: 'Not Programmed',
    [PumpStatus.RESET]: 'Reset',
    [PumpStatus.AUTHORIZED]: 'Authorized',
    [PumpStatus.FILLING]: 'Filling',
    [PumpStatus.FILLING_COMPLETED]: 'Complete',
    [PumpStatus.MAX_AMOUNT_VOLUME_REACHED]: 'Max Reached',
    [PumpStatus.SWITCHED_OFF]: 'Off',
    [PumpStatus.SUSPENDED]: 'Suspended'
  };
  return labels[status] || 'Unknown';
}

