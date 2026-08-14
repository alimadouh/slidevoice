// Humanizer backend (shared models, "branch" access). The branch key is PUBLIC —
// it only tags requests as coming from this front-end. Tools require login: the
// server meters per-account and rejects requests without a valid token.
window.HUMANIZER_API = "https://api.gahumanizer.com";
window.BRANCH_KEY = "b7oothkw_pub_8e3f";

// Google sign-in. Uses the existing Web OAuth client (same /api/auth/google backend).
// For this to work, the site's origin must be in that client's "Authorized JavaScript
// origins". The list must include the LIVE domain — https://b7ooth-ai.com and
// https://www.b7ooth-ai.com — not just the Netlify subdomain; this comment previously
// named only https://slidevoice.netlify.app and http://localhost:8124, and if the
// console still matches that, "Continue with Google" fails on the real site with an
// origin mismatch and the user only sees "Couldn't load Google sign-in".
// Local preview is served on 8123 (npm run dev), so authorise 8123 as well as 8124.
// UNVERIFIED FROM HERE — only the account owner can read the Google Cloud console.
window.GOOGLE_CLIENT_ID = "204127206632-lqe7q172ck81ktn794k3sk4t8uh0f49i.apps.googleusercontent.com";
