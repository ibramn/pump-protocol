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
 * Where PP is pump address (0x50-0x6F), CC is command, XX is status byte
 */
export function isStatusFrame(frame: number[]): boolean {
  if (frame.length !== 9) {
    return false;
  }
  // Check pattern: bytes 2-3 should be 0x01 0x01, last two should be 0x03 0xFA
  // Also verify pump address is in valid range
  const address = frame[0];
  return address >= 0x50 && address <= 0x6F &&
         frame[2] === 0x01 && frame[3] === 0x01 && 
         frame[frame.length - 2] === 0x03 && 
         frame[frame.length - 1] === 0xFA;
}

/**
 * Decode status frame
 * Format: PP CC 01 01 STATUS CRC 03 FA
 * 
 * According to DART spec:
 * - ADR (PP) = Pump address
 * - CTRL (CC) = Control byte
 * - TRANS = 0x01 (DC1)
 * - LNG = 0x01 (1 byte of data)
 * - DATA = STATUS byte (0-8)
 * - CRC-1, CRC-2 = CRC checksum
 * - ETX = 0x03, SF = 0xFA
 */
export function decodeStatusFrame(frame: number[]): ResponseTransactionData | null {
  if (!isStatusFrame(frame)) {
    return null;
  }
  
  // Verify frame structure matches DART spec exactly
  // Position 0: ADR (pump address)
  // Position 1: CTRL (control)
  // Position 2: TRANS = 0x01 (DC1)
  // Position 3: LNG = 0x01 (1 byte)
  // Position 4: STATUS byte
  // Position 5-6: CRC
  // Position 7-8: ETX (0x03), SF (0xFA)
  
  if (frame[2] !== 0x01 || frame[3] !== 0x01) {
    // Doesn't match DC1 transaction pattern
    return null;
  }
  
  // Status byte is at position 4 (after PP, CC, 01, 01)
  const statusByte = frame[4];
  
  // Validate status byte is in expected range (0-8 per DART spec)
  // 0 = PUMP NOT PROGRAMMED
  // 1 = RESET
  // 2 = AUTHORIZED
  // 4 = FILLING
  // 5 = FILLING COMPLETED
  // 6 = MAX AMOUNT/VOLUME REACHED
  // 7 = SWITCHED OFF
  // 8 = SUSPENDED
  if (statusByte > 8) {
    // Invalid status, might not be a status frame
    console.log('Invalid status byte:', statusByte, 'in frame:', 
                frame.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '));
    return null;
  }
  
  const status = statusByte as PumpStatus;
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
 * Check if frame is a heartbeat/keepalive (should be skipped)
 * Common patterns:
 * - 50 20 FA (3 bytes) - line idle/keepalive
 * - 50 70 FA (3 bytes) - line idle/keepalive
 * - 50 C1-CF FA (3 bytes) - control sequence keepalive
 */
export function isHeartbeatFrame(frame: number[]): boolean {
  // Check for 3-byte heartbeat patterns: 50 XX FA
  if (frame.length === 3) {
    if (frame[0] === 0x50 && frame[2] === 0xFA) {
      const middleByte = frame[1];
      // Common heartbeat bytes: 0x20, 0x70, or 0xC1-0xCF (control sequence)
      if (middleByte === 0x20 || middleByte === 0x70 || 
          (middleByte >= 0xC1 && middleByte <= 0xCF)) {
        return true;
      }
    }
  }
  
  if (frame.length < 6) {
    return true; // Too short to be a valid DART frame
  }
  const body = frame.slice(0, -2); // Exclude ETX and SF
  return body.every(x => [0x50, 0x51, 0x20, 0x70, 0xFA].includes(x));
}

/**
 * Try to decode frame using pattern matching (like Python decoder)
 * Returns array of decoded transactions (frames can contain multiple transactions)
 * 
 * IMPORTANT: Only use pattern matching for simple single-transaction frames.
 * For frames that might contain multiple transactions, return empty array
 * and let the protocol parser handle it.
 */
export function tryDecodeFrameByPattern(frame: number[]): ResponseTransactionData[] {
  // Skip heartbeat frames
  if (isHeartbeatFrame(frame)) {
    return [];
  }
  
  const results: ResponseTransactionData[] = [];
  
  // ONLY use pattern matching for frames that are definitely single-transaction:
  // - 9-byte status frames (ADR CTRL 01 01 STATUS CRC CRC 03 FA)
  if (frame.length === 9 && isStatusFrame(frame)) {
    const decoded = decodeStatusFrame(frame);
    if (decoded) {
      results.push(decoded);
    }
    return results;
  }
  
  // For all other frames (including 15-byte frames that might have multiple transactions),
  // return empty array and let protocol-based parsing handle it
  // This prevents double-decoding of frames with multiple transactions
  
  return [];
}

