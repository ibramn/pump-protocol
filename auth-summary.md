# Authorization Sequence Analysis

## Key Finding: Control Byte for AUTHORIZE

**Working AUTHORIZE command:**
```
50 37 01 01 06 1E 2A 03 FA
```

- Address: 0x50
- **Control: 0x37** (NOT 0x3C!)
- Transaction: CD1 (0x01)
- Length: 1 byte
- Command: 0x06 (AUTHORIZE)
- CRC: 0x1E 0x2A
- ETX/SF: 0x03 0xFA

## Authorization Sequence

1. **6:29:12 PM** - AUTHORIZE command sent:
   - Frame: `50 37 01 01 06 1E 2A 03 FA`
   - Control: **0x37**
   - Command: 0x06 (AUTHORIZE)

2. **6:29:12 PM** - Pump responds with Status 2 (AUTHORIZED):
   - Frame: `50 36 01 01 02 03 04 00 21 80 11 0E 48 03 FA`
   - Status: 2 (AUTHORIZED)
   - Includes DC3 with price and nozzle info

3. **6:29:25 PM** - Pump sends DC101 AUTHORIZE response:
   - Frame: `50 36 65 06 01 00 00 01 06 34 8E 91 03 FA`
   - DC101 transaction with data starting with 0x06

## Comparison with Our Implementation

**We were using:**
- Control byte: **0x3C** for AUTHORIZE
- Frame: `50 3C 01 01 06 ...`

**Correct (from working system):**
- Control byte: **0x37** for AUTHORIZE
- Frame: `50 37 01 01 06 ...`

## RESET Command

From earlier analysis, RESET uses:
- Control byte: **0x39**
- Frame: `50 39 01 01 05 ...`

This matches what we're already using.
