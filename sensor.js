/**
 * sensor.js — 數據解析（對應 ByteArrayExtension.kt）
 * 掛在 window.Sensor
 */
window.Sensor = {
  /** 解析小黑盤 20 bytes ASCII 回傳 */
  parse(bytes) {
    if (bytes.length !== 20) return null;
    const ascii = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
    const raw = [];
    for (let i = 0; i < ascii.length; i += 2)
      raw.push(parseInt(ascii.slice(i, i + 2), 16));
    const int16 = ([hi, lo]) => {
      const u = ((hi & 0xFF) << 8) | (lo & 0xFF);
      return u >= 0x8000 ? u - 0x10000 : u;
    };
    const cfg  = parseInt(ascii[0], 16);
    const volt = Math.min(100, Math.max(0, ((int16([raw[0] & 0x0F, raw[1]]) - 332) * 1.25) | 0));
    return {
      isExternalPower: (cfg & 4) === 4,
      isCharging:      (cfg & 2) === 2,
      isVibration:     (cfg & 1) === 1,
      voltage: volt,
      ir:  int16([raw[2], raw[3]]) & 0xFFFF,
      gx:  int16([raw[4], raw[5]]) / 16384,
      gy:  int16([raw[6], raw[7]]) / 16384,
      gz:  int16([raw[8], raw[9]]) / 16384,
    };
  },

 
};
