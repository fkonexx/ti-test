// ============================================================
//  ТРИ ІМПЕРІЇ — сервер (Node.js + Socket.IO)
//  Сервер тримає одну спільну гру на кімнату і 10 разів на
//  секунду перераховує стан та розсилає його всім гравцям.
// ============================================================

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
app.use(express.static(__dirname));            // роздаємо index.html, style.css, client.js
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/health', (req, res) => res.send('ok'));

const server = http.createServer(app);
const io = new Server(server);

// -------------------- НАЛАШТУВАННЯ ГРИ --------------------
const W = 24, H = 24;                           // розмір карти в клітинках
const COLORS = ['red', 'blue', 'green'];
const BASES  = [{ cx: 4, cy: 4 }, { cx: 19, cy: 4 }, { cx: 11, cy: 19 }];

const UNIT = {
  soldier: { hp: 30,  dmg: 7,  range: 1.0, aggro: 2.6, speed: 3.0, cd: 0.6, cost: 20 },
  archer:  { hp: 18,  dmg: 6,  range: 3.2, aggro: 4.0, speed: 2.4, cd: 0.9, cost: 30 },
  tank:    { hp: 120, dmg: 16, range: 1.3, aggro: 2.6, speed: 1.4, cd: 1.0, cost: 60 },
};
const BUILD = {
  base:     { hp: 340, cost: 0 },
  mine:     { hp: 70,  cost: 40 },
  barracks: { hp: 90,  cost: 50 },
  tower:    { hp: 130, cost: 60, range: 3.6, dmg: 9, cd: 0.8 },
};
const START_GOLD = 120;
const TICK_MS = 100;                            // 10 оновлень на секунду
const DT = TICK_MS / 1000;

const rooms = {};                               // code -> room

// -------------------- ДОПОМІЖНІ --------------------
function makeCode() {
  const s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += s[Math.floor(Math.random() * s.length)];
  return c;
}
function newRoomCode() { let c; do { c = makeCode(); } while (rooms[c]); return c; }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function claim(s, owner, cx, cy) {
  const set = (c, r) => { if (c >= 0 && c < W && r >= 0 && r < H) s.grid[r * W + c] = owner; };
  set(cx, cy); set(cx + 1, cy); set(cx - 1, cy); set(cx, cy + 1); set(cx, cy - 1);
}
function spawnUnit(s, owner, type, x, y) {
  const def = UNIT[type];
  s.units.push({ id: s.nextId++, owner, type, x, y, mx: x, my: y, hasCmd: false, hp: def.hp, cd: 0 });
}
function incomeFor(s, owner) {
  let inc = 0;
  for (const b of s.buildings) {
    if (b.owner !== owner) continue;
    if (b.type === 'base') inc += 2;
    else if (b.type === 'mine') inc += 3;
  }
  return inc;
}
function nearestEnemy(s, owner, x, y, maxR) {
  let best = null, bd = maxR;
  for (const u of s.units) {
    if (u.owner === owner || u.hp <= 0) continue;
    const d = dist(x, y, u.x, u.y);
    if (d <= bd) { bd = d; best = { ref: u, x: u.x, y: u.y, dist: d }; }
  }
  for (const b of s.buildings) {
    if (b.owner === owner || b.hp <= 0) continue;
    const d = dist(x, y, b.cx, b.cy);
    if (d <= bd) { bd = d; best = { ref: b, x: b.cx, y: b.cy, dist: d }; }
  }
  return best;
}

// -------------------- СТВОРЕННЯ ГРИ --------------------
function initGame(room) {
  const s = { W, H, grid: new Array(W * H).fill(-1), units: [], buildings: [], players: [], nextId: 1, winner: null };
  room.players.forEach(p => {
    s.players.push({ index: p.index, color: p.color, gold: START_GOLD, alive: true });
    const base = BASES[p.index];
    s.buildings.push({ id: s.nextId++, owner: p.index, type: 'base', cx: base.cx, cy: base.cy, hp: BUILD.base.hp, maxHp: BUILD.base.hp, cd: 0 });
    claim(s, p.index, base.cx, base.cy);
    spawnUnit(s, p.index, 'soldier', base.cx + 1, base.cy);
    spawnUnit(s, p.index, 'soldier', base.cx - 1, base.cy);
    spawnUnit(s, p.index, 'soldier', base.cx, base.cy + 1);
  });
  room.state = s;
}

// -------------------- ІГРОВИЙ ТІК --------------------
function step(room) {
  const s = room.state;
  if (!s || s.winner !== null) return;

  // 1) дохід
  for (const p of s.players) { if (p.alive) p.gold += incomeFor(s, p.index) * DT; }

  // 2) вежі стріляють
  for (const b of s.buildings) {
    b.cd = Math.max(0, b.cd - DT);
    if (b.type === 'tower') {
      const t = nearestEnemy(s, b.owner, b.cx, b.cy, BUILD.tower.range);
      if (t && b.cd <= 0) { t.ref.hp -= BUILD.tower.dmg; b.cd = BUILD.tower.cd; }
    }
  }

  // 3) юніти: бій + рух
  for (const u of s.units) {
    u.cd = Math.max(0, u.cd - DT);
    const def = UNIT[u.type];
    const tgt = nearestEnemy(s, u.owner, u.x, u.y, Math.max(def.range, def.aggro) + 0.5);
    let attacking = false;

    if (tgt && tgt.dist <= def.range + 0.05) {
      if (u.cd <= 0) { tgt.ref.hp -= def.dmg; u.cd = def.cd; }
      attacking = true;                          // стоїмо і б'ємо
    }
    if (!attacking) {
      let dx = null, dy = null;
      if (u.hasCmd) {
        const ddx = u.mx - u.x, ddy = u.my - u.y, d = Math.hypot(ddx, ddy);
        if (d > 0.15) { dx = ddx / d; dy = ddy / d; } else { u.hasCmd = false; }
      }
      if (dx === null && tgt && tgt.dist <= def.aggro) {  // idle-юніт сам іде до ворога поруч
        const ddx = tgt.x - u.x, ddy = tgt.y - u.y, d = Math.hypot(ddx, ddy) || 1;
        dx = ddx / d; dy = ddy / d;
      }
      if (dx !== null) {
        u.x = clamp(u.x + dx * def.speed * DT, 0, W - 1);
        u.y = clamp(u.y + dy * def.speed * DT, 0, H - 1);
      }
    }
  }

  // 4) прибираємо мертвих
  s.units = s.units.filter(u => u.hp > 0);
  const deadBaseOwners = [];
  s.buildings = s.buildings.filter(b => {
    if (b.hp > 0) return true;
    if (b.type === 'base') deadBaseOwners.push(b.owner);
    return false;
  });
  for (const owner of deadBaseOwners) {
    const p = s.players.find(pp => pp.index === owner);
    if (p) p.alive = false;
    s.units = s.units.filter(u => u.owner !== owner);
    s.buildings = s.buildings.filter(b => b.owner !== owner);
  }

  // 5) захоплення території (клітинка під юнітом стає його)
  for (const u of s.units) {
    const c = Math.round(u.x), r = Math.round(u.y);
    if (c >= 0 && c < W && r >= 0 && r < H) s.grid[r * W + c] = u.owner;
  }

  // 6) перевірка перемоги
  const alive = s.players.filter(p => p.alive);
  if (alive.length <= 1) s.winner = alive.length === 1 ? alive[0].index : -1;

  io.to(room.code).emit('state', serialize(s));
}

function serialize(s) {
  return {
    W: s.W, H: s.H,
    grid: s.grid,
    units: s.units.map(u => ({ i: u.id, o: u.owner, t: u.type, x: Math.round(u.x * 100) / 100, y: Math.round(u.y * 100) / 100, h: Math.round(u.hp), m: UNIT[u.type].hp })),
    buildings: s.buildings.map(b => ({ i: b.id, o: b.owner, t: b.type, x: b.cx, y: b.cy, h: Math.round(b.hp), m: b.maxHp })),
    players: s.players.map(p => ({ index: p.index, color: p.color, gold: Math.floor(p.gold), alive: p.alive })),
    winner: s.winner,
  };
}

function broadcastLobby(room) {
  io.to(room.code).emit('lobby', {
    code: room.code,
    host: room.host,
    started: room.started,
    players: room.players.map(p => ({ index: p.index, color: p.color, name: p.name, connected: p.connected, id: p.id })),
  });
}

// -------------------- ОБРОБКА ПІДКЛЮЧЕНЬ --------------------
io.on('connection', (socket) => {

  socket.on('createRoom', ({ name } = {}) => {
    const code = newRoomCode();
    const room = { code, host: socket.id, started: false, players: [], state: null, loop: null };
    rooms[code] = room;
    const player = { id: socket.id, name: (name || 'Гравець 1').slice(0, 16), index: 0, color: COLORS[0], connected: true };
    room.players.push(player);
    socket.data.room = code; socket.data.index = 0;
    socket.join(code);
    socket.emit('joined', { code, index: 0, color: player.color, host: true });
    broadcastLobby(room);
  });

  socket.on('joinRoom', ({ code, name } = {}) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms[code];
    if (!room) return socket.emit('errorMsg', 'Кімнату не знайдено');
    if (room.started) return socket.emit('errorMsg', 'Гра вже почалась');
    if (room.players.length >= 3) return socket.emit('errorMsg', 'Кімната повна (макс. 3)');
    const index = room.players.length;
    const player = { id: socket.id, name: (name || ('Гравець ' + (index + 1))).slice(0, 16), index, color: COLORS[index], connected: true };
    room.players.push(player);
    socket.data.room = code; socket.data.index = index;
    socket.join(code);
    socket.emit('joined', { code, index, color: player.color, host: room.host === socket.id });
    broadcastLobby(room);
  });

  socket.on('startGame', () => {
    const room = rooms[socket.data.room];
    if (!room || room.host !== socket.id || room.started) return;
    if (room.players.length < 2) return socket.emit('errorMsg', 'Потрібно щонайменше 2 гравці');
    initGame(room);
    room.started = true;
    io.to(room.code).emit('gameStarted', { W, H });
    room.loop = setInterval(() => step(room), TICK_MS);
    broadcastLobby(room);
  });

  socket.on('command', (cmd) => {
    const room = rooms[socket.data.room];
    if (!room || !room.started || !room.state) return;
    const s = room.state;
    const owner = socket.data.index;
    const me = s.players.find(p => p.index === owner);
    if (!me || !me.alive) return;

    if (cmd.type === 'move') {
      const x = clamp(cmd.x, 0, W - 1), y = clamp(cmd.y, 0, H - 1);
      const ids = new Set(cmd.ids || []);
      for (const u of s.units) {
        if (u.owner === owner && ids.has(u.id)) { u.mx = x; u.my = y; u.hasCmd = true; }
      }
    }

    else if (cmd.type === 'produce') {
      const type = cmd.unit;
      if (!UNIT[type]) return;
      const b = s.buildings.find(bb => bb.id === cmd.building && bb.owner === owner && (bb.type === 'base' || bb.type === 'barracks'));
      if (!b || b.cd > 0) return;
      if (me.gold < UNIT[type].cost) return;
      me.gold -= UNIT[type].cost;
      b.cd = 0.9;                                // невелика затримка виробництва
      const offs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [2, 0], [0, 2]];
      let sx = b.cx, sy = b.cy;
      for (const [dx, dy] of offs) {
        const c = b.cx + dx, r = b.cy + dy;
        if (c >= 0 && c < W && r >= 0 && r < H) { sx = c; sy = r; break; }
      }
      spawnUnit(s, owner, type, sx, sy);
    }

    else if (cmd.type === 'build') {
      const type = cmd.build;
      if (!BUILD[type] || type === 'base') return;
      const cx = cmd.cx | 0, cy = cmd.cy | 0;
      if (cx < 0 || cx >= W || cy < 0 || cy >= H) return;
      if (s.buildings.some(b => b.cx === cx && b.cy === cy)) return;      // зайнято
      const ownsNear = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const c = cx + dx, r = cy + dy;
        return c >= 0 && c < W && r >= 0 && r < H && s.grid[r * W + c] === owner;
      });
      if (!ownsNear) return;                     // будувати можна лише на своїй території або поруч
      if (me.gold < BUILD[type].cost) return;
      me.gold -= BUILD[type].cost;
      s.buildings.push({ id: s.nextId++, owner, type, cx, cy, hp: BUILD[type].hp, maxHp: BUILD[type].hp, cd: 0 });
      claim(s, owner, cx, cy);
    }
  });

  socket.on('disconnect', () => {
    const room = rooms[socket.data.room];
    if (!room) return;
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
      if (room.players.every(pp => !pp.connected)) {
        clearInterval(room.loop);
        delete rooms[room.code];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Три Імперії — сервер на порту ' + PORT));
