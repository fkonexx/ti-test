// db.js — акаунти, статистика, історія матчів, лідерборд.
// Якщо задано DATABASE_URL (Neon) — використовує PostgreSQL. Інакше — пам'ять (для локальних тестів; на Render дані зникнуть при перезапуску, тож став DATABASE_URL).
const crypto = require('crypto');

const HAS_PG = !!process.env.DATABASE_URL;
const SECRET = process.env.AUTH_SECRET || crypto.randomBytes(16).toString('hex');

// ---- токени (HMAC, stateless) ----
function signToken(userId) {
  const sig = crypto.createHmac('sha256', SECRET).update(String(userId)).digest('hex').slice(0, 24);
  return userId + '.' + sig;
}
function verifyToken(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const [id, sig] = token.split('.');
  const good = crypto.createHmac('sha256', SECRET).update(String(id)).digest('hex').slice(0, 24);
  if (sig !== good) return null;
  const n = parseInt(id, 10);
  return Number.isFinite(n) ? n : null;
}

const STAT_KEYS = ['games', 'wins', 'losses', 'kills', 'made', 'built', 'razed', 'gathered', 'best_guild'];

// ================= PostgreSQL backend =================
let pool = null;
async function pgInit() {
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 });
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL,
    games INT DEFAULT 0, wins INT DEFAULT 0, losses INT DEFAULT 0,
    kills INT DEFAULT 0, made INT DEFAULT 0, built INT DEFAULT 0,
    razed INT DEFAULT 0, gathered BIGINT DEFAULT 0, best_guild INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS matches (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    result TEXT, duration INT, players INT, kills INT, color TEXT,
    at TIMESTAMPTZ DEFAULT now()
  )`);
}
const pgApi = {
  async createUser(username, hash, nickname) {
    try {
      const r = await pool.query('INSERT INTO users(username,password_hash,nickname) VALUES($1,$2,$3) RETURNING *', [username, hash, nickname]);
      return r.rows[0];
    } catch (e) { if (e.code === '23505') { const err = new Error('DUP'); err.dup = true; throw err; } throw e; }
  },
  async getByUsername(u) { const r = await pool.query('SELECT * FROM users WHERE lower(username)=lower($1)', [u]); return r.rows[0] || null; },
  async getById(id) { const r = await pool.query('SELECT * FROM users WHERE id=$1', [id]); return r.rows[0] || null; },
  async setNickname(id, nick) { await pool.query('UPDATE users SET nickname=$1 WHERE id=$2', [nick, id]); },
  async addStats(id, s) {
    await pool.query(`UPDATE users SET games=games+$1, wins=wins+$2, losses=losses+$3, kills=kills+$4,
      made=made+$5, built=built+$6, razed=razed+$7, gathered=gathered+$8, best_guild=GREATEST(best_guild,$9) WHERE id=$10`,
      [s.games || 0, s.wins || 0, s.losses || 0, s.kills || 0, s.made || 0, s.built || 0, s.razed || 0, s.gathered || 0, s.best_guild || 0, id]);
  },
  async addMatch(id, m) { await pool.query('INSERT INTO matches(user_id,result,duration,players,kills,color) VALUES($1,$2,$3,$4,$5,$6)', [id, m.result, m.duration, m.players, m.kills, m.color]); },
  async getMatches(id, limit) { const r = await pool.query('SELECT result,duration,players,kills,color,at FROM matches WHERE user_id=$1 ORDER BY id DESC LIMIT $2', [id, limit]); return r.rows; },
  async leaderboard(limit) { const r = await pool.query('SELECT nickname,wins,games,kills FROM users ORDER BY wins DESC, games DESC LIMIT $1', [limit]); return r.rows; },
};

// ================= In-memory backend =================
const mem = { users: [], matches: [], seq: 1 };
const memApi = {
  async createUser(username, hash, nickname) {
    if (mem.users.some(u => u.username.toLowerCase() === username.toLowerCase())) { const e = new Error('DUP'); e.dup = true; throw e; }
    const u = { id: mem.seq++, username, password_hash: hash, nickname, games: 0, wins: 0, losses: 0, kills: 0, made: 0, built: 0, razed: 0, gathered: 0, best_guild: 0, created_at: new Date() };
    mem.users.push(u); return u;
  },
  async getByUsername(u) { return mem.users.find(x => x.username.toLowerCase() === u.toLowerCase()) || null; },
  async getById(id) { return mem.users.find(x => x.id === id) || null; },
  async setNickname(id, nick) { const u = mem.users.find(x => x.id === id); if (u) u.nickname = nick; },
  async addStats(id, s) { const u = mem.users.find(x => x.id === id); if (!u) return; for (const k of STAT_KEYS) { if (k === 'best_guild') u[k] = Math.max(u[k], s[k] || 0); else u[k] += (s[k] || 0); } },
  async addMatch(id, m) { mem.matches.unshift({ user_id: id, result: m.result, duration: m.duration, players: m.players, kills: m.kills, color: m.color, at: new Date() }); },
  async getMatches(id, limit) { return mem.matches.filter(m => m.user_id === id).slice(0, limit); },
  async leaderboard(limit) { return mem.users.slice().sort((a, b) => b.wins - a.wins || b.games - a.games).slice(0, limit).map(u => ({ nickname: u.nickname, wins: u.wins, games: u.games, kills: u.kills })); },
};

let api = memApi;
async function init() {
  if (HAS_PG) { try { await pgInit(); api = pgApi; console.log('БД: PostgreSQL (Neon) підключено'); return; } catch (e) { console.error('БД: помилка PostgreSQL, працюю в памʼяті:', e.message); } }
  console.log('БД: памʼять (без DATABASE_URL — дані не зберігаються між перезапусками)');
}

function publicProfile(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, nickname: u.nickname, games: u.games, wins: u.wins, losses: u.losses, kills: u.kills, made: u.made, built: u.built, razed: u.razed, gathered: Number(u.gathered) || 0, bestGuild: u.best_guild };
}

module.exports = { init, signToken, verifyToken, publicProfile, hasDB: () => api === pgApi, api: () => api };
