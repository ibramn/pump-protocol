const fs = require('fs');

// Read and parse the log file
const content = fs.readFileSync('usc-fuel.log', 'utf8');
const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

const frames = [];
for (let i = 0; i < lines.length; i += 2) {
  if (i + 1 < lines.length) {
    const timestamp = lines[i];
    const hex = lines[i + 1];
    if (hex && hex.match(/^[0-9A-F ]+$/i)) {
      try {
        const bytes = hex.split(/\s+/).map(h => parseInt(h, 16));
        if (bytes.length >= 8 && bytes.every(b => !isNaN(b))) {
          frames.push({ timestamp, hex, bytes });
        }
      } catch (e) {
        // Skip invalid
      }
    }
  }
}

console.log('AUTHORIZATION SEQUENCE ANALYSIS');
console.log('================================\n');
console.log(`Total frames: ${frames.length}\n`);

// Find commands (CD1) - these are FROM controller TO pump
// Commands have control bytes like 0x39 (RESET), 0x3C (AUTHORIZE)
const commands = [];
const statuses = [];
const dc101Responses = [];

frames.forEach((f, idx) => {
  const bytes = f.bytes;
  const addr = bytes[0];
  const ctrl = bytes[1];
  let pos = 2;
  
  while (pos < bytes.length - 4) {
    const trans = bytes[pos];
    const lng = bytes[pos + 1];
    const data = bytes.slice(pos + 2, pos + 2 + lng);
    
    // Commands (CD1) - from controller to pump
    if (trans === 0x01 && lng === 0x01 && data.length > 0) {
      const value = data[0];
      
      // RESET command: Ctrl=0x39, CMD=0x05
      if (ctrl === 0x39 && value === 0x05) {
        commands.push({ idx, timestamp: f.timestamp, hex: f.hex, type: 'RESET', ctrl, cmd: value });
      }
      // AUTHORIZE command: Ctrl=0x3C, CMD=0x06
      else if (ctrl === 0x3C && value === 0x06) {
        commands.push({ idx, timestamp: f.timestamp, hex: f.hex, type: 'AUTHORIZE', ctrl, cmd: value });
      }
      // Status responses (DC1) - from pump to controller
      else if (ctrl >= 0x30 && ctrl <= 0x3F) {
        const statusNames = {
          0: 'NOT_PROGRAMMED', 1: 'RESET', 2: 'AUTHORIZED', 
          3: 'FILLING', 4: 'STOPPED', 5: 'FILLING_COMPLETED', 
          6: 'OUT_OF_ORDER', 8: 'SUSPENDED'
        };
        statuses.push({
          idx, timestamp: f.timestamp, hex: f.hex,
          status: value, statusName: statusNames[value] || 'UNKNOWN', ctrl
        });
      }
    }
    // DC101 - Command response
    else if (trans === 0x65) {
      if (data[0] === 0x06) {
        dc101Responses.push({
          idx, timestamp: f.timestamp, hex: f.hex,
          type: 'AUTHORIZE_RESPONSE', ctrl, data: data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
        });
      } else if (data[0] === 0x01) {
        dc101Responses.push({
          idx, timestamp: f.timestamp, hex: f.hex,
          type: 'RESET_RESPONSE', ctrl, data: data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
        });
      }
    }
    
    pos += 2 + lng;
    if (pos >= bytes.length - 4) break;
  }
});

console.log('COMMANDS SENT (Controller → Pump):');
console.log('====================================\n');
commands.forEach(cmd => {
  console.log(`[${cmd.timestamp}] ${cmd.type} command`);
  console.log(`  Frame: ${cmd.hex}`);
  console.log(`  Control: 0x${cmd.ctrl.toString(16).toUpperCase()}, Command: 0x${cmd.cmd.toString(16).toUpperCase()}`);
  console.log('');
});

console.log('\n\nDC101 RESPONSES (Pump → Controller):');
console.log('=====================================\n');
dc101Responses.forEach(resp => {
  console.log(`[${resp.timestamp}] ${resp.type}`);
  console.log(`  Frame: ${resp.hex}`);
  console.log(`  Control: 0x${resp.ctrl.toString(16).toUpperCase()}, Data: ${resp.data}`);
  console.log('');
});

console.log('\n\nSTATUS TRANSITIONS (First 40):');
console.log('==============================\n');
statuses.slice(0, 40).forEach(st => {
  console.log(`[${st.timestamp}] Status: ${st.status} (${st.statusName})`);
  console.log(`  Frame: ${st.hex}`);
  console.log(`  Control: 0x${st.ctrl.toString(16).toUpperCase()}`);
  console.log('');
});

// Find authorization sequence
console.log('\n\nAUTHORIZATION SEQUENCE (First 15 seconds):');
console.log('===========================================\n');

const authFrames = frames.filter(f => {
  const match = f.timestamp.match(/(\d+):(\d+):(\d+)/);
  if (match) {
    const min = parseInt(match[2]);
    const sec = parseInt(match[3]);
    return min === 29 && sec <= 15;
  }
  return false;
});

let lastStatus = null;
authFrames.forEach((f, i) => {
  const bytes = f.bytes;
  const addr = bytes[0];
  const ctrl = bytes[1];
  
  // Check for commands
  const isReset = ctrl === 0x39 && bytes[2] === 0x01 && bytes[3] === 0x01 && bytes[4] === 0x05;
  const isAuthorize = ctrl === 0x3C && bytes[2] === 0x01 && bytes[3] === 0x01 && bytes[4] === 0x06;
  
  // Check for DC101 responses
  let hasDC101 = false;
  let dc101Type = '';
  let pos = 2;
  while (pos < bytes.length - 4) {
    if (bytes[pos] === 0x65) {
      hasDC101 = true;
      if (bytes[pos + 2] === 0x06) dc101Type = 'AUTHORIZE';
      if (bytes[pos + 2] === 0x01) dc101Type = 'RESET';
      break;
    }
    pos += 2 + bytes[pos + 1];
  }
  
  // Check for status
  let status = null;
  if (bytes[2] === 0x01 && bytes[3] === 0x01 && bytes.length >= 5) {
    status = bytes[4];
  }
  
  if (isReset || isAuthorize || hasDC101 || (status !== null && status !== lastStatus)) {
    console.log(`${i+1}. [${f.timestamp}] ${f.hex}`);
    if (isReset) console.log('   → [COMMAND] RESET (Ctrl=0x39)');
    if (isAuthorize) console.log('   → [COMMAND] AUTHORIZE (Ctrl=0x3C)');
    if (hasDC101) console.log(`   → [DC101] ${dc101Type} response`);
    if (status !== null) {
      const statusNames = {
        0: 'NOT_PROGRAMMED', 1: 'RESET', 2: 'AUTHORIZED',
        3: 'FILLING', 4: 'STOPPED', 5: 'FILLING_COMPLETED',
        6: 'OUT_OF_ORDER', 8: 'SUSPENDED'
      };
      console.log(`   → [STATUS] ${status} (${statusNames[status] || 'UNKNOWN'})`);
      lastStatus = status;
    }
    console.log('');
  }
});

