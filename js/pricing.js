// B7oothKw plans page: show what the account has right now, and sell the two things.
// Buying only creates the invoice — the WEBHOOK is what grants, so after paying the
// user lands back on the humanizer, which polls until the grant appears.
(function () {
  const API = (window.HUMANIZER_API || "").replace(/\/+$/, "");
  const BKEY = window.BRANCH_KEY || "";
  const TOKEN = (function () {
    try { const t = localStorage.getItem("b7_token"); return (t && t !== "guest") ? t : ""; }
    catch (e) { return ""; }
  })();
  const H = { "X-Branch-Key": BKEY };
  if (TOKEN) H["Authorization"] = "Bearer " + TOKEN;
  const JH = Object.assign({ "Content-Type": "application/json" }, H);

  const $ = (id) => document.getElementById(id);
  const n = (v) => Number(v || 0).toLocaleString("en-US");

  function say(text, bad) {
    const m = $("plans-msg");
    m.textContent = text || "";
    m.classList.toggle("bad", !!bad);
  }

  // ---- what you have right now ----
  async function me() {
    if (!TOKEN) return null;
    try { return await (await fetch(API + "/api/auth/me", { headers: H })).json(); }
    catch (e) { return null; }
  }

  function renderBalance(m) {
    const box = $("prBalance");
    if (!m || m.error || !m.b7) return;                 // signed out: the cards speak for themselves
    const b7 = m.b7;
    let text, cls;
    if (b7.active) {
      const t = Date.parse(b7.expiry);
      const end = Number.isFinite(t)
        ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
      text = `You have ${n(b7.words)} words left` + (end ? ` · your month ends ${end}` : "");
      cls = "is-member";
    } else if (Number(b7.words || 0) > 0) {
      // A month that ended with words unspent. They are not gone — a re-buy stacks on
      // top of whatever is left — so "you've used all your free words" would be the
      // opposite of the truth here.
      text = `Your month has ended, with ${n(b7.words)} words still on the account` +
             (b7.trial > 0 ? ` and ${n(b7.trial)} free words unused` : "") +
             ". Buy another month and they're yours again";
      cls = "is-trial";
    } else if (b7.trial > 0) {
      // "150 of your 150 left" reads like an accident on an account that hasn't
      // started yet — say what it is instead.
      text = (b7.trial >= b7.trial_total)
        ? `You have ${n(b7.trial)} free words to start`
        : `You have ${n(b7.trial)} of your ${n(b7.trial_total)} free words left`;
      cls = "is-trial";
    } else {
      text = "You've used all your free words";
      cls = "is-empty";
    }
    $("prBalText").textContent = text;
    box.classList.add(cls);
    box.hidden = false;
  }

  // ---- buy ----
  let busy = false;
  async function buyPlan(plan, btn) {
    if (!TOKEN) {
      if (window.b7PromptLogin) b7PromptLogin("Sign in first — your purchase is tied to your account.");
      else location.href = "login.html";
      return;
    }
    if (busy) return;                                   // one invoice per click; a redirect is coming
    busy = true; btn.disabled = true; say("Opening checkout…");
    try {
      const d = await (await fetch(API + "/api/myfatoorah/checkout", {
        method: "POST", headers: JH, body: JSON.stringify({ plan, quantity: 1 }),
      })).json();
      if (d && d.url) { location.href = d.url; return }  // stays disabled; we're leaving the page
      say((d && d.error) || "Couldn't start checkout. Please try again.", true);
    } catch (e) {
      say("Couldn't reach the payment gateway. Please try again.", true);
    }
    busy = false; btn.disabled = false;
  }

  $("buy-month").onclick = (e) => buyPlan("B7oothMonth", e.currentTarget);
  $("buy-scan").onclick = (e) => buyPlan("B7oothScan", e.currentTarget);

  me().then(renderBalance);
})();
