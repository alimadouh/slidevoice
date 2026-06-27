// Shared auth helpers for B7oothKw.
//   b7_token  -> a real signed-in session (Google / phone)
//   b7_guest  -> "1" when browsing as a guest (can SEE the site, can't USE tools)
// A guest who triggers a tool action gets a "please log in" prompt.
(function () {
  var TOKEN = "b7_token", GUEST = "b7_guest";

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  window.b7HasToken = function () { var t = get(TOKEN); return !!t && t !== "guest"; };
  window.b7IsGuest = function () { return !window.b7HasToken(); };
  window.b7Logout = function () {
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
