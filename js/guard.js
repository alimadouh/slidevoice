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
  // Keyed WITHOUT the extension: Netlify serves /pricing as well as /pricing.html and
  // does not redirect one to the other, so matching whole filenames sent every
  // extensionless visitor — every ad and WhatsApp link written the short way — to the
  // login page. Verified on the live site: /pricing answered 200 with the sign-in page
  // while /pricing.html answered with the real one.
  var PUBLIC = { "login": 1, "pricing": 1, "support": 1, "whatsapp": 1 };
  try {
    var token = localStorage.getItem("b7_token");
    var hasToken = !!token && token !== "guest";
    var local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    // Trailing slash comes off the PATH first — otherwise "/pricing/" pops an empty
    // segment and reads as the index. Then drop .html, so /pricing, /pricing.html and
    // /pricing/ all resolve to the same key, and a bare "/" falls back to index.
    var path = location.pathname.replace(/\/+$/, "");
    var page = (path.split("/").pop() || "index").toLowerCase().replace(/\.html$/, "");
    // Localhost is always treated as signed-in (preview).
    if (!hasToken && !local && !PUBLIC[page]) {
      location.replace("login.html");
    }
  } catch (e) {}
})();
