// Shared auth helpers for B7oothKw.
//   b7_token  -> a real signed-in session (Google / phone)
//   b7_guest  -> "1" when browsing as a guest (can SEE the site, can't USE tools)
// A guest who triggers a tool action gets a "please log in" prompt.
(function () {
  var TOKEN = "b7_token", GUEST = "b7_guest";
  // Localhost is always treated as signed-in (admin) so the site can be previewed
  // without logging in. (On a real server this is never true.)
  var LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  window.b7IsLocal = LOCAL;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  window.b7HasToken = function () { if (LOCAL) return true; var t = get(TOKEN); return !!t && t !== "guest"; };

  // Localhost preview: fetch the ADMIN token from the local control panel
  // (127.0.0.1:8760 — machine-local only) so every tool works as admin without
  // logging in. Never runs on the real site (LOCAL is false there), and the
  // panel only answers this route for the local preview origins.
  if (LOCAL && !get(TOKEN)) {
    fetch("http://127.0.0.1:8760/dev-token").then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.token) { localStorage.setItem(TOKEN, d.token); location.reload(); }
    }).catch(function () {});
  }
  window.b7IsGuest = function () { return !window.b7HasToken(); };

  // What a page should say when it has no token to call the API with. On localhost
  // that is never "please sign in" — the preview IS the owner; the token just hasn't
  // arrived, which only happens when the control panel isn't running or the page is
  // served from a port it doesn't hand tokens to (it answers 8123/8124 — the port
  // `npm run dev` uses).
  window.b7NoTokenMsg = function () {
    return LOCAL
      ? "Local preview: start the control panel (127.0.0.1:8760) and serve this site on port 8124 to load real data."
      : "Please sign in.";
  };
  window.b7Logout = function () {
    // Tell the server to end the session BEFORE clearing local storage. Until now logout
    // only forgot the token locally, so the session row stayed valid for its full 90-day
    // life — a token captured on a shared machine (or via any future XSS) could not be
    // revoked by the user at all. keepalive lets the request outlive the navigation.
    var t = get(TOKEN);
    var api = window.HUMANIZER_API || "";
    if (t && t !== "guest" && api) {
      try {
        fetch(api + "/api/auth/logout", {
          method: "POST", keepalive: true,
          headers: { "Authorization": "Bearer " + t },
        });
      } catch (e) {}
    }
    try { localStorage.removeItem(TOKEN); localStorage.removeItem(GUEST); } catch (e) {}
    location.href = "login.html";
  };

  // ---- "please log in" modal ----
  var open = false;
  window.b7PromptLogin = function (message) {
    if (open) return;
    open = true;
    var ovl = document.createElement("div");
    ovl.className = "b7-ovl";
    ovl.innerHTML =
      '<div class="b7-modal" role="dialog" aria-modal="true">' +
        '<div class="b7-modal-ic">🔒</div>' +
        '<h3>Log in to continue</h3>' +
        '<p>' + (message || "Sign in with Google or your phone to use this tool. It’s free.") + '</p>' +
        '<div class="b7-row">' +
          '<button class="btn btn-primary" id="b7Login">Log in</button>' +
          '<button class="btn btn-ghost" id="b7Cancel">Not now</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ovl);
    function close() { open = false; ovl.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    ovl.querySelector("#b7Login").onclick = function () { location.href = "login.html"; };
    ovl.querySelector("#b7Cancel").onclick = close;
    ovl.addEventListener("click", function (e) { if (e.target === ovl) close(); });
    document.addEventListener("keydown", onKey);
  };

  // ---- block a set of action buttons for guests (capture phase, before app handlers) ----
  window.b7GateButtons = function (selectors, message) {
    var sel = selectors.join(",");
    document.addEventListener("click", function (e) {
      if (window.b7HasToken()) return;
      if (e.target.closest && e.target.closest(sel)) {
        e.preventDefault(); e.stopImmediatePropagation();
        window.b7PromptLogin(message);
      }
    }, true);
  };

  // ---- account button in the top bar (#acctBtn): "Log out" when signed in, "Log in" as guest ----
  function initAcct() {
    var b = document.getElementById("acctBtn");
    if (!b) return;
    if (window.b7HasToken()) { b.textContent = "Log out"; b.onclick = window.b7Logout; }
    else { b.textContent = "Log in"; b.onclick = function () { location.href = "login.html"; }; }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initAcct);
  else initAcct();
})();
