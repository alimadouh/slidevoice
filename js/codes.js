// Staff → Codes: mint B7oothKw word codes, see who redeemed them, revoke one.
//
// The backend's code table is shared with Grade A, so this page filters to the
// B7oothKw kind and never shows — or touches — a Grade A plan code.
(function () {
  const API = (window.HUMANIZER_API || "").replace(/\/+$/, "");
  const BKEY = window.BRANCH_KEY || "";
  const TOKEN = (function () { try { const t = localStorage.getItem("b7_token"); return (t && t !== "guest") ? t : ""; } catch (e) { return ""; } })();
  const H = { "X-Branch-Key": BKEY };
  if (TOKEN) H["Authorization"] = "Bearer " + TOKEN;
  const JH = Object.assign({ "Content-Type": "application/json" }, H);

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const n = (v) => Number(v || 0).toLocaleString("en-US");
  const when = (iso) => {
    try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch (e) { return ""; }
  };
  const B7_PLAN = "B7oothWords";        // matches auth.B7_CODE_PLAN
  const B7_KIND = "b7_words";           // matches auth.B7_CODE_KIND

  function say(t, ok) { const m = $("cdMsg"); m.textContent = t || ""; m.classList.toggle("ok", !!ok); }

  let all = [];

  // ---- mint ----
  $("codeGenBtn").onclick = async () => {
    const btn = $("codeGenBtn");
    btn.disabled = true; say("");
    try {
      const d = await (await fetch(API + "/api/admin/codes", {
        method: "POST", headers: JH,
        body: JSON.stringify({
          plan: B7_PLAN,
          days: 0,                       // a words code has no duration; the server ignores it
          uses: Math.max(1, parseInt($("codeUses").value, 10) || 1),
          note: $("codeNote").value || "",
        }),
      })).json();
      if (d.error) { say(d.error); return; }
      const out = $("codeOut");
      out.innerHTML =
        '<div class="code-out-code">' + esc(d.code) + "</div>" +
        '<div class="code-out-sub">' + n(d.words) + " words &middot; " +
        d.max_uses + (d.max_uses === 1 ? " use" : " uses") + "</div>" +
        '<button class="code-btn" id="codeCopy" type="button">Copy code</button>';
      out.classList.remove("hidden");
      $("codeCopy").onclick = async (e) => {
        try { await navigator.clipboard.writeText(d.code); e.target.textContent = "Copied"; }
        catch (err) { e.target.textContent = "Copy failed"; }
        setTimeout(() => (e.target.textContent = "Copy code"), 1500);
      };
      $("codeNote").value = "";
      load();
    } catch (e) {
      say("Couldn't reach the server. Please try again.");
    } finally {
      btn.disabled = false;
    }
  };

  // ---- list ----
  function render() {
    const q = ($("codeSearch").value || "").trim().toLowerCase();
    const st = $("codeFState").value;
    const rows = all.filter((c) => {
      if (st !== "all" && c.state !== st) return false;
      if (!q) return true;
      const hay = [c.code, c.note, (c.redemptions || []).map((r) => r.email).join(" ")]
        .join(" ").toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    $("codeCounts").textContent =
      rows.length + " of " + all.length + (all.length === 1 ? " code" : " codes");
    if (!rows.length) {
      $("codeBody").innerHTML = '<p class="code-empty">' +
        (all.length ? "No codes match that." : "No codes yet — generate one above.") + "</p>";
      return;
    }
    $("codeBody").innerHTML = '<div class="code-list">' + rows.map(item).join("") + "</div>";
    // Open a card to see who redeemed it.
    $("codeBody").querySelectorAll(".code-head").forEach((h) => {
      h.onclick = () => h.closest(".code-item").classList.toggle("open");
    });
    $("codeBody").querySelectorAll(".code-rev").forEach((b) => { b.onclick = () => revoke(b.dataset.code); });
  }

  function item(c) {
    const live = c.state === "active";
    const reds = c.redemptions || [];
    return '<div class="code-item">' +
      '<button class="code-head" type="button">' +
        '<span class="code-val">' + esc(c.code) + "</span>" +
        '<span class="code-tags">' +
          '<span class="code-tag words">' + n(c.words) + " words</span>" +
          '<span class="code-tag">' + c.uses + "/" + c.max_uses + " used</span>" +
          '<span class="code-tag ' + (live ? "code-st-on" : "code-st-off") + '">' + esc(c.state) + "</span>" +
        "</span>" +
      "</button>" +
      '<div class="code-meta"><span>' +
        (c.note ? esc(c.note) + " &middot; " : "") +
        "made " + when(c.created) + " &middot; expires " + when(c.expires) +
      "</span>" +
      (live ? '<span class="code-acts"><button class="code-btn code-rev" type="button" data-code="' +
                esc(c.code) + '">Revoke</button></span>' : "") +
      "</div>" +
      '<div class="code-reds">' + (reds.length
        ? reds.map((r) => '<div class="prow"><span>' + esc(r.email) + "</span><span>" +
                           when(r.ts) + "</span></div>").join("")
        : '<div class="prow"><span>Not redeemed yet.</span><span></span></div>') +
      "</div></div>";
  }

  async function revoke(code) {
    if (!confirm("Stop " + code + "? Words already handed out stay with the accounts that redeemed them.")) return;
    say("");
    try {
      // end_grants is deliberately not sent: words are spent, not leased, so there is
      // nothing to claw back — and taking them would hit people who did nothing wrong.
      const d = await (await fetch(API + "/api/admin/codes/revoke", {
        method: "POST", headers: JH, body: JSON.stringify({ code }),
      })).json();
      if (d.error) { say(d.error); return; }
      say("Revoked " + code + ".", true);
      load();
    } catch (e) {
      say("Couldn't reach the server. Please try again.");
    }
  }

  async function load() {
    if (!TOKEN) { $("codeBody").innerHTML = '<p class="code-empty">Please sign in.</p>'; return; }
    try {
      const d = await (await fetch(API + "/api/admin/codes", { headers: H })).json();
      if (d.error) {
        $("codeBody").innerHTML = '<p class="code-empty">' + esc(d.error) + "</p>";
        return;
      }
      all = (d.codes || []).filter((c) => c.kind === B7_KIND);
      if (d.b7_words) $("cdWorth").textContent = n(d.b7_words) + " words";
      render();
    } catch (e) {
      $("codeBody").innerHTML = '<p class="code-empty">Couldn\'t load the codes. Check your connection.</p>';
    }
  }

  $("codeSearch").oninput = render;
  $("codeFState").onchange = render;
  $("codeRefreshBtn").onclick = load;
  load();
})();
