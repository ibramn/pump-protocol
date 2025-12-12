/**
 * Frame Pattern Matcher
 * Matches frames using pattern-based approach (like Python decoder)
 * instead of strict protocol parsing
 */

import { ResponseTransactionData, PumpStatus } from '../types/protocol';

/**
 * Decode packed BCD to number
 */
function decodeBCD(bytes: number[]): number {
  let result = 0;
  for (const byte of bytes) {
    const high = (byte >> 4) & 0xF;
    const low = byte & 0xF;
    
    if (high > 9 || low > 9) {
      return 0;
    }
    
    result = result * 100 + high * 10 + low;
  }
  return result;
}

/**
 * Check if frame matches status frame pattern: PP CC 01 01 XX CRC 03 FA
 */
export function isStatusFrame(frame: number[]): boolean {
  if (frame.length !== 9) {
    return false;
  }
  return frame[2] === 0x01 && frame[3] === 0x01 && 
         frame[frame.length - 2] === 0x03 && 
         frame[frame.length - 1] === 0xFA;
}

/**
 * Decode status frame
 */
export function decodeStatusFrame(frame: number[]): ResponseTransactionData | null {
  if (!isStatusFrame(frame)) {
    return null;
  }
  
  const status = frame[4] as PumpStatus;
  return {
    type: 1, // DC1_PUMP_STATUS
    data: { status }
  };
}

/**
 * Check if frame matches fueling frame pattern
 * Format: PP CC 02 08 00 00 MM MM MM LL LL LL CRC 03 FA (16 bytes)
 */
export function isFuelingFrame(frame: number[]): boolean {
  if (frame.length !== 16) {
    return false;
  }
  return frame[2] === 0x02 && frame[3] === 0x08 && 
         frame[4] === 0x00 && frame[5] === 0x00 &&
         frame[frame.length - 2] === 0x03 && 
         frame[frame.length - 1] === 0xFA;
}

/**
 * Decode fueling frame
 */
export function decodeFuelingFrame(frame: number[]): ResponseTransactionData | null {
  if (!isFuelingFrame(frame)) {
    return null;
  }
  
  // Bytes 6-8: Liters (3 bytes BCD)
  // Bytes 9-11: Money (3 bytes BCD)
  const litersRaw = decodeBCD(frame.slice(6, 9));
  const moneyRaw = decodeBCD(frame.slice(9, 12));
  
  // Apply scaling (from Python decoder)
  const liters = litersRaw / 10000;
  const money = moneyRaw / 1000;
  
  return {
    type: 2, // DC2_FILLED_VOLUME_AMOUNT
    data: {
      volume: liters,
      amount: money
    }
  };
}

/**
 * Check if frame matches extended fueling frame (22 bytes)
 */
export function isFuelingWithExtraFrame(frame: number[]): boolean {
  if (frame.length !== 22) {
    return false;
  }
  return frame[2] === 0x02 && frame[3] === 0x08 && 
         frame[4] === 0x00 && frame[5] === 0x00 &&
         frame[frame.length - 2] === 0x03 && 
         frame[frame.length - 1] === 0xFA;
}

/**
 * Decode extended fueling frame
 */
export function decodeFuelingWithExtraFrame(frame: number[]): ResponseTransactionData | null {
  if (!isFuelingWithExtraFrame(frame)) {
    return null;
  }
  
  // First 16 bytes are the same as regular fueling frame
  const fuelingPart = frame.slice(0, 16);
  const decoded = decodeFuelingFrame(fuelingPart);
  
  if (decoded && decoded.type === 2) {
    return decoded; // Return the same structure
  }
  
  return null;
}

/**
 * Try to decode frame using pattern matching (like Python decoder)
 */
export function tryDecodeFrameByPattern(frame: number[]): ResponseTransactionData | null {
  // Try different frame patterns in order of likelihood
  
  if (isFuelingWithExtraFrame(frame)) {
    return decodeFuelingWithExtraFrame(frame);
  }
  
  if (isFuelingFrame(frame)) {
    return decodeFuelingFrame(frame);
  }
  
  if (isStatusFrame(frame)) {
    return decodeStatusFrame(frame);
  }
  
  // Could add more patterns here (price table, single price, etc.)
  
  return null;
}

