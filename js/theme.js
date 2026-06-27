// Shared light/dark theme toggle, persisted across all B7oothKw pages.
// Default is DARK everywhere (consistent — no flicker between pages); the user's
// choice is honoured everywhere via localStorage("b7_theme").
(function () {
  var KEY = "b7_theme";
  var body = document.body;
  var isHz = body.classList.contains("hz-page");

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function effective(t) { return t === "light" ? "light" : "dark"; }   // default dark everywhere

  function apply(t) {
    var eff = effective(t);
    if (isHz) body.classList.toggle("light", eff === "light");
    else body.classList.toggle("dark", eff === "dark");
    var btn = document.getElementById("themeToggle");
    if (btn) {
      btn.textContent = eff === "dark" ? "☀" : "☾";   // ☀ when dark / ☾ when light
      btn.setAttribute("aria-label", eff === "dark" ? "Switch to light theme" : "Switch to dark theme");
    }
  }

  window.toggleTheme = function () {
    var next = effective(stored()) === "dark" ? "light" : "dark";
    try { localStorage.setItem(KEY, next); } catch (e) {}
    apply(next);
  };

  apply(stored());                                              // set class now (avoids flash)
  document.addEventListener("DOMContentLoaded", function () { apply(stored()); });  // set icon once button exists
})();
