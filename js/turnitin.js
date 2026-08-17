// B7oothKw Turnitin page: submit a document for a REAL Turnitin check,
// track your orders, download the reports, chat with the team.
// Same backend + login as the humanizer; the branch key marks us as the B7ooth site.
(function () {
  const API = (window.HUMANIZER_API || "").replace(/\/+$/, "");
  const BKEY = window.BRANCH_KEY || "";
  const TOKEN = (function () { try { const t = localStorage.getItem("b7_token"); return (t && t !== "guest") ? t : ""; } catch (e) { return ""; } })();
  const H = { "X-Branch-Key": BKEY };            // fetch sets multipart boundaries itself
  if (TOKEN) H["Authorization"] = "Bearer " + TOKEN;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (iso) => { try { return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };

  function say(text, bad) { const m = $("tnMsg"); m.textContent = text; m.classList.toggle("bad", !!bad); m.classList.remove("hidden"); }

  // ---- credits ----
  async function me() {
    if (!TOKEN) return null;
    try { return await (await fetch(API + "/api/auth/me", { headers: H })).json(); }
    catch (e) { return null; }
  }
  // How many scans to buy. The cap, the clamping and the total all live in js/qty.js,
  // because the pricing card sells the same product and the two must not disagree.
  const STEP = b7Qty.mount({
    input: $("tnQty"), minus: $("tnQtyMinus"), plus: $("tnQtyPlus"),
    label: $("tnQtyLbl"), total: $("tnQtyTotal"), button: $("tnBuy"),
    plan: "B7oothScan", one: "Buy a scan", many: "Buy {n} scans",
  });
  const qty = STEP.value;

  // Blur out and disable the whole upload flow when there is nothing to spend on it,
  // the way Grade A does. Without this the drop zone, the note and the Submit button
  // all looked usable with zero scans, and the only thing that said otherwise was the
  // server refusing AFTER someone had picked a file and pressed Submit.
  function lockUploads(locked) {
    const area = $("tnUparea");
    if (area) area.classList.toggle("tno-locked", locked);
    const drop = $("tnDrop");
    if (drop) drop.setAttribute("tabindex", locked ? "-1" : "0");
  }

  function isLocked() {
    const area = $("tnUparea");
    return !!area && area.classList.contains("tno-locked");
  }

  // The credits strip: how many scans you hold, and the buy button beside it. Styled
  // green when you have some and amber when you don't, like Grade A's.
  async function refreshCredits() {
    const box = $("tnCredits"), txt = $("tnCredTxt"), buy = $("tnBuy");
    const qbox = $("tnQtyBox");
    const show = (on) => box.classList.toggle("hidden", !on);
    box.classList.remove("has", "empty", "staff");
    const m = await me();
    if (!m || m.error) {                          // signed out: nothing can be submitted
      show(false); buy.classList.add("hidden"); qbox.classList.add("hidden");
      lockUploads(true); return;
    }
    const n = m.tn_credits;                       // null = staff (unlimited)
    if (n == null) {
      txt.innerHTML = "<b>Unlimited</b> scans on this account.";
      box.classList.add("staff"); show(true);
      buy.classList.add("hidden"); qbox.classList.add("hidden");
      lockUploads(false); return;
    }
    txt.innerHTML = n > 0
      ? `<b>${n}</b> scan${n === 1 ? "" : "s"} available.`
      : "No scans yet &mdash; buy one to submit your document.";
    box.classList.add(n > 0 ? "has" : "empty");
    show(true); buy.classList.remove("hidden"); qbox.classList.remove("hidden");
    lockUploads(n <= 0);
    STEP.render();
  }
  $("tnBuy").onclick = async () => {
    if (!TOKEN) { if (window.b7PromptLogin) b7PromptLogin("Sign in to buy a scan."); return; }
    try {
      const d = await (await fetch(API + "/api/myfatoorah/checkout", {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, H),
        body: JSON.stringify({ plan: "B7oothScan", quantity: qty() }),
      })).json();
      // Only ever walk to MyFatoorah — see b7PayUrlOk in js/auth.js.
      if (d && d.url && window.b7PayUrlOk && !b7PayUrlOk(d.url)) {
        say("That checkout link doesn't look right, so we didn't open it. Please try again.", true);
        return;
      }
      if (d && d.url) { location.href = d.url; return }
      say((d && d.error) || "Couldn't start checkout. Please try again.", true);
    } catch (e) { say("Couldn't reach the payment gateway. Please try again.", true); }
  };

  // ---- submit ----
  // The chosen file shows in its own row under the zone; the zone keeps its prompt.
  function showFile() {
    const f = $("tnFile").files[0], sel = $("tnSelected");
    sel.classList.toggle("hidden", !f);
    sel.innerHTML = f
      ? `<span aria-hidden="true">📎</span><span>${esc(f.name)}</span>` +
        `<button class="tno-clear" type="button" aria-label="Remove file">✕</button>` : "";
    if (f) sel.querySelector(".tno-clear").onclick = (e) => {
      e.stopPropagation(); $("tnFile").value = ""; showFile();
    };
  }
  $("tnFile").onchange = showFile;
  const drop = $("tnDrop");
  // Click (and Enter/Space, since the zone is role="button" tabindex="0") opens the
  // picker. Without this the only way in was drag-and-drop — which phones do not have,
  // so the word "browse" did nothing and the paid scan could not be started at all.
  // The input lives INSIDE the zone, so its own click bubbles back here; ignore that one
  // rather than leaning on the browser's re-entrancy flag to break the loop.
  drop.addEventListener("click", (e) => { if (e.target !== $("tnFile")) $("tnFile").click(); });
  drop.addEventListener("keydown", (e) => {
    // The locked overlay is pointer-events:none, which stops the mouse but NOT the
    // keyboard — the zone is still tabbable, so Enter would open the picker on a
    // locked card. Check the state rather than relying on CSS to enforce it.
    if (isLocked()) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("tnFile").click(); }
  });
  // Drag & drop straight onto the zone.
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag"); }));
  drop.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      $("tnFile").files = e.dataTransfer.files;
      showFile();
    }
  });
  $("tnSubmit").onclick = async () => {
    const f = $("tnFile").files[0];
    if (!TOKEN) { if (window.b7PromptLogin) b7PromptLogin("Sign in to submit a Turnitin scan."); return; }
    if (!f) { say("Choose a file first.", true); return; }
    const btn = $("tnSubmit"); btn.disabled = true; btn.textContent = "Uploading…";
    try {
      const fd = new FormData(); fd.append("file", f, f.name); fd.append("note", $("tnNote").value || "");
      const d = await (await fetch(API + "/api/turnitin/submit", { method: "POST", headers: H, body: fd })).json();
      if (d.error) { say(d.error, true); if (d.reason === "no_credits") refreshCredits(); }
      else {
        say("Submitted! Your Turnitin score appears below within 6 hours.");
        $("tnFile").value = ""; showFile(); $("tnNote").value = "";
        refreshCredits();
        refresh();
      }
    } catch (e) { say("Service is temporarily unavailable. Please try again shortly.", true); }
    btn.disabled = false; btn.textContent = "Submit for Turnitin check";
  };

  // ---- my orders ----
  function badge(st) { return st === "done" ? `<span class="tn-badge done">Completed</span>` : `<span class="tn-badge pend">Pending</span>`; }
  // Number() rather than esc() on the two percentages: they land in a style attribute and
  // in text, they are always numbers coming out of the API, and a number is the only thing
  // either place should accept. Same reason as esc() everywhere else — this file's rule is
  // that nothing reaches innerHTML raw, and these were the last three that did.
  function gauge(label, v, warnAt, badAt) {
    if (v == null) return "";
    const cls = v < warnAt ? "good" : (v < badAt ? "warn" : "bad");
    const num = Number(v) || 0;
    const w = Math.max(3, Math.min(100, num));
    return `<div class="tn-gauge ${cls}">
      <div class="tn-gauge-top"><span>${esc(label)}</span><span class="tn-gauge-val">${num}%</span></div>
      <div class="tn-gauge-bar"><i style="width:${w}%"></i></div>
    </div>`;
  }
  function card(o) {
    const gauges = (o.status === "done") ? `${gauge("AI detection", o.ai_pct, 20, 50)}${gauge("Similarity", o.similarity, 20, 40)}` : "";
    const scores = (o.status === "done")
      ? (gauges ? `<div class="tn-gauges">${gauges}</div>` : "") +
        (o.result_note ? `<p class="tn-note">“${esc(o.result_note)}”</p>` : "")
      : `<div class="tn-waiting"><span class="tn-spin"></span> Pending — we're running it on Turnitin.</div>`;
    const dl = (o.status === "done")
      ? `${o.has_ai_report ? `<button class="tn-dl" data-id="${esc(o.id)}" data-kind="ai">⬇ AI report</button>` : ""}` +
        `${o.has_sim_report ? `<button class="tn-dl" data-id="${esc(o.id)}" data-kind="sim">⬇ Similarity report</button>` : ""}`
      : "";
    const unread = o.chat_unread ? `<span class="tn-unread">${Number(o.chat_unread) || 0}</span>` : "";
    const keep = (o.status === "done" && (o.has_ai_report || o.has_sim_report))
      ? `<p class="tn-keep">Reports stay downloadable for 7 days — save them soon.</p>` : "";
    return `<div class="tn-pane tn-order">
      <div class="tn-row"><span class="tn-file">📄 ${esc(o.filename || "document")}</span>${badge(o.status)}</div>
      <div class="tn-meta">${o.words ? (Number(o.words) || 0).toLocaleString() + " words · " : ""}${esc(fmt(o.created))}</div>
      ${scores}
      <div class="tn-actions">${dl}<button class="tn-chatbtn" data-id="${esc(o.id)}" data-name="${esc(o.filename || "document")}">💬 Chat${unread}</button></div>
      ${keep}
    </div>`;
  }
  async function refresh() {
    const el = $("tnOrders");
    if (!TOKEN) { el.innerHTML = `<p class="tn-empty">Sign in to see your scans.</p>`; return; }
    try {
      const d = await (await fetch(API + "/api/turnitin/mine", { headers: H })).json();
      if (d.error) { el.innerHTML = `<p class="tn-empty">${esc(d.error)}</p>`; return; }
      const orders = d.orders || [];
      el.innerHTML = orders.length ? orders.map(card).join("")
        : `<p class="tn-empty">No scans yet. Upload a document above to get started.</p>`;
      el.querySelectorAll(".tn-dl").forEach((b) => b.onclick = () => download(b.dataset.id, b.dataset.kind));
      el.querySelectorAll(".tn-chatbtn").forEach((b) => b.onclick = () => chatOpen(b.dataset.id, b.dataset.name));
    } catch (e) { el.innerHTML = `<p class="tn-empty">Service is temporarily unavailable.</p>`; }
  }
  async function download(id, kind) {
    try {
      const r = await fetch(`${API}/api/turnitin/${id}/report/${kind}`, { headers: H });
      if (!r.ok) return;
      // The API reports "expired / not attached" as a JSON body — don't save that as a .pdf.
      if ((r.headers.get("content-type") || "").includes("json")) {
        const d = await r.json();
        say(d.error || "This report is no longer available.", true);
        return;
      }
      const blob = await r.blob(); const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = kind === "ai" ? "Turnitin AI report.pdf" : "Turnitin similarity report.pdf";
      a.click(); URL.revokeObjectURL(a.href);
    } catch (e) {}
  }

  // ---- chat ----
  let chatId = null, chatTimer = null;
  function chatClose() { chatId = null; clearInterval(chatTimer); $("tnChatOvl").classList.add("hidden"); refresh(); }
  async function chatPull() {
    if (!chatId) return;
    try {
      const d = await (await fetch(`${API}/api/turnitin/${chatId}/chat`, { headers: H })).json();
      if (d.error) return;
      const body = $("tnChatBody");
      const stick = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
      body.innerHTML = (d.messages || []).map((m) =>
        `<div class="tn-msgb ${m.sender === "user" ? "me" : "them"}"><p>${esc(m.body)}</p><span>${fmt(m.created)}</span></div>`
      ).join("") || `<p class="tn-empty">No messages yet — ask us anything about this scan.</p>`;
      if (stick) body.scrollTop = body.scrollHeight;
    } catch (e) {}
  }
  function chatOpen(id, name) {
    chatId = id;
    $("tnChatTitle").textContent = "Chat — " + name;
    $("tnChatBody").innerHTML = `<p class="tn-empty">Loading…</p>`;
    $("tnChatOvl").classList.remove("hidden");
    chatPull();
    clearInterval(chatTimer); chatTimer = setInterval(chatPull, 5000);
  }
  $("tnChatClose").onclick = chatClose;
  $("tnChatOvl").addEventListener("click", (e) => { if (e.target === $("tnChatOvl")) chatClose(); });
  $("tnChatSend").onclick = async () => {
    const inp = $("tnChatInp"); const text = (inp.value || "").trim();
    if (!text || !chatId) return;
    inp.value = "";
    try {
      const fd = new FormData(); fd.append("body", text);
      await fetch(`${API}/api/turnitin/${chatId}/chat`, { method: "POST", headers: H, body: fd });
      chatPull();
    } catch (e) {}
  };
  $("tnChatInp").addEventListener("keydown", (e) => { if (e.key === "Enter") $("tnChatSend").click(); });

  // ---- back from MyFatoorah ----
  // A scan now returns HERE rather than to the humanizer, because this is the page with
  // the upload box it pays for. The webhook is what grants the credit, so poll for a
  // real INCREASE over the balance before checkout — a re-buy already had credits, so
  // ">0" would toast success before the grant landed (or when it never did).
  (async function () {
    const paid = new URLSearchParams(location.search).get("paid");
    if (paid == null) return;
    history.replaceState(null, "", location.pathname);       // don't re-toast on refresh
    if (paid === "0") { say("Payment didn't complete — you weren't charged.", true); return; }
    say("Payment received — activating…");
    const m0 = await me();
    const before = (m0 && m0.tn_credits) || 0;
    let tries = 0;
    const t = setInterval(async () => {
      const m = await me();
      if (m && (m.tn_credits == null || (m.tn_credits || 0) > before)) {
        clearInterval(t); refreshCredits();
        say("You're all set — your scan is ready to use.");
        return;
      }
      if (++tries >= 12) {
        clearInterval(t);
        say("Payment is processing — it can take a minute. Refresh shortly.");
      }
    }, 3000);
  })();

  setInterval(() => { if (!document.hidden) refresh(); }, 30000);
  refreshCredits();
  refresh();
})();
