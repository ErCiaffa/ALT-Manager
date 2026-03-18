'use strict';

const { createLogger, format, transports } = require('winston');
const DailyRotate = require('winston-daily-rotate-file');
const config = require('../config/config');
const path   = require('path');

const { combine, timestamp, colorize, printf, errors } = format;

const logFmt = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  return ts + ' [' + level + ']' + metaStr + ' ' + (stack || message);
});

const logger = createLogger({
  level: config.log.level,
  format: combine(errors({ stack: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFmt),
  transports: [
    new transports.Console({
      format: combine(
        colorize({ all: true }),
        errors({ stack: true }),
        timestamp({ format: 'HH:mm:ss' }),
        logFmt,
      ),
    }),
    new DailyRotate({
      dirname:       path.join(process.cwd(), 'logs'),
      filename:      'alt-manager-%DATE%.log',
      datePattern:   'YYYY-MM-DD',
      maxFiles:      '14d',
      zippedArchive: true,
    }),
  ],
});

module.exports = logger;