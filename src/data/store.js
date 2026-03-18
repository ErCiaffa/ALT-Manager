'use strict';

/**
 * store.js — Persistenza leggera su file JSON.
 * Nessun DB esterno: tutto in src/data/*.json
 * Thread-safe per single-process Node.js (writes sincronizzate).
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname);

function filePath(name) {
  return path.join(DATA_DIR, name + '.json');
}

function read(name) {
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (_) {
    return null;
  }
}

function write(name, data) {
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), 'utf8');
}

// ── Accounts store ──────────────────────────────────────────────────────────
// Schema: { accounts: [ { id, username, mcPassword, auth, servers: [serverId] } ] }
// Schema: { servers:  [ { id, host, port, version, label } ] }

function getAccounts() {
  return (read('accounts') || { accounts: [], servers: [] });
}

function saveAccounts(data) {
  write('accounts', data);
}

// ── Module states ───────────────────────────────────────────────────────────
// Schema: { afk: bool, autoLogin: bool }

function getModuleStates() {
  return (read('modules') || { afk: true, autoLogin: true });
}

function saveModuleStates(states) {
  write('modules', states);
}

// ── Chat log (ring buffer, ultimi 200 messaggi) ─────────────────────────────
const CHAT_MAX = 200;

function getChatLog() {
  return (read('chatlog') || { messages: [] });
}

function appendChat(entry) {
  const log = getChatLog();
  log.messages.push(entry);
  if (log.messages.length > CHAT_MAX) log.messages.shift();
  write('chatlog', log);
}

module.exports = { getAccounts, saveAccounts, getModuleStates, saveModuleStates, getChatLog, appendChat };