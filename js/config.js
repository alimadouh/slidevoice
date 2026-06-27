// Humanizer backend (shared models, anonymous "branch" access).
// The branch key is PUBLIC by design — it only tags requests as coming from this
// front-end. Real protection is server-side CORS + per-IP daily limits.
window.HUMANIZER_API = "https://api.gahumanizer.com";
window.BRANCH_KEY = "b7oothkw_pub_8e3f";

// Google sign-in. Uses the existing Web OAuth client (same /api/auth/google
// backend). For this to work, the site's origin must be in that client's
// "Authorized JavaScript origins" (https://slidevoice.netlify.app + http://localhost:8124).
window.GOOGLE_CLIENT_ID = "204127206632-lqe7q172ck81ktn794k3sk4t8uh0f49i.apps.googleusercontent.com";
