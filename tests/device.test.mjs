// js/device.js must put X-Device-Id on every request to our backend, and on nothing else.
//
// This matters more than it looks. Eleven files build their own Authorization header, so
// the id is attached by wrapping fetch once rather than editing each of them. If that
// wrapper misses a request the server charges the free words to a shared per-connection
// pool instead of to the machine — and on a Kuwaiti mobile network that pool can be a
// whole neighbourhood of unrelated people.
//
// Run in a vm context rather than jsdom: device.js is a plain browser script, the repo
// has no jsdom dependency, and a context object doubling as `window` is exactly the
// shape it runs in for real.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(HERE, '..', 'js', 'device.js'), 'utf8');
const API = 'https://api.gahumanizer.com';

/**
 * A minimal browser for device.js, whose fetch records what it was handed.
 * `subtle` picks the branch: true is the production path (https, SubtleCrypto),
 * false is the djb2 fallback a plain-http preview takes.
 */
function boot({ subtle = false, store = new Map(), screen: scr, cores = 8 } = {}) {
  const calls = [];
  const ctx = {
    screen: scr || { width: 1920, height: 1080, colorDepth: 24 },
    navigator: { language: 'en-GB', platform: 'Win32',
                 hardwareConcurrency: cores, deviceMemory: 8 },
    devicePixelRatio: 1,
    Intl, TextEncoder, Headers, Object, Array, Promise, Error,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
    },
    // No canvas and no WebGL, the same as a locked-down browser. device.js swallows
    // both and fingerprints the remaining traits, which is the case worth covering:
    // it must still produce a usable id rather than an empty string.
    document: { createElement: () => ({ getContext: () => null }) },
    crypto: subtle ? globalThis.crypto : undefined,
    fetch(input, init) { calls.push({ input, init }); return Promise.resolve({ ok: true }); },
  };
  ctx.window = ctx;                    // `window.x` and bare `x` are the same object
  ctx.HUMANIZER_API = API;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { w: ctx, calls, store };
}

const header = (call, name) => {
  const h = call && call.init && call.init.headers;
  if (!h) return null;
  return typeof h.get === 'function' ? h.get(name) : (h[name] ?? null);
};

test('it produces an id the server will accept', () => {
  const { w } = boot();
  assert.ok(w.DEVICE_ID, 'no device id was produced');
  // auth._norm_device: 8-64 chars, hex/dash/underscore only. Anything outside that is
  // dropped on the floor by the server and the whole feature silently does nothing.
  assert.ok(w.DEVICE_ID.length >= 8 && w.DEVICE_ID.length <= 64,
            `length ${w.DEVICE_ID.length} is outside what the server accepts`);
  assert.match(w.DEVICE_ID, /^[0-9a-f_-]+$/,
               'the server only accepts hex, dash and underscore');
});

test('the production hash is also a shape the server accepts', async () => {
  const { w } = boot({ subtle: true });
  await new Promise((r) => setTimeout(r, 20));      // crypto.subtle resolves a promise
  assert.match(w.DEVICE_ID, /^[0-9a-f]{40}$/);
});

test('the same machine gets the same id twice', () => {
  assert.equal(boot().w.DEVICE_ID, boot().w.DEVICE_ID,
               'a fingerprint that changes per page load defends nothing');
});

test('a different machine gets a different id', () => {
  const laptop = boot().w.DEVICE_ID;
  const phone = boot({ screen: { width: 390, height: 844, colorDepth: 32 },
                       cores: 6 }).w.DEVICE_ID;
  assert.notEqual(laptop, phone,
                  'two machines sharing one id would share one free allowance');
});

test('a cached id survives, so early requests do not race the hash', () => {
  const store = new Map([['b7_dev_id', 'cafebabecafebabe']]);
  const { w } = boot({ store });
  assert.ok(w.DEVICE_ID, 'the cached value should be readable immediately');
});

test('it is attached to backend requests', async () => {
  const { w, calls } = boot();
  await w.fetch(API + '/api/humanize', { method: 'POST' });
  assert.equal(header(calls[0], 'X-Device-Id'), w.DEVICE_ID);
});

test('it is attached even when the caller sent no options at all', async () => {
  const { w, calls } = boot();
  await w.fetch(API + '/api/ping');
  assert.equal(header(calls[0], 'X-Device-Id'), w.DEVICE_ID);
});

test('it does not clobber the caller Authorization header', async () => {
  const { w, calls } = boot();
  await w.fetch(API + '/api/me', { headers: { Authorization: 'Bearer tok123' } });
  assert.equal(header(calls[0], 'Authorization'), 'Bearer tok123');
  assert.equal(header(calls[0], 'X-Device-Id'), w.DEVICE_ID);
});

test('it is never sent to anyone else', async () => {
  const { w, calls } = boot();
  await w.fetch('https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(header(calls[0], 'X-Device-Id'), null,
               'a fingerprint must not leak to a third party');
});

test('a caller that sets its own device id keeps it', async () => {
  const { w, calls } = boot();
  await w.fetch(API + '/api/humanize', { headers: { 'X-Device-Id': 'deadbeefdeadbeef' } });
  assert.equal(header(calls[0], 'X-Device-Id'), 'deadbeefdeadbeef');
});

test('the original fetch still receives the url, method and body', async () => {
  const { w, calls } = boot();
  await w.fetch(API + '/api/docx', { method: 'POST', body: 'x' });
  assert.equal(calls[0].input, API + '/api/docx');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, 'x');
});

test('a request still goes out if anything in the wrapper throws', async () => {
  const { w, calls } = boot();
  w.HUMANIZER_API = { indexOf() { throw new Error('boom'); } };
  await w.fetch(API + '/api/ping');
  assert.equal(calls.length, 1, 'the wrapper must never swallow a request');
});
