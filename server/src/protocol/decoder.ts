/**
 * DART Protocol Transaction Decoder
 * Parses DC transactions from pump responses
 */

import {
  ResponseTransaction,
  ResponseTransactionData,
  PumpStatus,
  AlarmCode,
  IFSFMode
} from '../types/protocol';
import { Transaction } from './line-protocol';

/**
 * Decode packed BCD to number
 * @param bytes Array of bytes in packed BCD format (MSB first)
 * @returns Decoded decimal number
 */
export function decodeBCD(bytes: number[]): number {
  let result = 0;
  for (const byte of bytes) {
    const high = (byte >> 4) & 0xF;
    const low = byte & 0xF;
    
    if (high > 9 || low > 9) {
      // Invalid BCD
      return 0;
    }
    
    result = result * 100 + high * 10 + low;
  }
  return result;
}

/**
 * Decode 3-byte BCD price
 */
export function decodePrice(bytes: number[]): number {
  if (bytes.length !== 3) {
    return 0;
  }
  const value = decodeBCD(bytes);
  // Price is stored as integer with 4 decimal places (e.g., 21800 = 2.1800)
  return value / 10000;
}

/**
 * Decode 4-byte BCD volume/amount
 */
export function decodeVolumeOrAmount(bytes: number[]): number {
  if (bytes.length !== 4) {
    return 0;
  }
  const value = decodeBCD(bytes);
  // Assuming 2 decimal places (e.g., 10050 = 100.50)
  return value / 100;
}

/**
 * Decode 5-byte BCD value
 */
export function decode5ByteBCD(bytes: number[]): number {
  if (bytes.length !== 5) {
    return 0;
  }
  return decodeBCD(bytes);
}

/**
 * Decode pump identity (5 bytes BCD = 10 digits)
 */
export function decodePumpIdentity(bytes: number[]): string {
  if (bytes.length !== 5) {
    return '';
  }
  const value = decodeBCD(bytes);
  return value.toString().padStart(10, '0');
}

/**
 * Decode response transaction
 */
export function decodeResponseTransaction(transaction: Transaction): ResponseTransactionData | null {
  const { trans, data } = transaction;

  switch (trans) {
    case ResponseTransaction.DC1_PUMP_STATUS:
      if (data.length < 1) return null;
      return {
        type: ResponseTransaction.DC1_PUMP_STATUS,
        data: {
          status: data[0] as PumpStatus
        }
      };

    case ResponseTransaction.DC2_FILLED_VOLUME_AMOUNT:
      if (data.length < 8) return null;
      return {
        type: ResponseTransaction.DC2_FILLED_VOLUME_AMOUNT,
        data: {
          volume: decodeVolumeOrAmount(data.slice(0, 4)),
          amount: decodeVolumeOrAmount(data.slice(4, 8))
        }
      };

    case ResponseTransaction.DC3_NOZZLE_STATUS_FILLING_PRICE:
      if (data.length < 4) return null;
      const price = decodePrice(data.slice(0, 3));
      const nozio = data[3];
      const nozzle = nozio & 0x0F;
      const nozzleOut = (nozio & 0x10) !== 0;
      
      return {
        type: ResponseTransaction.DC3_NOZZLE_STATUS_FILLING_PRICE,
        data: {
          price,
          nozzle,
          nozzleOut
        }
      };

    case ResponseTransaction.DC5_ALARM_CODE:
      if (data.length < 1) return null;
      return {
        type: ResponseTransaction.DC5_ALARM_CODE,
        data: {
          alarmCode: data[0] as AlarmCode
        }
      };

    case ResponseTransaction.DC7_PUMP_PARAMETERS:
      if (data.length < 50) return null; // Minimum expected length
      return {
        type: ResponseTransaction.DC7_PUMP_PARAMETERS,
        data: {
          dpVol: data[22] || 0,
          dpAmo: data[23] || 0,
          dpUnp: data[24] || 0,
          maxAmount: decodeVolumeOrAmount(data.slice(29, 33)),
          grades: Array.from(data.slice(35, 50))
        }
      };

    case ResponseTransaction.DC9_PUMP_IDENTITY:
      if (data.length < 5) return null;
      return {
        type: ResponseTransaction.DC9_PUMP_IDENTITY,
        data: {
          identity: decodePumpIdentity(data.slice(0, 5))
        }
      };

    case ResponseTransaction.DC14_SUSPEND_REPLY:
      if (data.length < 1) return null;
      return {
        type: ResponseTransaction.DC14_SUSPEND_REPLY,
        data: {
          nozzle: data[0]
        }
      };

    case ResponseTransaction.DC15_RESUME_REPLY:
      if (data.length < 1) return null;
      return {
        type: ResponseTransaction.DC15_RESUME_REPLY,
        data: {
          nozzle: data[0]
        }
      };

    case ResponseTransaction.DC101_TOTAL_COUNTERS:
      if (data.length < 11) return null;
      return {
        type: ResponseTransaction.DC101_TOTAL_COUNTERS,
        data: {
          counter: data[0],
          totVal: decode5ByteBCD(data.slice(1, 6)),
          totM1OrNoFill: decode5ByteBCD(data.slice(6, 11)),
          totM2: data.length >= 16 ? decode5ByteBCD(data.slice(11, 16)) : 0
        }
      };

    case ResponseTransaction.DC102_IFSF_STAND_ALONE_MODE:
      if (data.length < 2) return null;
      return {
        type: ResponseTransaction.DC102_IFSF_STAND_ALONE_MODE,
        data: {
          mode: data[0] as IFSFMode,
          localAuthorise: data[1] !== 0
        }
      };

    case ResponseTransaction.DC103_PUMP_UNIT_PRICES:
      if (data.length < 3 || data.length % 3 !== 0) return null;
      const prices: number[] = [];
      for (let i = 0; i < data.length; i += 3) {
        prices.push(decodePrice(data.slice(i, i + 3)));
      }
      return {
        type: ResponseTransaction.DC103_PUMP_UNIT_PRICES,
        data: { prices }
      };

    default:
      // Unknown transaction type
      return null;
  }
}

