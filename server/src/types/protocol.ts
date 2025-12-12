/**
 * DART Pump Protocol Type Definitions
 * Based on Protocol Specification Dart Pump Interface Revision 2.11
 */

// Device addresses: 50H-6FH (80-111 decimal, supports up to 32 pumps)
export type PumpAddress = number; // 0x50-0x6F

// Pump Status Codes (DC1)
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

// Command Codes (CD1 - DCC byte)
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

// Transaction Types - Commands to Pump (CD)
export enum CommandTransaction {
  CD1_COMMAND = 0x01,
  CD2_ALLOWED_NOZZLE_NUMBERS = 0x02,
  CD3_PRESET_VOLUME = 0x03,
  CD4_PRESET_AMOUNT = 0x04,
  CD5_PRICE_UPDATE = 0x05,
  CD7_COMMAND_TO_OUTPUT = 0x07,
  CD8_REQUEST_TOTAL_COUNTERS = 0x08, // Same as CD101
  CD9_SET_PUMP_PARAMETERS = 0x09,
  CD13_FILLING_TYPE = 0x0D,
  CD14_SUSPEND_REQUEST = 0x0E,
  CD15_RESUME_REQUEST = 0x0F,
  CD101_REQUEST_TOTAL_COUNTERS = 0x65
}

// Transaction Types - Responses from Pump (DC)
export enum ResponseTransaction {
  DC1_PUMP_STATUS = 0x01,
  DC2_FILLED_VOLUME_AMOUNT = 0x02,
  DC3_NOZZLE_STATUS_FILLING_PRICE = 0x03,
  DC5_ALARM_CODE = 0x05,
  DC7_PUMP_PARAMETERS = 0x07,
  DC9_PUMP_IDENTITY = 0x09,
  DC14_SUSPEND_REPLY = 0x0E,
  DC15_RESUME_REPLY = 0x0F,
  DC101_TOTAL_COUNTERS = 0x65,
  DC102_IFSF_STAND_ALONE_MODE = 0x66,
  DC103_PUMP_UNIT_PRICES = 0x67
}

// Alarm Codes (DC5)
export enum AlarmCode {
  CPU_RESET = 0x01,
  RAM_ERROR = 0x03,
  PROM_CHECKSUM_ERROR = 0x04,
  PULSER_ERROR = 0x06,
  PULSER_CURRENT_ERROR = 0x07,
  EMERGENCY_STOP = 0x09,
  POWER_FAILURE = 0x0A,
  PRESSURE_LOST = 0x0B,
  BLEND_RATIO_ERROR = 0x0C,
  LOW_LEAK_ERROR = 0x0D,
  HIGH_LEAK_ERROR = 0x0E,
  HOSE_LEAK_ERROR = 0x0F,
  VR_MONITOR_ERROR_RESET = 0x10,
  VR_MONITOR_10_CONSECUTIVE_ERRORS = 0x11,
  VR_MONITOR_SHUT_DOWN_PUMP = 0x12,
  VR_MONITOR_INTERNAL_ERROR = 0x13,
  VR_CONTROL_ERROR = 0x19,
  VR_CONTROL_ERROR_CONSECUTIVE = 0x20
}

// Output Functions (CD7)
export enum OutputFunction {
  MASTER_RED_GREEN = 0x0A,
  MASTER_SB_BT = 0x0B,
  BACK_LIGHT_CONTROL = 0x0C,
  SPEAK_TO_PUMP = 0x0D,
  HOSE_LEAK_TEST = 0x0E
}

// Output Commands (CD7)
export enum OutputCommand {
  SWITCH_OFF = 0x00,
  SWITCH_ON = 0x01
}

// Filling Type (CD13)
export enum FillingType {
  CASH_FILLING = 0,
  CREDIT_FILLING = 1
}

// IFSF Stand Alone Mode (DC102)
export enum IFSFMode {
  STAND_ALONE_DISABLED = 0x00,
  STAND_ALONE_ENABLED = 0x01
}

// Command Data Structures

export interface CommandToPump {
  command: PumpCommand;
}

export interface AllowedNozzleNumbers {
  nozzles: number[]; // 1-0x0F (1-15)
}

export interface PresetVolume {
  volume: number; // Packed BCD, 4 bytes
}

export interface PresetAmount {
  amount: number; // Packed BCD, 4 bytes
}

export interface PriceUpdate {
  prices: number[]; // Packed BCD, 3 bytes each, PRI1 for nozzle 1, PRI2 for nozzle 2, etc.
}

export interface CommandToOutput {
  outputFunction: OutputFunction;
  command: OutputCommand;
}

export interface SetPumpParameters {
  dpVol?: number; // Number of decimals in volume (0-8)
  dpAmo?: number; // Number of decimals in amount (0-8)
  dpUnp?: number; // Number of decimals in unit price (0-4)
  maxAmount?: number; // Maximum amount (packed BCD, 4 bytes)
}

export interface SetFillingType {
  fillingType: FillingType;
}

export interface SuspendRequest {
  nozzle: number; // 0-0x0F, normally 0
}

export interface ResumeRequest {
  nozzle: number; // 0-0x0F, normally 0
}

export interface RequestTotalCounters {
  counter: number; // 01H-09H, 11H-19H
}

// Response Data Structures

export interface PumpStatusResponse {
  status: PumpStatus;
}

export interface FilledVolumeAmount {
  volume: number; // Packed BCD, 4 bytes
  amount: number; // Packed BCD, 4 bytes
}

export interface NozzleStatusFillingPrice {
  price: number; // Packed BCD, 3 bytes
  nozzle: number; // Bits 0-3: selected nozzle number
  nozzleOut: boolean; // Bit 4: 0 = in, 1 = out
}

export interface AlarmCodeResponse {
  alarmCode: AlarmCode;
}

export interface PumpParametersResponse {
  dpVol: number; // Number of decimals in volume (0-8)
  dpAmo: number; // Number of decimals in amount (0-8)
  dpUnp: number; // Number of decimals in unit price (0-4)
  maxAmount: number; // Maximum amount (packed BCD, 4 bytes)
  grades: number[]; // Existing grade per nozzle number (15 bytes)
}

export interface PumpIdentity {
  identity: string; // 10 digits in packed BCD (5 bytes)
}

export interface SuspendReply {
  nozzle: number;
}

export interface ResumeReply {
  nozzle: number;
}

export interface TotalCounters {
  counter: number; // 01H-09H, 11H-19H
  totVal: number; // Packed BCD, 5 bytes
  totM1OrNoFill: number; // Packed BCD, 5 bytes
  totM2: number; // Packed BCD, 5 bytes (or 0)
}

export interface IFSFStandAloneMode {
  mode: IFSFMode;
  localAuthorise: boolean; // 00H = not pressed, 01H = pressed
}

export interface PumpUnitPrices {
  prices: number[]; // Packed BCD, 3 bytes each
}

// Complete Transaction Structures

export type CommandTransactionData =
  | { type: CommandTransaction.CD1_COMMAND; data: CommandToPump }
  | { type: CommandTransaction.CD2_ALLOWED_NOZZLE_NUMBERS; data: AllowedNozzleNumbers }
  | { type: CommandTransaction.CD3_PRESET_VOLUME; data: PresetVolume }
  | { type: CommandTransaction.CD4_PRESET_AMOUNT; data: PresetAmount }
  | { type: CommandTransaction.CD5_PRICE_UPDATE; data: PriceUpdate }
  | { type: CommandTransaction.CD7_COMMAND_TO_OUTPUT; data: CommandToOutput }
  | { type: CommandTransaction.CD9_SET_PUMP_PARAMETERS; data: SetPumpParameters }
  | { type: CommandTransaction.CD13_FILLING_TYPE; data: SetFillingType }
  | { type: CommandTransaction.CD14_SUSPEND_REQUEST; data: SuspendRequest }
  | { type: CommandTransaction.CD15_RESUME_REQUEST; data: ResumeRequest }
  | { type: CommandTransaction.CD101_REQUEST_TOTAL_COUNTERS; data: RequestTotalCounters };

export type ResponseTransactionData =
  | { type: ResponseTransaction.DC1_PUMP_STATUS; data: PumpStatusResponse }
  | { type: ResponseTransaction.DC2_FILLED_VOLUME_AMOUNT; data: FilledVolumeAmount }
  | { type: ResponseTransaction.DC3_NOZZLE_STATUS_FILLING_PRICE; data: NozzleStatusFillingPrice }
  | { type: ResponseTransaction.DC5_ALARM_CODE; data: AlarmCodeResponse }
  | { type: ResponseTransaction.DC7_PUMP_PARAMETERS; data: PumpParametersResponse }
  | { type: ResponseTransaction.DC9_PUMP_IDENTITY; data: PumpIdentity }
  | { type: ResponseTransaction.DC14_SUSPEND_REPLY; data: SuspendReply }
  | { type: ResponseTransaction.DC15_RESUME_REPLY; data: ResumeReply }
  | { type: ResponseTransaction.DC101_TOTAL_COUNTERS; data: TotalCounters }
  | { type: ResponseTransaction.DC102_IFSF_STAND_ALONE_MODE; data: IFSFStandAloneMode }
  | { type: ResponseTransaction.DC103_PUMP_UNIT_PRICES; data: PumpUnitPrices };

// Line Protocol Frame Structure
export interface Frame {
  address: PumpAddress; // ADR
  control: number; // CTRL
  transactions: Transaction[]; // One or more transactions
  crc1: number; // CRC-1
  crc2: number; // CRC-2
  etx: number; // ETX (0x03)
  sf: number; // SF (0xFA)
}

export interface Transaction {
  trans: number; // Transaction number
  lng: number; // Length of data
  data: number[]; // Transaction data
}

// Decoded Message
export interface DecodedMessage {
  address: PumpAddress;
  timestamp: Date;
  transaction: ResponseTransactionData;
  rawFrame: number[];
}

// Serial Configuration
export interface SerialConfig {
  port: string;
  baudRate: number;
  pumpAddress: PumpAddress;
}

