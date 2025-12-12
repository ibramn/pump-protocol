/**
 * DART Protocol Sniffer
 * Logs all serial communication (incoming and outgoing) for protocol analysis
 */

import { SerialPort } from 'serialport';
import * as fs from 'fs';
import * as path from 'path';

interface SnifferConfig {
  port: string;
  baudRate: number;
  outputFile?: string;
}

// Parse command line arguments
const args = process.argv.slice(2);
const config: SnifferConfig = {
  port: args[0] || '/dev/ttyUSB0',
  baudRate: parseInt(args[1] || '9600', 10),
  outputFile: args[2] || undefined
};

// Create output file if specified
let logStream: fs.WriteStream | null = null;
if (config.outputFile) {
  logStream = fs.createWriteStream(config.outputFile, { flags: 'a' });
  console.log(`Logging to file: ${config.outputFile}`);
}

function log(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`;
  console.log(logLine);
  if (logStream) {
    logStream.write(logLine + '\n');
  }
}

function formatHex(bytes: number[]): string {
  return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function formatHexWithSpaces(bytes: number[]): string {
  // Group bytes for readability
  const groups: string[] = [];
  for (let i = 0; i < bytes.length; i += 8) {
    groups.push(bytes.slice(i, i + 8).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '));
  }
  return groups.join('\n' + ' '.repeat(20));
}

function analyzeFrame(bytes: number[]): string {
  if (bytes.length < 8) {
    return 'Too short';
  }

  const address = bytes[0];
  const control = bytes[1];
  const etx = bytes[bytes.length - 2];
  const sf = bytes[bytes.length - 1];

  let analysis = `ADR:0x${address.toString(16).toUpperCase()} CTRL:0x${control.toString(16).toUpperCase()}`;

  // Check if it's a valid DART frame
  if (etx === 0x03 && sf === 0xFA) {
    analysis += ' [VALID DART FRAME]';
    
    // Try to parse transactions
    let pos = 2;
    const transactions: string[] = [];
    while (pos < bytes.length - 4) {
      if (pos + 1 >= bytes.length - 4) break;
      const trans = bytes[pos];
      const lng = bytes[pos + 1];
      if (lng < 0 || lng > 255 || pos + 2 + lng > bytes.length - 4) break;
      
      const transName = getTransactionName(trans);
      transactions.push(`${transName}(LNG:${lng})`);
      pos += 2 + lng;
    }
    
    if (transactions.length > 0) {
      analysis += ` Transactions: ${transactions.join(', ')}`;
    }
  } else {
    analysis += ' [INVALID FRAME - missing ETX/SF]';
  }

  return analysis;
}

function getTransactionName(trans: number): string {
  const names: { [key: number]: string } = {
    0x01: 'CD1/DC1',
    0x02: 'CD2',
    0x03: 'CD3/DC3',
    0x04: 'CD4',
    0x05: 'CD5/DC5',
    0x07: 'CD7/DC7',
    0x09: 'CD9/DC9',
    0x0E: 'CD14/DC14',
    0x0F: 'CD15/DC15',
    0x65: 'CD101/DC101'
  };
  return names[trans] || `TX:0x${trans.toString(16).toUpperCase()}`;
}

function getCommandName(cmd: number): string {
  const names: { [key: number]: string } = {
    0x00: 'RETURN_STATUS',
    0x02: 'RETURN_PUMP_PARAMETERS',
    0x03: 'RETURN_PUMP_IDENTITY',
    0x04: 'RETURN_FILLING_INFORMATION',
    0x05: 'RESET',
    0x06: 'AUTHORIZE',
    0x08: 'STOP',
    0x0A: 'SWITCH_OFF',
    0x0D: 'SUSPEND',
    0x0E: 'RESUME',
    0x0F: 'RETURN_PRICES'
  };
  return names[cmd] || `CMD:0x${cmd.toString(16).toUpperCase()}`;
}

// Main sniffer
async function startSniffer() {
  log(`Starting DART Protocol Sniffer`);
  log(`Port: ${config.port}, Baud Rate: ${config.baudRate}`);
  log(`Output file: ${config.outputFile || 'console only'}`);
  log('='.repeat(80));

  const port = new SerialPort({
    path: config.port,
    baudRate: config.baudRate,
    dataBits: 8,
    parity: 'none',
    stopBits: 1,
    autoOpen: false
  });

  let incomingBuffer: number[] = [];
  let outgoingBuffer: number[] = [];

  // Track frame boundaries
  function extractFrames(buffer: number[]): { frames: number[][]; remaining: number[] } {
    const frames: number[][] = [];
    let current: number[] = [];
    
    for (let i = 0; i < buffer.length; i++) {
      current.push(buffer[i]);
      
      // Check for end-of-frame marker (ETX + SF)
      if (current.length >= 2 && 
          current[current.length - 2] === 0x03 && 
          current[current.length - 1] === 0xFA) {
        frames.push([...current]);
        current = [];
      }
    }
    
    return { frames, remaining: current };
  }

  port.on('data', (data: Buffer) => {
    const bytes = Array.from(data);
    incomingBuffer.push(...bytes);
    
    const { frames, remaining } = extractFrames(incomingBuffer);
    incomingBuffer = remaining;
    
    for (const frame of frames) {
      log('>>> INCOMING (FROM PUMP)');
      log(`    Length: ${frame.length} bytes`);
      log(`    Hex: ${formatHex(frame)}`);
      log(`    Analysis: ${analyzeFrame(frame)}`);
      
      // Try to decode status if it's a DC1 frame
      if (frame.length >= 9 && frame[2] === 0x01 && frame[3] === 0x01) {
        const status = frame[4];
        const statusNames: { [key: number]: string } = {
          0: 'NOT_PROGRAMMED',
          1: 'RESET',
          2: 'AUTHORIZED',
          4: 'FILLING',
          5: 'FILLING_COMPLETED',
          6: 'MAX_REACHED',
          7: 'SWITCHED_OFF',
          8: 'SUSPENDED'
        };
        log(`    Status: ${status} (${statusNames[status] || 'UNKNOWN'})`);
      }
      
      // Try to decode command if it's a CD1 frame
      if (frame.length >= 6 && frame[2] === 0x01 && frame[3] === 0x01) {
        const cmd = frame[4];
        log(`    Command: ${getCommandName(cmd)}`);
      }
      
      log('');
    }
  });

  port.on('error', (err) => {
    log(`ERROR: ${err.message}`);
  });

  port.on('close', () => {
    log('Port closed');
    if (logStream) {
      logStream.end();
    }
    process.exit(0);
  });

  // Intercept writes to capture outgoing data
  const originalWrite = port.write.bind(port);
  port.write = function(data: any, callback?: any) {
    const bytes = Buffer.isBuffer(data) ? Array.from(data) : Array.from(Buffer.from(data));
    outgoingBuffer.push(...bytes);
    
    const { frames, remaining } = extractFrames(outgoingBuffer);
    outgoingBuffer = remaining;
    
    for (const frame of frames) {
      log('<<< OUTGOING (TO PUMP)');
      log(`    Length: ${frame.length} bytes`);
      log(`    Hex: ${formatHex(frame)}`);
      log(`    Analysis: ${analyzeFrame(frame)}`);
      
      // Try to decode command if it's a CD1 frame
      if (frame.length >= 6 && frame[2] === 0x01 && frame[3] === 0x01) {
        const cmd = frame[4];
        log(`    Command: ${getCommandName(cmd)}`);
      }
      
      log('');
    }
    
    return originalWrite(data, callback);
  };

  port.open((err) => {
    if (err) {
      log(`ERROR: Failed to open port: ${err.message}`);
      process.exit(1);
    }
    
    log('Port opened successfully');
    log('Waiting for data... (Press Ctrl+C to stop)');
    log('='.repeat(80));
    log('');
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    log('');
    log('Shutting down...');
    port.close();
  });
}

// Start the sniffer
startSniffer().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

