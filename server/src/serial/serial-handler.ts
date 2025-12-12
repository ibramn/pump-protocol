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
  private lastAckTime: Map<PumpAddress, number> = new Map(); // Track last ACK time per address
  private ackThrottleMs: number = 1000; // Minimum time between ACKs (1 second)

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
   * For RS485 half-duplex, we need to ensure the line is clear before sending
   */
  async sendFrame(frame: number[]): Promise<void> {
    const frameHex = frame.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    console.log(`[SERIAL] Sending frame (${frame.length} bytes):`, frameHex);
    await this.sendData(frame);
    
    // Small delay for RS485 half-duplex - allow time for transmission to complete
    // and for the line to switch from transmit to receive mode
    await new Promise(resolve => setTimeout(resolve, 50));
    
    this.emit('frameSent', frame);
  }

  /**
   * Handle incoming data from serial port
   */
  private handleData(data: Buffer): void {
    // Log raw incoming bytes for debugging
    const rawHex = Array.from(data).map((b: number) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    console.log(`[RAW INCOMING] ${data.length} bytes:`, rawHex);
    
    // Add new bytes to buffer
    const newBytes = Array.from(data);
    this.byteBuffer.push(...newBytes);

    // Extract complete frames
    const frames = extractFrames(this.byteBuffer);

    // Process each complete frame
    for (const frame of frames) {
      const frameHex = frame.map((b: number) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      console.log(`[FRAME EXTRACTED] ${frame.length} bytes:`, frameHex);
      this.processFrame(frame);
    }

    // Clean up buffer - keep only incomplete frame data
    this.cleanupBuffer();
  }

  /**
   * Send acknowledgment frame to pump
   * Some DART implementations may require ACK frames to confirm receipt
   * This sends a RETURN STATUS command as acknowledgment
   * 
   * NOTE: Rate-limited to prevent acknowledgment loops
   */
  private async sendAcknowledgment(address: PumpAddress): Promise<void> {
    try {
      // Rate limit: Don't send ACK if we sent one recently (within throttle period)
      const now = Date.now();
      const lastAck = this.lastAckTime.get(address) || 0;
      const timeSinceLastAck = now - lastAck;
      
      if (timeSinceLastAck < this.ackThrottleMs) {
        // Too soon since last ACK, skip this one
        return;
      }
      
      // Update last ACK time
      this.lastAckTime.set(address, now);
      
      // Send RETURN STATUS (CD1 with command 0x00) as acknowledgment
      // This tells the pump we received its message and are requesting status
      const { encodeCommandTransaction } = require('../protocol/encoder');
      const { buildFrame } = require('../protocol/line-protocol');
      
      const transaction = encodeCommandTransaction({
        type: 1, // CD1
        data: {
          command: 0 // RETURN STATUS
        }
      });
      
      const ackFrame = buildFrame(address, 0x00, [transaction]);
      await this.sendFrame(ackFrame);
      console.log(`[ACK] Sent acknowledgment to pump 0x${address.toString(16)} (throttled: ${timeSinceLastAck}ms since last)`);
    } catch (error) {
      console.error('Failed to send acknowledgment:', error);
    }
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
      const timestamp = new Date();
      let shouldAck = false;
      
      for (const decoded of patternDecoded) {
        const message: DecodedMessage = {
          address,
          timestamp,
          transaction: decoded,
          rawFrame: frame
        };
        this.emit('message', message);
        
        // Status frames might need acknowledgment
        if (decoded.type === 1) {
          shouldAck = true;
        }
      }
      
      // DISABLED: Sending RETURN STATUS as ACK causes the pump to send more status updates
      // creating a loop. The pump doesn't seem to require explicit acknowledgments.
      // If your pump requires ACKs, you may need a different acknowledgment method.
      // if (shouldAck) {
      //   setTimeout(() => {
      //     this.sendAcknowledgment(address).catch(console.error);
      //   }, 50);
      // }
      
      return;
    }

    // If pattern matching fails, try protocol-based parsing
    // This handles frames with multiple transactions properly
    const parsedFrame = parseFrame(frame);
    if (parsedFrame && parsedFrame.transactions.length > 0) {
      // Decode all transactions in the frame and emit them together
      // Use a single timestamp for all transactions in the same frame
      const timestamp = new Date();
      
      // Track if we should send acknowledgment
      let shouldAck = false;
      
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
          
          // Some transaction types might require acknowledgment
          // DC1 (status) and DC3 (nozzle/price) are commonly acknowledged
          if (txDecoded.type === 1 || txDecoded.type === 3) {
            shouldAck = true;
          }
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
      
      // DISABLED: Sending RETURN STATUS as ACK causes the pump to send more status updates
      // creating a loop. The pump doesn't seem to require explicit acknowledgments.
      // The rapid status switching appears to be the pump's normal behavior when idle.
      // if (shouldAck) {
      //   setTimeout(() => {
      //     this.sendAcknowledgment(parsedFrame.address).catch(console.error);
      //   }, 100);
      // }
      
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

