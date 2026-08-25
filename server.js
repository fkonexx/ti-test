// ============================================================
//  ЧОТИРИ ІМПЕРІЇ (v2) — сервер (Node.js + Socket.IO)
//  4 гравці, туман війни, біоми, 5 ресурсів, дерево технологій.
//  Сервер — єдине джерело правди; кожному гравцю шле СВІЙ зріз
//  карти (він бачить лише те, що в його зоні видимості).
// ============================================================

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/health', (req, res) => res.send('ok'));

const server = http.createServer(app);
const io = new Server(server);

// ---------------- НАЛАШТУВАННЯ ----------------
const W = 40, H = 40;                              // велика карта
const COLORS = ['red', 'blue', 'green', 'yellow'];
const BASES = [{ cx: 5, cy: 5 }, { cx: 34, cy: 5 }, { cx: 5, cy: 34 }, { cx: 34, cy: 34 }];
const TICK_MS = 120;
const DT = TICK_MS / 1000;
const DEBUG_CODE = 'LNQ247';
const TOKEN_TIME = 18;                             // сек на 1 жетон інженера (базово)

// біоми: 0 гори, 1 рівнина, 2 ліс. Множники до ресурсних будівель.
const BIOME_MULT = [
  { mine: 1.5, farm: 1.0, lumber: 0.5 }, // гори
  { mine: 0.5, farm: 1.5, lumber: 1.0 }, // рівнина
  { mine: 1.0, farm: 0.5, lumber: 1.5 }, // ліс
];

// юніти. dmg/hp додатково множаться техою «Військова справа».
const UNIT = {
  sword:    { hp: 60,  dmg: 9,  range: 1.0, aggro: 3.0, speed: 2.6, cd: 0.7, food: 15, gold: 10, splash: 0,   army: 1 },
  archer:   { hp: 28,  dmg: 8,  range: 4.0, aggro: 5.0, speed: 2.4, cd: 0.9, food: 12, gold: 14, splash: 0,   army: 1 },
  mage:     { hp: 24,  dmg: 12, range: 3.6, aggro: 5.0, speed: 2.2, cd: 1.2, food: 10, gold: 22, splash: 1.6, army: 2 },
  assassin: { hp: 34,  dmg: 14, range: 1.0, aggro: 3.5, speed: 3.9, cd: 0.5, food: 14, gold: 20, splash: 0,   army: 3 },
  catapult: { hp: 120, dmg: 26, range: 6.0, aggro: 7.0, speed: 1.1, cd: 2.2, food: 20, gold: 35, splash: 1.4, army: 4 },
  ram:      { hp: 170, dmg: 40, range: 1.4, aggro: 2.5, speed: 1.3, cd: 2.8, food: 22, gold: 30, splash: 0,   army: 5, vsBuilding: 2.2 },
};
// споруди. hp множиться техою «Захист». construction — рівень техи для розблокування.
const BUILD = {
  guild:    { hp: 600, cost: {},                              construction: 0 },
  mine:     { hp: 90,  cost: { wood: 30, stone: 10, gold: 10 }, res: 'stone', kind: 'mine',   rate: 2, construction: 1 },
  lumber:   { hp: 90,  cost: { wood: 10, stone: 20, gold: 10 }, res: 'wood',  kind: 'lumber', rate: 2, construction: 1 },
  farm:     { hp: 80,  cost: { wood: 20, stone: 10, gold: 10 }, res: 'food',  kind: 'farm',   rate: 2, construction: 1 },
  barracks: { hp: 140, cost: { wood: 40, stone: 40, gold: 20 }, construction: 2 },
  tower:    { hp: 180, cost: { wood: 30, stone: 60, gold: 30 }, range: 4.2, dmg: 11, cd: 0.8,            construction: 3 },
  cannon:   { hp: 220, cost: { wood: 40, stone: 90, gold: 50 }, range: 6.0, dmg: 24, cd: 1.8, splash: 1.3, construction: 4 },
  landmine: { hp: 1,   cost: { wood: 10, stone: 30, gold: 10 }, trap: true, dmg: 70, radius: 1.8,        construction: 5 },
};
const TECH_KEYS = ['construction', 'army', 'influence', 'mining', 'lumber', 'farming', 'warfare', 'defense', 'scouting', 'engineering'];

const rooms = {};

// ---------------- УТИЛІТИ ----------------
function makeCode() { const s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 6; i++) c += s[Math.floor(Math.random() * s.length)]; return c; }
function newRoomCode() { let c; do { c = makeCode(); } while (rooms[c]); return c; }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function generateBiomes() {
  const g = new Array(W * H);
  const seeds = [];
  const n = 10;
  for (let i = 0; i < n; i++) seeds.push({ x: Math.random() * W, y: Math.random() * H, b: i % 3 });
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    let best = 1e9, b = 1;
    for (const s of seeds) { const d = (s.x - c) ** 2 + (s.y - r) ** 2; if (d < best) { best = d; b = s.b; } }
    g[r * W + c] = b;
  }
  return g;
}

function claim(s, owner, cx, cy, rad) {
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
    const c = cx + dx, r = cy + dy;
    if (c >= 0 && c < W && r >= 0 && r < H) s.grid[r * W + c] = owner;
  }
}
function newPlayer(index) {
  return {
    index, color: COLORS[index], alive: true,
    res: { wood: 140, stone: 140, food: 120, gold: 140, tokens: 5 },
    tech: { construction: 0, army: 0, influence: 0, mining: 0, lumber: 0, farming: 0, warfare: 0, defense: 0, scouting: 0, engineering: 0 },
    guildLevel: 1, guildXP: 0, tokenTimer: TOKEN_TIME, tokensSpent: 0,
  };
}
function warMult(p) { return 1 + 0.10 * p.tech.warfare; }
function defMult(p) { return 1 + 0.12 * p.tech.defense; }

function spawnUnit(s, owner, type, x, y, scout) {
  const def = UNIT[type] || { hp: 40 };
  const p = s.players.find(pp => pp.index === owner);
  const hp = scout ? 40 : Math.round(def.hp * warMult(p));
  s.units.push({ id: s.nextId++, owner, type, x, y, mx: x, my: y, hasCmd: false, hp, maxHp: hp, cd: 0, scout: !!scout });
}
function addBuilding(s, owner, type, cx, cy) {
  const def = BUILD[type];
  const p = s.players.find(pp => pp.index === owner);
  const hp = Math.round(def.hp * (type === 'landmine' ? 1 : defMult(p)));
  s.buildings.push({ id: s.nextId++, owner, type, cx, cy, hp, maxHp: hp, cd: 0 });
  claim(s, owner, cx, cy, type === 'guild' ? 2 : 1);
}

function initGame(room) {
  const s = { W, H, biomes: generateBiomes(), grid: new Array(W * H).fill(-1), units: [], buildings: [], players: [], nextId: 1, winner: null, t: 0 };
  room.players.forEach(p => {
    s.players.push(newPlayer(p.index));
    const b = BASES[p.index];
    addBuilding(s, p.index, 'guild', b.cx, b.cy);
    spawnUnit(s, p.index, 'sword', b.cx + 1, b.cy);
    spawnUnit(s, p.index, 'sword', b.cx - 1, b.cy);
    spawnUnit(s, p.index, 'sword', b.cx, b.cy + 1);
    spawnUnit(s, p.index, 'scout', b.cx, b.cy - 1, true);
  });
  room.state = s;
}

// ---------------- БІЙ ----------------
function nearestEnemy(s, owner, x, y, maxR) {
  let best = null, bd = maxR;
  for (const u of s.units) {
    if (u.owner === owner || u.hp <= 0 || u.scout) continue;    // розвідників не атакують
    const d = dist(x, y, u.x, u.y);
    if (d <= bd) { bd = d; best = { ref: u, x: u.x, y: u.y, dist: d, isB: false }; }
  }
  for (const b of s.buildings) {
    if (b.owner === owner || b.hp <= 0 || b.type === 'landmine') continue; // міни — пастки, їх не «таргетять»
    const d = dist(x, y, b.cx, b.cy);
    if (d <= bd) { bd = d; best = { ref: b, x: b.cx, y: b.cy, dist: d, isB: true }; }
  }
  return best;
}
function applyDamage(s, attackerOwner, tgt, dmg, splash) {
  const px = tgt.x, py = tgt.y;
  let d = dmg;
  tgt.ref.hp -= d;
  if (splash > 0) {
    for (const u of s.units) {
      if (u.owner === attackerOwner || u.hp <= 0 || u.scout || u === tgt.ref) continue;
      if (dist(px, py, u.x, u.y) <= splash) u.hp -= d * 0.6;
    }
  }
}

// ---------------- ТІК ----------------
function step(room) {
  const s = room.state;
  if (!s || s.winner !== null) return;
  s.t += DT;

  // 1) економіка
  for (const p of s.players) {
    if (!p.alive) continue;
    p.res.gold += p.guildLevel * 2.5 * DT;                       // пасивне золото від гільдії
    // жетони інженера
    p.tokenTimer -= DT * (1 + 0.25 * p.tech.engineering);
    if (p.tokenTimer <= 0) { p.res.tokens += 1; p.tokenTimer = TOKEN_TIME; }
    // рівень гільдії (пасивно + бонус від витрачених жетонів)
    p.guildXP += (1 + p.tokensSpent * 0.04) * DT;
    if (p.guildLevel < 8 && p.guildXP >= p.guildLevel * 18) { p.guildXP = 0; p.guildLevel++; }
  }
  // ресурси з будівель
  for (const b of s.buildings) {
    const def = BUILD[b.type];
    if (!def.res) continue;
    const p = s.players.find(pp => pp.index === b.owner); if (!p || !p.alive) continue;
    const biome = s.biomes[b.cy * W + b.cx];
    const techBonus = 1 + 0.20 * p.tech[def.kind === 'mine' ? 'mining' : def.kind === 'lumber' ? 'lumber' : 'farming'];
    p.res[def.res] += def.rate * BIOME_MULT[biome][def.kind] * techBonus * DT;
  }

  // 2) вежі / пушки стріляють
  for (const b of s.buildings) {
    b.cd = Math.max(0, b.cd - DT);
    const def = BUILD[b.type];
    if ((b.type === 'tower' || b.type === 'cannon') && b.cd <= 0) {
      const t = nearestEnemy(s, b.owner, b.cx, b.cy, def.range);
      if (t) { applyDamage(s, b.owner, t, def.dmg, def.splash || 0); b.cd = def.cd; }
    }
    // міни-пастки
    if (b.type === 'landmine') {
      let boom = false;
      for (const u of s.units) {
        if (u.owner === b.owner || u.hp <= 0 || u.scout) continue;
        if (dist(b.cx, b.cy, u.x, u.y) <= def.radius) { boom = true; break; }
      }
      if (boom) {
        for (const u of s.units) {
          if (u.owner === b.owner || u.hp <= 0 || u.scout) continue;
          if (dist(b.cx, b.cy, u.x, u.y) <= def.radius) u.hp -= def.dmg;
        }
        b.hp = 0;
      }
    }
  }

  // 3) юніти: бій + рух
  for (const u of s.units) {
    u.cd = Math.max(0, u.cd - DT);
    if (u.scout) { moveTo(u, u.hasCmd ? [u.mx, u.my] : null, 3.4 + 0.4 * ownerTech(s, u.owner, 'scouting')); continue; }
    const def = UNIT[u.type];
    const p = s.players.find(pp => pp.index === u.owner);
    const tgt = nearestEnemy(s, u.owner, u.x, u.y, Math.max(def.range, def.aggro) + 0.5);
    let attacking = false;
    if (tgt && tgt.dist <= def.range + 0.05) {
      if (u.cd <= 0) {
        let dmg = def.dmg * warMult(p);
        if (def.vsBuilding && tgt.isB) dmg *= def.vsBuilding;
        applyDamage(s, u.owner, tgt, dmg, def.splash);
        u.cd = def.cd;
      }
      attacking = true;
    }
    if (!attacking) {
      let dest = null;
      if (u.hasCmd) { if (dist(u.x, u.y, u.mx, u.my) > 0.15) dest = [u.mx, u.my]; else u.hasCmd = false; }
      if (!dest && tgt && tgt.dist <= def.aggro) dest = [tgt.x, tgt.y];
      moveTo(u, dest, def.speed);
    }
  }

  // 4) прибираємо мертвих
  s.units = s.units.filter(u => u.hp > 0);
  const deadGuilds = [];
  s.buildings = s.buildings.filter(b => { if (b.hp > 0) return true; if (b.type === 'guild') deadGuilds.push(b.owner); return false; });
  for (const owner of deadGuilds) {
    const p = s.players.find(pp => pp.index === owner); if (p) p.alive = false;
    s.units = s.units.filter(u => u.owner !== owner);
    s.buildings = s.buildings.filter(b => b.owner !== owner);
  }

  // 5) захоплення території (не розвідником)
  for (const u of s.units) {
    if (u.scout) continue;
    const c = Math.round(u.x), r = Math.round(u.y);
    if (c >= 0 && c < W && r >= 0 && r < H) s.grid[r * W + c] = u.owner;
  }

  // 6) перемога (не в дебазі)
  if (!room.debug) {
    const alive = s.players.filter(p => p.alive);
    if (alive.length <= 1) s.winner = alive.length === 1 ? alive[0].index : -1;
  }

  broadcast(room);
}
function moveTo(u, dest, speed) {
  if (!dest) return;
  const dx = dest[0] - u.x, dy = dest[1] - u.y, d = Math.hypot(dx, dy);
  if (d > 0.01) { u.x = clamp(u.x + dx / d * speed * DT, 0, W - 1); u.y = clamp(u.y + dy / d * speed * DT, 0, H - 1); }
}
function ownerTech(s, owner, key) { const p = s.players.find(pp => pp.index === owner); return p ? p.tech[key] : 0; }

// ---------------- ВИДИМІСТЬ + СЕРІАЛІЗАЦІЯ ----------------
function visibleCells(s, owner) {
  const vis = new Uint8Array(W * H);
  const mark = (cx, cy, r) => {
    const r2 = r * r;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const c = (cx | 0) + dx, rr = (cy | 0) + dy;
      if (c >= 0 && c < W && rr >= 0 && rr < H) vis[rr * W + c] = 1;
    }
  };
  const scoutR = 8 + Math.round(1.5 * ownerTech(s, owner, 'scouting'));
  for (const u of s.units) if (u.owner === owner) mark(u.x, u.y, u.scout ? scoutR : 4);
  for (const b of s.buildings) if (b.owner === owner) mark(b.cx, b.cy, b.type === 'guild' ? 7 : 5);
  return vis;
}
function serializeFor(s, owner, full) {
  const vis = full ? null : visibleCells(s, owner);
  const seen = (c, r) => full || vis[r * W + c] === 1;
  const me = s.players.find(p => p.index === owner) || s.players[0];

  const units = [];
  for (const u of s.units) {
    if (u.scout && u.owner !== owner && !full) continue;               // чужий розвідник — невидимий
    if (u.owner !== owner && !full && !seen(Math.round(u.x), Math.round(u.y))) continue;
    units.push({ i: u.id, o: u.owner, t: u.type, x: Math.round(u.x * 100) / 100, y: Math.round(u.y * 100) / 100, h: Math.round(u.hp), m: u.maxHp, s: u.scout ? 1 : 0 });
  }
  const builds = [];
  for (const b of s.buildings) {
    if (b.type === 'landmine' && b.owner !== owner && !full) continue; // чужа міна — невидима
    if (b.owner !== owner && !full && !seen(b.cx, b.cy)) continue;
    builds.push({ i: b.id, o: b.owner, t: b.type, x: b.cx, y: b.cy, h: Math.round(b.hp), m: b.maxHp });
  }
  // сітка володіння з туманом: -2 = туман
  const grid = new Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const o = s.grid[i];
    if (full) grid[i] = o;
    else if (vis[i]) grid[i] = o;
    else if (o === owner) grid[i] = o;
    else grid[i] = -2;
  }
  return {
    winner: s.winner,
    grid, units, buildings: builds,
    me: { index: me.index, color: me.color, alive: me.alive, res: roundRes(me.res), tech: me.tech, guildLevel: me.guildLevel, guildProg: Math.min(1, me.guildXP / (me.guildLevel * 18)) },
    players: s.players.map(p => ({ index: p.index, color: p.color, alive: p.alive })),
  };
}
function roundRes(r) { const o = {}; for (const k in r) o[k] = Math.floor(r[k]); return o; }

function broadcast(room) {
  const s = room.state; if (!s) return;
  if (room.debug) {
    const sock = io.sockets.sockets.get(room.host);
    if (sock) sock.emit('state', serializeFor(s, sock.data.index, true));   // дебаг = повна видимість
    return;
  }
  for (const p of room.players) {
    const sock = io.sockets.sockets.get(p.id);
    if (sock) sock.emit('state', serializeFor(s, p.index, false));
  }
}

// ---------------- ЛОБІ ----------------
function broadcastLobby(room) {
  io.to(room.code).emit('lobby', {
    code: room.code, host: room.host, started: room.started,
    players: room.players.map(p => ({ index: p.index, color: p.color, name: p.name, connected: p.connected, id: p.id })),
  });
}
function startDebug(socket) {
  const code = newRoomCode();
  const room = { code, host: socket.id, started: false, players: [], state: null, loop: null, debug: true };
  rooms[code] = room;
  for (let i = 0; i < 4; i++) room.players.push({ id: socket.id, name: 'Імперія ' + (i + 1), index: i, color: COLORS[i], connected: true });
  socket.data.room = code; socket.data.index = 0; socket.data.debug = true;
  socket.join(code);
  initGame(room);
  room.started = true;
  socket.emit('joined', { code, index: 0, color: COLORS[0], host: true, debug: true });
  socket.emit('gameStarted', { W, H, biomes: room.state.biomes, debug: true });
  room.loop = setInterval(() => step(room), TICK_MS);
}

// ---------------- ПІДКЛЮЧЕННЯ ----------------
io.on('connection', (socket) => {

  socket.on('createRoom', ({ name } = {}) => {
    const code = newRoomCode();
    const room = { code, host: socket.id, started: false, players: [], state: null, loop: null };
    rooms[code] = room;
    room.players.push({ id: socket.id, name: (name || 'Гравець 1').slice(0, 16), index: 0, color: COLORS[0], connected: true });
    socket.data.room = code; socket.data.index = 0;
    socket.join(code);
    socket.emit('joined', { code, index: 0, color: COLORS[0], host: true });
    broadcastLobby(room);
  });

  socket.on('joinRoom', ({ code, name } = {}) => {
    code = (code || '').toUpperCase().trim();
    if (code === DEBUG_CODE) return startDebug(socket);
    const room = rooms[code];
    if (!room) return socket.emit('errorMsg', 'Кімнату не знайдено');
    if (room.started) return socket.emit('errorMsg', 'Гра вже почалась');
    if (room.players.length >= 4) return socket.emit('errorMsg', 'Кімната повна (макс. 4)');
    const index = room.players.length;
    room.players.push({ id: socket.id, name: (name || ('Гравець ' + (index + 1))).slice(0, 16), index, color: COLORS[index], connected: true });
    socket.data.room = code; socket.data.index = index;
    socket.join(code);
    socket.emit('joined', { code, index, color: COLORS[index], host: room.host === socket.id });
    broadcastLobby(room);
  });

  socket.on('startGame', () => {
    const room = rooms[socket.data.room];
    if (!room || room.host !== socket.id || room.started) return;
    if (room.players.length < 2) return socket.emit('errorMsg', 'Потрібно щонайменше 2 гравці');
    initGame(room);
    room.started = true;
    io.to(room.code).emit('gameStarted', { W, H, biomes: room.state.biomes });
    room.loop = setInterval(() => step(room), TICK_MS);
    broadcastLobby(room);
  });

  socket.on('switchEmpire', () => {
    if (!socket.data.debug) return;
    const room = rooms[socket.data.room]; if (!room) return;
    socket.data.index = (socket.data.index + 1) % room.players.length;
    socket.emit('empireSwitched', { index: socket.data.index, color: COLORS[socket.data.index] });
  });

  socket.on('command', (cmd) => {
    const room = rooms[socket.data.room];
    if (!room || !room.started || !room.state) return;
    const s = room.state, owner = socket.data.index;
    const me = s.players.find(p => p.index === owner);
    if (!me || !me.alive) return;

    if (cmd.type === 'move') {
      const x = clamp(cmd.x, 0, W - 1), y = clamp(cmd.y, 0, H - 1);
      const ids = new Set(cmd.ids || []);
      for (const u of s.units) if (u.owner === owner && ids.has(u.id)) { u.mx = x; u.my = y; u.hasCmd = true; }
    }

    else if (cmd.type === 'tech') {
      const k = cmd.branch;
      if (!TECH_KEYS.includes(k)) return;
      const lvl = me.tech[k];
      if (lvl >= 5) return;
      const cost = lvl + 1;
      if (me.res.tokens < cost) return;
      me.res.tokens -= cost; me.tech[k] = lvl + 1; me.tokensSpent += cost;
    }

    else if (cmd.type === 'produce') {
      const type = cmd.unit, def = UNIT[type];
      if (!def) return;
      if (me.tech.army < def.army) return;                         // не розблоковано
      const b = s.buildings.find(bb => bb.id === cmd.building && bb.owner === owner && (bb.type === 'guild' || bb.type === 'barracks'));
      if (!b || b.cd > 0) return;
      if (me.res.food < def.food || me.res.gold < def.gold) return;
      me.res.food -= def.food; me.res.gold -= def.gold; b.cd = 0.9;
      const offs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [2, 0], [0, 2]];
      let sx = b.cx, sy = b.cy;
      for (const [dx, dy] of offs) { const c = b.cx + dx, r = b.cy + dy; if (c >= 0 && c < W && r >= 0 && r < H) { sx = c; sy = r; break; } }
      spawnUnit(s, owner, type, sx, sy);
    }

    else if (cmd.type === 'build') {
      const type = cmd.build, def = BUILD[type];
      if (!def || type === 'guild') return;
      if (me.tech.construction < def.construction) return;         // не розблоковано
      const cx = cmd.cx | 0, cy = cmd.cy | 0;
      if (cx < 0 || cx >= W || cy < 0 || cy >= H) return;
      if (s.buildings.some(b => b.cx === cx && b.cy === cy)) return;
      // вплив: будувати лише поряд зі своєю територією (радіус росте з технологією «Вплив»)
      const rad = 2 + me.tech.influence;
      let ok = false;
      for (let dy = -rad; dy <= rad && !ok; dy++) for (let dx = -rad; dx <= rad; dx++) {
        const c = cx + dx, r = cy + dy;
        if (c >= 0 && c < W && r >= 0 && r < H && s.grid[r * W + c] === owner) { ok = true; break; }
      }
      if (!ok) return;
      const c = def.cost;
      if ((me.res.wood || 0) < (c.wood || 0) || (me.res.stone || 0) < (c.stone || 0) || (me.res.gold || 0) < (c.gold || 0)) return;
      me.res.wood -= (c.wood || 0); me.res.stone -= (c.stone || 0); me.res.gold -= (c.gold || 0);
      addBuilding(s, owner, type, cx, cy);
    }
  });

  socket.on('disconnect', () => {
    const room = rooms[socket.data.room]; if (!room) return;
    if (room.debug) { clearInterval(room.loop); delete rooms[room.code]; return; }
    if (!room.started) {
      room.players = room.players.filter(p => p.id !== socket.id);
      room.players.forEach((p, i) => { p.index = i; p.color = COLORS[i]; });
      if (room.players.length === 0) { delete rooms[room.code]; return; }
      if (room.host === socket.id) room.host = room.players[0].id;
      broadcastLobby(room);
    } else {
      const p = room.players.find(pp => pp.id === socket.id);
      if (p) p.connected = false;
      broadcastLobby(room);
      if (room.players.every(pp => !pp.connected)) { clearInterval(room.loop); delete rooms[room.code]; }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Чотири Імперії — сервер на порту ' + PORT));
