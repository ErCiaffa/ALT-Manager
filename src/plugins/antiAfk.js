'use strict';

/**
 * antiAfk.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Mineflayer inject-plugin that keeps the bot "alive" on servers with AFK
 * kick systems, using randomised, human-like micro-behaviours.
 *
 * Behaviours (all configurable, all individually toggleable):
 *   • lookAround   — random yaw/pitch changes at human-plausible speed
 *   • swingArm     — occasional arm swing (left or right hand)
 *   • sneak        — brief sneak-toggle bursts
 *   • jump         — rare single jumps
 *   • rotate360    — slow 360° look sweep (least frequent)
 *
 * Each behaviour fires on its own independent Poisson-like timer so activity
 * is unpredictable but statistically bounded.
 *
 * Config is merged from src/config/index.js → afk section (added below).
 *
 * Usage:
 *   bot.loadPlugin(require('./plugins/antiAfk'))
 */

const logger = require('../utils/logger');
const { float, int, gaussian, pick, sleep } = require('../utils/random');

// ── Behaviour defaults (all delays in milliseconds) ──────────────────────────
const DEFAULTS = {
  enabled: true,

  lookAround: {
    enabled:      true,
    intervalMin:  4_000,   // ms between look changes
    intervalMax:  12_000,
    yawDelta:     90,      // max degrees of yaw change per step
    pitchMin:    -35,      // clamp pitch (degrees)
    pitchMax:     35,
    steps:        8,       // micro-steps per look transition (smoothness)
    stepDelay:    60,      // ms between each micro-step
  },

  swingArm: {
    enabled:     true,
    intervalMin: 8_000,
    intervalMax: 25_000,
  },

  sneak: {
    enabled:     true,
    intervalMin: 20_000,
    intervalMax: 60_000,
    holdMin:     400,      // how long to stay sneaked (ms)
    holdMax:     1_200,
  },

  jump: {
    enabled:     true,
    intervalMin: 30_000,
    intervalMax: 90_000,
  },

  rotate360: {
    enabled:     true,
    intervalMin: 120_000,
    intervalMax: 300_000,
    steps:       72,       // 72 steps = 5° each = full circle
    stepDelay:   80,
  },
};

// ── Plugin ────────────────────────────────────────────────────────────────────
function antiAfk(bot, options) {
  // Deep-merge user options over defaults
  const cfg = deepMerge(DEFAULTS, options || {});

  if (!cfg.enabled) {
    logger.info('[AntiAFK] Plugin loaded but disabled via config');
    return;
  }

  /** All active timers — kept so we can cancel on end/kick */
  const timers = new Set();

  /** Schedule a recurring behaviour with randomised interval */
  function schedule(name, minMs, maxMs, fn) {
    let handle;
    function tick() {
      const delay = int(minMs, maxMs);
      handle = setTimeout(async () => {
        if (!bot.entity) return tick(); // not spawned yet
        try { await fn(); } catch (err) {
          logger.debug('[AntiAFK][' + name + '] error: ' + err.message);
        }
        tick();
      }, delay);
      timers.add(handle);
    }
    tick();
    logger.debug('[AntiAFK] Scheduled behaviour: ' + name);
  }

  function cancelAll() {
    for (const t of timers) clearTimeout(t);
    timers.clear();
  }

  // ── Behaviour: lookAround ───────────────────────────────────────────────────
  if (cfg.lookAround.enabled) {
    const c = cfg.lookAround;
    schedule('lookAround', c.intervalMin, c.intervalMax, async () => {
      const current   = bot.entity.yaw;
      const currentP  = bot.entity.pitch;

      // Target values — gaussian around current position for natural feel
      const targetYaw   = current + gaussian(0, c.yawDelta / 2, -c.yawDelta, c.yawDelta);
      const targetPitch = gaussian(0, 15, c.pitchMin, c.pitchMax);

      const yawStep   = (targetYaw   - current)   / c.steps;
      const pitchStep = (targetPitch - currentP)  / c.steps;

      for (let i = 0; i < c.steps; i++) {
        const y = current   + yawStep   * (i + 1);
        const p = currentP  + pitchStep * (i + 1);
        bot.look(y, p, false);
        await sleep(c.stepDelay);
      }
      logger.debug('[AntiAFK] LookAround → yaw ' + targetYaw.toFixed(1) +
                   '° pitch ' + targetPitch.toFixed(1) + '°');
    });
  }

  // ── Behaviour: swingArm ─────────────────────────────────────────────────────
  if (cfg.swingArm.enabled) {
    const c = cfg.swingArm;
    schedule('swingArm', c.intervalMin, c.intervalMax, async () => {
      const hand = pick(['hand', 'off_hand']);
      bot.swingArm(hand);
      logger.debug('[AntiAFK] SwingArm → ' + hand);
    });
  }

  // ── Behaviour: sneak ────────────────────────────────────────────────────────
  if (cfg.sneak.enabled) {
    const c = cfg.sneak;
    schedule('sneak', c.intervalMin, c.intervalMax, async () => {
      const holdMs = int(c.holdMin, c.holdMax);
      bot.setControlState('sneak', true);
      logger.debug('[AntiAFK] Sneak ON for ' + holdMs + 'ms');
      await sleep(holdMs);
      bot.setControlState('sneak', false);
      logger.debug('[AntiAFK] Sneak OFF');
    });
  }

  // ── Behaviour: jump ─────────────────────────────────────────────────────────
  if (cfg.jump.enabled) {
    const c = cfg.jump;
    schedule('jump', c.intervalMin, c.intervalMax, async () => {
      bot.setControlState('jump', true);
      await sleep(200);
      bot.setControlState('jump', false);
      logger.debug('[AntiAFK] Jump');
    });
  }

  // ── Behaviour: rotate360 ────────────────────────────────────────────────────
  if (cfg.rotate360.enabled) {
    const c = cfg.rotate360;
    schedule('rotate360', c.intervalMin, c.intervalMax, async () => {
      const startYaw = bot.entity.yaw;
      const stepRad  = (2 * Math.PI) / c.steps;
      logger.debug('[AntiAFK] Rotate360 start');
      for (let i = 1; i <= c.steps; i++) {
        bot.look(startYaw + stepRad * i, bot.entity.pitch, false);
        await sleep(c.stepDelay + int(-10, 10)); // ±10 ms humanisation
      }
      logger.debug('[AntiAFK] Rotate360 done');
    });
  }

  // ── Cleanup on disconnect ────────────────────────────────────────────────────
  bot.once('end',    cancelAll);
  bot.once('kicked', cancelAll);

  logger.info('[AntiAFK] Plugin loaded ✓ — ' +
    Object.keys(cfg)
      .filter(k => k !== 'enabled' && cfg[k] && cfg[k].enabled)
      .join(', ')
  );
}

// ── Utility: deep merge (no external dep) ────────────────────────────────────
function deepMerge(target, source) {
  const out = Object.assign({}, target);
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

module.exports = antiAfk;