import { useState, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { ConfigPanel } from './components/ConfigPanel';
import { CommandPanel } from './components/CommandPanel';
import { StatusDisplay } from './components/StatusDisplay';
import { TransactionLog } from './components/TransactionLog';
import { PumpVisualization } from './components/PumpVisualization';
import { PumpState, TransactionLogEntry } from './types/protocol';
import { config } from './config';
import './App.css';

function App() {
  const { isConnected, lastMessage } = useWebSocket(config.wsUrl);
  const [pumpState, setPumpState] = useState<PumpState | null>(null);
  const [transactionLog, setTransactionLog] = useState<TransactionLogEntry[]>([]);

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
    }
  }, [lastMessage]);

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
          
          // Only update if:
          // 1. The most common recent status is different from current, AND
          // 2. It appears at least 3 times in recent history (stable)
          if (prev?.status !== mostCommonStatus && maxCount >= 3) {
            newState.status = mostCommonStatus;
            newState.lastStatusUpdateTime = now;
            console.log('Status updated (stable):', prev?.status, '->', mostCommonStatus, `(${maxCount} occurrences in last 2s)`);
          } else {
            // Keep current status - either it's the same or not stable enough
            newState.status = prev?.status ?? newStatus;
            if (prev?.status !== newStatus && maxCount < 3) {
              console.log('Status change ignored (unstable):', prev?.status, '->', newStatus, `(only ${maxCount} occurrences)`);
            }
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
    </div>
  );
}

export default App;

