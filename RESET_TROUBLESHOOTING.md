# RESET Command Troubleshooting

## Problem
After sending RESET, status never becomes 1 (RESET). Status keeps switching between 0 (NOT_PROGRAMMED) and 5 (FILLING_COMPLETED).

## Root Cause

According to DART Protocol Specification (section 2.1.3, line 232-234):
- **RESET can only be sent when pump is in:**
  - FILLING COMPLETED (Status 5) ✓
  - MAX AMOUNT/VOLUME REACHED (Status 6)

**RESET does NOT work when pump is in NOT_PROGRAMMED (Status 0)!**

## Solution

### Step 1: Wait for Status 5
Your pump is switching between Status 0 and 5. **Wait for the pump to show Status 5 (FILLING_COMPLETED)** before sending RESET.

### Step 2: Send RESET when Status 5 is displayed
Once you see Status 5 in the status display, immediately click the "Reset" button.

### Step 3: Check for Status 1 response
After sending RESET, the pump should respond with Status 1 (RESET). The UI has been updated to show Status 1 immediately (it's now prioritized in the debouncing logic).

### Step 4: If Status 1 doesn't appear
Check the log panel (Hex Only tab) to see if Status 1 frames are being received but not displayed. Look for frames like:
```
50 [CTRL] 01 01 01 [CRC] 03 FA
```
Where the 5th byte (after `01 01`) is `01` (Status 1 = RESET).

## Price Requirement

According to the protocol spec (line 409-411):
> "A zeroized pump stays in status 'pump not programmed' until a unit price has been received."

If the pump is stuck in NOT_PROGRAMMED (Status 0), you may need to:
1. Send **Price Update** first (CD5 transaction)
2. Then wait for Status 5
3. Then send RESET

## Working Sequence

1. **Pump shows Status 5** (FILLING_COMPLETED)
2. **Send RESET command** (Control: 0x39, Command: 0x05)
3. **Pump responds with Status 1** (RESET)
4. **Send AUTHORIZE command** (Control: 0x37, Command: 0x06)
5. **Pump responds with Status 2** (AUTHORIZED)

## UI Updates

The UI has been updated to:
- Show Status 1 (RESET) immediately when it appears (no debouncing delay)
- Show Status 2 (AUTHORIZED) immediately when it appears
- Display clearer instructions about when RESET works

## Debugging

If RESET still doesn't work:
1. Check the log panel for Status 1 frames
2. Verify RESET command is being sent: Look for `50 39 01 01 05` in sent frames
3. Check if price is set (Price Update might be required)
4. Try sending RESET multiple times when Status 5 is displayed

