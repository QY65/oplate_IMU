/**
 * command.js — 指令產生（對應 CommandUtil.kt）
 * 掛在 window.Cmd
 */
window.Cmd = {
  gSensor(v) {
    return new Uint8Array([0x01, v, 0xAA]);
  },
  buz(freq, vol) {
    const b = new Uint8Array(11);
    b[0] = 0x02; b[1] = (freq >> 8) & 0xFF; b[2] = freq & 0xFF;
    b[3] = vol & 0xFF; b[10] = 0xAA;
    return b;
  },
  mot(on) {
    return new Uint8Array([0x03, on & 0xFF, 0xAA]);
  },
  /** position=-1 全部同色；否則單顆（0~17） */
  ledSingle(position, r, g, b) {
    const bytes = new Uint8Array(56); bytes[0] = 0x04; bytes[55] = 0xAA;
    if (position === -1) {
      for (let i = 0; i < 18; i++) {
        bytes[i * 3 + 1] = r; bytes[i * 3 + 2] = g; bytes[i * 3 + 3] = b;
      }
    } else {
      bytes[position * 3 + 1] = r; bytes[position * 3 + 2] = g; bytes[position * 3 + 3] = b;
    }
    return bytes;
  },
  /** arr：長度 18 的 [{r,g,b}] */
  ledArray(arr) {
    const bytes = new Uint8Array(56); bytes[0] = 0x04; bytes[55] = 0xAA;
    arr.slice(0, 18).forEach(({ r, g, b }, i) => {
      bytes[i * 3 + 1] = r; bytes[i * 3 + 2] = g; bytes[i * 3 + 3] = b;
    });
    return bytes;
  },
};
