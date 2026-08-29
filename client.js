// ============================================================
//  ЧОТИРИ ІМПЕРІЇ — Balance v2 — клієнт
// ============================================================
const socket = io();
const me = { index: -1, color: null, host: false, id: null, debug: false };
let gameKind = 'multi';
const PKEY = 'fe_profile';
function loadProfile() { const D = { name: '', games: 0, wins: 0, losses: 0, kills: 0, made: 0, built: 0, razed: 0, gathered: 0, bestGuild: 0 }; try { const p = JSON.parse(localStorage.getItem(PKEY) || 'null'); if (p && typeof p === 'object') return Object.assign(D, p); } catch (e) {} return D; }
function saveProfile() { try { localStorage.setItem(PKEY, JSON.stringify(profile)); } catch (e) {} }
let profile = loadProfile();
let W = 130, H = 130, biomes = null, st = null, spawns = null;
let CELL = 26, camX = 0, camY = 0, camInit = false;
let canvas, ctx, DPR = 1;
let gridArr = null, seen = null, mem = null;
const renderU = {};
let effects = [], projectiles = [];
let darkness = 0, rain = 0;
let muted = false, selectMode = false;
const sel = { units: new Set(), building: null, scout: false, diplo: null };
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

const SPRITE_NAME = { guild: 'guild', mine: 'mine', lumber: 'wood', farm: 'farm', barracks: 'barn', tower: 'tower', cannon: 'canon', workshop: 'workshop', market: 'bazaar', arsenal: 'arsenal', wall: 'wall', landmine: 'explosive', flag: 'flag', sword: 'sword', archer: 'archer', mage: 'mage', assassin: 'assassin', catapult: 'catapult', ram: 'ram', spear: 'spear', priest: 'healer', commander: 'commander', scout: 'peecker', proclaimer: 'proclaimer', trader: 'traider' };
const SPR = {};
for (const color of ['red', 'blue', 'green', 'yellow']) { SPR[color] = {}; for (const t in SPRITE_NAME) { const im = new Image(); im.src = 'assets/' + color + '_' + SPRITE_NAME[t] + '.png'; SPR[color][t] = im; } }
function sprite(color, type) { const im = SPR[color] && SPR[color][type]; return im && im.complete && im.naturalWidth ? im : null; }
const BSIZE = { guild: 2.2, mine: 1.7, lumber: 1.7, farm: 1.7, barracks: 1.8, wall: 1.3, tower: 1.6, cannon: 1.3, workshop: 1.8, landmine: 0.78, flag: 1.5 };
const USIZE = { commander: 1.4, ram: 1.35, catapult: 1.35, scout: 1.2, priest: 1.15, proclaimer: 0.9, trader: 0.9 };

// баланс: має збігатися з сервером
const COST = { farm: { wood: 30, stone: 15, gold: 15 }, lumber: { wood: 15, stone: 30, gold: 15 }, mine: { wood: 35, stone: 15, gold: 15 }, barracks: { wood: 60, stone: 60, gold: 30 }, wall: { wood: 10, stone: 20 }, tower: { wood: 50, stone: 80, gold: 40 }, cannon: { wood: 70, stone: 120, gold: 70 }, workshop: { wood: 80, stone: 100, gold: 60 }, market: { wood: 110, stone: 90, gold: 70 }, arsenal: { wood: 150, stone: 180, gold: 150 }, landmine: { wood: 10, stone: 35, gold: 20 } };
const FLAG_COST = { wood: 100, stone: 100, gold: 250 };
const UCOST = { sword: { food: 18, gold: 12 }, archer: { food: 16, gold: 16 }, mage: { food: 20, gold: 28 }, spear: { food: 22, gold: 20 }, priest: { food: 25, gold: 35 }, assassin: { food: 22, gold: 32 }, catapult: { food: 20, gold: 45, wood: 30, stone: 20 }, ram: { food: 20, gold: 50, wood: 50, stone: 30 }, commander: { food: 35, gold: 75 } };
const UNLOCK = { sword: 1, archer: 1, mage: 2, spear: 3, priest: 3, assassin: 4, catapult: 4, ram: 5, commander: 5 };
const TECH_COST = [1, 2, 3, 5, 7];
const TECH = [['construction', 'Будівництво', 'відкриває споруди'], ['army', 'Армія', 'відкриває воїнів'], ['influence', 'Вплив', 'ширша зона від гільдії'], ['mining', 'Шахтарство', '+ камінь'], ['lumber', 'Лісорубство', '+ дерево'], ['farming', 'Фермерство', '+ їжа'], ['defense', 'Захист', '+6% HP споруд/рів.'], ['scouting', 'Розвідка', 'розвідник, прапори, детекція мін'], ['engineering', 'Інженерія', 'швидші жетони']];
const UNIT_INFO = [['sword', 'Мечник', 1], ['archer', 'Лучниця', 1], ['mage', 'Маг', 2], ['spear', 'Списоносець', 3], ['priest', 'Священник', 3], ['assassin', 'Ассасін', 4], ['catapult', 'Катапульта', 4], ['ram', 'Таран', 5], ['commander', 'Командир', 5]];
const BUILD_INFO = [['farm', 'Ферма', 1], ['lumber', 'Лісорубка', 1], ['mine', 'Шахта', 1], ['barracks', 'Казарма', 2], ['wall', 'Стіна', 2], ['market', 'Базар', 2], ['tower', 'Вежа', 3], ['cannon', 'Пушка', 4], ['workshop', 'Майстерня', 4], ['arsenal', 'Арсенал', 5], ['landmine', 'Міна', 5]];
const BNAME = { guild: 'Гільдія', farm: 'Ферма', lumber: 'Лісорубка', mine: 'Шахта', barracks: 'Казарма', wall: 'Стіна', tower: 'Вежа', cannon: 'Пушка', workshop: 'Майстерня', market: 'Базар', arsenal: 'Арсенал', landmine: 'Міна', flag: 'Прапор' };
const RESNAME = { wood: 'дерево', stone: 'камінь', food: 'їжа', gold: 'золото' };
const MELEE = { sword: 1, spear: 1, assassin: 1 };
const CUR = {};
[['wood','wood'],['stone','stone'],['food','food'],['gold','gold'],['tokens','eng_credits'],['guild','guild_level']].forEach(([k,f]) => { const im = new Image(); im.src = 'assets/' + f + '.png'; CUR[k] = im; });
function curIcon(key, emoji) { const im = CUR[key]; return (im && im.complete && im.naturalWidth) ? `<img class="curimg" src="${im.src}" alt="">` : emoji; }
const SIEGE = { catapult: 1, ram: 1 };

let el = {}, peaceEl = null;
window.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  el = { menu: $('menu'), lobby: $('lobby'), game: $('game'), name: $('nameInput'), code: $('codeInput'), roomCode: $('roomCode'), playerList: $('playerList'), startBtn: $('startBtn'), lobbyHint: $('lobbyHint'), res: $('res'), banner: $('banner'), tokens: $('tokTop'), unitMenu: $('unitMenu'), buildMenu: $('buildMenu'), techPanel: $('techPanel'), techList: $('techList'), overlay: $('overlay'), ctxbar: $('ctxbar') };
  renderProfile();
  $('createBtn').onclick = once(() => { const n = ensureName(); if (n) socket.emit('createRoom', { name: n }); });
  $('joinBtn').onclick = once(() => { const cd = el.code.value.trim().toUpperCase(); if (!cd) { banner2('Введи код кімнати'); return; } const n = ensureName(); if (n) socket.emit('joinRoom', { code: cd, name: n }); });
  { const tb = $('testBtn'); if (tb) tb.onclick = once(() => socket.emit('enterTest')); }
  { const tu = $('tutorialBtn'); if (tu) tu.onclick = once(() => socket.emit('startTutorial', { name: profile.name || 'Ти' })); }
  { const pb = $('profileBtn'); if (pb) pb.onclick = () => openProfile(); }
  { const en = $('editNameBtn'); if (en) en.onclick = () => editName(); }
  { const rs = $('resetStatsBtn'); if (rs) rs.onclick = () => resetStats(); }
  { const pc = $('profClose'); if (pc) pc.onclick = () => document.getElementById('profileOverlay').classList.add('hidden'); }
  { const mf = $('menuFsBtn'); if (mf) mf.onclick = () => goFullscreen(); }
  el.startBtn.onclick = () => { if (me.debug) socket.emit('startGame'); else socket.emit('setReady'); };
  $('fsBtn').onclick = toggleFullscreen;
  { const hb = $('homeBtn'); if (hb) hb.onclick = () => { if (st) { centerOnGuild(); flash(hb); } }; }
  $('attackBtn').onclick = () => openOrderMenu();
  { const gb = $('groupBtn'); if (gb) gb.onclick = () => openGroupMenu(); }
  $('armyBtn').onclick = () => { attackMode = false; buildMode = null; buildable = null; toggle('unit'); modes(); };
  $('buildBtn').onclick = () => { if (buildMode) { buildMode = null; buildable = null; modes(); return; } attackMode = false; toggle('build'); modes(); };
  $('scoutBtn').onclick = () => selectHeroes();
  $('techBtn').onclick = () => { const open = !el.techPanel.classList.contains('hidden'); attackMode = false; buildMode = null; buildable = null; modes(); closeMenus(); closePanels(); if (!open) { el.techPanel.classList.remove('hidden'); techSig = ''; renderTech(); } };
  $('techClose').onclick = () => el.techPanel.classList.add('hidden');
  const sb = $('selBtn'); if (sb) sb.onclick = () => { selectMode = !selectMode; sb.classList.toggle('on', selectMode); banner(selectMode ? 'Режим виділення: обведи воїнів пальцем' : 'Режим карти: палець рухає карту'); };
  const mb = $('modeBtn'); if (mb) mb.onclick = () => fitWholeMap();
  const zi = $('zoomIn'), zo = $('zoomOut'), mu = $('muteBtn');
  if (zi) zi.onclick = () => zoomAt(innerWidth / 2, innerHeight / 2, 1.25);
  if (zo) zo.onclick = () => zoomAt(innerWidth / 2, innerHeight / 2, 0.8);
  if (mu) mu.onclick = () => { muted = !muted; mu.textContent = muted ? '🔇' : '🔊'; if (muted) musicStopAll(); else { sfxInit(); updateMusic(); } };
  { const ms = $('musBtn'); if (ms) ms.onclick = () => { musicOn = !musicOn; ms.style.opacity = musicOn ? '1' : '.45'; if (musicOn) { sfxInit(); updateMusic(); } else musicStopAll(); }; }
  setupCanvas();
});
function once(fn) { let u = false; return () => { if (u) return; u = true; fn(); setTimeout(() => u = false, 1200); }; }

socket.on('connect', () => { me.id = socket.id; });
socket.on('joined', d => { me.index = d.index; me.color = d.color; me.host = d.host; if (d.debug) me.debug = true; show('lobby'); });
socket.on('empireSwitched', d => { me.index = d.index; me.color = d.color; clearSel(); resetFog(); camInit = false; techSig = ''; updateRes(); updateDbg(); });
socket.on('fogToggled', d => { resetFog(); const b = document.getElementById('dbgFog'); if (b) b.textContent = d.on ? '🌫 Туман: УВІМК' : '🌫 Туман: ВИМК'; });
let ping = 0, pingTimer = null;
socket.on('pongCheck', (ts) => { ping = Date.now() - ts; });
function startPing() { if (pingTimer) return; const send = () => socket.emit('pingCheck', Date.now()); send(); pingTimer = setInterval(send, 2000); }
function fmtTime(sec) { sec = Math.max(0, Math.floor(sec || 0)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
socket.on('lobby', d => {
  me.host = (d.host === socket.id); el.roomCode.textContent = d.code; el.playerList.innerHTML = '';
  let myReady = false, readyN = 0;
  d.players.forEach(p => {
    if (p.ready) readyN++;
    if (p.id === socket.id) myReady = !!p.ready;
    const li = document.createElement('li');
    const rdy = p.ready ? '<span class="badge rdy">✓ готовий</span>' : (p.connected ? '' : '<span class="badge">офлайн</span>');
    li.innerHTML = `<span class="dot ${p.color}"></span>${p.name}` + (p.id === d.host ? '<span class="badge">господар</span>' : '') + rdy;
    el.playerList.appendChild(li);
  });
  const cfg = d.cfg || { proclaimer: true, trader: true };
  const ct = document.getElementById('cfgToggles');
  if (ct) {
    const mk = (key, label, emo) => `<button class="cfgtog ${cfg[key] ? 'on' : 'off'}" data-cfg="${key}"${me.host ? '' : ' disabled'}>${emo} ${label}: <b>${cfg[key] ? 'увімк' : 'вимк'}</b></button>`;
    ct.innerHTML = `<div class="cfghdr">Дипломатичні юніти:</div>` + mk('proclaimer', 'Прокламентерка', '🕊') + mk('trader', 'Торговець', '💰') + (me.host ? '' : '<div class="cfghint">Змінює лише господар</div>');
    ct.querySelectorAll('[data-cfg]').forEach(b => b.onclick = () => { if (me.host) socket.emit('setUnitCfg', { key: b.dataset.cfg, on: !cfg[b.dataset.cfg] }); });
  }
  const enough = d.players.length >= 2;
  el.startBtn.style.display = 'block'; el.startBtn.disabled = false;
  if (me.debug) { el.startBtn.textContent = '▶ Почати гру (тест)'; el.startBtn.classList.remove('ghost'); el.lobbyHint.textContent = 'Тестовий режим — виставте дипломатичних юнітів і почніть'; }
  else { el.startBtn.textContent = myReady ? 'Скасувати готовність' : 'Готово'; el.startBtn.classList.toggle('ghost', myReady); el.lobbyHint.textContent = `Готові: ${readyN}/${d.players.length}` + (enough ? ' — гра почнеться, коли всі натиснуть «Готово»' : ' — потрібно мінімум 2 гравці'); }
});
socket.on('errorMsg', m => alert(m));
socket.on('gameStarted', d => { W = d.W; H = d.H; biomes = d.biomes; spawns = d.spawns; gridArr = new Array(W * H).fill(-2); seen = new Uint8Array(W * H); mem = new Int8Array(W * H).fill(-1); gameKind = d.tutorial ? 'tutorial' : (me.debug ? 'test' : 'multi'); show('game'); resize(); ensurePeaceEl(); ensurePanels(); ensureHudExtras(); startPing(); if (me.debug) createDbgBar(); if (d.tutorial) { showTutorial(); banner('🎓 Тренування — знищ ворожу гільдію'); } else banner('Карта 130×130 · перші 2 хв — мир (розвиток і розвідка)'); requestAnimationFrame(draw); });
socket.on('state', s => onState(s));
socket.on('gameOver', d => showEnd(d));

function renderProfile() {
  const nm = profile.name || '';
  const disp = nm || 'Новий гравець';
  const av0 = nm ? nm[0].toUpperCase() : '🛡️';
  const pn = document.getElementById('pName'); if (pn) pn.textContent = disp;
  const av = document.getElementById('pAvatar'); if (av) av.textContent = av0;
  const wr = profile.games ? Math.round(profile.wins / profile.games * 100) : 0;
  const sub = document.getElementById('pSub'); if (sub) sub.textContent = profile.games ? `🎮 ${profile.games} · 🏆 ${profile.wins} · 📈 ${wr}%  ·  профіль ›` : 'Профіль і статистика ›';
  if (el && el.name) el.name.value = nm;
}
function openProfile() {
  const ov = document.getElementById('profileOverlay'); if (!ov) return;
  const nm = profile.name || 'Новий гравець';
  document.getElementById('pName2').textContent = nm;
  const av = document.getElementById('pAvatar2'); if (av) av.textContent = profile.name ? profile.name[0].toUpperCase() : '🛡️';
  const wr = profile.games ? Math.round(profile.wins / profile.games * 100) : 0;
  const rows = [
    ['🎮 Зіграно ігор', profile.games], ['🏆 Перемог', profile.wins], ['💀 Поразок', profile.losses], ['📈 Відсоток перемог', wr + '%'],
    ['⚔ Усього вбито', profile.kills], ['👥 Створено військ', profile.made], ['🏗 Збудовано споруд', profile.built],
    ['🏚 Знищено споруд', profile.razed], ['📦 Зібрано ресурсів', profile.gathered], ['🏛 Найвищий рівень гільдії', profile.bestGuild],
  ];
  document.getElementById('profStats').innerHTML = rows.map(([l, v]) => `<div class="prow"><span>${l}</span><b>${v}</b></div>`).join('');
  ov.classList.remove('hidden');
}
function resetStats() {
  if (!confirm('Скинути всю статистику? Ім\'я залишиться.')) return;
  const nm = profile.name; profile = loadProfile(); profile.name = nm; saveProfile(); renderProfile(); openProfile();
}
function editName() { const v = prompt("Твоє ім'я (до 16 символів):", profile.name || ''); if (v !== null) { profile.name = v.trim().slice(0, 16); saveProfile(); renderProfile(); } }
function ensureName() { if (!profile.name) { editName(); } return profile.name || ''; }
function banner2(t) { let e = document.getElementById('menuToast'); if (!e) { e = document.createElement('div'); e.id = 'menuToast'; document.getElementById('menu').appendChild(e); } e.textContent = t; e.classList.add('show'); clearTimeout(banner2._t); banner2._t = setTimeout(() => e.classList.remove('show'), 2600); }
function goFullscreen() {
  const d = document.documentElement;
  const req = d.requestFullscreen || d.webkitRequestFullscreen || d.msRequestFullscreen;
  if (req) { try { const p = req.call(d); if (p && p.catch) p.catch(() => {}); } catch (e) {} banner2('Порада для iPhone: «Поділитися» → «На початковий екран»'); }
  else { banner2('iPhone: «Поділитися» → «На початковий екран», запусти з іконки'); }
}
function showTutorial() {
  const ov = document.getElementById('tutOverlay'); if (!ov) return;
  const steps = [
    ['🎓 Тренування', 'Це безпечний режим. Десь на мапі є «Тренувальна база» суперника — її можна знищити. Тебе тут ніхто не атакує. Мета гри: знищити ворожу гільдію; останній, хто вцілів, — переможець.'],
    ['🗺 Керування камерою', 'Кнопка «Виділення» (ліворуч, над «Картою»): коли увімкнена — обводиш воїнів пальцем; коли вимкнена — палець рухає мапу. Кнопки + / − масштабують, «Карта» показує всю мапу, а 🏛 повертає до твоєї гільдії.'],
    ['⏳ Мир, день і ніч', 'На початку діє мирний період — армію не можна рухати, лише розвиватись і розвідувати. Далі — війна. Є цикл дня та ночі (вночі темніше й гірша видимість) і зрідка дощ. Стеж за таймером ⏱ угорі.'],
    ['📦 Ресурси', '🌲 дерево, ⛏ камінь, 🍞 їжа, 💰 золото і 🔧 жетони — угорі екрана. Їх дають будівлі-збирачі та територія. Ресурси йдуть на будівлі, військо й технології; жетони — на особливі покращення.'],
    ['🏛 Гільдія і територія', 'Гільдія — серце імперії; її знищення = поразка. Навколо неї — твоя зона впливу, де можна будувати. Гільдія має рівні: що вищий — то більше можливостей. Захищай її найкраще.'],
    ['🚩 Прапори (розширення)', 'Щоб будувати далі від гільдії, розвідник ставить прапори — вони створюють нові зони забудови й претендують на територію. Так імперія росте по мапі.'],
    ['🏗 Будівлі', '«Будувати»: казарма (військо), ферма/копальня/лісопилка (ресурси), стіни й вежі/гармати (захист), майстерня (облога), базар (обмін), арсенал (прокачка армії). Будуй у підсвіченій зоні впливу.'],
    ['🛡 Оборона', 'Стіни сповільнюють ворога (автоз’єднуються в лінію), вежі й гармати стріляють по тих, хто підійшов. Міни 💣 підривають ворожі війська. Комбінуй їх довкола гільдії.'],
    ['👥 Види військ', 'Ближні (меч, спис) — стійкі в контакті; лучники й маги б’ють здалеку; ассасин — швидка кіннота; катапульта й таран — облога будівель; священник лікує, а командир підсилює армію аурою.'],
    ['⚙ Виробництво', '«Армія» → наймай воїнів у казармі (потрібні їжа/золото, іноді дерево/камінь). Замовлення самі розподіляються між казармами. Різні типи відкриваються з розвитком.'],
    ['🎯 Накази', '«Наказ» → обери ⚔ Атака чи 🛡 Захист і кому (Всі / Група), тоді тап по точці. Захист — стояти й тримати точку. Атака — йти в бій; по будівлі дальнобійні тримають дистанцію, ближні йдуть впритул.'],
    ['🔢 Групи («Військо»)', 'Виділи воїнів і запиши їх у групу 1–4, щоб швидко обирати й давати накази саме їм. Юніт належить лише одній групі; можна обрати або розпустити групу.'],
    ['🔭 Герої', '«Герої»: розвідник (велика видимість, ставить прапори, бачить міни), прокламентерка (пропонує мир) і торговець (обмін). Вони не б’ються і не стають ціллю — бережи їх для дипломатії й розвідки.'],
    ['🕊 Дипломатія (мир)', 'Підведи прокламентерку до ворожої гільдії (≤4 клітини) й запропонуй мир на 1/3/5/10 хв. Якщо погодяться — армії та будівлі сторін не шкодять одна одній. Один мир на гравця; після відмови/завершення — пауза 3 хв.'],
    ['🤝 Торгівля', 'Базар дає щоденні обміни з банком (удень). Торговець пропонує обмін ресурсами іншому гравцю: без миру отримувач має −15%, у мирі — без штрафу. Після угоди торговець сам несе ресурси до гільдії (над ним «!»).'],
    ['🔧 Арсенал і розвиток', '«Розвиток» відкриває технології та збирачів. Арсенал прокачує армію (до 25 рівнів: більше HP і шкоди). Розвивайся швидше за ворога — і твоє військо стане сильнішим у бою.'],
    ['🏁 Уперед!', 'Перечекай короткий мир, розбудуйся, збери армію та знищ ворожу тренувальну гільдію. А тоді — виклич справжніх суперників у мультиплеєрі. Успіхів, полководцю!'],
  ]
  let i = 0;
  function render() {
    const [t, b] = steps[i];
    ov.innerHTML = `<div class="tutcard"><div class="tutstep">${i + 1} / ${steps.length}</div><h2>${t}</h2><p>${b}</p>`
      + `<div class="tutbtns">${i > 0 ? '<button class="btn line" data-prev>Назад</button>' : ''}<button class="btn big" data-next>${i < steps.length - 1 ? 'Далі ▶' : 'Почати ▶'}</button></div>`
      + `<button class="tutskip" data-skip>Пропустити</button></div>`;
    ov.querySelector('[data-next]').onclick = () => { if (i < steps.length - 1) { i++; render(); } else ov.classList.add('hidden'); };
    const pv = ov.querySelector('[data-prev]'); if (pv) pv.onclick = () => { i--; render(); };
    ov.querySelector('[data-skip]').onclick = () => ov.classList.add('hidden');
  }
  render(); ov.classList.remove('hidden');
}
function show(name) { el.menu.classList.add('hidden'); el.lobby.classList.add('hidden'); el.game.classList.add('hidden'); el[name].classList.remove('hidden'); }
function clearSel() { sel.units.clear(); sel.building = null; sel.scout = false; sel.diplo = null; buildMode = null; attackMode = false; buildable = null; modes(); refreshCtx(); closePanels && closePanels(); }
function resetFog() { if (gridArr) { gridArr.fill(-2); seen.fill(0); mem.fill(-1); } }

function ensurePeaceEl() { if (peaceEl) return; peaceEl = document.createElement('div'); peaceEl.id = 'peace'; document.getElementById('game').appendChild(peaceEl); }
function ensureHudExtras() { const G = document.getElementById('game'); if (!truceEl) { truceEl = document.createElement('div'); truceEl.id = 'truceHud'; truceEl.style.display = 'none'; G.appendChild(truceEl); } if (!killfeedEl) { killfeedEl = document.createElement('div'); killfeedEl.id = 'killfeed'; G.appendChild(killfeedEl); } }
function updateTruce() { if (!truceEl || !st || !st.me) return; const t = st.me.truce; if (t) { const m = Math.floor(t.left / 60), s = t.left % 60; truceEl.innerHTML = `🤝 Мир з <b style="color:${COL[IDX[t.who]]}">${CNAME[IDX[t.who]]}</b> ${m}:${String(s).padStart(2, '0')}`; truceEl.style.display = 'block'; } else truceEl.style.display = 'none'; }
function renderKillfeed() {
  if (!killfeedEl || !st) return; const feed = st.feed || [];
  killfeedEl.innerHTML = feed.slice(-5).map(f => {
    const age = st.t - f.at, op = Math.max(0.12, 1 - age / 12).toFixed(2); let txt = '';
    if (f.k === 'kill') txt = `☠ <b style="color:${COL[IDX[f.o]]}">${CNAME[IDX[f.o]]}</b> знищено`;
    else if (f.k === 'truce') txt = `🕊 Перемирʼя: <b style="color:${COL[IDX[f.a]]}">${CNAME[IDX[f.a]]}</b> ↔ <b style="color:${COL[IDX[f.b]]}">${CNAME[IDX[f.b]]}</b>`;
    else if (f.k === 'truceEnd') txt = `⚔ Мир завершено: ${CNAME[IDX[f.a]]} ↔ ${CNAME[IDX[f.b]]}`;
    else if (f.k === 'trade') txt = `🤝 Обмін: ${CNAME[IDX[f.a]]} ↔ ${CNAME[IDX[f.b]]}`;
    return txt ? `<div class="kfitem" style="opacity:${op}">${txt}</div>` : '';
  }).join('');
}
function updatePeace() { if (!peaceEl || !st) return; if (st.peace > 0) { const m = Math.floor(st.peace / 60), sec = st.peace % 60; peaceEl.textContent = '🕊 Мир: ' + m + ':' + String(sec).padStart(2, '0'); peaceEl.style.display = 'block'; } else peaceEl.style.display = 'none'; }

function onState(s) {
  st = s;
  if (s.gridFull) { gridArr = s.gridFull; for (let i = 0; i < gridArr.length; i++) if (gridArr[i] !== -2) { seen[i] = 1; mem[i] = gridArr[i]; } }
  else if (s.gridDiff) { const d = s.gridDiff; for (let k = 0; k < d.length; k += 2) { const i = d[k], v = d[k + 1]; gridArr[i] = v; if (v !== -2) { seen[i] = 1; mem[i] = v; } } }
  const alive = new Set(s.units.map(u => u.i));
  for (const id in renderU) { if (!alive.has(+id)) { const u = renderU[id]; const ci = Math.round(u.y) * W + Math.round(u.x); if (!u.s && (u.o === me.index || gridArr[ci] !== -2)) { effects.push({ x: u.x, y: u.y, t: 0, c: COL[IDX[u.o]] }); sfx('boom'); } delete renderU[id]; } }
  for (const u of s.units) { let r = renderU[u.i]; if (!r) { r = { x: u.x, y: u.y, ang: Math.PI / 2, swing: 0, healT: 0 }; renderU[u.i] = r; } r.tx = u.x; r.ty = u.y; r.o = u.o; r.t = u.t; r.h = u.h; r.m = u.m; r.s = u.s; r.nc = u.nc; r.prop = u.prop; r.carry = u.carry; if (u.ak) r.swing = 0.28; if (u.he) r.healT = 0.4; }
  for (const id of [...sel.units]) if (!alive.has(id)) sel.units.delete(id);
  if (sel.scout && !s.units.some(u => u.o === me.index && u.s)) sel.scout = false;
  if (sel.building != null && !s.buildings.some(b => b.i === sel.building)) sel.building = null;
  if (s.shots) for (const sh of s.shots) { projectiles.push({ x: sh.x, y: sh.y, tx: sh.tx, ty: sh.ty, k: sh.k, t: 0, dur: sh.k === 'ball' ? 0.35 : 0.2 }); sfxShoot(); }
  if (!camInit) { centerOnGuild(); camInit = true; }
  updateRes(); updateArmyBtn(); updateScoutBtn(); updatePeace(); refreshCtx(); renderMarket(); renderArsenal();
  { const hi = document.getElementById('hudinfo'); if (hi) hi.textContent = '⏱ ' + fmtTime(st.t) + '  ·  📶 ' + ping + 'мс'; }
  updateMusic();
  updateTruce(); renderKillfeed(); pruneGroups();
  { const inc = st.units.find(u => u.o !== me.index && u.nc && u.prop && u.prop.to === me.index); const key = inc ? (inc.i + ':' + inc.prop.k) : null; if (key && key !== lastIncoming) { lastIncoming = key; banner('📜 Вам пропонують ' + (inc.prop.k === 'truce' ? 'мир' : 'обмін') + ' — тапніть по ' + (inc.prop.k === 'truce' ? 'прокламентерці' : 'торговцю') + ' ворога'); } if (!key) lastIncoming = null; }
  if (el.techPanel && !el.techPanel.classList.contains('hidden')) renderTech();
}
function centerOnGuild() { const g = st && st.buildings.find(b => b.o === me.index && b.t === 'guild'); if (!g) return; camX = innerWidth / 2 - (g.x * CELL + CELL / 2); camY = innerHeight / 2 - (g.y * CELL + CELL / 2); }
let resSig = '';
function buildResHud() {
  const it = [['wood', '🌲'], ['stone', '⛏'], ['food', '🍞'], ['gold', '💰'], ['tokens', '🔧']];
  el.res.innerHTML = it.map(([k, e]) => `<span class="chip">${curIcon(k, e)}<b id="res_${k}">0</b></span>`).join('')
    + `<span class="chip gbar" title="Рівень гільдії"><span class="gfill" id="res_gfill"></span>${curIcon('guild', '🏛')}<b id="res_guild">1</b></span>`;
}
function updateRes() {
  if (!st || !st.me) return; const r = st.me.res;
  const sig = ['wood', 'stone', 'food', 'gold', 'tokens', 'guild'].map(k => { const im = CUR[k]; return (im && im.complete && im.naturalWidth) ? '1' : '0'; }).join('');
  if (sig !== resSig) { buildResHud(); resSig = sig; }   // перебудова лише коли іконки догрузились (раз), не щокадру
  const set = (k, v) => { const e = document.getElementById('res_' + k); if (e && e.textContent !== String(v)) e.textContent = v; };
  set('wood', r.wood); set('stone', r.stone); set('food', r.food); set('gold', r.gold); set('tokens', r.tokens); set('guild', st.me.guildLevel);
  const gf = document.getElementById('res_gfill'); if (gf) gf.style.width = Math.round(st.me.guildProg * 100) + '%';
  if (st.me.alive === false && (st.winner === null || st.winner === undefined)) banner('Вашу гільдію знищено');
}
function updateArmyBtn() { const b = document.getElementById('armyBtn'); if (!b || !st || !st.me) return; b.innerHTML = `<i>⚔</i>Армія ${st.me.army}/${st.me.cap}`; }
function updateScoutBtn() { const b = document.getElementById('scoutBtn'); if (!b) return; b.disabled = false; b.style.opacity = '1'; }

function refreshCtx() {
  if (!el.ctxbar || !st) return; const btns = [];
  if (sel.scout && st.me && st.me.flags > 0) btns.push(`<button class="ctxb" data-a="placeFlag">🚩 Поставити прапор (${st.me.flags})</button>`);
  if (sel.diplo) { const u = diploUnit(); if (u) { const near = nearEnemyGuild(u, 4); const pending = u.prop && u.prop.from === me.index;
    if (sel.diplo === 'proclaimer') { if (st.me.truce) btns.push('<button class="ctxb" disabled>🤝 Ви вже в мирі</button>'); else if (st.me.peaceCd > 0) btns.push('<button class="ctxb" disabled>🕊 Мир на кулдауні (' + st.me.peaceCd + 'с)</button>'); else if (pending) btns.push('<button class="ctxb" disabled>🕊 Пропозицію надіслано…</button>'); else if (near) btns.push('<button class="ctxb hot" data-a="proposeTruce">🕊 Запропонувати мир</button>'); else btns.push('<button class="ctxb" disabled>Веди до ворожої гільдії (≤4)</button>'); }
    else if (sel.diplo === 'trader') { if (u.carry) btns.push('<button class="ctxb" disabled>💰 Несе ресурси до гільдії…</button>'); else if (pending) btns.push('<button class="ctxb" disabled>🤝 Пропозицію надіслано…</button>'); else if (near) btns.push('<button class="ctxb hot" data-a="proposeTrade">🤝 Запропонувати обмін</button>'); else btns.push('<button class="ctxb" disabled>Веди до ворожої гільдії (≤4)</button>'); } } }
  if (sel.building != null) { const b = st.buildings.find(x => x.i === sel.building); if (b && b.o === me.index) { if (b.rd) btns.push(`<button class="ctxb hot" data-a="collect" data-i="${b.i}">📦 Забрати ${b.am} ${RESNAME[b.rk] || ''}</button>`); if (b.t !== 'guild') btns.push(`<button class="ctxb danger" data-a="demolish" data-i="${b.i}">🗑 Знести</button>`); } }
  if (btns.length) { el.ctxbar.innerHTML = btns.join(''); el.ctxbar.classList.remove('hidden'); el.ctxbar.querySelectorAll('.ctxb').forEach(x => x.onclick = () => ctxAction(x.dataset.a, +x.dataset.i)); }
  else el.ctxbar.classList.add('hidden');
}
function ctxAction(a, i) {
  if (a === 'placeFlag') { socket.emit('command', { type: 'placeFlag' }); banner('Прапор встановлюється на місці розвідника…'); }
  else if (a === 'collect') { socket.emit('command', { type: 'collect', building: i }); sfx('build'); }
  else if (a === 'demolish') { socket.emit('command', { type: 'demolish', building: i }); sel.building = null; banner('Споруду знесено (без повернення ресурсів)'); refreshCtx(); }
  else if (a === 'proposeTruce') openTruceChooser();
  else if (a === 'proposeTrade') openTradePanel();
}

function myUnits() { return st ? st.units.filter(u => u.o === me.index && !u.s) : []; }
function selectAll() { sel.units = new Set(myUnits().map(u => u.i)); sel.building = null; sel.scout = false; sel.diplo = null; refreshCtx(); }
function selectScout() { const sc = st && st.units.find(u => u.o === me.index && u.s); if (sc) { sel.units = new Set([sc.i]); sel.scout = true; sel.diplo = null; sel.building = null; banner('Розвідник обрано — тапни, куди йти' + (st.me && st.me.flags > 0 ? ' або постав прапор' : '')); flash(document.getElementById('scoutBtn')); } else if (st.me && st.me.tech.scouting < 1) banner('Спершу відкрий «Розвідку» в дереві розвитку'); else banner('Розвідник у відродженні (~2 хв)'); refreshCtx(); }
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
function closePanels() { if (marketPanel) marketPanel.classList.add('hidden'); if (arsenalPanel) arsenalPanel.classList.add('hidden'); if (heroMenu) heroMenu.classList.add('hidden'); if (trucePanel) trucePanel.classList.add('hidden'); if (tradePanel) tradePanel.classList.add('hidden'); if (orderMenu) orderMenu.classList.add('hidden'); if (groupMenu) groupMenu.classList.add('hidden'); }
function costStr(c) { const p = []; if (c.wood) p.push(curIcon('wood','🌲') + c.wood); if (c.stone) p.push(curIcon('stone','⛏') + c.stone); if (c.food) p.push(curIcon('food','🍞') + c.food); if (c.gold) p.push(curIcon('gold','💰') + c.gold); return p.join(' '); }
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
  let html = BUILD_INFO.map(([k, n, req]) => {
    const c = COST[k]; let locked = lvl < req, note = locked ? '🔒 Будів. ' + req : costStr(c);
    if (!locked && k === 'workshop' && st.me.workshops >= 1) { locked = true; note = '1 макс'; }
    if (!locked && k === 'market' && st.me.hasMarket) { locked = true; note = '1 макс'; }
    if (!locked && k === 'arsenal' && st.me.hasArsenal) { locked = true; note = '1 макс'; }
    const poor = !locked && !canAfford(c);
    return `<button class="btn s" data-b="${k}" ${locked ? 'disabled' : ''} style="${poor ? 'opacity:.55' : ''}">${n}<small>${note}</small></button>`;
  }).join('');
  if (st && st.me && st.me.flagCap > 0) { const dis = st.me.flagsTotal >= st.me.flagCap || !canAfford(FLAG_COST); html += `<button class="btn s flagbuy" data-flag="1" ${dis ? 'disabled' : ''}>🚩 Купити прапор<small>${st.me.flagsTotal}/${st.me.flagCap} · ${costStr(FLAG_COST)}</small></button>`; }
  el.buildMenu.innerHTML = html;
  el.buildMenu.querySelectorAll('button').forEach(b => b.onclick = () => { if (b.dataset.flag) { buyFlag(); closeMenus(); return; } buildMode = b.dataset.b; attackMode = false; closeMenus(); computeBuildable(); modes(); });
}
function modes() {
  document.getElementById('attackBtn').classList.toggle('on', attackMode);
  document.getElementById('buildBtn').classList.toggle('on', !!buildMode);
  if (buildMode) banner('Тапни підсвічену клітинку, щоб побудувати «' + BNAME[buildMode] + '»');
  else hideBanner();
}
function computeBuildable() {
  buildable = new Set(); if (!st) return;
  const g = st.buildings.find(b => b.o === me.index && b.t === 'guild');
  const R = 6 + (st.me ? st.me.tech.influence : 0) * 2;
  if (g) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const c = g.x + dx, r = g.y + dy; if (c >= 0 && c < W && r >= 0 && r < H) buildable.add(r * W + c); }
  // зона прапора (лише з вільним слотом) — не для стін
  if (buildMode !== 'wall') for (const b of st.buildings) if (b.o === me.index && b.t === 'flag' && (b.fs === undefined || b.fu < b.fs)) for (let dy = -FLAG_RADIUS; dy <= FLAG_RADIUS; dy++) for (let dx = -FLAG_RADIUS; dx <= FLAG_RADIUS; dx++) { const c = b.x + dx, r = b.y + dy; if (c >= 0 && c < W && r >= 0 && r < H) buildable.add(r * W + c); }
  if (buildMode !== 'wall' && buildMode !== 'landmine') for (const b of st.buildings) { if (b.t === 'landmine') continue; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const c = b.x + dx, r = b.y + dy; if (c >= 0 && c < W && r >= 0 && r < H) buildable.delete(r * W + c); } }
  else for (const b of st.buildings) if (b.t !== 'landmine') buildable.delete(b.y * W + b.x);
  // стіни: заборонено біля прапора
  if (buildMode === 'wall') for (const b of st.buildings) if (b.o === me.index && b.t === 'flag') for (let dy = -FLAG_RADIUS; dy <= FLAG_RADIUS; dy++) for (let dx = -FLAG_RADIUS; dx <= FLAG_RADIUS; dx++) { const c = b.x + dx, r = b.y + dy; if (c >= 0 && c < W && r >= 0 && r < H) buildable.delete(r * W + c); }
}
function inBuildZone(col, row, t) {
  const g = st.buildings.find(b => b.o === me.index && b.t === 'guild');
  const R = 6 + (st.me ? st.me.tech.influence : 0) * 2;
  if (g && cheb(g.x, g.y, col, row) <= R) return true;
  if (t !== 'wall') for (const b of st.buildings) if (b.o === me.index && b.t === 'flag' && (b.fs === undefined || b.fu < b.fs) && cheb(b.x, b.y, col, row) <= FLAG_RADIUS) return true;
  return false;
}
function costLackMsg(cst) { const need = [], r = st.me.res; if ((cst.wood || 0) > r.wood) need.push('дерева'); if ((cst.stone || 0) > r.stone) need.push('каменю'); if ((cst.food || 0) > r.food) need.push('їжі'); if ((cst.gold || 0) > r.gold) need.push('золота'); return 'Недостатньо ' + (need.join(', ') || 'ресурсів'); }
function buildBlockReason(col, row) {
  const t = buildMode;
  if (col < 0 || col >= W || row < 0 || row >= H) return 'Поза межами карти';
  if (st.buildings.some(b => b.x === col && b.y === row && b.t !== 'landmine')) return 'Тут вже є споруда';
  if (t === 'wall') { if (st.buildings.some(b => b.o === me.index && b.t === 'flag' && cheb(b.x, b.y, col, row) <= FLAG_RADIUS)) return 'Стіни не можна ставити біля прапора'; }
  else if (t !== 'landmine') { if (st.buildings.some(b => b.t !== 'landmine' && cheb(b.x, b.y, col, row) <= 1)) return 'Занадто близько до іншої споруди (потрібен проміжок)'; }
  if (!inBuildZone(col, row, t)) return 'Поза зоною гільдії/прапора';
  if (!canAfford(COST[t])) return costLackMsg(COST[t]);
  return null;
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
    const dis = lvl >= 5 || tk < cost; const label = lvl >= 5 ? 'МАКС' : ('−' + cost + ' ' + curIcon('tokens','🔧'));
    return `<div class="techrow"><div class="ti"><b>${n}</b><small>${d}</small><span class="stars">${stars}</span></div><button class="btn tbuy" data-k="${k}" ${dis ? 'disabled' : ''}>${label}</button></div>`;
  }).join('');
  const autoDis = st.me.autoCollect || tk < 5;
  html += `<div class="techrow"><div class="ti"><b>Автозбір ресурсів</b><small>${st.me.autoCollect ? '✅ куплено — ресурси зараховуються самі' : 'збирає 100% ресурсу автоматично'}</small></div><button class="btn tbuy" data-auto="1" ${autoDis ? 'disabled' : ''}>${st.me.autoCollect ? 'КУПЛЕНО' : '−5 ' + curIcon('tokens','🔧')}</button></div>`;
  el.techList.innerHTML = html;
  el.techList.querySelectorAll('.tbuy').forEach(b => b.onclick = () => { if (b.dataset.auto) { socket.emit('command', { type: 'autoCollect' }); } else socket.emit('command', { type: 'tech', branch: b.dataset.k }); techSig = ''; });
}

let actx = null;
function sfxInit() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (actx && actx.state === 'suspended') actx.resume(); updateMusic(); }
// ===== Музика з /music, синхронізована з часом гри =====
// peace_music: 0:00–1:53 (затухає) · horn: 1:53–2:00 · war_music: 2:00+ циклічно
let musicOn = true, musicEls = null, musicPhase = null, warTracks = null, warIdx = 0;
const MUSIC_VOL = 0.55, MUS_PEACE_END = 113, MUS_WAR_START = 120;
function playWar() {
  if (!warTracks) return;
  if (musicEls) for (const k in musicEls) { try { musicEls[k].pause(); } catch (e) {} }
  warTracks.forEach((a, i) => { if (i !== warIdx) { try { a.pause(); } catch (e) {} } });
  const a = warTracks[warIdx]; try { a.volume = MUSIC_VOL; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
function warNext() { if (musicPhase !== 'war' || !warTracks) return; warIdx = (warIdx + 1) % warTracks.length; playWar(); }
function musicEnsure() {
  if (musicEls) return true;
  try {
    musicEls = { peace: new Audio('music/peace_music.mp3'), horn: new Audio('music/horn.mp3'), truce: new Audio('music/truce.mp3') };
    musicEls.truce.loop = true;
    for (const k in musicEls) { musicEls[k].preload = 'auto'; musicEls[k].volume = MUSIC_VOL; musicEls[k].addEventListener('error', () => {}); }
    warTracks = ['music/war_music.mp3', 'music/war_music_2.mp3', 'music/war_music_3.mp3'].map(src => { const a = new Audio(src); a.preload = 'auto'; a.volume = MUSIC_VOL; a.addEventListener('ended', warNext); a.addEventListener('error', () => { setTimeout(warNext, 300); }); return a; });
  } catch (e) { musicEls = null; return false; }
  return true;
}
function musicStopAll() { if (musicEls) for (const k in musicEls) { try { musicEls[k].pause(); } catch (e) {} } if (warTracks) warTracks.forEach(a => { try { a.pause(); } catch (e) {} }); musicPhase = null; }
function musicPlay(k, at) { const a = musicEls[k]; try { if (typeof at === 'number' && isFinite(at) && Math.abs((a.currentTime || 0) - at) > 1.5) a.currentTime = Math.max(0, at); const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
function updateMusic() {
  if (!musicOn || muted || !st || st.t == null) { musicStopAll(); return; }
  if (!musicEnsure()) return;
  const t = st.t;
  const phase = (st.me && st.me.truce) ? 'truce' : t < MUS_PEACE_END ? 'peace' : t < MUS_WAR_START ? 'horn' : 'war';
  if (phase !== musicPhase) {
    for (const k in musicEls) if (k !== phase) { try { musicEls[k].pause(); } catch (e) {} }
    if (phase !== 'war' && warTracks) warTracks.forEach(a => { try { a.pause(); } catch (e) {} });
    if (phase === 'peace') musicPlay('peace', t);
    else if (phase === 'horn') musicPlay('horn', t - MUS_PEACE_END);
    else if (phase === 'truce') musicPlay('truce');
    else playWar();
    musicPhase = phase;
  }
  if (phase === 'peace') { const ct = musicEls.peace.currentTime || 0; musicEls.peace.volume = ct < MUS_PEACE_END - 3 ? MUSIC_VOL : Math.max(0, MUSIC_VOL * (MUS_PEACE_END - ct) / 3); }
  else if (phase === 'war') { if (warTracks[warIdx]) warTracks[warIdx].volume = MUSIC_VOL; }
  else if (musicEls[phase]) musicEls[phase].volume = MUSIC_VOL;
}
function tone(type, f0, f1, dur, vol) { if (muted || !actx) return; try { const o = actx.createOscillator(), g = actx.createGain(); o.connect(g); g.connect(actx.destination); const t = actx.currentTime; o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.start(t); o.stop(t + dur + 0.02); } catch (e) {} }
let lastShoot = 0;
function sfxShoot() { const n = performance.now(); if (n - lastShoot < 70) return; lastShoot = n; tone('square', 620, 240, 0.1, 0.05); }
function sfx(kind) { if (kind === 'boom') tone('sawtooth', 190, 45, 0.28, 0.09); else if (kind === 'build') tone('triangle', 300, 520, 0.12, 0.06); else if (kind === 'select') tone('sine', 480, 480, 0.06, 0.04); else if (kind === 'deny') tone('square', 170, 90, 0.16, 0.06); }

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
let mapOverview = false, savedView = null;
function fitWholeMap() {
  const mb = document.getElementById('modeBtn');
  if (!mapOverview) { savedView = { CELL, camX, camY }; const c = Math.min(innerWidth / W, innerHeight / H); CELL = c; camX = (innerWidth - W * c) / 2; camY = (innerHeight - H * c) / 2; mapOverview = true; banner('Уся карта на екрані — «Карта» ще раз, щоб повернутись'); }
  else { if (savedView) { CELL = savedView.CELL; camX = savedView.camX; camY = savedView.camY; } mapOverview = false; banner('Звичайний масштаб'); }
  if (mb) mb.classList.toggle('on', mapOverview);
}
function zoomAt(mx, my, ratio) { if (mapOverview) { mapOverview = false; const mb = document.getElementById('modeBtn'); if (mb) mb.classList.remove('on'); } const old = CELL; let nw = clamp(CELL * ratio, 12, 52); if (Math.abs(nw - old) < 0.01) return; const wx = (mx - camX) / old, wy = (my - camY) / old; CELL = nw; camX = mx - wx * CELL; camY = my - wy * CELL; }
function finalizeBox() {
  const x0 = Math.min(box.x0, box.x1), x1 = Math.max(box.x0, box.x1), y0 = Math.min(box.y0, box.y1), y1 = Math.max(box.y0, box.y1); const ids = [];
  for (const u of myUnits()) { const sx = u.x * CELL + CELL / 2 + camX, sy = u.y * CELL + CELL / 2 + camY; if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) ids.push(u.i); }
  if (ids.length) { sel.units = new Set(ids); sel.building = null; sel.scout = false; sel.diplo = null; banner('Обрано воїнів: ' + ids.length); sfx('select'); refreshCtx(); }
}
function tap(px, py) {
  if (!st) return;
  const col = Math.floor((px - camX) / CELL), row = Math.floor((py - camY) / CELL);
  if (col < 0 || col >= W || row < 0 || row >= H) return;
  if (buildMode) { const reason = buildBlockReason(col, row); if (reason) { banner('🚫 ' + reason); sfx('deny'); return; } socket.emit('command', { type: 'build', build: buildMode, cx: col, cy: row }); sfx('build'); if (buildMode !== 'wall' && buildMode !== 'landmine') { buildMode = null; buildable = null; modes(); } return; }
  if (attackMode) { sendOrder(col, row); attackMode = false; modes(); return; }
  // свій воїн?
  const uids = st.units.filter(u => u.o === me.index && !u.s && Math.round(u.x) === col && Math.round(u.y) === row).map(u => u.i);
  if (uids.length) { sel.units = new Set(uids); sel.building = null; sel.scout = false; sfx('select'); refreshCtx(); return; }
  // розвідник?
  const sc = st.units.find(u => u.o === me.index && u.s && Math.round(u.x) === col && Math.round(u.y) === row);
  if (sc) { sel.units = new Set([sc.i]); sel.scout = true; sel.diplo = null; sel.building = null; sfx('select'); banner('Розвідник обрано'); refreshCtx(); return; }
  // тап по ворожому дипломату з пропозицією до мене — прийняти/відхилити
  const incU = st.units.find(u => u.o !== me.index && u.nc && u.prop && u.prop.to === me.index && Math.round(u.x) === col && Math.round(u.y) === row);
  if (incU) { openRespond(incU); return; }
  // свій дипломат?
  const dp = st.units.find(u => u.o === me.index && u.nc && Math.round(u.x) === col && Math.round(u.y) === row);
  if (dp) { sel.units = new Set([dp.i]); sel.diplo = dp.t; sel.scout = false; sel.building = null; sfx('select'); banner((dp.t === 'proclaimer' ? '🕊 Прокламентерку' : '💰 Торговця') + ' обрано — веди до ворожої гільдії'); refreshCtx(); return; }
  // споруда (своя ресурсна готова — забрати; інакше показати HP)?
  const b = st.buildings.find(bb => bb.t !== 'landmine' && bb.x === col && bb.y === row) || st.buildings.find(bb => bb.x === col && bb.y === row);
  if (b) {
    if (b.o === me.index && b.rd) { socket.emit('command', { type: 'collect', building: b.i }); sfx('build'); return; }
    if (b.o === me.index && b.t === 'market') { sel.building = b.i; sel.units.clear(); sel.scout = false; sfx('select'); openMarket(); refreshCtx(); return; }
    if (b.o === me.index && b.t === 'arsenal') { sel.building = b.i; sel.units.clear(); sel.scout = false; sfx('select'); openArsenal(); refreshCtx(); return; }
    if (b.o === me.index || !b.en) { sel.building = b.i; sel.units.clear(); sel.scout = false; banner(`${b.o === me.index ? '' : (CNAME[IDX[b.o]] + ' ')}${BNAME[b.t] || 'Споруда'} — HP ${b.h}/${b.m}`); sfx('select'); refreshCtx(); return; }
  }
  // інакше: якщо є вибрані воїни — рух; якщо ні — зняти вибір
  if (sel.units.size) { sendMove(col, row); }
  else { sel.building = null; sel.scout = false; refreshCtx(); hideBanner(); closePanels(); }
}

function draw() {
  requestAnimationFrame(draw); if (!canvas) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight);
  if (!st || !biomes || !gridArr) return;
  for (const id in renderU) { const r = renderU[id]; const dx = r.tx - r.x, dy = r.ty - r.y; r.x += dx * 0.22; r.y += dy * 0.22; const sp = Math.hypot(dx, dy); if (sp > 0.04) r.ang = lerpAng(r.ang, Math.atan2(dy, dx), 0.15); if (r.swing > 0) r.swing -= 1 / 60; if (r.healT > 0) r.healT -= 1 / 60; }
  darkness += ((st.night ? 0.28 : 0) - darkness) * 0.03; rain += ((st.weather === 'rain' ? 1 : 0) - rain) * 0.03;
  ctx.save(); ctx.translate(camX, camY);
  drawTiles(); drawMines(); drawBuildings(); drawUnits(); drawLabels(); drawProjectiles(); drawEffects();
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
function drawMines() {   // нижній шар — під спорудами та героями
  for (const b of st.buildings) if (b.t === 'landmine') { const x = b.x * CELL + CELL / 2 + camX, y = b.y * CELL + CELL / 2 + camY; if (offscreen(x, y)) continue; drawMine(b, b.x * CELL + CELL / 2, b.y * CELL + CELL / 2, COL[IDX[b.o]]); }
}
function wallConn() { const m = new Map(); for (const b of st.buildings) if (b.t === 'wall') m.set(b.y * W + b.x, b.o); return m; }
function offscreen(x, y) { return x < -CELL * 3 || x > innerWidth + CELL * 3 || y < -CELL * 3 || y > innerHeight + CELL * 3; }
let labelQueue = [];
function drawLabels() {   // підписи рівнів завжди зверху — жодна будівля не перекриває
  ctx.textAlign = 'center';
  for (const L of labelQueue) {
    if (offscreen(L.x + camX, L.y + camY)) continue;
    ctx.font = 'bold ' + Math.round(CELL * L.size) + 'px system-ui';
    ctx.lineWidth = 3; ctx.strokeStyle = '#0d1017'; ctx.strokeText(L.text, L.x, L.y);
    ctx.fillStyle = L.color; ctx.fillText(L.text, L.x, L.y);
  }
  ctx.textAlign = 'left';
}
function drawWall(b, x, y, c, wm) {
  const own = b.o; const H2 = CELL / 2;
  const has = (dx, dy) => wm.get((b.y + dy) * W + (b.x + dx)) === own;
  const N = has(0, -1), E = has(1, 0), S = has(0, 1), Wn = has(-1, 0);
  const metal = '#464b55', metalHi = '#606877', metalDk = '#2a2e36';
  const aw = CELL * 0.34, cw = CELL * 0.14;
  // метал-арми до сусідів
  ctx.fillStyle = metal;
  if (N) ctx.fillRect(x - aw / 2, y - H2, aw, H2 + 1); if (S) ctx.fillRect(x - aw / 2, y, aw, H2 + 1);
  if (E) ctx.fillRect(x, y - aw / 2, H2 + 1, aw); if (Wn) ctx.fillRect(x - H2 - 1, y - aw / 2, H2 + 1, aw);
  // світна серцевина в армах (колір команди)
  ctx.fillStyle = c;
  if (N) ctx.fillRect(x - cw / 2, y - H2, cw, H2); if (S) ctx.fillRect(x - cw / 2, y, cw, H2);
  if (E) ctx.fillRect(x, y - cw / 2, H2, cw); if (Wn) ctx.fillRect(x - H2, y - cw / 2, H2, cw);
  // вузол (метал з фаскою)
  const ns = CELL * 0.36;
  ctx.fillStyle = metalDk; ctx.fillRect(x - ns, y - ns, ns * 2, ns * 2);
  ctx.fillStyle = metal; ctx.fillRect(x - ns * 0.84, y - ns * 0.84, ns * 1.68, ns * 1.68);
  ctx.fillStyle = metalHi; ctx.fillRect(x - ns * 0.84, y - ns * 0.84, ns * 1.68, ns * 0.22);
  // світне ядро вузла (суцільні заливки — дешево навіть для сотень стін)
  ctx.fillStyle = c; ctx.fillRect(x - ns * 0.52, y - ns * 0.52, ns * 1.04, ns * 1.04);
  ctx.fillStyle = '#ffffff55'; ctx.fillRect(x - ns * 0.22, y - ns * 0.22, ns * 0.44, ns * 0.44);
}
function drawBuildings() {
  const wm = wallConn(); labelQueue = [];
  for (const b of st.buildings) {
    const x = b.x * CELL + CELL / 2, y = b.y * CELL + CELL / 2, c = COL[IDX[b.o]], col = IDX[b.o];
    if (b.t === 'landmine') continue;
    if (offscreen(x + camX, y + camY)) continue;
    if ((b.t === 'tower' || b.t === 'cannon')) { ctx.save(); ctx.translate(x, y); ring(c, BUILD_RANGE[b.t]); ctx.restore(); }
    if (sel.building === b.i) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(b.x * CELL + 1, b.y * CELL + 1, CELL - 2, CELL - 2); }
    const im = sprite(col, b.t);
    if (b.t === 'wall') drawWall(b, x, y, c, wm);
    else if (im) drawSpr(im, x, y, CELL * (BSIZE[b.t] || 1.6)); else drawBuildingShape(b, x, y, c);
    if (b.t === 'guild' && b.gl != null) labelQueue.push({ x: x, y: y - CELL * 1.25, text: '★' + b.gl, color: c, size: 0.5 });
    if (b.t === 'arsenal' && b.al != null) { labelQueue.push({ x: x, y: y - CELL * 1.05, text: 'Lv.' + b.al, color: '#ffcf6a', size: 0.42 }); if (b.aup != null && b.o === me.index) { const w = CELL * 0.9; ctx.fillStyle = '#000a'; ctx.fillRect(x - w / 2, y + CELL * 0.5, w, 4); ctx.fillStyle = '#ffcf6a'; ctx.fillRect(x - w / 2, y + CELL * 0.5, w * b.aup, 4); } }
    if (b.t === 'barracks' && b.q) { const w = CELL * 0.8; ctx.fillStyle = '#000a'; ctx.fillRect(x - w / 2, y + CELL * 0.5, w, 4); ctx.fillStyle = '#f5c542'; ctx.fillRect(x - w / 2, y + CELL * 0.5, w * (b.prog || 0), 4); if (b.q > 1) { ctx.fillStyle = '#fff'; ctx.font = 'bold 10px system-ui'; ctx.fillText('x' + b.q, x + w / 2 - 2, y + CELL * 0.5 - 2); } }
    if (b.rk && b.o === me.index) { if (b.rd) { ctx.font = 'bold ' + Math.round(CELL * 0.7) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffdf5a'; ctx.strokeStyle = '#0d1017'; ctx.lineWidth = 3; ctx.strokeText('!', x, y - CELL * 0.9); ctx.fillText('!', x, y - CELL * 0.9); ctx.textAlign = 'left'; } else { const w = CELL * 0.7; ctx.fillStyle = '#000a'; ctx.fillRect(x - w / 2, y + CELL * 0.62, w, 3); ctx.fillStyle = '#6fcf97'; ctx.fillRect(x - w / 2, y + CELL * 0.62, w * (b.tp || 0), 3); } }
    hpBar(x, y - CELL * (im ? 0.78 : 0.5), b.h, b.m, CELL * 0.85);
  }
}
function drawMine(b, x, y, c) {
  const col = IDX[b.o]; const im = sprite(col, 'landmine');
  const arming = (b.o === me.index) && b.arm > 0;
  ctx.save();
  if (arming) ctx.globalAlpha = 0.45;                     // під час активації — приглушено
  if (im) drawSpr(im, x, y, CELL * (BSIZE.landmine || 1.0));
  else { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, CELL * 0.15, 0, 7); ctx.fill(); ctx.strokeStyle = c; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(x, y, CELL * 0.24, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
  ctx.globalAlpha = 1;
  if (b.en) {                                             // виявлена ворожа міна — попередження
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200);
    ctx.strokeStyle = `rgba(255,90,90,${0.5 + pulse * 0.4})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, CELL * 0.34, 0, 7); ctx.stroke();
    ctx.fillStyle = '#ff8a8a'; ctx.font = Math.round(CELL * 0.42) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText('⚠', x, y - CELL * 0.46); ctx.textAlign = 'left';
  } else if (arming) {                                    // своя міна армується — маленький лічильник
    ctx.fillStyle = '#f5c542'; ctx.font = 'bold ' + Math.round(CELL * 0.3) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText(b.arm, x, y - CELL * 0.42); ctx.textAlign = 'left';
  }
  ctx.restore();
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
  else if (t === 'market') { ctx.fillStyle = c; ctx.fillRect(-CELL * 0.34, -CELL * 0.02, CELL * 0.68, CELL * 0.36); ctx.fillStyle = '#0d1017'; for (let i = -1; i <= 1; i++) ctx.fillRect(i * CELL * 0.22 - CELL * 0.045, -CELL * 0.02, CELL * 0.09, CELL * 0.36); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-CELL * 0.4, -CELL * 0.02); ctx.lineTo(0, -CELL * 0.3); ctx.lineTo(CELL * 0.4, -CELL * 0.02); ctx.closePath(); ctx.fill(); }
  else if (t === 'arsenal') { const s2 = CELL * 0.36; ctx.fillStyle = '#3a3f4a'; ctx.fillRect(-s2, -s2 * 0.8, s2 * 2, s2 * 1.6); ctx.fillStyle = c; ctx.fillRect(-s2 * 0.78, -s2 * 0.58, s2 * 1.56, s2 * 1.16); ctx.strokeStyle = '#0d1017'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-s2 * 0.38, -s2 * 0.38); ctx.lineTo(s2 * 0.38, s2 * 0.38); ctx.moveTo(s2 * 0.38, -s2 * 0.38); ctx.lineTo(-s2 * 0.38, s2 * 0.38); ctx.stroke(); }
  else if (t === 'flag') { ctx.strokeStyle = '#0d1017'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, CELL * 0.32); ctx.lineTo(0, -CELL * 0.34); ctx.stroke(); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, -CELL * 0.34); ctx.lineTo(CELL * 0.28, -CELL * 0.24); ctx.lineTo(0, -CELL * 0.12); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}
function drawUnits() {
  for (const id in renderU) {
    const u = renderU[id], x = u.x * CELL + CELL / 2, y = u.y * CELL + CELL / 2, c = COL[IDX[u.o]], col = IDX[u.o];
    if (offscreen(x + camX, y + camY)) continue;
    if (u.o === me.index && sel.units.has(+id)) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y + CELL * 0.12, CELL * 0.32, 0, 7); ctx.stroke(); }
    const type = u.s ? 'scout' : u.t;
    let rot = u.ang - Math.PI / 2;   // завжди зберігаємо напрямок (без сіпання в нейтраль)
    if (u.swing > 0 && MELEE[type]) { const ph = (0.28 - u.swing) / 0.28; rot += Math.sin(ph * Math.PI * 3) * 0.32 * (u.swing / 0.28); }   // замах вправо-вліво
    // аура командира / кільце священника — під юнітом
    if (u.t === 'commander') drawAura(x, y, 7, c, false);
    if (u.t === 'priest') drawAura(x, y, 5, '#7fe0a0', true, u.healT);
    const im = sprite(col, type);
    if (im) drawSpr(im, x, y, CELL * (USIZE[type] || 1.15), rot); else drawUnitShape(u, x, y, c, rot);
    if (u.m && !u.s && !u.nc) hpBar(x, y - CELL * (im ? 0.55 : 0.36), u.h, u.m, CELL * 0.46);
    if (u.nc && u.carry) {   // торговець несе ресурси додому — «!»
      const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 250);
      ctx.fillStyle = 'rgba(255,210,90,' + pulse + ')'; ctx.beginPath(); ctx.arc(x, y - CELL * 0.9, CELL * 0.34, 0, 7); ctx.fill();
      ctx.fillStyle = '#0d1017'; ctx.font = 'bold ' + Math.round(CELL * 0.5) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText('!', x, y - CELL * 0.74); ctx.textAlign = 'left';
    }
    if (u.nc && u.prop) {   // над дипломатом — іконка пропозиції
      const mine = u.prop.to === me.index;   // до мене? (можу прийняти)
      const icon = u.prop.k === 'truce' ? '🕊' : '🤝';
      const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 250);
      ctx.globalAlpha = mine ? 1 : 0.85; ctx.font = 'bold ' + Math.round(CELL * (mine ? 0.6 : 0.44)) + 'px system-ui'; ctx.textAlign = 'center';
      if (mine) { ctx.fillStyle = 'rgba(255,220,120,' + pulse + ')'; ctx.beginPath(); ctx.arc(x, y - CELL * 0.9, CELL * 0.4, 0, 7); ctx.fill(); }
      ctx.fillStyle = mine ? '#0d1017' : '#fff'; ctx.fillText(icon, x, y - CELL * 0.78); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
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
  else if (t === 'proclaimer') { ctx.beginPath(); ctx.arc(0, 0, CELL * 0.2, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(CELL * 0.26) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🕊', 0, 0); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; }
  else if (t === 'trader') { ctx.beginPath(); ctx.arc(0, 0, CELL * 0.2, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(CELL * 0.24) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('💰', 0, 0); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; }
  ctx.restore();
}
function drawAura(x, y, r, col, heal, healT) {
  const t = performance.now() / 1000;
  ctx.save();
  const rad = CELL * r;
  const grad = ctx.createRadialGradient(x, y, rad * 0.2, x, y, rad);
  grad.addColorStop(0, col + '00'); grad.addColorStop(0.75, col + (heal ? '10' : '14')); grad.addColorStop(1, col + '00');
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
  ctx.strokeStyle = col + '55'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); ctx.lineDashOffset = -t * 12; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  if (heal && healT > 0) {   // яскравіший зелений пульс під час хілу
    const p = healT / 0.4; ctx.globalAlpha = p; ctx.strokeStyle = '#8dffb0'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, rad * (0.5 + (1 - p) * 0.5), 0, 7); ctx.stroke();
    ctx.fillStyle = '#8dffb0'; ctx.font = 'bold ' + Math.round(CELL * 0.5) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText('+', x, y - CELL * 0.5); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  }
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
  bar.innerHTML = '<button id="dbgSwitch" class="dbgbtn"></button><button id="dbgRes" class="dbgbtn">💰 +Ресурси</button><button id="dbgFog" class="dbgbtn">🌫 Туман: ВИМК</button><button id="dbgEnd" class="dbgbtn">🏁 Завершити</button>';
  document.getElementById('game').appendChild(bar);
  document.getElementById('dbgSwitch').onclick = () => socket.emit('switchEmpire');
  document.getElementById('dbgFog').onclick = () => socket.emit('toggleFog');
  document.getElementById('dbgRes').onclick = () => { socket.emit('debugGrant'); banner('Дебаг: +1000 ресурсів, +50 жетонів'); };
  document.getElementById('dbgEnd').onclick = () => socket.emit('debugEnd');
  updateDbg();
}
function updateDbg() { const b = document.getElementById('dbgSwitch'); if (!b) return; b.textContent = '🔧 За: ' + (CNAME[me.color] || '') + ' ▸'; b.style.background = COL[me.color] || '#f5c542'; b.style.color = '#0d1017'; }

function showEnd(d) {
  el.overlay.classList.remove('hidden');
  musicStopAll();
  if (gameKind === 'multi' && me.index >= 0) {
    profile.games++; if (d.winner === me.index) profile.wins++; else profile.losses++;
    const mine = (d.stats || []).find(x => x.index === me.index);
    if (mine) { profile.kills += mine.kills || 0; profile.made += mine.made || 0; profile.built += mine.built || 0; profile.razed += mine.razed || 0; profile.gathered += mine.gathered || 0; profile.bestGuild = Math.max(profile.bestGuild, mine.guildLevel || 0); }
    saveProfile(); renderProfile();
  }   // музика замовкає на екрані кінця бою
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
  if (on) { try { window.scrollTo(0, 1); } catch (e) {} banner('Для повного екрана без адресної стрічки: Поділитися → «На початковий екран», і запусти з іконки'); }
  setTimeout(resize, 80);
}

// ================= Базар / Арсенал =================
const RES_EMO = { wood: '🌲', stone: '⛏', food: '🍞', gold: '💰' };
const RESUA = { wood: 'Дерево', stone: 'Камінь', food: 'Їжа', gold: 'Золото' };
let marketPanel = null, arsenalPanel = null, marketAmt = [100, 100];
let heroMenu = null, trucePanel = null, tradePanel = null, respondPanel = null;
let killfeedEl = null, truceEl = null, lastIncoming = null;
let orderMenu = null, groupMenu = null, orderMode = 'attack', orderTarget = 'all';
const groups = { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() };
let tradeState = { give: 'wood', gamt: 100, want: 'stone', wamt: 100 };

// ================= Дипломатія (герої / мир / обмін) =================
function selectHeroes() {
  ensurePanels();
  const wasOpen = heroMenu && !heroMenu.classList.contains('hidden');
  closeMenus && closeMenus(); closePanels();
  if (wasOpen) return;   // повторний клік по «Герої» — просто закрити
  const cfg = (st && st.cfg) || { proclaimer: true, trader: true };
  const scOk = st && st.me && st.me.tech.scouting >= 1;
  const opts = [['scout', '🔭 Розвідка', scOk, 'купіть «Розвідку»'], ['proclaimer', '🕊 Прокламентерка', cfg.proclaimer !== false, 'вимкнено'], ['trader', '💰 Торговець', cfg.trader !== false, 'вимкнено']];
  heroMenu.innerHTML = opts.map(([k, l, on, why]) => `<button class="btn s" data-h="${k}"${on ? '' : ' disabled'}>${l}${on ? '' : ' <small>(' + why + ')</small>'}</button>`).join('');
  heroMenu.querySelectorAll('[data-h]:not([disabled])').forEach(b => b.onclick = () => { heroMenu.classList.add('hidden'); pickHero(b.dataset.h); });
  heroMenu.classList.remove('hidden');
}
function pickHero(k) {
  if (k === 'scout') return selectScout();
  const u = st && st.units.find(x => x.o === me.index && x.t === k);
  if (!u) { banner(k === 'trader' ? '💰 Торговець зʼявляється разом із Базаром' : '🕊 Прокламентерки немає'); return; }
  sel.units = new Set([u.i]); sel.diplo = k; sel.scout = false; sel.building = null;
  banner((k === 'proclaimer' ? '🕊 Прокламентерку' : '💰 Торговця') + ' обрано — веди до ворожої гільдії (≤4), щоб запропонувати ' + (k === 'proclaimer' ? 'мир' : 'обмін'));
  sfx('select'); refreshCtx();
}
function diploUnit() { if (!sel.diplo || sel.units.size !== 1 || !st) return null; const id = [...sel.units][0]; return st.units.find(u => u.i === id && u.o === me.index && u.nc) || null; }
function nearEnemyGuild(u, r) { if (!u || !st) return null; for (const b of st.buildings) if (b.t === 'guild' && b.o !== me.index && Math.hypot(b.x - u.x, b.y - u.y) <= (r || 4)) return b; return null; }

function openTruceChooser() {
  ensurePanels(); closeMenus && closeMenus();
  trucePanel.innerHTML = `<div class="pnhead">🕊 Запропонувати мир<button class="pnx" data-x>✕</button></div>`
    + `<div class="arnext">На скільки хвилин?</div>`
    + `<div class="pnsteps">${[1, 3, 5, 10].map(m => `<button data-m="${m}">${m} хв</button>`).join('')}</div>`;
  trucePanel.querySelector('[data-x]').onclick = () => trucePanel.classList.add('hidden');
  trucePanel.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { socket.emit('command', { type: 'proposeTruce', minutes: +b.dataset.m }); trucePanel.classList.add('hidden'); banner('🕊 Пропозицію миру надіслано — чекай відповіді'); refreshCtx(); });
  trucePanel.classList.remove('hidden');
}

function openTradePanel() { ensurePanels(); closeMenus && closeMenus(); renderTradePanel(); tradePanel.classList.remove('hidden'); }
function renderTradePanel() {
  const RES = ['wood', 'stone', 'food', 'gold'];
  const pen = (st.me && st.me.truce) ? '' : ' <span class="pnstatus">−15%</span>';
  const g = RES.map(r => `<button data-g="${r}" class="${tradeState.give === r ? 'on' : ''}">${curIcon(r, RES_EMO[r])}</button>`).join('');
  const w = RES.map(r => `<button data-w="${r}" class="${tradeState.want === r ? 'on' : ''}">${curIcon(r, RES_EMO[r])}</button>`).join('');
  tradePanel.innerHTML = `<div class="pnhead">🤝 Обмін${pen}<button class="pnx" data-x>✕</button></div>`
    + `<div class="pnrow">Ви даєте:</div><div class="pnsteps">${g}</div>`
    + `<div class="pnsteps"><button data-d="-100">−100</button><button data-d="-10">−10</button><span class="pnamt">${tradeState.gamt}</span><button data-d="10">+10</button><button data-d="100">+100</button></div>`
    + `<div class="pnrow">Ви хочете:</div><div class="pnsteps">${w}</div>`
    + `<div class="pnsteps"><button data-w2="-100">−100</button><button data-w2="-10">−10</button><span class="pnamt">${tradeState.wamt}</span><button data-w2="10">+10</button><button data-w2="100">+100</button></div>`
    + `<button class="pnbtn ok" data-send>Надіслати пропозицію</button>`;
  tradePanel.querySelector('[data-x]').onclick = () => tradePanel.classList.add('hidden');
  tradePanel.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { tradeState.give = b.dataset.g; renderTradePanel(); });
  tradePanel.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { tradeState.want = b.dataset.w; renderTradePanel(); });
  tradePanel.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { tradeState.gamt = Math.max(0, tradeState.gamt + (+b.dataset.d)); renderTradePanel(); });
  tradePanel.querySelectorAll('[data-w2]').forEach(b => b.onclick = () => { tradeState.wamt = Math.max(0, tradeState.wamt + (+b.dataset.w2)); renderTradePanel(); });
  tradePanel.querySelector('[data-send]').onclick = () => {
    if (tradeState.give === tradeState.want) { banner('Оберіть різні ресурси'); return; }
    if (tradeState.gamt <= 0 || tradeState.wamt <= 0) { banner('Вкажіть кількість'); return; }
    socket.emit('command', { type: 'proposeTrade', give: { res: tradeState.give, amt: tradeState.gamt }, want: { res: tradeState.want, amt: tradeState.wamt } });
    tradePanel.classList.add('hidden'); banner('🤝 Пропозицію обміну надіслано — чекай відповіді'); refreshCtx();
  };
}

function openRespond(u) {
  ensurePanels(); closeMenus && closeMenus();
  const p = u.prop, fromName = CNAME[IDX[p.from]] || 'Гравець';
  let body;
  if (p.k === 'truce') body = `<div class="pnrow">🕊 <b>${fromName}</b> команда пропонує мир на <b>${p.minutes} хв</b>.<br>Армії та будівлі не зможуть шкодити одна одній.</div>`;
  else { const noPen = st.me && st.me.truce; body = `<div class="pnrow">🤝 <b>${fromName}</b> дає ${p.give.amt} ${curIcon(p.give.res, RES_EMO[p.give.res])} за ваші ${p.want.amt} ${curIcon(p.want.res, RES_EMO[p.want.res])}.<br>${noPen ? 'Мир — без штрафу.' : 'Без миру ви отримаєте −15%.'}</div>`; }
  respondPanel.innerHTML = `<div class="pnhead">Вхідна пропозиція<button class="pnx" data-x>✕</button></div>${body}`
    + `<div class="pnsteps"><button class="pnbtn ok" data-ok>✅ Прийняти</button><button class="pnbtn no" data-no>❌ Відхилити</button></div>`;
  const cmd = p.k === 'truce' ? 'respondTruce' : 'respondTrade';
  respondPanel.querySelector('[data-x]').onclick = () => respondPanel.classList.add('hidden');
  respondPanel.querySelector('[data-ok]').onclick = () => { socket.emit('command', { type: cmd, accept: true }); respondPanel.classList.add('hidden'); banner('✅ Пропозицію прийнято'); };
  respondPanel.querySelector('[data-no]').onclick = () => { socket.emit('command', { type: cmd, accept: false }); respondPanel.classList.add('hidden'); banner('❌ Пропозицію відхилено'); };
  respondPanel.classList.remove('hidden');
}

// ================= Групи та накази =================
function pruneGroups() { if (!st) return; const alive = new Set(st.units.map(u => u.i)); for (const n of [1, 2, 3, 4]) for (const id of [...groups[n]]) if (!alive.has(id)) groups[n].delete(id); }
function armyIds() { return myUnits().filter(u => !u.nc).map(u => u.i); }   // вся армія (без дипломатів/розвідки)
function assignGroup(n) { if (!sel.units.size) { banner('Спершу виділи воїнів'); return; } for (const id of sel.units) { for (const g of [1, 2, 3, 4]) groups[g].delete(id); groups[n].add(id); } banner('Група ' + n + ': ' + groups[n].size + ' юнітів'); sfx('select'); }
function selectGroupUnits(n) { pruneGroups(); if (!groups[n].size) { banner('Група ' + n + ' порожня'); return; } sel.units = new Set(groups[n]); sel.building = null; sel.scout = false; sel.diplo = null; sfx('select'); refreshCtx(); banner('Обрано групу ' + n + ' (' + groups[n].size + ')'); }
function clearGroup(n) { groups[n].clear(); banner('Групу ' + n + ' розпущено'); }

function openGroupMenu() {
  ensurePanels();
  const wasOpen = groupMenu && !groupMenu.classList.contains('hidden');
  closeMenus && closeMenus(); closePanels(); attackMode = false; modes();
  if (wasOpen) return;
  renderGroupMenu(); groupMenu.classList.remove('hidden');
}
function renderGroupMenu() {
  pruneGroups();
  const selN = sel.units.size;
  let h = `<div class="omttl">${selN ? ('Записати виділених (' + selN + ') у групу') : 'Записати виділених у групу'}</div>`;
  h += `<div class="omgrid omg4">` + [1, 2, 3, 4].map(n => `<button class="omb" data-asg="${n}">${n}</button>`).join('') + `</div>`;
  h += `<div class="omttl">Обрати групу</div>`;
  h += `<div class="omgrid omg4">` + [1, 2, 3, 4].map(n => `<button class="omb" data-sel="${n}">${n}<small>${groups[n].size}</small></button>`).join('') + `</div>`;
  h += `<div class="omttl">Розпустити</div>`;
  h += `<div class="omgrid omg4">` + [1, 2, 3, 4].map(n => `<button class="omb no" data-clr="${n}">🗑${n}</button>`).join('') + `</div>`;
  groupMenu.innerHTML = h;
  groupMenu.querySelectorAll('[data-asg]').forEach(b => b.onclick = () => { assignGroup(+b.dataset.asg); renderGroupMenu(); });
  groupMenu.querySelectorAll('[data-sel]').forEach(b => b.onclick = () => { selectGroupUnits(+b.dataset.sel); groupMenu.classList.add('hidden'); });
  groupMenu.querySelectorAll('[data-clr]').forEach(b => b.onclick = () => { clearGroup(+b.dataset.clr); renderGroupMenu(); });
}

function openOrderMenu() {
  ensurePanels();
  if (attackMode) { attackMode = false; sel.units.clear(); sel.diplo = null; modes(); refreshCtx(); banner('Наказ скасовано — обери групу знову'); return; }   // ще раз «Наказ» під час наведення — скасувати
  const wasOpen = orderMenu && !orderMenu.classList.contains('hidden');
  if (sel.diplo) { sel.units.clear(); sel.diplo = null; refreshCtx(); }
  closeMenus && closeMenus(); closePanels(); modes();
  if (wasOpen) return;
  renderOrderMenu(); orderMenu.classList.remove('hidden');
}
function renderOrderMenu() {
  pruneGroups();
  const grp = [['all', 'Всі'], [1, 'Г1'], [2, 'Г2'], [3, 'Г3'], [4, 'Г4']];
  orderMenu.innerHTML =
    `<div class="omttl">Наказ</div>`
    + `<div class="omgrid omg2"><button class="omb ${orderMode === 'attack' ? 'on' : ''}" data-m="attack">⚔ Атака</button><button class="omb ${orderMode === 'defense' ? 'on' : ''}" data-m="defense">🛡 Захист</button></div>`
    + `<div class="omttl">Кому</div>`
    + `<div class="omgrid omg5">` + grp.map(([k, l]) => { const cnt = k === 'all' ? armyIds().length : groups[k].size; return `<button class="omb sm ${String(orderTarget) === String(k) ? 'on' : ''}" data-t="${k}">${l}<small>${k === 'all' ? '' : cnt}</small></button>`; }).join('') + `</div>`
    + `<button class="pnbtn ok" data-go>▶ Обрати точку</button>`;
  orderMenu.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { orderMode = b.dataset.m; renderOrderMenu(); });
  orderMenu.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { orderTarget = b.dataset.t === 'all' ? 'all' : (+b.dataset.t); selectOrderUnits(); renderOrderMenu(); });
  orderMenu.querySelector('[data-go]').onclick = () => {
    const n = orderTarget === 'all' ? armyIds().length : (pruneGroups(), groups[orderTarget].size);
    if (!n) { banner(orderTarget === 'all' ? 'Немає армії' : 'Група ' + orderTarget + ' порожня'); return; }
    selectOrderUnits();
    orderMenu.classList.add('hidden'); attackMode = true; modes();
    banner((orderMode === 'defense' ? '🛡 Захист' : '⚔ Атака') + ': тапни точку' + (orderTarget === 'all' ? '' : ' · Група ' + orderTarget));
  };
}
function selectOrderUnits() { pruneGroups(); const ids = orderTarget === 'all' ? armyIds() : [...groups[orderTarget]]; sel.units = new Set(ids); sel.building = null; sel.scout = false; sel.diplo = null; sfx('select'); refreshCtx(); }
function sendOrder(col, row) {
  let ids; if (orderTarget === 'all') ids = armyIds(); else { pruneGroups(); ids = [...groups[orderTarget]]; }
  if (!ids.length) { banner('Немає юнітів для наказу'); return; }
  if (st.peace > 0) { banner('🕊 Мир: армію ще не можна рухати'); return; }
  socket.emit('command', { type: 'move', ids, x: col, y: row, hold: orderMode === 'defense' });
  banner(orderMode === 'defense' ? '🛡 Утримувати точку' : '⚔ Атака точки');
}
function ensurePanels() {
  if (!marketPanel) { marketPanel = document.createElement('div'); marketPanel.id = 'marketPanel'; marketPanel.className = 'sidepanel hidden'; document.getElementById('game').appendChild(marketPanel); }
  if (!arsenalPanel) { arsenalPanel = document.createElement('div'); arsenalPanel.id = 'arsenalPanel'; arsenalPanel.className = 'sidepanel hidden'; document.getElementById('game').appendChild(arsenalPanel); }
  const G = document.getElementById('game');
  if (!heroMenu) { heroMenu = document.createElement('div'); heroMenu.id = 'heroMenu'; heroMenu.className = 'submenu hidden'; G.appendChild(heroMenu); }
  if (!trucePanel) { trucePanel = document.createElement('div'); trucePanel.id = 'trucePanel'; trucePanel.className = 'sidepanel hidden'; G.appendChild(trucePanel); }
  if (!tradePanel) { tradePanel = document.createElement('div'); tradePanel.id = 'tradePanel'; tradePanel.className = 'sidepanel hidden'; G.appendChild(tradePanel); }
  if (!respondPanel) { respondPanel = document.createElement('div'); respondPanel.id = 'respondPanel'; respondPanel.className = 'sidepanel hidden'; G.appendChild(respondPanel); }
  if (!orderMenu) { orderMenu = document.createElement('div'); orderMenu.id = 'orderMenu'; orderMenu.className = 'submenu hidden'; G.appendChild(orderMenu); }
  if (!groupMenu) { groupMenu = document.createElement('div'); groupMenu.id = 'groupMenu'; groupMenu.className = 'submenu hidden'; G.appendChild(groupMenu); }
}
function openMarket() { closeMenus(); if (arsenalPanel) arsenalPanel.classList.add('hidden'); marketPanel.classList.remove('hidden'); renderMarket(); }
function closeMarket() { if (marketPanel) marketPanel.classList.add('hidden'); }
function openArsenal() { closeMenus(); if (marketPanel) marketPanel.classList.add('hidden'); arsenalPanel.classList.remove('hidden'); renderArsenal(); }
function closeArsenal() { if (arsenalPanel) arsenalPanel.classList.add('hidden'); }
function tradeCalc(from, to, amt) { if (from === 'gold') return Math.floor(amt / 20 * 70); if (to === 'gold') return Math.floor(amt / 100 * 20); return Math.floor(amt / 100 * 70); }
function renderMarket() {
  if (!marketPanel || marketPanel.classList.contains('hidden') || !st || !st.me) return;
  const day = !st.night, cd = st.me.marketCd || 0, offers = st.offers || [];
  let h = `<div class="pnhead">🏪 БАЗАР <span class="pnstatus">${day ? '☀️ ВІДКРИТО' : '🌙 НІЧ'}</span><button class="pnx" data-x>✕</button></div>`;
  if (!day) { h += `<div class="mknight">🌙 Ніч — базар зачинено.<br>Обмінів немає. Нові пропозиції зʼявляться зранку.</div>`; }
  else offers.forEach((o, i) => {
    const avail = st.me.res[o.from] || 0;
    if (marketAmt[i] === undefined) marketAmt[i] = Math.min(100, avail);
    let amt = Math.max(0, Math.min(marketAmt[i], avail)); marketAmt[i] = amt;
    const get = tradeCalc(o.from, o.to, amt);
    const base = o.from === 'gold' ? 20 : 100, brate = tradeCalc(o.from, o.to, base);
    const dis = !day || cd > 0 || amt <= 0 || amt > avail;
    h += `<div class="pnoffer"><div class="pnrow">${curIcon(o.from, RES_EMO[o.from])} ${RESUA[o.from]} → ${curIcon(o.to, RES_EMO[o.to])} ${RESUA[o.to]}</div>` +
      `<div class="pnsub">${base} = ${brate}</div>` +
      `<div class="pnsteps" data-i="${i}"><button data-d="-100">-100</button><button data-d="-10">-10</button><span class="pnamt">${amt}</span><button data-d="10">+10</button><button data-d="100">+100</button><button data-d="max">MAX</button></div>` +
      `<div class="pnprev">Віддаєте ${amt} ${curIcon(o.from, RES_EMO[o.from])} → Отримуєте ${get} ${curIcon(o.to, RES_EMO[o.to])}</div>` +
      `<button class="pnbtn" data-t="${i}" ${dis ? 'disabled' : ''}>${cd > 0 ? ('⏳ ' + cd + 'с') : '🔄 ОБМІНЯТИ'}</button></div>`;
  });
  marketPanel.innerHTML = h;
  marketPanel.querySelector('[data-x]').onclick = closeMarket;
  marketPanel.querySelectorAll('.pnsteps').forEach(row => { const i = +row.dataset.i; row.querySelectorAll('button').forEach(bt => bt.onclick = () => { const av = st.me.res[st.offers[i].from] || 0, d = bt.dataset.d; if (d === 'max') marketAmt[i] = av; else marketAmt[i] = Math.max(0, Math.min(av, (marketAmt[i] || 0) + parseInt(d))); renderMarket(); }); });
  marketPanel.querySelectorAll('.pnbtn').forEach(bt => bt.onclick = () => { const i = +bt.dataset.t; socket.emit('command', { type: 'trade', offer: i, amount: marketAmt[i] }); });
}
function arsenalCostC(L) { return { wood: 60 + 15 * L, stone: 60 + 15 * L, food: 40 + 10 * L, gold: 40 + 10 * L }; }
function arsenalTokC(L) { return L >= 25 ? 5 : L >= 20 ? 4 : L >= 15 ? 3 : L >= 10 ? 2 : L >= 5 ? 1 : 0; }
function renderArsenal() {
  if (!arsenalPanel || arsenalPanel.classList.contains('hidden') || !st || !st.me) return;
  const L = st.me.arsenalLevel || 0, up = st.me.arsenalUp;
  const hp = Math.round((0.03 * L + (L >= 10 ? 0.10 : 0) + (L >= 20 ? 0.10 : 0)) * 100);
  const dmg = Math.round(0.02 * L * 100);
  const beff = 35 + (L >= 5 ? 5 : 0) + (L >= 15 ? 5 : 0) + (L >= 25 ? 5 : 0);
  let h = `<div class="pnhead">🏛 АРСЕНАЛ<button class="pnx" data-x>✕</button></div>` +
    `<div class="arlvl">Рівень: <b>${L}</b> / 25</div>` +
    `<div class="arbon">❤️ HP: +${hp}%&nbsp;&nbsp;⚔️ Шкода: +${dmg}%&nbsp;&nbsp;🏰 По спорудах: ${beff}%</div>`;
  if (up) { const prog = Math.round((1 - up.time / up.total) * 100); h += `<div class="arnext">Покращення до рівня ${up.target}… ${up.time}с</div><div class="arbar"><span style="width:${prog}%"></span></div>`; }
  else if (L >= 25) { h += `<div class="arnext">МАКСИМАЛЬНИЙ РІВЕНЬ</div>`; }
  else {
    const nl = L + 1, cc = arsenalCostC(nl), tok = arsenalTokC(nl), tm = 15 + 3 * nl;
    const afford = st.me.res.wood >= cc.wood && st.me.res.stone >= cc.stone && st.me.res.food >= cc.food && st.me.res.gold >= cc.gold && st.me.res.tokens >= tok;
    h += `<div class="arnext">Рівень ${nl}: ${costStr({ wood: cc.wood, stone: cc.stone, food: cc.food, gold: cc.gold })}${tok > 0 ? (' + ' + tok + ' ' + curIcon('tokens', '🔧')) : ''} · ⏱ ${tm}с</div>` +
      `<button class="pnbtn" data-up ${afford ? '' : 'disabled'}>ПОКРАЩИТИ ДО РІВНЯ ${nl}</button>`;
  }
  arsenalPanel.innerHTML = h;
  arsenalPanel.querySelector('[data-x]').onclick = closeArsenal;
  const b = arsenalPanel.querySelector('[data-up]'); if (b) b.onclick = () => socket.emit('command', { type: 'arsenalUpgrade' });
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
