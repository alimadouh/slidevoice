// Auth gate: no session -> bounce to the login page before anything renders.
// Loaded in <head> of every protected page (home, humanizer, narrator).
// NOTE: this is a UX gate. Real enforcement is server-side (the API must reject
// requests without a valid token) — that's wired separately on the backend.
(function () {
  // Pages a stranger is allowed to read. Prices and answers have to survive being
  // linked from an ad or a WhatsApp message: bouncing those to login.html asked
  // people to make an account before they could find out what anything costs.
  // Everything else is a TOOL, and tools still need a session. Guests who reach a
  // public page get the login prompt from js/auth.js when they act (buy, chat).
  var PUBLIC = { "login.html": 1, "pricing.html": 1, "support.html": 1, "whatsapp.html": 1 };
  try {
    var token = localStorage.getItem("b7_token");
    var hasToken = !!token && token !== "guest";
    var local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    // Localhost is always treated as signed-in (preview).
    if (!hasToken && !local && !PUBLIC[page]) {
      location.replace("login.html");
    }
  } catch (e) {}
})();
