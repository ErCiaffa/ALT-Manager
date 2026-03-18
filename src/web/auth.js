'use strict';

/**
 * auth.js — Middleware di autenticazione JWT per la dashboard.
 */

const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../config/config');

const SECRET = config.web.secret;

// ── Genera token JWT ─────────────────────────────────────────────────────────
function signToken() {
  return jwt.sign({ role: 'admin' }, SECRET, { expiresIn: config.web.tokenExpiry });
}

// ── Verifica password dashboard ──────────────────────────────────────────────
async function checkPassword(input) {
  const stored = config.web.password;
  // Se il valore nel .env inizia con $2b$ è già un hash bcrypt
  if (stored.startsWith('$2b$') || stored.startsWith('$2a$')) {
    return bcrypt.compare(input, stored);
  }
  // Altrimenti confronto diretto (plaintext — consigliato solo in dev)
  return input === stored;
}

// ── Middleware Express — verifica cookie/header Authorization ────────────────
function requireAuth(req, res, next) {
  const token =
    req.cookies?.token ||
    (req.headers.authorization || '').replace('Bearer ', '');

  if (!token) return res.status(401).json({ error: 'Non autenticato' });

  try {
    jwt.verify(token, SECRET);
    next();
  } catch (_) {
    res.clearCookie('token');
    return res.status(401).json({ error: 'Token non valido o scaduto' });
  }
}

// ── Middleware Socket.io — verifica handshake ────────────────────────────────
function requireAuthSocket(socket, next) {
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.cookie?.match(/token=([^;]+)/)?.[1];

  if (!token) return next(new Error('Non autenticato'));

  try {
    jwt.verify(token, SECRET);
    next();
  } catch (_) {
    next(new Error('Token non valido'));
  }
}

module.exports = { signToken, checkPassword, requireAuth, requireAuthSocket };