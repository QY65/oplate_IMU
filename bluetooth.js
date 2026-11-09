/**
 * bluetooth.js — BLE 管理（對應 BLEManager.kt）
 * 掛在 window.BLE，供 index.html 使用
 */
const UUID_SVC    = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UUID_NOTIFY = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const UUID_WRITE  = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

const _devices   = new Map(); // id → { device, writeChar, name }
const _callbacks = {};

window.BLE = {
  /** 設定回調 { onConnected, onDisconnected, onData, onError } */
  setCallbacks(cbs) { Object.assign(_callbacks, cbs); },

  /** 開啟藍牙裝置選擇器並連線 */
  async scan() {
    if (!navigator.bluetooth) {
      _callbacks.onError?.('請使用 Chrome 或 Edge 瀏覽器');
      return;
    }
    try {
      const dev    = await navigator.bluetooth.requestDevice({ filters: [{ services: [UUID_SVC] }] });
      const server = await dev.gatt.connect();
      const svc    = await server.getPrimaryService(UUID_SVC);
      const wChar  = await svc.getCharacteristic(UUID_WRITE);
      const nChar  = await svc.getCharacteristic(UUID_NOTIFY);
      await nChar.startNotifications();
      nChar.addEventListener('characteristicvaluechanged', e => {
        _callbacks.onData?.(dev.id, new Uint8Array(e.target.value.buffer));
      });
      _devices.set(dev.id, { device: dev, writeChar: wChar, name: dev.name });
      dev.addEventListener('gattserverdisconnected', () => {
        _devices.delete(dev.id);
        _callbacks.onDisconnected?.(dev.id);
      });
      _callbacks.onConnected?.({ address: dev.id, name: dev.name });
    } catch (e) {
      if (e.name !== 'NotFoundError') _callbacks.onError?.(e.message);
    }
  },

  /** 傳送指令給第一台（或指定）裝置 */
  async send(bytes, address = null) {
    const target = address
      ? _devices.get(address)
      : _devices.values().next().value;
    if (!target) return;
    try { await target.writeChar.writeValueWithoutResponse(bytes); } catch {}
  },

  isConnected: () => _devices.size > 0,
  getDevices:  () => Array.from(_devices.values()).map(d => ({ address: d.device.id, name: d.name })),
};
