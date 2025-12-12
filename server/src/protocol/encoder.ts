/**
 * DART Protocol Transaction Encoder
 * Converts high-level commands to CD transactions with proper BCD encoding
 */

import {
  CommandTransaction,
  PumpCommand,
  CommandTransactionData,
  AllowedNozzleNumbers,
  PresetVolume,
  PresetAmount,
  PriceUpdate,
  CommandToOutput,
  SetPumpParameters,
  SetFillingType,
  SuspendRequest,
  ResumeRequest,
  RequestTotalCounters,
  OutputFunction,
  OutputCommand,
  FillingType
} from '../types/protocol';
import { Transaction, createTransaction } from './line-protocol';

/**
 * Encode a number to packed BCD
 * @param value The decimal number to encode
 * @param bytes Number of bytes for the BCD encoding
 * @returns Array of bytes in packed BCD format (MSB first)
 */
export function encodeBCD(value: number, bytes: number): number[] {
  // Convert to string with leading zeros
  const str = Math.floor(value).toString().padStart(bytes * 2, '0');
  
  // Split into pairs of digits and convert to bytes
  const result: number[] = [];
  for (let i = 0; i < bytes; i++) {
    const high = parseInt(str[i * 2] || '0', 10);
    const low = parseInt(str[i * 2 + 1] || '0', 10);
    result.push((high << 4) | low);
  }
  
  return result;
}

/**
 * Encode price to 3-byte packed BCD
 * Price format: up to 6 digits (e.g., 2.18 = 000218)
 */
export function encodePrice(price: number): number[] {
  // Convert price to integer (e.g., 2.18 -> 21800 for 2.1800)
  // Assuming 4 decimal places: 2.18 = 21800
  const priceInt = Math.round(price * 10000);
  return encodeBCD(priceInt, 3);
}

/**
 * Encode volume/amount to 4-byte packed BCD
 */
export function encodeVolumeOrAmount(value: number): number[] {
  // Convert to integer (assuming appropriate decimal places)
  // For example, 100.50 liters = 10050 (2 decimal places)
  const valueInt = Math.round(value * 100);
  return encodeBCD(valueInt, 4);
}

/**
 * Encode command transaction data to transaction bytes
 */
export function encodeCommandTransaction(data: CommandTransactionData): Transaction {
  switch (data.type) {
    case CommandTransaction.CD1_COMMAND:
      return createTransaction(
        CommandTransaction.CD1_COMMAND,
        [data.data.command]
      );

    case CommandTransaction.CD2_ALLOWED_NOZZLE_NUMBERS:
      if (data.data.nozzles.length === 0) {
        throw new Error('At least one nozzle number must be specified');
      }
      if (data.data.nozzles.some(n => n < 1 || n > 0x0F)) {
        throw new Error('Nozzle numbers must be between 1 and 15 (0x0F)');
      }
      return createTransaction(
        CommandTransaction.CD2_ALLOWED_NOZZLE_NUMBERS,
        data.data.nozzles
      );

    case CommandTransaction.CD3_PRESET_VOLUME:
      return createTransaction(
        CommandTransaction.CD3_PRESET_VOLUME,
        encodeVolumeOrAmount(data.data.volume)
      );

    case CommandTransaction.CD4_PRESET_AMOUNT:
      return createTransaction(
        CommandTransaction.CD4_PRESET_AMOUNT,
        encodeVolumeOrAmount(data.data.amount)
      );

    case CommandTransaction.CD5_PRICE_UPDATE:
      if (data.data.prices.length === 0) {
        throw new Error('At least one price must be specified');
      }
      const priceBytes: number[] = [];
      for (const price of data.data.prices) {
        priceBytes.push(...encodePrice(price));
      }
      return createTransaction(
        CommandTransaction.CD5_PRICE_UPDATE,
        priceBytes
      );

    case CommandTransaction.CD7_COMMAND_TO_OUTPUT:
      return createTransaction(
        CommandTransaction.CD7_COMMAND_TO_OUTPUT,
        [data.data.outputFunction, data.data.command]
      );

    case CommandTransaction.CD9_SET_PUMP_PARAMETERS:
      const params = data.data;
      const paramBytes: number[] = [];
      
      // RES (22 bytes)
      paramBytes.push(...new Array(22).fill(0));
      
      if (params.dpVol !== undefined) {
        paramBytes.push(params.dpVol & 0xFF);
      } else {
        paramBytes.push(0);
      }
      if (params.dpAmo !== undefined) {
        paramBytes.push(params.dpAmo & 0xFF);
      } else {
        paramBytes.push(0);
      }
      if (params.dpUnp !== undefined) {
        paramBytes.push(params.dpUnp & 0xFF);
      } else {
        paramBytes.push(0);
      }
      
      // RES (5 bytes)
      paramBytes.push(...new Array(5).fill(0));
      
      if (params.maxAmount !== undefined) {
        paramBytes.push(...encodeVolumeOrAmount(params.maxAmount));
      } else {
        paramBytes.push(...new Array(4).fill(0));
      }
      
      // RES (17 bytes)
      paramBytes.push(...new Array(17).fill(0));
      
      return createTransaction(
        CommandTransaction.CD9_SET_PUMP_PARAMETERS,
        paramBytes
      );

    case CommandTransaction.CD13_FILLING_TYPE:
      return createTransaction(
        CommandTransaction.CD13_FILLING_TYPE,
        [data.data.fillingType]
      );

    case CommandTransaction.CD14_SUSPEND_REQUEST:
      if (data.data.nozzle < 0 || data.data.nozzle > 0x0F) {
        throw new Error('Nozzle number must be between 0 and 15 (0x0F)');
      }
      return createTransaction(
        CommandTransaction.CD14_SUSPEND_REQUEST,
        [data.data.nozzle]
      );

    case CommandTransaction.CD15_RESUME_REQUEST:
      if (data.data.nozzle < 0 || data.data.nozzle > 0x0F) {
        throw new Error('Nozzle number must be between 0 and 15 (0x0F)');
      }
      return createTransaction(
        CommandTransaction.CD15_RESUME_REQUEST,
        [data.data.nozzle]
      );

    case CommandTransaction.CD101_REQUEST_TOTAL_COUNTERS:
      if (data.data.counter < 0x01 || 
          (data.data.counter > 0x09 && data.data.counter < 0x11) || 
          data.data.counter > 0x19) {
        throw new Error('Counter number must be 01H-09H or 11H-19H');
      }
      return createTransaction(
        CommandTransaction.CD101_REQUEST_TOTAL_COUNTERS,
        [data.data.counter]
      );

    default:
      throw new Error(`Unsupported command transaction type: ${data.type}`);
  }
}

/**
 * Helper functions to create command transaction data
 */
export const CommandEncoders = {
  commandToPump: (command: PumpCommand): CommandTransactionData => ({
    type: CommandTransaction.CD1_COMMAND,
    data: { command }
  }),

  allowedNozzleNumbers: (nozzles: number[]): CommandTransactionData => ({
    type: CommandTransaction.CD2_ALLOWED_NOZZLE_NUMBERS,
    data: { nozzles }
  }),

  presetVolume: (volume: number): CommandTransactionData => ({
    type: CommandTransaction.CD3_PRESET_VOLUME,
    data: { volume }
  }),

  presetAmount: (amount: number): CommandTransactionData => ({
    type: CommandTransaction.CD4_PRESET_AMOUNT,
    data: { amount }
  }),

  priceUpdate: (prices: number[]): CommandTransactionData => ({
    type: CommandTransaction.CD5_PRICE_UPDATE,
    data: { prices }
  }),

  commandToOutput: (outputFunction: OutputFunction, command: OutputCommand): CommandTransactionData => ({
    type: CommandTransaction.CD7_COMMAND_TO_OUTPUT,
    data: { outputFunction, command }
  }),

  setPumpParameters: (params: SetPumpParameters): CommandTransactionData => ({
    type: CommandTransaction.CD9_SET_PUMP_PARAMETERS,
    data: params
  }),

  setFillingType: (fillingType: FillingType): CommandTransactionData => ({
    type: CommandTransaction.CD13_FILLING_TYPE,
    data: { fillingType }
  }),

  suspendRequest: (nozzle: number): CommandTransactionData => ({
    type: CommandTransaction.CD14_SUSPEND_REQUEST,
    data: { nozzle }
  }),

  resumeRequest: (nozzle: number): CommandTransactionData => ({
    type: CommandTransaction.CD15_RESUME_REQUEST,
    data: { nozzle }
  }),

  requestTotalCounters: (counter: number): CommandTransactionData => ({
    type: CommandTransaction.CD101_REQUEST_TOTAL_COUNTERS,
    data: { counter }
  })
};

