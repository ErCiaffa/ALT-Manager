'use strict';

/**
 * api.js — Tutti gli endpoint REST della dashboard.
 *
 * POST   /api/login
 * POST   /api/logout
 * GET    /api/status
 * POST   /api/bot/connect        ← NUOVO: connetti con account/server scelto
 * POST   /api/bot/disconnect     ← NUOVO
 * POST   /api/chat
 * GET    /api/modules
 * POST   /api/modules/:name
 * GET    /api/accounts
 * POST   /api/accounts
 * DELETE /api/accounts/:id
 * GET    /api/servers
 * POST   /api/servers
 * DELETE /api/servers/:id
 * GET    /api/chatlog
 */

const router   = require('express').Router();
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

const { signToken, checkPassword, requireAuth } = require('../auth');
const store  = require('../../data/store');
const logger = require('../../utils/logger');
const bus    = require('../../core/bus');

// Il manager viene iniettato da index.js dopo il boot
let _manager = null;
function setManager(m) { _manager = m; }

// ── Rate limit login ─────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { error: 'Troppi tentativi — riprova tra 15 minuti' },
});

// ── POST /api/login ──────────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password mancante' });

  const ok = await checkPassword(password);
  if (!ok) {
    logger.warn('[API] Login fallito da ' + req.ip);
    return res.status(401).json({ error: 'Password errata' });
  }
  const token = signToken();
  res.cookie('token', token, { httpOnly: true, sameSite: 'strict', maxAge: 24 * 60 * 60 * 1000 });
  logger.info('[API] Login dashboard da ' + req.ip);
  res.json({ ok: true, token });
});

// ── POST /api/logout ─────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// ── GET /api/status ──────────────────────────────────────────────────────────
router.get('/status', requireAuth, (req, res) => {
  const bot = _manager?.getBot();
  if (!bot || !bot.entity) return res.json({ connected: false });
  res.json({
    connected:  true,
    username:   bot.username,
    health:     Math.round(bot.health * 10) / 10,
    food:       bot.food,
    saturation: Math.round((bot.foodSaturation || 0) * 10) / 10,
    position: {
      x: Math.round(bot.entity.position.x * 100) / 100,
      y: Math.round(bot.entity.position.y * 100) / 100,
      z: Math.round(bot.entity.position.z * 100) / 100,
    },
    dimension: bot.game?.dimension || 'unknown',
    ping:      bot._client?.latency || 0,
  });
});

// ── POST /api/bot/connect ────────────────────────────────────────────────────
// Body: { accountId, serverId }
// Legge le credenziali dallo store e avvia la connessione
router.post('/bot/connect', requireAuth, (req, res) => {
  const { accountId, serverId } = req.body || {};
  const data = store.getAccounts();

  const account = data.accounts.find(a => a.id === accountId);
  const server  = data.servers.find(s => s.id === serverId);

  if (!account) return res.status(404).json({ error: 'Account non trovato' });
  if (!server)  return res.status(404).json({ error: 'Server non trovato' });

  logger.info('[API] Connect richiesto: ' + account.username + ' → ' + server.host);

  _manager?.connectWith({
    host:       server.host,
    port:       server.port,
    version:    server.version,
    username:   account.username,
    auth:       account.auth,
    mcPassword: account.mcPassword || '',
    commands:   account.commands   || [],
  });

  res.json({ ok: true, account: account.username, server: server.host });
});

// ── POST /api/bot/disconnect ─────────────────────────────────────────────────
router.post('/bot/disconnect', requireAuth, (req, res) => {
  const bot = _manager?.getBot();
  if (!bot) return res.json({ ok: true, note: 'Bot già disconnesso' });
  try { bot.quit('Dashboard disconnect'); } catch (_) {}
  logger.info('[API] Disconnessione richiesta da dashboard');
  res.json({ ok: true });
});

// ── POST /api/chat ────────────────────────────────────────────────────────────
router.post('/chat', requireAuth, (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== 'string')
    return res.status(400).json({ error: 'Messaggio non valido' });
  const msg = message.trim().slice(0, 256);
  if (!msg) return res.status(400).json({ error: 'Messaggio vuoto' });

  bus.emit('bot:cmd', { type: 'chat', payload: msg });
  res.json({ ok: true });
});

// ── GET /api/modules ──────────────────────────────────────────────────────────
router.get('/modules', requireAuth, (req, res) => {
  res.json(store.getModuleStates());
});

// ── POST /api/modules/:name ───────────────────────────────────────────────────
router.post('/modules/:name', requireAuth, (req, res) => {
  const { name } = req.params;
  const { enabled } = req.body || {};
  const ALLOWED = ['afk', 'autoLogin', 'autoCommands'];
  if (!ALLOWED.includes(name))
    return res.status(400).json({ error: 'Modulo non valido' });

  const states = store.getModuleStates();
  states[name] = !!enabled;
  store.saveModuleStates(states);
  bus.emit('bot:modules', states);

  // Ricrea il bot con i nuovi stati
  _manager?.reloadModule(name, !!enabled);

  logger.info('[API] Modulo ' + name + ' → ' + (enabled ? 'ON' : 'OFF'));
  res.json({ ok: true, [name]: !!enabled });
});

// ── GET /api/accounts ─────────────────────────────────────────────────────────
router.get('/accounts', requireAuth, (req, res) => {
  const data = store.getAccounts();
  const safe = data.accounts.map(({ mcPassword, ...rest }) => rest);
  res.json({ accounts: safe, servers: data.servers });
});

// ── POST /api/accounts ────────────────────────────────────────────────────────
router.post('/accounts', requireAuth, (req, res) => {
  const { username, mcPassword, auth = 'offline' } = req.body || {};
  if (!username) return res.status(400).json({ error: 'Username obbligatorio' });

  const data = store.getAccounts();
  if (data.accounts.find(a => a.username === username))
    return res.status(409).json({ error: 'Account già presente' });

  const account = { id: uuidv4(), username, mcPassword: mcPassword || '', auth, commands: [] };
  data.accounts.push(account);
  store.saveAccounts(data);
  logger.info('[API] Account aggiunto: ' + username);

  const { mcPassword: _, ...safe } = account;
  res.json({ ok: true, account: safe });
});

// ── DELETE /api/accounts/:id ──────────────────────────────────────────────────
router.delete('/accounts/:id', requireAuth, (req, res) => {
  const data = store.getAccounts();
  const before = data.accounts.length;
  data.accounts = data.accounts.filter(a => a.id !== req.params.id);
  if (data.accounts.length === before)
    return res.status(404).json({ error: 'Account non trovato' });
  store.saveAccounts(data);
  res.json({ ok: true });
});

// ── GET /api/servers ──────────────────────────────────────────────────────────
router.get('/servers', requireAuth, (req, res) => {
  res.json(store.getAccounts().servers);
});

// ── POST /api/servers ─────────────────────────────────────────────────────────
router.post('/servers', requireAuth, (req, res) => {
  const { host, port = 25565, version = '1.21.4', label = '' } = req.body || {};
  if (!host) return res.status(400).json({ error: 'Host obbligatorio' });

  const data = store.getAccounts();
  const server = { id: uuidv4(), host, port: parseInt(port, 10), version, label: label || host };
  data.servers.push(server);
  store.saveAccounts(data);
  logger.info('[API] Server aggiunto: ' + host);
  res.json({ ok: true, server });
});

// ── DELETE /api/servers/:id ───────────────────────────────────────────────────
router.delete('/servers/:id', requireAuth, (req, res) => {
  const data = store.getAccounts();
  const before = data.servers.length;
  data.servers = data.servers.filter(s => s.id !== req.params.id);
  if (data.servers.length === before)
    return res.status(404).json({ error: 'Server non trovato' });
  store.saveAccounts(data);
  res.json({ ok: true });
});

// ── GET /api/chatlog ──────────────────────────────────────────────────────────
router.get('/chatlog', requireAuth, (req, res) => {
  res.json(store.getChatLog());
});

module.exports = { router, setManager };