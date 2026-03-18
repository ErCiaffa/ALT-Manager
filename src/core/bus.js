'use strict';

/**
 * bus.js — EventEmitter singleton (message bus centrale).
 *
 * Rompe le dipendenze circolari: bot e web non si importano mai
 * a vicenda — comunicano tutti tramite questo bus.
 *
 * Canali usati:
 *   bot:status   { connected, username, health, food, ... }
 *   bot:chat     { ts, text }
 *   bot:modules  { afk, autoLogin, autoCommands }
 *   bot:cmd      { type: 'chat'|'reload', payload }
 */

const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(30);

module.exports = bus;