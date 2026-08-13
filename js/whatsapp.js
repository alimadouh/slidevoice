// WhatsApp page: open a chat with the team, with the message already started.
//
// The one thing this page can do that a bare wa.me link can't: put the ACCOUNT EMAIL
// into the first message. Nearly every WhatsApp conversation starts with us asking
// "which account is this?", and the person answering is usually on their phone, away
// from the address they signed up with. So we fill it in for them.
(function () {
  const API = (window.HUMANIZER_API || "").replace(/\/+$/, "");
  const BKEY = window.BRANCH_KEY || "";
  const TOKEN = (function () { try { const t = localStorage.getItem("b7_token"); return (t && t !== "guest") ? t : ""; } catch (e) { return ""; } })();
  const H = { "X-Branch-Key": BKEY };
  if (TOKEN) H["Authorization"] = "Bearer " + TOKEN;

  const NUMBER = "96555495757";               // Kuwait country code + 55495757
  const $ = (id) => document.getElementById(id);

  const link = (text) =>
    "https://wa.me/" + NUMBER + (text ? "?text=" + encodeURIComponent(text) : "");

  // ---- personalise the opening message ----
  (async function () {
    if (!TOKEN) return;                       // signed out: the plain link is already right
    let me = null;
    try { me = await (await fetch(API + "/api/auth/me", { headers: H })).json(); }
    catch (e) { return; }                     // API down: leave the plain link alone
    if (!me || me.error || !me.email) return;
    // WhatsApp drops this into the input box and waits — nothing is sent until they
    // press send — so the cursor lands after "help with" and the account line sits
    // below, theirs to delete. The note under the button says so, because text that
    // appears in your own message without warning is unsettling.
    $("waOpen").href = link("Hi B7oothKw — I need help with \n\n(My account: " + me.email + ")");
    $("waNote").innerHTML =
      "The message opens with your account email (<b>" + esc(me.email) + "</b>) at the bottom, " +
      "so we can find your orders straight away. Delete it if you'd rather not send it.";
  })();

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
})();
