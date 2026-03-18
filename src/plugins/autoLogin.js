'use strict';

/**
 * autoLogin.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Rilevamento automatico del prompt di login (AuthMe / NLogin / ecc.) e invio
 * della password con timing realistico.
 *
 * Funziona ascoltando i messaggi di chat: se arriva un messaggio che contiene
 * keyword tipiche ("digita /login", "please login", "/login <password>", ecc.)
 * aspetta un delay umano e invia /login <password>.
 *
 * Se il server usa anche /register, viene gestito allo stesso modo.
 */

const logger = require('../utils/logger');
const { int, sleep } = require('../utils/random');

// Keyword che identificano richiesta di login (case-insensitive)
const LOGIN_TRIGGERS = [
  '/login', 'please login', 'effettuare l\'accesso',
  'entra con /l ', 'usa /login', 'type /login',
  'connecte-toi', 'logg dich ein',
];

const REGISTER_TRIGGERS = [
  '/register', 'please register', 'registrati',
  'type /register',
];

function autoLogin(bot, options = {}) {
  const { password = '', registerPassword = '' } = options;

  if (!password) {
    logger.warn('[AutoLogin] Nessuna password configurata — plugin disabilitato');
    return;
  }

  let loginDone    = false;
  let registerDone = false;

  bot.once('spawn', () => {
    loginDone    = false;
    registerDone = false;
  });

  bot.on('message', async (jsonMsg) => {
    const text = jsonMsg.toString().toLowerCase();

    // ── /register ─────────────────────────────────────────────────────────
    if (!registerDone && registerPassword && REGISTER_TRIGGERS.some(t => text.includes(t))) {
      registerDone = true;
      const delay = int(1200, 2500);
      logger.info('[AutoLogin] Rilevato prompt register — invio tra ' + delay + 'ms');
      await sleep(delay);
      bot.chat('/register ' + registerPassword + ' ' + registerPassword);
      logger.info('[AutoLogin] /register inviato');
      return;
    }

    // ── /login ─────────────────────────────────────────────────────────────
    if (!loginDone && LOGIN_TRIGGERS.some(t => text.includes(t))) {
      loginDone = true;
      const delay = int(800, 2000);
      logger.info('[AutoLogin] Rilevato prompt login — invio tra ' + delay + 'ms');
      await sleep(delay);
      bot.chat('/login ' + password);
      logger.info('[AutoLogin] /login inviato');
    }
  });

  logger.info('[AutoLogin] Plugin loaded ✓');
}

module.exports = autoLogin;