// B7oothKw sign-in: Google One Tap / button + phone number with SMS OTP.
// On success a token is saved to localStorage("b7_token") and the user is sent
// back to the humanizer. Backend endpoints (to be implemented):
//   POST /api/b7/auth/google     { credential }            -> { token } | { error }
//   POST /api/b7/auth/otp/start  { phone }                 -> { ok }    | { error }
//   POST /api/b7/auth/otp/verify { phone, code }           -> { token } | { error }
const API = (window.HUMANIZER_API || "").replace(/\/$/, "");
const GID = window.GOOGLE_CLIENT_ID || "";
const TOKEN_KEY = "b7_token";
const AFTER_LOGIN = "humanizer.html";

const $ = (id) => document.getElementById(id);
const msgEl = $("loginMsg");
function msg(t, ok) { msgEl.textContent = t || ""; msgEl.classList.toggle("ok", !!ok); }

function finishLogin(token) {
  try { localStorage.setItem(TOKEN_KEY, token); localStorage.removeItem("b7_guest"); } catch (e) {}
  msg("Signed in — redirecting…", true);
  setTimeout(() => { location.href = AFTER_LOGIN; }, 500);
}

$("guestBtn").onclick = function () {
  try { localStorage.setItem("b7_guest", "1"); localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  location.href = "index.html";
};

// ---------------------------------------------------------------- Google
// Same flow as the Grade A site: an OAuth2 token client (access_token) posted to
// the existing /api/auth/google endpoint. The custom button loads Google's script
// lazily on click, so an ad-blocker just shows an error instead of hiding it.
let googleTokenClient = null;
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement("script");
    s.src = src; s.async = true; s.defer = true; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}
async function onGoogleToken(resp) {
  if (resp.error || !resp.access_token) { msg("Google sign-in was cancelled."); return; }
  msg("Signing in…");
  try {
    const r = await fetch(API + "/api/auth/google", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: resp.access_token }),
    });
    const j = await r.json();
    if (j.token) finishLogin(j.token);
    else msg(j.error || "Could not sign in with Google.");
  } catch (e) { msg("Couldn’t reach the server. Please try again."); }
}
async function ensureGoogleClient() {
  if (googleTokenClient) return;
  await loadScript("https://accounts.google.com/gsi/client");
  if (!(window.google && google.accounts && google.accounts.oauth2)) throw new Error("Google library unavailable");
  googleTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GID, scope: "openid email profile", callback: onGoogleToken,
  });
}
async function onGoogleClick() {
  if (!GID) { msg("Google sign-in isn’t configured yet."); return; }
  msg(""); $("googleBtn").classList.add("loading");
  try { await ensureGoogleClient(); googleTokenClient.requestAccessToken(); }
  catch (e) { msg("Couldn’t load Google sign-in (it may be blocked by your browser or network). Use phone sign-in instead."); }
  finally { $("googleBtn").classList.remove("loading"); }
}
$("googleBtn").onclick = onGoogleClick;

// ---------------------------------------------------------------- phone OTP
let phoneVal = "";
const reNum = /[^\d+]/g;

function showStep(n) {
  $("phoneStep1").hidden = n !== 1;
  $("phoneStep2").hidden = n !== 2;
}

async function sendCode() {
  const phone = $("phone").value.replace(reNum, "").trim();
  if (phone.replace(/\D/g, "").length < 7) { msg("Enter a valid phone number with country code."); return; }
  phoneVal = phone;
  $("btnSendCode").disabled = true; msg("Sending code…");
  try {
    const r = await fetch(API + "/api/b7/auth/otp/start", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const j = await r.json();
    if (j.error) { msg(j.error); return; }
    showStep(2); $("otp").value = ""; $("otp").focus();
    msg("We sent a code to " + phone + ".", true);
  } catch (e) { msg("Couldn’t reach the server. Please try again."); }
  finally { $("btnSendCode").disabled = false; }
}

async function verifyCode() {
  const code = $("otp").value.replace(/\D/g, "");
  if (code.length !== 6) { msg("Enter the 6-digit code."); return; }
  $("btnVerify").disabled = true; msg("Verifying…");
  try {
    const r = await fetch(API + "/api/b7/auth/otp/verify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phoneVal, code }),
    });
    const j = await r.json();
    if (j.token) finishLogin(j.token);
    else msg(j.error || "That code didn’t match. Please try again.");
  } catch (e) { msg("Couldn’t reach the server. Please try again."); }
  finally { $("btnVerify").disabled = false; }
}

$("btnSendCode").onclick = sendCode;
$("btnVerify").onclick = verifyCode;
$("btnResend").onclick = sendCode;
$("btnChangeNum").onclick = () => { showStep(1); msg(""); };
$("phone").addEventListener("keydown", (e) => { if (e.key === "Enter") sendCode(); });
$("otp").addEventListener("keydown", (e) => { if (e.key === "Enter") verifyCode(); });
