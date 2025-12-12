import { useState, useEffect, useRef } from 'react';
import './LogPanel.css';

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'raw' | 'frame' | 'decoded' | 'sent' | 'error' | 'unknown';
  message: string;
  data?: any;
  hex?: string;
}

interface LogPanelProps {
  logs: LogEntry[];
  onClear?: () => void;
  paused?: boolean;
  onPauseChange?: (paused: boolean) => void;
}

export function LogPanel({ logs, onClear, paused: externalPaused, onPauseChange }: LogPanelProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<'all' | 'raw' | 'frame' | 'decoded' | 'sent' | 'error' | 'hex'>('all');
  const [internalPaused, setInternalPaused] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  
  // Use external paused state if provided, otherwise use internal state
  const paused = externalPaused !== undefined ? externalPaused : internalPaused;
  const setPaused = (value: boolean) => {
    console.log('[LOG PANEL] Setting paused to:', value);
    if (onPauseChange) {
      onPauseChange(value);
    } else {
      setInternalPaused(value);
    }
  };

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true;
    if (filter === 'hex') return true; // Show all logs in hex view, but display them differently
    return log.type === filter;
  });

  const getLogIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'raw': return '📥';
      case 'frame': return '📦';
      case 'decoded': return '✅';
      case 'sent': return '📤';
      case 'error': return '❌';
      case 'unknown': return '❓';
      default: return '📋';
    }
  };

  const getLogColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'raw': return 'log-raw';
      case 'frame': return 'log-frame';
      case 'decoded': return 'log-decoded';
      case 'sent': return 'log-sent';
      case 'error': return 'log-error';
      case 'unknown': return 'log-unknown';
      default: return '';
    }
  };

  return (
    <div className="card log-panel">
      <div className="log-panel-header">
        <h2 className="card-title">Communication Log</h2>
        <div className="log-controls">
          <div className="filter-buttons">
            <button
              className={`filter-button ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              className={`filter-button ${filter === 'raw' ? 'active' : ''}`}
              onClick={() => setFilter('raw')}
            >
              Raw
            </button>
            <button
              className={`filter-button ${filter === 'frame' ? 'active' : ''}`}
              onClick={() => setFilter('frame')}
            >
              Frames
            </button>
            <button
              className={`filter-button ${filter === 'decoded' ? 'active' : ''}`}
              onClick={() => setFilter('decoded')}
            >
              Decoded
            </button>
            <button
              className={`filter-button ${filter === 'sent' ? 'active' : ''}`}
              onClick={() => setFilter('sent')}
            >
              Sent
            </button>
            <button
              className={`filter-button ${filter === 'error' ? 'active' : ''}`}
              onClick={() => setFilter('error')}
            >
              Errors
            </button>
            <button
              className={`filter-button ${filter === 'hex' ? 'active' : ''}`}
              onClick={() => setFilter('hex')}
            >
              Hex Only
            </button>
          </div>
          <div className="log-actions">
            <button
              className={`pause-button ${paused ? 'paused' : ''}`}
              onClick={() => setPaused(!paused)}
              title={paused ? 'Resume logging' : 'Pause logging'}
            >
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <label className="auto-scroll-toggle">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              Auto-scroll
            </label>
            {onClear && (
              <button className="clear-button" onClick={onClear}>
                Clear
              </button>
            )}
          </div>
        </div>
        <div className="log-count">
          {filteredLogs.length} / {logs.length} entries
        </div>
      </div>

      {paused && (
        <div className="log-paused-banner">
          ⏸ Logging is paused. New logs will not be displayed until resumed.
        </div>
      )}
      <div className="log-content">
        {filteredLogs.length === 0 ? (
          <div className="log-empty">No logs to display</div>
        ) : filter === 'hex' ? (
          // Hex-only view: show just timestamp and hex data, no decoding
          filteredLogs.map((log) => (
            <div key={log.id} className="log-entry-hex">
              <div className="log-hex-header">
                <span className="log-timestamp">{new Date(log.timestamp).toLocaleTimeString()}</span>
                {log.hex ? (
                  <code className="log-hex-only">{log.hex}</code>
                ) : (
                  <span className="log-no-hex">No hex data</span>
                )}
              </div>
            </div>
          ))
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className={`log-entry ${getLogColor(log.type)}`}>
              <div className="log-header">
                <span className="log-icon">{getLogIcon(log.type)}</span>
                <span className="log-timestamp">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span className="log-type">{log.type.toUpperCase()}</span>
                <span className="log-message">{log.message}</span>
              </div>
              {log.hex && (
                <div className="log-hex">
                  <span className="log-hex-label">Hex:</span>
                  <code className="log-hex-value">{log.hex}</code>
                </div>
              )}
              {log.data && (
                <div className="log-data">
                  <pre>{JSON.stringify(log.data, null, 2)}</pre>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

