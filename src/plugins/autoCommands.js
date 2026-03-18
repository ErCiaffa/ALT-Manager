'use strict';

/**
 * autoCommands.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Esegue una sequenza di comandi dopo il login, con delay configurabili.
 * Utile per: /skyblock → /home, /spawn, accettare regole, ecc.
 *
 * Config example:
 *   commands: [
 *     { cmd: '/skyblock', delay: 3000 },  // 3s dopo il login
 *     { cmd: '/home',     delay: 5000 },  // 5s dopo il comando precedente
 *   ]
 */

const logger = require('../utils/logger');
const { int, sleep } = require('../utils/random');

// Jitter umano aggiunto a ogni delay: ±15% del delay configurato
const JITTER = 0.15;

function autoCommands(bot, options = {}) {
  const { commands = [], triggerAfterLogin = true } = options;

  if (!commands.length) {
    logger.info('[AutoCmd] Nessun comando configurato — plugin disabilitato');
    return;
  }

  let executed = false;

  async function runSequence() {
    if (executed) return;
    executed = true;

    logger.info('[AutoCmd] Avvio sequenza (' + commands.length + ' comandi)');

    for (const { cmd, delay = 2000 } of commands) {
      const jitter  = Math.floor(delay * JITTER);
      const actual  = delay + int(-jitter, jitter);
      logger.debug('[AutoCmd] Attendo ' + actual + 'ms poi → ' + cmd);
      await sleep(actual);
      bot.chat(cmd);
      logger.info('[AutoCmd] Eseguito: ' + cmd);
    }

    logger.info('[AutoCmd] Sequenza completata');
  }

  if (triggerAfterLogin) {
    // Aspetta un messaggio che contenga tipiche conferme di login
    const LOGIN_CONFIRM = ['loggato', 'logged in', 'login effettuato', 'autenticato', 'benvenuto'];

    bot.on('message', (jsonMsg) => {
      const text = jsonMsg.toString().toLowerCase();
      if (!executed && LOGIN_CONFIRM.some(t => text.includes(t))) {
        runSequence();
      }
    });

    // Fallback: se dopo 8s non arriva conferma, esegui comunque
    bot.once('spawn', () => {
      setTimeout(() => {
        if (!executed) {
          logger.debug('[AutoCmd] Nessuna conferma login ricevuta — eseguo comunque (fallback)');
          runSequence();
        }
      }, 8000);
    });
  } else {
    bot.once('spawn', runSequence);
  }

  // Reset ad ogni riconnessione
  bot.once('end', () => { executed = false; });

  logger.info('[AutoCmd] Plugin loaded ✓ — ' + commands.map(c => c.cmd).join(', '));
}

module.exports = autoCommands;