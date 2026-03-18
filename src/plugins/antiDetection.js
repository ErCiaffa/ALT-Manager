'use strict';

/**
 * antiDetection.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Mineflayer inject-plugin che:
 *  0. Sopprime PartialReadError su packet_world_particles (bug protodef/1.21.x)
 *  1. Brand spoof     — sostituisce "mineflayer" con "vanilla"
 *  2. IsBot flag      — rimuove il bit IsBot dall'entity-metadata (MC 1.21+)
 *  3. Locale/settings — invia un packet settings realistico
 *  4. Keep-alive jitter — risponde con 1-3 ms di delay invece di 0 ms
 */

const logger = require('../utils/logger');

/** Writes a VarInt into a buffer; returns bytes written */
function writeVarInt(value, buf, offset = 0) {
  let n = offset;
  do {
    let byte = value & 0x7f;
    value >>>= 7;
    if (value !== 0) byte |= 0x80;
    buf[n++] = byte;
  } while (value !== 0);
  return n - offset;
}

// ── Soppressione globale stderr per PartialReadError particelle ───────────────
// protodef scrive direttamente su stderr; patch una sola volta per processo.
if (!process._amParticleErrPatched) {
  process._amParticleErrPatched = true;
  const _stderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = function (chunk, ...args) {
    const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    // Sopprime solo gli stack trace di PartialReadError legati alle particelle
    if (
      str.includes('PartialReadError') ||
      str.includes('packet_world_particles') ||
      str.includes('Read error for undefined')
    ) {
      return true; // silenzioso
    }
    return _stderrWrite(chunk, ...args);
  };
}

// ── Plugin ────────────────────────────────────────────────────────────────────
function antiDetection(bot) {

  // ── 0. Soppressione PartialReadError a livello client ────────────────────────
  // node-minecraft-protocol emette 'error' sul client per ogni packet malformato.
  // Intercettiamo prima che raggiunga il handler di mineflayer.
  bot._client.on('error', (err) => {
    if (err && (err.name === 'PartialReadError' || (err.message || '').includes('PartialReadError'))) {
      logger.debug('[AntiDetect] PartialReadError soppressa (particella sconosciuta v1.21.x)');
      return; // non propagare
    }
    // Tutti gli altri errori li riemettiamo normalmente
    bot.emit('error', err);
  });

  // ── 1. Brand spoof ──────────────────────────────────────────────────────────
  const _write = bot._client.write.bind(bot._client);
  bot._client.write = function (name, params) {
    if (name === 'plugin_message' && params.channel === 'minecraft:brand') {
      const brand    = 'vanilla';
      const brandBuf = Buffer.from(brand, 'utf8');
      const lenBuf   = Buffer.alloc(5);
      const lenBytes = writeVarInt(brandBuf.length, lenBuf);
      params = {
        channel: 'minecraft:brand',
        data: Buffer.concat([lenBuf.slice(0, lenBytes), brandBuf]),
      };
      logger.debug('[AntiDetect] Brand spoofed → vanilla');
    }
    return _write(name, params);
  };

  // ── 2. IsBot entity-metadata suppression ────────────────────────────────────
  bot._client.on('entity_metadata', (packet) => {
    if (!bot.entity || packet.entityId !== bot.entity.id) return;
    const before = (packet.metadata || []).length;
    packet.metadata = (packet.metadata || []).filter((entry) => entry.key !== 21);
    if (packet.metadata.length < before) {
      logger.debug('[AntiDetect] IsBot metadata rimossa');
    }
  });

  // ── 3. Realistic client settings ────────────────────────────────────────────
  bot.once('login', () => {
    try {
      bot._client.write('settings', {
        locale:              'en_GB',
        viewDistance:        10,
        chatFlags:           0,
        chatColors:          true,
        skinParts:           0x7f,
        mainHand:            1,
        enableTextFiltering: false,
        enableServerListing: true,
      });
      logger.debug('[AntiDetect] Client settings inviati');
    } catch (err) {
      logger.debug('[AntiDetect] Settings packet non supportato: ' + err.message);
    }
  });

  // ── 4. Keep-alive jitter ────────────────────────────────────────────────────
  bot._client.on('keep_alive', (packet) => {
    const jitter = Math.floor(Math.random() * 3) + 1;
    setTimeout(() => {
      try {
        bot._client.write('keep_alive', { keepAliveId: packet.keepAliveId });
      } catch (_) {}
    }, jitter);
    return false; // blocca il handler nativo di mineflayer
  });

  logger.info('[AntiDetect] Plugin loaded ✓');
}

module.exports = antiDetection;