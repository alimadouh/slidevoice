// Support & FAQ — the tabbed accordion, and the live chat with the team.
// The chat is the same backend conversation Grade A uses (/api/support/*), keyed by
// your account's email, so a reply from the team lands here wherever it was typed.
(function () {
  const API = (window.HUMANIZER_API || "").replace(/\/+$/, "");
  const BKEY = window.BRANCH_KEY || "";
  const TOKEN = (function () { try { const t = localStorage.getItem("b7_token"); return (t && t !== "guest") ? t : ""; } catch (e) { return ""; } })();
  const H = { "X-Branch-Key": BKEY };
  if (TOKEN) H["Authorization"] = "Bearer " + TOKEN;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- FAQ tabs ----------
  const tabs = $("faqTabs");
  if (tabs) {
    tabs.addEventListener("click", (e) => {
      const b = e.target.closest(".faq-tab");
      if (!b) return;
      const want = b.dataset.faq;
      tabs.querySelectorAll(".faq-tab").forEach((t) => t.classList.toggle("active", t === b));
      document.querySelectorAll("[data-faq-group]").forEach((g) => {
        g.classList.toggle("hidden", g.dataset.faqGroup !== want);
      });
    });
  }

  // ---------- live chat ----------
  const body = $("supportBody"), form = $("supportForm"), inp = $("supportText"), err = $("supportErr");
  if (!body) return;

  function fail(msg) {
    if (!err) return;
    err.textContent = msg || "";
    err.classList.toggle("hidden", !msg);
  }
  const when = (iso) => {
    try { return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
    catch (e) { return ""; }
  };
  function bubbles(msgs) {
    if (!msgs || !msgs.length) {
      return '<div class="chat-welcome">👋 Hi! Send us a message and our team will get back to you.</div>';
    }
    return msgs.map((m) => {
      const mine = m.sender === "user";
      return '<div class="chat-msg ' + (mine ? "me" : "them") + '">' +
               '<div class="chat-bubble">' + esc(m.body).replace(/\n/g, "<br>") + "</div>" +
               '<div class="chat-time">' + when(m.created) + "</div></div>";
    }).join("");
  }
  // Repaint without yanking the reader down: the 12s poller used to force the pane to
  // the bottom on every tick, which makes scrolling up to read older messages impossible.
  function paint(html) {
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 60;
    body.innerHTML = html;
    if (atBottom) body.scrollTop = body.scrollHeight;
  }

  async function load() {
    if (!TOKEN) {
      paint('<div class="chat-welcome">Please sign in to chat with our support team.</div>');
      return;
    }
    try {
      const r = await fetch(API + "/api/support/mine", { headers: H });
      if (!r.ok) return;                      // a blip: keep what's on screen
      const d = await r.json();
      paint(bubbles(d.messages || []));
    } catch (e) {}
  }

  if (form) form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!TOKEN) { if (window.b7PromptLogin) b7PromptLogin("Sign in to chat with support."); return; }
    const text = (inp.value || "").trim();
    if (!text) return;
    inp.value = "";
    fail("");
    const fd = new FormData();
    fd.append("text", text);
    // Check the response. A 401/429/500 still resolves, so sending blind would clear the
    // box and report nothing — the message vanishes and the user assumes it was sent.
    try {
      const r = await fetch(API + "/api/support/send", { method: "POST", headers: H, body: fd });
      let d = {}; try { d = await r.json(); } catch (e2) {}
      if (!r.ok || d.error) {
        inp.value = text;                     // give them their words back
        fail(d.error || "Couldn't send your message. Please try again.");
        return;
      }
    } catch (e3) {
      inp.value = text;
      fail("Couldn't send. Please check your connection and try again.");
      return;
    }
    load();
  });

  load();
  setInterval(load, 12000);
})();
