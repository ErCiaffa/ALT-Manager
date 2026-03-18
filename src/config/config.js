'use strict';

require('dotenv').config();

const config = {

  // ── Server Minecraft ───────────────────────────────────────────────────────
  server: {
    host:    process.env.MC_HOST    || 'localhost',
    port:    parseInt(process.env.MC_PORT || '25565', 10),
    version: process.env.MC_VERSION || '1.21.4',
  },

  // ── Account Minecraft ──────────────────────────────────────────────────────
  account: {
    auth:     process.env.MC_AUTH     || 'offline',
    username: process.env.MC_USERNAME || 'AltBot',
  },

  // ── Connessione ────────────────────────────────────────────────────────────
  connection: {
    reconnect:      process.env.RECONNECT === 'true',
    reconnectDelay: parseInt(process.env.RECONNECT_DELAY || '5000', 10),
  },

  // ── Web Dashboard ──────────────────────────────────────────────────────────
  web: {
    port:        parseInt(process.env.WEB_PORT || '3000', 10),
    secret:      process.env.WEB_SECRET      || 'changeme-jwt-secret',
    password:    process.env.WEB_PASSWORD    || '',   // bcrypt hash oppure plaintext al primo avvio
    tokenExpiry: process.env.WEB_TOKEN_EXPIRY || '24h',
  },

  // ── Logging ────────────────────────────────────────────────────────────────
  log: {
    level: process.env.LOG_LEVEL || 'info',
  },

  // ── Anti-AFK ───────────────────────────────────────────────────────────────
  afk: {
    enabled: process.env.AFK_ENABLED !== 'false',
    lookAround: {
      enabled:     process.env.AFK_LOOK     !== 'false',
      intervalMin: parseInt(process.env.AFK_LOOK_MIN    || '4000',   10),
      intervalMax: parseInt(process.env.AFK_LOOK_MAX    || '12000',  10),
    },
    swingArm: {
      enabled:     process.env.AFK_SWING    !== 'false',
      intervalMin: parseInt(process.env.AFK_SWING_MIN   || '8000',   10),
      intervalMax: parseInt(process.env.AFK_SWING_MAX   || '25000',  10),
    },
    sneak: {
      enabled:     process.env.AFK_SNEAK    !== 'false',
      intervalMin: parseInt(process.env.AFK_SNEAK_MIN   || '20000',  10),
      intervalMax: parseInt(process.env.AFK_SNEAK_MAX   || '60000',  10),
    },
    jump: {
      enabled:     process.env.AFK_JUMP     !== 'false',
      intervalMin: parseInt(process.env.AFK_JUMP_MIN    || '30000',  10),
      intervalMax: parseInt(process.env.AFK_JUMP_MAX    || '90000',  10),
    },
    rotate360: {
      enabled:     process.env.AFK_ROTATE   !== 'false',
      intervalMin: parseInt(process.env.AFK_ROTATE_MIN  || '120000', 10),
      intervalMax: parseInt(process.env.AFK_ROTATE_MAX  || '300000', 10),
    },
  },

};

// ── Validation ─────────────────────────────────────────────────────────────
(function validate(cfg) {
  if (!cfg.server.host)       throw new Error('[Config] MC_HOST is required');
  if (isNaN(cfg.server.port)) throw new Error('[Config] MC_PORT must be a number');
  if (!['microsoft', 'offline'].includes(cfg.account.auth))
    throw new Error('[Config] MC_AUTH must be "microsoft" or "offline"');
  if (!cfg.web.password)
    throw new Error('[Config] WEB_PASSWORD is required — set it in .env');
}(config));

module.exports = config;