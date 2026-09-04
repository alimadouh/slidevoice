// The checkout baseline in js/auth.js: what the account held BEFORE we walked to the
// gateway, so the return page can prove the webhook's grant actually landed.
//
// Worth a test because the failure it prevents is invisible and expensive. MyFatoorah
// calls the webhook server-to-server, and it normally lands while the customer is still
// on the "returning you now" screen. The return page used to snapshot the balance on its
// way back in, which by then ALREADY contained the grant — so every poll compared the new
// balance against itself, never saw an increase, and told a customer who had just paid
// that their payment was "still processing". Nothing errored; the money was taken and the
// product was delivered. Only the sentence was wrong.
//
// Run in a vm context like device.test.mjs: auth.js is a plain browser script and the repo
// has no jsdom dependency.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(HERE, '..', 'js', 'auth.js'), 'utf8');

/** A minimal browser for auth.js. `store` is the localStorage behind it. */
function boot({ store = new Map(), now = () => Date.now() } = {}) {
  const ctx = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    location: { href: 'https://b7ooth-ai.com/pricing.html', pathname: '/pricing.html' },
    document: {
      readyState: 'complete',
      getElementById: () => null,
      addEventListener: () => {},
    },
    Date: Object.assign(Object.create(Date), { now, parse: Date.parse }),
    JSON, console,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, store };
}

test('a baseline survives the redirect and comes back as it went in', () => {
  const { ctx } = boot();
  ctx.b7SetCheckoutBaseline({ words: 4000, credits: 2 });
  assert.deepEqual(ctx.b7TakeCheckoutBaseline(), { words: 4000, credits: 2 });
});

test('taking it removes it, so a later return cannot reuse it', () => {
  const { ctx } = boot();
  ctx.b7SetCheckoutBaseline({ credits: 2 });
  ctx.b7TakeCheckoutBaseline();
  assert.equal(ctx.b7TakeCheckoutBaseline(), null);
});

test('no baseline reads as null rather than throwing', () => {
  const { ctx } = boot();
  assert.equal(ctx.b7TakeCheckoutBaseline(), null);
});

test('a stale baseline is ignored — an abandoned checkout must not decide a later one', () => {
  let clock = 1_000_000;
  const { ctx } = boot({ now: () => clock });
  ctx.b7SetCheckoutBaseline({ credits: 5 });
  clock += 7 * 60 * 60 * 1000;                 // longer than the 6h life
  assert.equal(ctx.b7TakeCheckoutBaseline(), null);
});

test('a baseline from an hour ago is still good — customers do get distracted', () => {
  let clock = 1_000_000;
  const { ctx } = boot({ now: () => clock });
  ctx.b7SetCheckoutBaseline({ credits: 5 });
  clock += 60 * 60 * 1000;
  assert.deepEqual(ctx.b7TakeCheckoutBaseline(), { credits: 5 });
});

test('a zero balance is a real baseline, not a missing one', () => {
  // The first-ever purchase starts from 0. If 0 were treated as "no baseline" the return
  // page would fall back to snapshotting after the grant, which is the original bug.
  const { ctx } = boot();
  ctx.b7SetCheckoutBaseline({ words: 0, credits: 0 });
  assert.deepEqual(ctx.b7TakeCheckoutBaseline(), { words: 0, credits: 0 });
});

test('junk in storage is ignored rather than thrown', () => {
  const store = new Map([['b7_checkout_baseline', '{not json']]);
  const { ctx } = boot({ store });
  assert.equal(ctx.b7TakeCheckoutBaseline(), null);
});

test('a payment IS recognised when the webhook landed before the customer got back', () => {
  // The regression itself, in the shape the return pages use it: credits were 2 before
  // checkout and are 3 by the time the page loads. Against the stored baseline that is a
  // grant; against a snapshot taken on arrival (3 vs 3) it never would be.
  const { ctx } = boot();
  ctx.b7SetCheckoutBaseline({ words: 0, credits: 2 });
  const onReturn = { tn_credits: 3 };
  const saved = ctx.b7TakeCheckoutBaseline();
  const before = saved ? (saved.credits || 0) : (onReturn.tn_credits || 0);
  assert.equal(onReturn.tn_credits > before, true);
});
