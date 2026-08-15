/* A "how many?" stepper for anything sold by the unit.
 *
 * Scans are bought from two places — the Turnitin page's credits strip and the pricing
 * card — and both have to agree on the cap, the clamping and the total, or the two
 * pages quote different prices for the same purchase. The logic lives here once.
 *
 * MAX matches api.CHECKOUT_QTY_MAX. The server clamps to it regardless; a stepper that
 * let you pick 50 would take the money for 20 and say nothing.
 *
 * The unit price is read from /api/myfatoorah/config — the same config the invoice is
 * priced from — rather than hardcoded next to the button, so a price change cannot
 * leave the UI promising one number while the invoice says another.
 */
(function () {
  var MAX = 20;
  var cache = null;                       // shared across every stepper on the page

  function api() {
    return (window.API || (window.CONFIG && window.CONFIG.API) || "");
  }

  // -> {amount, currency, dp} or null. dp comes from the configured string ("3.000" -> 3)
  // so KWD keeps three decimals and USD two without either being hardcoded.
  function loadPrice(plan) {
    if (cache) return Promise.resolve(cache[plan] || null);
    return fetch(api() + "/api/myfatoorah/config")
      .then(function (r) { return r.json(); })
      .then(function (c) {
        cache = {};
        var prices = (c && c.prices) || {};
        Object.keys(prices).forEach(function (k) {
          var raw = String(prices[k].amount), dot = raw.indexOf(".");
          cache[k] = { amount: parseFloat(raw), currency: prices[k].currency || "",
                       dp: dot < 0 ? 0 : raw.length - dot - 1 };
        });
        return cache[plan] || null;
      })
      .catch(function () { return null; });   // no price -> stepper works, total stays blank
  }

  function money(unit, n) {
    return unit ? (unit.amount * n).toFixed(unit.dp) + " " + unit.currency : "";
  }

  /* mount({box, input, minus, plus, total, label, button, plan, one, many})
   * Every element is optional except input/minus/plus. Returns {value, render}. */
  function mount(o) {
    var unit = null;

    function value() {
      var v = parseInt(o.input.value, 10);
      return isNaN(v) ? 1 : Math.max(1, Math.min(MAX, v));
    }

    function render() {
      var n = value();
      o.input.value = n;                    // snap a typed 0 / 99 / "abc" back into range
      o.minus.disabled = n <= 1;
      o.plus.disabled = n >= MAX;
      if (o.label) o.label.textContent = n === 1 ? "Scan" : "Scans";
      if (o.total) o.total.textContent = money(unit, n);
      if (o.button && o.one && o.many) {
        o.button.textContent = n === 1 ? o.one : o.many.replace("{n}", n);
      }
    }

    o.minus.addEventListener("click", function () { o.input.value = value() - 1; render(); });
    o.plus.addEventListener("click", function () { o.input.value = value() + 1; render(); });
    o.input.addEventListener("input", render);
    o.input.addEventListener("blur", render);

    render();
    loadPrice(o.plan).then(function (u) { unit = u; render(); });
    return { value: value, render: render };
  }

  window.b7Qty = { mount: mount, MAX: MAX, money: money, loadPrice: loadPrice };
})();
