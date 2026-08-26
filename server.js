// ============================================================
//  ЧОТИРИ ІМПЕРІЇ — Balance v2 — сервер
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

// ---- глобальні константи ----
const W = 130, H = 130;
const COLORS = ['red', 'blue', 'green', 'yellow'];
const TICK_MS = 120, DT = TICK_MS / 1000;
const DEBUG_CODE = 'LNQ247';
const PEACE_TIME = 120;                 // 2 хв миру
const ARMY_PER_BARRACKS = 7;
const INF_BASE = 6, INF_STEP = 2;
const DAY_CYCLE = 110, DAY_LEN = 70;
const GUILD_CAP = 15;
const GUILD_PER_UPGRADE = 0.6;
const COLLECT_TIME = 12, BATCH_BASE = 12, GOLD_BASE = 8;
const SCOUT_RESPAWN = 120;
const SEP = 0.8;
const TOKEN_BASE = 30, TOKEN_STEP = 2.5;
const TECH_COST = [1, 2, 3, 5, 7];      // вартість рівнів 1..5
const AUTO_COST = 5;
const REPAIR_DELAY = 60, REPAIR_PER_SEC = 10 / 60;   // +10 HP/хв після 60с без ушкоджень
const FLAG = { hp: 180, vision: 5, slots: 2, radius: 3, cost: { wood: 100, stone: 100, gold: 250 } };
const MINE = { hp: 30, arm: 5, trigger: 0.8, boom: 2.0, max: 15, spacing: 2, heavy: 130 };
const MINE_LETHAL = new Set(['sword', 'archer', 'mage', 'spear', 'assassin', 'priest']);
const SCOUT_VISION = [0, 7, 8, 9, 11, 13];
const SCOUT_SPEED = [0, 3.6, 3.9, 4.2, 4.5, 4.8];
const FLAG_CAP = [0, 0, 0, 1, 2, 3];               // за рівнем scouting
const MINE_DETECT = [0, 0, 0, 2.5, 4, 6];          // за рівнем scouting

// біоми: 0 rocky, 1 fertile, 2 forest, 3 ancient_forest, 4 black_soil, 5 rich_ore, 6 gold
const BIOME_MULT = [
  { mine: 1.5, lumber: 0.75, farm: 0.75 },
  { mine: 0.75, lumber: 1.0, farm: 1.5 },
  { mine: 0.75, lumber: 1.5, farm: 0.75 },
  { mine: 0.75, lumber: 2.0, farm: 0.75 },
  { mine: 0.75, lumber: 1.0, farm: 2.0 },
  { mine: 2.0, lumber: 0.75, farm: 0.75 },
  { mine: 1.0, lumber: 0.75, farm: 0.75 },   // gold — мультиплікатор не використовується для золота
];

// ---- юніти (Balance v2) ----
const UNIT = {
  sword:     { hp: 85,  dmg: 10, range: 1.1, cd: 0.8,  speed: 2.6, aggro: 4.5, unlock: 1, food: 18, gold: 12, build: 7,  cls: 'inf' },
  archer:    { hp: 55,  dmg: 9,  range: 5.5, cd: 1.0,  speed: 2.4, aggro: 7.0, unlock: 1, food: 16, gold: 16, build: 8,  cls: 'rng' },
  mage:      { hp: 50,  dmg: 14, range: 5.0, cd: 1.3,  speed: 2.2, aggro: 6.5, unlock: 2, food: 20, gold: 28, build: 10, splash: 1.8, splashPct: 0.6, cls: 'rng' },
  spear:     { hp: 100, dmg: 11, range: 1.5, cd: 0.9,  speed: 2.5, aggro: 4.5, unlock: 3, food: 22, gold: 20, build: 12, cls: 'inf' },
  priest:    { hp: 60,  dmg: 0,  range: 0,   cd: 0,    speed: 2.5, aggro: 0,   unlock: 3, food: 25, gold: 35, build: 16, support: true, heal: 6, healRange: 5.0, healCd: 1.5, cls: 'sup' },
  assassin:  { hp: 65,  dmg: 15, range: 1.0, cd: 0.65, speed: 3.8, aggro: 5.0, unlock: 4, food: 22, gold: 32, build: 14, cls: 'cav' },
  catapult:  { hp: 210, dmg: 24, range: 6.5, cd: 2.3,  speed: 1.1, aggro: 8.0, unlock: 4, food: 20, gold: 45, wood: 30, stone: 20, build: 28, splash: 1.5, splashPct: 0.6, siege: true, workshop: true, cls: 'siege' },
  ram:       { hp: 240, dmg: 24, range: 1.4, cd: 2.0,  speed: 1.3, aggro: 8.0, unlock: 5, food: 20, gold: 50, wood: 50, stone: 30, build: 24, antiBuilding: true, workshop: true, cls: 'siege' },
  commander: { hp: 190, dmg: 0,  range: 0,   cd: 0,    speed: 2.6, aggro: 0,   unlock: 5, food: 35, gold: 75, build: 22, support: true, aura: 7.0, auraBonus: 0.25, max1: true, cls: 'sup' },
};
const BUILD_DMG_UNIT = 0.35;   // звичайні юніти по спорудах

// ---- будівлі (Balance v2) ----
const BUILD = {
  guild:    { hp: 1100, cost: {},                              construction: 0 },
  farm:     { hp: 160,  cost: { wood: 30, stone: 15, gold: 15 }, res: 'food', kind: 'farm',   construction: 1 },
  lumber:   { hp: 180,  cost: { wood: 15, stone: 30, gold: 15 }, res: 'wood', kind: 'lumber', construction: 1 },
  mine:     { hp: 180,  cost: { wood: 35, stone: 15, gold: 15 }, res: 'stone', kind: 'mine',  construction: 1 },
  barracks: { hp: 300,  cost: { wood: 60, stone: 60, gold: 30 }, construction: 2 },
  wall:     { hp: 175,  cost: { wood: 10, stone: 20 },           construction: 2, wall: true },
  tower:    { hp: 350,  cost: { wood: 50, stone: 80, gold: 40 }, range: 5.5, dmg: 13, cd: 1.0, construction: 3 },
  cannon:   { hp: 450,  cost: { wood: 70, stone: 120, gold: 70 }, range: 7.0, dmg: 28, cd: 2.2, splash: 1.6, splashPct: 0.6, construction: 4 },
  workshop: { hp: 350,  cost: { wood: 80, stone: 100, gold: 60 }, construction: 4 },
  landmine: { hp: MINE.hp, cost: { wood: 10, stone: 35, gold: 20 }, construction: 5, isMine: true },
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

// ---- випадкові стартові позиції ----
function genSpawns(n) {
  const margin = 16;
  for (let attempt = 0; attempt < 800; attempt++) {
    const minD = attempt < 500 ? 55 : 50;
    const pts = []; let ok = true;
    for (let i = 0; i < n; i++) {
      let placed = false;
      for (let t = 0; t < 80; t++) {
        const x = margin + Math.floor(Math.random() * (W - 2 * margin));
        const y = margin + Math.floor(Math.random() * (H - 2 * margin));
        if (pts.every(p => dist(p.cx, p.cy, x, y) >= minD)) { pts.push({ cx: x, cy: y }); placed = true; break; }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return pts;
  }
  // запасний варіант — розкидані точки
  const pts = []; for (let i = 0; i < n; i++) pts.push({ cx: 20 + (i % 2) * (W - 40), cy: 20 + (i < 2 ? 0 : 1) * (H - 40) }); return pts;
}
function blob(g, cx, cy, r, biome) { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (dx * dx + dy * dy > r * r) continue; const c = cx + dx, rw = cy + dy; if (c >= 0 && c < W && rw >= 0 && rw < H) g[rw * W + c] = biome; } }
function generateBiomes(spawns) {
  const g = new Array(W * H); const seeds = [];
  const nSeed = 40; for (let i = 0; i < nSeed; i++) seeds.push({ x: Math.random() * W, y: Math.random() * H, b: i % 3 });
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { let best = 1e9, b = 1; for (const s of seeds) { const d = (s.x - c) ** 2 + (s.y - r) ** 2; if (d < best) { best = d; b = s.b; } } g[r * W + c] = b; }
  const far = (x, y, d) => spawns.every(s => dist(s.cx, s.cy, x, y) > d);
  const place = (biome, count, rad) => { let made = 0, guard = 0; while (made < count && guard++ < 400) { const x = 12 + Math.floor(Math.random() * (W - 24)), y = 12 + Math.floor(Math.random() * (H - 24)); if (far(x, y, 22) && dist(W / 2, H / 2, x, y) > 12) { blob(g, x, y, rad, biome); made++; } } };
  place(3, 3, 2);   // ancient forest
  place(4, 3, 2);   // black soil
  place(5, 3, 2);   // rich ore
  // золотий біом — маленький, у центрі
  const gx = Math.round(W / 2 + (Math.random() * 16 - 8)), gy = Math.round(H / 2 + (Math.random() * 16 - 8));
  blob(g, gx, gy, 2, 6);
  return g;
}

function claim(s, owner, cx, cy, rad) { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) { const c = cx + dx, r = cy + dy; if (c >= 0 && c < W && r >= 0 && r < H) s.grid[r * W + c] = owner; } }
function newStats() { return { made: 0, lost: 0, built: 0, blost: 0, kills: 0, razed: 0, gathered: 0 }; }
function newPlayer(index) {
  return {
    index, color: COLORS[index], alive: true,
    res: { wood: 120, stone: 120, food: 100, gold: 80, tokens: 3 },
    tech: { construction: 0, army: 0, influence: 0, mining: 0, lumber: 0, farming: 0, warfare: 0, defense: 0, scouting: 0, engineering: 0 },
    guildLevel: 1, guildProg: 0, tokenTimer: TOKEN_BASE,
    flagsOwned: 0, scoutRespawn: 0, autoCollect: false, stats: newStats(),
  };
}
function warDmgMult(p) { return 1 + 0.06 * p.tech.warfare; }
function warHpMult(p) { return 1 + 0.05 * p.tech.warfare; }
function guildHpMult(p) { return 1 + 0.06 * (p.guildLevel - 1); }
function defHpMult(p) { return 1 + 0.06 * p.tech.defense; }
function tokenCooldown(p) { return TOKEN_BASE - TOKEN_STEP * p.tech.engineering; }
function flagCapOf(p) { return FLAG_CAP[p.tech.scouting] || 0; }
function unitMaxHp(p, type) { return Math.round(UNIT[type].hp * warHpMult(p)); }

function spawnUnit(s, owner, type, x, y) {
  const p = playerOf(s, owner); const def = UNIT[type];
  const hp = unitMaxHp(p, type);
  s.units.push({ id: s.nextId++, owner, type, x, y, mx: x, my: y, hasCmd: false, hp, maxHp: hp, cd: 0, lastHit: -99, lastAtk: -99, hx: 0, hy: 1 });
  if (p) p.stats.made++;
}
function spawnScout(s, owner, x, y) { s.units.push({ id: s.nextId++, owner, type: 'scout', scout: true, x, y, mx: x, my: y, hasCmd: false, hp: 40, maxHp: 40, cd: 0, hx: 0, hy: 1 }); }
function buildingMaxHp(p, type) { if (type === 'landmine') return MINE.hp; return Math.round(BUILD[type].hp * defHpMult(p) * guildHpMult(p)); }
function addBuilding(s, owner, type, cx, cy, flagId) {
  const p = playerOf(s, owner); const def = BUILD[type];
  const maxHp = buildingMaxHp(p, type);
  const b = { id: s.nextId++, owner, type, cx, cy, hp: maxHp, maxHp, cd: 0, lastHit: -99 };
  if (type === 'barracks') b.queue = [];
  if (def.res) { const biome = s.biomes[cy * W + cx]; const gold = (type === 'mine' && biome === 6); b.resKind = gold ? 'gold' : def.res; b.base = gold ? GOLD_BASE : BATCH_BASE; b.biome = biome; b.timer = COLLECT_TIME; b.ready = false; b.amount = 0; }
  if (type === 'flag') { b.slots = FLAG.slots; b.used = 0; }
  if (type === 'landmine') { b.arm = MINE.arm; b.armed = false; }
  if (flagId != null) b.flag = flagId;
  s.buildings.push(b);
  if (type !== 'landmine') claim(s, owner, cx, cy, type === 'guild' ? 2 : type === 'flag' ? 1 : 1);
  if (type !== 'guild' && p) p.stats.built++;
  return b;
}
function initGame(room) {
  const spawns = genSpawns(room.players.length);
  const s = { W, H, spawns, biomes: generateBiomes(spawns), grid: new Array(W * H).fill(-1), units: [], buildings: [], players: [], nextId: 1, winner: null, t: 0, peace: PEACE_TIME, weather: 'clear', weatherTimer: 40, shots: [] };
  room.players.forEach((p, i) => { s.players.push(newPlayer(p.index)); const b = spawns[i]; addBuilding(s, p.index, 'guild', b.cx, b.cy); });   // без розвідника на старті
  room.state = s; room.lastGrid = {}; room.debugFog = false;
}

function barracksOf(s, o) { return s.buildings.filter(b => b.owner === o && b.type === 'barracks'); }
function workshopsOf(s, o) { return s.buildings.filter(b => b.owner === o && b.type === 'workshop' && b.hp > 0); }
function armyCap(s, o) { return barracksOf(s, o).length * ARMY_PER_BARRACKS; }
function armyCount(s, o) { let n = 0; for (const u of s.units) if (u.owner === o && !u.scout) n++; for (const b of barracksOf(s, o)) n += (b.queue ? b.queue.length : 0); return n; }
function hasCommander(s, o) { if (s.units.some(u => u.owner === o && u.type === 'commander')) return true; for (const b of barracksOf(s, o)) if (b.queue && b.queue.some(q => q.type === 'commander')) return true; return false; }
function flagCount(s, o) { let n = 0; for (const b of s.buildings) if (b.owner === o && b.type === 'flag') n++; const p = playerOf(s, o); return n + (p ? p.flagsOwned : 0); }
function mineCount(s, o) { let n = 0; for (const b of s.buildings) if (b.owner === o && b.type === 'landmine') n++; return n; }
function isNight(s) { return (s.t % DAY_CYCLE) >= DAY_LEN; }
function hasCommanderNear(s, o, x, y) { for (const u of s.units) if (u.owner === o && u.type === 'commander' && u.hp > 0 && dist(x, y, u.x, u.y) <= UNIT.commander.aura) return true; return false; }

function nearestEnemyUnit(s, o, x, y, maxR) { let best = null, bd = maxR; for (const u of s.units) { if (u.owner === o || u.hp <= 0 || u.scout) continue; const d = dist(x, y, u.x, u.y); if (d <= bd) { bd = d; best = { ref: u, x: u.x, y: u.y, dist: d, isB: false }; } } return best; }
function nearestEnemyBuilding(s, o, x, y, maxR) { let best = null, bd = maxR; for (const b of s.buildings) { if (b.owner === o || b.hp <= 0 || b.type === 'landmine') continue; const d = dist(x, y, b.cx, b.cy); if (d <= bd) { bd = d; best = { ref: b, x: b.cx, y: b.cy, dist: d, isB: true }; } } return best; }
function nearestEnemyAny(s, o, x, y, maxR) { const u = nearestEnemyUnit(s, o, x, y, maxR); const b = nearestEnemyBuilding(s, o, x, y, maxR); if (u && b) return u.dist <= b.dist ? u : b; return u || b; }

function credit(s, atk, isB) { const p = playerOf(s, atk); if (!p) return; if (isB) p.stats.razed++; else p.stats.kills++; }
function hitBuilding(b, s) { b.lastHit = s.t; }
function applyDamage(s, atk, tgt, dmg, splash, splashPct) {
  const px = tgt.x, py = tgt.y; const was = tgt.ref.hp > 0;
  tgt.ref.hp -= dmg; if (tgt.isB) tgt.ref.lastHit = s.t; else tgt.ref.lastHit = s.t;
  if (was && tgt.ref.hp <= 0) credit(s, atk, tgt.isB);
  if (splash > 0) { const sd = dmg * (splashPct || 0.6); for (const u of s.units) { if (u.owner === atk || u.hp <= 0 || u.scout || u === tgt.ref) continue; if (dist(px, py, u.x, u.y) <= splash) { const w = u.hp > 0; u.hp -= sd; u.lastHit = s.t; if (w && u.hp <= 0) credit(s, atk, false); } } }
}

function step(room) {
  const s = room.state; if (!s || s.winner !== null) return;
  s.t += DT; s.shots = [];
  if (s.peace > 0) s.peace = Math.max(0, s.peace - DT);
  const peace = s.peace > 0;
  s.weatherTimer -= DT; if (s.weatherTimer <= 0) { s.weather = Math.random() < 0.35 ? 'rain' : 'clear'; s.weatherTimer = 30 + Math.random() * 40; }
  const speedMul = s.weather === 'rain' ? 0.7 : 1;

  // економіка / жетони / відродження розвідника
  for (const p of s.players) {
    if (!p.alive) continue;
    p.res.gold += (0.30 + 0.10 * p.guildLevel) * DT;
    p.tokenTimer -= DT; if (p.tokenTimer <= 0) { p.res.tokens += 1; p.tokenTimer = tokenCooldown(p); }
    if (p.scoutRespawn > 0) { p.scoutRespawn -= DT; if (p.scoutRespawn <= 0 && p.tech.scouting >= 1 && !s.units.some(u => u.owner === p.index && u.scout)) { const g = s.buildings.find(b => b.owner === p.index && b.type === 'guild'); if (g) spawnScout(s, p.index, g.cx, g.cy - 1); } }
  }
  // ресурсні споруди
  for (const b of s.buildings) {
    if (!b.resKind) continue; const p = playerOf(s, b.owner); if (!p || !p.alive) continue;
    if (!b.ready) { b.timer -= DT; if (b.timer <= 0) { const kind = BUILD[b.type].kind; const techLvl = p.tech[kind === 'mine' ? 'mining' : kind === 'lumber' ? 'lumber' : 'farming']; const mult = (b.resKind === 'gold') ? 1 : BIOME_MULT[b.biome][kind]; b.amount = Math.round(b.base * mult * (1 + 0.12 * techLvl)); b.ready = true; } }
    if (b.ready && p.autoCollect) { p.res[b.resKind] += b.amount; p.stats.gathered += b.amount; b.ready = false; b.amount = 0; b.timer = COLLECT_TIME; }
  }
  // черга виробництва
  for (const b of s.buildings) {
    if (b.type !== 'barracks' || !b.queue || !b.queue.length) continue;
    const q = b.queue[0]; q.time -= DT;
    if (q.time <= 0) { const offs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [2, 0], [0, 2]]; let sx = b.cx, sy = b.cy; for (const [dx, dy] of offs) { const c = b.cx + dx, r = b.cy + dy; if (c >= 0 && c < W && r >= 0 && r < H) { sx = c; sy = r; break; } } spawnUnit(s, b.owner, q.type, sx, sy); b.queue.shift(); }
  }
  // пасивний ремонт споруд
  for (const b of s.buildings) { if (b.type === 'landmine') continue; if (b.hp < b.maxHp && s.t - b.lastHit >= REPAIR_DELAY) b.hp = Math.min(b.maxHp, b.hp + REPAIR_PER_SEC * DT); }

  // мапа стін для колізій
  const wallCell = new Map();
  for (const b of s.buildings) if (b.type === 'wall' && b.hp > 0) wallCell.set(b.cy * W + b.cx, b.owner);

  if (!peace) {
    // вежі / пушки
    for (const b of s.buildings) {
      b.cd = Math.max(0, b.cd - DT); const def = BUILD[b.type];
      if ((b.type === 'tower' || b.type === 'cannon') && b.cd <= 0) { const t = nearestEnemyAny(s, b.owner, b.cx, b.cy, def.range); if (t) { let dmg = def.dmg; if (t.isB) dmg *= 1; applyDamage(s, b.owner, t, dmg, def.splash || 0, def.splashPct); b.cd = def.cd; s.shots.push({ x: b.cx, y: b.cy, tx: t.x, ty: t.y, k: b.type === 'cannon' ? 'ball' : 'arrow' }); } }
    }
    // міни
    for (const b of s.buildings) {
      if (b.type !== 'landmine') continue;
      if (!b.armed) { b.arm -= DT; if (b.arm <= 0) b.armed = true; continue; }
      let direct = null, dd = MINE.trigger;
      for (const u of s.units) { if (u.owner === b.owner || u.hp <= 0 || u.scout) continue; const d = dist(b.cx, b.cy, u.x, u.y); if (d <= dd) { dd = d; direct = u; } }
      if (direct) {
        if (MINE_LETHAL.has(direct.type)) { const w = direct.hp > 0; direct.hp = 0; if (w) credit(s, b.owner, false); }
        else { const w = direct.hp > 0; direct.hp -= MINE.heavy; direct.lastHit = s.t; if (w && direct.hp <= 0) credit(s, b.owner, false); }
        for (const u of s.units) { if (u.owner === b.owner || u.hp <= 0 || u.scout || u === direct) continue; const d = dist(b.cx, b.cy, u.x, u.y); if (d <= MINE.boom) { const dm = d <= 1.4 ? 80 : 40; const w = u.hp > 0; u.hp -= dm; u.lastHit = s.t; if (w && u.hp <= 0) credit(s, b.owner, false); } }
        b.hp = 0;
      }
    }
  }

  // юніти
  for (const u of s.units) {
    u.cd = Math.max(0, u.cd - DT);
    if (u.scout) { if (u.hasCmd) { const p = playerOf(s, u.owner); const sp = SCOUT_SPEED[p.tech.scouting] || 3.6; if (dist(u.x, u.y, u.mx, u.my) <= 0.15) { u.x = u.mx; u.y = u.my; u.hasCmd = false; } else moveUnit(s, u, [u.mx, u.my], sp * speedMul, wallCell); } continue; }
    const def = UNIT[u.type]; const p = playerOf(s, u.owner);

    // священник — лікування (не переслідує, рух лише за командою)
    if (u.type === 'priest') { if (u.hasCmd && !peace) { if (dist(u.x, u.y, u.mx, u.my) <= 0.15) { u.x = u.mx; u.y = u.my; u.hasCmd = false; } else moveUnit(s, u, [u.mx, u.my], def.speed * speedMul, wallCell); } else if (u.hasCmd && peace) { if (dist(u.x, u.y, u.mx, u.my) <= 0.15) { u.hasCmd = false; } } priestHeal(s, u, p); continue; }
    // командир — тільки рух за командою, аура окремо
    if (u.type === 'commander') { if (u.hasCmd) { if (peace) { if (dist(u.x, u.y, u.mx, u.my) <= 0.15) u.hasCmd = false; } else { if (dist(u.x, u.y, u.mx, u.my) <= 0.15) { u.x = u.mx; u.y = u.my; u.hasCmd = false; } else moveUnit(s, u, [u.mx, u.my], def.speed * speedMul, wallCell); } } continue; }

    if (peace) { if (u.hasCmd && dist(u.x, u.y, u.mx, u.my) <= 0.15) u.hasCmd = false; continue; }  // мир: армія не рухається/не б'ється

    let tgt = null, attacked = false;
    if (u.type === 'ram') tgt = nearestEnemyBuilding(s, u.owner, u.x, u.y, Math.max(def.range, def.aggro));
    else tgt = nearestEnemyAny(s, u.owner, u.x, u.y, Math.max(def.range, def.aggro));
    if (tgt && tgt.dist <= def.range + 0.2 && u.cd <= 0) {
      let dmg = unitDamage(s, u, p, tgt.isB);
      applyDamage(s, u.owner, tgt, dmg, tgt.isB ? 0 : (def.splash || 0), def.splashPct); u.cd = def.cd; u.lastAtk = s.t;
      if (def.range > 1.6) s.shots.push({ x: u.x, y: u.y, tx: tgt.x, ty: tgt.y, k: u.type === 'mage' ? 'magic' : u.type === 'catapult' ? 'ball' : 'arrow' });
      attacked = true;
    }
    if (!attacked) {
      let dest = null;
      if (u.hasCmd) { const d = dist(u.x, u.y, u.mx, u.my); if (d <= 0.15) { u.x = u.mx; u.y = u.my; u.hasCmd = false; } else dest = [u.mx, u.my]; }
      if (!dest && tgt && tgt.dist <= def.aggro && tgt.dist > def.range + 0.1) dest = [tgt.x, tgt.y];
      if (dest) moveUnit(s, u, dest, def.speed * speedMul, wallCell);
    }
  }
  separate(s);

  // прибирання мертвих
  const kept = [];
  for (const u of s.units) { if (u.hp > 0) { kept.push(u); continue; } if (u.scout) { const p = playerOf(s, u.owner); if (p) p.scoutRespawn = SCOUT_RESPAWN; } else { const p = playerOf(s, u.owner); if (p) p.stats.lost++; } }
  s.units = kept;
  const deadGuilds = [], deadFlags = [];
  s.buildings = s.buildings.filter(b => { if (b.hp > 0) return true; const p = playerOf(s, b.owner); if (p) p.stats.blost++; if (b.type === 'guild') deadGuilds.push(b.owner); if (b.type === 'flag') deadFlags.push(b.id); return false; });
  if (deadFlags.length) s.buildings = s.buildings.filter(b => !(b.flag != null && deadFlags.includes(b.flag)));
  for (const o of deadGuilds) { const p = playerOf(s, o); if (p) p.alive = false; s.units = s.units.filter(u => u.owner !== o); s.buildings = s.buildings.filter(b => b.owner !== o); }
  for (const u of s.units) { if (u.scout) continue; const c = Math.round(u.x), r = Math.round(u.y); if (c >= 0 && c < W && r >= 0 && r < H && s.grid[r * W + c] === -1) s.grid[r * W + c] = u.owner; }

  if (!room.debug) { const alive = s.players.filter(p => p.alive); if (alive.length <= 1 && s.players.length > 1) return finishGame(room, alive.length === 1 ? alive[0].index : -1); }
  broadcast(room);
}
function unitDamage(s, u, p, tgtIsB) {
  if (u.type === 'ram') return tgtIsB ? 24 : 0;
  let d = UNIT[u.type].dmg * warDmgMult(p);
  if (hasCommanderNear(s, u.owner, u.x, u.y)) d *= (1 + UNIT.commander.auraBonus);
  if (tgtIsB) d *= (u.type === 'catapult') ? 1.0 : BUILD_DMG_UNIT;
  return d;
}
function priestHeal(s, u, p) {
  if (u.cd > 0) { u.cd = Math.max(0, u.cd - 0); }
  if (u._hcd === undefined) u._hcd = 0; u._hcd = Math.max(0, u._hcd - DT); if (u._hcd > 0) return;
  const battleMed = p.tech.army >= 5;
  let best = null, bd = UNIT.priest.healRange;
  for (const o of s.units) { if (o.owner !== u.owner || o === u || o.hp <= 0 || o.scout) continue; if (o.type === 'priest' || o.type === 'commander') continue; if (o.hp >= o.maxHp) continue; const d = dist(u.x, u.y, o.x, o.y); if (d <= bd) { bd = d; best = o; } }
  if (!best) return;
  const inCombat = (s.t - best.lastHit < 4) || (s.t - best.lastAtk < 4);
  if (!battleMed && inCombat) return;               // без бойової медицини — тільки поза боєм
  const amount = battleMed ? (inCombat ? 3 : 6) : 6;
  best.hp = Math.min(best.maxHp, best.hp + amount); u._hcd = UNIT.priest.healCd;
}
function avoidSteer(s, u, vx, vy) {
  // обхід союзних юнітів попереду: додаємо перпендикулярну складову (звертаємо вбік, а не штовхаємо)
  const LOOK = 2.2; const px = -vy, py = vx;            // перпендикуляр до напрямку руху
  let sx = 0, sy = 0, hit = false;
  for (const o of s.units) {
    if (o === u || o.owner !== u.owner || o.scout || o.hp <= 0) continue;
    const dx = o.x - u.x, dy = o.y - u.y, d = Math.hypot(dx, dy);
    if (d > LOOK || d < 0.0001) continue;
    if (dx * vx + dy * vy <= 0.1) continue;             // лише ті, хто попереду
    hit = true; const w = (LOOK - d) / LOOK;            // 0..1, більше чим ближче
    let side = dx * px + dy * py;                       // з якого боку перешкода
    let sgn = side >= 0 ? -1 : 1;                        // звертаємо в протилежний бік
    if (Math.abs(side) < 0.05) sgn = (u.id % 2 === 0) ? 1 : -1;   // точно по лінії — детермінований бік
    sx += px * sgn * w; sy += py * sgn * w;
  }
  if (!hit) return [vx, vy];
  let nx = vx + sx * 1.8, ny = vy + sy * 1.8; const m = Math.hypot(nx, ny);
  if (m < 0.0001) return [vx, vy];
  return [nx / m, ny / m];
}
function moveUnit(s, u, dest, speed, wallCell) {
  if (!dest) return; const dx = dest[0] - u.x, dy = dest[1] - u.y, d = Math.hypot(dx, dy); if (d <= 0.01) return;
  let dirx = dx / d, diry = dy / d;
  if (!u.scout) { const st = avoidSteer(s, u, dirx, diry); dirx = st[0]; diry = st[1]; }
  const dstep = Math.min(d, speed * DT);
  let nx = clamp(u.x + dirx * dstep, 0, W - 1), ny = clamp(u.y + diry * dstep, 0, H - 1);
  const cell = Math.round(ny) * W + Math.round(nx); const wo = wallCell.get(cell);
  if (wo != null && wo !== u.owner) { const cell2 = Math.round(u.y) * W + Math.round(nx); const cell3 = Math.round(ny) * W + Math.round(u.x); // ковзання вздовж стіни
    if (!(wallCell.get(cell2) != null && wallCell.get(cell2) !== u.owner)) ny = u.y; else if (!(wallCell.get(cell3) != null && wallCell.get(cell3) !== u.owner)) nx = u.x; else return; }
  u.x = nx; u.y = ny;
}
function separate(s) {
  const arr = s.units.filter(u => !u.scout && u.hp > 0);
  for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
    const a = arr[i], b = arr[j]; if (a.owner !== b.owner) continue;
    let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d < SEP && d > 0.0001) { const push = (SEP - d) * 0.25; dx /= d; dy /= d; a.x = clamp(a.x - dx * push, 0, W - 1); a.y = clamp(a.y - dy * push, 0, H - 1); b.x = clamp(b.x + dx * push, 0, W - 1); b.y = clamp(b.y + dy * push, 0, H - 1); }
    else if (d <= 0.0001) { a.x = clamp(a.x - 0.05, 0, W - 1); b.x = clamp(b.x + 0.05, 0, W - 1); }
  }
}

function visibleCells(s, o) {
  const vis = new Uint8Array(W * H); const night = isNight(s) ? 0.62 : 1;
  const mark = (cx, cy, rr) => { const r = Math.max(2, Math.round(rr * night)), r2 = r * r; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (dx * dx + dy * dy > r2) continue; const c = (cx | 0) + dx, rw = (cy | 0) + dy; if (c >= 0 && c < W && rw >= 0 && rw < H) vis[rw * W + c] = 1; } };
  const p = playerOf(s, o); const scoutR = SCOUT_VISION[p.tech.scouting] || 0;
  for (const u of s.units) if (u.owner === o) mark(u.x, u.y, u.scout ? scoutR : 4);
  for (const b of s.buildings) if (b.owner === o) mark(b.cx, b.cy, b.type === 'guild' ? 7 : b.type === 'flag' ? FLAG.vision : b.type === 'landmine' ? 0 : 5);
  return vis;
}
function mineVisible(s, o, mineB) {   // ворожа міна видима лише в радіусі детекції розвідника
  const p = playerOf(s, o); const det = MINE_DETECT[p.tech.scouting] || 0; if (det <= 0) return false;
  for (const u of s.units) if (u.owner === o && u.scout && dist(u.x, u.y, mineB.cx, mineB.cy) <= det) return true;
  return false;
}
function serializeEntities(s, o, full, vis) {
  const seen = (c, r) => full || vis[r * W + c] === 1;
  const meP = playerOf(s, o) || s.players[0];
  const units = [];
  for (const u of s.units) {
    if (u.scout) { units.push({ i: u.id, o: u.owner, t: 'scout', x: r2(u.x), y: r2(u.y), h: Math.round(u.hp), m: u.maxHp, s: 1 }); continue; }
    if (u.owner !== o && !full && !seen(Math.round(u.x), Math.round(u.y))) continue;
    units.push({ i: u.id, o: u.owner, t: u.type, x: r2(u.x), y: r2(u.y), h: Math.round(u.hp), m: u.maxHp, s: 0 });
  }
  const builds = [];
  for (const b of s.buildings) {
    if (b.type === 'landmine') { if (b.owner === o) { builds.push({ i: b.id, o: b.owner, t: 'landmine', x: b.cx, y: b.cy, h: Math.round(b.hp), m: b.maxHp, arm: b.armed ? 0 : Math.ceil(b.arm) }); } else if (full || mineVisible(s, o, b)) { builds.push({ i: b.id, o: b.owner, t: 'landmine', x: b.cx, y: b.cy, h: Math.round(b.hp), m: b.maxHp, en: 1 }); } continue; }
    if (b.owner !== o && !full && !seen(b.cx, b.cy)) continue;
    const ob = { i: b.id, o: b.owner, t: b.type, x: b.cx, y: b.cy, h: Math.round(b.hp), m: b.maxHp };
    if (b.type === 'guild') { const gp = playerOf(s, b.owner); ob.gl = gp ? gp.guildLevel : 1; }
    if (b.type === 'barracks' && b.owner === o) { ob.q = b.queue.length; if (b.queue.length) { const f = b.queue[0]; ob.prog = 1 - f.time / f.total; } }
    if (b.resKind && b.owner === o) { ob.rd = b.ready ? 1 : 0; ob.am = b.amount; ob.tp = b.ready ? 1 : 1 - b.timer / COLLECT_TIME; ob.rk = b.resKind; }
    builds.push(ob);
  }
  const shots = [];
  for (const sh of s.shots) if (full || vis[(sh.y | 0) * W + (sh.x | 0)] === 1 || vis[(sh.ty | 0) * W + (sh.tx | 0)] === 1) shots.push(sh);
  return {
    winner: s.winner, peace: Math.ceil(s.peace), units, buildings: builds, shots, weather: s.weather, night: isNight(s),
    me: { index: meP.index, color: meP.color, alive: meP.alive, res: roundRes(meP.res), tech: meP.tech, guildLevel: meP.guildLevel, guildProg: meP.guildProg, army: armyCount(s, o), cap: armyCap(s, o), flags: meP.flagsOwned, flagsTotal: flagCount(s, o), flagCap: flagCapOf(meP), autoCollect: meP.autoCollect, workshops: workshopsOf(s, o).length, mines: mineCount(s, o), hasScout: s.units.some(u => u.owner === o && u.scout), hasCommander: hasCommander(s, o) },
    players: s.players.map(p => ({ index: p.index, color: p.color, alive: p.alive })),
  };
}
function r2(v) { return Math.round(v * 100) / 100; }
function roundRes(r) { const o = {}; for (const k in r) o[k] = Math.floor(r[k]); return o; }
function gridFor(s, o, full, vis) { const out = new Array(W * H); for (let i = 0; i < W * H; i++) { const g = s.grid[i]; out[i] = full ? g : (vis[i] ? g : (g === o ? g : -2)); } return out; }
function sendState(sock, room, o, full, key) {
  const s = room.state; const vis = full ? null : visibleCells(s, o);
  const ent = serializeEntities(s, o, full, vis); const g = gridFor(s, o, full, vis);
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
  socket.emit('gameStarted', { W, H, biomes: room.state.biomes, spawns: room.state.spawns, debug: true });
  room.loop = setInterval(() => step(room), TICK_MS);
}

function inZone(s, o, cx, cy) {
  const me = playerOf(s, o);
  const guild = s.buildings.find(b => b.owner === o && b.type === 'guild');
  if (guild) { const R = INF_BASE + me.tech.influence * INF_STEP; if (cheb(cx, cy, guild.cx, guild.cy) <= R) return { ok: true, flag: null }; }
  let best = null, bd = 1e9;
  for (const b of s.buildings) if (b.owner === o && b.type === 'flag' && b.used < b.slots) { const d = cheb(cx, cy, b.cx, b.cy); if (d <= FLAG.radius && d < bd) { bd = d; best = b; } }
  if (best) return { ok: true, flag: best.id };
  return { ok: false };
}
function buildPlacement(s, o, type, cx, cy) {
  if (cx < 0 || cx >= W || cy < 0 || cy >= H) return { ok: false };
  if (s.buildings.some(b => b.cx === cx && b.cy === cy)) return { ok: false };
  if (type !== 'wall' && type !== 'landmine' && s.buildings.some(b => b.type !== 'landmine' && cheb(b.cx, b.cy, cx, cy) <= 1)) return { ok: false, reason: 'gap' };
  return inZone(s, o, cx, cy);
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
    io.to(room.code).emit('gameStarted', { W, H, biomes: room.state.biomes, spawns: room.state.spawns });
    room.loop = setInterval(() => step(room), TICK_MS); broadcastLobby(room);
  });
  socket.on('switchEmpire', () => { if (!socket.data.debug) return; const room = rooms[socket.data.room]; if (!room) return; socket.data.index = (socket.data.index + 1) % room.players.length; room.lastGrid = {}; socket.emit('empireSwitched', { index: socket.data.index, color: COLORS[socket.data.index] }); });
  socket.on('toggleFog', () => { if (!socket.data.debug) return; const room = rooms[socket.data.room]; if (!room) return; room.debugFog = !room.debugFog; room.lastGrid = {}; socket.emit('fogToggled', { on: room.debugFog }); });
  socket.on('debugEnd', () => { if (!socket.data.debug) return; const room = rooms[socket.data.room]; if (!room || !room.state) return; finishGame(room, chooseWinner(room.state)); });
  socket.on('debugGrant', () => { if (!socket.data.debug) return; const room = rooms[socket.data.room]; if (!room || !room.state) return; const p = playerOf(room.state, socket.data.index); if (!p) return; p.res.wood += 1000; p.res.stone += 1000; p.res.food += 1000; p.res.gold += 1000; p.res.tokens += 50; });

  socket.on('command', (cmd) => {
    const room = rooms[socket.data.room]; if (!room || !room.started || !room.state || room.state.winner !== null) return;
    const s = room.state, o = socket.data.index, me = playerOf(s, o); if (!me || !me.alive) return;
    const peace = s.peace > 0;

    if (cmd.type === 'move') {
      const x = clamp(cmd.x, 0, W - 1), y = clamp(cmd.y, 0, H - 1), ids = new Set(cmd.ids || []);
      for (const u of s.units) { if (u.owner !== o || !ids.has(u.id)) continue; if (peace && !u.scout) continue; u.mx = x; u.my = y; u.hasCmd = true; }
    }
    else if (cmd.type === 'tech') {
      const k = cmd.branch; if (!TECH_KEYS.includes(k)) return;
      const lvl = me.tech[k]; if (lvl >= 5) return; const cost = TECH_COST[lvl]; if (me.res.tokens < cost) return;
      me.res.tokens -= cost; me.tech[k] = lvl + 1;
      if (k === 'warfare') relevelUnits(s, me);
      if (k === 'defense') relevelBuildings(s, me);
      if (k === 'scouting' && lvl === 0) { if (!s.units.some(u => u.owner === o && u.scout)) { const g = s.buildings.find(b => b.owner === o && b.type === 'guild'); if (g) spawnScout(s, o, g.cx, g.cy - 1); } }
      me.guildProg += GUILD_PER_UPGRADE;
      while (me.guildProg >= 1 && me.guildLevel < GUILD_CAP) { me.guildProg -= 1; me.guildLevel++; relevelBuildings(s, me); }
      if (me.guildLevel >= GUILD_CAP) me.guildProg = Math.min(me.guildProg, 0.999);
    }
    else if (cmd.type === 'autoCollect') {
      if (me.autoCollect) return; if (me.res.tokens < AUTO_COST) return; me.res.tokens -= AUTO_COST; me.autoCollect = true;
    }
    else if (cmd.type === 'produce') {
      const type = cmd.unit, def = UNIT[type]; if (!def) return;
      if (me.tech.army < def.unlock) return;
      if (def.max1 && hasCommander(s, o)) return;
      if (def.workshop && workshopsOf(s, o).length === 0) return;
      const b = s.buildings.find(bb => bb.id === cmd.building && bb.owner === o && bb.type === 'barracks'); if (!b) return;
      if (armyCount(s, o) >= armyCap(s, o)) return;
      const c = def; if (me.res.food < (c.food || 0) || me.res.gold < (c.gold || 0) || (me.res.wood || 0) < (c.wood || 0) || (me.res.stone || 0) < (c.stone || 0)) return;
      me.res.food -= (c.food || 0); me.res.gold -= (c.gold || 0); me.res.wood -= (c.wood || 0); me.res.stone -= (c.stone || 0);
      b.queue.push({ type, time: def.build, total: def.build });
    }
    else if (cmd.type === 'build') {
      const type = cmd.build, def = BUILD[type]; if (!def || type === 'guild' || type === 'flag') return;
      if (me.tech.construction < def.construction) return;
      const cx = cmd.cx | 0, cy = cmd.cy | 0;
      if (type === 'landmine') { if (!placeMineOk(s, o, cx, cy)) return; }
      else { const pl = buildPlacement(s, o, type, cx, cy); if (!pl.ok) return; var flagId = pl.flag; }
      const c = def.cost; if ((me.res.wood || 0) < (c.wood || 0) || (me.res.stone || 0) < (c.stone || 0) || (me.res.gold || 0) < (c.gold || 0)) return;
      me.res.wood -= (c.wood || 0); me.res.stone -= (c.stone || 0); me.res.gold -= (c.gold || 0);
      const nb = addBuilding(s, o, type, cx, cy, type === 'landmine' ? null : flagId);
      if (type !== 'landmine' && flagId != null) { const fb = s.buildings.find(x => x.id === flagId); if (fb) fb.used++; }
    }
    else if (cmd.type === 'collect') {
      const b = s.buildings.find(bb => bb.id === cmd.building && bb.owner === o);
      if (!b || !b.resKind || !b.ready) return;
      me.res[b.resKind] += b.amount; me.stats.gathered += b.amount; b.ready = false; b.amount = 0; b.timer = COLLECT_TIME;
    }
    else if (cmd.type === 'demolish') {
      const b = s.buildings.find(bb => bb.id === cmd.building && bb.owner === o); if (!b || b.type === 'guild') return;
      if (b.flag != null) { const fb = s.buildings.find(x => x.id === b.flag); if (fb) fb.used = Math.max(0, fb.used - 1); }
      b.hp = 0;
    }
    else if (cmd.type === 'buyFlag') {
      if (flagCount(s, o) >= flagCapOf(me)) return;
      const c = FLAG.cost; if ((me.res.wood || 0) < c.wood || (me.res.stone || 0) < c.stone || (me.res.gold || 0) < c.gold) return;
      me.res.wood -= c.wood; me.res.stone -= c.stone; me.res.gold -= c.gold; me.flagsOwned++;
    }
    else if (cmd.type === 'placeFlag') {
      if (me.flagsOwned <= 0) return;
      const sc = s.units.find(u => u.owner === o && u.scout); if (!sc) return;
      const cx = Math.round(sc.x), cy = Math.round(sc.y);
      if (s.buildings.some(b => b.type !== 'landmine' && cheb(b.cx, b.cy, cx, cy) <= 1)) return;
      const cell = s.grid[cy * W + cx]; if (cell >= 0 && cell !== o) return;
      me.flagsOwned--; addBuilding(s, o, 'flag', cx, cy);
    }
  });

  socket.on('disconnect', () => { leaveCurrentRoom(socket); });
});

function placeMineOk(s, o, cx, cy) {
  if (cx < 0 || cx >= W || cy < 0 || cy >= H) return false;
  if (s.buildings.some(b => b.cx === cx && b.cy === cy)) return false;
  if (s.units.some(u => u.owner !== o && !u.scout && Math.round(u.x) === cx && Math.round(u.y) === cy)) return false;
  const cell = s.grid[cy * W + cx]; if (cell >= 0 && cell !== o) return false;
  if (mineCount(s, o) >= MINE.max) return false;
  if (s.buildings.some(b => b.owner === o && b.type === 'landmine' && cheb(b.cx, b.cy, cx, cy) < MINE.spacing)) return false;
  return inZone(s, o, cx, cy).ok;
}
function relevelBuildings(s, p) { for (const b of s.buildings) { if (b.owner !== p.index || b.type === 'landmine') continue; const ratio = b.hp / b.maxHp; b.maxHp = buildingMaxHp(p, b.type); b.hp = Math.max(1, Math.round(b.maxHp * ratio)); } }
function relevelUnits(s, p) { for (const u of s.units) { if (u.owner !== p.index || u.scout) continue; const old = u.maxHp; u.maxHp = unitMaxHp(p, u.type); u.hp = Math.min(u.maxHp, u.hp + (u.maxHp - old)); if (u.hp < 1) u.hp = 1; } }

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Чотири Імперії Balance v2 — сервер на порту ' + PORT));
