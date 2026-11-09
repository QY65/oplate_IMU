/**
 * led.js — LED 狀態管理（對應 FunctionSettingViewModel LED 區塊）
 * 掛在 window.LED
 */
const _state = Array.from({ length: 18 }, () => ({ r: 0, g: 0, b: 0 }));
let _cur = 0; // 目前選中的 LED（0~17）
const _cb = {};

window.LED = {
  setCallbacks(cbs) { Object.assign(_cb, cbs); },

  select(idx) { _cur = idx; return { ..._state[idx] }; },
  getCurrent()  { return _cur; },
  getColor(idx) { return { ..._state[idx] }; },
  getAll()      { return _state.map(c => ({ ...c })); },

  /** 設定目前選中的單顆 LED，並送出指令 */
  setSingle(r, g, b, address = null) {
    _state[_cur] = { r, g, b };
    _cb.onChange?.(_cur, r, g, b);
    BLE.send(Cmd.ledArray(_state), address);
  },

  /** 所有 LED 設同一顏色 */
  setAll(r, g, b, address = null) {
    for (let i = 0; i < 18; i++) _state[i] = { r, g, b };
    _cb.onAllChange?.(_state.map(c => ({ ...c })));
    BLE.send(Cmd.ledSingle(-1, r, g, b), address);
  },

  /** 重設全部為黑 */
  reset(address = null) {
    _cur = 0;
    for (let i = 0; i < 18; i++) _state[i] = { r: 0, g: 0, b: 0 };
    _cb.onAllChange?.(_state.map(c => ({ ...c })));
    BLE.send(Cmd.ledSingle(-1, 0, 0, 0), address);
  },

  // 色彩工具
  rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  },
  hexToRgb(hex) {
    const c = hex.replace('#', '');
    return { r: parseInt(c.slice(0, 2), 16), g: parseInt(c.slice(2, 4), 16), b: parseInt(c.slice(4, 6), 16) };
  },
};