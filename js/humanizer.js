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
// Includes the single quote, unlike an earlier copy of this helper — so it is safe in a
// single-quoted attribute too, matching the esc() in turnitin.js/chats.js/codes.js and
// removing the trap where a copy-paste into an attribute context would be exploitable.
// String() first, like those four: `(s || "")` threw a TypeError the moment a server
// field came back as a number or an object, and the exception blanked the whole pane
// mid-render instead of printing the value.
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Guests can see the UI but must log in to actually run a tool.
function needLogin(message) {
  if (window.b7HasToken && window.b7HasToken()) return false;
  if (window.b7PromptLogin) window.b7PromptLogin(message);
  else location.href = "login.html";
  return true;
}

// ---------------------------------------------------------------- panes
// Text, PowerPoint and Word are three sidebar items on one page: the hash picks
// which pane shows, and js/shell.js moves the highlight. There are no tab buttons.
const panes = { text: $("pane-text"), pptx: $("pane-pptx"), word: $("pane-word") };
function showTab(which) {
  for (const k of Object.keys(panes)) panes[k].classList.toggle("hidden", k !== which);
}
const paneForHash = () => {
  const h = location.hash.replace("#", "");
  return panes[h] ? h : "text";
};
showTab(paneForHash());
window.addEventListener("hashchange", () => showTab(paneForHash()));

// ---------------------------------------------------------------- output spelling
// One switch, three panes. The models write mixed spelling — one output routinely
// contains both "organisation" and "organization" — so the server converts the whole
// result to whichever English you pick. The choice is remembered per browser (set it
// once) and rides on EVERY request that produces text: humanize, Go Green, PowerPoint
// and Word. If it rode on only some, a deck would come back in a different English
// from the essay beside it.
let selectedDialect = "us";
try { if (localStorage.getItem("b7_dialect") === "uk") selectedDialect = "uk"; } catch (e) {}

// The file panes get a CLONE of the text pane's switch rather than their own markup,
// so the three can never drift apart.
function mountDialect(hostId) {
  const host = $(hostId), src = $("dialectToggle");
  if (!host || !src) return;
  const copy = src.cloneNode(true);
  copy.id = hostId + "Toggle";                      // a clone cannot share the original's id
  // The Union Jack clips its red diagonals through a clipPath referenced by id, so
  // each copy needs its own or the page carries duplicate ids.
  copy.querySelectorAll("clipPath").forEach((cp) => {
    const was = cp.id, now = was + "-" + hostId;
    cp.id = now;
    copy.querySelectorAll('[clip-path="url(#' + was + ')"]')
        .forEach((el) => el.setAttribute("clip-path", "url(#" + now + ")"));
  });
  host.appendChild(copy);
}
mountDialect("ppDialect");
mountDialect("wdDialect");

function syncDialect() {
  document.querySelectorAll("[data-dialect]").forEach(
    (b) => b.classList.toggle("active", b.dataset.dialect === selectedDialect));
}
document.querySelectorAll("[data-dialect]").forEach((b) => {
  b.addEventListener("click", () => {
    selectedDialect = b.dataset.dialect === "uk" ? "uk" : "us";
    try { localStorage.setItem("b7_dialect", selectedDialect); } catch (e) {}
    syncDialect();                       // every copy of the switch, not just this one
  });
});
syncDialect();

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
// Out of words — either the free trial or a membership pool. The server already wrote
// the sentence; all this adds is the way out, since neither pool refills on its own.
const isQuota = (reason) => reason === "b7_trial" || reason === "b7_words";
function quotaMsg(text) {
  msgEl.textContent = "";
  msgEl.appendChild(document.createTextNode((text || "") + " "));
  const a = document.createElement("a");
  a.href = "pricing.html"; a.textContent = "See plans";
  msgEl.appendChild(a);
  msgEl.classList.remove("ok");
}
// This must agree with api._count_words, which is what the customer is CHARGED. A plain
// \S+ count disagreed twice over: a dense-script character (CJK, Thai, Hangul, halfwidth
// kana) is billed as HALF a word, and a run longer than 60 characters is billed by length
// rather than as the single "word" it looks like -- 200,000 characters with no space in
// them metered as 1 here and 33,334 there. Grade A's app.js carries the same rule; change
// the three together.
const DENSE_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\u0e00-\u0e7f\uac00-\ud7af]/g;
const LONG_RUN_CHARS = 60, CHARS_PER_WORD = 6;
const wordCount = (s) => {
  const m = (s || "").trim();
  if (!m) return 0;
  const dense = (m.match(DENSE_RE) || []).length;
  let words = 0;
  for (const tok of (dense ? m.replace(DENSE_RE, " ") : m).split(/\s+/)) {
    if (!tok) continue;
    // .length counts UTF-16 units, Python counts characters, so an emoji reads as two
    // here and one there. Only recount when the cheap measure says it might be long.
    const len = tok.length <= LONG_RUN_CHARS ? tok.length : [...tok].length;
    if (len <= LONG_RUN_CHARS) words += 1;
    else if (tok.includes("://") || tok.startsWith("www.")) words += 1;
    else words += Math.ceil(len / CHARS_PER_WORD);
  }
  return words + Math.floor((dense + 1) / 2);
};
const fmtNum = (v) => Number(v || 0).toLocaleString("en-US");

// Which front-end created this account, straight from /api/auth/me.
//
// It matters because the API fills in a `b7` block for EVERY account, not just ours: a
// Grade A account signed in on b7ooth-ai.com came back with {trial: 150} and the pill
// dutifully said "150 free words left" — a number that never moved, because that account
// actually spends Grade A's own refilling daily pool (api.py: _metered_branch_user reads
// users.source, so a non-b7ooth account never touches a B7oothKw pool at all).
//
// users.source is the only thing that tells the two apart, so nothing here guesses. If
// the API doesn't send it, brand is "" and every B7oothKw-specific number is withheld —
// an empty pill beats a confident wrong one.
const brandOf = (me) => String((me && (me.source || me.brand)) ||
                               (me && me.b7 && me.b7.source) || "");
const isB7Account = (me) => brandOf(me) === "b7ooth";

// The input bar's right side now carries your remaining words, so the old static
// "Up to 500 words per run" is gone. Say it here instead — but only once the text
// is actually over the ceiling, where it's the thing you need to know.
// Mirrors api.py's BRANCH_WORDS_PER / BRANCH_WORDS_PER_MEMBER. A month doubles what one
// run may chew, so this is not a constant any more — renderMeter sets it from the account.
const PER_RUN_FREE = 500, PER_RUN_MEMBER = 1000;
let PER_RUN = PER_RUN_FREE;
// What this account can actually spend right now (null = unknown, or staff). On the
// free 150 the per-run cap is unreachable, so quoting 500 there was noise: the real
// ceiling is whichever is smaller.
let spendable = null;
// Until /api/auth/me answers we don't know which cap applies, and guessing the free 500
// told a paying member the wrong number for the first second of every page load. Stay
// quiet until renderMeter has set the real one.
let perRunKnown = false;
function setInWords() {
  const n = wordCount(input.value);
  const short = spendable != null && spendable < PER_RUN;
  const cap = short ? spendable : PER_RUN;
  const over = perRunKnown && n > cap;
  const note = short
    ? (cap > 0 ? ` · only ${fmtNum(cap)} word${cap === 1 ? "" : "s"} left` : " · no words left")
    : ` · max ${fmtNum(PER_RUN)} per run`;
  $("inWords").innerHTML = `<b>${n}</b> words` + (over ? note : "");
  $("inWords").classList.toggle("over", over);
}
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
      body: JSON.stringify({ text, level: LEVEL, model: 2, dialect: selectedDialect }),
    });
    const p = await r.json();
    if (p.error) {
      if (isQuota(p.reason)) { quotaMsg(p.error); fetchMe().then(renderMeter); }
      else msg(p.error);
      return;
    }
    if (p.cancelled) { msg("Stopped."); return; }
    applyData(p, true);
    msg(hasFlagged(lastBlocks) ? "Done. Run “Go Green” to clean up the highlights." : "Done — all clear.", true);
    if (p.b7_words_remaining != null || p.b7_trial_remaining != null) fetchMe().then(renderMeter);
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
      body: JSON.stringify({ blocks: lastBlocks, level: LEVEL, threshold: AMBER, model: 2,
                             dialect: selectedDialect }),
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
        if (o.error) {
          if (isQuota(o.reason)) { quotaMsg(o.error); fetchMe().then(renderMeter); }
          else msg(o.error);
          finished = true; break;
        }
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

// ------------------------------------------------- file tools (PowerPoint + Word)
// Both are the same job: upload, poll a job id, download the result. The only
// differences are the endpoint, the extension and the wording, so they share one
// implementation rather than two copies that drift.
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function fileTool(cfg) {
  const drop = $(cfg.drop), input = $(cfg.input), files = $(cfg.files);
  const go = $(cfg.go), bar = $(cfg.bar), fill = $(cfg.fill), msgBox = $(cfg.msg);
  let picked = null, busy = false;

  const say = (t, ok) => { msgBox.textContent = t || ""; msgBox.classList.toggle("ok", !!ok); };
  // Out of words / no membership: the server wrote the sentence, we add the way out.
  function sayQuota(text) {
    msgBox.textContent = (text || "") + " ";
    const a = document.createElement("a");
    a.href = "pricing.html"; a.textContent = "See plans";
    msgBox.appendChild(a);
    msgBox.classList.remove("ok");
  }

  // The chosen file shows in its own .tno-selected row under the drop zone, the way
  // Grade A does it — the zone itself keeps saying "drop here or browse".
  function setFile(f) {
    if (f && !cfg.ext.test(f.name)) { say(cfg.wrongType); return; }
    picked = f || null;
    files.classList.toggle("hidden", !picked);
    files.innerHTML = picked
      ? `<span aria-hidden="true">📎</span><span>${esc(picked.name)}</span>` +
        `<button class="tno-clear" type="button" aria-label="Remove file">✕</button>` : "";
    if (picked) files.querySelector(".tno-clear").onclick = (e) => { e.stopPropagation(); setFile(null); };
    go.disabled = !picked || busy;
    say("");
  }

  drop.onclick = () => !busy && input.click();
  drop.onkeydown = (e) => {                     // it's role="button" — behave like one
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); drop.click(); }
  };
  input.onchange = () => {
    setFile(input.files[0]);
    // Clear the control's value so choosing the SAME file again still fires `change`.
    // Without this, removing a file and re-picking it did nothing whatsoever: the value
    // had not changed, so the browser had no event to send, and the drop zone sat empty
    // with no error to explain itself.
    input.value = "";
  };
  ["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag"); }));
  drop.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setFile(f);                          // only the FIRST file — one at a time
  });

  const status = (id) => fetch(`${API}${cfg.api}/status/${id}`, { headers: BH }).then((r) => r.json());

  async function run() {
    if (needLogin(cfg.loginMsg)) return;
    if (!picked || busy) return;
    busy = true; go.disabled = true; go.classList.add("loading");
    bar.hidden = false; fill.style.width = "15%";
    say("Uploading…");
    try {
      const fd = new FormData();
      fd.append("file", picked, picked.name);
      fd.append("dialect", selectedDialect);       // same switch as the text pane
      const r = await fetch(`${API}${cfg.api}`, { method: "POST", headers: BH, body: fd });
      const j = await r.json();
      if (j.error) {
        if (isQuota(j.reason) || j.reason === "b7_membership") { sayQuota(j.error); fetchMe().then(renderMeter); }
        else say(j.error);
        return;
      }
      const jobId = j.job_id;
      say(cfg.working); fill.style.width = "45%";
      fetchMe().then(renderMeter);               // a member's balance just changed
      let misses = 0;
      for (let i = 0; i < 400; i++) {            // ~20 min ceiling
        await sleep(3000);
        let st;
        try { st = await status(jobId); } catch { if (++misses > 6) throw new Error("lost"); continue; }
        misses = 0;
        if (st.state === "processing") { fill.style.width = "70%"; continue; }
        if (st.state === "done") {
          fill.style.width = "90%";
          const dl = await fetch(`${API}${cfg.api}/result/${jobId}`, { headers: BH });
          if (!dl.ok) { say("Couldn't download the result. Please try again."); return; }
          const changed = dl.headers.get("X-Changed") || "0";
          const blob = await dl.blob();
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = j.name || cfg.fallbackName;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          fill.style.width = "100%";
          say(`Done — ${changed} ${changed === "1" ? cfg.unit : cfg.unitPlural} rewritten. Your download is ready.`, true);
          return;
        }
        if (st.state === "error") {
          // A failed job refunds a member's words, so re-read the balance.
          fetchMe().then(renderMeter);
          say(st.error || "Couldn't process this file."); return;
        }
        if (st.state === "missing") { say("The job expired. Please upload again."); return; }
      }
      say(cfg.tooLong);
    } catch (e) {
      say("Upload failed. Please check your connection and try again.");
    } finally {
      busy = false; go.disabled = !picked; go.classList.remove("loading");
      setTimeout(() => (bar.hidden = true), 1200);
    }
  }
  go.onclick = run;
}

fileTool({
  drop: "pp-drop", input: "pp-file", files: "pp-files",
  go: "pp-go", bar: "pp-bar", fill: "pp-bar-fill", msg: "pp-msg",
  api: "/api/pptx", ext: /\.pptx$/i,
  wrongType: "Please choose a .pptx file.",
  loginMsg: "Log in to humanize PowerPoint files.",
  working: "Humanizing your deck…",
  fallbackName: "presentation (humanized).pptx",
  unit: "line", unitPlural: "lines",
  tooLong: "This is taking too long — please try a smaller deck.",
});

fileTool({
  drop: "wd-drop", input: "wd-file", files: "wd-files",
  go: "wd-go", bar: "wd-bar", fill: "wd-bar-fill", msg: "wd-msg",
  api: "/api/docx", ext: /\.docx$/i,
  wrongType: "Please choose a .docx file (not .doc).",
  loginMsg: "Log in to humanize Word documents.",
  working: "Humanizing your document…",
  fallbackName: "document (humanized).docx",
  unit: "paragraph", unitPlural: "paragraphs",
  tooLong: "This is taking too long — please try a shorter document.",
});

// ---------------------------------------------------------------- words meter
// Prices live on pricing.html; this page only ever says how many words are left.
async function fetchMe() {
  if (!TOKEN) return null;
  try { return await (await fetch(API + "/api/auth/me", { headers: BH })).json(); }
  catch (e) { return null; }
}
function renderMeter(me) {
  // One pill, shown in every pane that can spend words: the input bar here, and beside
  // the PowerPoint and Word titles. A balance that only exists on the text tab is
  // missing from the pane where a single upload can spend 10,000 of them.
  const els = document.querySelectorAll(".b7-meter");
  if (!els.length) return;
  const n = fmtNum;
  const dayOf = (iso) => {
    const t = Date.parse(iso);
    return Number.isFinite(t)
      ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  };
  const b7 = me && me.b7;
  const brand = brandOf(me), mine = brand === "b7ooth";
  let html = "", cls = "", tip = "";
  spendable = null;
  PER_RUN = (me && (me.is_admin || (mine && b7 && b7.active))) ? PER_RUN_MEMBER : PER_RUN_FREE;
  // The branch per-run cap only binds accounts the branch actually meters, so the note
  // stays quiet for a Grade A account here — and for an unknown brand, where it would be
  // the same guess as the pill.
  perRunKnown = !!me && (mine || !!me.is_admin);

  if (me && me.is_admin) {
    // Staff spend from neither pool, so there is no balance to count down — but an
    // empty bar reads as a broken meter rather than as "nothing to worry about".
    // Grade A puts "Unlimited" in this exact spot; say the same thing here.
    html = "Unlimited";
  } else if (mine && b7 && b7.active) {
    spendable = b7.words;
    const end = dayOf(b7.expiry);
    html = `<b>${n(b7.words)}</b> words left` + (end ? ` · ends ${end}` : "");
    cls = b7.words <= 2000 ? "low" : "";
  } else if (mine && b7 && b7.trial != null) {
    // No live membership. The trial is what's spendable; anything in b7.words is left
    // over from a month that ended. Those words are NOT lost — a re-buy stacks on top
    // of them — so saying only "150 free words left" understates the account.
    const trial = b7.trial, frozen = Number(b7.words || 0);
    // A redeemed code lands in the SAME counter as the trial (auth.redeem_code adds to
    // b7_trial), so a balance above the trial's own size has bought words inside it —
    // and "1,000 free words left" is then the one thing it certainly isn't.
    const total = Number(b7.trial_total || 0);
    const granted = total > 0 && trial > total;
    spendable = trial;
    if (frozen > 0) tip = "Your month has ended. Buy another month and these words are yours again.";
    if (trial > 0) {
      html = `<b>${n(trial)}</b> ${granted ? "words" : "free words"} left` +
             (frozen > 0 ? ` · <b>${n(frozen)}</b> waiting` : "");
      cls = trial <= 50 ? "low" : "";
    } else if (frozen > 0) {
      html = `<b>${n(frozen)}</b> words waiting · <a href="pricing.html">renew</a>`;
      cls = "low";
    } else {
      // Not "no FREE words left": by this point the account may have spent a redeemed
      // grant, or a month, or both.
      html = 'No words left · <a href="pricing.html">See plans</a>';
      cls = "out";
    }
  } else if (brand && me && !me.error) {
    // Signed in on an account from our other site, Grade A. It holds no B7oothKw balance
    // whatsoever, and a humanize started here comes out of that site's daily words — so
    // that is the only number worth showing, and nothing at all if the API didn't send it
    // (an unlimited plan reports null).
    const left = me.usage && me.usage.daily_words_remaining;
    if (left != null) {
      html = `<b>${n(left)}</b> words left today`;
      cls = left <= 50 ? "out" : (left <= 200 ? "low" : "");
      tip = "This account was created on Grade A, so it spends that site's daily words.";
    }
  }
  // Empty means no pill at all (the CSS hangs on :not(:empty)) — that's the right state
  // for a signed-out visitor, and for a backend that doesn't say which site made the
  // account, where any number would be a guess.
  els.forEach((el) => {
    el.innerHTML = html ? "✦ " + html : "";
    el.classList.remove("low", "out");
    if (cls) el.classList.add(cls);
    if (tip) el.title = tip; else el.removeAttribute("title");
  });
  setInWords();                 // the per-run note depends on what's left
  applyGate(me);
}

// Both file tools are members-only — a file's words come out of the membership's
// 10,000 — and the page can know that before the upload instead of after it. Only lock
// on a POSITIVE answer: if /auth/me didn't come back, or didn't say which site made the
// account, leave the panes open rather than shutting a paying member out over a hiccup.
// A Grade A account is deliberately NOT locked either: its uploads never reach the
// branch pool, they go through that site's own plan, which may well allow them.
function applyGate(me) {
  const b7 = me && me.b7;
  const locked = isB7Account(me) && !!b7 && !b7.active && !(me && me.is_admin);
  // A month that ended is not the same story as never having bought one. The stock
  // "your free words still work on the text humanizer" is wrong for a lapsed member —
  // they may have none left, and the sentence says nothing about the words that ARE
  // sitting there — so swap it for what actually happened, matching the pill above.
  const waiting = locked ? Number((b7 && b7.words) || 0) : 0;
  ["wd-lock", "pp-lock"].forEach((id) => {
    const lock = $(id);
    if (!lock) return;
    lock.classList.toggle("hidden", !locked);
    const title = lock.querySelector(".feat-lock-title");
    const sub = lock.querySelector(".feat-lock-sub");
    if (!title || !sub) return;
    if (lock.dataset.stockTitle == null) {          // remember the markup's own wording once
      lock.dataset.stockTitle = title.textContent;
      lock.dataset.stockSub = sub.textContent;
    }
    title.textContent = waiting > 0 ? "Your month has ended" : lock.dataset.stockTitle;
    sub.textContent = waiting > 0
      ? `You still have ${fmtNum(waiting)} words on this account. Renew and they're yours ` +
        `again — this humanizer with them.`
      : lock.dataset.stockSub;
  });
}
fetchMe().then(renderMeter);

// Coming back from MyFatoorah: ?paid=<plan> — the WEBHOOK grants, so poll until it lands.
(function () {
  const paid = new URLSearchParams(location.search).get("paid");
  if (paid == null) return;
  // msg() writes into #hz-msg, which lives inside the TEXT pane. MyFatoorah can return
  // to humanizer.html#pptx or #word, and then the whole payment conversation — including
  // "Payment didn't complete" — would be written into a hidden element. Come back to the
  // text pane so the customer actually sees what happened to their money.
  showTab("text");
  history.replaceState(null, "", location.pathname);      // don't re-toast on refresh
  if (paid === "0") { msg("Payment didn't complete — you weren't charged.", false); return; }
  msg("Payment received — activating…", true);
  (async () => {
    // Snapshot BEFORE polling starts. A stacking re-buy (member with words left) or a
    // scan re-buy (credits left) already satisfies ">0", so the old check toasted
    // "You're all set!" on the very first poll even if the webhook hadn't landed yet
    // (or never would). Require a real INCREASE over this snapshot instead. If the
    // snapshot fetch fails, fall back to 0s — same behaviour as before this fix.
    // The balance from before the redirect (js/auth.js), which is the only one a grant
    // can be seen to exceed: the webhook is server-to-server and usually lands before the
    // customer is back, so a snapshot taken HERE already contains it. Without a stored
    // baseline -- expired, or a return in a fresh browser -- fall back to the old
    // post-return snapshot rather than guessing.
    const saved = window.b7TakeCheckoutBaseline && window.b7TakeCheckoutBaseline();
    const before0 = saved ? null : await fetchMe();
    const before = saved || {
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
