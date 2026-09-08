// The month is sold the way Grade A sells a plan -- MyFatoorah's card component on our
// page, card only, so the card that pays is the card that renews -- and members get a
// page of their own to see the renewal and cancel it. Read as text: these files are
// plain browser scripts and markup, and what matters is that the pieces are wired to
// each other and to the policy the CSP enforces.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('the pricing page opens the card form when the checkout answers with a session', () => {
  const js = read('js/pricing.js');
  assert.match(js, /d && d\.session && window\.b7CardCheckout/);
  assert.match(js, /await b7CardCheckout\(d\.session\)/);
  // The baseline the return page proves the grant against is stored before EITHER
  // way of paying leaves the page.
  const i = js.indexOf('const baseline = ');
  assert.ok(i > 0);
  assert.ok(js.indexOf('baseline();', i) < js.indexOf('location.href = d.url'));
  assert.ok(js.indexOf('baseline();', js.indexOf('d.session')) > 0);
  const html = read('pricing.html');
  assert.match(html, /id="cardModal"/);
  assert.match(html, /id="mfCard"/);
  assert.match(html, /js\/card-checkout\.js/);
  assert.match(html, /css\/checkout\.css/);
});

test('the card form offers a card and nothing else', () => {
  const js = read('js/card-checkout.js');
  const init = js.slice(js.indexOf('myfatoorah.init({'), js.indexOf('});', js.indexOf('myfatoorah.init({')));
  for (const m of ['applePay', 'googlePay', 'stcPay', 'hostedPayment']) {
    assert.ok(init.includes(`${m}: { isEnabled: false }`), m);
  }
  assert.match(init, /shouldHandlePaymentUrl: true/);
  assert.doesNotMatch(init, /countryCode/);
  // Only MyFatoorah may be walked to for the 3-D Secure step.
  assert.match(js, /b7PayUrlOk\(res\.redirectionUrl\)/);
  // The tokens live on body.hz-page, not :root.
  assert.match(js, /getComputedStyle\(document\.body\)/);
  assert.match(js, /cardHeight: "240px"/);
});

test('the content security policy lets the component in, and nothing else new', () => {
  const toml = read('netlify.toml');
  const csp = toml.match(/Content-Security-Policy = "([^"]+)"/)[1];
  const dir = (name) => (csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + ' ')) || '');
  assert.ok(dir('script-src').includes('https://portal.myfatoorah.com'));
  assert.ok(dir('connect-src').includes('https://portal.myfatoorah.com'));
  assert.ok(dir('connect-src').includes('https://api.myfatoorah.com'));
  assert.ok(dir('frame-src').includes('https://portal.myfatoorah.com'));
  assert.ok(dir('frame-src').includes('https://*.myfatoorah.com'));
  assert.ok(dir('style-src').includes('https://portal.myfatoorah.com'));
  assert.ok(dir('frame-ancestors').includes("'none'"));
});

test('members have a Manage subscription page, and the cancel lives there', () => {
  assert.match(read('js/shell.js'), /href: "subscription\.html", ic: "⚙", label: "Manage subscription"/);
  const html = read('subscription.html');
  assert.match(html, /data-view="subscription"/);
  assert.match(html, /js\/subscription\.js/);
  const js = read('js/subscription.js');
  assert.match(js, /"\/api\/billing\/autorenew"/);
  assert.match(js, /"\/api\/myfatoorah\/cancel", \{ method: "POST" \}/);
  assert.match(js, /confirm\("Cancel your subscription\?/);
  for (const label of ['"Membership"', '"Words left"', '"Renews"', '"Card"', '"Next charge"']) {
    assert.ok(js.includes(`row(${label}`), label);
  }
  // The pricing page points at it instead of carrying its own cancel button.
  const pricing = read('pricing.html');
  assert.doesNotMatch(pricing, /id="cancel-month"/);
  assert.match(pricing, /id="manage-month" class="plan-cancel" href="subscription\.html"/);
  assert.doesNotMatch(read('js/pricing.js'), /\/api\/myfatoorah\/cancel/);
});
