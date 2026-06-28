// Auth gate: no session -> bounce to the login page before anything renders.
// Loaded in <head> of every protected page (home, humanizer, narrator).
// NOTE: this is a UX gate. Real enforcement is server-side (the API must reject
// requests without a valid token) — that's wired separately on the backend.
(function () {
  try {
    var token = localStorage.getItem("b7_token");
    var hasToken = !!token && token !== "guest";
    var local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    // Localhost is always treated as signed-in (preview). Otherwise a visitor who is
    // NOT logged in is ALWAYS sent to the landing page — no guest browsing.
    if (!hasToken && !local && page !== "login.html") {
      location.replace("login.html");
    }
  } catch (e) {}
})();
