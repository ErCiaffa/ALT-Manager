'use strict';

require('dotenv').config();

const logger   = require('./src/utils/logger');
const manager  = require('./src/bot/manager');
const { startWebServer }  = require('./src/web/server');
const { setManager }      = require('./src/web/routes/api');

logger.info('=== ALT Manager v1.0.0 starting ===');

// ── Inietta il manager nell'API (unico punto di wiring) ─────────────────────
setManager(manager);

// ── Avvia web dashboard ──────────────────────────────────────────────────────
startWebServer();

// ── Avvia bot con config di default ─────────────────────────────────────────
manager.createBot();

// ── Graceful shutdown ────────────────────────────────────────────────────────
function shutdown(signal) {
  logger.info('[Main] ' + signal + ' — shutdown');
  manager.destroyBot();
  setTimeout(() => process.exit(0), 600);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error('[Main] Unhandled rejection: ' + reason);
});