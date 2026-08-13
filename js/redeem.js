// Redeem a B7oothKw code: words onto this account's balance.
// The backend does all the deciding (auth.redeem_code) — this only types the code
// in nicely and reports what came back.
(function () {
  const API = (window.HUMANIZER_API || "").replace(/\/+$/, "");
  const BKEY = window.BRANCH_KEY || "";
  const TOKEN = (function () { try { const t = localStorage.getItem("b7_token"); return (t && t !== "guest") ? t : ""; } catch (e) { return ""; } })();
  const H = { "X-Branch-Key": BKEY };
  if (TOKEN) H["Authorization"] = "Bearer " + TOKEN;
  const JH = Object.assign({ "Content-Type": "application/json" }, H);

  const $ = (id) => document.getElementById(id);
  const input = $("redeemInput"), btn = $("redeemBtn"), msgEl = $("redeemMsg"), statusEl = $("redeemStatus");
  const n = (v) => Number(v || 0).toLocaleString("en-US");

  function say(text, ok) {
    msgEl.textContent = text || "";
    msgEl.classList.toggle("ok", !!ok);
    msgEl.classList.toggle("hidden", !text);
  }

  // Type it the way it's printed. The backend accepts any spelling, but a field that
  // punctuates itself is how the person reading a code off a phone keeps their place.
  input.addEventListener("input", () => {
    const raw = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^(B7|GA)/, "");
    const parts = ["B7"];
    if (raw.length) parts.push(raw.slice(0, 4));
    if (raw.length > 4) parts.push(raw.slice(4, 8));
    input.value = raw.length ? parts.join("-") : "";
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") redeem(); });

  // What the account is holding right now, under the ticket.
  async function showBalance() {
    if (!TOKEN) return;
    let me = null;
    try { me = await (await fetch(API + "/api/auth/me", { headers: H })).json(); } catch (e) { return; }
    const b7 = me && me.b7;
    if (!b7) return;
    const words = b7.active ? b7.words : b7.trial;
    if (words == null) return;
    statusEl.innerHTML =
      '<div class="rd-live"><span class="rd-live-n">' + n(words) + " words</span>" +
      '<span class="rd-live-txt">' +
      (b7.active ? "on your membership" : "on your account") + "</span></div>";
    statusEl.classList.remove("hidden");
  }

  async function redeem() {
    if (!TOKEN) { if (window.b7PromptLogin) b7PromptLogin("Sign in to redeem a code."); return; }
    const code = (input.value || "").trim();
    if (!code) { say("Enter your code."); return; }
    btn.disabled = true;
    say("");
    try {
      const r = await fetch(API + "/api/redeem", {
        method: "POST", headers: JH, body: JSON.stringify({ code }),
      });
      const d = await r.json();
      if (d.error) { say(d.error); return; }
      say(`Redeemed — ${n(d.words)} words added. You now have ${n(d.balance)}.`, true);
      input.value = "";
      showBalance();
    } catch (e) {
      say("Couldn't reach the server. Please try again.");
    } finally {
      btn.disabled = false;
    }
  }

  btn.onclick = redeem;
  showBalance();
})();
