// ============================================================
//  ТРИ ІМПЕРІЇ — клієнт
//  Малює гру на Canvas, ловить дотики, шле команди на сервер.
// ============================================================

const socket = io();

// -------- стан клієнта --------
const me = { index: -1, color: null, host: false, id: null };
let gameState = null;                 // останній стан із сервера
let CELL = 38;                        // розмір клітинки в пікселях
let camX = 0, camY = 0;               // зсув камери
let canvas, ctx, DPR = 1;

const renderU = {};                   // id -> {x,y,tx,ty,o,t,h,m}  згладжені позиції
let effects = [];                     // вибухи

const sel = { units: new Set(), building: null };
let buildMode = null;                 // 'mine' | 'barracks' | 'tower'
let attackMode = false;

const COL = { red: '#ff5a5a', blue: '#5a8cff', green: '#4ad07a' };
const COL_SOFT = { red: 'rgba(255,90,90,.16)', blue: 'rgba(90,140,255,.16)', green: 'rgba(74,208,122,.16)' };
const IDX = ['red', 'blue', 'green'];

// -------- посилання на DOM --------
let el = {};
window.addEventListener('DOMContentLoaded', () => {
  el = {
    menu: document.getElementById('menu'),
    lobby: document.getElementById('lobby'),
    game: document.getElementById('game'),
    name: document.getElementById('nameInput'),
    code: document.getElementById('codeInput'),
    roomCode: document.getElementById('roomCode'),
    playerList: document.getElementById('playerList'),
    startBtn: document.getElementById('startBtn'),
    lobbyHint: document.getElementById('lobbyHint'),
    hudGold: document.getElementById('hudGold'),
    hudUnits: document.getElementById('hudUnits'),
    hudRoom: document.getElementById('hudRoom'),
    hudColor: document.getElementById('hudColor'),
    banner: document.getElementById('banner'),
    unitMenu: document.getElementById('unitMenu'),
    buildMenu: document.getElementById('buildMenu'),
    overlay: document.getElementById('overlay'),
    overTitle: document.getElementById('overTitle'),
    armyBtn: document.getElementById('armyBtn'),
    makeBtn: document.getElementById('makeBtn'),
    buildBtn: document.getElementById('buildBtn'),
    attackBtn: document.getElementById('attackBtn'),
    againBtn: document.getElementById('againBtn'),
  };

  document.getElementById('createBtn').onclick = () =>
    socket.emit('createRoom', { name: el.name.value });
  document.getElementById('joinBtn').onclick = () => {
    const c = el.code.value.trim().toUpperCase();
    if (c) socket.emit('joinRoom', { code: c, name: el.name.value });
  };
  el.startBtn.onclick = () => socket.emit('startGame');
  el.againBtn.onclick = () => location.reload();

  // головні кнопки
  el.armyBtn.onclick = () => { selectAll(); flash(el.armyBtn); };
  el.makeBtn.onclick = () => toggleMenu('unit');
  el.buildBtn.onclick = () => toggleMenu('build');
  el.attackBtn.onclick = () => {
    attackMode = !attackMode; buildMode = null; closeMenus();
    if (attackMode && sel.units.size === 0) selectAll();
    updateModes();
  };

  el.unitMenu.querySelectorAll('button').forEach(b =>
    b.onclick = () => produce(b.dataset.unit));
  el.buildMenu.querySelectorAll('button').forEach(b =>
    b.onclick = () => { buildMode = b.dataset.build; attackMode = false; closeMenus(); updateModes(); });

  setupCanvas();
});

// -------- події сервера --------
socket.on('connect', () => { me.id = socket.id; });

socket.on('joined', d => {
  me.index = d.index; me.color = d.color; me.host = d.host;
  show('lobby');
});

socket.on('lobby', d => {
  me.host = (d.host === socket.id);
  el.roomCode.textContent = d.code;
  el.hudRoom.textContent = d.code;
  el.playerList.innerHTML = '';
  d.players.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="dot ${p.color}"></span>${p.name}` +
      (p.id === d.host ? '<span class="badge">господар</span>'
                       : (p.connected ? '' : '<span class="badge">офлайн</span>'));
    el.playerList.appendChild(li);
  });
  const enough = d.players.length >= 2;
  el.startBtn.disabled = !(me.host && enough && !d.started);
  el.startBtn.style.display = me.host ? 'block' : 'none';
  el.lobbyHint.textContent = me.host
    ? (enough ? 'Можна починати!' : 'Чекаємо на гравців… (мін. 2)')
    : 'Чекаємо, поки господар почне гру…';
});

socket.on('errorMsg', m => alert(m));

socket.on('gameStarted', () => { show('game'); resize(); requestAnimationFrame(draw); });

socket.on('state', s => onState(s));

// -------- перемикання екранів --------
function show(name) {
  el.menu.classList.add('hidden');
  el.lobby.classList.add('hidden');
  el.game.classList.add('hidden');
  el[name].classList.remove('hidden');
}

// -------- обробка стану --------
function onState(s) {
  gameState = s;
  const alive = new Set(s.units.map(u => u.i));

  // вибухи для тих, хто зник
  for (const id in renderU) {
    if (!alive.has(+id)) {
      const u = renderU[id];
      effects.push({ x: u.x, y: u.y, t: 0, c: COL[IDX[u.o]] });
      delete renderU[id];
    }
  }
  // оновлюємо цілі згладжування
  let first = false;
  for (const u of s.units) {
    let r = renderU[u.i];
    if (!r) { r = { x: u.x, y: u.y }; renderU[u.i] = r; if (me.index >= 0) first = true; }
    r.tx = u.x; r.ty = u.y; r.o = u.o; r.t = u.t; r.h = u.h; r.m = u.m;
  }
  // прибираємо з виділення мертвих
  for (const id of [...sel.units]) if (!alive.has(id)) sel.units.delete(id);

  // при першому стані центруємо камеру на своїй базі
  if (camX === 0 && camY === 0) centerOnBase();

  updateHUD();
  if (s.winner !== null) showWin(s.winner);
}

function centerOnBase() {
  if (!gameState) return;
  const b = gameState.buildings.find(bb => bb.o === me.index && bb.t === 'base');
  if (!b) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  camX = w / 2 - (b.x * CELL + CELL / 2);
  camY = h / 2 - (b.y * CELL + CELL / 2);
}

function updateHUD() {
  if (!gameState) return;
  const p = gameState.players.find(pp => pp.index === me.index);
  el.hudGold.textContent = p ? p.gold : 0;
  el.hudUnits.textContent = gameState.units.filter(u => u.o === me.index).length;
  el.hudColor.className = 'dot ' + (me.color || '');
  if (p && !p.alive && gameState.winner === null) banner('Вашу базу знищено');
}

// -------- КЕРУВАННЯ --------
function selectAll() {
  if (!gameState) return;
  sel.units = new Set(gameState.units.filter(u => u.o === me.index).map(u => u.i));
  sel.building = null;
}
function myBaseId() {
  const b = gameState && gameState.buildings.find(bb => bb.o === me.index && bb.t === 'base');
  return b ? b.i : null;
}
function produce(type) {
  const b = (sel.building != null) ? sel.building : myBaseId();
  if (b == null) return;
  socket.emit('command', { type: 'produce', building: b, unit: type });
}
function sendMove(col, row) {
  if (sel.units.size === 0) return;
  socket.emit('command', { type: 'move', ids: [...sel.units], x: col, y: row });
}

function toggleMenu(which) {
  const u = which === 'unit';
  const showU = u && el.unitMenu.classList.contains('hidden');
  const showB = !u && el.buildMenu.classList.contains('hidden');
  closeMenus();
  if (showU) el.unitMenu.classList.remove('hidden');
  if (showB) el.buildMenu.classList.remove('hidden');
}
function closeMenus() {
  el.unitMenu.classList.add('hidden');
  el.buildMenu.classList.add('hidden');
}
function updateModes() {
  el.attackBtn.classList.toggle('on', attackMode);
  el.buildBtn.classList.toggle('on', !!buildMode);
  if (attackMode) banner('Торкніться цілі — військо піде в атаку');
  else if (buildMode) banner('Торкніться своєї клітинки, щоб побудувати');
  else hideBanner();
}
let bannerTimer = null;
function banner(txt) {
  el.banner.textContent = txt; el.banner.classList.remove('hidden');
  if (!attackMode && !buildMode) { clearTimeout(bannerTimer); bannerTimer = setTimeout(hideBanner, 1600); }
}
function hideBanner() { if (!attackMode && !buildMode) el.banner.classList.add('hidden'); }
function flash(b) { b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 150); }

// -------- CANVAS + ДОТИКИ --------
function setupCanvas() {
  canvas = document.getElementById('cv');
  ctx = canvas.getContext('2d');
  window.addEventListener('resize', resize);
  resize();

  let down = false, moved = false, sx = 0, sy = 0, lx = 0, ly = 0;
  canvas.addEventListener('pointerdown', e => {
    down = true; moved = false;
    sx = lx = e.clientX; sy = ly = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!down) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    camX += dx; camY += dy; lx = e.clientX; ly = e.clientY;
    if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 10) moved = true;
  });
  canvas.addEventListener('pointerup', e => {
    down = false;
    if (!moved) handleTap(e.clientX, e.clientY);
  });
}
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * DPR;
  canvas.height = window.innerHeight * DPR;
}

function handleTap(px, py) {
  if (!gameState) return;
  const W = gameState.W, H = gameState.H;
  const col = Math.floor((px - camX) / CELL);
  const row = Math.floor((py - camY) / CELL);
  if (col < 0 || col >= W || row < 0 || row >= H) return;

  if (buildMode) {
    socket.emit('command', { type: 'build', build: buildMode, cx: col, cy: row });
    buildMode = null; updateModes(); return;
  }
  if (attackMode) {
    if (sel.units.size === 0) selectAll();
    sendMove(col, row); attackMode = false; updateModes(); return;
  }

  // 1) своя будівля -> вибрати
  const b = gameState.buildings.find(bb => bb.x === col && bb.y === row);
  if (b && b.o === me.index) { sel.building = b.i; sel.units.clear(); banner(bName(b.t) + ' обрано'); return; }

  // 2) свої юніти на клітинці -> вибрати
  const ids = gameState.units
    .filter(u => u.o === me.index && Math.round(u.x) === col && Math.round(u.y) === row)
    .map(u => u.i);
  if (ids.length) { sel.units = new Set(ids); sel.building = null; return; }

  // 3) інакше -> наказ руху обраному війську
  if (sel.units.size) sendMove(col, row);
}
function bName(t) { return { base: 'База', mine: 'Шахта', barracks: 'Казарма', tower: 'Вежа' }[t]; }

// -------- МАЛЮВАННЯ --------
function draw() {
  requestAnimationFrame(draw);
  if (!canvas) return;
  const w = window.innerWidth, h = window.innerHeight;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!gameState) return;

  // згладжування руху юнітів
  for (const id in renderU) {
    const r = renderU[id];
    r.x += (r.tx - r.x) * 0.25;
    r.y += (r.ty - r.y) * 0.25;
  }

  ctx.save();
  ctx.translate(camX, camY);
  drawBoard();
  drawBuildings();
  drawUnits();
  drawEffects();
  ctx.restore();

  for (const e of effects) e.t += 1 / 60;
  effects = effects.filter(e => e.t < 0.5);
}

function drawBoard() {
  const g = gameState.grid, W = gameState.W, H = gameState.H;
  // фон дошки
  ctx.fillStyle = '#12161f';
  ctx.fillRect(0, 0, W * CELL, H * CELL);
  // території
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const o = g[r * W + c];
    if (o >= 0) { ctx.fillStyle = COL_SOFT[IDX[o]]; ctx.fillRect(c * CELL, r * CELL, CELL, CELL); }
  }
  // сітка
  ctx.strokeStyle = 'rgba(255,255,255,.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 0; c <= W; c++) { ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, H * CELL); }
  for (let r = 0; r <= H; r++) { ctx.moveTo(0, r * CELL); ctx.lineTo(W * CELL, r * CELL); }
  ctx.stroke();
}

function drawBuildings() {
  for (const b of gameState.buildings) {
    const x = b.x * CELL + CELL / 2, y = b.y * CELL + CELL / 2;
    const c = COL[IDX[b.o]];
    ctx.save();
    ctx.translate(x, y);
    if (b.t === 'base') {
      const s = CELL * 0.42;
      ctx.fillStyle = c; ctx.fillRect(-s, -s, s * 2, s * 2);
      ctx.fillStyle = '#0d1017'; star(0, 0, CELL * 0.24, CELL * 0.11, 5);
    } else if (b.t === 'mine') {
      ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(0, -CELL * 0.34); ctx.lineTo(CELL * 0.34, 0);
      ctx.lineTo(0, CELL * 0.34); ctx.lineTo(-CELL * 0.34, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0d1017'; ctx.beginPath(); ctx.arc(0, 0, CELL * 0.1, 0, 7); ctx.fill();
    } else if (b.t === 'barracks') {
      const s = CELL * 0.34;
      ctx.fillStyle = c; ctx.fillRect(-s, -s * 0.5, s * 2, s * 1.5);
      ctx.beginPath(); ctx.moveTo(-s, -s * 0.5); ctx.lineTo(0, -s); ctx.lineTo(s, -s * 0.5); ctx.closePath(); ctx.fill();
    } else if (b.t === 'tower') {
      // радіус дії
      ctx.strokeStyle = c + '55'; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(0, 0, 3.6 * CELL, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(0, -CELL * 0.36); ctx.lineTo(CELL * 0.3, CELL * 0.3);
      ctx.lineTo(-CELL * 0.3, CELL * 0.3); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    hpBar(x, y - CELL * 0.5, b.h, b.m, CELL * 0.8);
  }
}

function drawUnits() {
  for (const id in renderU) {
    const u = renderU[id];
    const x = u.x * CELL + CELL / 2, y = u.y * CELL + CELL / 2;
    const c = COL[IDX[u.o]];
    const mine = (u.o === me.index) && sel.units.has(+id);
    if (mine) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, CELL * 0.34, 0, 7); ctx.stroke();
    }
    ctx.fillStyle = c;
    if (u.t === 'soldier') {
      ctx.beginPath(); ctx.arc(x, y, CELL * 0.2, 0, 7); ctx.fill();
    } else if (u.t === 'archer') {
      ctx.beginPath(); ctx.arc(x, y, CELL * 0.19, 0, 7); ctx.fill();
      ctx.fillStyle = '#0d1017'; ctx.beginPath();
      ctx.moveTo(x, y - CELL * 0.1); ctx.lineTo(x + CELL * 0.09, y + CELL * 0.07);
      ctx.lineTo(x - CELL * 0.09, y + CELL * 0.07); ctx.closePath(); ctx.fill();
    } else if (u.t === 'tank') {
      const s = CELL * 0.24;
      ctx.fillRect(x - s, y - s, s * 2, s * 2);
      ctx.fillStyle = '#0d1017'; ctx.fillRect(x - s * 0.4, y - s * 0.4, s * 0.8, s * 0.8);
    }
    hpBar(x, y - CELL * 0.32, u.h, u.m, CELL * 0.42);
  }
}

function hpBar(cx, topY, hp, max, w) {
  if (hp >= max) return;
  const ratio = Math.max(0, hp / max), h = 3;
  ctx.fillStyle = '#000a'; ctx.fillRect(cx - w / 2, topY - h, w, h);
  ctx.fillStyle = ratio > 0.5 ? '#4ad07a' : ratio > 0.25 ? '#f5c542' : '#ff5a5a';
  ctx.fillRect(cx - w / 2, topY - h, w * ratio, h);
}

function drawEffects() {
  for (const e of effects) {
    const x = e.x * CELL + CELL / 2, y = e.y * CELL + CELL / 2;
    const p = e.t / 0.5;
    ctx.globalAlpha = 1 - p;
    ctx.strokeStyle = e.c; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, CELL * (0.2 + p * 0.5), 0, 7); ctx.stroke();
    ctx.fillStyle = e.c;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * 7, d = CELL * p * 0.7;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2.5 * (1 - p), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function star(cx, cy, R, r, n) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 ? r : R, a = i * Math.PI / n - Math.PI / 2;
    const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill();
}

function showWin(idx) {
  el.overlay.classList.remove('hidden');
  if (idx === me.index) el.overTitle.textContent = '🏆 Перемога!';
  else if (idx === -1) el.overTitle.textContent = 'Нічия';
  else el.overTitle.innerHTML = `Переможець — <span style="color:${COL[IDX[idx]]}">${IDX[idx] === 'red' ? 'червона' : IDX[idx] === 'blue' ? 'синя' : 'зелена'}</span> імперія`;
}
