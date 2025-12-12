# Frame Debugging Guide

## Understanding Frame Structure

According to DART Protocol Level 2, frames have this structure:

```
ADR CTRL TRANS LNG DATA... CRC-1 CRC-2 ETX SF
```

Where:
- **ADR**: Pump address (0x50-0x6F)
- **CTRL**: Control byte
- **TRANS**: Transaction number (e.g., 0x01 = DC1, 0x02 = DC2, 0x03 = DC3)
- **LNG**: Length of data bytes in this transaction
- **DATA**: Transaction-specific data
- **CRC-1, CRC-2**: CRC checksum (2 bytes)
- **ETX**: End of text (0x03)
- **SF**: Start/Stop flag (0xFA)

## Common Frame Patterns

### Status Frame (DC1)
**Pattern**: `PP CC 01 01 STATUS CRC CRC 03 FA` (9 bytes)
- PP = Pump address (0x50-0x6F)
- CC = Control byte
- 01 01 = Transaction DC1, length 1
- STATUS = Status byte (0-8)
- CRC CRC = CRC checksum
- 03 FA = Frame delimiters

### Filled Volume/Amount (DC2)
**Pattern**: `PP CC 02 08 VOL VOL VOL VOL AMO AMO AMO AMO CRC CRC 03 FA` (18 bytes)
- 02 = Transaction DC2
- 08 = Length (8 bytes of data)
- VOL = 4 bytes BCD for volume
- AMO = 4 bytes BCD for amount

### Nozzle Status and Price (DC3)
**Pattern**: `PP CC 03 04 PRI PRI PRI NOZIO CRC CRC 03 FA` (13 bytes)
- 03 = Transaction DC3
- 04 = Length (4 bytes of data)
- PRI = 3 bytes BCD for price
- NOZIO = Nozzle byte (bits 0-3 = nozzle, bit 4 = in/out)

## Debugging Tips

1. **Check server console** - All received frames are logged with hex dump
2. **Check frame length** - Valid frames should be at least 8 bytes
3. **Check delimiters** - Last two bytes should be 0x03 0xFA
4. **Check address** - First byte should be 0x50-0x6F
5. **Check transaction** - Third byte should be a valid transaction number

## Common Issues

### Issue: Status keeps switching
- **Cause**: Multiple frames being decoded as status when they're not
- **Fix**: Added validation to ensure status byte is 0-8 and address is valid

### Issue: Price is incorrect
- **Cause**: Wrong bytes being interpreted as price, or wrong scaling factor
- **Fix**: Added price range validation (0.5 - 10.0 SAR/L)

### Issue: Frames not recognized
- **Cause**: Frame structure might differ from spec, or CRC calculation is different
- **Fix**: Added raw frame logging to see actual frame structure

## Next Steps

1. Monitor server console for frame hex dumps
2. Compare received frames with expected patterns
3. Check if transaction numbers match expected values
4. Verify CRC calculation matches pump's implementation

