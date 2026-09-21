// Two fixes from the 2026-09-21 site test.
//
// 1. Go Green runs only on text WE rewrote. People were pasting, pressing Check for AI,
//    then Go Green -- a free humanizer with the highlights as a map. The output now
//    remembers where it came from; Go Green on a mere scan says why and stops. Grade A
//    got the same gate the same day (humanizer commit 6bc1432); the copy is identical.
//
// 2. Code dates on the Codes page. The server stamps codes in naive UTC and new Date()
//    reads a stamp with no offset as local time, so a code made at 01:38 in Kuwait said
//    "made Sep 20". The stamp is pinned to UTC before it is shown.
//
// The functions are lifted out of the real scripts by brace-matching and run in a vm
// with the DOM and network stubbed, so a broken guard fails here, not on the site.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const HZ = read('js/humanizer.js');
const CODES = read('js/codes.js');

// The whole function whose header starts with `head`, braces balanced.
function fn(src, head) {
  const i = src.indexOf(head);
  assert.ok(i >= 0, 'missing ' + head);
  let j = src.indexOf('{', i), depth = 0;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(i, j + 1);
  }
  throw new Error('unbalanced ' + head);
}
const line = (src, start) => {
  const i = src.indexOf(start);
  assert.ok(i >= 0, 'missing ' + start);
  return src.slice(i, src.indexOf('\n', i) + 1);
};

// ------------------------------------------------------------------ 1. Go Green gate
const FLAGGED = { blocks: [{ type: 'body', sentences: [{ t: 'one two three', p: 0.9 }] }], text: 'one two three' };
const CLEAN = { blocks: [{ type: 'body', sentences: [{ t: 'one two three', p: 0.05 }] }], text: 'one two three' };

// A page: the real hasFlagged/applyData/makeAllGreen/clearAll over stubbed everything.
function page() {
  const log = { msgs: [], fetches: 0 };
  const el = () => ({ disabled: false, style: {}, classList: { add() {}, remove() {}, toggle() {} }, value: '', innerHTML: '' });
  const ctx = {
    AMBER: 0.35, RED: 0.7, LEVEL: 'x', JH: {}, API: 'https://api.test', selectedDialect: 'us',
    reduceMotion: true, busy: false, greenAbort: null,
    btnCheck: el(), btnHum: el(), btnGreen: el(), btnStopGreen: el(), btnCopy: el(), btnClear: el(),
    outPane: el(), inPane: el(), out: el(), input: el(), bar: el(), barFill: el(),
    msg: (t) => log.msgs.push(t), needLogin: () => false,
    renderBlocks() {}, updateScore() {}, setOutWords() {}, setInWords() {}, resetRing() {},
    wordCount: (s) => s.split(/\s+/).filter(Boolean).length,
    fetch: () => { log.fetches++; throw new Error('network stubbed out'); },
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    setTimeout: () => 0, TextDecoder: class {}, JSON,
  };
  const code = [
    line(HZ, 'let lastBlocks = '),
    line(HZ, 'let lastWasRewrite = '),
    fn(HZ, 'function colorOf('), fn(HZ, 'function hasFlagged('), fn(HZ, 'function flaggedPct('),
    fn(HZ, 'function refreshButtons('), fn(HZ, 'function applyData('),
    fn(HZ, 'async function makeAllGreen('), fn(HZ, 'function clearAll('),
    // reach into the page's state from the test
    'globalThis.__set = (k, v) => eval(k + " = v");',
    'globalThis.__get = (k) => eval(k);',
    'globalThis.applyData = applyData; globalThis.makeAllGreen = makeAllGreen; globalThis.clearAll = clearAll;',
  ].join('\n');
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { ctx, log };
}

test('Go Green after a plain scan says "humanize first" and sends nothing', async () => {
  const { ctx, log } = page();
  ctx.applyData(FLAGGED, true);                  // Check for AI: no third argument
  assert.strictEqual(ctx.btnGreen.disabled, false, 'the button stays clickable so the message can show');
  await ctx.makeAllGreen();
  assert.deepStrictEqual(log.msgs, ['Please humanize your text first.']);
  assert.strictEqual(log.fetches, 0);
});

test('Go Green after a humanize goes through to the server', async () => {
  const { ctx, log } = page();
  ctx.applyData(FLAGGED, true, true);            // Humanize
  await ctx.makeAllGreen();
  assert.strictEqual(log.fetches, 1);
  assert.ok(!log.msgs.includes('Please humanize your text first.'));
});

test('the message comes before the all-green test, so a clean scan hears it too', async () => {
  const { ctx, log } = page();
  ctx.applyData(CLEAN, true);
  await ctx.makeAllGreen();
  assert.deepStrictEqual(log.msgs, ['Please humanize your text first.']);
});

test('the bin forgets that the last output was a rewrite', async () => {
  const { ctx, log } = page();
  ctx.applyData(FLAGGED, true, true);
  ctx.clearAll();                                // (clears the status line: msg(""))
  ctx.__set('lastBlocks', FLAGGED.blocks);       // red text back on screen without a rewrite
  await ctx.makeAllGreen();
  assert.deepStrictEqual(log.msgs, ['', 'Please humanize your text first.']);
  assert.strictEqual(log.fetches, 0);
});

test('a scan after a humanize takes the flag away again', async () => {
  const { ctx, log } = page();
  ctx.applyData(FLAGGED, true, true);
  ctx.applyData(FLAGGED, true);
  await ctx.makeAllGreen();
  assert.strictEqual(log.fetches, 0);
});

test('every rewrite path marks its output, and the scan path does not', () => {
  const hum = fn(HZ, 'async function humanize(');
  const chk = fn(HZ, 'async function check(');
  const grn = fn(HZ, 'async function makeAllGreen(');
  assert.match(hum, /applyData\(p, true, true\)/);
  assert.match(chk, /applyData\(p, true\);/);
  assert.doesNotMatch(chk, /applyData\(p, true, true\)/);
  assert.match(grn, /applyData\(o\.payload, true, true\)/);
  // The guard sits before the all-green test and before anything is sent.
  const guard = grn.indexOf('if (!lastWasRewrite)');
  assert.ok(guard > 0);
  assert.ok(guard < grn.indexOf('hasFlagged(lastBlocks)'));
  assert.ok(guard < grn.indexOf('fetch('));
});

test('the copy matches Grade A word for word', () => {
  const ga = path.join(ROOT, '..', 'humanizer', 'src', 'server', 'static', 'app.js');
  if (!fs.existsSync(ga)) return;               // the sister repo is not checked out here
  assert.ok(fs.readFileSync(ga, 'utf8').includes('"Please humanize your text first."'));
  assert.ok(HZ.includes('msg("Please humanize your text first.")'));
});

// ------------------------------------------------------------------ 2. code dates
function dates() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fn(CODES, '  const utc = ') + ';\n' + fn(CODES, '  const when = ') + ';\n'
    + 'globalThis.utc = utc; globalThis.when = when;', ctx);
  return ctx;
}

test('a naive server stamp is read as UTC, so the Kuwait day is right after 21:00 UTC', () => {
  process.env.TZ = 'Asia/Kuwait';                 // UTC+3, no DST
  const { when } = dates();
  assert.strictEqual(when('2026-09-20T22:38:11.123456'), 'Sep 21, 2026');   // the code from the site test
  assert.strictEqual(when('2026-09-20T20:59:59'), 'Sep 20, 2026');          // just before the day turns in Kuwait
  assert.strictEqual(when('2026-09-20T21:00:00'), 'Sep 21, 2026');
});

test('a stamp that already says Z or carries an offset is left alone', () => {
  process.env.TZ = 'Asia/Kuwait';
  const { utc, when } = dates();
  assert.strictEqual(utc('2026-09-20T22:38:11Z'), '2026-09-20T22:38:11Z');
  assert.strictEqual(utc('2026-09-20T22:38:11+00:00'), '2026-09-20T22:38:11+00:00');
  assert.strictEqual(utc('2026-09-20T22:38:11+0300'), '2026-09-20T22:38:11+0300');
  assert.strictEqual(when('2026-09-20T22:38:11Z'), 'Sep 21, 2026');
  assert.strictEqual(when('2026-09-20T22:38:11+03:00'), 'Sep 20, 2026');
});

test('a bare date is not turned into nonsense', () => {
  process.env.TZ = 'Asia/Kuwait';
  const { utc, when } = dates();
  assert.strictEqual(utc('2026-12-19'), '2026-12-19');
  assert.strictEqual(when('2026-12-19'), 'Dec 19, 2026');
});

test('west of Greenwich the same stamp lands on the earlier day', () => {
  process.env.TZ = 'America/New_York';
  const { when } = dates();
  assert.strictEqual(when('2026-09-21T02:00:00'), 'Sep 20, 2026');
  process.env.TZ = 'Asia/Kuwait';
});

test('every date on the Codes page goes through the fix', () => {
  const body = CODES.slice(CODES.indexOf('const when = '));
  assert.doesNotMatch(body.slice(body.indexOf('};') + 2), /new Date\(/, 'only when() may build a Date');
  assert.match(fn(CODES, '  const when = '), /new Date\(utc\(iso\)\)/);
});
