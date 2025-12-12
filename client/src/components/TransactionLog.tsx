import { useState } from 'react';
import { TransactionLogEntry } from '../types/protocol';
import './TransactionLog.css';

interface TransactionLogProps {
  transactions: TransactionLogEntry[];
}

export function TransactionLog({ transactions }: TransactionLogProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'sent' | 'received'>('all');

  const filteredTransactions = transactions.filter(t => {
    if (filter === 'all') return true;
    return t.direction === filter;
  });

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="card transaction-log">
      <h2 className="card-title">Transaction Log</h2>

      <div className="log-controls">
        <div className="filter-buttons">
          <button
            className={`filter-button ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={`filter-button ${filter === 'sent' ? 'active' : ''}`}
            onClick={() => setFilter('sent')}
          >
            Sent
          </button>
          <button
            className={`filter-button ${filter === 'received' ? 'active' : ''}`}
            onClick={() => setFilter('received')}
          >
            Received
          </button>
        </div>
        <div className="log-count">
          {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="log-entries">
        {filteredTransactions.length === 0 ? (
          <div className="no-data">No transactions yet</div>
        ) : (
          filteredTransactions.map((entry) => (
            <div
              key={entry.id}
              className={`log-entry ${entry.direction} ${expandedId === entry.id ? 'expanded' : ''}`}
            >
              <div
                className="log-entry-header"
                onClick={() => toggleExpand(entry.id)}
              >
                <div className="log-entry-main">
                  <span className="log-direction">{entry.direction === 'sent' ? '→' : '←'}</span>
                  <span className="log-type">{entry.transactionType}</span>
                  <span className="log-time">
                    {entry.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <span className="log-expand">{expandedId === entry.id ? '▼' : '▶'}</span>
              </div>

              {expandedId === entry.id && (
                <div className="log-entry-details">
                  <div className="detail-section">
                    <strong>Timestamp:</strong> {entry.timestamp.toLocaleString()}
                  </div>
                  <div className="detail-section">
                    <strong>Data:</strong>
                    <pre className="detail-json">
                      {JSON.stringify(entry.data, null, 2)}
                    </pre>
                  </div>
                  {entry.rawHex && (
                    <div className="detail-section">
                      <strong>Raw Hex:</strong>
                      <code className="detail-hex">{entry.rawHex}</code>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

