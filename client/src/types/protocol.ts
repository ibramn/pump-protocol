/**
 * Shared Type Definitions for Frontend
 * These should match the server types
 */

export enum PumpStatus {
  PUMP_NOT_PROGRAMMED = 0,
  RESET = 1,
  AUTHORIZED = 2,
  FILLING = 4,
  FILLING_COMPLETED = 5,
  MAX_AMOUNT_VOLUME_REACHED = 6,
  SWITCHED_OFF = 7,
  SUSPENDED = 8
}

export enum PumpCommand {
  RETURN_STATUS = 0x00,
  RETURN_PUMP_PARAMETERS = 0x02,
  RETURN_PUMP_IDENTITY = 0x03,
  RETURN_FILLING_INFORMATION = 0x04,
  RESET = 0x05,
  AUTHORIZE = 0x06,
  STOP = 0x08,
  SWITCH_OFF = 0x0A,
  SUSPEND_FUELLING_POINT = 0x0D,
  RESUME_FUELLING_POINT = 0x0E,
  RETURN_PRICES_OF_ALL_CURRENT_GRADES = 0x0F
}

export interface PumpStatusResponse {
  status: PumpStatus;
}

export interface FilledVolumeAmount {
  volume: number;
  amount: number;
}

export interface NozzleStatusFillingPrice {
  price: number;
  nozzle: number;
  nozzleOut: boolean;
}

export interface PumpIdentity {
  identity: string;
}

export interface SerialConfig {
  port: string;
  baudRate: number;
  pumpAddress: number;
}

export interface TransactionLogEntry {
  id: string;
  timestamp: Date;
  direction: 'sent' | 'received';
  transactionType: string;
  data: any;
  rawHex: string;
}

export interface PumpState {
  address: number;
  status: PumpStatus;
  volume?: number;
  amount?: number;
  nozzle?: number;
  nozzleOut?: boolean;
  price?: number;
  identity?: string;
  lastUpdate: Date;
}

