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
  async function refreshCredits() {
    const m = await me(); const el = $("tnCredits"); const buy = $("tnBuy");
    if (!m || m.error) { el.hidden = true; buy.hidden = !TOKEN ? true : false; return; }
    const n = m.tn_credits;                       // null = staff (unlimited)
    if (n == null) { el.hidden = true; buy.hidden = true; return; }
    const t = Date.parse(m.tn_expiry);
    const exp = Number.isFinite(t) ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
    el.textContent = n > 0 ? `${n} scan${n === 1 ? "" : "s"} available${exp ? " · expire " + exp : ""}`
                           : "No scans yet — buy one to submit your document.";
    el.hidden = false; buy.hidden = false;
  }
  $("tnBuy").onclick = async () => {
    if (!TOKEN) { if (window.b7PromptLogin) b7PromptLogin("Sign in to buy a scan."); return; }
    try {
      const d = await (await fetch(API + "/api/myfatoorah/checkout", {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, H),
        body: JSON.stringify({ plan: "B7oothScan", quantity: 1 }),
      })).json();
      if (d && d.url) { location.href = d.url; return }
      say((d && d.error) || "Couldn't start checkout. Please try again.", true);
    } catch (e) { say("Couldn't reach the payment gateway. Please try again.", true); }
  };

  // ---- submit ----
  const DROP_IDLE = "Drop your document here";
  function showFile() {
    const f = $("tnFile").files[0];
    $("tnFileLbl").textContent = f ? f.name : DROP_IDLE;
    $("tnDrop").classList.toggle("has-file", !!f);
  }
  $("tnFile").onchange = showFile;
  // Drag & drop straight onto the zone.
  const drop = $("tnDrop");
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
      if (d.error) { say(d.error, true); if (d.reason === "no_credits") $("tnBuy").hidden = false; }
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
  function gauge(label, v, warnAt, badAt) {
    if (v == null) return "";
    const cls = v < warnAt ? "good" : (v < badAt ? "warn" : "bad");
    const w = Math.max(3, Math.min(100, v));
    return `<div class="tn-gauge ${cls}">
      <div class="tn-gauge-top"><span>${label}</span><span class="tn-gauge-val">${v}%</span></div>
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
      ? `${o.has_ai_report ? `<button class="tn-dl" data-id="${o.id}" data-kind="ai">⬇ AI report</button>` : ""}` +
        `${o.has_sim_report ? `<button class="tn-dl" data-id="${o.id}" data-kind="sim">⬇ Similarity report</button>` : ""}`
      : "";
    const unread = o.chat_unread ? `<span class="tn-unread">${o.chat_unread}</span>` : "";
    const keep = (o.status === "done" && (o.has_ai_report || o.has_sim_report))
      ? `<p class="tn-keep">Reports stay downloadable for 7 days — save them soon.</p>` : "";
    return `<div class="tn-pane tn-order">
      <div class="tn-row"><span class="tn-file">📄 ${esc(o.filename || "document")}</span>${badge(o.status)}</div>
      <div class="tn-meta">${o.words ? o.words.toLocaleString() + " words · " : ""}${fmt(o.created)}</div>
      ${scores}
      <div class="tn-actions">${dl}<button class="tn-chatbtn" data-id="${o.id}" data-name="${esc(o.filename || "document")}">💬 Chat${unread}</button></div>
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

  setInterval(() => { if (!document.hidden) refresh(); }, 30000);
  refreshCredits();
  refresh();
})();
