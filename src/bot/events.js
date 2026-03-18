'use strict';

const logger = require('../utils/logger');
const store  = require('../data/store');
const bus    = require('../core/bus');

function buildStatus(bot) {
  if (!bot || !bot.entity) return { connected: false };
  return {
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
  };
}

function registerEvents(bot, scheduleReconnect) {

  // ── Aggiorna status ogni 3 secondi (real-time dashboard) ──────────────────
  const statusInterval = setInterval(() => {
    bus.emit('bot:status', buildStatus(bot));
  }, 3000);

  // ── Spawn ──────────────────────────────────────────────────────────────────
  bot.once('spawn', () => {
    logger.info('[Bot] Spawned — pos: ' + JSON.stringify(bot.entity.position));
    bus.emit('bot:status', buildStatus(bot));
  });

  // ── Login ──────────────────────────────────────────────────────────────────
  bot.once('login', () => {
    logger.info('[Bot] Login — entity ID: ' + bot.entity.id);
    bus.emit('bot:status', buildStatus(bot));
  });

  // ── Chat → bus + store ─────────────────────────────────────────────────────
  bot.on('message', (jsonMsg) => {
    const text = jsonMsg.toString();
    if (!text.trim()) return;
    logger.debug('[Chat] ' + text);
    const entry = { ts: Date.now(), text };
    store.appendChat(entry);
    bus.emit('bot:chat', entry);
  });

  // ── Health/Food ────────────────────────────────────────────────────────────
  bot.on('health', () => {
    logger.debug('[Bot] HP: ' + bot.health + ' | Food: ' + bot.food);
    bus.emit('bot:status', buildStatus(bot));
  });

  // ── Death ──────────────────────────────────────────────────────────────────
  bot.on('death', () => {
    logger.warn('[Bot] Morto — respawn');
    bus.emit('bot:status', { connected: true, event: 'death' });
    bot.respawn();
  });

  // ── Kicked ─────────────────────────────────────────────────────────────────
  bot.on('kicked', (reason) => {
    logger.warn('[Bot] Kickato: ' + reason);
    clearInterval(statusInterval);
    bus.emit('bot:status', { connected: false, event: 'kicked', reason: String(reason) });
    scheduleReconnect();
  });

  // ── Error ──────────────────────────────────────────────────────────────────
  bot.on('error', (err) => {
    logger.error('[Bot] Errore: ' + err.message);
    bus.emit('bot:status', { connected: false, event: 'error', reason: err.message });
  });

  // ── End ────────────────────────────────────────────────────────────────────
  bot.on('end', (reason) => {
    logger.warn('[Bot] Disconnesso: ' + reason);
    clearInterval(statusInterval);
    bus.emit('bot:status', { connected: false, event: 'end', reason: String(reason) });
    scheduleReconnect();
  });

  // ── Comandi in arrivo dalla dashboard via bus ──────────────────────────────
  bus.on('bot:cmd', ({ type, payload }) => {
    if (type === 'chat') {
      const msg = String(payload || '').trim().slice(0, 256);
      if (msg && bot) {
        try { bot.chat(msg); } catch (_) {}
        logger.info('[Bot] Chat da dashboard: ' + msg);
      }
    }
  });
}

module.exports = { registerEvents };