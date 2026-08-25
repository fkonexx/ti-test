// ============================================================
//  ЧОТИРИ ІМПЕРІЇ (v2) — клієнт
// ============================================================
const socket = io();

const me = { index: -1, color: null, host: false, id: null, debug: false };
let W = 40, H = 40, biomes = null;
let st = null;                       // останній зріз стану (моя перспектива)
let CELL = 30;
let camX = 0, camY = 0, camInit = false;
let canvas, ctx, DPR = 1;

const renderU = {};                  // згладжені позиції юнітів
let effects = [];

const sel = { units: new Set(), building: null, scout: false };
let buildMode = null, attackMode = false;
let buildable = null;                // Set клітинок для підсвітки в режимі будівництва

const COL = { red: '#ff5a5a', blue: '#5a8cff', green: '#4ad07a', yellow: '#f5c542' };
const COL_SOFT = { red: 'rgba(255,90,90,.28)', blue: 'rgba(90,140,255,.28)', green: 'rgba(74,208,122,.28)', yellow: 'rgba(245,197,66,.28)' };
const IDX = ['red', 'blue', 'green', 'yellow'];
const BIOME_COL = ['#565c6b', '#3f5e3a', '#26402c'];    // гори / рівнина / ліс
const CNAME = { red: 'червона', blue: 'синя', green: 'зелена', yellow: 'жовта' };

const TECH = [
  ['construction', 'Будівництво', 'відкриває споруди'],
  ['army', 'Армія', 'відкриває воїнів'],
  ['influence', 'Вплив', 'ширша зона будівництва'],
  ['mining', 'Шахтарство', '+ камінь із шахт'],
  ['lumber', 'Лісорубство', '+ дерево з лісорубок'],
  ['farming', 'Фермерство', '+ їжа з ферм'],
  ['warfare', 'Військова справа', '+ шкода й HP воїнів'],
  ['defense', 'Захист', '+ HP споруд'],
  ['scouting', 'Розвідка', 'швидший розвідник, більший зір'],
  ['engineering', 'Інженерія', 'швидші жетони'],
];
const UNIT_INFO = [
  ['sword', 'Мечник', 1, 'їжа 15 · золото 10'],
  ['archer', 'Лучниця', 1, 'їжа 12 · золото 14'],
  ['mage', 'Маг', 2, 'їжа 10 · золото 22'],
  ['assassin', 'Ассасін', 3, 'їжа 14 · золото 20'],
  ['catapult', 'Катапульта', 4, 'їжа 20 · золото 35'],
  ['ram', 'Таран', 5, 'їжа 22 · золото 30'],
];
const BUILD_INFO = [
  ['mine', 'Шахта', 1, 'камінь'],
  ['lumber', 'Лісорубка', 1, 'дерево'],
  ['farm', 'Ферма', 1, 'їжа'],
  ['barracks', 'Казарма', 2, 'воїни'],
  ['tower', 'Вежа', 3, 'захист'],
  ['cannon', 'Пушка', 4, 'захист+'],
  ['landmine', 'Міна', 5, 'пастка'],
];
const BNAME = { guild: 'Гільдія', mine: 'Шахта', lumber: 'Лісорубка', farm: 'Ферма', barracks: 'Казарма', tower: 'Вежа', cannon: 'Пушка', landmine: 'Міна' };

let el = {};
window.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  el = {
    menu: $('menu'), lobby: $('lobby'), game: $('game'),
    name: $('nameInput'), code: $('codeInput'),
    roomCode: $('roomCode'), playerList: $('playerList'), startBtn: $('startBtn'), lobbyHint: $('lobbyHint'),
    res: $('res'), banner: $('banner'), tokens: $('tokTop'),
    unitMenu: $('unitMenu'), buildMenu: $('buildMenu'), techPanel: $('techPanel'), techList: $('techList'),
    overlay: $('overlay'), overTitle: $('overTitle'),
  };
  $('createBtn').onclick = () => socket.emit('createRoom', { name: el.name.value });
  $('joinBtn').onclick = () => { const c = el.code.value.trim().toUpperCase(); if (c) socket.emit('joinRoom', { code: c, name: el.name.value }); };
  el.startBtn.onclick = () => socket.emit('startGame');
  $('againBtn').onclick = () => location.reload();
  $('fsBtn').onclick = toggleFullscreen;

  $('armyBtn').onclick = () => { selectAll(); flash($('armyBtn')); };
  $('makeBtn').onclick = () => toggle('unit');
  $('buildBtn').onclick = () => toggle('build');
  $('attackBtn').onclick = () => { attackMode = !attackMode; buildMode = null; buildable = null; closeMenus(); if (attackMode && sel.units.size === 0) selectAll(); modes(); };
  $('scoutBtn').onclick = () => { selectScout(); flash($('scoutBtn')); };
  $('techBtn').onclick = () => { closeMenus(); el.techPanel.classList.toggle('hidden'); renderTech(); };
  $('techClose').onclick = () => el.techPanel.classList.add('hidden');

  el.unitMenu.querySelectorAll('button').forEach(b => b.onclick = () => produce(b.dataset.u));
  el.buildMenu.querySelectorAll('button').forEach(b => b.onclick = () => { buildMode = b.dataset.b; attackMode = false; closeMenus(); computeBuildable(); modes(); });

  setupCanvas();
});

// ---------- сокет ----------
socket.on('connect', () => { me.id = socket.id; });
socket.on('joined', d => { me.index = d.index; me.color = d.color; me.host = d.host; if (d.debug) { me.debug = true; return; } show('lobby'); });
socket.on('empireSwitched', d => { me.index = d.index; me.color = d.color; sel.units.clear(); sel.building = null; sel.scout = false; buildMode = null; attackMode = false; buildable = null; modes(); camInit = false; updateRes(); updateDbg(); });
socket.on('lobby', d => {
  me.host = (d.host === socket.id);
  el.roomCode.textContent = d.code;
  el.playerList.innerHTML = '';
  d.players.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="dot ${p.color}"></span>${p.name}` + (p.id === d.host ? '<span class="badge">господар</span>' : (p.connected ? '' : '<span class="badge">офлайн</span>'));
    el.playerList.appendChild(li);
  });
  const enough = d.players.length >= 2;
  el.startBtn.disabled = !(me.host && enough && !d.started);
  el.startBtn.style.display = me.host ? 'block' : 'none';
  el.lobbyHint.textContent = me.host ? (enough ? 'Можна починати!' : 'Чекаємо гравців… (мін. 2, макс. 4)') : 'Чекаємо, поки господар почне гру…';
});
socket.on('errorMsg', m => alert(m));
socket.on('gameStarted', d => { W = d.W; H = d.H; biomes = d.biomes; show('game'); resize(); if (me.debug) createDbg(); requestAnimationFrame(draw); });
socket.on('state', s => onState(s));

// ---------- екрани ----------
function show(name) { el.menu.classList.add('hidden'); el.lobby.classList.add('hidden'); el.game.classList.add('hidden'); el[name].classList.remove('hidden'); }

// ---------- стан ----------
function onState(s) {
  st = s;
  const alive = new Set(s.units.map(u => u.i));
  for (const id in renderU) { if (!alive.has(+id)) { const u = renderU[id]; if (!u.s) effects.push({ x: u.x, y: u.y, t: 0, c: COL[IDX[u.o]] }); delete renderU[id]; } }
  for (const u of s.units) { let r = renderU[u.i]; if (!r) { r = { x: u.x, y: u.y }; renderU[u.i] = r; } r.tx = u.x; r.ty = u.y; r.o = u.o; r.t = u.t; r.h = u.h; r.m = u.m; r.s = u.s; }
  for (const id of [...sel.units]) if (!alive.has(id)) sel.units.delete(id);
  if (!camInit) { centerOnGuild(); camInit = true; }
  updateRes();
  if (el.techPanel && !el.techPanel.classList.contains('hidden')) renderTech();
  if (s.winner !== null && !me.debug) showWin(s.winner);
}
function centerOnGuild() {
  if (!st) return;
  const g = st.buildings.find(b => b.o === me.index && b.t === 'guild');
  if (!g) return;
  camX = window.innerWidth / 2 - (g.x * CELL + CELL / 2);
  camY = window.innerHeight / 2 - (g.y * CELL + CELL / 2);
}
function updateRes() {
  if (!st || !st.me) return;
  const r = st.me.res;
  el.res.innerHTML =
    chip('🌲', r.wood) + chip('⛏', r.stone) + chip('🍞', r.food) + chip('💰', r.gold) +
    chip('🔧', r.tokens) + chip('🏛', 'ур.' + st.me.guildLevel);
  if (st.me.alive === false && st.winner === null) banner('Вашу гільдію знищено');
}
function chip(ic, v) { return `<span class="chip">${ic}<b>${v}</b></span>`; }

// ---------- керування ----------
function myUnits() { return st ? st.units.filter(u => u.o === me.index && !u.s) : []; }
function selectAll() { sel.units = new Set(myUnits().map(u => u.i)); sel.building = null; sel.scout = false; }
function selectScout() { const sc = st && st.units.find(u => u.o === me.index && u.s); if (sc) { sel.units = new Set([sc.i]); sel.scout = true; sel.building = null; banner('Розвідник обрано — тапни, куди йти'); } }
function guildId() { const g = st && st.buildings.find(b => b.o === me.index && b.t === 'guild'); return g ? g.i : null; }
function produce(type) {
  const b = (sel.building != null) ? sel.building : guildId();
  if (b == null) return;
  socket.emit('command', { type: 'produce', building: b, unit: type });
}
function sendMove(col, row) { if (sel.units.size) socket.emit('command', { type: 'move', ids: [...sel.units], x: col, y: row }); }

function toggle(which) {
  const u = which === 'unit';
  const showU = u && el.unitMenu.classList.contains('hidden');
  const showB = !u && el.buildMenu.classList.contains('hidden');
  closeMenus();
  if (showU) { refreshUnitMenu(); el.unitMenu.classList.remove('hidden'); }
  if (showB) { refreshBuildMenu(); el.buildMenu.classList.remove('hidden'); }
}
function closeMenus() { el.unitMenu.classList.add('hidden'); el.buildMenu.classList.add('hidden'); el.techPanel && el.techPanel.classList.add('hidden'); }
function refreshUnitMenu() {
  const lvl = st && st.me ? st.me.tech.army : 0;
  el.unitMenu.innerHTML = UNIT_INFO.map(([k, n, req, c]) =>
    `<button class="btn s" data-u="${k}" ${lvl < req ? 'disabled' : ''}>${n}<small>${lvl < req ? '🔒 Армія ' + req : c}</small></button>`).join('');
  el.unitMenu.querySelectorAll('button').forEach(b => b.onclick = () => produce(b.dataset.u));
}
function refreshBuildMenu() {
  const lvl = st && st.me ? st.me.tech.construction : 0;
  el.buildMenu.innerHTML = BUILD_INFO.map(([k, n, req, c]) =>
    `<button class="btn s" data-b="${k}" ${lvl < req ? 'disabled' : ''}>${n}<small>${lvl < req ? '🔒 Будів. ' + req : c}</small></button>`).join('');
  el.buildMenu.querySelectorAll('button').forEach(b => b.onclick = () => { buildMode = b.dataset.b; attackMode = false; closeMenus(); computeBuildable(); modes(); });
}
function modes() {
  document.getElementById('attackBtn').classList.toggle('on', attackMode);
  document.getElementById('buildBtn').classList.toggle('on', !!buildMode);
  if (attackMode) banner('Тапни ціль — військо піде в атаку');
  else if (buildMode) banner('Тапни підсвічену клітинку, щоб побудувати «' + BNAME[buildMode] + '»');
  else hideBanner();
}
function computeBuildable() {
  buildable = new Set();
  if (!st) return;
  const rad = 2 + (st.me ? st.me.tech.influence : 0);
  for (let i = 0; i < W * H; i++) if (st.grid[i] === me.index) {
    const c = i % W, r = (i / W) | 0;
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const nc = c + dx, nr = r + dy;
      if (nc >= 0 && nc < W && nr >= 0 && nr < H) buildable.add(nr * W + nc);
    }
  }
}

let bannerTimer = null;
function banner(t) { el.banner.textContent = t; el.banner.classList.remove('hidden'); if (!attackMode && !buildMode) { clearTimeout(bannerTimer); bannerTimer = setTimeout(hideBanner, 1700); } }
function hideBanner() { if (!attackMode && !buildMode) el.banner.classList.add('hidden'); }
function flash(b) { b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 150); }

// ---------- панель технологій ----------
function renderTech() {
  if (!st || !st.me) return;
  const tk = st.me.res.tokens;
  el.tokens.textContent = tk;
  el.techList.innerHTML = TECH.map(([k, n, d]) => {
    const lvl = st.me.tech[k];
    const stars = '★'.repeat(lvl) + '☆'.repeat(5 - lvl);
    const cost = lvl + 1;
    const dis = lvl >= 5 || tk < cost;
    const label = lvl >= 5 ? 'МАКС' : ('−' + cost + ' 🔧');
    return `<div class="techrow"><div class="ti"><b>${n}</b><small>${d}</small><span class="stars">${stars}</span></div>
      <button class="btn tbuy" data-k="${k}" ${dis ? 'disabled' : ''}>${label}</button></div>`;
  }).join('');
  el.techList.querySelectorAll('.tbuy').forEach(b => b.onclick = () => { socket.emit('command', { type: 'tech', branch: b.dataset.k }); });
}

// ---------- CANVAS ----------
function setupCanvas() {
  canvas = document.getElementById('cv'); ctx = canvas.getContext('2d');
  window.addEventListener('resize', resize); resize();
  let down = false, moved = false, sx = 0, sy = 0, lx = 0, ly = 0;
  canvas.addEventListener('pointerdown', e => { down = true; moved = false; sx = lx = e.clientX; sy = ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (!down) return; camX += e.clientX - lx; camY += e.clientY - ly; lx = e.clientX; ly = e.clientY; if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 10) moved = true; });
  canvas.addEventListener('pointerup', e => { down = false; if (!moved) tap(e.clientX, e.clientY); });
}
function resize() { DPR = Math.min(window.devicePixelRatio || 1, 2); canvas.width = innerWidth * DPR; canvas.height = innerHeight * DPR; }

function tap(px, py) {
  if (!st) return;
  const col = Math.floor((px - camX) / CELL), row = Math.floor((py - camY) / CELL);
  if (col < 0 || col >= W || row < 0 || row >= H) return;

  if (buildMode) { socket.emit('command', { type: 'build', build: buildMode, cx: col, cy: row }); buildMode = null; buildable = null; modes(); return; }
  if (attackMode) { if (sel.units.size === 0) selectAll(); sendMove(col, row); attackMode = false; modes(); return; }

  const b = st.buildings.find(bb => bb.x === col && bb.y === row);
  if (b && b.o === me.index) { sel.building = b.i; sel.units.clear(); sel.scout = false; banner(BNAME[b.t] + ' обрано'); return; }

  const ids = st.units.filter(u => u.o === me.index && !u.s && Math.round(u.x) === col && Math.round(u.y) === row).map(u => u.i);
  if (ids.length) { sel.units = new Set(ids); sel.building = null; sel.scout = false; return; }

  if (sel.units.size) sendMove(col, row);
}

// ---------- МАЛЮВАННЯ ----------
function draw() {
  requestAnimationFrame(draw);
  if (!canvas) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  if (!st || !biomes) return;
  for (const id in renderU) { const r = renderU[id]; r.x += (r.tx - r.x) * 0.25; r.y += (r.ty - r.y) * 0.25; }

  ctx.save(); ctx.translate(camX, camY);
  drawTiles(); drawBuildings(); drawUnits(); drawEffects();
  ctx.restore();

  for (const e of effects) e.t += 1 / 60;
  effects = effects.filter(e => e.t < 0.5);
}

function drawTiles() {
  const g = st.grid;
  // видима частина (обрізаємо за камерою для швидкості)
  const c0 = Math.max(0, Math.floor(-camX / CELL)), c1 = Math.min(W, Math.ceil((innerWidth - camX) / CELL));
  const r0 = Math.max(0, Math.floor(-camY / CELL)), r1 = Math.min(H, Math.ceil((innerHeight - camY) / CELL));
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
    const i = r * W + c, o = g[i], x = c * CELL, y = r * CELL;
    if (o === -2) { ctx.fillStyle = '#0a0c10'; ctx.fillRect(x, y, CELL, CELL); continue; } // туман
    ctx.fillStyle = BIOME_COL[biomes[i]]; ctx.fillRect(x, y, CELL, CELL);
    if (o >= 0) { ctx.fillStyle = COL_SOFT[IDX[o]]; ctx.fillRect(x, y, CELL, CELL); }
    if (buildMode && buildable && buildable.has(i)) { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x, y, CELL, CELL); }
  }
  ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let c = c0; c <= c1; c++) { ctx.moveTo(c * CELL, r0 * CELL); ctx.lineTo(c * CELL, r1 * CELL); }
  for (let r = r0; r <= r1; r++) { ctx.moveTo(c0 * CELL, r * CELL); ctx.lineTo(c1 * CELL, r * CELL); }
  ctx.stroke();
}

function drawBuildings() {
  for (const b of st.buildings) {
    const x = b.x * CELL + CELL / 2, y = b.y * CELL + CELL / 2, c = COL[IDX[b.o]];
    ctx.save(); ctx.translate(x, y);
    if (b.t === 'guild') { const s = CELL * 0.44; ctx.fillStyle = c; ctx.fillRect(-s, -s, s * 2, s * 2); ctx.fillStyle = '#0d1017'; star(0, 0, CELL * 0.26, CELL * 0.12, 5); }
    else if (b.t === 'mine') { rect(c, CELL * 0.32); ctx.fillStyle = '#0d1017'; tri(0, -CELL * 0.14, CELL * 0.16); }
    else if (b.t === 'lumber') { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, CELL * 0.3, 0, 7); ctx.fill(); ctx.strokeStyle = '#0d1017'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -CELL * 0.3); ctx.lineTo(0, CELL * 0.3); ctx.stroke(); }
    else if (b.t === 'farm') { rect(c, CELL * 0.3); ctx.fillStyle = '#0d1017'; ctx.fillRect(-CELL * 0.24, -2, CELL * 0.48, 2); ctx.fillRect(-CELL * 0.24, CELL * 0.12, CELL * 0.48, 2); }
    else if (b.t === 'barracks') { const s = CELL * 0.34; ctx.fillStyle = c; ctx.fillRect(-s, -s * 0.5, s * 2, s * 1.5); ctx.beginPath(); ctx.moveTo(-s, -s * 0.5); ctx.lineTo(0, -s); ctx.lineTo(s, -s * 0.5); ctx.closePath(); ctx.fill(); }
    else if (b.t === 'tower') { ring(c, BUILD_RANGE.tower); ctx.fillStyle = c; tri(0, 0, CELL * 0.34); }
    else if (b.t === 'cannon') { ring(c, BUILD_RANGE.cannon); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, CELL * 0.3, 0, 7); ctx.fill(); ctx.strokeStyle = '#0d1017'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(CELL * 0.32, -CELL * 0.2); ctx.stroke(); }
    else if (b.t === 'landmine') { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, CELL * 0.16, 0, 7); ctx.fill(); ctx.strokeStyle = c; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(0, 0, CELL * 0.28, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    ctx.restore();
    if (b.t !== 'landmine') hpBar(x, y - CELL * 0.5, b.h, b.m, CELL * 0.8);
  }
}
const BUILD_RANGE = { tower: 4.2, cannon: 6.0 };
function rect(c, s) { ctx.fillStyle = c; ctx.fillRect(-s, -s, s * 2, s * 2); }
function tri(cx, cy, s) { ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy + s); ctx.lineTo(cx - s, cy + s); ctx.closePath(); ctx.fill(); }
function ring(c, r) { ctx.strokeStyle = c + '44'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(0, 0, r * CELL, 0, 7); ctx.stroke(); ctx.setLineDash([]); }

function drawUnits() {
  for (const id in renderU) {
    const u = renderU[id], x = u.x * CELL + CELL / 2, y = u.y * CELL + CELL / 2, c = COL[IDX[u.o]];
    if (u.s) { // розвідник (лише свій) — око
      ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, CELL * 0.26, CELL * 0.16, 0, 0, 7); ctx.stroke();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, CELL * 0.07, 0, 7); ctx.fill();
      if (sel.scout && sel.units.has(+id)) { ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, CELL * 0.32, 0, 7); ctx.stroke(); }
      continue;
    }
    if (u.o === me.index && sel.units.has(+id)) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, CELL * 0.34, 0, 7); ctx.stroke(); }
    ctx.fillStyle = c;
    const t = u.t;
    if (t === 'sword') { ctx.beginPath(); ctx.arc(x, y, CELL * 0.22, 0, 7); ctx.fill(); }
    else if (t === 'archer') { ctx.beginPath(); ctx.arc(x, y, CELL * 0.19, 0, 7); ctx.fill(); ctx.fillStyle = '#0d1017'; tri(x, y + CELL * 0.02, CELL * 0.09); }
    else if (t === 'mage') { ctx.beginPath(); ctx.moveTo(x, y - CELL * 0.24); ctx.lineTo(x + CELL * 0.21, y); ctx.lineTo(x, y + CELL * 0.24); ctx.lineTo(x - CELL * 0.21, y); ctx.closePath(); ctx.fill(); }
    else if (t === 'assassin') { ctx.beginPath(); ctx.moveTo(x, y - CELL * 0.22); ctx.lineTo(x + CELL * 0.16, y + CELL * 0.18); ctx.lineTo(x - CELL * 0.16, y + CELL * 0.18); ctx.closePath(); ctx.fill(); }
    else if (t === 'catapult') { const s = CELL * 0.26; ctx.fillRect(x - s, y - s * 0.7, s * 2, s * 1.4); ctx.fillStyle = '#0d1017'; ctx.beginPath(); ctx.arc(x, y, s * 0.35, 0, 7); ctx.fill(); }
    else if (t === 'ram') { const s = CELL * 0.3; ctx.fillRect(x - s, y - s * 0.5, s * 2, s); ctx.fillStyle = '#0d1017'; ctx.fillRect(x + s * 0.5, y - s * 0.25, s * 0.6, s * 0.5); }
    if (u.m) hpBar(x, y - CELL * 0.34, u.h, u.m, CELL * 0.44);
  }
}
function hpBar(cx, top, hp, max, w) { if (hp >= max) return; const ratio = Math.max(0, hp / max), h = 3; ctx.fillStyle = '#000a'; ctx.fillRect(cx - w / 2, top - h, w, h); ctx.fillStyle = ratio > .5 ? '#4ad07a' : ratio > .25 ? '#f5c542' : '#ff5a5a'; ctx.fillRect(cx - w / 2, top - h, w * ratio, h); }
function drawEffects() {
  for (const e of effects) {
    const x = e.x * CELL + CELL / 2, y = e.y * CELL + CELL / 2, p = e.t / 0.5;
    ctx.globalAlpha = 1 - p; ctx.strokeStyle = e.c; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, CELL * (0.2 + p * 0.5), 0, 7); ctx.stroke();
    ctx.fillStyle = e.c; for (let i = 0; i < 6; i++) { const a = i / 6 * 7, d = CELL * p * 0.7; ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2.5 * (1 - p), 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
}
function star(cx, cy, R, r, n) { ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const rad = i % 2 ? r : R, a = i * Math.PI / n - Math.PI / 2; const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); ctx.fill(); }

// ---------- дебаг ----------
function createDbg() {
  if (document.getElementById('dbg')) return;
  const d = document.createElement('button'); d.id = 'dbg';
  d.style.cssText = 'position:fixed;top:96px;left:50%;transform:translateX(-50%);z-index:6;padding:9px 16px;border:none;border-radius:20px;font-weight:700;font-size:13px;box-shadow:0 6px 20px rgba(0,0,0,.45);color:#0d1017;';
  d.onclick = () => socket.emit('switchEmpire');
  document.getElementById('game').appendChild(d); updateDbg();
}
function updateDbg() { const d = document.getElementById('dbg'); if (!d) return; d.textContent = '🔧 Граю за: ' + (CNAME[me.color] || '') + ' ▸ змінити'; d.style.background = COL[me.color] || '#f5c542'; }

// ---------- інше ----------
function toggleFullscreen() { const de = document.documentElement; if (!document.fullscreenElement) (de.requestFullscreen || de.webkitRequestFullscreen || (()=>{})).call(de); else document.exitFullscreen && document.exitFullscreen(); }
function showWin(idx) { el.overlay.classList.remove('hidden'); if (idx === me.index) el.overTitle.textContent = '🏆 Перемога!'; else if (idx === -1) el.overTitle.textContent = 'Нічия'; else el.overTitle.innerHTML = `Переможець — <span style="color:${COL[IDX[idx]]}">${CNAME[IDX[idx]]}</span> імперія`; }
