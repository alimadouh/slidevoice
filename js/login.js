// B7oothKw sign-in: Google One Tap / button + email/password (shared backend).
// On success a token is saved to localStorage("b7_token") and the user is sent
// back to the humanizer.
const API = (window.HUMANIZER_API || "").replace(/\/$/, "");
const GID = window.GOOGLE_CLIENT_ID || "";
const BKEY = window.BRANCH_KEY || "";     // tags sign-ups as B7oothKw (separate from Grade A)
const TOKEN_KEY = "b7_token";
const AFTER_LOGIN = "index.html";        // back to the home chooser after signing in

const $ = (id) => document.getElementById(id);
const msgEl = $("loginMsg");
function msg(t, ok) { msgEl.textContent = t || ""; msgEl.classList.toggle("ok", !!ok); }

function finishLogin(token) {
  try { localStorage.setItem(TOKEN_KEY, token); localStorage.removeItem("b7_guest"); } catch (e) {}
  msg("Signed in — redirecting…", true);
  setTimeout(() => { location.href = AFTER_LOGIN; }, 500);
}

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
      method: "POST", headers: { "Content-Type": "application/json", "X-Branch-Key": BKEY },
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
  catch (e) { msg("Couldn’t load Google sign-in (it may be blocked by your browser or network). Use email & password instead."); }
  finally { $("googleBtn").classList.remove("loading"); }
}
$("googleBtn").onclick = onGoogleClick;

// ---------------------------------------------------------------- email / password
// Reuses the shared backend (/api/auth/*). The branch key tags new accounts as B7oothKw.
const AJH = { "Content-Type": "application/json", "X-Branch-Key": BKEY };
let authMode = "login", authBusy = false, pendingEmail = "", resetEmail = "", resetStep = 1;

function showPanel(name) {
  $("authMain").hidden = name !== "main";
  $("authVerify").hidden = name !== "verify";
  $("authReset").hidden = name !== "reset";
}
function setAuthMode(mode) {
  authMode = mode;
  $("tabLogin").classList.toggle("on", mode === "login");
  $("tabRegister").classList.toggle("on", mode === "register");
  $("authSubmit").textContent = mode === "login" ? "Log in" : "Create account";
  $("authPass").setAttribute("autocomplete", mode === "login" ? "current-password" : "new-password");
  $("forgotRow").style.display = mode === "login" ? "" : "none";
  msg("");
}

async function doLogin(email, password) {
  const r = await fetch(API + "/api/auth/login", { method: "POST", headers: AJH, body: JSON.stringify({ email, password }) });
  const d = await r.json();
  if (d.token) finishLogin(d.token);
  else msg(d.error || "Couldn’t log in.");
}
async function doAuth() {
  if (authBusy) return;
  const email = $("authEmail").value.trim(), password = $("authPass").value;
  if (!email || !password) { msg("Enter your email and password."); return; }
  authBusy = true; $("authSubmit").classList.add("loading"); msg("");
  try {
    if (authMode === "register") {
      const r = await fetch(API + "/api/auth/register", { method: "POST", headers: AJH, body: JSON.stringify({ email, password }) });
      const d = await r.json();
      if (d.error) { msg(d.error); return; }
      if (d.pending) {                       // code emailed → verification step
        pendingEmail = email;
        $("verifyMsg").textContent = `We've emailed ${email}. If you're creating a new account, enter the 6-digit code below (expires in ${d.ttl_min || 5} min). If you already have an account, just log in.`;
        $("authCode").value = ""; showPanel("verify"); $("authCode").focus();
        return;
      }
    }                                         // d.verified or login mode → just log in
    await doLogin(email, password);
  } catch (e) { msg("Couldn’t reach the server. Please try again."); }
  finally { authBusy = false; $("authSubmit").classList.remove("loading"); }
}
async function doVerify() {
  if (authBusy) return;
  const code = $("authCode").value.trim();
  if (!/^\d{4,8}$/.test(code)) { msg("Enter the code from your email."); return; }
  authBusy = true; $("verifySubmit").classList.add("loading"); msg("");
  try {
    const r = await fetch(API + "/api/auth/verify", { method: "POST", headers: AJH, body: JSON.stringify({ email: pendingEmail, code }) });
    const d = await r.json();
    if (d.token) finishLogin(d.token);
    else msg(d.error || "That code didn’t match.");
  } catch (e) { msg("Couldn’t reach the server. Please try again."); }
  finally { authBusy = false; $("verifySubmit").classList.remove("loading"); }
}
async function doResend(e) {
  if (e) e.preventDefault(); msg("");
  try {
    const r = await fetch(API + "/api/auth/resend", { method: "POST", headers: AJH, body: JSON.stringify({ email: pendingEmail }) });
    const d = await r.json();
    msg(d.error || `A new code was sent to ${pendingEmail}.`, !d.error);
  } catch (e2) { msg("Couldn’t reach the server."); }
}

function setResetStep(step) {
  resetStep = step;
  const s2 = step === 2;
  $("resetEmail").hidden = s2; $("resetCode").hidden = !s2; $("resetPass").hidden = !s2;
  $("resetSubmit").textContent = s2 ? "Reset password" : "Send reset code";
}
function showReset() {
  showPanel("reset"); $("resetEmail").value = $("authEmail").value.trim();
  $("resetCode").value = ""; $("resetPass").value = ""; setResetStep(1); msg("");
}
async function doForgot() {
  if (authBusy) return;
  const email = $("resetEmail").value.trim();
  if (!email) { msg("Enter your email."); return; }
  authBusy = true; $("resetSubmit").classList.add("loading"); msg("");
  try {
    const r = await fetch(API + "/api/auth/forgot", { method: "POST", headers: AJH, body: JSON.stringify({ email }) });
    const d = await r.json();
    if (d.error) { msg(d.error); return; }
    resetEmail = email;
    $("resetMsg").textContent = `If ${email} has an account, we sent a 6-digit code (expires in ${d.ttl_min || 5} min).`;
    setResetStep(2); $("resetCode").focus();
  } catch (e) { msg("Couldn’t reach the server."); }
  finally { authBusy = false; $("resetSubmit").classList.remove("loading"); }
}
async function doReset() {
  if (authBusy) return;
  const code = $("resetCode").value.trim(), password = $("resetPass").value;
  if (!/^\d{4,8}$/.test(code)) { msg("Enter the code from your email."); return; }
  if (!password || password.length < 6) { msg("Password must be at least 6 characters."); return; }
  authBusy = true; $("resetSubmit").classList.add("loading"); msg("");
  try {
    const r = await fetch(API + "/api/auth/reset", { method: "POST", headers: AJH, body: JSON.stringify({ email: resetEmail, code, password }) });
    const d = await r.json();
    if (d.token) finishLogin(d.token);
    else msg(d.error || "Couldn’t reset the password.");
  } catch (e) { msg("Couldn’t reach the server."); }
  finally { authBusy = false; $("resetSubmit").classList.remove("loading"); }
}

$("tabLogin").onclick = () => setAuthMode("login");
$("tabRegister").onclick = () => setAuthMode("register");
$("authSubmit").onclick = doAuth;
$("verifySubmit").onclick = doVerify;
$("resendCode").onclick = doResend;
$("backToSignup").onclick = (e) => { e.preventDefault(); showPanel("main"); msg(""); };
$("forgotLink").onclick = (e) => { e.preventDefault(); showReset(); };
$("resetBack").onclick = (e) => { e.preventDefault(); showPanel("main"); msg(""); };
$("resetSubmit").onclick = () => (resetStep === 1 ? doForgot() : doReset());
$("authPass").addEventListener("keydown", (e) => { if (e.key === "Enter") doAuth(); });
$("authCode").addEventListener("keydown", (e) => { if (e.key === "Enter") doVerify(); });

// ---------------------------------------------------------------- AI engine demo
// Cycles AI -> human sentence pairs: shows the AI input, then "types" the humanized
// output word by word while the AI% gauge drops 98% -> 2%. (Mirrors the Grade A landing.)
(function () {
  var IN = document.getElementById("engBodyIn"), OUT = document.getElementById("engBodyOut");
  if (!IN || !OUT) return;
  var stIn = document.getElementById("engIn"), stOut = document.getElementById("engOut");
  var pIn = document.getElementById("engPctIn"), pOut = document.getElementById("engPctOut");
  var PAIRS = [
    { ai: "This essay demonstrates the significance of the proposed framework for improving efficiency.",
      human: "This essay shows why the new framework really matters when you want to get more done." },
    { ai: "Maintaining a balanced diet contributes significantly to long-term health outcomes and overall performance.",
      human: "Eating well really pays off — you feel better now and stay healthier down the road." },
    { ai: "Artificial intelligence is increasingly integrated into modern workflows to automate repetitive processes.",
      human: "AI is popping up in more workplaces because it takes the boring, repetitive tasks off your plate." },
    { ai: "Effective communication is essential for building productive relationships in professional contexts.",
      human: "Good communication just makes work easier, whether you're talking to teammates or your boss." },
    { ai: "Financial literacy enables individuals to make informed decisions regarding budgeting and investment.",
      human: "Knowing the basics of money helps you budget, save, and steer clear of bad money moves." }
  ];
  var idx = 0;
  IN.textContent = PAIRS[0].ai;
  function setG(p) { pOut.textContent = Math.round(p) + "% AI"; pOut.style.color = p > 50 ? "#e5524b" : p > 20 ? "#d8a234" : "#2bbf6a"; }
  function cycle() {
    var pair = PAIRS[idx], words = pair.human.split(" ");
    IN.textContent = pair.ai;
    pIn.textContent = "98% AI"; pIn.style.color = "#e5524b";
    stOut.classList.remove("done"); OUT.classList.remove("typing"); OUT.classList.add("dim"); OUT.textContent = "…";
    pOut.textContent = "—"; pOut.style.color = "";
    stIn.classList.add("active");
    setTimeout(function () {
      stIn.classList.remove("active"); OUT.classList.remove("dim"); OUT.classList.add("typing"); OUT.textContent = "";
      setG(98);
      var i = 0, iv = setInterval(function () {
        OUT.textContent += (i ? " " : "") + words[i]; i++;
        setG(98 - (i / words.length) * 96);
        if (i >= words.length) {
          clearInterval(iv); setG(2); OUT.classList.remove("typing"); stOut.classList.add("done");
          idx = (idx + 1) % PAIRS.length;
          setTimeout(cycle, 4200);
        }
      }, 75);
    }, 1300);
  }
  setTimeout(cycle, 800);
})();
