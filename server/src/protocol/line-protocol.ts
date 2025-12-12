/**
 * DART Line Protocol (Level 2)
 * Handles frame construction, CRC calculation, and frame parsing
 */

import { PumpAddress, Frame, Transaction } from '../types/protocol';

// Frame delimiters
const ETX = 0x03; // End of text
const SF = 0xFA;  // Start/Stop flag

// Device address range: 50H-6FH (80-111 decimal)
export const MIN_PUMP_ADDRESS = 0x50;
export const MAX_PUMP_ADDRESS = 0x6F;

/**
 * Calculate CRC-16 for DART protocol
 * Based on standard CRC-16-CCITT (polynomial 0x1021)
 */
function calculateCRC16(data: number[]): { crc1: number; crc2: number } {
  let crc = 0xFFFF;
  
  for (const byte of data) {
    crc ^= (byte << 8);
    for (let i = 0; i < 8; i++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = (crc << 1);
      }
      crc &= 0xFFFF;
    }
  }
  
  // Return as two bytes (MSB first)
  return {
    crc1: (crc >> 8) & 0xFF,
    crc2: crc & 0xFF
  };
}

/**
 * Build a complete frame with line protocol
 * Format: ADR CTRL TRANS LNG DATA... CRC-1 CRC-2 ETX SF
 */
export function buildFrame(
  address: PumpAddress,
  control: number,
  transactions: Transaction[]
): number[] {
  // Validate address
  if (address < MIN_PUMP_ADDRESS || address > MAX_PUMP_ADDRESS) {
    throw new Error(`Invalid pump address: ${address.toString(16)}. Must be between 0x50-0x6F`);
  }

  // Build frame data (ADR + CTRL + all transactions)
  const frameData: number[] = [address, control];
  
  // Add all transactions
  for (const trans of transactions) {
    frameData.push(trans.trans); // Transaction number
    frameData.push(trans.lng);    // Length
    frameData.push(...trans.data); // Transaction data
  }

  // Calculate CRC over ADR + CTRL + transactions (before ETX/SF)
  const { crc1, crc2 } = calculateCRC16(frameData);

  // Complete frame: ADR CTRL TRANS LNG DATA... CRC-1 CRC-2 ETX SF
  return [...frameData, crc1, crc2, ETX, SF];
}

/**
 * Extract complete frames from byte stream
 * Looks for frame delimiters: ... CRC-1 CRC-2 0x03 0xFA
 */
export function extractFrames(byteStream: number[]): number[][] {
  const frames: number[][] = [];
  let current: number[] = [];
  let i = 0;

  while (i < byteStream.length) {
    // Skip USC+ wrapper blocks: 50 XX FA or 51 XX FA
    if (i + 2 < byteStream.length && 
        byteStream[i + 2] === SF && 
        (byteStream[i] === 0x50 || byteStream[i] === 0x51)) {
      i += 3;
      continue;
    }

    current.push(byteStream[i]);

    // Check for end-of-frame marker (ETX + SF)
    if (current.length >= 2 && 
        current[current.length - 2] === ETX && 
        current[current.length - 1] === SF) {
      frames.push([...current]);
      current = [];
    }

    i++;
  }

  return frames;
}

/**
 * Parse a complete frame into structured format
 * Format: ADR CTRL TRANS LNG DATA... CRC-1 CRC-2 ETX SF
 */
export function parseFrame(frame: number[]): Frame | null {
  // Minimum frame: ADR CTRL TRANS LNG CRC-1 CRC-2 ETX SF (8 bytes)
  if (frame.length < 8) {
    return null;
  }

  // Check frame delimiters
  if (frame[frame.length - 2] !== ETX || frame[frame.length - 1] !== SF) {
    return null;
  }

  const address = frame[0] as PumpAddress;
  const control = frame[1];
  
  // Validate address
  if (address < MIN_PUMP_ADDRESS || address > MAX_PUMP_ADDRESS) {
    return null;
  }

  // Extract transactions (skip ADR, CTRL, and trailing CRC-1, CRC-2, ETX, SF)
  // According to DART spec: ADR CTRL TRANS LNG DATA... CRC-1 CRC-2 ETX SF
  const transactions: Transaction[] = [];
  let pos = 2; // Start after ADR and CTRL

  while (pos < frame.length - 4) { // Stop before CRC-1, CRC-2, ETX, SF
    if (pos + 1 >= frame.length - 4) {
      break; // Not enough bytes for TRANS and LNG
    }

    const trans = frame[pos];
    const lng = frame[pos + 1];
    
    // Validate length is reasonable (0-255)
    if (lng < 0 || lng > 255) {
      // Invalid length - this might not be a valid protocol frame
      // Log for debugging
      console.log('Invalid transaction length:', lng, 'at position:', pos, 'in frame');
      break;
    }
    
    // Check if we have enough bytes for the data
    if (pos + 2 + lng > frame.length - 4) {
      // Not enough data - incomplete frame
      console.log('Incomplete transaction: need', lng, 'bytes but only have', frame.length - 4 - pos - 2);
      break;
    }

    const data = frame.slice(pos + 2, pos + 2 + lng);
    transactions.push({ trans, lng, data });
    
    pos += 2 + lng; // Move to next transaction
  }
  
  // Debug: Log if we couldn't parse any transactions
  if (transactions.length === 0 && frame.length >= 8) {
    console.log('No transactions parsed from frame. Raw data:', 
                frame.slice(2, frame.length - 4).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '));
  }

  // Extract CRC (but don't validate - matching Python decoder behavior)
  const crc1 = frame[frame.length - 4];
  const crc2 = frame[frame.length - 3];

  // Note: CRC validation is skipped for incoming frames.
  // The Python decoder doesn't validate CRC, and many DART implementations
  // use different CRC algorithms or frame formats. We process frames regardless.

  return {
    address,
    control,
    transactions,
    crc1,
    crc2,
    etx: ETX,
    sf: SF
  };
}

/**
 * Validate frame CRC
 */
export function validateFrameCRC(frame: number[]): boolean {
  if (frame.length < 8) {
    return false;
  }

  const frameData = frame.slice(0, frame.length - 4); // Exclude CRC and delimiters
  const calculatedCRC = calculateCRC16(frameData);
  const receivedCRC1 = frame[frame.length - 4];
  const receivedCRC2 = frame[frame.length - 3];

  return calculatedCRC.crc1 === receivedCRC1 && calculatedCRC.crc2 === receivedCRC2;
}

/**
 * Create a transaction structure
 */
export function createTransaction(trans: number, data: number[]): Transaction {
  return {
    trans,
    lng: data.length,
    data
  };
}

