# Authorization Guide

## Problem
AUTHORIZE command is being sent but pump doesn't respond with Status 2 (AUTHORIZED).

## Root Cause
According to DART Protocol Specification (section 2.1.3, line 236-238):
- **AUTHORIZE can only be sent when pump is in RESET state (Status 1)**
- If pump is in NOT_PROGRAMMED state (Status 0), AUTHORIZE will be rejected

## Correct Authorization Sequence

### Step 1: Send RESET Command
```
Frame: 50 39 01 01 05 [CRC] 03 FA
Control: 0x39
Command: 0x05 (RESET)
```

### Step 2: Wait for RESET Response
```
Frame: 50 [CTRL] 01 01 01 [CRC] 03 FA
Status: 1 (RESET)
```
The pump should respond with Status 1 (RESET) indicating it's ready for AUTHORIZE.

### Step 3: Send Price Update (if needed)
If price is not already set, send Price Update transaction (CD5) before AUTHORIZE.

### Step 4: Send AUTHORIZE Command
```
Frame: 50 37 01 01 06 [CRC] 03 FA
Control: 0x37
Command: 0x06 (AUTHORIZE)
```

### Step 5: Wait for AUTHORIZED Response
```
Frame: 50 [CTRL] 01 01 02 [CRC] 03 FA
Status: 2 (AUTHORIZED)
```

## Working Example (from usc-fuel.log)

1. **6:29:11 PM** - Pump in RESET state:
   ```
   50 34 01 01 01 03 04 00 21 80 11 9C 82 03 FA
   Status: 1 (RESET) + DC3 (price set)
   ```

2. **6:29:12 PM** - AUTHORIZE sent:
   ```
   50 37 01 01 06 1E 2A 03 FA
   Control: 0x37, Command: 0x06
   ```

3. **6:29:12 PM** - Pump responds with AUTHORIZED:
   ```
   50 36 01 01 02 03 04 00 21 80 11 0E 48 03 FA
   Status: 2 (AUTHORIZED) + DC3
   ```

## Failed Example (from your log)

1. **6:38:03 PM** - Pump in NOT_PROGRAMMED state:
   ```
   50 31 01 01 00 9E A0 03 FA
   Status: 0 (NOT_PROGRAMMED)
   ```

2. **6:38:10 PM** - AUTHORIZE sent (pump not in RESET state):
   ```
   50 37 01 01 06 1D 3D 03 FA
   Control: 0x37, Command: 0x06
   ```

3. **6:38:11 PM** - Pump rejects (stays in NOT_PROGRAMMED):
   ```
   50 34 01 01 00 9E 6C 03 FA
   Status: 0 (NOT_PROGRAMMED) - REJECTED!
   ```

## Solution

**Always send RESET before AUTHORIZE:**

1. Click "RESET" button
2. Wait for Status to show "RESET" (Status 1)
3. Then click "AUTHORIZE" button
4. Wait for Status to show "AUTHORIZED" (Status 2)

## Control Bytes

- **RESET**: Control byte `0x39`
- **AUTHORIZE**: Control byte `0x37` (NOT 0x3C!)

## Protocol Reference

DART Protocol Specification, Section 2.1.3, Command and Status Flow:
- AUTHORIZE command is only accepted in RESET state
- After RESET, pump transitions to RESET state (Status 1)
- After AUTHORIZE, pump transitions to AUTHORIZED state (Status 2)

