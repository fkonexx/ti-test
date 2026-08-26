// ============================================================
//  ЧОТИРИ ІМПЕРІЇ (v4) — сервер
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

const W = 60, H = 60;
const COLORS = ['red', 'blue', 'green', 'yellow'];
const BASES = [{ cx: 7, cy: 7 }, { cx: 52, cy: 7 }, { cx: 7, cy: 52 }, { cx: 52, cy: 52 }];
const TICK_MS = 120;
const DT = TICK_MS / 1000;
const DEBUG_CODE = 'LNQ247';
const TOKEN_TIME = 30;                 // повільніше: 30с на жетон
const ARMY_PER_BARRACKS = 5;           // ліміт армії за 1 казарму
const INF_BASE = 6, INF_STEP = 2;      // зона будівництва навколо ГІЛЬДІЇ
const DAY_CYCLE = 110, DAY_LEN = 70;   // 70с день / 40с ніч

const BIOME_MULT = [
  { mine: 1.5, farm: 1.0, lumber: 0.5 },
  { mine: 0.5, farm: 1.5, lumber: 1.0 },
  { mine: 1.0, farm: 0.5, lumber: 1.5 },
];
// cls: inf(піхота) rng(дальник) cav(кіннота/спритні) siege(облога)
const UNIT = {
  sword:    { hp: 60,  dmg: 9,  range: 1.0, aggro: 3.0, speed: 2.6, cd: 0.7, food: 15, gold: 10, splash: 0,   army: 1, cls: 'inf', build: 3.0 },
  archer:   { hp: 28,  dmg: 8,  range: 4.0, aggro: 5.0, speed: 2.4, cd: 0.9, food: 12, gold: 14, splash: 0,   army: 1, cls: 'rng', build: 3.5 },
  mage:     { hp: 24,  dmg: 12, range: 3.6, aggro: 5.0, speed: 2.2, cd: 1.2, food: 10, gold: 22, splash: 1.6, army: 2, cls: 'rng', build: 5.0 },
  spear:    { hp: 55,  dmg: 8,  range: 1.3, aggro: 3.0, speed: 2.5, cd: 0.8, food: 15, gold: 12, splash: 0,   army: 3, cls: 'inf', build: 3.5 },
  assassin: { hp: 34,  dmg: 14, range: 1.0, aggro: 3.5, speed: 3.9, cd: 0.5, food: 14, gold: 20, splash: 0,   army: 3, cls: 'cav', build: 4.0 },
  catapult: { hp: 120, dmg: 26, range: 6.0, aggro: 7.0, speed: 1.1, cd: 2.2, food: 20, gold: 35, splash: 1.4, army: 4, cls: 'siege', build: 8.0 },
  ram:      { hp: 170, dmg: 40, range: 1.4, aggro: 2.5, speed: 1.3, cd: 2.8, food: 22, gold: 30, splash: 0,   army: 5, cls: 'siege', build: 7.0, vsBuilding: 2.2 },
};
// камінь-ножиці-папір: множник шкоди attacker.cls -> target.cls
const RPS = {
  inf: { rng: 1.4 },              // піхота добиває дальників у ближньому бою
  rng: { inf: 1.75 },             // лучники нищать піхоту
  cav: { rng: 1.75 },             // спритні вбивці ловлять дальників
  spear: { cav: 2.0 },            // (спец нижче) списоносці б'ють кінноту
};
function rpsMult(atkType, tgtType) {
  const a = UNIT[atkType], t = UNIT[tgtType];
  if (!a || !t) return 1;
  if (atkType === 'spear' && t.cls === 'cav') return 2.0;    // списоносець проти кінноти
  const m = RPS[a.cls]; return m && m[t.cls] ? m[t.cls] : 1;
}
const BUILD = {
  guild:    { hp: 600, cost: {},                              construction: 0 },
  mine:     { hp: 90,  cost: { wood: 30, stone: 10, gold: 10 }, res: 'stone', kind: 'mine',   rate: 1.1, construction: 1 },
  lumber:   { hp: 90,  cost: { wood: 10, stone: 20, gold: 10 }, res: 'wood',  kind: 'lumber', rate: 1.1, construction: 1 },
  farm:     { hp: 80,  cost: { wood: 20, stone: 10, gold: 10 }, res: 'food',  kind: 'farm',   rate: 1.1, construction: 1 },
  barracks: { hp: 140, cost: { wood: 40, stone: 40, gold: 20 }, construction: 2 },
  tower:    { hp: 180, cost: { wood: 30, stone: 60, gold: 30 }, range: 4.2, dmg: 11, cd: 0.8,            construction: 3 },
  cannon:   { hp: 220, cost: { wood: 40, stone: 90, gold: 50 }, range: 6.0, dmg: 24, cd: 1.8, splash: 1.3, construction: 4 },
  landmine: { hp: 1,   cost: { wood: 10, stone: 30, gold: 10 }, trap: true, dmg: 70, radius: 1.8,        construction: 5 },
};
const TECH_KEYS = ['construction', 'army', 'influence', 'mining', 'lumber', 'farming', 'warfare', 'defense', 'scouting', 'engineering'];

const rooms = {};
function makeCode() { const s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 6; i++) c += s[Math.floor(Math.random() * s.length)]; return c; }
function newRoomCode() { let c; do { c = makeCode(); } while (rooms[c]); return c; }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function playerOf(s, i) { return s.players.find(p => p.index === i); }

function generateBiomes() {
  const g = new Array(W * H); const seeds = [];
  for (let i = 0; i < 14; i++) seeds.push({ x: Math.random() * W, y: Math.random() * H, b: i % 3 });
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { let best = 1e9, b = 1; for (const s of seeds) { const d = (s.x - c) ** 2 + (s.y - r) ** 2; if (d < best) { best = d; b = s.b; } } g[r * W + c] = b; }
  return g;
}
function claim(s, owner, cx, cy, rad) { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) { const c = cx + dx, r = cy + dy; if (c >= 0 && c < W && r >= 0 && r < H) s.grid[r * W + c] = owner; } }
function newStats() { return { made: 0, lost: 0, built: 0, blost: 0, kills: 0, razed: 0, gathered: 0 }; }
function newPlayer(index) {
  return {
    index, color: COLORS[index], alive: true,
    res: { wood: 90, stone: 90, food: 70, gold: 100, tokens: 5 },
    tech: { construction: 0, army: 0, influence: 0, mining: 0, lumber: 0, farming: 0, warfare: 0, defense: 0, scouting: 0, engineering: 0 },
    guildLevel: 1, guildXP: 0, tokenTimer: TOKEN_TIME, tokensSpent: 0, stats: newStats(),
  };
}
function warMult(p) { return 1 + 0.10 * p.tech.warfare; }
function defMult(p) { return 1 + 0.12 * p.tech.defense; }

function spawnUnit(s, owner, type, x, y, scout) {
  const def = UNIT[type] || { hp: 40 }; const p = playerOf(s, owner);
  const hp = scout ? 40 : Math.round(def.hp * warMult(p));
  s.units.push({ id: s.nextId++, owner, type, x, y, mx: x, my: y, hasCmd: false, hp, maxHp: hp, cd: 0, scout: !!scout });
  if (!scout && p) p.stats.made++;
}
function addBuilding(s, owner, type, cx, cy) {
  const def = BUILD[type]; const p = playerOf(s, owner);
  const hp = Math.round(def.hp * (type === 'landmine' ? 1 : defMult(p)));
  const b = { id: s.nextId++, owner, type, cx, cy, hp, maxHp: hp, cd: 0 };
  if (type === 'barracks') b.queue = [];
  s.buildings.push(b);
  claim(s, owner, cx, cy, type === 'guild' ? 2 : 1);
  if (type !== 'guild' && p) p.stats.built++;
  return b;
}
function initGame(room) {
  const s = { W, H, biomes: generateBiomes(), grid: new Array(W * H).fill(-1), units: [], buildings: [], players: [], nextId: 1, winner: null, t: 0, weather: 'clear', weatherTimer: 40, shots: [] };
  room.players.forEach(p => {
    s.players.push(newPlayer(p.index));
    const b = BASES[p.index];
    addBuilding(s, p.index, 'guild', b.cx, b.cy);
    spawnUnit(s, p.index, 'scout', b.cx, b.cy - 1, true);   // лише розвідник, без стартових воїнів
  });
  room.state = s; room.lastGrid = {}; room.debugFog = false;
}

// армія / ліміт
function barracksOf(s, owner) { return s.buildings.filter(b => b.owner === owner && b.type === 'barracks'); }
function armyCap(s, owner) { return barracksOf(s, owner).length * ARMY_PER_BARRACKS; }
function armyCount(s, owner) { let n = 0; for (const u of s.units) if (u.owner === owner && !u.scout) n++; for (const b of barracksOf(s, owner)) n += b.queue.length; return n; }

function isNight(s) { return (s.t % DAY_CYCLE) >= DAY_LEN; }

// ---------------- БІЙ ----------------
function nearestEnemy(s, owner, x, y, maxR) {
  let best = null, bd = maxR;
  for (const u of s.units) { if (u.owner === owner || u.hp <= 0 || u.scout) continue; const d = dist(x, y, u.x, u.y); if (d <= bd) { bd = d; best = { ref: u, x: u.x, y: u.y, dist: d, isB: false }; } }
  for (const b of s.buildings) { if (b.owner === owner || b.hp <= 0 || b.type === 'landmine') continue; const d = dist(x, y, b.cx, b.cy); if (d <= bd) { bd = d; best = { ref: b, x: b.cx, y: b.cy, dist: d, isB: true }; } }
  return best;
}
function credit(s, attacker, isB) { const p = playerOf(s, attacker); if (!p) return; if (isB) p.stats.razed++; else p.stats.kills++; }
function applyDamage(s, attacker, tgt, dmg, splash) {
  const px = tgt.x, py = tgt.y;
  const was = tgt.ref.hp > 0; tgt.ref.hp -= dmg;
  if (was && tgt.ref.hp <= 0) credit(s, attacker, tgt.isB);
  if (splash > 0) for (const u of s.units) { if (u.owner === attacker || u.hp <= 0 || u.scout || u === tgt.ref) continue; if (dist(px, py, u.x, u.y) <= splash) { const w = u.hp > 0; u.hp -= dmg * 0.6; if (w && u.hp <= 0) credit(s, attacker, false); } }
}

// ---------------- ТІК ----------------
function step(room) {
  const s = room.state;
  if (!s || s.winner !== null) return;
  s.t += DT; s.shots = [];
  // погода
  s.weatherTimer -= DT;
  if (s.weatherTimer <= 0) { s.weather = Math.random() < 0.35 ? 'rain' : 'clear'; s.weatherTimer = 30 + Math.random() * 40; }
  const speedMul = s.weather === 'rain' ? 0.7 : 1;

  // економіка (повільніше)
  for (const p of s.players) {
    if (!p.alive) continue;
    const g = p.guildLevel * 1.2 * DT; p.res.gold += g; p.stats.gathered += g;
    p.tokenTimer -= DT * (1 + 0.25 * p.tech.engineering);
    if (p.tokenTimer <= 0) { p.res.tokens += 1; p.tokenTimer = TOKEN_TIME; }
    p.guildXP += (1 + p.tokensSpent * 0.03) * DT;
    if (p.guildLevel < 8 && p.guildXP >= p.guildLevel * 30) { p.guildXP = 0; p.guildLevel++; }
  }
  for (const b of s.buildings) {
    const def = BUILD[b.type]; if (!def.res) continue;
    const p = playerOf(s, b.owner); if (!p || !p.alive) continue;
    const biome = s.biomes[b.cy * W + b.cx];
    const techBonus = 1 + 0.20 * p.tech[def.kind === 'mine' ? 'mining' : def.kind === 'lumber' ? 'lumber' : 'farming'];
    const amt = def.rate * BIOME_MULT[biome][def.kind] * techBonus * DT;
    p.res[def.res] += amt; p.stats.gathered += amt;
  }
  // черга виробництва в казармах
  for (const b of s.buildings) {
    if (b.type !== 'barracks' || !b.queue.length) continue;
    const q = b.queue[0]; q.time -= DT;
    if (q.time <= 0) {
      const offs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [2, 0], [0, 2]];
      let sx = b.cx, sy = b.cy;
      for (const [dx, dy] of offs) { const c = b.cx + dx, r = b.cy + dy; if (c >= 0 && c < W && r >= 0 && r < H) { sx = c; sy = r; break; } }
      spawnUnit(s, b.owner, q.type, sx, sy);
      b.queue.shift();
    }
  }
  // вежі/пушки
  for (const b of s.buildings) {
    b.cd = Math.max(0, b.cd - DT); const def = BUILD[b.type];
    if ((b.type === 'tower' || b.type === 'cannon') && b.cd <= 0) {
      const t = nearestEnemy(s, b.owner, b.cx, b.cy, def.range);
      if (t) { applyDamage(s, b.owner, t, def.dmg, def.splash || 0); b.cd = def.cd; s.shots.push({ x: b.cx, y: b.cy, tx: t.x, ty: t.y, k: b.type === 'cannon' ? 'ball' : 'arrow' }); }
    }
    if (b.type === 'landmine') {
      let boom = false;
      for (const u of s.units) { if (u.owner === b.owner || u.hp <= 0 || u.scout) continue; if (dist(b.cx, b.cy, u.x, u.y) <= def.radius) { boom = true; break; } }
      if (boom) { for (const u of s.units) { if (u.owner === b.owner || u.hp <= 0 || u.scout) continue; if (dist(b.cx, b.cy, u.x, u.y) <= def.radius) { const w = u.hp > 0; u.hp -= def.dmg; if (w && u.hp <= 0) credit(s, b.owner, false); } } b.hp = 0; }
    }
  }
  // юніти
  for (const u of s.units) {
    u.cd = Math.max(0, u.cd - DT);
    if (u.scout) {
      if (u.hasCmd) { if (dist(u.x, u.y, u.mx, u.my) <= 0.15) { u.x = u.mx; u.y = u.my; u.hasCmd = false; } else moveTo(u, [u.mx, u.my], 3.4 * speedMul + 0.4 * playerOf(s, u.owner).tech.scouting); }
      continue;
    }
    const def = UNIT[u.type]; const p = playerOf(s, u.owner);
    const tgt = nearestEnemy(s, u.owner, u.x, u.y, Math.max(def.range, def.aggro) + 0.5);
    let attacked = false;
    if (tgt && tgt.dist <= def.range + 0.05) {
      if (u.cd <= 0) {
        let dmg = def.dmg * warMult(p);
        if (def.vsBuilding && tgt.isB) dmg *= def.vsBuilding;
        if (!tgt.isB) dmg *= rpsMult(u.type, tgt.ref.type);
        applyDamage(s, u.owner, tgt, dmg, def.splash);
        u.cd = def.cd;
        if (def.range > 1.6) s.shots.push({ x: u.x, y: u.y, tx: tgt.x, ty: tgt.y, k: u.type === 'mage' ? 'magic' : u.type === 'catapult' ? 'ball' : 'arrow' });
      }
      attacked = true;
    }
    if (!attacked) {
      let dest = null;
      if (u.hasCmd) {
        const d = dist(u.x, u.y, u.mx, u.my);
        if (d <= 0.15) { u.x = u.mx; u.y = u.my; u.hasCmd = false; }   // прибуття: фіксуємось (кінець смиканню)
        else dest = [u.mx, u.my];
      }
      // авто-переслідування лише якщо ворог помітно ДАЛІ радіуса атаки (гістерезис проти смикання)
      if (!dest && tgt && tgt.dist <= def.aggro && tgt.dist > def.range + 0.4) dest = [tgt.x, tgt.y];
      if (dest) moveTo(u, dest, def.speed * speedMul);
    }
  }
  // мертві
  s.units = s.units.filter(u => { if (u.hp > 0) return true; if (!u.scout) { const p = playerOf(s, u.owner); if (p) p.stats.lost++; } return false; });
  const deadGuilds = [];
  s.buildings = s.buildings.filter(b => { if (b.hp > 0) return true; const p = playerOf(s, b.owner); if (p) p.stats.blost++; if (b.type === 'guild') deadGuilds.push(b.owner); return false; });
  for (const owner of deadGuilds) { const p = playerOf(s, owner); if (p) p.alive = false; s.units = s.units.filter(u => u.owner !== owner); s.buildings = s.buildings.filter(b => b.owner !== owner); }
  // територія
  for (const u of s.units) { if (u.scout) continue; const c = Math.round(u.x), r = Math.round(u.y); if (c >= 0 && c < W && r >= 0 && r < H) s.grid[r * W + c] = u.owner; }

  if (!room.debug) { const alive = s.players.filter(p => p.alive); if (alive.length <= 1) return finishGame(room, alive.length === 1 ? alive[0].index : -1); }
  broadcast(room);
}
function moveTo(u, dest, speed) { if (!dest) return; const dx = dest[0] - u.x, dy = dest[1] - u.y, d = Math.hypot(dx, dy); if (d > 0.01) { const s = Math.min(1, speed * DT / d); u.x = clamp(u.x + dx * s, 0, W - 1); u.y = clamp(u.y + dy * s, 0, H - 1); } }

// ---------------- ВИДИМІСТЬ + СЕРІАЛІЗАЦІЯ ----------------
function visibleCells(s, owner) {
  const vis = new Uint8Array(W * H);
  const night = isNight(s) ? 0.62 : 1;
  const mark = (cx, cy, rr) => { const r = Math.max(2, Math.round(rr * night)), r2 = r * r; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (dx * dx + dy * dy > r2) continue; const c = (cx | 0) + dx, rw = (cy | 0) + dy; if (c >= 0 && c < W && rw >= 0 && rw < H) vis[rw * W + c] = 1; } };
  const scoutR = 9 + 1.6 * playerOf(s, owner).tech.scouting;
  for (const u of s.units) if (u.owner === owner) mark(u.x, u.y, u.scout ? scoutR : 4);
  for (const b of s.buildings) if (b.owner === owner) mark(b.cx, b.cy, b.type === 'guild' ? 7 : 5);
  return vis;
}
function serializeEntities(s, owner, full, vis) {
  const seen = (c, r) => full || vis[r * W + c] === 1;
  const me = playerOf(s, owner) || s.players[0];
  const units = [];
  for (const u of s.units) {
    if (u.scout && u.owner !== owner && !full) continue;
    if (u.owner !== owner && !full && !seen(Math.round(u.x), Math.round(u.y))) continue;
    units.push({ i: u.id, o: u.owner, t: u.type, x: Math.round(u.x * 100) / 100, y: Math.round(u.y * 100) / 100, h: Math.round(u.hp), m: u.maxHp, s: u.scout ? 1 : 0 });
  }
  const builds = [];
  for (const b of s.buildings) {
    if (b.type === 'landmine' && b.owner !== owner && !full) continue;
    if (b.owner !== owner && !full && !seen(b.cx, b.cy)) continue;
    const o = { i: b.id, o: b.owner, t: b.type, x: b.cx, y: b.cy, h: Math.round(b.hp), m: b.maxHp };
    if (b.type === 'guild') { const gp = playerOf(s, b.owner); o.gl = gp ? gp.guildLevel : 1; }
    if (b.type === 'barracks' && b.owner === owner) { o.q = b.queue.length; if (b.queue.length) { const f = b.queue[0]; o.prog = 1 - f.time / f.total; o.qt = f.type; } }
    builds.push(o);
  }
  const shots = [];
  for (const sh of s.shots) if (full || (vis[(sh.y | 0) * W + (sh.x | 0)] === 1) || (vis[(sh.ty | 0) * W + (sh.tx | 0)] === 1)) shots.push(sh);
  return {
    winner: s.winner, units, buildings: builds, shots, weather: s.weather, night: isNight(s),
    me: { index: me.index, color: me.color, alive: me.alive, res: roundRes(me.res), tech: me.tech, guildLevel: me.guildLevel, guildProg: Math.min(1, me.guildXP / (me.guildLevel * 30)), army: armyCount(s, owner), cap: armyCap(s, owner) },
    players: s.players.map(p => ({ index: p.index, color: p.color, alive: p.alive })),
  };
}
function roundRes(r) { const o = {}; for (const k in r) o[k] = Math.floor(r[k]); return o; }
function gridFor(s, owner, full, vis) { const out = new Array(W * H); for (let i = 0; i < W * H; i++) { const o = s.grid[i]; out[i] = full ? o : (vis[i] ? o : (o === owner ? o : -2)); } return out; }
function sendState(sock, room, owner, full, key) {
  const s = room.state;
  const vis = full ? null : visibleCells(s, owner);
  const ent = serializeEntities(s, owner, full, vis);
  const g = gridFor(s, owner, full, vis);
  const last = room.lastGrid[key];
  if (!last) ent.gridFull = g; else { const diff = []; for (let i = 0; i < g.length; i++) if (g[i] !== last[i]) diff.push(i, g[i]); ent.gridDiff = diff; }
  room.lastGrid[key] = g;
  sock.emit('state', ent);
}
function broadcast(room) {
  const s = room.state; if (!s) return;
  if (room.debug) { const sock = io.sockets.sockets.get(room.host); if (sock) sendState(sock, room, sock.data.index, !room.debugFog, 'd'); return; }
  for (const p of room.players) { const sock = io.sockets.sockets.get(p.id); if (sock) sendState(sock, room, p.index, false, p.index); }
}

// ---------------- КІНЕЦЬ + СТАТИСТИКА ----------------
function buildStats(s) {
  const terr = new Array(s.players.length).fill(0);
  for (let i = 0; i < W * H; i++) { const o = s.grid[i]; if (o >= 0) terr[o] = (terr[o] || 0) + 1; }
  return s.players.map(p => ({ index: p.index, color: p.color, alive: p.alive, made: p.stats.made, lost: p.stats.lost, built: p.stats.built, blost: p.stats.blost, kills: p.stats.kills, razed: p.stats.razed, gathered: Math.floor(p.stats.gathered), guildLevel: p.guildLevel, territory: terr[p.index] || 0 }));
}
function scoreOf(x) { return x.territory + x.kills * 6 + x.razed * 20 + x.built * 3 + (x.alive ? 300 : 0); }
function chooseWinner(s) { const st = buildStats(s); let best = -1, bs = -1e9; for (const x of st) { const sc = scoreOf(x); if (sc > bs) { bs = sc; best = x.index; } } return best; }
function finishGame(room, winner) { const s = room.state; if (!s) return; s.winner = winner; if (room.loop) { clearInterval(room.loop); room.loop = null; } broadcast(room); io.to(room.code).emit('gameOver', { winner, stats: buildStats(s) }); }

// ---------------- ЛОБІ / КІМНАТИ ----------------
function broadcastLobby(room) { io.to(room.code).emit('lobby', { code: room.code, host: room.host, started: room.started, players: room.players.map(p => ({ index: p.index, color: p.color, name: p.name, connected: p.connected, id: p.id })) }); }
function leaveCurrentRoom(socket) {
  const code = socket.data.room; socket.data.room = null;
  if (!code) return; const room = rooms[code]; if (!room) return; socket.leave(code);
  if (room.debug) { if (room.loop) clearInterval(room.loop); delete rooms[code]; return; }
  if (!room.started) {
    room.players = room.players.filter(p => p.id !== socket.id);
    room.players.forEach((p, i) => { p.index = i; p.color = COLORS[i]; });
    if (room.players.length === 0) { if (room.loop) clearInterval(room.loop); delete rooms[code]; return; }
    if (room.host === socket.id) room.host = room.players[0].id;
    broadcastLobby(room);
  } else {
    const p = room.players.find(pp => pp.id === socket.id); if (p) p.connected = false;
    if (room.players.every(pp => !pp.connected)) { if (room.loop) clearInterval(room.loop); delete rooms[code]; } else broadcastLobby(room);
  }
}
function startDebug(socket) {
  const code = newRoomCode();
  const room = { code, host: socket.id, started: false, players: [], state: null, loop: null, debug: true };
  rooms[code] = room;
  for (let i = 0; i < 4; i++) room.players.push({ id: socket.id, name: 'Імперія ' + (i + 1), index: i, color: COLORS[i], connected: true });
  socket.data.room = code; socket.data.index = 0; socket.data.debug = true;
  socket.join(code); initGame(room); room.started = true;
  socket.emit('joined', { code, index: 0, color: COLORS[0], host: true, debug: true });
  socket.emit('gameStarted', { W, H, biomes: room.state.biomes, debug: true });
  room.loop = setInterval(() => step(room), TICK_MS);
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ name } = {}) => {
    leaveCurrentRoom(socket);
    const code = newRoomCode();
    const room = { code, host: socket.id, started: false, players: [], state: null, loop: null };
    rooms[code] = room;
    room.players.push({ id: socket.id, name: (name || 'Гравець 1').slice(0, 16), index: 0, color: COLORS[0], connected: true });
    socket.data.room = code; socket.data.index = 0; socket.data.debug = false;
    socket.join(code); socket.emit('joined', { code, index: 0, color: COLORS[0], host: true }); broadcastLobby(room);
  });
  socket.on('joinRoom', ({ code, name } = {}) => {
    code = (code || '').toUpperCase().trim(); leaveCurrentRoom(socket);
    if (code === DEBUG_CODE) return startDebug(socket);
    const room = rooms[code];
    if (!room) return socket.emit('errorMsg', 'Кімнату не знайдено');
    if (room.started) return socket.emit('errorMsg', 'Гра вже почалась');
    if (room.players.length >= 4) return socket.emit('errorMsg', 'Кімната повна (макс. 4)');
    const index = room.players.length;
    room.players.push({ id: socket.id, name: (name || ('Гравець ' + (index + 1))).slice(0, 16), index, color: COLORS[index], connected: true });
    socket.data.room = code; socket.data.index = index; socket.data.debug = false;
    socket.join(code); socket.emit('joined', { code, index, color: COLORS[index], host: room.host === socket.id }); broadcastLobby(room);
  });
  socket.on('startGame', () => {
    const room = rooms[socket.data.room];
    if (!room || room.host !== socket.id || room.started) return;
    if (room.players.length < 2) return socket.emit('errorMsg', 'Потрібно щонайменше 2 гравці');
    initGame(room); room.started = true;
    io.to(room.code).emit('gameStarted', { W, H, biomes: room.state.biomes });
    room.loop = setInterval(() => step(room), TICK_MS); broadcastLobby(room);
  });
  socket.on('switchEmpire', () => { if (!socket.data.debug) return; const room = rooms[socket.data.room]; if (!room) return; socket.data.index = (socket.data.index + 1) % room.players.length; room.lastGrid = {}; socket.emit('empireSwitched', { index: socket.data.index, color: COLORS[socket.data.index] }); });
  socket.on('toggleFog', () => { if (!socket.data.debug) return; const room = rooms[socket.data.room]; if (!room) return; room.debugFog = !room.debugFog; room.lastGrid = {}; socket.emit('fogToggled', { on: room.debugFog }); });
  socket.on('debugEnd', () => { if (!socket.data.debug) return; const room = rooms[socket.data.room]; if (!room || !room.state) return; finishGame(room, chooseWinner(room.state)); });

  socket.on('command', (cmd) => {
    const room = rooms[socket.data.room];
    if (!room || !room.started || !room.state || room.state.winner !== null) return;
    const s = room.state, owner = socket.data.index; const me = playerOf(s, owner);
    if (!me || !me.alive) return;

    if (cmd.type === 'move') {
      const x = clamp(cmd.x, 0, W - 1), y = clamp(cmd.y, 0, H - 1); const ids = new Set(cmd.ids || []);
      for (const u of s.units) if (u.owner === owner && ids.has(u.id)) { u.mx = x; u.my = y; u.hasCmd = true; }
    }
    else if (cmd.type === 'tech') {
      const k = cmd.branch; if (!TECH_KEYS.includes(k)) return;
      const lvl = me.tech[k]; if (lvl >= 5) return; const cost = lvl + 1;
      if (me.res.tokens < cost) return;
      me.res.tokens -= cost; me.tech[k] = lvl + 1; me.tokensSpent += cost;
    }
    else if (cmd.type === 'produce') {
      const type = cmd.unit, def = UNIT[type]; if (!def) return;
      if (me.tech.army < def.army) return;
      const b = s.buildings.find(bb => bb.id === cmd.building && bb.owner === owner && bb.type === 'barracks');
      if (!b) return;                                          // виробляти можна ЛИШЕ в казармі
      if (armyCount(s, owner) >= armyCap(s, owner)) return;    // ліміт армії
      if (me.res.food < def.food || me.res.gold < def.gold) return;
      me.res.food -= def.food; me.res.gold -= def.gold;
      b.queue.push({ type, time: def.build, total: def.build });
    }
    else if (cmd.type === 'build') {
      const type = cmd.build, def = BUILD[type]; if (!def || type === 'guild') return;
      if (me.tech.construction < def.construction) return;
      const cx = cmd.cx | 0, cy = cmd.cy | 0;
      if (cx < 0 || cx >= W || cy < 0 || cy >= H) return;
      if (s.buildings.some(b => b.cx === cx && b.cy === cy)) return;
      const guild = s.buildings.find(b => b.owner === owner && b.type === 'guild'); if (!guild) return;
      const R = INF_BASE + me.tech.influence * INF_STEP;       // зона ТІЛЬКИ від гільдії
      if (Math.max(Math.abs(cx - guild.cx), Math.abs(cy - guild.cy)) > R) return;
      const c = def.cost;
      if ((me.res.wood || 0) < (c.wood || 0) || (me.res.stone || 0) < (c.stone || 0) || (me.res.gold || 0) < (c.gold || 0)) return;
      me.res.wood -= (c.wood || 0); me.res.stone -= (c.stone || 0); me.res.gold -= (c.gold || 0);
      addBuilding(s, owner, type, cx, cy);
    }
  });

  socket.on('disconnect', () => { leaveCurrentRoom(socket); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Чотири Імперії v4 — сервер на порту ' + PORT));
