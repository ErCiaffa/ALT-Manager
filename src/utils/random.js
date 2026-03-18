'use strict';

/**
 * random.js — stateless random-utility helpers used across modules.
 */

/** Random float in [min, max) */
const float = (min, max) => Math.random() * (max - min) + min;

/** Random integer in [min, max] inclusive */
const int = (min, max) => Math.floor(float(min, max + 1));

/** Pick a random element from an array */
const pick = (arr) => arr[int(0, arr.length - 1)];

/** Gaussian-ish random via Box-Muller (clipped to [min,max]) */
function gaussian(mean, stddev, min, max) {
  let u, v, s;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  const n = u * Math.sqrt(-2 * Math.log(s) / s);
  return Math.min(max, Math.max(min, mean + stddev * n));
}

/** Returns a promise that resolves after `ms` milliseconds */
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

module.exports = { float, int, pick, gaussian, sleep };