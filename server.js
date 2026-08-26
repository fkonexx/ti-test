// ============================================================
//  ЧОТИРИ ІМПЕРІЇ (v5) — сервер
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
const TICK_MS = 120, DT = TICK_MS / 1000;
const DEBUG_CODE = 'LNQ247';
const TOKEN_TIME = 30;
const ARMY_PER_BARRACKS = 5;
const INF_BASE = 6, INF_STEP = 2;
const DAY_CYCLE = 110, DAY_LEN = 70;
const GUILD_CAP = 10;
const GUILD_PER_UPGRADE = 0.8;
const COLLECT_TIME = 12, BATCH_BASE = 14;
const SCOUT_RESPAWN = 180;
const SEP = 0.8;                         // мін. відстань між юнітами (розлипання)
const FLAG = { hp: 55, vision: 5, slots: 2, radius: 3, max: 3, minLevel: 6, cost: { wood: 100, stone: 100, gold: 250 } };

const BIOME_MULT = [
  { mine: 1.5, farm: 1.0, lumber: 0.5 },
  { mine: 0.5, farm: 1.5, lumber: 1.0 },
  { mine: 1.0, farm: 0.5, lumber: 1.5 },
];
const UNIT = {
  sword:     { hp: 60,  dmg: 9,  range: 1.0, aggro: 3.0, speed: 2.6, cd: 0.7, food: 15, gold: 10, splash: 0,   army: 1, cls: 'inf', build: 3.0 },
  archer:    { hp: 28,  dmg: 8,  range: 4.0, aggro: 5.0, speed: 2.4, cd: 0.9, food: 12, gold: 14, splash: 0,   army: 1, cls: 'rng', build: 3.5 },
  mage:      { hp: 24,  dmg: 12, range: 3.6, aggro: 5.0, speed: 2.2, cd: 1.2, food: 10, gold: 22, splash: 1.6, army: 2, cls: 'rng', build: 5.0 },
  spear:     { hp: 55,  dmg: 8,  range: 1.3, aggro: 3.0, speed: 2.5, cd: 0.8, food: 15, gold: 12, splash: 0,   army: 3, cls: 'inf', build: 3.5 },
  assassin:  { hp: 34,  dmg: 14, range: 1.0, aggro: 3.5, speed: 3.9, cd: 0.5, food: 14, gold: 20, splash: 0,   army: 3, cls: 'cav', build: 4.0 },
  catapult:  { hp: 120, dmg: 26, range: 6.0, aggro: 7.0, speed: 1.1, cd: 2.2, food: 20, gold: 35, splash: 1.4, army: 4, cls: 'siege', build: 8.0 },
  ram:       { hp: 170, dmg: 40, range: 1.4, aggro: 2.5, speed: 1.3, cd: 2.8, food: 22, gold: 30, splash: 0,   army: 5, cls: 'siege', build: 7.0, vsBuilding: 2.2 },
  commander: { hp: 150, dmg: 11, range: 1.2, aggro: 3.0, speed: 2.8, cd: 0.9, food: 30, gold: 60, splash: 0,   army: 5, cls: 'inf', build: 9.0, aura: 4.0, auraBonus: 0.35 },
};
const RPS = { inf: { rng: 1.4 }, rng: { inf: 1.75 }, cav: { rng: 1.75 } };
function rpsMult(atkType, tgtType) { const a = UNIT[atkType], t = UNIT[tgtType]; if (!a || !t) return 1; if (atkType === 'spear' && t.cls === 'cav') return 2.0; const m = RPS[a.cls]; return m && m[t.cls] ? m[t.cls] : 1; }

const BUILD = {
  guild:    { hp: 600, cost: {},                              construction: 0 },
  mine:     { hp: 90,  cost: { wood: 30, stone: 10, gold: 10 }, res: 'stone', kind: 'mine',   construction: 1 },
  lumber:   { hp: 90,  cost: { wood: 10, stone: 20, gold: 10 }, res: 'wood',  kind: 'lumber', construction: 1 },
  farm:     { hp: 80,  cost: { wood: 20, stone: 10, gold: 10 }, res: 'food',  kind: 'farm',   construction: 1 },
  barracks: { hp: 140, cost: { wood: 40, stone: 40, gold: 20 }, construction: 2 },
  tower:    { hp: 180, cost: { wood: 30, stone: 60, gold: 30 }, range: 4.2, dmg: 11, cd: 0.8,            construction: 3 },
  cannon:   { hp: 220, cost: { wood: 40, stone: 90, gold: 50 }, range: 6.0, dmg: 24, cd: 1.8, splash: 1.3, construction: 4 },
  landmine: { hp: 1,   cost: { wood: 10, stone: 30, gold: 10 }, trap: true, dmg: 70, radius: 1.8,        construction: 5 },
  flag:     { hp: FLAG.hp, cost: FLAG.cost },
};
const TECH_KEYS = ['construction', 'army', 'influence', 'mining', 'lumber', 'farming', 'warfare', 'defense', 'scouting', 'engineering'];

const rooms = {};
function makeCode() { const s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 6; i++) c += s[Math.floor(Math.random() * s.length)]; return c; }
function newRoomCode() { let c; do { c = makeCode(); } while (rooms[c]); return c; }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function cheb(ax, ay, bx, by) { return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); }
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
    guildLevel: 1, guildProg: 0, tokenTimer: TOKEN_TIME, tokensSpent: 0,
    flagsOwned: 0, scoutRespawn: 0, stats: newStats(),
  };
}
function warMult(p) { return 1 + 0.10 * p.tech.warfare; }
function defMult(p) { return 1 + 0.12 * p.tech.defense; }
function guildHpMult(p) { return 1 + 0.12 * (p.guildLevel - 1); }   // HP споруд від рівня гільдії

function spawnUnit(s, owner, type, x, y, scout) {
  const def = UNIT[type] || { hp: 40 }; const p = playerOf(s, owner);
  const hp = scout ? 40 : Math.round(def.hp * warMult(p));
  s.units.push({ id: s.nextId++, owner, type: scout ? 'scout' : type, x, y, mx: x, my: y, hasCmd: false, hp, maxHp: hp, cd: 0, scout: !!scout });
  if (!scout && p) p.stats.made++;
}
function buildingMaxHp(p, type) { const def = BUILD[type]; if (type === 'landmine') return 1; if (type === 'flag') return FLAG.hp; return Math.round(def.hp * defMult(p) * guildHpMult(p)); }
function addBuilding(s, owner, type, cx, cy, flagId) {
  const p = playerOf(s, owner);
  const maxHp = buildingMaxHp(p, type);
  const b = { id: s.nextId++, owner, type, cx, cy, hp: maxHp, maxHp, baseHp: BUILD[type].hp, cd: 0 };
  if (type === 'barracks') b.queue = [];
  if (BUILD[type].res) { b.timer = COLLECT_TIME; b.ready = false; b.amount = 0; }
  if (type === 'flag') { b.slots = FLAG.slots; b.used = 0; }
  if (flagId != null) b.flag = flagId;
  s.buildings.push(b);
  claim(s, owner, cx, cy, type === 'guild' ? 2 : type === 'flag' ? 1 : 1);
  if (type !== 'guild' && p) p.stats.built++;
  return b;
}
function initGame(room) {
  const s = { W, H, biomes: generateBiomes(), grid: new Array(W * H).fill(-1), units: [], buildings: [], players: [], nextId: 1, winner: null, t: 0, weather: 'clear', weatherTimer: 40, shots: [] };
  room.players.forEach(p => { s.players.push(newPlayer(p.index)); const b = BASES[p.index]; addBuilding(s, p.index, 'guild', b.cx, b.cy); spawnUnit(s, p.index, 'scout', b.cx, b.cy - 1, true); });
  room.state = s; room.lastGrid = {}; room.debugFog = false;
}

function barracksOf(s, owner) { return s.buildings.filter(b => b.owner === owner && b.type === 'barracks'); }
function armyCap(s, owner) { return barracksOf(s, owner).length * ARMY_PER_BARRACKS; }
function armyCount(s, owner) { let n = 0; for (const u of s.units) if (u.owner === owner && !u.scout) n++; for (const b of barracksOf(s, owner)) n += b.queue.length; return n; }
function flagCount(s, owner) { let n = 0; for (const b of s.buildings) if (b.owner === owner && b.type === 'flag') n++; const p = playerOf(s, owner); return n + (p ? p.flagsOwned : 0); }
function isNight(s) { return (s.t % DAY_CYCLE) >= DAY_LEN; }
function hasCommanderNear(s, owner, x, y) { for (const u of s.units) if (u.owner === owner && u.type === 'commander' && u.hp > 0 && dist(x, y, u.x, u.y) <= UNIT.commander.aura) return true; return false; }

function nearestEnemy(s, owner, x, y, maxR, includeScouts) {
  let best = null, bd = maxR;
  for (const u of s.units) { if (u.owner === owner || u.hp <= 0) continue; if (u.scout && !includeScouts) continue; const d = dist(x, y, u.x, u.y); if (d <= bd) { bd = d; best = { ref: u, x: u.x, y: u.y, dist: d, isB: false }; } }
  for (const b of s.buildings) { if (b.owner === owner || b.hp <= 0 || b.type === 'landmine') continue; const d = dist(x, y, b.cx, b.cy); if (d <= bd) { bd = d; best = { ref: b, x: b.cx, y: b.cy, dist: d, isB: true }; } }
  return best;
}
function credit(s, attacker, isB) { const p = playerOf(s, attacker); if (!p) return; if (isB) p.stats.razed++; else p.stats.kills++; }
function applyDamage(s, attacker, tgt, dmg, splash) {
  const px = tgt.x, py = tgt.y; const was = tgt.ref.hp > 0; tgt.ref.hp -= dmg;
  if (was && tgt.ref.hp <= 0) credit(s, attacker, tgt.isB);
  if (splash > 0) for (const u of s.units) { if (u.owner === attacker || u.hp <= 0 || u.scout || u === tgt.ref) continue; if (dist(px, py, u.x, u.y) <= splash) { const w = u.hp > 0; u.hp -= dmg * 0.6; if (w && u.hp <= 0) credit(s, attacker, false); } }
}

function step(room) {
  const s = room.state; if (!s || s.winner !== null) return;
  s.t += DT; s.shots = [];
  s.weatherTimer -= DT; if (s.weatherTimer <= 0) { s.weather = Math.random() < 0.35 ? 'rain' : 'clear'; s.weatherTimer = 30 + Math.random() * 40; }
  const speedMul = s.weather === 'rain' ? 0.7 : 1;

  for (const p of s.players) {
    if (!p.alive) continue;
    p.res.gold += p.guildLevel * 0.8 * DT;                       // невеликий пасивний дохід від гільдії
    p.tokenTimer -= DT * (1 + 0.25 * p.tech.engineering);
    if (p.tokenTimer <= 0) { p.res.tokens += 1; p.tokenTimer = TOKEN_TIME; }
    if (p.scoutRespawn > 0) { p.scoutRespawn -= DT; if (p.scoutRespawn <= 0 && !s.units.some(u => u.owner === p.index && u.scout)) { const g = s.buildings.find(b => b.owner === p.index && b.type === 'guild'); if (g) spawnUnit(s, p.index, 'scout', g.cx, g.cy - 1, true); } }
  }
  // активний збір: ресурсні споруди накопичують «пакет», а тоді «!»
  for (const b of s.buildings) {
    const def = BUILD[b.type]; if (!def.res) continue;
    const p = playerOf(s, b.owner); if (!p || !p.alive) continue;
    if (!b.ready) { b.timer -= DT; if (b.timer <= 0) { const biome = s.biomes[b.cy * W + b.cx]; const tech = p.tech[def.kind === 'mine' ? 'mining' : def.kind === 'lumber' ? 'lumber' : 'farming']; b.amount = Math.round(BATCH_BASE * BIOME_MULT[biome][def.kind] * (1 + 0.20 * tech)); b.ready = true; } }
  }
  // черга виробництва
  for (const b of s.buildings) {
    if (b.type !== 'barracks' || !b.queue.length) continue;
    const q = b.queue[0]; q.time -= DT;
    if (q.time <= 0) { const offs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [2, 0], [0, 2]]; let sx = b.cx, sy = b.cy; for (const [dx, dy] of offs) { const c = b.cx + dx, r = b.cy + dy; if (c >= 0 && c < W && r >= 0 && r < H) { sx = c; sy = r; break; } } spawnUnit(s, b.owner, q.type, sx, sy); b.queue.shift(); }
  }
  // вежі/пушки/міни
  for (const b of s.buildings) {
    b.cd = Math.max(0, b.cd - DT); const def = BUILD[b.type];
    if ((b.type === 'tower' || b.type === 'cannon') && b.cd <= 0) { const t = nearestEnemy(s, b.owner, b.cx, b.cy, def.range, false); if (t) { applyDamage(s, b.owner, t, def.dmg, def.splash || 0); b.cd = def.cd; s.shots.push({ x: b.cx, y: b.cy, tx: t.x, ty: t.y, k: b.type === 'cannon' ? 'ball' : 'arrow' }); } }
    if (b.type === 'landmine') { let boom = false; for (const u of s.units) { if (u.owner === b.owner || u.hp <= 0 || u.scout) continue; if (dist(b.cx, b.cy, u.x, u.y) <= def.radius) { boom = true; break; } } if (boom) { for (const u of s.units) { if (u.owner === b.owner || u.hp <= 0 || u.scout) continue; if (dist(b.cx, b.cy, u.x, u.y) <= def.radius) { const w = u.hp > 0; u.hp -= def.dmg; if (w && u.hp <= 0) credit(s, b.owner, false); } } b.hp = 0; } }
  }
  // юніти
  for (const u of s.units) {
    u.cd = Math.max(0, u.cd - DT);
    if (u.scout) { if (u.hasCmd) { if (dist(u.x, u.y, u.mx, u.my) <= 0.15) { u.x = u.mx; u.y = u.my; u.hasCmd = false; } else moveTo(u, [u.mx, u.my], 3.4 * speedMul + 0.4 * playerOf(s, u.owner).tech.scouting); } continue; }
    const def = UNIT[u.type]; const p = playerOf(s, u.owner);
    const tgt = nearestEnemy(s, u.owner, u.x, u.y, Math.max(def.range, def.aggro) + 0.5, true);
    let attacked = false;
    if (tgt && tgt.dist <= def.range + 0.05) {
      if (u.cd <= 0) {
        let dmg = def.dmg * warMult(p);
        if (hasCommanderNear(s, u.owner, u.x, u.y)) dmg *= (1 + UNIT.commander.auraBonus);   // аура командира
        if (def.vsBuilding && tgt.isB) dmg *= def.vsBuilding;
        if (!tgt.isB && !tgt.ref.scout) dmg *= rpsMult(u.type, tgt.ref.type);
        applyDamage(s, u.owner, tgt, dmg, def.splash); u.cd = def.cd;
        if (def.range > 1.6) s.shots.push({ x: u.x, y: u.y, tx: tgt.x, ty: tgt.y, k: u.type === 'mage' ? 'magic' : u.type === 'catapult' ? 'ball' : 'arrow' });
      }
      attacked = true;
    }
    if (!attacked) {
      let dest = null;
      if (u.hasCmd) { const d = dist(u.x, u.y, u.mx, u.my); if (d <= 0.15) { u.x = u.mx; u.y = u.my; u.hasCmd = false; } else dest = [u.mx, u.my]; }
      if (!dest && tgt && tgt.dist <= def.aggro && tgt.dist > def.range + 0.4) dest = [tgt.x, tgt.y];
      if (dest) moveTo(u, dest, def.speed * speedMul);
    }
  }
  separate(s);   // розлипання юнітів
  // мертві юніти (+ відродження розвідника)
  const kept = [];
  for (const u of s.units) { if (u.hp > 0) { kept.push(u); continue; } if (u.scout) { const p = playerOf(s, u.owner); if (p) p.scoutRespawn = SCOUT_RESPAWN; } else { const p = playerOf(s, u.owner); if (p) p.stats.lost++; } }
  s.units = kept;
  // мертві споруди (+ прибирання залежних від прапора)
  const deadGuilds = [], deadFlags = [];
  s.buildings = s.buildings.filter(b => { if (b.hp > 0) return true; const p = playerOf(s, b.owner); if (p) p.stats.blost++; if (b.type === 'guild') deadGuilds.push(b.owner); if (b.type === 'flag') deadFlags.push(b.id); return false; });
  if (deadFlags.length) s.buildings = s.buildings.filter(b => !(b.flag != null && deadFlags.includes(b.flag)));
  for (const owner of deadGuilds) { const p = playerOf(s, owner); if (p) p.alive = false; s.units = s.units.filter(u => u.owner !== owner); s.buildings = s.buildings.filter(b => b.owner !== owner); }
  for (const u of s.units) { if (u.scout) continue; const c = Math.round(u.x), r = Math.round(u.y); if (c >= 0 && c < W && r >= 0 && r < H) s.grid[r * W + c] = u.owner; }

  if (!room.debug) { const alive = s.players.filter(p => p.alive); if (alive.length <= 1) return finishGame(room, alive.length === 1 ? alive[0].index : -1); }
  broadcast(room);
}
function moveTo(u, dest, speed) { if (!dest) return; const dx = dest[0] - u.x, dy = dest[1] - u.y, d = Math.hypot(dx, dy); if (d > 0.01) { const s = Math.min(1, speed * DT / d); u.x = clamp(u.x + dx * s, 0, W - 1); u.y = clamp(u.y + dy * s, 0, H - 1); } }
function separate(s) {
  const arr = s.units.filter(u => !u.scout && u.hp > 0);
  for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
    const a = arr[i], b = arr[j]; if (a.owner !== b.owner) continue;
    let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d < SEP && d > 0.0001) { const push = (SEP - d) * 0.25; dx /= d; dy /= d; a.x = clamp(a.x - dx * push, 0, W - 1); a.y = clamp(a.y - dy * push, 0, H - 1); b.x = clamp(b.x + dx * push, 0, W - 1); b.y = clamp(b.y + dy * push, 0, H - 1); }
    else if (d <= 0.0001) { a.x = clamp(a.x - 0.05, 0, W - 1); b.x = clamp(b.x + 0.05, 0, W - 1); }
  }
}

function visibleCells(s, owner) {
  const vis = new Uint8Array(W * H);
  const night = isNight(s) ? 0.62 : 1;
  const mark = (cx, cy, rr) => { const r = Math.max(2, Math.round(rr * night)), r2 = r * r; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (dx * dx + dy * dy > r2) continue; const c = (cx | 0) + dx, rw = (cy | 0) + dy; if (c >= 0 && c < W && rw >= 0 && rw < H) vis[rw * W + c] = 1; } };
  const scoutR = 9 + 1.6 * playerOf(s, owner).tech.scouting;
  for (const u of s.units) if (u.owner === owner) mark(u.x, u.y, u.scout ? scoutR : 4);
  for (const b of s.buildings) if (b.owner === owner) mark(b.cx, b.cy, b.type === 'guild' ? 7 : b.type === 'flag' ? FLAG.vision : 5);
  return vis;
}
function serializeEntities(s, owner, full, vis) {
  const seen = (c, r) => full || vis[r * W + c] === 1;
  const me = playerOf(s, owner) || s.players[0];
  const units = [];
  for (const u of s.units) {
    if (u.scout) { units.push({ i: u.id, o: u.owner, t: 'scout', x: r2(u.x), y: r2(u.y), h: Math.round(u.hp), m: u.maxHp, s: 1 }); continue; }  // розвідники видимі всім
    if (u.owner !== owner && !full && !seen(Math.round(u.x), Math.round(u.y))) continue;
    units.push({ i: u.id, o: u.owner, t: u.type, x: r2(u.x), y: r2(u.y), h: Math.round(u.hp), m: u.maxHp, s: 0 });
  }
  const builds = [];
  for (const b of s.buildings) {
    if (b.type === 'landmine' && b.owner !== owner && !full) continue;
    if (b.owner !== owner && !full && !seen(b.cx, b.cy)) continue;
    const o = { i: b.id, o: b.owner, t: b.type, x: b.cx, y: b.cy, h: Math.round(b.hp), m: b.maxHp };
    if (b.type === 'guild') { const gp = playerOf(s, b.owner); o.gl = gp ? gp.guildLevel : 1; }
    if (b.type === 'barracks' && b.owner === owner) { o.q = b.queue.length; if (b.queue.length) { const f = b.queue[0]; o.prog = 1 - f.time / f.total; } }
    if (BUILD[b.type].res && b.owner === owner) { o.rd = b.ready ? 1 : 0; o.am = b.amount; o.tp = b.ready ? 1 : 1 - b.timer / COLLECT_TIME; o.rk = BUILD[b.type].res; }
    builds.push(o);
  }
  const shots = [];
  for (const sh of s.shots) if (full || (vis[(sh.y | 0) * W + (sh.x | 0)] === 1) || (vis[(sh.ty | 0) * W + (sh.tx | 0)] === 1)) shots.push(sh);
  return {
    winner: s.winner, units, buildings: builds, shots, weather: s.weather, night: isNight(s),
    me: { index: me.index, color: me.color, alive: me.alive, res: roundRes(me.res), tech: me.tech, guildLevel: me.guildLevel, guildProg: me.guildProg, army: armyCount(s, owner), cap: armyCap(s, owner), flags: me.flagsOwned, flagsTotal: flagCount(s, owner) },
    players: s.players.map(p => ({ index: p.index, color: p.color, alive: p.alive })),
  };
}
function r2(v) { return Math.round(v * 100) / 100; }
function roundRes(r) { const o = {}; for (const k in r) o[k] = Math.floor(r[k]); return o; }
function gridFor(s, owner, full, vis) { const out = new Array(W * H); for (let i = 0; i < W * H; i++) { const o = s.grid[i]; out[i] = full ? o : (vis[i] ? o : (o === owner ? o : -2)); } return out; }
function sendState(sock, room, owner, full, key) {
  const s = room.state; const vis = full ? null : visibleCells(s, owner);
  const ent = serializeEntities(s, owner, full, vis); const g = gridFor(s, owner, full, vis);
  const last = room.lastGrid[key];
  if (!last) ent.gridFull = g; else { const diff = []; for (let i = 0; i < g.length; i++) if (g[i] !== last[i]) diff.push(i, g[i]); ent.gridDiff = diff; }
  room.lastGrid[key] = g; sock.emit('state', ent);
}
function broadcast(room) {
  const s = room.state; if (!s) return;
  if (room.debug) { const sock = io.sockets.sockets.get(room.host); if (sock) sendState(sock, room, sock.data.index, !room.debugFog, 'd'); return; }
  for (const p of room.players) { const sock = io.sockets.sockets.get(p.id); if (sock) sendState(sock, room, p.index, false, p.index); }
}

function buildStats(s) {
  const terr = new Array(s.players.length).fill(0);
  for (let i = 0; i < W * H; i++) { const o = s.grid[i]; if (o >= 0) terr[o] = (terr[o] || 0) + 1; }
  return s.players.map(p => ({ index: p.index, color: p.color, alive: p.alive, made: p.stats.made, lost: p.stats.lost, built: p.stats.built, blost: p.stats.blost, kills: p.stats.kills, razed: p.stats.razed, gathered: Math.floor(p.stats.gathered), guildLevel: p.guildLevel, territory: terr[p.index] || 0 }));
}
function scoreOf(x) { return x.territory + x.kills * 6 + x.razed * 20 + x.built * 3 + (x.alive ? 300 : 0); }
function chooseWinner(s) { const st = buildStats(s); let best = -1, bs = -1e9; for (const x of st) { const sc = scoreOf(x); if (sc > bs) { bs = sc; best = x.index; } } return best; }
function finishGame(room, winner) { const s = room.state; if (!s) return; s.winner = winner; if (room.loop) { clearInterval(room.loop); room.loop = null; } broadcast(room); io.to(room.code).emit('gameOver', { winner, stats: buildStats(s) }); }

function broadcastLobby(room) { io.to(room.code).emit('lobby', { code: room.code, host: room.host, started: room.started, players: room.players.map(p => ({ index: p.index, color: p.color, name: p.name, connected: p.connected, id: p.id })) }); }
function leaveCurrentRoom(socket) {
  const code = socket.data.room; socket.data.room = null;
  if (!code) return; const room = rooms[code]; if (!room) return; socket.leave(code);
  if (room.debug) { if (room.loop) clearInterval(room.loop); delete rooms[code]; return; }
  if (!room.started) {
    room.players = room.players.filter(p => p.id !== socket.id);
    room.players.forEach((p, i) => { p.index = i; p.color = COLORS[i]; });
    if (room.players.length === 0) { if (room.loop) clearInterval(room.loop); delete rooms[code]; return; }
    if (room.host === socket.id) room.host = room.players[0].id; broadcastLobby(room);
  } else {
    const p = room.players.find(pp => pp.id === socket.id); if (p) p.connected = false;
    if (room.players.every(pp => !pp.connected)) { if (room.loop) clearInterval(room.loop); delete rooms[code]; } else broadcastLobby(room);
  }
}
function startDebug(socket) {
  const code = newRoomCode(); const room = { code, host: socket.id, started: false, players: [], state: null, loop: null, debug: true }; rooms[code] = room;
  for (let i = 0; i < 4; i++) room.players.push({ id: socket.id, name: 'Імперія ' + (i + 1), index: i, color: COLORS[i], connected: true });
  socket.data.room = code; socket.data.index = 0; socket.data.debug = true; socket.join(code); initGame(room); room.started = true;
  socket.emit('joined', { code, index: 0, color: COLORS[0], host: true, debug: true });
  socket.emit('gameStarted', { W, H, biomes: room.state.biomes, debug: true });
  room.loop = setInterval(() => step(room), TICK_MS);
}

// перевірка місця під будівництво: повертає {ok, flag}
function buildPlacement(s, owner, type, cx, cy) {
  if (cx < 0 || cx >= W || cy < 0 || cy >= H) return { ok: false };
  if (s.buildings.some(b => b.cx === cx && b.cy === cy)) return { ok: false };
  // не впритул до інших споруд (мін. чебишев 2)
  if (s.buildings.some(b => cheb(b.cx, b.cy, cx, cy) <= 1)) return { ok: false, reason: 'gap' };
  const me = playerOf(s, owner);
  const guild = s.buildings.find(b => b.owner === owner && b.type === 'guild');
  if (guild) { const R = INF_BASE + me.tech.influence * INF_STEP; if (cheb(cx, cy, guild.cx, guild.cy) <= R) return { ok: true, flag: null }; }
  // або поруч із прапором (де є вільні слоти)
  let best = null, bd = 1e9;
  for (const b of s.buildings) if (b.owner === owner && b.type === 'flag' && b.used < b.slots) { const d = cheb(cx, cy, b.cx, b.cy); if (d <= FLAG.radius && d < bd) { bd = d; best = b; } }
  if (best) return { ok: true, flag: best.id };
  return { ok: false, reason: 'zone' };
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ name } = {}) => {
    leaveCurrentRoom(socket);
    const code = newRoomCode(); const room = { code, host: socket.id, started: false, players: [], state: null, loop: null }; rooms[code] = room;
    room.players.push({ id: socket.id, name: (name || 'Гравець 1').slice(0, 16), index: 0, color: COLORS[0], connected: true });
    socket.data.room = code; socket.data.index = 0; socket.data.debug = false; socket.join(code);
    socket.emit('joined', { code, index: 0, color: COLORS[0], host: true }); broadcastLobby(room);
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
    socket.data.room = code; socket.data.index = index; socket.data.debug = false; socket.join(code);
    socket.emit('joined', { code, index, color: COLORS[index], host: room.host === socket.id }); broadcastLobby(room);
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
    const room = rooms[socket.data.room]; if (!room || !room.started || !room.state || room.state.winner !== null) return;
    const s = room.state, owner = socket.data.index, me = playerOf(s, owner); if (!me || !me.alive) return;

    if (cmd.type === 'move') { const x = clamp(cmd.x, 0, W - 1), y = clamp(cmd.y, 0, H - 1), ids = new Set(cmd.ids || []); for (const u of s.units) if (u.owner === owner && ids.has(u.id)) { u.mx = x; u.my = y; u.hasCmd = true; } }
    else if (cmd.type === 'tech') {
      const k = cmd.branch; if (!TECH_KEYS.includes(k)) return;
      if (k === 'scouting' && me.guildLevel < 3) return;         // розвідка з рівня 3
      const lvl = me.tech[k]; if (lvl >= 5) return; const cost = lvl + 1; if (me.res.tokens < cost) return;
      me.res.tokens -= cost; me.tech[k] = lvl + 1; me.tokensSpent += cost;
      me.guildProg += GUILD_PER_UPGRADE;                          // +0.8 рівня гільдії за покращення
      while (me.guildProg >= 1 && me.guildLevel < GUILD_CAP) { me.guildProg -= 1; me.guildLevel++; relevelBuildings(s, me); }
      if (me.guildLevel >= GUILD_CAP) me.guildProg = Math.min(me.guildProg, 0.999);
    }
    else if (cmd.type === 'produce') {
      const type = cmd.unit, def = UNIT[type]; if (!def) return;
      if (me.tech.army < def.army) return;
      const b = s.buildings.find(bb => bb.id === cmd.building && bb.owner === owner && bb.type === 'barracks'); if (!b) return;
      if (armyCount(s, owner) >= armyCap(s, owner)) return;
      if (me.res.food < def.food || me.res.gold < def.gold) return;
      me.res.food -= def.food; me.res.gold -= def.gold; b.queue.push({ type, time: def.build, total: def.build });
    }
    else if (cmd.type === 'build') {
      const type = cmd.build, def = BUILD[type]; if (!def || type === 'guild' || type === 'flag') return;
      if (me.tech.construction < def.construction) return;
      const cx = cmd.cx | 0, cy = cmd.cy | 0; const pl = buildPlacement(s, owner, type, cx, cy); if (!pl.ok) return;
      const c = def.cost; if ((me.res.wood || 0) < (c.wood || 0) || (me.res.stone || 0) < (c.stone || 0) || (me.res.gold || 0) < (c.gold || 0)) return;
      me.res.wood -= (c.wood || 0); me.res.stone -= (c.stone || 0); me.res.gold -= (c.gold || 0);
      const b = addBuilding(s, owner, type, cx, cy, pl.flag);
      if (pl.flag != null) { const fb = s.buildings.find(x => x.id === pl.flag); if (fb) fb.used++; }
    }
    else if (cmd.type === 'collect') {
      const b = s.buildings.find(bb => bb.id === cmd.building && bb.owner === owner);
      if (!b || !BUILD[b.type].res || !b.ready) return;
      me.res[BUILD[b.type].res] += b.amount;
      me.stats.gathered += b.amount;
      b.ready = false; b.amount = 0; b.timer = COLLECT_TIME;
    }
    else if (cmd.type === 'demolish') {
      const b = s.buildings.find(bb => bb.id === cmd.building && bb.owner === owner); if (!b || b.type === 'guild') return;
      if (b.flag != null) { const fb = s.buildings.find(x => x.id === b.flag); if (fb) fb.used = Math.max(0, fb.used - 1); }
      b.hp = 0;   // впаде на наступному тіку (прапор прибере залежні)
    }
    else if (cmd.type === 'buyFlag') {
      if (me.guildLevel < FLAG.minLevel) return;
      if (flagCount(s, owner) >= FLAG.max) return;
      const c = FLAG.cost; if ((me.res.wood || 0) < c.wood || (me.res.stone || 0) < c.stone || (me.res.gold || 0) < c.gold) return;
      me.res.wood -= c.wood; me.res.stone -= c.stone; me.res.gold -= c.gold; me.flagsOwned++;
    }
    else if (cmd.type === 'placeFlag') {
      if (me.flagsOwned <= 0) return;
      const sc = s.units.find(u => u.owner === owner && u.scout); if (!sc) return;
      const cx = Math.round(sc.x), cy = Math.round(sc.y);
      if (s.buildings.some(b => cheb(b.cx, b.cy, cx, cy) <= 1)) return;    // не впритул
      const cell = s.grid[cy * W + cx]; if (cell >= 0 && cell !== owner) return;   // не на території ворога
      me.flagsOwned--; addBuilding(s, owner, 'flag', cx, cy);
    }
  });

  socket.on('disconnect', () => { leaveCurrentRoom(socket); });
});
function relevelBuildings(s, p) { for (const b of s.buildings) { if (b.owner !== p.index || b.type === 'landmine' || b.type === 'flag') continue; const ratio = b.hp / b.maxHp; b.maxHp = buildingMaxHp(p, b.type); b.hp = Math.max(1, Math.round(b.maxHp * ratio)); } }

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Чотири Імперії v5 — сервер на порту ' + PORT));
