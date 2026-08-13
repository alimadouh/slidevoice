// Staff → Chats: the B7oothKw side of the support inbox.
//
// Every request carries ?source=b7ooth, so the list and the badge both describe
// B7oothKw customers only. The reply and delete routes are keyed by email and need
// no filter — you can only reach an address from a list that was already scoped.
(function () {
  const API = (window.HUMANIZER_API || "").replace(/\/+$/, "");
  const BKEY = window.BRANCH_KEY || "";
  const TOKEN = (function () { try { const t = localStorage.getItem("b7_token"); return (t && t !== "guest") ? t : ""; } catch (e) { return ""; } })();
  const H = { "X-Branch-Key": BKEY };
  if (TOKEN) H["Authorization"] = "Bearer " + TOKEN;
  const SRC = "?source=b7ooth";

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const when = (iso) => {
    try { return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
    catch (e) { return ""; }
  };
  function say(t) { $("chMsg").textContent = t || ""; }

  let current = null;

  // ---- the thread pane ----
  function bubbles(msgs) {
    if (!msgs || !msgs.length) return '<div class="chat-welcome">No messages yet.</div>';
    return msgs.map((m) => {
      const mine = m.sender === "staff";       // "me" is the staff side in this panel
      return '<div class="chat-msg ' + (mine ? "me" : "them") + '">' +
               '<div class="chat-bubble">' + esc(m.body).replace(/\n/g, "<br>") + "</div>" +
               '<div class="chat-time">' + when(m.created) + "</div></div>";
    }).join("");
  }
  function paint(el, html) {
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    el.innerHTML = html;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }

  // ---- the list ----
  function render(convs) {
    const el = $("inboxList");
    const head = '<div class="inbox-listhead">Conversations' +
      '<span class="inbox-listcount">' + convs.length + "</span></div>";
    if (!convs.length) {
      el.innerHTML = head + '<div class="inbox-noconv">No conversations yet.</div>';
      return;
    }
    el.innerHTML = head + convs.map((c) =>
      '<div class="inbox-item' + (current === c.email ? " active" : "") +
           (c.unread > 0 ? " unread" : "") + '" data-email="' + esc(c.email) + '">' +
        '<span class="inbox-av">' + esc((c.email || "?")[0].toUpperCase()) + "</span>" +
        '<div class="inbox-meta">' +
          '<div class="inbox-row1"><span class="inbox-email">' + esc(c.email) + "</span>" +
            '<span class="inbox-time">' + when(c.last_at) + "</span></div>" +
          '<div class="inbox-row2"><span class="inbox-prev">' +
            (c.last_sender === "staff" ? "You: " : "") + esc((c.last_body || "").slice(0, 64)) + "</span>" +
            (c.unread > 0 ? '<span class="inbox-unread">' + c.unread + "</span>" : "") +
          "</div></div></div>").join("");
    el.querySelectorAll(".inbox-item").forEach((it) => {
      it.onclick = () => open(it.dataset.email);
    });
  }

  async function load() {
    if (!TOKEN) {
      $("inboxList").innerHTML = '<div class="inbox-noconv">' +
        esc(window.b7NoTokenMsg ? b7NoTokenMsg() : "Please sign in.") + "</div>";
      return;
    }
    try {
      const d = await (await fetch(API + "/api/support/conversations" + SRC, { headers: H })).json();
      if (d.error) { $("inboxList").innerHTML = '<div class="inbox-noconv">' + esc(d.error) + "</div>"; return; }
      render(d.conversations || []);
    } catch (e) {
      $("inboxList").innerHTML = '<div class="inbox-noconv">Couldn\'t load the conversations.</div>';
    }
  }

  async function open(email) {
    current = email;
    $("inboxEmpty").classList.add("hidden");
    $("inboxThread").classList.remove("hidden");
    $("inboxConvHead").innerHTML =
      '<span class="inbox-av">' + esc((email || "?")[0].toUpperCase()) + "</span>" +
      '<div class="inbox-conv-head-meta"><span class="inbox-conv-head-email">' + esc(email) + "</span>" +
        '<span class="inbox-conv-head-sub"><span class="chat-dot"></span> B7oothKw customer</span></div>' +
      '<button class="inbox-delconv" id="inboxDelConv" title="Delete conversation">🗑</button>';
    $("inboxDelConv").onclick = () => remove(email);
    try {
      const d = await (await fetch(API + "/api/support/conversation/" + encodeURIComponent(email),
                                   { headers: H })).json();
      if (d.error) { say(d.error); return; }
      paint($("inboxBody"), bubbles(d.messages || []));
    } catch (e) {
      say("Couldn't load that conversation.");
      return;
    }
    load();                       // the unread marker just cleared server-side
  }

  function showEmpty() {
    current = null;
    $("inboxEmpty").classList.remove("hidden");
    $("inboxThread").classList.add("hidden");
  }

  async function remove(email) {
    if (!confirm("Delete the conversation with " + email + "? This can't be undone.")) return;
    try {
      await fetch(API + "/api/support/conversation/" + encodeURIComponent(email) + "/delete",
                  { method: "POST", headers: H });
    } catch (e) { say("Delete failed."); }
    showEmpty();
    load();
  }

  // ---- reply ----
  $("inboxForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!current) return;
    const inp = $("inboxText");
    const text = (inp.value || "").trim();
    if (!text) return;
    inp.value = "";
    say("");
    const fd = new FormData();
    fd.append("email", current);
    fd.append("text", text);
    try {
      const r = await fetch(API + "/api/support/reply", { method: "POST", headers: H, body: fd });
      let d = {}; try { d = await r.json(); } catch (e2) {}
      if (!r.ok || d.error) {
        // A reply the customer never gets is worse than an obvious failure.
        inp.value = text;
        say(d.error || "Couldn't send the reply. Please try again.");
        return;
      }
    } catch (err) {
      inp.value = text;
      say("Couldn't send the reply. Please try again.");
      return;
    }
    open(current);
  });

  load();
  // Keep the open conversation live. open() ends with its own load(), so refreshing
  // the list here as well would fire three requests a tick for a reader sitting still.
  setInterval(() => {
    if (document.hidden || !TOKEN) return;
    if (current) open(current); else load();
  }, 12000);
})();
