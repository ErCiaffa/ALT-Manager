'use strict';

const mineflayer         = require('mineflayer');
const config             = require('../config/config');
const logger             = require('../utils/logger');
const bus                = require('../core/bus');
const antiDetection      = require('../plugins/antiDetection');
const antiAfk            = require('../plugins/antiAfk');
const autoLogin          = require('../plugins/autoLogin');
const autoCommands       = require('../plugins/autoCommands');
const store              = require('../data/store');
const { registerEvents } = require('./events');

let _bot         = null;
let _reconnTimer = null;

// Opzioni dell'account attivo (aggiornate da API switch-account)
let _activeOpts = {};

function getBot() { return _bot; }

function createBot(overrides = {}) {
  if (_reconnTimer) { clearTimeout(_reconnTimer); _reconnTimer = null; }

  // Merge: priorità overrides > _activeOpts > config
  const opts = Object.assign({}, _activeOpts, overrides);

  const host     = opts.host     || config.server.host;
  const port     = opts.port     || config.server.port;
  const version  = opts.version  || config.server.version;
  const username = opts.username || config.account.username;
  const auth     = opts.auth     || config.account.auth;
  const mcPassword = opts.mcPassword || '';
  const commands   = opts.commands   || [];

  logger.info('[Manager] Connecting → ' + host + ':' + port +
              '  user=' + username + '  auth=' + auth + '  v=' + version);

  // Notifica dashboard: connessione in corso
  bus.emit('bot:status', { connected: false, event: 'connecting', host, username });

  _bot = mineflayer.createBot({ host, port, version, username, auth, keepAlive: false });

  const modules = store.getModuleStates();

  // ── Plugin obbligatori ─────────────────────────────────────────────────────
  _bot.loadPlugin(antiDetection);

  // ── Plugin opzionali ───────────────────────────────────────────────────────
  if (modules.afk !== false) {
    _bot.loadPlugin((bot) => antiAfk(bot, config.afk));
  }

  if (modules.autoLogin !== false && mcPassword) {
    _bot.loadPlugin((bot) => autoLogin(bot, { password: mcPassword }));
  }

  if (modules.autoCommands !== false && commands.length) {
    _bot.loadPlugin((bot) => autoCommands(bot, { commands }));
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  registerEvents(_bot, scheduleReconnect);

  return _bot;
}

/**
 * Passa al bot un nuovo account/server senza aspettare la riconnessione.
 * Chiamato da API POST /api/bot/connect
 */
function connectWith(opts) {
  _activeOpts = opts || {};
  if (_bot) {
    try { _bot.quit('Switching account'); } catch (_) {}
    _bot = null;
  }
  setTimeout(() => createBot(), 500);
}

/**
 * Hot-reload di un modulo — riconnette il bot con i nuovi stati.
 * Chiamato da API POST /api/modules/:name
 */
function reloadModule(name, enabled) {
  logger.info('[Manager] Modulo ' + name + ' → ' + (enabled ? 'ON' : 'OFF'));
  const opts = Object.assign({}, _activeOpts);
  if (_bot) {
    try { _bot.quit('Module reload'); } catch (_) {}
    _bot = null;
  }
  setTimeout(() => createBot(opts), 1200);
}

function scheduleReconnect() {
  if (!config.connection.reconnect) {
    logger.info('[Manager] Reconnect disabilitato — shutdown');
    return;
  }
  if (_reconnTimer) return;
  const delay = config.connection.reconnectDelay;
  logger.info('[Manager] Riconnessione tra ' + (delay / 1000) + 's…');
  _reconnTimer = setTimeout(() => {
    _reconnTimer = null;
    _bot = null;
    createBot();
  }, delay);
}

function destroyBot() {
  if (_reconnTimer) { clearTimeout(_reconnTimer); _reconnTimer = null; }
  if (_bot) { try { _bot.quit('Shutdown'); } catch (_) {} _bot = null; }
  logger.info('[Manager] Bot distrutto');
}

module.exports = { createBot, getBot, connectWith, reloadModule, destroyBot };