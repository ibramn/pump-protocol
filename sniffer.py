import time
import sys
from datetime import datetime

# Only import serial if not in simulation mode
try:
    import serial
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False
from mepsan_decoder import (
    extract_frames,
    is_heartbeat,
    is_price_table,
    is_fueling,
    is_fueling_with_extra,
    is_single_price,
    is_status_frame,
    is_extended_data,
    is_config_frame,
    is_special_data_frame,
    is_multi_data_frame,
    decode_price_table,
    decode_fueling,
    decode_fueling_with_extra,
    decode_single_price,
    decode_status_frame,
    decode_extended_data,
    decode_config_frame,
    decode_special_data_frame,
    decode_multi_data_frame
)

PORT = "/dev/ttyUSB0"
BAUD = 9600

# Check for simulation mode
SIMULATION_MODE = len(sys.argv) > 1 and sys.argv[1] == "--simulate"
SIMULATION_FILE = sys.argv[2] if len(sys.argv) > 2 else "logs_after.txt"

if SIMULATION_MODE:
    print(f"\n{'='*80}")
    print(f"  FUEL PUMP PROTOCOL DECODER - SIMULATION MODE")
    print(f"  Reading from: {SIMULATION_FILE}")
    print(f"{'='*80}\n")
    ser = None
else:
    if not SERIAL_AVAILABLE:
        print("ERROR: pyserial module not installed. Install it with: pip install pyserial")
        sys.exit(1)
    print(f"\n{'='*80}")
    print(f"  FUEL PUMP PROTOCOL DECODER - LIVE MODE")
    print(f"  Connecting to: {PORT} at {BAUD} baud")
    print(f"{'='*80}\n")
    try:
        ser = serial.Serial(
            PORT,
            BAUD,
            timeout=1,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE
        )
    except Exception as e:
        print(f"ERROR: Could not open serial port: {e}")
        sys.exit(1)
    print("✓ Connected successfully. Listening for pump data...\n")

# Buffer for incomplete frames
byte_buffer = []

# Track fueling session for better display
fueling_sessions = {}  # pump -> last values

def decode_and_display_frame(frame):
    """Decode a single frame and display it in human-readable format"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    
    if is_heartbeat(frame):
        return  # Skip heartbeat frames
    
    try:
        # Only display fueling operations - skip all other frame types
        if is_fueling_with_extra(frame):
            decoded = decode_fueling_with_extra(frame)
            pump_num = decoded['pump'] & 0x0F
            liters = decoded['liters']
            money = decoded['money_sar']
            
            # Calculate increment
            pump_key = pump_num
            if pump_key in fueling_sessions:
                prev_liters, prev_money = fueling_sessions[pump_key]
                liters_inc = liters - prev_liters
                money_inc = money - prev_money
                print(f"\n[{timestamp}] ⛽ Pump #{pump_num} - Fueling Update")
                print(f"   Fuel Dispensed: {liters:.2f} liters (+{liters_inc:.2f} L)")
                print(f"   Total Amount: {money:.2f} SAR (+{money_inc:.2f} SAR)")
                print(f"   Unit Price: {decoded['unit_price']:.2f} SAR/L")
            else:
                print(f"\n[{timestamp}] ⛽ Pump #{pump_num} - Fueling Started")
                print(f"   Fuel Dispensed: {liters:.2f} liters")
                print(f"   Total Amount: {money:.2f} SAR")
                print(f"   Unit Price: {decoded['unit_price']:.2f} SAR/L")
            
            fueling_sessions[pump_key] = (liters, money)
            
        elif is_fueling(frame):
            decoded = decode_fueling(frame)
            pump_num = decoded['pump'] & 0x0F
            liters = decoded['liters']
            money = decoded['money_sar']
            
            # Calculate increment
            pump_key = pump_num
            if pump_key in fueling_sessions:
                prev_liters, prev_money = fueling_sessions[pump_key]
                liters_inc = liters - prev_liters
                money_inc = money - prev_money
                if liters_inc > 0:  # Only show if there's actual progress
                    print(f"\n[{timestamp}] ⛽ Pump #{pump_num} - Fueling Update")
                    print(f"   Fuel Dispensed: {liters:.2f} liters (+{liters_inc:.2f} L)")
                    print(f"   Total Amount: {money:.2f} SAR (+{money_inc:.2f} SAR)")
                    print(f"   Unit Price: {decoded['unit_price']:.2f} SAR/L")
            else:
                if liters > 0 or money > 0:
                    print(f"\n[{timestamp}] ⛽ Pump #{pump_num} - Fueling Started")
                    print(f"   Fuel Dispensed: {liters:.2f} liters")
                    print(f"   Total Amount: {money:.2f} SAR")
                    print(f"   Unit Price: {decoded['unit_price']:.2f} SAR/L")
            
            fueling_sessions[pump_key] = (liters, money)
        
        # All other frame types are silently ignored (price tables, status, config, etc.)
            
    except Exception as e:
        print(f"\n[{timestamp}] ⚠️  Decode Error: {e}")

if SIMULATION_MODE:
    # Simulation mode: read from file
    try:
        with open(SIMULATION_FILE, 'r') as f:
            lines = f.readlines()
        
        for line_num, line in enumerate(lines, 1):
            if "DATA:" in line:
                # Extract hex bytes from the line
                hex_part = line.split("DATA:")[1].strip()
                hex_bytes = hex_part.split()
                
                # Convert to bytes
                data = bytes([int(x, 16) for x in hex_bytes])
                
                if data:
                    # Add new bytes to buffer
                    byte_buffer.extend(data)
                    
                    # Extract complete frames
                    frames = extract_frames(byte_buffer)
                    
                    # Process each complete frame
                    for frame in frames:
                        decode_and_display_frame(frame)
                    
                    # Keep only incomplete frame data in buffer
                    # Find the last complete frame end (0x03, 0xFA)
                    last_frame_end = -1
                    for i in range(len(byte_buffer) - 1, 0, -1):
                        if byte_buffer[i-1:i+1] == [0x03, 0xFA]:
                            last_frame_end = i + 1
                            break
                    
                    if last_frame_end > 0:
                        # Keep only bytes after the last complete frame
                        byte_buffer = byte_buffer[last_frame_end:]
                    elif len(byte_buffer) > 1000:
                        # Prevent buffer overflow - keep last 500 bytes if no frame found
                        byte_buffer = byte_buffer[-500:]
                    
                    # Small delay to simulate real-time processing
                    time.sleep(0.1)
        
        print("\n" + "=" * 80)
        print("  Simulation Complete")
        print("=" * 80)
        
    except FileNotFoundError:
        print(f"ERROR: File '{SIMULATION_FILE}' not found.")
        sys.exit(1)
    except Exception as e:
        print(f"\nSimulation ERROR: {e}")
        import traceback
        traceback.print_exc()

else:
    # Live mode: read from serial port
    while True:
        try:
            data = ser.read(256)
            if data:
                # Add new bytes to buffer
                byte_buffer.extend(data)
                
                # Extract complete frames
                frames = extract_frames(byte_buffer)
                
                # Process each complete frame
                for frame in frames:
                    decode_and_display_frame(frame)
                
                # Keep only incomplete frame data in buffer
                # Find the last complete frame end (0x03, 0xFA)
                last_frame_end = -1
                for i in range(len(byte_buffer) - 1, 0, -1):
                    if byte_buffer[i-1:i+1] == [0x03, 0xFA]:
                        last_frame_end = i + 1
                        break
                
                if last_frame_end > 0:
                    # Keep only bytes after the last complete frame
                    byte_buffer = byte_buffer[last_frame_end:]
                elif len(byte_buffer) > 1000:
                    # Prevent buffer overflow - keep last 500 bytes if no frame found
                    byte_buffer = byte_buffer[-500:]
                    
        except KeyboardInterrupt:
            print("\n\nStopped by user.")
            break
        except Exception as e:
            print(f"\nRead ERROR: {e}")
            break
    
    if ser:
        ser.close()
        print("Port closed.")