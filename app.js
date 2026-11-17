const $ = id => document.getElementById(id);
let ledMode = 'single';
let isRecording = false;
const angleLog = [];
const deviceMap = new Map();
let statusDev = [null, null];

// 歸零基準
let zeroBase = null; // { p1, p2, joint } 歸零時的角度快照

BLE.setCallbacks({
  onConnected({ address, name }) {
    const usedIdx = new Set([...deviceMap.values()].map(d => d.index));
    const newIdx = usedIdx.has(0) ? 1 : 0;
    deviceMap.set(address, { address, name, index: newIdx });
    $(newIdx === 0 ? 'pill1' : 'pill2').classList.add('on');
    $(newIdx === 0 ? 'pill1' : 'pill2').querySelector('span:last-child').textContent = name || address.slice(-5);
    updateDeviceNameUI(newIdx, name || address.slice(-5));
  },
  onDisconnected(address) {
    const d = deviceMap.get(address);
    if (!d) return;
    $(d.index === 0 ? 'pill1' : 'pill2').classList.remove('on');
    $(d.index === 0 ? 'pill1' : 'pill2').querySelector('span:last-child').textContent = `裝置 ${d.index + 1}`;
    deviceMap.delete(address);
    statusDev[d.index] = null;
    updateDeviceNameUI(d.index, '—');
    drawLeg(); drawChart();
  },
  onData(address, bytes) {
    const s = Sensor.parse(bytes);
    if (!s) return;
    const d = deviceMap.get(address);
    const idx = d ? d.index : 0;
    statusDev[idx] = s;
    updateDeviceUI(idx, s);
    updateGSensor(idx, s);
    updateJointAngle();
    drawLeg();
    // 紀錄由 setInterval 控制，不在這裡觸發
  },
  onError(msg) { console.warn('[BLE]', msg); },
});

function updateLedDot(idx, r, g, b) {
  const dot = $('led-grid').children[idx]?.querySelector('.led-circle');
  if (!dot) return;
  // 只改 background 和 boxShadow，不動其他 style（避免清掉 sel 的 border）
  dot.style.background = (r||g||b) ? `rgb(${r},${g},${b})` : '#e8edf2';
  dot.style.boxShadow  = (r||g||b) ? `0 0 8px rgb(${r},${g},${b})` : 'none';
}

LED.setCallbacks({
  onChange(idx, r, g, b) { updateLedDot(idx, r, g, b); },
  onAllChange(all) { all.forEach(({ r, g, b }, i) => updateLedDot(i, r, g, b)); },
});

function updateDeviceNameUI(idx, name) {
  $(`d${idx+1}-name`).textContent = name;
}
function updateDeviceUI(idx, s) {
  const pre = `d${idx+1}`;
  const pct = s.voltage;
  $(`${pre}-batt-pct`).textContent = `${pct}%`;
  const fill = $(`${pre}-batt-fill`);
  fill.style.width = `${pct}%`;
  fill.style.background = pct > 40 ? 'var(--success)' : pct > 15 ? 'var(--warning)' : 'var(--danger)';
  setTag(`${pre}-power`,    s.isExternalPower, '外部電源', '電池');
  setTag(`${pre}-charging`, s.isCharging,      '充電中',   '關閉');
  if (idx === 0) {
    $('ir-val').innerHTML = `${s.ir}<span class="ir-unit">cm</span>`;
    $('fb-ir').textContent = s.ir;
    $('ir-badge').classList.toggle('show', s.ir > (+$('ir-thresh').value || 0));
    setFb('fb-vib', s.isVibration,     '震動中', '關閉');
    setFb('fb-pwr', s.isExternalPower, '外部',   '電池');
    setFb('fb-chg', s.isCharging,      '充電中', '否');
  }
}
function updateGSensor(idx, s) {
  const pre = `d${idx+1}`;
  $(`${pre}-gx`).textContent = s.gx.toFixed(2);
  $(`${pre}-gy`).textContent = s.gy.toFixed(2);
  $(`${pre}-gz`).textContent = s.gz.toFixed(2);
  const { pitch, roll } = calcAngleCorrect(s);
  $(`${pre}-pitch`).textContent = `${pitch}°`;
  $(`${pre}-roll`).textContent  = `${roll}°`;
}
function updateJointAngle() {
  const s0 = statusDev[0], s1 = statusDev[1];
  if (!s0 || !s1) { $('joint-angle').textContent = '—'; return; }
  const { pitch: p1 } = calcAngleCorrect(s0);
  const { pitch: p2 } = calcAngleCorrect(s1);
  $('joint-angle').textContent = `${Math.abs(p1 - p2).toFixed(1)}°`;
}

// 角度計算：以 X 軸當主要基準
// 小黑盤放在大腿/小腿側面，X 軸是主要傾斜方向
// angle = atan2(gx, gz)：X 軸相對 Z 軸的角度
// 平放時 gz≈1, gx≈0 → angle≈0
// 立起（X 方向）時 gx 增大 → angle 增大
function calcAngleCorrect(s) {
  const R = 180 / Math.PI;
  const angle = +(Math.atan2(s.gx, s.gz) * R).toFixed(1);
  const side  = +(Math.atan2(s.gy, s.gz) * R).toFixed(1);
  return { pitch: angle, roll: side };
}

function setTag(id, on, a, b) { const el=$(id); el.textContent=on?a:b; el.className=on?'tag tag-on':'tag tag-off'; }
function setFb(id, on, a, b)  { const el=$(id); el.textContent=on?a:b; el.style.color=on?'var(--success)':'var(--text3)'; }

$('btn-scan').addEventListener('click', () => BLE.scan());

// ── 歸零 ────────────────────────────────────────
$('btn-zero').addEventListener('click', () => {
  const s0 = statusDev[0], s1 = statusDev[1];
  if (!s0 && !s1) {
    $('zero-hint').textContent = '基準：無裝置';
    $('zero-hint').style.color = 'var(--danger)';
    return;
  }
  const p1 = s0 ? calcAngleCorrect(s0).pitch : 0;
  const p2 = s1 ? calcAngleCorrect(s1).pitch : 0;
  const joint = +Math.abs(p1 - p2).toFixed(1);
  zeroBase = { p1, p2, joint };

  const t = new Date();
  const time = [t.getHours(),t.getMinutes(),t.getSeconds()].map(n=>String(n).padStart(2,'0')).join(':');
  $('zero-hint').textContent = `基準：${time}　P1=${p1}°　P2=${p2}°`;
  $('zero-hint').style.color = '#7c3aed';

  // 歸零後清空現有紀錄，重新開始
  angleLog.length = 0;
  $('log-body').innerHTML = '<div class="empty-hint">歸零完成，可開始紀錄</div>';
  drawChart();
});
document.querySelectorAll('.seg button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.seg button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    BLE.send(Cmd.gSensor(+btn.dataset.g));
  });
});
$('freq-sl').addEventListener('input', e => { $('freq-disp').textContent=`${e.target.value} Hz`; BLE.send(Cmd.buz(+e.target.value,+$('vol-sl').value)); });
$('vol-sl').addEventListener('input',  e => { $('vol-disp').textContent=`${e.target.value} %`;   BLE.send(Cmd.buz(+$('freq-sl').value,+e.target.value)); });
$('vib-toggle').addEventListener('change', e => BLE.send(Cmd.mot(e.target.checked?1:0)));

// ── LED：圓圈 + 下方數字，3排×6 ─────────────────
const ledGrid = $('led-grid');
for (let i = 0; i < 18; i++) {
  const wrap = document.createElement('div');
  wrap.className = 'led-item' + (i===0?' sel':'');
  wrap.title = `LED ${i+1}`;
  wrap.innerHTML = `<div class="led-circle"></div><span class="led-num-label">${i+1}</span>`;
  wrap.addEventListener('click', () => {
    if (ledMode !== 'single') return;
    document.querySelectorAll('.led-item').forEach(c => c.classList.remove('sel'));
    wrap.classList.add('sel');
    const { r, g, b } = LED.select(i);
    $('r-sl').value=r; $('r-val').textContent=r;
    $('g-sl').value=g; $('g-val').textContent=g;
    $('b-sl').value=b; $('b-val').textContent=b;
    $('color-picker').value=LED.rgbToHex(r,g,b);
    $('color-preview').style.background=`rgb(${r},${g},${b})`;
    $('cur-led-num').textContent=i+1;
  });
  ledGrid.appendChild(wrap);
}
$('mode-single').addEventListener('click', () => {
  ledMode='single'; $('mode-single').classList.add('active'); $('mode-all').classList.remove('active');
  $('led-mode-label').style.display='';
  ledGrid.children[0].classList.add('sel'); LED.select(0); $('cur-led-num').textContent=1;
});
$('mode-all').addEventListener('click', () => {
  ledMode='all'; $('mode-all').classList.add('active'); $('mode-single').classList.remove('active');
  $('led-mode-label').style.display='none';
  document.querySelectorAll('.led-item').forEach(c=>c.classList.remove('sel'));
});
function getLedTarget() {
  const sel = $('led-target').value;
  if (sel === 'both') return null; // null = 送給第一台，再手動送第二台
  const entries = [...deviceMap.values()];
  if (sel === 'd1') return entries.find(d => d.index === 0)?.address ?? null;
  if (sel === 'd2') return entries.find(d => d.index === 1)?.address ?? null;
  return null;
}

let _rgbTimer = null;

function applyRGB() {
  const r=+$('r-sl').value, g=+$('g-sl').value, b=+$('b-sl').value;
  // 畫面即時更新
  $('r-val').textContent=r; $('g-val').textContent=g; $('b-val').textContent=b;
  $('color-picker').value=LED.rgbToHex(r,g,b);
  $('color-preview').style.background=`rgb(${r},${g},${b})`;
  // 也即時更新圓點顏色（不等 BLE 回應）
  if (ledMode==='single') {
    updateLedDot(LED.getCurrent(), r, g, b);
    // 更新內部狀態（不送 BLE）
    const all = LED.getAll();
    all[LED.getCurrent()] = {r,g,b};
  } else {
    for(let i=0;i<18;i++) updateLedDot(i,r,g,b);
  }
  // debounce：停止拖動後 120ms 才送 BLE
  clearTimeout(_rgbTimer);
  _rgbTimer = setTimeout(() => sendRGB(r,g,b), 120);
}

function sendRGB(r, g, b) {
  const sel = $('led-target').value;
  if (sel === 'both') {
    const entries = [...deviceMap.values()];
    const a1 = entries.find(d=>d.index===0)?.address ?? null;
    const a2 = entries.find(d=>d.index===1)?.address ?? null;
    if (ledMode==='single') {
      LED.setSingle(r,g,b,a1);
      if (a2) BLE.send(Cmd.ledArray(LED.getAll()), a2);
    } else {
      LED.setAll(r,g,b,a1);
      if (a2) BLE.send(Cmd.ledSingle(-1,r,g,b), a2);
    }
  } else {
    const addr = getLedTarget();
    ledMode==='single' ? LED.setSingle(r,g,b,addr) : LED.setAll(r,g,b,addr);
  }
}

['r-sl','g-sl','b-sl'].forEach(id=>$(id).addEventListener('input',applyRGB));
$('color-picker').addEventListener('input', e => {
  const {r,g,b}=LED.hexToRgb(e.target.value);
  $('r-sl').value=r; $('g-sl').value=g; $('b-sl').value=b; applyRGB();
});
$('btn-reset-led').addEventListener('click', () => {
  const sel = $('led-target').value;
  const entries = [...deviceMap.values()];
  const a1 = entries.find(d=>d.index===0)?.address ?? null;
  const a2 = entries.find(d=>d.index===1)?.address ?? null;
  LED.reset(a1);
  if (sel === 'both' && a2) BLE.send(Cmd.ledSingle(-1,0,0,0), a2);
  ['r-sl','g-sl','b-sl'].forEach(id=>$(id).value=0);
  ['r-val','g-val','b-val'].forEach(id=>$(id).textContent=0);
  $('color-picker').value='#000000'; $('color-preview').style.background='#000';
});

// ── 姿態圖：兩段連在一起，像你畫的圖 ───────────────
// 固定點在左，第一段（裝置1=大腿）往右，
// 在連接點接第二段（裝置2=小腿）繼續延伸
// pitch > 0 = 往上抬，pitch < 0 = 往下
const aCvs = $('attitudeCanvas');
const aCtx = aCvs.getContext('2d');
const SEG_LEN = 80; // 每段長度

function drawLeg() {
  const w = aCvs.width, h = aCvs.height;
  aCtx.clearRect(0, 0, w, h);

  const s0 = statusDev[0];
  const s1 = statusDev[1];

  // 固定點（左側中間）
  const ox = 28, oy = h / 2;

  // 第一段角度（裝置1）：pitch正值往上 → dy為負
  const a1 = s0 ? calcAngleCorrect(s0).pitch : 0;
  const rad1 = a1 * Math.PI / 180;
  const p1x = ox + SEG_LEN * Math.cos(-rad1);
  const p1y = oy + SEG_LEN * Math.sin(-rad1);  // 往上是負y

  // 第二段角度（裝置2）：從連接點繼續，角度是絕對角度
  const a2 = s1 ? calcAngleCorrect(s1).pitch : 0;
  const rad2 = a2 * Math.PI / 180;
  const p2x = p1x + SEG_LEN * Math.cos(-rad2);
  const p2y = p1y + SEG_LEN * Math.sin(-rad2);

  // ── 畫第一段（裝置1，藍）
  const c1 = s0 ? '#2563eb' : '#cbd5e1';
  aCtx.lineCap = 'round';
  aCtx.strokeStyle = c1; aCtx.lineWidth = 8;
  aCtx.beginPath(); aCtx.moveTo(ox, oy); aCtx.lineTo(p1x, p1y); aCtx.stroke();

  // 裝置1 小黑盤圓點（中間）
  const m1x = (ox+p1x)/2, m1y = (oy+p1y)/2;
  aCtx.beginPath(); aCtx.arc(m1x, m1y, 5, 0, Math.PI*2);
  aCtx.fillStyle = s0 ? '#fff' : '#e2e8f0'; aCtx.fill();
  aCtx.strokeStyle = c1; aCtx.lineWidth = 2; aCtx.stroke();

  // ── 畫第二段（裝置2，綠）
  const c2 = s1 ? '#059669' : '#cbd5e1';
  aCtx.strokeStyle = c2; aCtx.lineWidth = 8;
  aCtx.beginPath(); aCtx.moveTo(p1x, p1y); aCtx.lineTo(p2x, p2y); aCtx.stroke();

  // 裝置2 小黑盤圓點（中間）
  const m2x = (p1x+p2x)/2, m2y = (p1y+p2y)/2;
  aCtx.beginPath(); aCtx.arc(m2x, m2y, 5, 0, Math.PI*2);
  aCtx.fillStyle = s1 ? '#fff' : '#e2e8f0'; aCtx.fill();
  aCtx.strokeStyle = c2; aCtx.lineWidth = 2; aCtx.stroke();

  // ── 關節點
  // 固定點
  aCtx.beginPath(); aCtx.arc(ox, oy, 6, 0, Math.PI*2);
  aCtx.fillStyle = '#475569'; aCtx.fill();
  aCtx.beginPath(); aCtx.arc(ox, oy, 9, 0, Math.PI*2);
  aCtx.strokeStyle = '#94a3b8'; aCtx.lineWidth = 2; aCtx.stroke();

  // 連接點（膝）
  aCtx.beginPath(); aCtx.arc(p1x, p1y, 5, 0, Math.PI*2);
  aCtx.fillStyle = '#475569'; aCtx.fill();

  // 末端點
  aCtx.beginPath(); aCtx.arc(p2x, p2y, 5, 0, Math.PI*2);
  aCtx.fillStyle = '#475569'; aCtx.fill();

  // ── 角度標示
  aCtx.font = 'bold 9px Inter';

  // 裝置1
  aCtx.fillStyle = s0 ? '#2563eb' : '#94a3b8';
  aCtx.textAlign = 'center';
  aCtx.fillText(s0 ? `裝置1: ${a1}°` : '裝置1: 未連線', m1x, m1y - 10);

  // 裝置2
  aCtx.fillStyle = s1 ? '#059669' : '#94a3b8';
  aCtx.fillText(s1 ? `裝置2: ${a2}°` : '裝置2: 未連線', m2x, m2y + 18);

  // 夾角
  if (s0 && s1) {
    const joint = Math.abs(a1 - a2).toFixed(1);
    aCtx.fillStyle = '#dc2626';
    aCtx.font = 'bold 10px Inter';
    aCtx.textAlign = 'right';
    aCtx.fillText(`夾角 ${joint}°`, w - 6, 14);
  }
}
drawLeg();

// ── Canvas DPI 初始化（避免模糊）──────────────────
function initCanvasDPI(canvas, ctx) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width  = Math.round(rect.width  * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.scale(dpr, dpr);
}
// 頁面載入後初始化
window.addEventListener('load', () => {
  initCanvasDPI(cCvs, cCtx);
  drawChart();
});

// ── 折線圖 ────────────────────────────────────────
const cCvs = $('chartCanvas');
const cCtx = cCvs.getContext('2d');

function drawChart(targetCtx) {
  const ctx2 = targetCtx || cCtx;
  // DPI 修正：讓 canvas 解析度符合實際顯示大小
  if (!targetCtx) {
    const dpr = window.devicePixelRatio || 1;
    const rect = cCvs.getBoundingClientRect();
    if (cCvs.width !== Math.round(rect.width * dpr)) {
      cCvs.width  = Math.round(rect.width  * dpr);
      cCvs.height = Math.round(rect.height * dpr);
      cCtx.scale(dpr, dpr);
    }
  }
  const w = targetCtx ? cCvs.width : cCvs.getBoundingClientRect().width;
  const h = targetCtx ? cCvs.height : cCvs.getBoundingClientRect().height;
  ctx2.clearRect(0, 0, w, h);

  const PAD_L=28, PAD_R=6, PAD_T=14, PAD_B=18;
  const cw=w-PAD_L-PAD_R, ch=h-PAD_T-PAD_B;

  if (angleLog.length < 2) {
    ctx2.fillStyle='#94a3b8'; ctx2.font='9px Inter'; ctx2.textAlign='center';
    ctx2.fillText('開始紀錄後顯示折線圖', w/2, h/2+4);
    return;
  }

  const data = angleLog.slice(-80);
  const n = data.length;
  const series = [
    { key:'dp1',    color:'#3b82f6', label:'裝置1變化' },
    { key:'dp2',    color:'#10b981', label:'裝置2變化' },
    { key:'djoint', color:'#f59e0b', label:'夾角變化'  },
  ];

  // y 範圍對稱
  let yAbs = 10;
  data.forEach(d => series.forEach(s => { yAbs = Math.max(yAbs, Math.abs(d[s.key])); }));
  yAbs = Math.ceil(yAbs / 5) * 5; // 取5的倍數
  const yLo = -yAbs, yHi = yAbs;

  const toX = i => PAD_L + (n > 1 ? (i/(n-1))*cw : cw/2);
  const toY = v => PAD_T + ch - ((v-yLo)/(yHi-yLo))*ch;

  // 格線
  [-yAbs, -yAbs/2, 0, yAbs/2, yAbs].forEach(v => {
    const y = toY(v);
    ctx2.strokeStyle = v === 0 ? '#94a3b8' : '#e2e6ec';
    ctx2.lineWidth   = v === 0 ? 1.5 : 0.8;
    ctx2.setLineDash(v === 0 ? [] : [3,3]);
    ctx2.beginPath(); ctx2.moveTo(PAD_L, y); ctx2.lineTo(w-PAD_R, y); ctx2.stroke();
    ctx2.setLineDash([]);
    ctx2.fillStyle='#94a3b8'; ctx2.font='7px Inter'; ctx2.textAlign='right';
    ctx2.fillText(`${v>0?'+':''}${v}°`, PAD_L-3, y+3);
  });

  // x 軸時間標籤（每隔幾筆顯示一個時間）
  ctx2.fillStyle = '#94a3b8'; ctx2.font = '7px Inter'; ctx2.textAlign = 'center';
  const step = Math.max(1, Math.floor(n / 5)); // 最多顯示 5 個時間標籤
  for (let i = 0; i < n; i += step) {
    const x = toX(i);
    const y = PAD_T + ch + 10;
    ctx2.fillText(data[i].time, x, y);
    // 小刻度線
    ctx2.strokeStyle = '#e2e6ec'; ctx2.lineWidth = 0.5;
    ctx2.beginPath(); ctx2.moveTo(x, PAD_T + ch); ctx2.lineTo(x, PAD_T + ch + 4); ctx2.stroke();
  }
  // 最後一筆也顯示
  if ((n - 1) % step !== 0) {
    ctx2.fillText(data[n-1].time, toX(n-1), PAD_T + ch + 10);
  }

  // 折線
  series.forEach(({ key, color }) => {
    ctx2.strokeStyle=color; ctx2.lineWidth=1.2; ctx2.lineJoin='round';
    ctx2.beginPath();
    data.forEach((d,i) => {
      i===0 ? ctx2.moveTo(toX(i),toY(d[key])) : ctx2.lineTo(toX(i),toY(d[key]));
    });
    ctx2.stroke();
    // 最新值圓點
    const last = data[n-1];
    ctx2.beginPath(); ctx2.arc(toX(n-1), toY(last[key]), 3, 0, Math.PI*2);
    ctx2.fillStyle=color; ctx2.fill();
  });

  // 圖例
  let lx = PAD_L;
  series.forEach(({ color, label }) => {
    ctx2.fillStyle=color; ctx2.fillRect(lx, 3, 10, 3);
    ctx2.fillStyle='#475569'; ctx2.font='7px Inter'; ctx2.textAlign='left';
    ctx2.fillText(label, lx+12, 8); lx += 52;
  });
}

$('btn-rec').addEventListener('click', () => {
  isRecording = !isRecording;
  $('btn-rec').classList.toggle('recording', isRecording);
  $('btn-rec').textContent = isRecording ? '■ 停止' : '● 紀錄';

  if (isRecording) {
    // 立即記一筆，然後按間隔繼續
    addLogRow();
    const ms = (+$('rec-interval').value || 1) * 1000;
    recInterval = setInterval(addLogRow, ms);
  } else {
    clearInterval(recInterval);
    recInterval = null;
    if (angleLog.length === 0)
      $('log-body').innerHTML = '<div class="empty-hint">尚未開始紀錄</div>';
  }
});

// 間隔改變時如果正在記錄，重新啟動 interval
$('rec-interval').addEventListener('change', () => {
  if (!isRecording) return;
  clearInterval(recInterval);
  const ms = (+$('rec-interval').value || 1) * 1000;
  recInterval = setInterval(addLogRow, ms);
});
function addLogRow() {
  const s0=statusDev[0], s1=statusDev[1];
  const t=new Date();
  const time=[t.getHours(),t.getMinutes(),t.getSeconds()].map(n=>String(n).padStart(2,'0')).join(':');
  const {pitch:p1} = s0 ? calcAngleCorrect(s0) : {pitch:0};
  const {pitch:p2} = s1 ? calcAngleCorrect(s1) : {pitch:0};
  const joint = +(p1 - p2).toFixed(1); // 有正負號的夾角，不取絕對值

  const base = zeroBase ?? { p1, p2, joint:0 };
  const dp1   = +(p1 - base.p1).toFixed(1);
  const dp2   = +(p2 - base.p2).toFixed(1);
  const djoint = +(joint - (base.p1 - base.p2)).toFixed(1);

  angleLog.push({ time, p1, p2, joint, dp1, dp2, djoint });

  const body=$('log-body');
  if (body.querySelector('.empty-hint')) body.innerHTML='';
  const row=document.createElement('div'); row.className='log-row';
  const fmt = (v, color) => `<span style="font-variant-numeric:tabular-nums;color:${color}">${v>=0?'+':''}${v}°</span>`;
  row.innerHTML=
    `<span>${time}</span>` +
    fmt(dp1, dp1===0?'var(--text3)':dp1>0?'#2563eb':'#dc2626') +
    fmt(dp2, dp2===0?'var(--text3)':dp2>0?'#059669':'#dc2626') +
    fmt(djoint, Math.abs(djoint)<1?'var(--text3)':'#d97706') +
    `<span style="color:var(--text3)">${p1}°</span>` +
    `<span style="color:var(--text3)">${p2}°</span>`;
  body.appendChild(row); body.scrollTop=body.scrollHeight;
  drawChart();
}

// ── 下載工具：電腦用一般下載，iPad/iPhone 用分享選單 ─────────
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

async function saveBlob(blob, filename) {
  // iPad / iPhone：不支援 download 屬性，改用分享選單（可存到「檔案」）
  if (isIOS && navigator.canShare) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename }); return; }
      catch (e) { if (e.name === 'AbortError') return; /* 其他錯誤就往下試一般下載 */ }
    }
  }
  // 一般下載：<a> 要先放進頁面再點，而且不能馬上釋放網址
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

$('btn-export').addEventListener('click', () => {
  if (!angleLog.length) return;
  const csv = 'time,delta_p1,delta_p2,delta_joint,abs_p1,abs_p2,abs_joint\n' +
    angleLog.map(r => `${r.time},${r.dp1},${r.dp2},${r.djoint},${r.p1},${r.p2},${r.joint}`).join('\n');
  // 前面加 BOM，Excel 開啟才不會亂碼
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  saveBlob(blob, `oplate_${Date.now()}.csv`);
});

$('btn-export-chart').addEventListener('click', () => {
  if (angleLog.length < 2) return;
  const scale = 2;
  const offscreen = document.createElement('canvas');
  offscreen.width  = cCvs.width  * scale;
  offscreen.height = cCvs.height * scale;
  const offCtx = offscreen.getContext('2d');
  offCtx.scale(scale, scale);
  offCtx.fillStyle = '#ffffff';
  offCtx.fillRect(0, 0, cCvs.width, cCvs.height);
  drawChart(offCtx);
  offscreen.toBlob(blob => {
    if (blob) saveBlob(blob, `oplate_chart_${Date.now()}.png`);
  }, 'image/png');
});
