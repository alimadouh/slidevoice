// B7oothKw Manage subscription: the membership, its renewal, the card it renews on,
// and one button that cancels it. Grade A has the same page inside its account modal
// (static/app.js, manageSubHtml); B7oothKw is multi-page, so it is a page.
//
// Two reads: /api/auth/me for the membership (days and words), /api/billing/autorenew
// for what is scheduled to be charged (date, card, amount). Cancelling is one call to
// /api/myfatoorah/cancel, which knows a B7oothKw account by its source and answers in
// the storefront's own words. Nothing here holds a card number; the masked one shown
// is MyFatoorah's own.
(function () {
  const API = (window.HUMANIZER_API || "").replace(/\/+$/, "");
  const BKEY = window.BRANCH_KEY || "";
  const TOKEN = (function () {
    try { const t = localStorage.getItem("b7_token"); return (t && t !== "guest") ? t : ""; }
    catch (e) { return ""; }
  })();
  const H = { "X-Branch-Key": BKEY };
  if (TOKEN) H["Authorization"] = "Bearer " + TOKEN;

  const $ = (id) => document.getElementById(id);
  const n = (v) => Number(v || 0).toLocaleString("en-US");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function day(s) {
    const t = Date.parse(s);
    return Number.isFinite(t)
      ? new Date(t).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      : "";
  }
  function money(amount, currency) {
    const c = String(currency || "").toUpperCase();
    if (c === "USD") return "$" + Number(amount).toFixed(2);
    return amount + " " + c;
  }
  const row = (label, value) =>
    `<div class="sub-row"><span>${label}</span><span class="sub-val">${value}</span></div>`;

  function say(text, bad) {
    const m = $("subMsg");
    m.textContent = text || "";
    m.classList.toggle("bad", !!bad);
  }

  async function getJson(path, opts) {
    try {
      const r = await fetch(API + path, Object.assign({ headers: H }, opts || {}));
      return await r.json();
    } catch (e) { return null; }
  }

  async function load() {
    if (!TOKEN) { $("subState").textContent = window.b7NoTokenMsg ? b7NoTokenMsg() : "Please sign in."; return; }
    const [me, ar] = await Promise.all([getJson("/api/auth/me"), getJson("/api/billing/autorenew")]);
    if (!me || me.error) {
      $("subState").textContent = (me && me.error) || "Couldn't load your account. Please refresh.";
      return;
    }
    render(me, ar || { on: false });
  }

  function render(me, ar) {
    const b7 = me.b7 || {};
    const active = !!b7.active;
    const ends = day(b7.expiry);
    // A vendor-managed renewal has a row at /api/billing/autorenew; the older gateway-
    // managed kind only has b7.renewing. Either one is a charge that is coming.
    const renewing = !!(ar && ar.on) || !!b7.renewing;

    $("subEmail").textContent = me.email || "";
    $("subState").textContent = active
      ? (renewing ? "Member · renews automatically" : "Member · renewal off")
      : (Number(b7.words || 0) > 0 ? "Month ended · words still on the account" : "No membership");

    let rows = "";
    if (active) rows += row("Membership", `Active${ends ? " · ends " + esc(ends) : ""}`);
    else if (b7.expiry) rows += row("Membership", `Ended${ends ? " " + esc(ends) : ""}`);
    else rows += row("Membership", "None yet");
    rows += row("Words left", n(b7.words));
    if (ar && ar.on) {
      rows += row("Renews", esc(day(ar.next_charge)))
            + row("Card", esc((ar.brand ? ar.brand + " " : "") + (ar.card || "on file")))
            + row("Next charge", esc(money(ar.amount, ar.currency)))
            + (ar.failed_attempts ? row("Last charge", "Failed — it will be tried again") : "");
    } else if (renewing) {
      rows += row("Renewal", "On · every 30 days");
    } else {
      rows += row("Renewal", "Off");
    }
    $("subTable").innerHTML = rows;

    let note, actions;
    if (renewing) {
      note = "Cancelling stops every future charge. You keep your days and words until they "
           + "run out, and you can buy another month any time.";
      actions = '<button class="btn sub-cancel" id="subCancel" type="button">Cancel subscription</button>';
    } else if (active || Number(b7.words || 0) > 0) {
      note = "Your card won't be charged again. Your days and words stay until they run out; "
           + "buying another month adds 30 days and 10,000 words on top.";
      actions = '<a class="btn btn-primary sub-buy" href="pricing.html">Buy another month</a>';
    } else {
      note = "Nothing is scheduled to bill this account. A month is 9.5 KWD for 10,000 words, "
           + "and renews every 30 days until you cancel it here.";
      actions = '<a class="btn btn-primary sub-buy" href="pricing.html">See plans</a>';
    }
    $("subNote").textContent = note;
    $("subActions").innerHTML = actions;
    if ($("subCancel")) $("subCancel").onclick = cancel;
  }

  async function cancel(e) {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    if (!confirm("Cancel your subscription?\n\nIt won't renew, and you keep the days and "
                 + "words you have already paid for. Nothing is refunded.")) return;
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = "Cancelling…";
    try {
      const d = await getJson("/api/myfatoorah/cancel", { method: "POST" });
      if (d && d.ok) {
        say(d.message || "Your membership won't renew.");
        await load();                                     // the page now says "Off"
        return;
      }
      say((d && d.error) || "Couldn't cancel it just now. Please try again, or message us on WhatsApp.", true);
    } catch (err) {
      say("Couldn't reach the server. Please try again.", true);
    }
    btn.disabled = false; btn.textContent = label;
  }

  load();
})();
