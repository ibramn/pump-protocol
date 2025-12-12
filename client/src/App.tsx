import { useState, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { ConfigPanel } from './components/ConfigPanel';
import { CommandPanel } from './components/CommandPanel';
import { StatusDisplay } from './components/StatusDisplay';
import { TransactionLog } from './components/TransactionLog';
import { PumpVisualization } from './components/PumpVisualization';
import { LogPanel, LogEntry } from './components/LogPanel';
import { PumpState, TransactionLogEntry } from './types/protocol';
import { config } from './config';
import './App.css';

function App() {
  const { isConnected, lastMessage } = useWebSocket(config.wsUrl);
  const [pumpState, setPumpState] = useState<PumpState | null>(null);
  const [transactionLog, setTransactionLog] = useState<TransactionLogEntry[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsPaused, setLogsPaused] = useState(false);

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case 'pumpMessage':
        handlePumpMessage(lastMessage.data);
        break;
      case 'commandAck':
        handleCommandAck(lastMessage.data);
        break;
      case 'connectionStatus':
        console.log('Connection status:', lastMessage.data);
        break;
      case 'log':
        // Only add logs if not paused
        if (logsPaused) {
          console.log('[LOG] Logging is paused, skipping log entry');
        } else {
          setLogs(prev => {
            const newLogs = [...prev, lastMessage.data];
            // Keep only last 1000 logs to prevent memory issues
            return newLogs.slice(-1000);
          });
        }
        break;
    }
  }, [lastMessage, logsPaused]);

  const handlePumpMessage = (data: any) => {
    // Update pump state based on transaction type
    setPumpState((prev) => {
      // Start with previous state or defaults
      const newState: PumpState = {
        address: data.address,
        status: prev?.status ?? 0,
        lastUpdate: new Date(data.timestamp),
        ...prev // Preserve all previous fields
      };

      // Process transactions in order - later transactions in the same frame override earlier ones
      // This handles frames with multiple transactions (e.g., DC1 + DC3 together)
      switch (data.transaction.type) {
        case 1: // DC1_PUMP_STATUS
          const newStatus = data.transaction.data.status;
          const now = Date.now();
          
          // Initialize status history if needed
          if (!newState.statusHistory) {
            newState.statusHistory = [];
          }
          
          // Add this status to history (keep last 10 entries)
          newState.statusHistory.push({ status: newStatus, timestamp: now });
          if (newState.statusHistory.length > 10) {
            newState.statusHistory.shift();
          }
          
          // Check if status has been consistent for at least 1 second
          // This prevents rapid switching between statuses
          const recentStatuses = newState.statusHistory.filter(
            entry => now - entry.timestamp < 2000 // Last 2 seconds
          );
          
          // Count occurrences of each status in recent history
          const statusCounts = new Map<number, number>();
          recentStatuses.forEach(entry => {
            statusCounts.set(entry.status, (statusCounts.get(entry.status) || 0) + 1);
          });
          
          // Find the most common status in recent history
          let mostCommonStatus = newStatus;
          let maxCount = 0;
          statusCounts.forEach((count, status) => {
            if (count > maxCount) {
              maxCount = count;
              mostCommonStatus = status;
            }
          });
          
          // IMPORTANT: The pump alternates between status 0 (NOT PROGRAMMED) and 5 (FILLING COMPLETED)
          // when idle. This is NORMAL pump behavior - it's a keepalive/heartbeat mechanism.
          // 
          // The pump sends:
          // - Status 0: Simple 9-byte frame (PUMP NOT PROGRAMMED)
          // - Status 5: 15-byte frame with DC1 + DC3 (FILLING COMPLETED, includes price/nozzle data)
          //
          // This happens periodically (every few seconds) even when the pump is idle and nothing is happening.
          // It's the pump's way of:
          // 1. Keeping the communication line active
          // 2. Checking if the controller is still alive
          // 3. Providing periodic state updates
          //
          // Strategy: When both status 0 and 5 appear (idle state), ALWAYS prefer status 5 because:
          // - It's more informative (includes price/nozzle data)
          // - It represents the pump's actual ready state (completed previous operation)
          // - Status 0 is just a "not programmed" state that alternates with 5 during idle
          
          // Check for important status transitions that should be shown immediately
          const hasStatus1 = recentStatuses.some(e => e.status === 1); // RESET - important!
          const hasStatus2 = recentStatuses.some(e => e.status === 2); // AUTHORIZED - important!
          const hasStatus5 = recentStatuses.some(e => e.status === 5);
          const hasStatus0 = recentStatuses.some(e => e.status === 0);
          
          // Priority: Status 1 (RESET) and Status 2 (AUTHORIZED) are critical transitions
          // Show them immediately if they appear, even if other statuses are more common
          if (hasStatus1) {
            // RESET state - show immediately (needed for AUTHORIZE to work)
            newState.status = 1;
            newState.lastStatusUpdateTime = now;
          } else if (hasStatus2) {
            // AUTHORIZED state - show immediately (confirms AUTHORIZE worked)
            newState.status = 2;
            newState.lastStatusUpdateTime = now;
          } else if (hasStatus5 && hasStatus0) {
            // Both statuses appear - this is idle keepalive behavior
            // ALWAYS prefer status 5 (more informative, represents actual ready state)
            // Ignore status 0 completely when status 5 is also present
            newState.status = 5;
            newState.lastStatusUpdateTime = now;
          } else if (hasStatus5 && !hasStatus0) {
            // Only status 5 - use it
            newState.status = 5;
            newState.lastStatusUpdateTime = now;
          } else if (hasStatus0 && !hasStatus5 && maxCount >= 3) {
            // Only status 0 appears consistently (3+ times) - pump is truly not programmed
            // Only update if it's been consistent for a while
            newState.status = 0;
            newState.lastStatusUpdateTime = now;
          } else if (prev?.status !== mostCommonStatus && maxCount >= 3) {
            // Other status appears consistently - use it
            newState.status = mostCommonStatus;
            newState.lastStatusUpdateTime = now;
          } else {
            // Keep current status (don't switch on single status 0 when we've seen status 5 before)
            newState.status = prev?.status ?? newStatus;
          }
          break;
        case 2: // DC2_FILLED_VOLUME_AMOUNT
          newState.volume = data.transaction.data.volume;
          newState.amount = data.transaction.data.amount;
          break;
        case 3: // DC3_NOZZLE_STATUS_FILLING_PRICE
          newState.nozzle = data.transaction.data.nozzle;
          newState.nozzleOut = data.transaction.data.nozzleOut;
          // Only update price if it's in valid range (0.5 - 10.0 SAR/L)
          const price = data.transaction.data.price;
          if (price && price >= 0.5 && price <= 10.0) {
            newState.price = price;
          }
          // If price is invalid, don't update it (keep previous or undefined)
          break;
        case 9: // DC9_PUMP_IDENTITY
          newState.identity = data.transaction.data.identity;
          break;
      }

      return newState;
    });

    // Add to transaction log
    const logEntry: TransactionLogEntry = {
      id: `rx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(data.timestamp),
      direction: 'received',
      transactionType: `DC${data.transaction.type}`,
      data: data.transaction.data,
      rawHex: data.rawHex
    };

    setTransactionLog((prev) => [logEntry, ...prev].slice(0, 1000)); // Keep last 1000 entries
  };

  const handleCommandAck = (data: any) => {
    const logEntry: TransactionLogEntry = {
      id: data.commandId || `tx_${Date.now()}`,
      timestamp: new Date(data.timestamp),
      direction: 'sent',
      transactionType: 'Command',
      data: data,
      rawHex: ''
    };

    setTransactionLog((prev) => [logEntry, ...prev].slice(0, 1000));
  };

  const addSentCommand = (command: any, frameHex: string) => {
    const logEntry: TransactionLogEntry = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      direction: 'sent',
      transactionType: command.type || 'Command',
      data: command,
      rawHex: frameHex
    };

    setTransactionLog((prev) => [logEntry, ...prev].slice(0, 1000));
  };

  const handleLogMessage = (data: LogEntry) => {
    // Only add logs if not paused
    if (logsPaused) {
      return;
    }
    setLogs(prev => {
      const newLogs = [...prev, data];
      // Keep only last 1000 logs to prevent memory issues
      return newLogs.slice(-1000);
    });
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>DART Pump Protocol Tester</h1>
        <div className="connection-status">
          <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '●' : '○'}
          </span>
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </header>

      <div className="app-content">
        <div className="left-panel">
          <ConfigPanel />
          <CommandPanel onCommandSent={addSentCommand} />
        </div>

        <div className="right-panel">
          <PumpVisualization pumpState={pumpState} />
          <StatusDisplay pumpState={pumpState} />
          <TransactionLog transactions={transactionLog} />
        </div>
      </div>

      <div className="log-section">
        <LogPanel 
          logs={logs} 
          onClear={clearLogs}
          paused={logsPaused}
          onPauseChange={setLogsPaused}
        />
      </div>
    </div>
  );
}

export default App;

