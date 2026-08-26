// ============================================================
//  ЧОТИРИ ІМПЕРІЇ — Balance v2 — клієнт
// ============================================================
const socket = io();
const me = { index: -1, color: null, host: false, id: null, debug: false };
let W = 130, H = 130, biomes = null, st = null, spawns = null;
let CELL = 26, camX = 0, camY = 0, camInit = false;
let canvas, ctx, DPR = 1;
let gridArr = null, seen = null, mem = null;
const renderU = {};
let effects = [], projectiles = [];
let darkness = 0, rain = 0;
let muted = false, selectMode = false;
const sel = { units: new Set(), building: null, scout: false };
let buildMode = null, attackMode = false, buildable = null;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function cheb(ax, ay, bx, by) { return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); }
function lerpAng(a, b, t) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; }

const COL = { red: '#ff5a5a', blue: '#5a8cff', green: '#4ad07a', yellow: '#f5c542' };
const COL_SOFT = { red: 'rgba(255,90,90,.30)', blue: 'rgba(90,140,255,.30)', green: 'rgba(74,208,122,.30)', yellow: 'rgba(245,197,66,.30)' };
const COL_FOG = { red: 'rgba(255,90,90,.12)', blue: 'rgba(90,140,255,.12)', green: 'rgba(74,208,122,.12)', yellow: 'rgba(245,197,66,.12)' };
const IDX = ['red', 'blue', 'green', 'yellow'];
const BIOME_COL = ['#5b616f', '#456a3f', '#2c4a33', '#1d4a3a', '#2a2018', '#5a4a6a', '#8a7320'];
const BIOME_DIM = ['#2c2f37', '#26361f', '#17281c', '#0f271f', '#16110c', '#2e263a', '#453a12'];
const RARE = { 3: '🌳', 4: '🌾', 5: '⛰', 6: '💰' };
const CNAME = { red: 'червона', blue: 'синя', green: 'зелена', yellow: 'жовта' };
const FLAG_RADIUS = 3;

const SPRITE_NAME = { guild: 'guild', mine: 'mine', lumber: 'wood', farm: 'farm', barracks: 'barn', tower: 'tower', cannon: 'canon', workshop: 'workshop', wall: 'wall', landmine: 'explosive', flag: 'flag', sword: 'sword', archer: 'archer', mage: 'mage', assassin: 'assassin', catapult: 'catapult', ram: 'ram', spear: 'spear', priest: 'healer', commander: 'commander', scout: 'peecker' };
const SPR = {};
for (const color of ['red', 'blue', 'green', 'yellow']) { SPR[color] = {}; for (const t in SPRITE_NAME) { const im = new Image(); im.src = 'assets/' + color + '_' + SPRITE_NAME[t] + '.png'; SPR[color][t] = im; } }
function sprite(color, type) { const im = SPR[color] && SPR[color][type]; return im && im.complete && im.naturalWidth ? im : null; }
const BSIZE = { guild: 2.2, mine: 1.7, lumber: 1.7, farm: 1.7, barracks: 1.8, wall: 1.3, tower: 1.6, cannon: 1.3, workshop: 1.8, landmine: 1.0, flag: 1.5 };
const USIZE = { commander: 1.4, ram: 1.35, catapult: 1.35, scout: 1.2, priest: 1.15 };

// баланс: має збігатися з сервером
const COST = { farm: { wood: 30, stone: 15, gold: 15 }, lumber: { wood: 15, stone: 30, gold: 15 }, mine: { wood: 35, stone: 15, gold: 15 }, barracks: { wood: 60, stone: 60, gold: 30 }, wall: { wood: 10, stone: 20 }, tower: { wood: 50, stone: 80, gold: 40 }, cannon: { wood: 70, stone: 120, gold: 70 }, workshop: { wood: 80, stone: 100, gold: 60 }, landmine: { wood: 10, stone: 35, gold: 20 } };
const FLAG_COST = { wood: 100, stone: 100, gold: 250 };
const UCOST = { sword: { food: 18, gold: 12 }, archer: { food: 16, gold: 16 }, mage: { food: 20, gold: 28 }, spear: { food: 22, gold: 20 }, priest: { food: 25, gold: 35 }, assassin: { food: 22, gold: 32 }, catapult: { food: 20, gold: 45, wood: 30, stone: 20 }, ram: { food: 20, gold: 50, wood: 50, stone: 30 }, commander: { food: 35, gold: 75 } };
const UNLOCK = { sword: 1, archer: 1, mage: 2, spear: 3, priest: 3, assassin: 4, catapult: 4, ram: 5, commander: 5 };
const TECH_COST = [1, 2, 3, 5, 7];
const TECH = [['construction', 'Будівництво', 'відкриває споруди'], ['army', 'Армія', 'відкриває воїнів'], ['influence', 'Вплив', 'ширша зона від гільдії'], ['mining', 'Шахтарство', '+ камінь'], ['lumber', 'Лісорубство', '+ дерево'], ['farming', 'Фермерство', '+ їжа'], ['warfare', 'Військова справа', '+6% шкоди, +5% HP/рів.'], ['defense', 'Захист', '+6% HP споруд/рів.'], ['scouting', 'Розвідка', 'розвідник, прапори, детекція мін'], ['engineering', 'Інженерія', 'швидші жетони']];
const UNIT_INFO = [['sword', 'Мечник', 1], ['archer', 'Лучниця', 1], ['mage', 'Маг', 2], ['spear', 'Списоносець', 3], ['priest', 'Священник', 3], ['assassin', 'Ассасін', 4], ['catapult', 'Катапульта', 4], ['ram', 'Таран', 5], ['commander', 'Командир', 5]];
const BUILD_INFO = [['farm', 'Ферма', 1], ['lumber', 'Лісорубка', 1], ['mine', 'Шахта', 1], ['barracks', 'Казарма', 2], ['wall', 'Стіна', 2], ['tower', 'Вежа', 3], ['cannon', 'Пушка', 4], ['workshop', 'Майстерня', 4], ['landmine', 'Міна', 5]];
const BNAME = { guild: 'Гільдія', farm: 'Ферма', lumber: 'Лісорубка', mine: 'Шахта', barracks: 'Казарма', wall: 'Стіна', tower: 'Вежа', cannon: 'Пушка', workshop: 'Майстерня', landmine: 'Міна', flag: 'Прапор' };
const RESNAME = { wood: 'дерево', stone: 'камінь', food: 'їжа', gold: 'золото' };
const SIEGE = { catapult: 1, ram: 1 };

let el = {}, peaceEl = null;
window.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  el = { menu: $('menu'), lobby: $('lobby'), game: $('game'), name: $('nameInput'), code: $('codeInput'), roomCode: $('roomCode'), playerList: $('playerList'), startBtn: $('startBtn'), lobbyHint: $('lobbyHint'), res: $('res'), banner: $('banner'), tokens: $('tokTop'), unitMenu: $('unitMenu'), buildMenu: $('buildMenu'), techPanel: $('techPanel'), techList: $('techList'), overlay: $('overlay'), ctxbar: $('ctxbar') };
  $('createBtn').onclick = once(() => socket.emit('createRoom', { name: el.name.value }));
  $('joinBtn').onclick = once(() => { const c = el.code.value.trim().toUpperCase(); if (c) socket.emit('joinRoom', { code: c, name: el.name.value }); });
  el.startBtn.onclick = () => socket.emit('startGame');
  $('fsBtn').onclick = toggleFullscreen;
  { const hb = $('homeBtn'); if (hb) hb.onclick = () => { if (st) { centerOnGuild(); flash(hb); } }; }
  $('attackBtn').onclick = () => { selectAll(); if (sel.units.size === 0) { banner('Немає армії для збору'); return; } attackMode = true; buildMode = null; buildable = null; closeMenus(); modes(); };
  $('armyBtn').onclick = () => toggle('unit');
  $('buildBtn').onclick = () => toggle('build');
  $('scoutBtn').onclick = () => selectScout();
  $('techBtn').onclick = () => { closeMenus(); el.techPanel.classList.toggle('hidden'); techSig = ''; renderTech(); };
  $('techClose').onclick = () => el.techPanel.classList.add('hidden');
  const mb = $('modeBtn'); if (mb) mb.onclick = () => { selectMode = !selectMode; mb.classList.toggle('on', selectMode); mb.innerHTML = selectMode ? '&#9635;<small>Виділення</small>' : '&#128506;<small>Карта</small>'; banner(selectMode ? 'Режим виділення: обведи воїнів пальцем' : 'Режим карти: палець рухає карту'); };
  const zi = $('zoomIn'), zo = $('zoomOut'), mu = $('muteBtn');
  if (zi) zi.onclick = () => zoomAt(innerWidth / 2, innerHeight / 2, 1.25);
  if (zo) zo.onclick = () => zoomAt(innerWidth / 2, innerHeight / 2, 0.8);
  if (mu) mu.onclick = () => { muted = !muted; mu.textContent = muted ? '🔇' : '🔊'; if (!muted) sfxInit(); };
  setupCanvas();
});
function once(fn) { let u = false; return () => { if (u) return; u = true; fn(); setTimeout(() => u = false, 1200); }; }

socket.on('connect', () => { me.id = socket.id; });
socket.on('joined', d => { me.index = d.index; me.color = d.color; me.host = d.host; if (d.debug) { me.debug = true; return; } show('lobby'); });
socket.on('empireSwitched', d => { me.index = d.index; me.color = d.color; clearSel(); resetFog(); camInit = false; techSig = ''; updateRes(); updateDbg(); });
socket.on('fogToggled', d => { resetFog(); const b = document.getElementById('dbgFog'); if (b) b.textContent = d.on ? '🌫 Туман: УВІМК' : '🌫 Туман: ВИМК'; });
socket.on('lobby', d => {
  me.host = (d.host === socket.id); el.roomCode.textContent = d.code; el.playerList.innerHTML = '';
  d.players.forEach(p => { const li = document.createElement('li'); li.innerHTML = `<span class="dot ${p.color}"></span>${p.name}` + (p.id === d.host ? '<span class="badge">господар</span>' : (p.connected ? '' : '<span class="badge">офлайн</span>')); el.playerList.appendChild(li); });
  const enough = d.players.length >= 2; el.startBtn.disabled = !(me.host && enough && !d.started); el.startBtn.style.display = me.host ? 'block' : 'none';
  el.lobbyHint.textContent = me.host ? (enough ? 'Можна починати!' : 'Чекаємо гравців… (мін. 2, макс. 4)') : 'Чекаємо, поки господар почне гру…';
});
socket.on('errorMsg', m => alert(m));
socket.on('gameStarted', d => { W = d.W; H = d.H; biomes = d.biomes; spawns = d.spawns; gridArr = new Array(W * H).fill(-2); seen = new Uint8Array(W * H); mem = new Int8Array(W * H).fill(-1); show('game'); resize(); ensurePeaceEl(); if (me.debug) createDbgBar(); banner('Карта 130×130 · перші 2 хв — мир (розвиток і розвідка)'); requestAnimationFrame(draw); });
socket.on('state', s => onState(s));
socket.on('gameOver', d => showEnd(d));

function show(name) { el.menu.classList.add('hidden'); el.lobby.classList.add('hidden'); el.game.classList.add('hidden'); el[name].classList.remove('hidden'); }
function clearSel() { sel.units.clear(); sel.building = null; sel.scout = false; buildMode = null; attackMode = false; buildable = null; modes(); refreshCtx(); }
function resetFog() { if (gridArr) { gridArr.fill(-2); seen.fill(0); mem.fill(-1); } }

function ensurePeaceEl() { if (peaceEl) return; peaceEl = document.createElement('div'); peaceEl.id = 'peace'; document.getElementById('game').appendChild(peaceEl); }
function updatePeace() { if (!peaceEl || !st) return; if (st.peace > 0) { const m = Math.floor(st.peace / 60), sec = st.peace % 60; peaceEl.textContent = '🕊 Мир: ' + m + ':' + String(sec).padStart(2, '0'); peaceEl.style.display = 'block'; } else peaceEl.style.display = 'none'; }

function onState(s) {
  st = s;
  if (s.gridFull) { gridArr = s.gridFull; for (let i = 0; i < gridArr.length; i++) if (gridArr[i] !== -2) { seen[i] = 1; mem[i] = gridArr[i]; } }
  else if (s.gridDiff) { const d = s.gridDiff; for (let k = 0; k < d.length; k += 2) { const i = d[k], v = d[k + 1]; gridArr[i] = v; if (v !== -2) { seen[i] = 1; mem[i] = v; } } }
  const alive = new Set(s.units.map(u => u.i));
  for (const id in renderU) { if (!alive.has(+id)) { const u = renderU[id]; const ci = Math.round(u.y) * W + Math.round(u.x); if (!u.s && (u.o === me.index || gridArr[ci] !== -2)) { effects.push({ x: u.x, y: u.y, t: 0, c: COL[IDX[u.o]] }); sfx('boom'); } delete renderU[id]; } }
  for (const u of s.units) { let r = renderU[u.i]; if (!r) { r = { x: u.x, y: u.y, ang: Math.PI / 2 }; renderU[u.i] = r; } r.tx = u.x; r.ty = u.y; r.o = u.o; r.t = u.t; r.h = u.h; r.m = u.m; r.s = u.s; }
  for (const id of [...sel.units]) if (!alive.has(id)) sel.units.delete(id);
  if (sel.scout && !s.units.some(u => u.o === me.index && u.s)) sel.scout = false;
  if (sel.building != null && !s.buildings.some(b => b.i === sel.building)) sel.building = null;
  if (s.shots) for (const sh of s.shots) { projectiles.push({ x: sh.x, y: sh.y, tx: sh.tx, ty: sh.ty, k: sh.k, t: 0, dur: sh.k === 'ball' ? 0.35 : 0.2 }); sfxShoot(); }
  if (!camInit) { centerOnGuild(); camInit = true; }
  updateRes(); updateArmyBtn(); updateScoutBtn(); updatePeace(); refreshCtx();
  if (el.techPanel && !el.techPanel.classList.contains('hidden')) renderTech();
}
function centerOnGuild() { const g = st && st.buildings.find(b => b.o === me.index && b.t === 'guild'); if (!g) return; camX = innerWidth / 2 - (g.x * CELL + CELL / 2); camY = innerHeight / 2 - (g.y * CELL + CELL / 2); }
function updateRes() {
  if (!st || !st.me) return; const r = st.me.res;
  el.res.innerHTML = chip('🌲', r.wood) + chip('⛏', r.stone) + chip('🍞', r.food) + chip('💰', r.gold) + chip('🔧', r.tokens) + guildChip(st.me.guildLevel, st.me.guildProg);
  if (st.me.alive === false && (st.winner === null || st.winner === undefined)) banner('Вашу гільдію знищено');
}
function chip(ic, v) { return `<span class="chip">${ic}<b>${v}</b></span>`; }
function guildChip(lvl, prog) { return `<span class="chip gbar" title="Рівень гільдії"><span class="gfill" style="width:${Math.round(prog * 100)}%"></span>🏛<b>${lvl}</b></span>`; }
function updateArmyBtn() { const b = document.getElementById('armyBtn'); if (!b || !st || !st.me) return; b.innerHTML = `<i>⚔</i>Армія ${st.me.army}/${st.me.cap}`; }
function updateScoutBtn() { const b = document.getElementById('scoutBtn'); if (!b || !st || !st.me) return; const has = st.me.hasScout; b.disabled = !has; b.style.opacity = has ? '1' : '.45'; }

function refreshCtx() {
  if (!el.ctxbar || !st) return; const btns = [];
  if (sel.scout && st.me && st.me.flags > 0) btns.push(`<button class="ctxb" data-a="placeFlag">🚩 Поставити прапор (${st.me.flags})</button>`);
  if (sel.building != null) { const b = st.buildings.find(x => x.i === sel.building); if (b && b.o === me.index) { if (b.rd) btns.push(`<button class="ctxb hot" data-a="collect" data-i="${b.i}">📦 Забрати ${b.am} ${RESNAME[b.rk] || ''}</button>`); if (b.t !== 'guild') btns.push(`<button class="ctxb danger" data-a="demolish" data-i="${b.i}">🗑 Знести</button>`); } }
  if (btns.length) { el.ctxbar.innerHTML = btns.join(''); el.ctxbar.classList.remove('hidden'); el.ctxbar.querySelectorAll('.ctxb').forEach(x => x.onclick = () => ctxAction(x.dataset.a, +x.dataset.i)); }
  else el.ctxbar.classList.add('hidden');
}
function ctxAction(a, i) {
  if (a === 'placeFlag') { socket.emit('command', { type: 'placeFlag' }); banner('Прапор встановлюється на місці розвідника…'); }
  else if (a === 'collect') { socket.emit('command', { type: 'collect', building: i }); sfx('build'); }
  else if (a === 'demolish') { socket.emit('command', { type: 'demolish', building: i }); sel.building = null; banner('Споруду знесено (без повернення ресурсів)'); refreshCtx(); }
}

function myUnits() { return st ? st.units.filter(u => u.o === me.index && !u.s) : []; }
function selectAll() { sel.units = new Set(myUnits().map(u => u.i)); sel.building = null; sel.scout = false; refreshCtx(); }
function selectScout() { const sc = st && st.units.find(u => u.o === me.index && u.s); if (sc) { sel.units = new Set([sc.i]); sel.scout = true; sel.building = null; banner('Розвідник обрано — тапни, куди йти' + (st.me && st.me.flags > 0 ? ' або постав прапор' : '')); flash(document.getElementById('scoutBtn')); } else if (st.me && st.me.tech.scouting < 1) banner('Спершу відкрий «Розвідку» в дереві розвитку'); else banner('Розвідник у відродженні (~2 хв)'); refreshCtx(); }
function nearestBarracks() { const bs = st ? st.buildings.filter(b => b.o === me.index && b.t === 'barracks') : []; return bs[0] || null; }
function produce(type) {
  if (!st || !st.me) return;
  if (st.me.tech.army < UNLOCK[type]) { banner('Потрібна «Армія ' + UNLOCK[type] + '»'); return; }
  if (SIEGE[type] && st.me.workshops === 0) { banner('Потрібна Майстерня'); return; }
  if (type === 'commander' && st.me.hasCommander) { banner('Командир може бути лише один'); return; }
  const bar = (sel.building != null) ? st.buildings.find(b => b.i === sel.building && b.t === 'barracks') : nearestBarracks(); if (!bar) { banner('Потрібна казарма'); return; }
  if (st.me.army >= st.me.cap) { banner('Ліміт армії — побудуй ще казарму'); return; }
  if (!canAfford(UCOST[type])) { banner('Недостатньо ресурсів'); return; }
  socket.emit('command', { type: 'produce', building: bar.i, unit: type }); sfx('build');
}
function buyFlag() { if (!st || !st.me) return; if (st.me.flagCap <= 0) { banner('Прапори — від Розвідки 3'); return; } if (st.me.flagsTotal >= st.me.flagCap) { banner('Максимум прапорів: ' + st.me.flagCap); return; } if (!canAfford(FLAG_COST)) { banner('Прапор дорогий: 🌲100 ⛏100 💰250'); return; } socket.emit('command', { type: 'buyFlag' }); banner('Прапор куплено — обери розвідника й постав його'); }
function sendMove(col, row) { if (!sel.units.size) return; if (st.peace > 0 && !sel.scout) { banner('🕊 Мир: армію ще не можна рухати'); return; } socket.emit('command', { type: 'move', ids: [...sel.units], x: col, y: row }); }

function toggle(which) { const u = which === 'unit'; const su = u && el.unitMenu.classList.contains('hidden'); const sb = !u && el.buildMenu.classList.contains('hidden'); closeMenus(); if (su) { refreshUnitMenu(); el.unitMenu.classList.remove('hidden'); } if (sb) { refreshBuildMenu(); el.buildMenu.classList.remove('hidden'); } }
function closeMenus() { el.unitMenu.classList.add('hidden'); el.buildMenu.classList.add('hidden'); el.techPanel && el.techPanel.classList.add('hidden'); }
function costStr(c) { const p = []; if (c.wood) p.push('🌲' + c.wood); if (c.stone) p.push('⛏' + c.stone); if (c.food) p.push('🍞' + c.food); if (c.gold) p.push('💰' + c.gold); return p.join(' '); }
function canAfford(c) { const r = st && st.me ? st.me.res : {}; return (r.wood || 0) >= (c.wood || 0) && (r.stone || 0) >= (c.stone || 0) && (r.food || 0) >= (c.food || 0) && (r.gold || 0) >= (c.gold || 0); }
function refreshUnitMenu() {
  const lvl = st && st.me ? st.me.tech.army : 0;
  el.unitMenu.innerHTML = UNIT_INFO.map(([k, n, req]) => {
    let locked = lvl < req, note = '';
    if (locked) note = '🔒 Армія ' + req;
    else if (SIEGE[k] && st.me.workshops === 0) { locked = true; note = '🔒 Майстерня'; }
    else if (k === 'commander' && st.me.hasCommander) { locked = true; note = '1 макс'; }
    else note = costStr(UCOST[k]);
    const poor = !locked && !canAfford(UCOST[k]);
    return `<button class="btn s" data-u="${k}" ${locked || poor ? 'disabled' : ''}>${n}<small>${note}</small></button>`;
  }).join('');
  el.unitMenu.querySelectorAll('button').forEach(b => b.onclick = () => produce(b.dataset.u));
}
function refreshBuildMenu() {
  const lvl = st && st.me ? st.me.tech.construction : 0;
  let html = BUILD_INFO.map(([k, n, req]) => { const c = COST[k]; const locked = lvl < req; const poor = !locked && !canAfford(c); return `<button class="btn s" data-b="${k}" ${locked ? 'disabled' : ''} style="${poor ? 'opacity:.55' : ''}">${n}<small>${locked ? '🔒 Будів. ' + req : costStr(c)}</small></button>`; }).join('');
  if (st && st.me && st.me.flagCap > 0) { const dis = st.me.flagsTotal >= st.me.flagCap || !canAfford(FLAG_COST); html += `<button class="btn s flagbuy" data-flag="1" ${dis ? 'disabled' : ''}>🚩 Купити прапор<small>${st.me.flagsTotal}/${st.me.flagCap} · ${costStr(FLAG_COST)}</small></button>`; }
  el.buildMenu.innerHTML = html;
  el.buildMenu.querySelectorAll('button').forEach(b => b.onclick = () => { if (b.dataset.flag) { buyFlag(); closeMenus(); return; } buildMode = b.dataset.b; attackMode = false; closeMenus(); computeBuildable(); modes(); });
}
function modes() {
  document.getElementById('attackBtn').classList.toggle('on', attackMode);
  document.getElementById('buildBtn').classList.toggle('on', !!buildMode);
  if (attackMode) banner('Тапни точку — уся армія збереться там');
  else if (buildMode) banner('Тапни підсвічену клітинку, щоб побудувати «' + BNAME[buildMode] + '»');
  else hideBanner();
}
function computeBuildable() {
  buildable = new Set(); if (!st) return;
  const g = st.buildings.find(b => b.o === me.index && b.t === 'guild');
  const R = 6 + (st.me ? st.me.tech.influence : 0) * 2;
  if (g) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const c = g.x + dx, r = g.y + dy; if (c >= 0 && c < W && r >= 0 && r < H) buildable.add(r * W + c); }
  for (const b of st.buildings) if (b.o === me.index && b.t === 'flag') for (let dy = -FLAG_RADIUS; dy <= FLAG_RADIUS; dy++) for (let dx = -FLAG_RADIUS; dx <= FLAG_RADIUS; dx++) { const c = b.x + dx, r = b.y + dy; if (c >= 0 && c < W && r >= 0 && r < H) buildable.add(r * W + c); }
  if (buildMode !== 'wall' && buildMode !== 'landmine') for (const b of st.buildings) { if (b.t === 'landmine') continue; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const c = b.x + dx, r = b.y + dy; if (c >= 0 && c < W && r >= 0 && r < H) buildable.delete(r * W + c); } }
  else for (const b of st.buildings) if (b.t !== 'landmine') buildable.delete(b.y * W + b.x);
}
let bannerTimer = null;
function banner(t) { el.banner.textContent = t; el.banner.classList.remove('hidden'); if (!attackMode && !buildMode) { clearTimeout(bannerTimer); bannerTimer = setTimeout(hideBanner, 2200); } }
function hideBanner() { if (!attackMode && !buildMode) el.banner.classList.add('hidden'); }
function flash(b) { if (!b) return; b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 150); }

let techSig = '';
function renderTech() {
  if (!st || !st.me) return;
  const sig = st.me.res.tokens + '|' + st.me.guildLevel + '|' + st.me.autoCollect + '|' + TECH.map(([k]) => st.me.tech[k]).join(',');
  if (sig === techSig) return; techSig = sig;
  const tk = st.me.res.tokens; el.tokens.textContent = tk;
  let html = TECH.map(([k, n, d]) => {
    const lvl = st.me.tech[k]; const stars = '★'.repeat(lvl) + '☆'.repeat(5 - lvl); const cost = TECH_COST[lvl];
    const dis = lvl >= 5 || tk < cost; const label = lvl >= 5 ? 'МАКС' : ('−' + cost + ' 🔧');
    return `<div class="techrow"><div class="ti"><b>${n}</b><small>${d}</small><span class="stars">${stars}</span></div><button class="btn tbuy" data-k="${k}" ${dis ? 'disabled' : ''}>${label}</button></div>`;
  }).join('');
  const autoDis = st.me.autoCollect || tk < 5;
  html += `<div class="techrow"><div class="ti"><b>Автозбір ресурсів</b><small>${st.me.autoCollect ? '✅ куплено — ресурси зараховуються самі' : 'збирає 100% ресурсу автоматично'}</small></div><button class="btn tbuy" data-auto="1" ${autoDis ? 'disabled' : ''}>${st.me.autoCollect ? 'КУПЛЕНО' : '−5 🔧'}</button></div>`;
  el.techList.innerHTML = html;
  el.techList.querySelectorAll('.tbuy').forEach(b => b.onclick = () => { if (b.dataset.auto) { socket.emit('command', { type: 'autoCollect' }); } else socket.emit('command', { type: 'tech', branch: b.dataset.k }); techSig = ''; });
}

let actx = null;
function sfxInit() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (actx && actx.state === 'suspended') actx.resume(); }
function tone(type, f0, f1, dur, vol) { if (muted || !actx) return; try { const o = actx.createOscillator(), g = actx.createGain(); o.connect(g); g.connect(actx.destination); const t = actx.currentTime; o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.start(t); o.stop(t + dur + 0.02); } catch (e) {} }
let lastShoot = 0;
function sfxShoot() { const n = performance.now(); if (n - lastShoot < 70) return; lastShoot = n; tone('square', 620, 240, 0.1, 0.05); }
function sfx(kind) { if (kind === 'boom') tone('sawtooth', 190, 45, 0.28, 0.09); else if (kind === 'build') tone('triangle', 300, 520, 0.12, 0.06); else if (kind === 'select') tone('sine', 480, 480, 0.06, 0.04); }

const ptrs = new Map();
let mode = null, startX = 0, startY = 0, moved = false, box = null, panMid = null, pinchDist = 0, suppress = false, lastX = 0, lastY = 0;
function setupCanvas() {
  canvas = document.getElementById('cv'); ctx = canvas.getContext('2d'); addEventListener('resize', resize); resize();
  addEventListener('orientationchange', () => setTimeout(resize, 120));
  if (window.visualViewport) visualViewport.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', () => setTimeout(resize, 60));
  document.addEventListener('webkitfullscreenchange', () => setTimeout(resize, 60));
  canvas.addEventListener('pointerdown', e => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId); sfxInit();
    if (ptrs.size === 1) { if (suppress) return; startX = lastX = e.clientX; startY = lastY = e.clientY; moved = false; box = { x0: startX, y0: startY, x1: startX, y1: startY }; mode = 'single'; }
    else if (ptrs.size === 2) { mode = 'multi'; box = null; const p = [...ptrs.values()]; panMid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }; pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
  });
  canvas.addEventListener('pointermove', e => {
    const rec = ptrs.get(e.pointerId); if (!rec) return; rec.x = e.clientX; rec.y = e.clientY;
    if (mode === 'single' && ptrs.size === 1 && !suppress) {
      if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 8) moved = true;
      if (selectMode) { box.x1 = e.clientX; box.y1 = e.clientY; } else { camX += e.clientX - lastX; camY += e.clientY - lastY; }
      lastX = e.clientX; lastY = e.clientY;
    } else if (ptrs.size >= 2) {
      const p = [...ptrs.values()]; const mx = (p[0].x + p[1].x) / 2, my = (p[0].y + p[1].y) / 2, d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (panMid) { camX += mx - panMid.x; camY += my - panMid.y; } if (pinchDist > 0) zoomAt(mx, my, d / pinchDist); panMid = { x: mx, y: my }; pinchDist = d;
    }
  });
  canvas.addEventListener('pointerup', e => {
    const wasSingle = (mode === 'single' && ptrs.size === 1); ptrs.delete(e.pointerId);
    if (wasSingle && !suppress) { if (selectMode && moved) finalizeBox(); else if (!moved) tap(startX, startY); }
    if (ptrs.size >= 1) suppress = true;
    if (ptrs.size === 0) { suppress = false; mode = null; box = null; panMid = null; }
  });
  canvas.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); if (ptrs.size === 0) { suppress = false; mode = null; box = null; } });
}
function resize() { DPR = Math.min(devicePixelRatio || 1, 2); canvas.width = innerWidth * DPR; canvas.height = innerHeight * DPR; }
function zoomAt(mx, my, ratio) { const old = CELL; let nw = clamp(CELL * ratio, 12, 52); if (Math.abs(nw - old) < 0.01) return; const wx = (mx - camX) / old, wy = (my - camY) / old; CELL = nw; camX = mx - wx * CELL; camY = my - wy * CELL; }
function finalizeBox() {
  const x0 = Math.min(box.x0, box.x1), x1 = Math.max(box.x0, box.x1), y0 = Math.min(box.y0, box.y1), y1 = Math.max(box.y0, box.y1); const ids = [];
  for (const u of myUnits()) { const sx = u.x * CELL + CELL / 2 + camX, sy = u.y * CELL + CELL / 2 + camY; if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) ids.push(u.i); }
  if (ids.length) { sel.units = new Set(ids); sel.building = null; sel.scout = false; banner('Обрано воїнів: ' + ids.length); sfx('select'); refreshCtx(); }
}
function tap(px, py) {
  if (!st) return;
  const col = Math.floor((px - camX) / CELL), row = Math.floor((py - camY) / CELL);
  if (col < 0 || col >= W || row < 0 || row >= H) return;
  if (buildMode) { if (buildable && !buildable.has(row * W + col)) { banner('Не можна тут (зона гільдії/прапора)'); return; } if (!canAfford(COST[buildMode])) { banner('Недостатньо ресурсів'); return; } socket.emit('command', { type: 'build', build: buildMode, cx: col, cy: row }); sfx('build'); if (buildMode !== 'wall' && buildMode !== 'landmine') { buildMode = null; buildable = null; modes(); } return; }
  if (attackMode) { sendMove(col, row); attackMode = false; modes(); return; }
  // свій воїн?
  const uids = st.units.filter(u => u.o === me.index && !u.s && Math.round(u.x) === col && Math.round(u.y) === row).map(u => u.i);
  if (uids.length) { sel.units = new Set(uids); sel.building = null; sel.scout = false; sfx('select'); refreshCtx(); return; }
  // розвідник?
  const sc = st.units.find(u => u.o === me.index && u.s && Math.round(u.x) === col && Math.round(u.y) === row);
  if (sc) { sel.units = new Set([sc.i]); sel.scout = true; sel.building = null; sfx('select'); banner('Розвідник обрано'); refreshCtx(); return; }
  // споруда (своя ресурсна готова — забрати; інакше показати HP)?
  const b = st.buildings.find(bb => bb.t !== 'landmine' && bb.x === col && bb.y === row) || st.buildings.find(bb => bb.x === col && bb.y === row);
  if (b) {
    if (b.o === me.index && b.rd) { socket.emit('command', { type: 'collect', building: b.i }); sfx('build'); return; }
    if (b.o === me.index || !b.en) { sel.building = b.i; sel.units.clear(); sel.scout = false; banner(`${b.o === me.index ? '' : (CNAME[IDX[b.o]] + ' ')}${BNAME[b.t] || 'Споруда'} — HP ${b.h}/${b.m}`); sfx('select'); refreshCtx(); return; }
  }
  // інакше: якщо є вибрані воїни — рух; якщо ні — зняти вибір
  if (sel.units.size) { sendMove(col, row); }
  else { sel.building = null; sel.scout = false; refreshCtx(); hideBanner(); }
}

function draw() {
  requestAnimationFrame(draw); if (!canvas) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight);
  if (!st || !biomes || !gridArr) return;
  for (const id in renderU) { const r = renderU[id]; const dx = r.tx - r.x, dy = r.ty - r.y; r.x += dx * 0.22; r.y += dy * 0.22; const sp = Math.hypot(dx, dy); if (sp > 0.04) r.ang = lerpAng(r.ang, Math.atan2(dy, dx), 0.15); }
  darkness += ((st.night ? 0.42 : 0) - darkness) * 0.03; rain += ((st.weather === 'rain' ? 1 : 0) - rain) * 0.03;
  ctx.save(); ctx.translate(camX, camY);
  drawTiles(); drawBuildings(); drawUnits(); drawProjectiles(); drawEffects();
  if (selectMode && box && moved) { const x0 = Math.min(box.x0, box.x1) - camX, y0 = Math.min(box.y0, box.y1) - camY, w = Math.abs(box.x1 - box.x0), h = Math.abs(box.y1 - box.y0); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.strokeRect(x0, y0, w, h); ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x0, y0, w, h); }
  ctx.restore();
  if (darkness > 0.01) { ctx.fillStyle = `rgba(6,10,26,${darkness})`; ctx.fillRect(0, 0, innerWidth, innerHeight); }
  if (rain > 0.02) drawRain();
  for (const e of effects) e.t += 1 / 60; effects = effects.filter(e => e.t < 0.5);
  for (const p of projectiles) p.t += 1 / 60; projectiles = projectiles.filter(p => p.t < p.dur + 0.12);
}
function drawTiles() {
  const c0 = Math.max(0, Math.floor(-camX / CELL)), c1 = Math.min(W, Math.ceil((innerWidth - camX) / CELL));
  const r0 = Math.max(0, Math.floor(-camY / CELL)), r1 = Math.min(H, Math.ceil((innerHeight - camY) / CELL));
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
    const i = r * W + c, x = c * CELL, y = r * CELL, o = gridArr[i], b = biomes[i];
    if (o === -2) { if (seen[i]) { ctx.fillStyle = BIOME_DIM[b]; ctx.fillRect(x, y, CELL, CELL); if (mem[i] >= 0) { ctx.fillStyle = COL_FOG[IDX[mem[i]]]; ctx.fillRect(x, y, CELL, CELL); } } else { ctx.fillStyle = '#07090d'; ctx.fillRect(x, y, CELL, CELL); } }
    else { ctx.fillStyle = BIOME_COL[b]; ctx.fillRect(x, y, CELL, CELL); if (o >= 0) { ctx.fillStyle = COL_SOFT[IDX[o]]; ctx.fillRect(x, y, CELL, CELL); } if (buildMode && buildable && buildable.has(i)) { ctx.fillStyle = 'rgba(120,255,140,.18)'; ctx.fillRect(x, y, CELL, CELL); } }
    if ((seen[i] || o !== -2) && RARE[b] && CELL >= 18) { ctx.globalAlpha = 0.75; ctx.font = Math.round(CELL * 0.6) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(RARE[b], x + CELL / 2, y + CELL / 2); ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; }
  }
  ctx.strokeStyle = 'rgba(0,0,0,.14)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let c = c0; c <= c1; c++) { ctx.moveTo(c * CELL, r0 * CELL); ctx.lineTo(c * CELL, r1 * CELL); }
  for (let r = r0; r <= r1; r++) { ctx.moveTo(c0 * CELL, r * CELL); ctx.lineTo(c1 * CELL, r * CELL); }
  ctx.stroke();
}
function drawSpr(im, cx, cy, targetH, rot) { const r = im.naturalWidth / im.naturalHeight, h = targetH, w = h * r; if (rot) { ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore(); } else ctx.drawImage(im, cx - w / 2, cy - h * 0.62, w, h); }
const BUILD_RANGE = { tower: 5.5, cannon: 7.0 };
function rect(c, s) { ctx.fillStyle = c; ctx.fillRect(-s, -s, s * 2, s * 2); }
function tri(cx, cy, s) { ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy + s); ctx.lineTo(cx - s, cy + s); ctx.closePath(); ctx.fill(); }
function ring(c, r) { ctx.strokeStyle = c + '44'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(0, 0, r * CELL, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
function drawBuildings() {
  for (const b of st.buildings) {
    const x = b.x * CELL + CELL / 2, y = b.y * CELL + CELL / 2, c = COL[IDX[b.o]], col = IDX[b.o];
    if (b.t === 'landmine') { drawMine(b, x, y, c); continue; }
    if ((b.t === 'tower' || b.t === 'cannon')) { ctx.save(); ctx.translate(x, y); ring(c, BUILD_RANGE[b.t]); ctx.restore(); }
    if (sel.building === b.i) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(b.x * CELL + 1, b.y * CELL + 1, CELL - 2, CELL - 2); }
    const im = sprite(col, b.t);
    if (im) drawSpr(im, x, y, CELL * (BSIZE[b.t] || 1.6)); else drawBuildingShape(b, x, y, c);
    if (b.t === 'guild' && b.gl != null) { ctx.font = 'bold ' + Math.round(CELL * 0.5) + 'px system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#0d1017'; ctx.strokeText('★' + b.gl, x, y - CELL * 1.25); ctx.fillStyle = c; ctx.fillText('★' + b.gl, x, y - CELL * 1.25); ctx.textAlign = 'left'; }
    if (b.t === 'barracks' && b.q) { const w = CELL * 0.8; ctx.fillStyle = '#000a'; ctx.fillRect(x - w / 2, y + CELL * 0.5, w, 4); ctx.fillStyle = '#f5c542'; ctx.fillRect(x - w / 2, y + CELL * 0.5, w * (b.prog || 0), 4); if (b.q > 1) { ctx.fillStyle = '#fff'; ctx.font = 'bold 10px system-ui'; ctx.fillText('x' + b.q, x + w / 2 - 2, y + CELL * 0.5 - 2); } }
    if (b.rk && b.o === me.index) { if (b.rd) { ctx.font = 'bold ' + Math.round(CELL * 0.7) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffdf5a'; ctx.strokeStyle = '#0d1017'; ctx.lineWidth = 3; ctx.strokeText('!', x, y - CELL * 0.9); ctx.fillText('!', x, y - CELL * 0.9); ctx.textAlign = 'left'; } else { const w = CELL * 0.7; ctx.fillStyle = '#000a'; ctx.fillRect(x - w / 2, y + CELL * 0.62, w, 3); ctx.fillStyle = '#6fcf97'; ctx.fillRect(x - w / 2, y + CELL * 0.62, w * (b.tp || 0), 3); } }
    hpBar(x, y - CELL * (im ? 0.78 : 0.5), b.h, b.m, CELL * 0.85);
  }
}
function drawMine(b, x, y, c) {
  if (b.o === me.index) { ctx.fillStyle = b.arm > 0 ? '#f5c54288' : c; ctx.beginPath(); ctx.arc(x, y, CELL * 0.15, 0, 7); ctx.fill(); ctx.strokeStyle = b.arm > 0 ? '#f5c542' : c; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(x, y, CELL * 0.24, 0, 7); ctx.stroke(); ctx.setLineDash([]); if (b.arm > 0) { ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(CELL * 0.4) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText(b.arm, x, y - CELL * 0.4); ctx.textAlign = 'left'; } }
  else { const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200); ctx.fillStyle = `rgba(255,90,90,${0.5 + pulse * 0.4})`; ctx.beginPath(); ctx.arc(x, y, CELL * 0.16, 0, 7); ctx.fill(); ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, CELL * 0.26, 0, 7); ctx.stroke(); ctx.font = Math.round(CELL * 0.4) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText('⚠', x, y - CELL * 0.35); ctx.textAlign = 'left'; }
}
function drawBuildingShape(b, x, y, c) {
  ctx.save(); ctx.translate(x, y); const t = b.t;
  if (t === 'guild') { const s = CELL * 0.46; ctx.fillStyle = c; ctx.fillRect(-s, -s, s * 2, s * 2); ctx.fillStyle = '#0d1017'; star(0, 0, CELL * 0.28, CELL * 0.13, 5); }
  else if (t === 'mine') { rect(c, CELL * 0.32); ctx.fillStyle = '#0d1017'; tri(0, -CELL * 0.14, CELL * 0.16); }
  else if (t === 'lumber') { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, CELL * 0.3, 0, 7); ctx.fill(); ctx.strokeStyle = '#0d1017'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -CELL * 0.3); ctx.lineTo(0, CELL * 0.3); ctx.stroke(); }
  else if (t === 'farm') { rect(c, CELL * 0.3); ctx.fillStyle = '#0d1017'; ctx.fillRect(-CELL * 0.24, -2, CELL * 0.48, 2); ctx.fillRect(-CELL * 0.24, CELL * 0.12, CELL * 0.48, 2); }
  else if (t === 'barracks') { const s = CELL * 0.34; ctx.fillStyle = c; ctx.fillRect(-s, -s * 0.5, s * 2, s * 1.5); ctx.beginPath(); ctx.moveTo(-s, -s * 0.5); ctx.lineTo(0, -s); ctx.lineTo(s, -s * 0.5); ctx.closePath(); ctx.fill(); }
  else if (t === 'wall') { ctx.fillStyle = c; ctx.fillRect(-CELL * 0.42, -CELL * 0.28, CELL * 0.84, CELL * 0.56); ctx.fillStyle = '#0d1017'; for (let i = -1; i <= 1; i++) ctx.fillRect(i * CELL * 0.28 - 2, -CELL * 0.28, 4, CELL * 0.14); }
  else if (t === 'tower') { ctx.fillStyle = c; tri(0, 0, CELL * 0.34); }
  else if (t === 'cannon') { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, CELL * 0.24, 0, 7); ctx.fill(); ctx.fillStyle = '#0d1017'; ctx.fillRect(0, -CELL * 0.06, CELL * 0.32, CELL * 0.12); }
  else if (t === 'workshop') { const s = CELL * 0.36; ctx.fillStyle = c; ctx.fillRect(-s, -s * 0.6, s * 2, s * 1.4); ctx.fillStyle = '#0d1017'; ctx.beginPath(); ctx.arc(-s * 0.3, 0, s * 0.28, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(s * 0.4, s * 0.1, s * 0.2, 0, 7); ctx.fill(); }
  else if (t === 'flag') { ctx.strokeStyle = '#0d1017'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, CELL * 0.32); ctx.lineTo(0, -CELL * 0.34); ctx.stroke(); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, -CELL * 0.34); ctx.lineTo(CELL * 0.28, -CELL * 0.24); ctx.lineTo(0, -CELL * 0.12); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}
function drawUnits() {
  for (const id in renderU) {
    const u = renderU[id], x = u.x * CELL + CELL / 2, y = u.y * CELL + CELL / 2, c = COL[IDX[u.o]], col = IDX[u.o];
    if (u.o === me.index && sel.units.has(+id)) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y + CELL * 0.12, CELL * 0.32, 0, 7); ctx.stroke(); }
    const type = u.s ? 'scout' : u.t;
    const moving = Math.hypot(u.tx - u.x, u.ty - u.y) > 0.04;
    const rot = moving ? u.ang - Math.PI / 2 : 0;
    const im = sprite(col, type);
    if (im) drawSpr(im, x, y, CELL * (USIZE[type] || 1.15), rot); else drawUnitShape(u, x, y, c, rot);
    if (u.t === 'commander') { ctx.strokeStyle = c + '44'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(x, y, CELL * 7, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    if (u.m && !u.s) hpBar(x, y - CELL * (im ? 0.55 : 0.36), u.h, u.m, CELL * 0.46);
  }
}
function drawUnitShape(u, x, y, c, rot) {
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.fillStyle = c; const t = u.s ? 'scout' : u.t;
  if (t === 'scout') { ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, CELL * 0.26, CELL * 0.16, 0, 0, 7); ctx.stroke(); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, CELL * 0.07, 0, 7); ctx.fill(); }
  else if (t === 'sword') { ctx.beginPath(); ctx.arc(0, 0, CELL * 0.22, 0, 7); ctx.fill(); }
  else if (t === 'archer') { ctx.beginPath(); ctx.arc(0, 0, CELL * 0.19, 0, 7); ctx.fill(); ctx.fillStyle = '#0d1017'; tri(0, CELL * 0.02, CELL * 0.09); }
  else if (t === 'mage') { ctx.beginPath(); ctx.moveTo(0, -CELL * 0.24); ctx.lineTo(CELL * 0.21, 0); ctx.lineTo(0, CELL * 0.24); ctx.lineTo(-CELL * 0.21, 0); ctx.closePath(); ctx.fill(); }
  else if (t === 'spear') { ctx.beginPath(); ctx.arc(0, 0, CELL * 0.2, 0, 7); ctx.fill(); ctx.strokeStyle = '#0d1017'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -CELL * 0.32); ctx.lineTo(0, CELL * 0.32); ctx.stroke(); }
  else if (t === 'priest') { ctx.beginPath(); ctx.arc(0, 0, CELL * 0.2, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -CELL * 0.14); ctx.lineTo(0, CELL * 0.14); ctx.moveTo(-CELL * 0.1, 0); ctx.lineTo(CELL * 0.1, 0); ctx.stroke(); }
  else if (t === 'assassin') { tri(0, 0, CELL * 0.2); }
  else if (t === 'catapult') { const s = CELL * 0.28; ctx.fillRect(-s, -s * 0.7, s * 2, s * 1.4); ctx.fillStyle = '#0d1017'; ctx.beginPath(); ctx.arc(0, 0, s * 0.35, 0, 7); ctx.fill(); }
  else if (t === 'ram') { const s = CELL * 0.32; ctx.fillRect(-s, -s * 0.5, s * 2, s); ctx.fillStyle = '#0d1017'; ctx.fillRect(s * 0.5, -s * 0.25, s * 0.6, s * 0.5); }
  else if (t === 'commander') { ctx.beginPath(); ctx.arc(0, 0, CELL * 0.26, 0, 7); ctx.fill(); ctx.fillStyle = '#0d1017'; star(0, 0, CELL * 0.18, CELL * 0.08, 5); }
  ctx.restore();
}
function hpBar(cx, top, hp, max, w) { if (hp >= max) return; const ratio = Math.max(0, hp / max), h = 3; ctx.fillStyle = '#000a'; ctx.fillRect(cx - w / 2, top - h, w, h); ctx.fillStyle = ratio > .5 ? '#4ad07a' : ratio > .25 ? '#f5c542' : '#ff5a5a'; ctx.fillRect(cx - w / 2, top - h, w * ratio, h); }
function drawProjectiles() {
  for (const p of projectiles) {
    const f = Math.min(1, p.t / p.dur); const sx = p.x * CELL + CELL / 2, sy = p.y * CELL + CELL / 2, tx = p.tx * CELL + CELL / 2, ty = p.ty * CELL + CELL / 2;
    const cx = sx + (tx - sx) * f, cy = sy + (ty - sy) * f - Math.sin(f * Math.PI) * (p.k === 'ball' ? CELL * 0.8 : 0);
    if (f < 1) { if (p.k === 'arrow') { ctx.strokeStyle = '#e8e2c0'; ctx.lineWidth = 2; const a = Math.atan2(ty - sy, tx - sx); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - Math.cos(a) * CELL * 0.3, cy - Math.sin(a) * CELL * 0.3); ctx.stroke(); } else if (p.k === 'magic') { ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.12, 0, 7); ctx.fill(); } else { ctx.fillStyle = '#3a3a3a'; ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.14, 0, 7); ctx.fill(); } }
    else { const ip = (p.t - p.dur) / 0.12; ctx.globalAlpha = 1 - ip; ctx.strokeStyle = p.k === 'magic' ? '#ff7a7a' : '#ffd28a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tx, ty, CELL * (0.1 + ip * 0.3), 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
  }
}
function drawEffects() { for (const e of effects) { const x = e.x * CELL + CELL / 2, y = e.y * CELL + CELL / 2, p = e.t / 0.5; ctx.globalAlpha = 1 - p; ctx.strokeStyle = e.c; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, CELL * (0.2 + p * 0.5), 0, 7); ctx.stroke(); ctx.fillStyle = e.c; for (let i = 0; i < 6; i++) { const a = i / 6 * 7, d = CELL * p * 0.7; ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2.5 * (1 - p), 0, 7); ctx.fill(); } ctx.globalAlpha = 1; } }
let rainSeed = []; for (let i = 0; i < 90; i++) rainSeed.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() });
function drawRain() { ctx.save(); ctx.globalAlpha = rain * 0.5; ctx.strokeStyle = '#9fb6d8'; ctx.lineWidth = 1; const tt = performance.now() / 1000; for (const d of rainSeed) { const x = ((d.x + tt * 0.02) % 1) * innerWidth, y = ((d.y + tt * d.s) % 1) * innerHeight; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 12); ctx.stroke(); } ctx.restore(); ctx.fillStyle = `rgba(40,60,90,${rain * 0.10})`; ctx.fillRect(0, 0, innerWidth, innerHeight); }
function star(cx, cy, R, r, n) { ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const rad = i % 2 ? r : R, a = i * Math.PI / n - Math.PI / 2; const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); ctx.fill(); }

function createDbgBar() {
  if (document.getElementById('dbgbar')) return;
  const bar = document.createElement('div'); bar.id = 'dbgbar';
  bar.style.cssText = 'position:fixed;top:130px;left:50%;transform:translateX(-50%);z-index:7;display:flex;gap:6px;flex-wrap:wrap;justify-content:center;max-width:96%;';
  bar.innerHTML = '<button id="dbgSwitch" class="dbgbtn"></button><button id="dbgFog" class="dbgbtn">🌫 Туман: ВИМК</button><button id="dbgEnd" class="dbgbtn">🏁 Завершити</button>';
  document.getElementById('game').appendChild(bar);
  document.getElementById('dbgSwitch').onclick = () => socket.emit('switchEmpire');
  document.getElementById('dbgFog').onclick = () => socket.emit('toggleFog');
  document.getElementById('dbgEnd').onclick = () => socket.emit('debugEnd');
  updateDbg();
}
function updateDbg() { const b = document.getElementById('dbgSwitch'); if (!b) return; b.textContent = '🔧 За: ' + (CNAME[me.color] || '') + ' ▸'; b.style.background = COL[me.color] || '#f5c542'; b.style.color = '#0d1017'; }

function showEnd(d) {
  el.overlay.classList.remove('hidden');
  const rows = [...d.stats].sort((a, b) => (b.territory + b.kills * 6 + b.razed * 20 + b.built * 3 + (b.alive ? 300 : 0)) - (a.territory + a.kills * 6 + a.razed * 20 + a.built * 3 + (a.alive ? 300 : 0)));
  const winTxt = d.winner === -1 ? 'Нічия' : `Перемогла <span style="color:${COL[IDX[d.winner]]}">${CNAME[IDX[d.winner]]}</span> імперія`;
  let html = `<h2 class="endtitle">🏆 ${winTxt}</h2><div class="statwrap">`; let place = 0;
  for (const p of rows) { place++; html += `<div class="statcard" style="border-color:${COL[IDX[p.index]]}"><div class="sc-h"><span class="place">#${place}</span><span class="dot ${p.color}"></span><b>${CNAME[p.color]}</b>${p.index === d.winner ? ' 👑' : ''}${p.alive ? '' : ' <small class="mut">вибула</small>'}</div><div class="sc-g"><span>🗺 територія<b>${p.territory}</b></span><span>⚔ вбито<b>${p.kills}</b></span><span>💀 втрати<b>${p.lost}</b></span><span>🏚 знищено споруд<b>${p.razed}</b></span><span>🏗 збудовано<b>${p.built}</b></span><span>👥 створено військ<b>${p.made}</b></span><span>📦 ресурсів<b>${p.gathered}</b></span><span>🏛 гільдія<b>ур.${p.guildLevel}</b></span></div></div>`; }
  html += `</div><button id="againBtn2" class="btn big">Нова гра</button>`;
  el.overlay.querySelector('.panel').innerHTML = html; el.overlay.querySelector('.panel').classList.add('endpanel');
  document.getElementById('againBtn2').onclick = () => location.reload();
}
function pseudoFS() {
  document.body.classList.toggle('pseudo-fs');
  const on = document.body.classList.contains('pseudo-fs');
  if (on) { try { window.scrollTo(0, 1); } catch (e) {} banner('На iPhone повний екран залежить від Safari — або додай гру на головний екран'); }
  setTimeout(resize, 80);
}
function toggleFullscreen() {
  try {
    const de = document.documentElement;
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
    const req = de.requestFullscreen || de.webkitRequestFullscreen || de.mozRequestFullScreen || de.msRequestFullscreen;
    if (fsEl) { if (exit) exit.call(document); if (document.body.classList.contains('pseudo-fs')) pseudoFS(); return; }
    if (req) { const p = req.call(de); if (p && p.catch) p.catch(() => pseudoFS()); setTimeout(resize, 120); return; }
    pseudoFS();                                   // iOS Safari (iPhone): справжнього fullscreen нема
  } catch (e) { pseudoFS(); }
}
