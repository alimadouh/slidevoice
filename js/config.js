// Humanizer backend (shared models, "branch" access). The branch key is PUBLIC —
// it only tags requests as coming from this front-end. Tools require login: the
// server meters per-account and rejects requests without a valid token.
window.HUMANIZER_API = "https://api.gahumanizer.com";
window.BRANCH_KEY = "b7oothkw_pub_8e3f";

// Google sign-in. Uses the existing Web OAuth client (same /api/auth/google
// backend). For this to work, the site's origin must be in that client's
// "Authorized JavaScript origins" (https://slidevoice.netlify.app + http://localhost:8124).
window.GOOGLE_CLIENT_ID = "204127206632-lqe7q172ck81ktn794k3sk4t8uh0f49i.apps.googleusercontent.com";
