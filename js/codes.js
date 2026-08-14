// Staff → Codes: mint B7oothKw word codes, see what happened to them, revoke one.
//
// The backend's code table is shared with Grade A, so this page filters to the
// B7oothKw kind and never shows — or touches — a Grade A plan code.
//
// A B7oothKw code is single-use by design, which is what shapes this screen: there
// is nothing to fill in when making one, and a code has at most one redeemer, so its
// story fits on one row — who took it and when — with no counter and nothing to expand.
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

  // The backend's own words for a code's state, and what staff call them here.
  const LABEL = { active: "Unused", "used up": "Redeemed", expired: "Expired", revoked: "Revoked" };

  function say(t, ok) { const m = $("cdMsg"); m.textContent = t || ""; m.classList.toggle("ok", !!ok); }

  let all = [];
  let filt = "all";
  let fresh = "";                       // the code made this session, highlighted in the list

  async function copy(text, el) {
    const was = el.textContent;
    try { await navigator.clipboard.writeText(text); el.textContent = "Copied"; }
    catch (e) { el.textContent = "Copy failed"; }
    setTimeout(() => { el.textContent = was; }, 1400);
  }

  // ---- mint ----
  $("codeGenBtn").onclick = async () => {
    const btn = $("codeGenBtn");
    btn.disabled = true; say("");
    try {
      const d = await (await fetch(API + "/api/admin/codes", {
        method: "POST", headers: JH,
        // One code, one account: a B7oothKw code is a single 1,000-word grant, so
        // there is nothing for staff to choose here — hence no uses or note field.
        body: JSON.stringify({ plan: B7_PLAN, days: 0, uses: 1, note: "" }),
      })).json();
      if (d.error) { say(d.error); return; }
      fresh = d.code;
      const out = $("codeOut");
      out.innerHTML =
        '<div class="cd-out-eyebrow">New code</div>' +
        '<div class="cd-out-code">' + esc(d.code) + "</div>" +
        '<div class="cd-out-sub">' + n(d.words) + " words &middot; one account</div>" +
        '<button class="btn btn-primary cd-out-copy" id="codeCopy" type="button">Copy code</button>';
      out.classList.remove("hidden");
      $("codeCopy").onclick = (e) => copy(d.code, e.target);
      load();
    } catch (e) {
      say("Couldn't reach the server. Please try again.");
    } finally {
      btn.disabled = false;
    }
  };

  // ---- list ----
  function counts() {
    const c = { all: all.length, active: 0, "used up": 0, expired: 0, revoked: 0 };
    all.forEach((x) => { if (c[x.state] != null) c[x.state]++; });
    document.querySelectorAll(".cd-n").forEach((el) => { el.textContent = c[el.dataset.n] || 0; });
  }

  // One line per code: who took it, or — while nobody has — when it stops working.
  function sub(c) {
    const r = (c.redemptions || [])[0];
    if (r) return esc(r.email) + " &middot; " + when(r.ts);
    if (c.state === "active") return "expires " + when(c.expires);
    return "made " + when(c.created);
  }

  function row(c) {
    const live = c.state === "active";
    const dead = c.state === "expired" || c.state === "revoked";
    return '<div class="cd-row' + (c.code === fresh ? " new" : "") + (dead ? " dead" : "") + '">' +
      '<button class="cd-copy" type="button" data-code="' + esc(c.code) + '" title="Copy code">' +
        '<span class="cd-code">' + esc(c.code) + "</span></button>" +
      '<span class="cd-sub">' + sub(c) + "</span>" +
      // Through esc() like everything else here: c.state is server-typed and the four
      // known values are in LABEL above, but this one lands in a CLASS attribute, which
      // is the one place on this page a raw string would be worth something.
      '<span class="cd-pill st-' + esc(String(c.state || "").replace(" ", "-")) + '">' +
        esc(LABEL[c.state] || c.state) + "</span>" +
      (live ? '<button class="code-btn cd-rev" type="button" data-code="' + esc(c.code) +
              '">Revoke</button>' : '<span class="cd-rev-gap"></span>') +
      "</div>";
  }

  function render() {
    const q = ($("codeSearch").value || "").trim().toLowerCase();
    const rows = all.filter((c) => {
      if (filt !== "all" && c.state !== filt) return false;
      if (!q) return true;
      return [c.code, (c.redemptions || []).map((r) => r.email).join(" ")]
        .join(" ").toLowerCase().indexOf(q) >= 0;
    });
    if (!rows.length) {
      $("codeBody").innerHTML = '<p class="code-empty">' +
        (all.length ? "No codes match that." : "No codes yet — generate one above.") + "</p>";
      return;
    }
    $("codeBody").innerHTML = '<div class="cd-list">' + rows.map(row).join("") + "</div>";
    $("codeBody").querySelectorAll(".cd-copy").forEach((b) => {
      b.onclick = () => copy(b.dataset.code, b.querySelector(".cd-code"));
    });
    $("codeBody").querySelectorAll(".cd-rev").forEach((b) => { b.onclick = () => revoke(b.dataset.code); });
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

  function fail(msg) { $("codeBody").innerHTML = '<p class="code-empty">' + esc(msg) + "</p>"; }

  async function load() {
    if (!TOKEN) { fail(window.b7NoTokenMsg ? b7NoTokenMsg() : "Please sign in."); return; }
    try {
      const d = await (await fetch(API + "/api/admin/codes", { headers: H })).json();
      if (d.error) { fail(d.error); return; }
      all = (d.codes || []).filter((c) => c.kind === B7_KIND);
      counts();
      render();
    } catch (e) {
      fail("Couldn't load the codes. Check your connection.");
    }
  }

  $("codeTabs").addEventListener("click", (e) => {
    const t = e.target.closest(".cd-tab");
    if (!t) return;
    filt = t.dataset.st;
    $("codeTabs").querySelectorAll(".cd-tab").forEach((b) => b.classList.toggle("on", b === t));
    render();
  });
  $("codeSearch").oninput = render;
  $("codeRefreshBtn").onclick = load;
  load();
})();
