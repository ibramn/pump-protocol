import re
import json

UNIT_PRICE = 2.18  # Confirmed Special 91 price

# Fueling frame conversion constants (validated from analysis)
LITERS_DIVISOR = 10000  # Convert Liters_BCD to liters
MONEY_DIVISOR = 1000    # Convert Money_BCD to SAR
CONSTANT_MULTIPLIER = 0.218  # Money_BCD = Liters_BCD × 0.218


def clean_dump(raw):
    lines = raw.strip().splitlines()
    hexbytes = []

    for line in lines:
        if "DATA:" in line:
            line = line.split("DATA:")[1].strip()
        hexbytes.extend(line.split())

    return [int(x, 16) for x in hexbytes]


def extract_frames(byte_stream):
    frames = []
    current = []

    i = 0
    while i < len(byte_stream):
        # Skip USC+ wrapper blocks: 50 XX FA or 51 XX FA
        if i + 2 < len(byte_stream) and byte_stream[i+2] == 0xFA and byte_stream[i] in (0x50, 0x51):
            i += 3
            continue

        current.append(byte_stream[i])

        # end-of-frame
        if len(current) >= 2 and current[-2:] == [0x03, 0xFA]:
            frames.append(current.copy())
            current = []

        i += 1

    return frames
def is_heartbeat(frame):
    """Heartbeat frames are small, contain only repeating 50/51 + 20/70 sequences."""
    if len(frame) < 6:
        return True
    body = frame[:-2]
    return all(x in (0x50, 0x51, 0x20, 0x70, 0xFA) for x in body)


def is_price_table(frame):
    if len(frame) != 17:
        return False

    # pattern:
    # PP GG 01 01 05 03 04 p1_hi p1_lo p2_hi p2_lo p3_hi p3_lo p4_hi p4_lo CRC 03 FA
    return (frame[2:6] == [0x01, 0x01, 0x05, 0x03] and
            frame[-2:] == [0x03, 0xFA])


def decode_price_table(frame):
    pump = frame[0]
    grade = frame[1]

    p1 = (frame[7] << 8) | frame[8]
    p2 = (frame[9] << 8) | frame[10]
    p3 = (frame[11] << 8) | frame[12]
    p4 = (frame[13] << 8) | frame[14]

    return {
        "type": "price_table",
        "pump": pump,
        "grade_index": grade,
        "prices": {
            "g1": round(p1 / 10000, 4),
            "g2": round(p2 / 10000, 4),
            "g3": round(p3 / 10000, 4),
            "g4": round(p4 / 10000, 4),
        }
    }


def bcd_to_number(bytes_list):
    s = ""
    for b in bytes_list:
        s += f"{b:02X}"
    return int(s)


def decode_bcd_3byte(b1, b2, b3):
    """Decode 3-byte BCD to decimal number"""
    digits = []
    for byte in [b1, b2, b3]:
        hi = (byte >> 4) & 0xF
        lo = byte & 0xF
        if hi > 9 or lo > 9:
            # Invalid BCD, return 0
            return 0
        digits.append(str(hi))
        digits.append(str(lo))
    num_str = "".join(digits)
    # Return raw integer value (don't divide by 100 here)
    return int(num_str)


def is_fueling(frame):
    # fueling frames with mode 0x02 are 16 bytes
    # Format: PP CC 02 08 00 00 MM MM MM LL LL LL CRC 03 FA
    if len(frame) != 16:
        return False
    # Check for DELIVERY_SUMMARY (0x38) or other commands with mode 0x02
    if frame[2] == 0x02 and frame[3] == 0x08 and frame[4:6] == [0x00, 0x00] and frame[-2:] == [0x03, 0xFA]:
        return True
    return False


def decode_fueling(frame):
    pump = frame[0]
    cmd = frame[1]
    
    # Bytes 9-11: Money (3 bytes BCD) - CUMULATIVE total in SAR  
    # Bytes 6-8: Liters (3 bytes BCD) - CUMULATIVE total in liters
    # Encoding: Both values are BCD encoded
    # Equation: Money_BCD = Liters_BCD × 0.218 (where 0.218 = 2.18 / 10)
    # Conversion: Liters = Liters_BCD / 100000, Money = Money_BCD / 10000
    # Relationship: Money = Liters × 2.18
    
    money_raw = decode_bcd_3byte(frame[9], frame[10], frame[11])
    liters_raw = decode_bcd_3byte(frame[6], frame[7], frame[8])
    
    # Extract hex bytes for liters and money
    liters_hex = " ".join(f"{frame[i]:02X}" for i in [6, 7, 8])
    money_hex = " ".join(f"{frame[i]:02X}" for i in [9, 10, 11])
    
    # Apply correct scaling factors (validated from 43 fueling frames)
    # Mean Absolute Error: 0.000272 SAR, Max Error: 0.000460 SAR
    liters = liters_raw / LITERS_DIVISOR
    money_sar = money_raw / MONEY_DIVISOR
    
    return {
        "type": "fueling",
        "pump": pump,
        "command": hex(cmd),
        "money_sar": round(money_sar, 2),
        "liters": round(liters, 2),
        "unit_price": UNIT_PRICE,
        "frame_hex": " ".join(f"{x:02X}" for x in frame),
        "liters_hex": liters_hex,
        "money_hex": money_hex
    }


def is_single_price(frame):
    """15-byte frames with pattern: PP CC 01 01 XX 03 04 00 21 80 XX XX CRC 03 FA"""
    if len(frame) != 15:
        return False
    # Check for pattern: 01 01 XX 03 04 00 21 80
    return (frame[2:4] == [0x01, 0x01] and
            frame[4] in [0x01, 0x02, 0x04, 0x05] and
            frame[5:9] == [0x03, 0x04, 0x00, 0x21] and
            frame[9] == 0x80 and
            frame[-2:] == [0x03, 0xFA])


def decode_single_price(frame):
    """Decode single price update frame
    
    Returns None if decoded price is not in valid range (1.0 - 10.0 SAR/L)
    to avoid false positives from frames that match the pattern but aren't price updates.
    """
    pump = frame[0]
    cmd = frame[1]
    price_type = frame[4]  # 01, 02, 04, or 05
    # Price is in bytes 10-11 (2 bytes, big-endian)
    price_raw = (frame[10] << 8) | frame[11]
    price = price_raw / 10000.0
    
    # Validate price is in realistic range (1.0 - 10.0 SAR/L)
    # Real fuel prices are typically between 2-3 SAR/L
    if price < 1.0 or price > 10.0:
        return None  # Invalid price - likely not a real price update frame
    
    return {
        "type": "single_price",
        "pump": pump,
        "command": hex(cmd),
        "price_type": hex(price_type),
        "price_sar_per_liter": round(price, 4),
        "frame_hex": " ".join(f"{x:02X}" for x in frame)
    }


def is_status_frame(frame):
    """9-byte frames with pattern: PP CC 01 01 XX CRC 03 FA"""
    if len(frame) != 9:
        return False
    return (frame[2:4] == [0x01, 0x01] and frame[-2:] == [0x03, 0xFA])


def decode_status_frame(frame):
    """Decode status/command frame"""
    pump = frame[0]
    cmd = frame[1]
    status_byte = frame[4]
    
    return {
        "type": "status",
        "pump": pump,
        "command": hex(cmd),
        "status_byte": hex(status_byte),
        "status_value": status_byte
    }


def is_extended_data(frame):
    """Frames with pattern: PP CC 65 XX ... CRC 03 FA (9 or 14 bytes)"""
    if len(frame) not in [9, 14]:
        return False
    return frame[2] == 0x65 and frame[-2:] == [0x03, 0xFA]


def decode_extended_data(frame):
    """Decode extended data frame (possibly with timestamp or additional data)"""
    pump = frame[0]
    cmd = frame[1]
    ext_type = frame[3]
    
    # Try to extract data based on type
    data_bytes = frame[4:-3]  # Skip header and CRC/trailer
    
    return {
        "type": "extended_data",
        "pump": pump,
        "command": hex(cmd),
        "extended_type": hex(ext_type),
        "data_length": len(data_bytes),
        "data_hex": " ".join(f"{b:02X}" for b in data_bytes)
    }


def is_config_frame(frame):
    """12-byte frames with pattern: PP CC 03 04 00 21 80 ... CRC 03 FA"""
    if len(frame) != 12:
        return False
    return (frame[2:7] == [0x03, 0x04, 0x00, 0x21, 0x80] and
            frame[-2:] == [0x03, 0xFA])


def decode_config_frame(frame):
    """Decode configuration/status frame"""
    pump = frame[0]
    cmd = frame[1]
    config_bytes = frame[7:-3]  # Data between header and CRC
    
    return {
        "type": "config",
        "pump": pump,
        "command": hex(cmd),
        "config_data": " ".join(f"{b:02X}" for b in config_bytes)
    }


def is_multi_data_frame(frame):
    """Frames with 02 04 pattern (multiple data items)"""
    if len(frame) != 12:
        return False
    return frame[2:4] == [0x02, 0x04] and frame[-2:] == [0x03, 0xFA]


def decode_multi_data_frame(frame):
    """Decode multi-data frame"""
    pump = frame[0]
    cmd = frame[1]
    data_bytes = frame[4:-3]
    
    return {
        "type": "multi_data",
        "pump": pump,
        "command": hex(cmd),
        "data_items": [hex(b) for b in data_bytes],
        "data_hex": " ".join(f"{b:02X}" for b in data_bytes)
    }


def is_special_data_frame(frame):
    """20-byte frames with pattern: PP CC 05 0C 00 21 80 ..."""
    if len(frame) != 20:
        return False
    return (frame[2:6] == [0x05, 0x0C, 0x00, 0x21] and
            frame[6] == 0x80 and
            frame[-2:] == [0x03, 0xFA])


def decode_special_data_frame(frame):
    """Decode special data frame (possibly multi-grade prices or configuration)"""
    pump = frame[0]
    cmd = frame[1]
    data_bytes = frame[7:-3]
    
    # Try to extract multiple values (possibly 3 prices)
    if len(data_bytes) >= 6:
        values = []
        for i in range(0, len(data_bytes), 2):
            if i + 1 < len(data_bytes):
                val = (data_bytes[i] << 8) | data_bytes[i + 1]
                values.append(val / 10000.0)
        
        return {
            "type": "special_data",
            "pump": pump,
            "command": hex(cmd),
            "values": [round(v, 4) for v in values],
            "data_hex": " ".join(f"{b:02X}" for b in data_bytes)
        }
    
    return {
        "type": "special_data",
        "pump": pump,
        "command": hex(cmd),
        "data_hex": " ".join(f"{b:02X}" for b in data_bytes)
    }


def is_fueling_with_extra(frame):
    """22-byte frames that look like fueling frames with extra data"""
    if len(frame) != 22:
        return False
    # Check if it starts like a fueling frame
    return (frame[2:6] == [0x02, 0x08, 0x00, 0x00] and
            frame[-2:] == [0x03, 0xFA])


def decode_fueling_with_extra(frame):
    """Decode fueling frame with extra appended data"""
    pump = frame[0]
    cmd = frame[1]
    
    # First part is a normal fueling frame (bytes 0-15)
    fueling_part = frame[:16]
    if is_fueling(fueling_part):
        fueling_data = decode_fueling(fueling_part)
        # Extra data is bytes 16-19
        extra_data = frame[16:20]
        fueling_data["type"] = "fueling_with_extra"
        fueling_data["extra_data"] = " ".join(f"{b:02X}" for b in extra_data)
        fueling_data["frame_hex"] = " ".join(f"{x:02X}" for x in frame)
        # Keep liters_hex and money_hex from the decoded fueling part
        return fueling_data
    
    return {
        "type": "fueling_with_extra",
        "pump": pump,
        "command": hex(cmd),
        "raw_hex": " ".join(f"{x:02X}" for x in frame)
    }


def decode_dump(raw):
    byte_stream = clean_dump(raw)
    frames = extract_frames(byte_stream)

    decoded = []

    for f in frames:
        if is_heartbeat(f):
            continue
        elif is_price_table(f):
            decoded.append(decode_price_table(f))
        elif is_fueling_with_extra(f):
            decoded.append(decode_fueling_with_extra(f))
        elif is_fueling(f):
            decoded.append(decode_fueling(f))
        elif is_single_price(f):
            price_decoded = decode_single_price(f)
            if price_decoded is not None:
                decoded.append(price_decoded)
            else:
                # Frame matched pattern but price was invalid - treat as unknown
                decoded.append({"type": "unknown", "raw": " ".join(f"{x:02X}" for x in f), "note": "Matched price pattern but decoded value invalid"})
        elif is_status_frame(f):
            decoded.append(decode_status_frame(f))
        elif is_extended_data(f):
            decoded.append(decode_extended_data(f))
        elif is_config_frame(f):
            decoded.append(decode_config_frame(f))
        elif is_special_data_frame(f):
            decoded.append(decode_special_data_frame(f))
        elif is_multi_data_frame(f):
            decoded.append(decode_multi_data_frame(f))
        else:
            decoded.append({"type": "unknown", "raw": " ".join(f"{x:02X}" for x in f)})

    return decoded


# Generate structured JSON fueling report
def generate_fueling_json_report(decoded_data):
    """Generate a structured JSON report with fueling data"""
    # Include both fueling and fueling_with_extra frames
    fueling_frames = [f for f in decoded_data if f.get("type") in ["fueling", "fueling_with_extra"]]
    
    if not fueling_frames:
        return {
            "status": "no_fueling_data",
            "total_frames": 0,
            "fueling_updates": []
        }
    
    prev_liters = 0
    prev_money = 0
    
    updates = []
    for i, frame in enumerate(fueling_frames, 1):
        pump = frame.get("pump", 0)
        money = frame.get("money_sar", 0)
        liters = frame.get("liters", 0)
        
        # Calculate increments
        liters_inc = liters - prev_liters
        money_inc = money - prev_money
        
        updates.append({
            "update_number": i,
            "pump": f"0x{pump:02X}",
            "liters": round(liters, 2),
            "liters_increment": round(liters_inc, 2),
            "money_sar": round(money, 2),
            "money_increment": round(money_inc, 2),
            "unit_price": frame.get("unit_price", 0),
            "frame_hex": frame.get("frame_hex", ""),
            "liters_hex": frame.get("liters_hex", ""),
            "money_hex": frame.get("money_hex", "")
        })
        
        prev_liters = liters
        prev_money = money
    
    final = fueling_frames[-1] if fueling_frames else {}
    
    return {
        "status": "success",
        "total_updates": len(fueling_frames),
        "unit_price_sar_per_liter": UNIT_PRICE,
        "final_total": {
            "liters": round(final.get("liters", 0), 2),
            "money_sar": round(final.get("money_sar", 0), 2)
        },
        "fueling_updates": updates
    }


# Human-readable fueling report
def print_fueling_report(decoded_data):
    """Print fueling data in human-readable format showing fuel increasing"""
    fueling_frames = [f for f in decoded_data if f.get("type") == "fueling"]
    
    if not fueling_frames:
        print("No fueling frames found in the log.")
        return
    
    print("=" * 60)
    print("FUELING SESSION REPORT - Real-time Updates")
    print("=" * 60)
    print()
    
    prev_liters = 0
    prev_money = 0
    
    for i, frame in enumerate(fueling_frames, 1):
        pump = frame.get("pump", 0)
        money = frame.get("money_sar", 0)
        liters = frame.get("liters", 0)
        
        # Calculate increments
        liters_inc = liters - prev_liters
        money_inc = money - prev_money
        
        print(f"Update #{i:3d} | Pump {pump:02X} | "
              f"💧 {liters:6.2f} L (+{liters_inc:5.2f} L) | "
              f"💰 {money:6.2f} SAR (+{money_inc:5.2f} SAR) | "
              f"Price: {frame.get('unit_price', 0):.2f} SAR/L")
        
        prev_liters = liters
        prev_money = money
    
    if fueling_frames:
        final = fueling_frames[-1]
        print()
        print("=" * 60)
        print(f"FINAL TOTAL: {final.get('liters', 0):.2f} Liters | {final.get('money_sar', 0):.2f} SAR")
        print("=" * 60)


# Example usage:
if __name__ == "__main__":
    import sys
    
    # Default to logs_after.txt if no argument
    filename = sys.argv[1] if len(sys.argv) > 1 else "logs_after.txt"
    
    with open(filename) as f:
        raw = f.read()

    out = decode_dump(raw)

    # Generate structured fueling report
    fueling_report = generate_fueling_json_report(out)
    
    # Combine all data into a comprehensive JSON output
    json_output = {
        "source_file": filename,
        "total_frames_decoded": len(out),
        "fueling_report": fueling_report,
        "all_frames": out
    }

    # Save JSON output to file
    output_filename = filename.replace(".txt", "_decoded.json")
    with open(output_filename, "w") as f:
        json.dump(json_output, f, indent=2)

    # Output JSON to console
    print(json.dumps(json_output, indent=2))