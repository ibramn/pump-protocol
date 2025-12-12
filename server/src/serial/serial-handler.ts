/**
 * Serial Port Handler for DART Pump Communication
 * Handles RS485 communication via serial port
 */

import { SerialPort } from 'serialport';
import { extractFrames, parseFrame, validateFrameCRC } from '../protocol/line-protocol';
import { decodeResponseTransaction } from '../protocol/decoder';
import { tryDecodeFrameByPattern } from '../protocol/frame-matcher';
import { DecodedMessage, SerialConfig, PumpAddress } from '../types/protocol';
import { EventEmitter } from 'events';

export class SerialHandler extends EventEmitter {
  private port: SerialPort | null = null;
  private byteBuffer: number[] = [];
  private config: SerialConfig;
  private isConnected: boolean = false;

  constructor(config: SerialConfig) {
    super();
    this.config = config;
  }

  /**
   * Connect to serial port
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.port) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.port = new SerialPort({
          path: this.config.port,
          baudRate: this.config.baudRate,
          dataBits: 8,
          parity: 'none',
          stopBits: 1,
          autoOpen: false
        });

        this.port.open((err) => {
          if (err) {
            reject(new Error(`Failed to open serial port: ${err.message}`));
            return;
          }

          this.isConnected = true;
          this.emit('connected');

          // Set up data handler
          this.port!.on('data', (data: Buffer) => {
            this.handleData(data);
          });

          this.port!.on('error', (err) => {
            this.emit('error', err);
          });

          this.port!.on('close', () => {
            this.isConnected = false;
            this.emit('disconnected');
          });

          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from serial port
   */
  async disconnect(): Promise<void> {
    if (!this.port || !this.isConnected) {
      return;
    }

    return new Promise((resolve) => {
      this.port!.close((err) => {
        if (err) {
          this.emit('error', err);
        }
        this.isConnected = false;
        this.port = null;
        this.byteBuffer = [];
        this.emit('disconnected');
        resolve();
      });
    });
  }

  /**
   * Send data to pump
   */
  async sendData(data: number[]): Promise<void> {
    if (!this.port || !this.isConnected) {
      throw new Error('Serial port not connected');
    }

    return new Promise((resolve, reject) => {
      const buffer = Buffer.from(data);
      this.port!.write(buffer, (err) => {
        if (err) {
          reject(err);
        } else {
          this.port!.drain(() => {
            resolve();
          });
        }
      });
    });
  }

  /**
   * Send a complete frame to the pump
   */
  async sendFrame(frame: number[]): Promise<void> {
    await this.sendData(frame);
    this.emit('frameSent', frame);
  }

  /**
   * Handle incoming data from serial port
   */
  private handleData(data: Buffer): void {
    // Add new bytes to buffer
    const newBytes = Array.from(data);
    this.byteBuffer.push(...newBytes);

    // Extract complete frames
    const frames = extractFrames(this.byteBuffer);

    // Process each complete frame
    for (const frame of frames) {
      this.processFrame(frame);
    }

    // Clean up buffer - keep only incomplete frame data
    this.cleanupBuffer();
  }

  /**
   * Process a complete frame
   */
  private processFrame(frame: number[]): void {
    // Extract address from frame (first byte)
    const address = frame[0] as PumpAddress;
    
    // Validate address range
    if (address < 0x50 || address > 0x6F) {
      // Not a valid pump address, skip
      return;
    }

    // Skip heartbeat frames (small frames with repeating patterns)
    if (frame.length < 6) {
      return;
    }
    
    // Check for heartbeat pattern (all bytes are 0x50, 0x51, 0x20, 0x70, 0xFA)
    const body = frame.slice(0, -2);
    if (body.every(x => [0x50, 0x51, 0x20, 0x70, 0xFA].includes(x))) {
      return; // Skip heartbeat
    }

    // First, try pattern-based decoding (like Python decoder)
    // This returns an array since frames can have multiple transactions
    const patternDecoded = tryDecodeFrameByPattern(frame);
    
    if (patternDecoded.length > 0) {
      // Pattern match succeeded - emit all decoded transactions
      for (const decoded of patternDecoded) {
        const message: DecodedMessage = {
          address,
          timestamp: new Date(),
          transaction: decoded,
          rawFrame: frame
        };
        this.emit('message', message);
      }
      return;
    }

    // If pattern matching fails, try protocol-based parsing
    // This handles frames with multiple transactions properly
    const parsedFrame = parseFrame(frame);
    if (parsedFrame && parsedFrame.transactions.length > 0) {
      // Decode all transactions in the frame and emit them together
      // Use a single timestamp for all transactions in the same frame
      const timestamp = new Date();
      
      for (const transaction of parsedFrame.transactions) {
        const txDecoded = decodeResponseTransaction(transaction);
        
        if (txDecoded) {
          const message: DecodedMessage = {
            address: parsedFrame.address,
            timestamp,
            transaction: txDecoded,
            rawFrame: frame
          };
          this.emit('message', message);
        } else {
          // Unknown transaction type - log but don't error
          console.log('Unknown transaction type:', transaction.trans, 'Length:', transaction.lng);
          this.emit('unknownTransaction', {
            address: parsedFrame.address,
            transaction,
            rawFrame: frame
          });
        }
      }
      return;
    }

    // If both methods fail, log for debugging (can be disabled later)
    // This helps identify frames that don't match expected patterns
    const frameHex = frame.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    console.log('Unrecognized frame:', {
      length: frame.length,
      address: `0x${address.toString(16)}`,
      hex: frameHex,
      bytes: frame
    });
  }

  /**
   * Clean up buffer, keeping only incomplete frame data
   */
  private cleanupBuffer(): void {
    // Find the last complete frame end (0x03, 0xFA)
    let lastFrameEnd = -1;
    for (let i = this.byteBuffer.length - 1; i > 0; i--) {
      if (this.byteBuffer[i - 1] === 0x03 && this.byteBuffer[i] === 0xFA) {
        lastFrameEnd = i + 1;
        break;
      }
    }

    if (lastFrameEnd > 0) {
      // Keep only bytes after the last complete frame
      this.byteBuffer = this.byteBuffer.slice(lastFrameEnd);
    } else if (this.byteBuffer.length > 1000) {
      // Prevent buffer overflow - keep last 500 bytes if no frame found
      this.byteBuffer = this.byteBuffer.slice(-500);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SerialConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Get current configuration
   */
  getConfig(): SerialConfig {
    return { ...this.config };
  }
}

