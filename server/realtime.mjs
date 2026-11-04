/*
  The mela's little realtime server: who is where (positions relayed at 10 Hz), waves, shared
  wish lanterns, the leaderboards and the wish wall. Plain JSON over WebSocket, one shared room.
  Runs inside `vite dev`/`vite preview` (attach) or on its own (`node server/realtime.mjs`).
  Scores and wishes persist in server/data.json.
*/
import { WebSocketServer } from 'ws';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, 'data.json');
const BOARDS = { golgappa: 'desc', lap: 'asc', striker: 'desc' };
const MAX_WISHES = 200;
const TICK_MS = 100;

const store = loadStore();
const clients = new Map(); // id -> { ws, state, name, handle, seenAt }
let nextId = 1;
let saveTimer = null;

function loadStore() {
  try {
    const s = JSON.parse(readFileSync(DATA, 'utf8'));
    return { boards: { golgappa: [], lap: [], striker: [], ...(s.boards || {}) }, wishes: Array.isArray(s.wishes) ? s.wishes : [] };
  } catch {
    return { boards: { golgappa: [], lap: [], striker: [] }, wishes: [] };
  }
}

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      mkdirSync(HERE, { recursive: true });
      writeFileSync(DATA, JSON.stringify(store));
    } catch (e) {
      console.warn('[mela] could not save data.json:', e.message);
    }
  }, 500);
}

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
const num = (v, lo, hi) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : 0);

function publicPlayer(id, c) {
  return { id, n: c.name, h: c.handle, look: c.look, mic: !!c.mic, ...c.state };
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(msg, except = null) {
  const s = JSON.stringify(msg);
  for (const [id, c] of clients) if (id !== except && c.ws.readyState === 1) c.ws.send(s);
}

function recordScore(kind, value, name, handle) {
  if (!(kind in BOARDS)) return false;
  const board = store.boards[kind];
  const key = handle || name;
  const prev = board.find((e) => (e.handle || e.name) === key);
  const better = (a, b) => (BOARDS[kind] === 'asc' ? a < b : a > b);
  if (prev) {
    if (!better(value, prev.value)) return false;
    prev.value = value;
    prev.name = name;
    prev.at = Date.now();
  } else {
    board.push({ name, handle, value, at: Date.now() });
  }
  board.sort((a, b) => (BOARDS[kind] === 'asc' ? a.value - b.value : b.value - a.value));
  board.length = Math.min(board.length, 20);
  saveSoon();
  return true;
}

function handleMessage(id, c, raw) {
  let m;
  try {
    m = JSON.parse(raw);
  } catch {
    return;
  }
  switch (m.t) {
    case 'hello':
      c.name = clean(m.name, 24) || 'Visitor';
      c.handle = clean(m.handle, 40).replace(/^@/, '');
      c.look = m.look && typeof m.look === 'object' ? m.look : null;
      send(c.ws, {
        t: 'welcome',
        id,
        players: [...clients].filter(([pid]) => pid !== id).map(([pid, pc]) => publicPlayer(pid, pc)),
        boards: store.boards,
        wishes: store.wishes.slice(-60),
      });
      broadcast({ t: 'join', p: publicPlayer(id, c) }, id);
      break;
    case 'state':
      c.state = {
        x: num(m.x, -400, 400),
        y: num(m.y, -10, 300),
        z: num(m.z, -400, 400),
        r: num(m.r, -10, 10),
        a: m.a ? clean(m.a, 16) : null,
        s: num(m.s, 0, 60),
        hr: m.hr ? clean(m.hr, 8) : null,
        v: m.v ? clean(m.v, 8) : null,
      };
      c.seenAt = Date.now();
      break;
    case 'look':
      c.look = m.look && typeof m.look === 'object' ? m.look : c.look;
      c.name = clean(m.name, 24) || c.name;
      c.handle = clean(m.handle, 40).replace(/^@/, '');
      broadcast({ t: 'look', id, look: c.look, n: c.name, h: c.handle }, id);
      break;
    case 'wave': {
      const to = clients.get(+m.to);
      if (to) send(to.ws, { t: 'wave', from: id, n: c.name });
      break;
    }
    case 'bubble':
      broadcast({ t: 'bubble', id, text: clean(m.text, 60) }, id);
      break;
    case 'lantern': {
      const text = clean(m.text, 60) || 'Happy Diwali!';
      broadcast({ t: 'lantern', id, text, x: num(m.x, -400, 400), y: num(m.y, -10, 300), z: num(m.z, -400, 400), dx: num(m.dx, -1, 1), dz: num(m.dz, -1, 1) }, id);
      store.wishes.push({ name: c.name, handle: c.handle, text, at: Date.now() });
      if (store.wishes.length > MAX_WISHES) store.wishes.splice(0, store.wishes.length - MAX_WISHES);
      saveSoon();
      broadcast({ t: 'wish', w: store.wishes[store.wishes.length - 1] });
      break;
    }
    case 'rtc': {
      // WebRTC offers/answers/candidates between two visitors; the server only forwards them
      const to = clients.get(+m.to);
      if (to && m.data && typeof m.data === 'object') send(to.ws, { t: 'rtc', from: id, data: m.data });
      break;
    }
    case 'mic':
      c.mic = !!m.on;
      broadcast({ t: 'mic', id, on: c.mic }, id);
      break;
    case 'score':
      if (recordScore(clean(m.kind, 16), num(m.value, 0, 1e9), c.name, c.handle)) broadcast({ t: 'boards', boards: store.boards });
      break;
  }
}

/** Shares one http server with Vite (or anything else) and answers WebSocket upgrades on /ws. */
export function attachRealtime(httpServer, path = '/ws') {
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== path) return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  wire(wss);
  return wss;
}

function wire(wss) {
  wss.on('connection', (ws) => {
    const id = nextId++;
    const c = { ws, state: {}, name: 'Visitor', handle: '', look: null, seenAt: Date.now() };
    clients.set(id, c);
    ws.on('message', (raw) => handleMessage(id, c, raw));
    ws.on('close', () => {
      clients.delete(id);
      broadcast({ t: 'leave', id });
    });
    ws.on('error', () => {});
  });
  setInterval(() => {
    if (!clients.size) return;
    const players = [...clients].map(([id, c]) => ({ id, ...c.state }));
    broadcast({ t: 'snap', players, n: clients.size });
  }, TICK_MS);
}

export function startStandalone(port = Number(process.env.PORT) || 8787) {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.end(`Topmate Diwali Mela realtime · ${clients.size} online`);
  });
  attachRealtime(server);
  server.listen(port, () => console.log(`[mela] realtime server on ws://localhost:${port}/ws`));
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) startStandalone();
