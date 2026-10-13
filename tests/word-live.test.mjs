// The Word Humanizer with live preview, ported from Grade A on 2026-10-13 (owner: "update
// the word humanizer in b7ooth to match ga humanizer").
//
// Same flow as Grade A's #view-word: upload -> the document drawn on the right ->
// Humanize / Go Green colour its sentences -> Download into the original file; the user
// picks what to protect; the headline % comes from the sentence colours; the page never
// re-opens an earlier file and asks before a refresh loses the open one. B7oothKw rules
// on top: members only (out-of-words and no-month errors link to pricing.html), "Go Green"
// wording, red accent, no What's New.
//
// The functions are lifted out of js/humanizer.js by brace-matching and run in a vm with
// the DOM stubbed, the same way gogreen-and-code-dates.test.mjs does it.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const HZ = read('js/humanizer.js');
const HTML = read('humanizer.html');
const CSS = read('css/humanizer.css');

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
const pane = () => {
  const i = HTML.indexOf('<section class="hz-pane hidden" id="pane-word">');
  assert.ok(i >= 0, 'no Word pane');
  return HTML.slice(i, HTML.indexOf('\n  </section>', i));
};
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

// A tiny element: enough for classList / innerHTML / append.
function el(extra = {}) {
  const set = new Set();
  return Object.assign({
    innerHTML: '', className: '', disabled: false, kids: [],
    classList: {
      add: (...c) => c.forEach((x) => set.add(x)), remove: (...c) => c.forEach((x) => set.delete(x)),
      toggle: (c, on) => { (on === undefined ? !set.has(c) : on) ? set.add(c) : set.delete(c); },
      contains: (c) => set.has(c),
    },
    append(...k) { this.kids.push(...k); },
    querySelectorAll: () => [],
  }, extra);
}

// The real word functions, over a stubbed page.
function page(extra = {}) {
  const els = {};
  const $ = (id) => (els[id] = els[id] || el());
  const ctx = {
    $, els, RED: 0.5, AMBER: 0.305, esc: (s) => String(s == null ? '' : s),
    isQuota: (r) => r === 'b7_trial' || r === 'b7_words',
    fetchMe: () => ({ then() {} }), renderMeter() {}, TOKEN: 't',
    window: { b7HasToken: () => !extra.signedOut },
    document: { createElement: () => ({}), querySelectorAll: () => [] },
    isB7Account: (me) => !!me && me.source === 'b7ooth',
    wx: { id: null, doc: null, sents: {}, busy: false, imgs: [], paras: {},
          protect: { groups: [], lock: [], unlock: [] } },
    wxMe: null,
    ...extra,
  };
  vm.createContext(ctx);
  for (const head of ['function colorOf(', 'function setWxStatus(', 'function wxSay(',
                      'function wxIsLocked(', 'function wxActive(', 'function wxNonGreen(',
                      'function wxScore(', 'function wxButtons(', 'function wxProtectSync(',
                      'function wxLeaveCheck(', 'function wxMemberGate(']) {
    vm.runInContext(fn(HZ, head), ctx);
  }
  return ctx;
}

const sent = (id, words, p) => ({ id, t: Array(words).fill('w').join(' '), o: 'x', p });
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// ------------------------------------------------------------------ markup
test('the Word pane has Grade A\'s controls and preview', () => {
  const v = pane();
  for (const id of ['wordCard', 'wd-lock', 'wordZone', 'wordInput', 'wordSelected', 'wdDialect',
                    'wxProtect', 'wxHumanize', 'wxGreen', 'wxDownload', 'wordStatus', 'wxScore',
                    'wxNew', 'wxDoc', 'wordHow']) {
    assert.ok(v.includes(`id="${id}"`), id);
  }
  for (const gone of ['wd-go', 'wd-drop', 'wd-files', 'wd-bar']) {
    assert.ok(!v.includes(`id="${gone}"`), 'old one-click control still there: ' + gone);
  }
  for (const g of ['cover', 'headings', 'toc', 'refs', 'captions', 'bullets', 'tables']) {
    assert.ok(v.includes(`data-wxgroup="${g}"`), g);
  }
});

test('buttons look like the text pane, and Go Green is called Go Green', () => {
  const v = pane();
  assert.ok(v.includes('id="wxHumanize" class="btn btn-primary"'));
  assert.ok(v.includes('id="wxGreen" class="btn btn-ghost btn-green'));
  assert.ok(v.includes('✦ Go Green<'));
  assert.ok(!/make all green/i.test(v));
});

test('the page states the B7oothKw limits pricing.html sells', () => {
  const v = pane(), pricing = read('pricing.html');
  assert.ok(pricing.includes('3 files a day each'));       // Word & PowerPoint, per pricing.html
  assert.ok(v.includes('<b>3</b> files a day'));
  assert.ok(v.includes('<b>10,000</b> words a file'));
  assert.ok(v.includes('membership\'s 10,000'));
  assert.ok(v.includes('<b>2 days</b>'));
});

test('no What\'s New or changelog on B7oothKw', () => {
  assert.ok(!/what'?s new|changelog/i.test(HTML));
  assert.ok(!/what'?s new|changelog/i.test(HZ));
});

test('every hidden toggle has its own rule, and the accent is red, not purple', () => {
  for (const sel of ['#wxGreen.hidden', '#wxDownload.hidden', '#wxNew.hidden', '#wxScore.hidden',
                     '#wordZone.hidden', '#wxProtect.hidden', '.pptx-status.hidden',
                     '.ft-how.modal-overlay.hidden']) {
    assert.ok(CSS.includes(sel), sel);
  }
  for (const sel of ['.wx-page .sent.human', '.wx-page .sent.mid', '.wx-page .sent.ai',
                     '.wx-page .wx-locked', '.wx-page .wx-cant']) {
    assert.ok(CSS.includes(sel), sel);
  }
  const live = stripComments(CSS + HZ);
  assert.ok(!/7c83ff|a371f7|a06bff|124,\s*131,\s*255/i.test(live), 'Grade A purple leaked in');
});

// ------------------------------------------------------------------ script wiring
test('it talks to the live routes with the branch key, never the one-click /api/docx', () => {
  for (const r of ['`${API}/api/word/open`', '`${API}/api/word/${wx.id}/protect`',
                   '`${API}/api/word/${wx.id}/img/${n}`', '/download?dialect=',
                   '`/api/word/${wx.id}/${kind === "humanize" ? "humanize" : "gogreen"}`']) {
    assert.ok(HZ.includes(r), r);
  }
  assert.ok(!HZ.includes('api: "/api/docx"'));
  assert.ok(fn(HZ, 'async function wxOpen(').includes('headers: BH'));
  assert.ok(fn(HZ, 'async function wxStream(').includes('headers: JH'));
  assert.ok(fn(HZ, 'async function wxDownload(').includes('headers: BH'));
});

test('the page never re-opens an earlier file', () => {
  assert.ok(!HZ.includes('function wxRestore('));
  const w = HZ.slice(HZ.indexOf('const wx = {'));
  assert.ok(!/localStorage\.setItem\([^)]*(word|doc)/i.test(w));
});

test('images are drawn from data: URLs, as nodes', () => {
  const b = fn(HZ, 'async function wxLoadImages(');
  assert.ok(b.includes('readAsDataURL'));
  assert.ok(b.includes('el.replaceChildren(img)'));
  // the site CSP has to let the picture in
  assert.ok(/img-src[^;]*data:/.test(read('netlify.toml')));
});

test('a Humanize refreshes the words meter (a member\'s pool just moved)', () => {
  assert.ok(fn(HZ, 'async function wxRun(').includes('if (kind === "humanize") fetchMe().then(renderMeter);'));
  assert.ok(fn(HZ, 'function renderMeter(').includes('wxMe = me;'));
});

// ------------------------------------------------------------------ behaviour
test('headline % comes from the colours: all green reads 0%', () => {
  const c = page();
  c.wx.doc = { state: { humanized: true } };
  c.wx.paras = { 0: { pid: 0, can: true, groups: [], sids: [1, 2] } };
  c.wx.sents = { 1: sent(1, 20, 0.05), 2: sent(2, 30, 0.2) };
  c.wxScore();
  const t = text(c.els.wxScore.innerHTML);
  assert.ok(t.startsWith('0% AI · Looks Human'), t);
  assert.ok(t.includes('0 AI 0 Uncertain 2 Human'), t);
});

test('share of words not green; protected and unscored sentences left out', () => {
  const c = page();
  c.wx.doc = { state: { humanized: true } };
  c.wx.paras = { 0: { pid: 0, can: true, groups: [], sids: [1, 2, 3] },
                 1: { pid: 1, can: true, groups: ['refs'], sids: [4] } };
  c.wx.protect = { groups: ['refs'], lock: [], unlock: [] };
  c.wx.sents = { 1: sent(1, 10, 0.9), 2: sent(2, 10, 0.4), 3: sent(3, 20, 0.1),
                 4: sent(4, 500, 0.95), 5: { id: 5, t: 'w w', o: 'x', p: null } };
  c.wxScore();
  const t = text(c.els.wxScore.innerHTML);
  assert.ok(t.startsWith('50% AI · Mixed signals'), t);
  assert.ok(t.includes('1 AI 1 Uncertain 1 Human'), t);
});

test('lock rule matches the server: can\'t is locked, a click beats the groups', () => {
  const c = page();
  c.wx.paras = { 0: { pid: 0, can: true, groups: ['cover'] }, 1: { pid: 1, can: true, groups: [] },
                 2: { pid: 2, can: false, groups: [] } };
  c.wx.protect = { groups: ['cover'], lock: [1], unlock: [0, 2] };
  assert.strictEqual(c.wxIsLocked(0), false);   // unlocked by a click despite its group
  assert.strictEqual(c.wxIsLocked(1), true);    // locked by a click
  assert.strictEqual(c.wxIsLocked(2), true);    // can't be humanized, never opens
});

test('Go Green shows only after a Humanize, and only while an open sentence is not green', () => {
  const c = page();
  c.wx.paras = { 0: { pid: 0, can: true, groups: [], sids: [1] } };
  c.wx.doc = { state: { humanized: false, humanize_runs: 0, max_runs: 4 } };
  c.wx.sents = { 1: { id: 1, t: 'a b', o: 'a b', p: null } };
  c.wxButtons();
  assert.ok(c.els.wxGreen.classList.contains('hidden'));
  assert.strictEqual(c.els.wxHumanize.disabled, false);
  c.wx.doc.state = { humanized: true, humanize_runs: 1, max_runs: 4 };
  c.wx.sents[1].p = 0.6;
  c.wxButtons();
  assert.ok(!c.els.wxGreen.classList.contains('hidden'));
  assert.strictEqual(c.els.wxGreen.disabled, false);
  c.wx.sents[1].p = 0.1;
  c.wxButtons();
  assert.strictEqual(c.els.wxGreen.disabled, true);           // all green: nothing to do
  c.wx.doc.state = { humanized: true, humanize_runs: 4, max_runs: 4 };
  c.wxButtons();
  assert.strictEqual(c.els.wxHumanize.disabled, true);        // the 4-run cap per file
});

test('out of words or no month: the message links to pricing.html', () => {
  for (const reason of ['b7_words', 'b7_membership']) {
    const c = page();
    c.document.createElement = () => ({});
    c.wxSay('This file needs 1,200 words and you have 300 left this month.', reason);
    const st = c.els.wordStatus;
    assert.ok(st.innerHTML.includes('1,200 words'));
    const a = st.kids.find((k) => k && k.href);
    assert.ok(a && a.href === 'pricing.html', reason);
  }
  const c = page();
  c.wxSay('Something else.', 'failed');
  assert.strictEqual(c.els.wordStatus.kids.length, 0);
});

test('a lapsed or never-paid B7oothKw account is stopped before the upload', () => {
  const c = page();
  c.wxMe = { source: 'b7ooth', b7: { active: false, words: 0 } };
  assert.strictEqual(c.wxMemberGate(), false);
  c.wxMe = { source: 'b7ooth', b7: { active: true, words: 5000 } };
  assert.strictEqual(c.wxMemberGate(), true);
  c.wxMe = { source: 'b7ooth', is_admin: true, b7: { active: false } };
  assert.strictEqual(c.wxMemberGate(), true);
  c.wxMe = null;                                                // unknown: let the server decide
  assert.strictEqual(c.wxMemberGate(), true);
});

test('refresh or close with a file open on the Word pane asks first', () => {
  assert.ok(HZ.includes('window.addEventListener("beforeunload", wxLeaveCheck);'));
  const ask = (id, hidden) => {
    const c = page();
    c.wx.id = id;
    c.els['pane-word'] = el(); if (hidden) c.els['pane-word'].classList.add('hidden');
    const e = { prevented: false, preventDefault() { this.prevented = true; } };
    c.wxLeaveCheck(e);
    return e.prevented;
  };
  assert.strictEqual(ask('doc123', false), true);
  assert.strictEqual(ask('doc123', true), false);    // on the text / PowerPoint pane
  assert.strictEqual(ask(null, false), false);       // no file open
  // Signing out: b7Logout clears the token, then leaves. That must not ask.
  const c = page({ signedOut: true });
  c.wx.id = 'doc123'; c.els['pane-word'] = el();
  const e = { prevented: false, preventDefault() { this.prevented = true; } };
  c.wxLeaveCheck(e);
  assert.strictEqual(e.prevented, false);
});
