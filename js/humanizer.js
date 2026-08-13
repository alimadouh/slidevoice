// B7oothKw Humanizer — "branch" client. Requires login; sends the user's token so
// the server meters per-account. Always Model 2. Dark workspace like Grade A.

const API  = (window.HUMANIZER_API || "").replace(/\/$/, "");
const BKEY = window.BRANCH_KEY || "";
const TOKEN = (function () { try { var t = localStorage.getItem("b7_token"); return (t && t !== "guest") ? t : ""; } catch (e) { return ""; } })();
// Branch requests carry the public key (tags the origin) AND the logged-in token
// (the server meters per-account and rejects guests).
const JH = { "Content-Type": "application/json", "X-Branch-Key": BKEY };
const BH = { "X-Branch-Key": BKEY };                  // for multipart / GET (no JSON content-type)
if (TOKEN) { JH["Authorization"] = "Bearer " + TOKEN; BH["Authorization"] = "Bearer " + TOKEN; }
const LEVEL = 8;                          // Model 2 ignores level; fixed request shape
const RED = 0.5, AMBER = 0.305;           // sentence colour thresholds

const $ = (id) => document.getElementById(id);
const esc = (s) => (s || "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Guests can see the UI but must log in to actually run a tool.
function needLogin(message) {
  if (window.b7HasToken && window.b7HasToken()) return false;
  if (window.b7PromptLogin) window.b7PromptLogin(message);
  else location.href = "login.html";
  return true;
}

// ---------------------------------------------------------------- tabs
const panes = { text: $("pane-text"), pptx: $("pane-pptx") };
const tabs  = { text: $("tab-text"), pptx: $("tab-pptx") };
function showTab(which) {
  for (const k of ["text", "pptx"]) {
    tabs[k].classList.toggle("on", k === which);
    panes[k].classList.toggle("hidden", k !== which);
  }
}
tabs.text.onclick = () => showTab("text");
tabs.pptx.onclick = () => showTab("pptx");

// ---------------------------------------------------------------- elements
const input = $("hz-input"), out = $("hz-out");
const inPane = $("inPane"), outPane = $("outPane");
const ring = $("ring"), ringNum = $("ringNum");
const btnHum = $("btn-humanize"), btnStopHum = $("btn-stop-hum"), btnCheck = $("btn-check");
const btnClear = $("btn-clear"), btnGreen = $("btn-green"), btnStopGreen = $("btn-stop-green"), btnCopy = $("hz-copy");
const bar = $("hz-bar"), barFill = $("hz-bar-fill"), msgEl = $("hz-msg");

let lastBlocks = null, lastText = "", busy = false;
let humAbort = null, greenAbort = null;

// ---------------------------------------------------------------- helpers
function msg(t, ok) { msgEl.textContent = t || ""; msgEl.classList.toggle("ok", !!ok); }
const wordCount = (s) => (s.match(/\S+/g) || []).length;

function setInWords() { $("inWords").innerHTML = `<b>${wordCount(input.value)}</b> words`; }
function setOutWords() { $("outWords").innerHTML = `<b>${wordCount(lastText)}</b> words`; }
input.addEventListener("input", setInWords);

function colorOf(p) { return p >= RED ? "ai" : p >= AMBER ? "mid" : "human"; }
function hasFlagged(blocks) {
  return !!blocks && blocks.some((b) => b.type === "body" &&
    (b.sentences || []).some((s) => (s.p || 0) >= AMBER));
}
function flaggedPct(blocks) {
  let flagged = 0, total = 0;
  (blocks || []).forEach((b) => {
    if (b.type !== "body" || !b.sentences) return;
    b.sentences.forEach((s) => {
      const w = wordCount(s.t || ""); total += w;
      if (colorOf(s.p || 0) !== "human") flagged += w;
    });
  });
  return total ? Math.round((100 * flagged) / total) : 0;
}

function refreshButtons() {
  btnCheck.disabled = btnHum.disabled = busy;
  btnGreen.disabled = busy || !hasFlagged(lastBlocks);
  btnCopy.disabled = busy || !lastText;
  btnClear.disabled = busy;
}

// ---------------------------------------------------------------- score ring
function animateRingNum(target) {
  if (ringNum._raf) cancelAnimationFrame(ringNum._raf);
  const start = parseFloat(ringNum.textContent) || 0;
  if (reduceMotion || start === target) { ringNum.textContent = target + "%"; return; }
  const t0 = performance.now(), dur = 850;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    ringNum.textContent = Math.round(start + (target - start) * e) + "%";
    if (k < 1) ringNum._raf = requestAnimationFrame(step);
  };
  ringNum._raf = requestAnimationFrame(step);
}
function updateScore(aiPct) {
  const col = aiPct >= 20 ? "#f0564b" : aiPct >= 8 ? "#d8a234" : "#3fb950";
  ring.style.setProperty("--lvl", Math.round(aiPct));
  ring.style.setProperty("--col", col);
  ring.classList.toggle("safe", col === "#3fb950");
  if (col === "#3fb950" && aiPct >= 0) { ring.classList.remove("fx-pop"); void ring.offsetWidth; ring.classList.add("fx-pop"); }
  ringNum.style.color = col;
  animateRingNum(Math.round(aiPct));
}
function resetRing() {
  ring.style.setProperty("--lvl", 0); ring.style.setProperty("--col", "#6e7681");
  ring.classList.remove("safe", "fx-pop"); ringNum.style.color = ""; ringNum.textContent = "—";
}

// ---------------------------------------------------------------- render
function renderBlocks(blocks) {
  let html = "", i = 0;
  for (const b of blocks || []) {
    if (b.type === "body") {
      let para = "";
      for (const s of b.sentences || [])
        para += `<span class="sent ${colorOf(s.p || 0)}" style="--i:${i++}">${esc(s.t)}</span> `;
      html += `<p>${para.trim()}</p>`;
    } else if (b.type === "heading") {
      html += `<span class="hz-h">${esc(b.text || "")}</span>`;
    } else if (b.text) {
      html += `<p>${esc(b.text)}</p>`;
    }
  }
  out.innerHTML = html || '<div class="placeholder">No text returned.</div>';
}
function applyData(data, ripple) {
  lastBlocks = data.blocks || [];
  lastText = data.text || "";
  renderBlocks(lastBlocks);
  if (ripple && !reduceMotion) {
    out.classList.remove("fx-ripple", "fx-reveal"); void out.offsetWidth;
    out.classList.add("fx-ripple", "fx-reveal");
  }
  updateScore(flaggedPct(lastBlocks));
  setOutWords();
  refreshButtons();
}

// ---------------------------------------------------------------- button ripple
btnHum.addEventListener("click", (e) => {
  if (reduceMotion) return;
  const r = btnHum.getBoundingClientRect();
  const d = document.createElement("span");
  d.className = "btn-ripple";
  const size = Math.max(r.width, r.height);
  d.style.width = d.style.height = size + "px";
  d.style.left = (e.clientX - r.left) + "px";
  d.style.top = (e.clientY - r.top) + "px";
  btnHum.appendChild(d);
  setTimeout(() => d.remove(), 560);
});

// ---------------------------------------------------------------- actions
async function humanize() {
  if (needLogin("Log in to humanize your text — it’s free.")) return;
  const text = input.value.trim();
  if (!text) { msg("Paste some text first."); return; }
  busy = true; refreshButtons();
  btnHum.classList.add("loading"); btnStopHum.style.display = "";
  inPane.classList.add("fx-humanizing"); msg("");
  humAbort = new AbortController();
  try {
    const r = await fetch(API + "/api/humanize", {
      method: "POST", headers: JH, signal: humAbort.signal,
      body: JSON.stringify({ text, level: LEVEL, model: 2 }),
    });
    const p = await r.json();
    if (p.error) {
      if (p.reason === "b7_words") {
        msgEl.innerHTML = esc("You've used your membership's 10,000 words — ") + '<a href="#plans">Add another month</a>';
        msgEl.classList.remove("ok");
        fetchMe().then(renderMeter);
      } else {
        msg(p.error);
      }
      return;
    }
    if (p.cancelled) { msg("Stopped."); return; }
    applyData(p, true);
    msg(hasFlagged(lastBlocks) ? "Done. Run “Go Green” to clean up the highlights." : "Done — all clear.", true);
    if (p.b7_words_remaining != null) fetchMe().then(renderMeter);
  } catch (e) {
    if (e.name === "AbortError") msg("Stopped.");
    else msg("Couldn’t reach the humanizer. Please try again.");
  } finally {
    busy = false; humAbort = null;
    btnHum.classList.remove("loading"); btnStopHum.style.display = "none";
    inPane.classList.remove("fx-humanizing"); refreshButtons();
  }
}

async function check() {
  if (needLogin("Log in to check your text for AI.")) return;
  const text = input.value.trim();
  if (!text) { msg("Paste some text first."); return; }
  busy = true; refreshButtons();
  btnCheck.classList.add("loading"); inPane.classList.add("fx-scanning"); msg("");
  humAbort = new AbortController();
  try {
    const r = await fetch(API + "/api/check", {
      method: "POST", headers: JH, signal: humAbort.signal, body: JSON.stringify({ text }),
    });
    const p = await r.json();
    if (p.error) { msg(p.error); return; }
    applyData(p, true);
    msg(p.truncated ? `Scanned the first ${p.max_words} words.` : "Scan complete.", true);
  } catch (e) {
    if (e.name === "AbortError") msg("Stopped.");
    else msg("Couldn’t reach the scanner. Please try again.");
  } finally {
    busy = false; humAbort = null;
    btnCheck.classList.remove("loading"); inPane.classList.remove("fx-scanning"); refreshButtons();
  }
}

async function makeAllGreen() {
  if (needLogin("Log in to use Go Green.")) return;
  if (!lastBlocks || !hasFlagged(lastBlocks)) return;
  busy = true; refreshButtons();
  btnGreen.style.display = "none"; btnStopGreen.style.display = "";
  outPane.classList.add("fx-greening"); bar.hidden = false; barFill.style.width = "0%"; msg("Making everything green…");
  const startRed = (lastBlocks || []).reduce((n, b) => n + (b.type === "body"
    ? (b.sentences || []).filter((s) => (s.p || 0) >= AMBER).length : 0), 0);
  greenAbort = new AbortController();
  try {
    const r = await fetch(API + "/api/makeallgreen", {
      method: "POST", headers: JH, signal: greenAbort.signal,
      body: JSON.stringify({ blocks: lastBlocks, level: LEVEL, threshold: AMBER, model: 2 }),
    });
    if (!r.ok || !r.body) { msg("Go Green is unavailable right now."); return; }
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = "", finished = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const line = buf.slice(0, i).replace(/^data:\s?/, "").trim();
        buf = buf.slice(i + 2);
        if (!line) continue;
        let o; try { o = JSON.parse(line); } catch { continue; }
        if (o.error) { msg(o.error); finished = true; break; }
        if (o.done) { applyData(o.payload, true); finished = true; }
        else if (o.left != null && startRed > 0)
          barFill.style.width = Math.max(0, Math.min(100, Math.round(100 * (startRed - o.left) / startRed))) + "%";
      }
      if (finished) break;
    }
    barFill.style.width = "100%";
    if (finished && !hasFlagged(lastBlocks)) msg("Go Green ✓", true);
    else if (finished) msg("Cleaned up as far as it goes — a few stubborn lines remain.", true);
  } catch (e) {
    msg(e.name === "AbortError" ? "Stopped." : "Go Green failed. Please try again.");
  } finally {
    busy = false; greenAbort = null;
    btnStopGreen.style.display = "none"; btnGreen.style.display = "";
    outPane.classList.remove("fx-greening"); refreshButtons();
    setTimeout(() => (bar.hidden = true), 800);
  }
}

function clearAll() {
  if (busy) return;
  input.value = ""; lastBlocks = null; lastText = "";
  out.innerHTML = '<div class="placeholder">Humanized / scanned text appears here.</div>';
  setInWords(); setOutWords(); resetRing(); msg(""); refreshButtons();
  btnClear.classList.add("cleared"); setTimeout(() => btnClear.classList.remove("cleared"), 560);
}

btnHum.onclick = humanize;
btnCheck.onclick = check;
btnGreen.onclick = makeAllGreen;
btnClear.onclick = clearAll;
btnStopHum.onclick = () => {
  if (humAbort) humAbort.abort();
  // Tell the server to stop + refund the words (the job keeps running otherwise).
  try { fetch(API + "/api/humanize/cancel", { method: "POST", headers: JH, keepalive: true, body: "{}" }); } catch (e) {}
};
btnStopGreen.onclick = () => greenAbort && greenAbort.abort();
btnCopy.onclick = async () => {
  if (!lastText) return;
  try {
    await navigator.clipboard.writeText(lastText);
    btnCopy.classList.add("copied");
    const t = btnCopy.textContent; btnCopy.innerHTML = '<span class="copy-check">✓</span> Copied';
    setTimeout(() => { btnCopy.classList.remove("copied"); btnCopy.textContent = "Copy"; }, 1500);
  } catch { btnCopy.textContent = "Copy failed"; setTimeout(() => (btnCopy.textContent = "Copy"), 1500); }
};

// ---------------------------------------------------------------- PowerPoint tool
const ppDrop = $("pp-drop"), ppFile = $("pp-file"), ppFiles = $("pp-files");
const ppGo = $("pp-go"), ppBar = $("pp-bar"), ppBarFill = $("pp-bar-fill"), ppMsg = $("pp-msg");
let ppPicked = null, ppBusy = false;

function ppSetFile(f) {
  if (f && !/\.pptx$/i.test(f.name)) { ppMsg.textContent = "Please choose a .pptx file."; return; }
  ppPicked = f || null;
  ppDrop.classList.toggle("filled", !!ppPicked);
  ppFiles.innerHTML = ppPicked
    ? `<span class="chip"><span class="chip-name">${esc(ppPicked.name)}</span><button class="chip-x" type="button" aria-label="Remove">×</button></span>` : "";
  if (ppPicked) ppFiles.querySelector(".chip-x").onclick = (e) => { e.stopPropagation(); ppSetFile(null); };
  ppGo.disabled = !ppPicked || ppBusy;
  ppMsg.textContent = ""; ppMsg.classList.remove("ok");
}
ppDrop.onclick = () => !ppBusy && ppFile.click();
ppFile.onchange = () => ppSetFile(ppFile.files[0]);
["dragover", "dragenter"].forEach((ev) => ppDrop.addEventListener(ev, (e) => { e.preventDefault(); ppDrop.classList.add("drag"); }));
["dragleave", "drop"].forEach((ev) => ppDrop.addEventListener(ev, (e) => { e.preventDefault(); ppDrop.classList.remove("drag"); }));
ppDrop.addEventListener("drop", (e) => {
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) ppSetFile(f);                       // only the FIRST file — one deck at a time
});

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const ppStatus = (id) => fetch(`${API}/api/pptx/status/${id}`, { headers: BH }).then((r) => r.json());

async function ppRun() {
  if (needLogin("Log in to humanize PowerPoint files.")) return;
  if (!ppPicked || ppBusy) return;
  ppBusy = true; ppGo.disabled = true; ppGo.classList.add("loading");
  ppBar.hidden = false; ppBarFill.style.width = "15%";
  ppMsg.textContent = "Uploading…"; ppMsg.classList.remove("ok");
  try {
    const fd = new FormData();
    fd.append("file", ppPicked, ppPicked.name);
    const r = await fetch(`${API}/api/pptx`, { method: "POST", headers: BH, body: fd });
    const j = await r.json();
    if (j.error) { ppMsg.textContent = j.error; return; }
    const jobId = j.job_id;
    ppMsg.textContent = "Humanizing your deck…"; ppBarFill.style.width = "45%";
    let misses = 0;
    for (let i = 0; i < 400; i++) {            // ~20 min ceiling
      await sleep(3000);
      let s;
      try { s = await ppStatus(jobId); } catch { if (++misses > 6) throw new Error("lost"); continue; }
      misses = 0;
      if (s.state === "processing") { ppBarFill.style.width = "70%"; continue; }
      if (s.state === "done") {
        ppBarFill.style.width = "90%";
        const dl = await fetch(`${API}/api/pptx/result/${jobId}`, { headers: BH });
        if (!dl.ok) { ppMsg.textContent = "Couldn’t download the result. Please try again."; return; }
        const changed = dl.headers.get("X-Changed") || "0";
        const blob = await dl.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = j.name || "presentation (humanized).pptx";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        ppBarFill.style.width = "100%";
        ppMsg.textContent = `Done — ${changed} line${changed === "1" ? "" : "s"} rewritten. Your download is ready.`;
        ppMsg.classList.add("ok");
        return;
      }
      if (s.state === "error") { ppMsg.textContent = s.error || "Couldn’t process this file."; return; }
      if (s.state === "missing") { ppMsg.textContent = "The job expired. Please upload again."; return; }
    }
    ppMsg.textContent = "This is taking too long — please try a smaller deck.";
  } catch (e) {
    ppMsg.textContent = "Upload failed. Please check your connection and try again.";
  } finally {
    ppBusy = false; ppGo.disabled = !ppPicked; ppGo.classList.remove("loading");
    setTimeout(() => (ppBar.hidden = true), 1200);
  }
}
ppGo.onclick = ppRun;

// ---------------------------------------------------------------- plans / membership
const plansMsg = $("plans-msg");
function planSay(t, bad) { if (plansMsg) { plansMsg.textContent = t; plansMsg.classList.toggle("bad", !!bad); } }

let buyBusy = false;
async function buyPlan(plan) {
  if (needLogin("Sign in to buy.")) return;
  if (buyBusy) return;                       // one invoice per click; a redirect is coming
  buyBusy = true;
  try {
    const r = await fetch(API + "/api/myfatoorah/checkout", {
      method: "POST", headers: JH, body: JSON.stringify({ plan, quantity: 1 }),
    });
    const d = await r.json();
    if (d && d.url) { location.href = d.url; return }   // webhook grants; redirect just pays
    planSay((d && d.error) || "Couldn't start checkout. Please try again.", true);
  } catch (e) {
    planSay("Couldn't reach the payment gateway. Please try again.", true);
  } finally { buyBusy = false; }
}
$("buy-month").onclick = () => buyPlan("B7oothMonth");
$("buy-scan").onclick = () => buyPlan("B7oothScan");

// Membership meter: words left + expiry, warning under 2k.
async function fetchMe() {
  if (!TOKEN) return null;
  try { return await (await fetch(API + "/api/auth/me", { headers: BH })).json(); }
  catch (e) { return null; }
}
function renderMeter(me) {
  let el = $("b7-meter");
  if (!el) {
    el = document.createElement("div");
    el.id = "b7-meter";
    const bar = document.querySelector("#outPane .usage-bar");
    if (bar) bar.appendChild(el); else return;
  }
  const b7 = me && me.b7;
  const inLimit = $("inLimit");
  if (!b7 || !b7.active) {
    el.textContent = "";
    if (inLimit && inLimit.textContent.includes("membership")) inLimit.textContent = inLimit.textContent.replace("membership", "free");
    return;
  }
  if (inLimit && inLimit.textContent.includes("free")) inLimit.textContent = inLimit.textContent.replace("free", "membership");
  const t = Date.parse(b7.expiry);
  const end = Number.isFinite(t) ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  el.textContent = `Membership: ${b7.words.toLocaleString("en-US")} words left` + (end ? ` · ends ${end}` : "");
  el.classList.toggle("low", b7.words <= 2000);
}
fetchMe().then(renderMeter);

// Coming back from MyFatoorah: ?paid=<plan> — the WEBHOOK grants, so poll until it lands.
(function () {
  const paid = new URLSearchParams(location.search).get("paid");
  if (paid == null) return;
  history.replaceState(null, "", location.pathname);      // don't re-toast on refresh
  if (paid === "0") { msg("Payment didn't complete — you weren't charged.", false); return; }
  msg("Payment received — activating…", true);
  (async () => {
    // Snapshot BEFORE polling starts. A stacking re-buy (member with words left) or a
    // scan re-buy (credits left) already satisfies ">0", so the old check toasted
    // "You're all set!" on the very first poll even if the webhook hadn't landed yet
    // (or never would). Require a real INCREASE over this snapshot instead. If the
    // snapshot fetch fails, fall back to 0s — same behaviour as before this fix.
    const before0 = await fetchMe();
    const before = {
      words: (before0 && before0.b7 && before0.b7.words) || 0,
      credits: (before0 && before0.tn_credits) || 0,
    };
    let tries = 0;
    const t = setInterval(async () => {
      const me = await fetchMe();
      const done = me && ((paid === "B7oothMonth" && me.b7 && me.b7.active && me.b7.words > before.words)
                       || (paid === "B7oothScan" && (me.tn_credits || 0) > before.credits));
      if (done) { clearInterval(t); renderMeter(me); msg("You're all set!", true); return; }
      if (++tries >= 12) { clearInterval(t); msg("Payment is processing — it can take a minute. Refresh shortly.", true); }
    }, 3000);
  })();
})();
