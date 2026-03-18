'use strict';

/**
 * server.js — Express + Socket.io.
 * Non importa NULLA da bot/ — comunica solo tramite bus.
 */

const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const cookieParser = require('cookie-parser');
const path         = require('path');
const rateLimit    = require('express-rate-limit');

const config     = require('../config/config');
const logger     = require('../utils/logger');
const bus        = require('../core/bus');
const { requireAuthSocket } = require('./auth');
const { router: apiRouter } = require('./routes/api');
const store      = require('../data/store');

let _io = null;

function startWebServer() {
  const app    = express();
  const server = http.createServer(app);

  _io = new Server(server, {
    cors: { origin: false },
    pingTimeout: 10000,
  });

  // ── Middleware ─────────────────────────────────────────────────────────────
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());

  app.use('/api/', rateLimit({
    windowMs: 60 * 1000, max: 120,
    message: { error: 'Rate limit superato' },
  }));

  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/api', apiRouter);
  app.get('*', (_req, res) =>
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'))
  );

  // ── Socket.io ──────────────────────────────────────────────────────────────
  _io.use(requireAuthSocket);

  _io.on('connection', (socket) => {
    logger.debug('[WS] Client connesso: ' + socket.id);

    // Manda stato e log iniziali
    socket.emit('chatlog', store.getChatLog().messages);
    socket.emit('modules', store.getModuleStates());
    // Status corrente: se bot non connesso, manda disconnesso
    socket.emit('status', { connected: false, event: 'waiting' });

    // Chat dalla dashboard → bus → bot/events.js lo gestisce
    socket.on('chat', (msg) => {
      const safe = String(msg || '').trim().slice(0, 256);
      if (safe) bus.emit('bot:cmd', { type: 'chat', payload: safe });
    });

    socket.on('disconnect', () =>
      logger.debug('[WS] Client disconnesso: ' + socket.id)
    );
  });

  // ── Bus → broadcast a tutti i client WS ───────────────────────────────────
  bus.on('bot:status', (data) => {
    if (_io) _io.emit('status', data);
  });

  bus.on('bot:chat', (entry) => {
    if (_io) _io.emit('chat', entry);
  });

  bus.on('bot:modules', (states) => {
    if (_io) _io.emit('modules', states);
  });

  // ── Start ──────────────────────────────────────────────────────────────────
  server.listen(config.web.port, () => {
    logger.info('[Web] Dashboard → http://localhost:' + config.web.port);
  });

  return { app, server, io: _io };
}

module.exports = { startWebServer };