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
      const newState: PumpState = {
        address: data.address,
        status: prev?.status || 0,
        lastUpdate: new Date(data.timestamp)
      };

      switch (data.transaction.type) {
        case 1: // DC1_PUMP_STATUS
          newState.status = data.transaction.data.status;
          break;
        case 2: // DC2_FILLED_VOLUME_AMOUNT
          newState.volume = data.transaction.data.volume;
          newState.amount = data.transaction.data.amount;
          break;
        case 3: // DC3_NOZZLE_STATUS_FILLING_PRICE
          newState.nozzle = data.transaction.data.nozzle;
          newState.nozzleOut = data.transaction.data.nozzleOut;
          newState.price = data.transaction.data.price;
          break;
        case 9: // DC9_PUMP_IDENTITY
          newState.identity = data.transaction.data.identity;
          break;
      }

      return { ...prev, ...newState };
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

