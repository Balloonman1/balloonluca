// Menus, lobby, scoring and the game loop.
import './style.css';
import * as B from './b.js';
import { Flight } from './game.js';
import { MAPS, L, FLIGHT_TIME } from './maps.js';
import { Net } from './net.js';

const $ = (id) => document.getElementById(id);
const COLORS = ['#e63946', '#f77f00', '#ffd60a', '#2a9d8f', '#3a86ff', '#8338ec', '#ff5db1', '#222831'];
const BONUS = [300, 200, 150, 100, 75, 50, 25, 10]; // extra points by finishing order
const MAX_PLAYERS = 8;
const BOTS = [['Sky Fox', 0.85], ['Breezy', 0.68], ['Captain Cloud', 0.52], ['Gusty', 0.38]]; // name, skill

const LOW = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('low');
const canvas = $('c');
const engine = new B.Engine(canvas, true, { stencil: false });
if (LOW) engine.setHardwareScalingLevel(Math.max(1, (window.devicePixelRatio || 1) / 1.5));
window.addEventListener('resize', () => engine.resize());

const S = { isHost: false, myId: null, color: COLORS[0], players: [], phase: 'menu', flightNo: 0, lastPos: {} };
let net = null, flight = null;
let tStart = 0, timerOn = false, done = false, cdToken = 0;
const hostP = new Map(); // host only: id -> player record
let hostDeadline = 0;
let hostSeen = 0; // guests: last time we heard from the host

// ---------- sound ----------
let ac = null;
function beep(freq, dur = 0.1, vol = 0.12) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
  } catch (e) { /* no sound available */ }
}

// ---------- input ----------
const input = { left: false, right: false, up: false, down: false };
const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
window.addEventListener('keydown', (e) => {
  const k = KEYS[e.key] || KEYS[e.key.toLowerCase()];
  if (k && S.phase === 'flight') { input[k] = true; e.preventDefault(); }
});
window.addEventListener('keyup', (e) => { const k = KEYS[e.key] || KEYS[e.key.toLowerCase()]; if (k) input[k] = false; });
window.addEventListener('blur', () => { for (const k in input) input[k] = false; });
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });
document.querySelectorAll('#touch button').forEach((b) => {
  const k = b.dataset.k;
  const set = (v) => (e) => { e.preventDefault(); input[k] = v; b.classList.toggle('down', v); };
  b.addEventListener('pointerdown', set(true));
  b.addEventListener('pointerup', set(false));
  b.addEventListener('pointercancel', set(false));
  b.addEventListener('pointerleave', set(false));
  b.addEventListener('contextmenu', (e) => e.preventDefault());
});

// ---------- screens ----------
const SCREENS = ['menu', 'lobby', 'wait', 'results', 'hud'];
function show(name) { for (const s of SCREENS) $(s).classList.toggle('hide', s !== name); }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

COLORS.forEach((c, i) => {
  const b = document.createElement('button');
  b.style.background = c; if (i === 0) b.classList.add('sel');
  b.onclick = () => { S.color = c; document.querySelectorAll('#colors button').forEach((x) => x.classList.toggle('sel', x === b)); };
  $('colors').appendChild(b);
});
try { $('name').value = localStorage.getItem('br_name') || ''; } catch (e) { /* storage off */ }
function myName() {
  const n = $('name').value.trim().slice(0, 12) || 'Pilot';
  try { localStorage.setItem('br_name', n); } catch (e) { /* storage off */ }
  return n;
}
function busy(on) { for (const id of ['create', 'join', 'solo']) $(id).disabled = on;
  document.querySelectorAll('#botpick button').forEach((b) => { b.disabled = on; }); }

$('create').onclick = async () => {
  $('msg').textContent = 'Creating game...'; busy(true);
  net = new Net();
  try {
    const code = await net.host();
    net.onGuestMsg = hostHandle;
    net.onGuestLeave = hostLeave;
    beginHost(code);
  } catch (e) { net = null; $('msg').textContent = e.message; }
  busy(false);
};
$('solo').onclick = () => { net = null; beginHost(null); hostStart(0); };
// "Play against bots" on the menu, and the bot picker in the lobby
[1, 2, 3, 4].forEach((n) => {
  const b = document.createElement('button'); b.textContent = n;
  b.onclick = () => { net = null; beginHost(null); hostSetBots(n); hostStart(0); };
  $('botpick').appendChild(b);
});
[0, 1, 2, 3, 4].forEach((n) => {
  const b = document.createElement('button'); b.textContent = n; b.dataset.n = n;
  b.onclick = () => { if (S.isHost && S.phase === 'lobby') hostSetBots(n); };
  $('lobbybotpick').appendChild(b);
});
$('join').onclick = async () => {
  const code = $('code').value.trim().toUpperCase();
  if (code.length !== 4) { $('msg').textContent = 'Type the 4-letter code.'; return; }
  $('msg').textContent = 'Joining...'; busy(true);
  net = new Net();
  try {
    await net.join(code);
    net.onHostMsg = clientHandle;
    net.onHostLost = () => leave('The host left the game.');
    S.isHost = false; S.phase = 'lobby'; hostSeen = performance.now();
    $('roomcode').textContent = code;
    show('lobby'); $('msg').textContent = '';
    net.toHost({ t: 'hello', name: myName(), color: S.color });
  } catch (e) { net = null; $('msg').textContent = e.message; }
  busy(false);
};
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('join').click(); });
$('startbtn').onclick = () => hostStart(0);
$('nextbtn').onclick = () => {
  if (!S.isHost) return;
  if (S.flightNo >= MAPS.length - 1) {
    for (const p of hostP.values()) p.total = 0;
    if (net) { broadcast({ t: 'roster', players: hostRoster() }); broadcast({ t: 'lobby' }); } else hostStart(0);
  } else hostStart(S.flightNo + 1);
};
$('leave1').onclick = $('leave2').onclick = () => leave('');

function leave(msg) {
  cdToken++;
  if (net) { net.onHostLost = () => {}; net.close(); net = null; }
  if (flight) { flight.dispose(); flight = null; }
  hostP.clear(); S.isHost = false; S.phase = 'menu'; S.players = []; timerOn = false;
  $('msg').textContent = msg || '';
  show('menu');
}

function renderLobby() {
  $('plist').innerHTML = S.players.map((p) => `<div class="prow"><span class="dot" style="background:${p.color}"></span>${p.bot ? '🤖 ' : ''}${esc(p.name)}${p.id === S.myId ? ' (you)' : ''}</div>`).join('');
  const nb = S.players.filter((p) => p.bot).length;
  $('lobbybots').classList.toggle('hide', !S.isHost);
  document.querySelectorAll('#lobbybotpick button').forEach((b) => b.classList.toggle('sel', +b.dataset.n === nb));
  $('startbtn').classList.toggle('hide', !S.isHost);
  $('waithost').classList.toggle('hide', S.isHost);
  $('lobbyhint').textContent = S.isHost ? 'Tell the other pilots this code.' : 'You are in!';
}

// ---------- host side ----------
function beginHost(code) {
  S.isHost = true; S.myId = 'host'; S.phase = 'lobby'; hostP.clear();
  $('roomcode').textContent = code || '';
  $('msg').textContent = '';
  if (code) show('lobby');
  hostHandle('host', { t: 'hello', name: myName(), color: S.color });
}
function broadcast(m) { if (net) net.broadcast(m); clientHandle(m); }
function sendHost(m) { if (S.isHost) hostHandle('host', m); else if (net) net.toHost(m); }
function hostRoster() { return [...hostP.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, total: p.total, bot: !!p.bot, skill: p.skill })); }
function hostSetBots(n) {
  for (const p of [...hostP.values()]) if (p.bot) hostP.delete(p.id);
  const humans = hostP.size;
  n = Math.max(0, Math.min(n, BOTS.length, MAX_PLAYERS - humans));
  const used = new Set([...hostP.values()].map((p) => p.color));
  const free = COLORS.filter((c) => !used.has(c));
  for (let i = 0; i < n; i++) {
    hostP.set('bot' + i, { id: 'bot' + i, bot: true, name: BOTS[i][0], skill: BOTS[i][1], color: free[i % free.length] || COLORS[i],
      total: 0, cur: { pts: 0, done: false, fin: false, time: 0 }, d: null, seen: 0 });
  }
  broadcast({ t: 'roster', players: hostRoster() });
}

function hostHandle(id, m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'hello') {
    if (hostP.has(id)) return;
    if (hostP.size >= MAX_PLAYERS) {
      // make room by dropping a bot, if we are still in the lobby
      const bot = S.phase === 'lobby' && [...hostP.values()].reverse().find((p) => p.bot);
      if (bot) hostP.delete(bot.id); else { net.toGuest(id, { t: 'full' }); return; }
    }
    const inFlight = S.phase === 'flight';
    hostP.set(id, {
      id, name: String(m.name || 'Pilot').slice(0, 12), color: COLORS.includes(m.color) ? m.color : COLORS[0],
      total: 0, cur: { pts: 0, done: inFlight, fin: false, time: 0 }, d: null, seen: performance.now(),
    });
    if (id !== 'host') net.toGuest(id, { t: 'welcome', id, phase: S.phase });
    broadcast({ t: 'roster', players: hostRoster() });
    return;
  }
  const p = hostP.get(id);
  if (!p) return;
  p.seen = performance.now();
  if (m.t === 'pos' && Array.isArray(m.d)) {
    p.d = m.d.slice(0, 5).map(Number);
  } else if (m.t === 'done' && S.phase === 'flight' && !p.cur.done) {
    p.cur = { done: true, fin: !!m.fin, time: +m.time || 999, pts: Math.max(0, Math.min(9999, m.pts | 0)) };
    hostCheck();
  }
}
function hostLeave(id) {
  if (!hostP.delete(id)) return;
  broadcast({ t: 'gone', id });
  broadcast({ t: 'roster', players: hostRoster() });
  hostCheck();
}
function hostStart(n) {
  for (const p of hostP.values()) { p.cur = { pts: 0, done: false, fin: false, time: 0 }; p.d = null; }
  hostDeadline = performance.now() + (4 + FLIGHT_TIME + 5) * 1000;
  broadcast({ t: 'start', flight: n, players: hostRoster() });
}
function hostCheck() {
  if (S.phase === 'flight' && [...hostP.values()].every((p) => p.cur.done)) hostResults();
}
function hostResults() {
  const ps = [...hostP.values()];
  const fins = ps.filter((p) => p.cur.fin).sort((a, b) => a.cur.time - b.cur.time);
  const rows = ps.map((p) => {
    const place = fins.indexOf(p);
    const bonus = place >= 0 ? BONUS[place] ?? 10 : 0;
    const score = place >= 0 ? p.cur.pts + bonus : 0;
    p.total += score;
    return { id: p.id, name: p.name, color: p.color, fin: place >= 0, place: place + 1, pts: p.cur.pts, bonus, score, total: p.total };
  });
  rows.sort((a, b) => b.total - a.total);
  broadcast({ t: 'results', flight: S.flightNo, rows, final: S.flightNo >= MAPS.length - 1 });
}

// ---------- every player ----------
function clientHandle(m) {
  if (!m || typeof m !== 'object') return;
  hostSeen = performance.now();
  switch (m.t) {
    case 'welcome': S.myId = m.id; if (m.phase !== 'lobby') { S.phase = 'wait'; show('wait'); } break;
    case 'full': leave('That game is full.'); break;
    case 'roster': S.players = m.players; renderLobby(); break;
    case 'gone': if (flight) flight.removeRemote(m.id); break;
    case 'start': startFlight(m); break;
    case 'pos':
      S.lastPos = m.p;
      if (flight) for (const id in m.p) if (id !== S.myId) flight.setRemote(id, m.p[id]);
      break;
    case 'results': showResults(m); break;
    case 'lobby': S.phase = 'lobby'; if (flight) { flight.dispose(); flight = null; } show('lobby'); renderLobby(); break;
  }
}

function startFlight(m) {
  S.phase = 'flight'; S.flightNo = m.flight; S.players = m.players; S.lastPos = {};
  done = false; timerOn = false;
  for (const k in input) input[k] = false;
  if (flight) flight.dispose();
  flight = new Flight(engine, m.flight, m.players, S.myId, {
    onPickup: (pts, ring) => beep(ring ? 1320 : 880, ring ? 0.2 : 0.08),
    onFinish: () => finish(true),
    onBotDone: (id, fin, pts) => hostHandle(id, { t: 'done', fin, time: (performance.now() - tStart) / 1000, pts }),
    isHost: S.isHost, timeLimit: FLIGHT_TIME,
    low: LOW,
  });
  flight.input = input;
  const map = MAPS[m.flight];
  $('mapname').textContent = `${map.emoji} ${m.flight + 1}/${MAPS.length}`;
  $('timer').textContent = fmt(FLIGHT_TIME); $('timer').classList.remove('low');
  $('score').textContent = '0';
  // wind panel, highest layer on top
  $('wind').innerHTML = map.winds.map((w, i) => {
    const deg = (Math.atan2(w.wx, w.wz) * 180) / Math.PI;
    const word = w.wz < 0 ? 'HEADWIND' : w.wz >= 6 ? 'FAST' : w.wz >= 3 ? 'GOOD' : 'SLOW';
    return `<div class="wrow${w.wz < 0 ? ' back' : ''}" data-l="${i}"><span class="warrow" style="transform:rotate(${deg}deg)">↑</span>${word}</div>`;
  }).reverse().join('');
  $('track').innerHTML = m.players.map((p) => `<div class="pdot${p.id === S.myId ? ' me' : ''}" data-id="${p.id}" style="background:${p.color};left:0%"></div>`).join('');
  show('hud');
  engine.resize();

  const token = ++cdToken;
  const big = $('bigtext');
  big.innerHTML = `<small>Flight ${m.flight + 1} of ${MAPS.length}</small>${esc(map.name)}`;
  const steps = ['3', '2', '1', 'GO!'];
  steps.forEach((s, i) => setTimeout(() => {
    if (token !== cdToken) return;
    big.textContent = s; beep(i === 3 ? 990 : 520, i === 3 ? 0.4 : 0.15);
    if (i === 3) {
      flight.start(); tStart = performance.now(); timerOn = true;
      setTimeout(() => { if (token === cdToken && !done) big.textContent = ''; }, 900);
    }
  }, 1500 + i * 900));
}

function finish(fin) {
  if (done) return;
  done = true;
  const time = (performance.now() - tStart) / 1000;
  flight.stop();
  $('bigtext').innerHTML = fin ? 'FINISH!<small>Waiting for the other pilots...</small>' : "TIME'S UP!<small>You did not reach the finish.</small>";
  if (fin) { beep(660, 0.15); setTimeout(() => beep(990, 0.3), 150); } else beep(200, 0.5);
  sendHost({ t: 'done', fin, time, pts: flight.pts });
}

function fmt(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

function hud() {
  if (timerOn) {
    const left = FLIGHT_TIME - (performance.now() - tStart) / 1000;
    if (!done) {
      $('timer').textContent = fmt(left);
      $('timer').classList.toggle('low', left <= 20);
      if (left <= 0) finish(false);
    }
    if (left <= 0 && S.isHost) flight.botsTimeUp();
  }
  $('score').textContent = flight.pts;
  document.querySelectorAll('.wrow').forEach((r) => r.classList.toggle('on', +r.dataset.l === flight.layer));
  document.querySelectorAll('.pdot').forEach((d) => {
    const id = d.dataset.id;
    const z = id === S.myId ? flight.pos.z : S.lastPos[id] ? S.lastPos[id][2] : 0;
    d.style.left = Math.max(0, Math.min(100, (z / L) * 100)) + '%';
  });
}

function showResults(m) {
  S.phase = 'results'; timerOn = false; cdToken++;
  $('bigtext').textContent = '';
  $('rtitle').textContent = m.final ? 'Final results' : `${MAPS[m.flight].emoji} ${MAPS[m.flight].name} results`;
  const top = m.rows[0];
  $('winner').textContent = m.final && top ? `🏆 ${top.name} wins!` : '';
  const medal = ['', '🥇', '🥈', '🥉'];
  $('rtable').innerHTML = '<tr><th></th><th></th><th>Collected</th><th>Finish bonus</th><th>Flight</th><th>Total</th></tr>' +
    m.rows.map((r) => `<tr class="${r.id === S.myId ? 'me' : ''}"><td><span class="dot" style="display:inline-block;background:${r.color}"></span></td><td>${esc(r.name)}</td>` +
      (r.fin ? `<td>${r.pts}</td><td>${medal[r.place] || r.place + 'th'} +${r.bonus}</td><td>${r.score}</td>`
        : `<td class="dnf" colspan="3">Did not finish (0)</td>`) + `<td>${r.total}</td></tr>`).join('');
  $('nextbtn').classList.toggle('hide', !S.isHost);
  $('waitnext').classList.toggle('hide', S.isHost);
  $('nextbtn').textContent = m.final ? 'Play again' : `Next flight: ${MAPS[m.flight + 1].name}`;
  show('results');
  if (m.final) [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.25), i * 160));
}

// ---------- loops ----------
engine.runRenderLoop(() => {
  if (!flight) return;
  const dt = Math.min(0.05, engine.getDeltaTime() / 1000);
  flight.update(dt);
  flight.scene.render();
  if (S.phase === 'flight') hud();
});

setInterval(() => {
  if (S.phase !== 'flight' || !flight) return;
  const p = flight.pos;
  sendHost({ t: 'pos', d: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1), +flight.h.toFixed(2), flight.pts] });
  if (!S.isHost) return;
  const all = {};
  for (const q of hostP.values()) { if (q.bot) q.d = flight.botState(q.id); if (q.d) all[q.id] = q.d; }
  broadcast({ t: 'pos', p: all });
  if (performance.now() > hostDeadline) {
    for (const q of hostP.values()) q.cur.done = true;
    hostResults();
  }
}, 100);

// Heartbeat, so a closed tab or dropped connection is noticed quickly.
setInterval(() => {
  if (!net || S.phase === 'menu') return;
  const now = performance.now();
  if (S.isHost) {
    net.broadcast({ t: 'ping' });
    for (const q of [...hostP.values()]) if (q.id !== 'host' && !q.bot && now - q.seen > 10000) hostLeave(q.id);
  } else {
    net.toHost({ t: 'ping' });
    if (now - hostSeen > 20000) leave('Lost connection to the host.');
  }
}, 2000);
window.addEventListener('pagehide', () => { if (net) net.close(); });

// for testing from the console
window.__game = { S, get flight() { return flight; }, input };
