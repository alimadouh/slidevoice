// Auth gate: no session -> bounce to the login page before anything renders.
// Loaded in <head> of every protected page (home, humanizer, narrator).
// NOTE: this is a UX gate. Real enforcement is server-side (the API must reject
// requests without a valid token) — that's wired separately on the backend.
(function () {
  try {
    var token = localStorage.getItem("b7_token");
    var guest = localStorage.getItem("b7_guest");
    var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    // Signed-in OR guest can browse; a logged-out, non-guest visitor goes to login.
    if (!token && !guest && page !== "login.html") {
      location.replace("login.html");
    }
  } catch (e) {}
})();
