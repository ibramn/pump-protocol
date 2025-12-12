# DART Protocol Sniffer

This script logs all serial communication (incoming and outgoing) to help analyze the DART protocol and compare with working implementations.

## Usage

```bash
# Basic usage (defaults to /dev/ttyUSB0 at 9600 baud)
npm run sniffer

# Specify port and baud rate
npm run sniffer -- /dev/ttyUSB0 9600

# Log to file
npm run sniffer -- /dev/ttyUSB0 9600 output.log
```

## What It Logs

- **Incoming frames** (from pump): All data received from the pump
- **Outgoing frames** (to pump): All data sent to the pump
- **Frame analysis**: Address, control byte, transaction types, validity
- **Status decoding**: Attempts to decode pump status messages
- **Command decoding**: Attempts to decode command messages

## Output Format

Each frame is logged with:
- Timestamp
- Direction (INCOMING/OUTGOING)
- Frame length
- Hex dump
- Frame analysis (address, control, transactions)
- Decoded information (status/command names)

## Example Output

```
[2024-01-01T12:00:00.000Z] >>> INCOMING (FROM PUMP)
    Length: 9 bytes
    Hex: 50 36 01 01 00 9F D4 03 FA
    Analysis: ADR:0x50 CTRL:0x36 [VALID DART FRAME] Transactions: CD1/DC1(LNG:1)
    Status: 0 (NOT_PROGRAMMED)

[2024-01-01T12:00:01.000Z] <<< OUTGOING (TO PUMP)
    Length: 9 bytes
    Hex: 50 00 01 01 05 50 9A 03 FA
    Analysis: ADR:0x50 CTRL:0x00 [VALID DART FRAME] Transactions: CD1/DC1(LNG:1)
    Command: RESET
```

## Wiring for Sniffing

To sniff communication between a working controller and the pump:

1. **Option 1: USB-to-RS485 adapter in parallel**
   - Connect the sniffer's USB-to-RS485 adapter in parallel with the working controller
   - Both devices share the same RS485 bus (A/B lines)
   - The sniffer will see all traffic

2. **Option 2: Use a RS485 splitter/hub**
   - Connect pump, controller, and sniffer to a RS485 hub
   - All devices see all traffic

3. **Option 3: Loopback test**
   - Connect the sniffer directly to the pump
   - Send commands and see responses

## Notes

- The sniffer runs in read-only mode by default (it doesn't send commands)
- To capture outgoing commands, you need to intercept the serial port writes (the script does this)
- Make sure the baud rate matches your pump configuration
- Frame boundaries are detected by ETX (0x03) + SF (0xFA) markers

## Troubleshooting

- **No data received**: Check port name, baud rate, and wiring
- **Garbled data**: Verify baud rate matches pump configuration
- **Missing frames**: Check RS485 termination and signal quality

