// Analyze authorization from the visible frames
const frames = [
  { ts: '6:29:03 PM', hex: '50 31 01 01 00 9E A0 03 FA' },
  { ts: '6:29:03 PM', hex: '50 3E 01 01 05 03 04 00 21 80 01 F8 AE 03 FA' },
  { ts: '6:29:06 PM', hex: '50 3F 03 04 00 21 80 11 CA 0A 03 FA' },
  { ts: '6:29:06 PM', hex: '50 31 01 01 05 03 04 00 21 80 11 C9 52 03 FA' },
  { ts: '6:29:08 PM', hex: '50 32 01 01 00 9E E4 03 FA' },
  { ts: '6:29:08 PM', hex: '50 32 01 01 05 03 04 00 21 80 11 39 5D 03 FA' },
  { ts: '6:29:10 PM', hex: '50 33 05 03 00 21 80 80 72 03 FA' },
  { ts: '6:29:11 PM', hex: '50 34 01 01 05 5E 6F 03 FA' },
  { ts: '6:29:11 PM', hex: '50 33 02 08 00 00 00 00 00 00 00 00 F6 8E 03 FA' },
  { ts: '6:29:11 PM', hex: '50 34 01 01 01 03 04 00 21 80 11 9C 82 03 FA' },
  { ts: '6:29:11 PM', hex: '50 35 02 01 01 AE 50 03 FA' },
  { ts: '6:29:12 PM', hex: '50 36 01 01 00 9F D4 03 FA' },
  { ts: '6:29:12 PM', hex: '50 35 01 01 01 03 04 00 21 80 11 CD 47 03 FA' },
  { ts: '6:29:12 PM', hex: '50 37 01 01 06 1E 2A 03 FA' },  // AUTHORIZE command!
  { ts: '6:29:12 PM', hex: '50 36 01 01 02 03 04 00 21 80 11 0E 48 03 FA' },
  { ts: '6:29:12 PM', hex: '50 37 01 01 02 03 04 00 21 80 11 5F 8D 03 FA' },
  { ts: '6:29:15 PM', hex: '50 39 01 01 00 9C C0 03 FA' },
  { ts: '6:29:15 PM', hex: '50 38 01 01 04 03 04 00 21 80 11 09 BD 03 FA' },
  { ts: '6:29:24 PM', hex: '50 3D 65 01 01 1D EF 03 FA' },
  { ts: '6:29:25 PM', hex: '50 36 65 06 01 00 00 01 06 34 8E 91 03 FA' },  // DC101 AUTHORIZE response!
  { ts: '6:29:25 PM', hex: '50 38 65 06 01 00 00 01 06 34 C2 F1 03 FA' },  // DC101 AUTHORIZE response!
  { ts: '6:29:29 PM', hex: '50 3A 65 06 01 00 00 01 06 34 DB 91 03 FA' },  // DC101 AUTHORIZE response!
];

console.log('AUTHORIZATION SEQUENCE ANALYSIS');
console.log('================================\n');

frames.forEach((f, i) => {
  const bytes = f.hex.split(' ').map(h => parseInt(h, 16));
  const addr = bytes[0];
  const ctrl = bytes[1];
  
  console.log(`${i+1}. [${f.ts}] ${f.hex}`);
  console.log(`   Addr: 0x${addr.toString(16).toUpperCase()}, Ctrl: 0x${ctrl.toString(16).toUpperCase()}`);
  
  // Parse transactions
  let pos = 2;
  while (pos < bytes.length - 4) {
    const trans = bytes[pos];
    const lng = bytes[pos + 1];
    const data = bytes.slice(pos + 2, pos + 2 + lng);
    
    if (trans === 0x01 && lng === 0x01 && data.length > 0) {
      const value = data[0];
      // AUTHORIZE command: Ctrl=0x37, CMD=0x06
      if (ctrl === 0x37 && value === 0x06) {
        console.log(`   → [COMMAND] AUTHORIZE (Ctrl=0x37, CMD=0x06)`);
      }
      // Status
      else if (0x30 <= ctrl && ctrl <= 0x3F) {
        const statusNames = {
          0: 'NOT_PROGRAMMED', 1: 'RESET', 2: 'AUTHORIZED',
          3: 'FILLING', 4: 'STOPPED', 5: 'FILLING_COMPLETED',
          6: 'OUT_OF_ORDER', 8: 'SUSPENDED'
        };
        console.log(`   → [STATUS] ${value} (${statusNames[value] || 'UNKNOWN'})`);
      }
    } else if (trans === 0x65) {
      // DC101
      console.log(`   → [DC101] Command Response: ${data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}`);
      if (data[0] === 0x06) {
        console.log(`      → AUTHORIZE response`);
      }
    } else if (trans === 0x03 && lng === 0x04) {
      // DC3
      const priceBytes = data.slice(0, 3);
      const nozio = data[3];
      let priceBCD = 0;
      for (const byte of priceBytes) {
        const high = (byte >> 4) & 0xF;
        const low = byte & 0xF;
        priceBCD = priceBCD * 100 + high * 10 + low;
      }
      const price = priceBCD / 1000;
      const nozzle = nozio & 0x0F;
      const nozzleOut = (nozio & 0x10) !== 0;
      console.log(`   → [DC3] Price=${price.toFixed(4)} SAR/L, Nozzle=${nozzle}, Out=${nozzleOut}`);
    } else if (trans === 0x02 && lng === 0x08) {
      // DC2
      console.log(`   → [DC2] Volume/Amount`);
    }
    
    pos += 2 + lng;
    if (pos >= bytes.length - 4) break;
  }
  console.log('');
});
