// ---- device id ----------------------------------------------------------------
// A deterministic fingerprint of stable machine traits, so every account opened on
// this machine reports the same id — including in a private window, because the
// hardware does not change. localStorage only caches the answer so the first request
// after a cold load does not race the hash.
//
// Two things on the server read it, and neither treats it as proof of anything:
//   - the one-time free words are charged to the DEVICE as well as the account, so a
//     second email on the same laptop does not mint a second 150 (b7_trial_dev);
//   - a B7oothKw account may hold one computer session and one phone session, and
//     this is what tells two computers apart (_device_conflict).
// A determined person can clear it and start again. That is understood and accepted:
// a value the client computes can raise the effort of farming, and can never be an
// authorization boundary. Everything that actually costs money is checked against the
// account on the server.
//
// Ported deliberately from Grade A's app.js rather than reinvented, traits and all, so
// the two sites agree on what "the same machine" means and a bug fixed in one is
// recognisable in the other. The storage key differs (b7_dev_id) because the sites are
// different origins and share nothing.
(function () {
  var KEY = "b7_dev_id";
  try { window.DEVICE_ID = localStorage.getItem(KEY) || ""; } catch (e) { window.DEVICE_ID = ""; }

  var cv = "";
  try {
    var c = document.createElement("canvas"); c.width = 240; c.height = 60;
    var x = c.getContext("2d");
    x.textBaseline = "top"; x.font = "16px Arial";
    x.fillStyle = "#f60"; x.fillRect(10, 10, 100, 30);
    x.fillStyle = "#069"; x.fillText("B7ooth-fp", 4, 20);
    x.strokeStyle = "rgba(120,40,200,.6)"; x.beginPath(); x.arc(60, 30, 22, 0, 5.3); x.stroke();
    cv = c.toDataURL();
  } catch (e) {}

  var gl = "";
  try {
    var g = document.createElement("canvas").getContext("webgl");
    var dbg = g && g.getExtension("WEBGL_debug_renderer_info");
    if (dbg) gl = g.getParameter(dbg.UNMASKED_VENDOR_WEBGL) + "|" +
                  g.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
  } catch (e) {}

  var traits = [cv, gl, screen.width, screen.height, screen.colorDepth,
                window.devicePixelRatio || 1,
                (Intl.DateTimeFormat().resolvedOptions().timeZone || ""),
                navigator.language, navigator.platform || "",
                navigator.hardwareConcurrency || 0, navigator.deviceMemory || 0].join("~");

  function store(id) {
    window.DEVICE_ID = id;
    try { localStorage.setItem(KEY, id); } catch (e) {}
  }

  if (window.crypto && crypto.subtle && crypto.subtle.digest) {
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(traits)).then(function (buf) {
      store(Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("").slice(0, 40));
    }).catch(function () {});
  } else {                                        // http/dev fallback: dual djb2
    var h1 = 5381, h2 = 52711;
    for (var i = 0; i < traits.length; i++) {
      h1 = ((h1 * 33) ^ traits.charCodeAt(i)) >>> 0;
      h2 = ((h2 * 33) ^ traits.charCodeAt(i)) >>> 0;
    }
    store(h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0"));
  }

  // Ten separate files build their own Authorization header (auth, chats, codes,
  // humanizer, login, pricing, redeem, shell, support, turnitin, whatsapp). Adding the
  // id to each is ten chances to forget one, and a request that arrives without it is
  // charged to the shared per-connection pool instead — which on a Kuwaiti mobile
  // network can be a whole neighbourhood. Wrapping fetch once puts it on every request
  // there will ever be, including ones added later.
  var real = window.fetch;
  if (typeof real !== "function") return;
  window.fetch = function (input, init) {
    var ours = false;
    try {
      var url = (typeof input === "string") ? input : (input && input.url) || "";
      var api = window.HUMANIZER_API || "";
      // Our backend only. Never attach a fingerprint to a third party's URL.
      ours = !!(api && url.indexOf(api) === 0);
      if (window.DEVICE_ID && ours) {
        init = Object.assign({}, init || {});
        var h = new Headers((init.headers) ||
                            (typeof input === "object" && input && input.headers) || {});
        if (!h.has("X-Device-Id")) h.set("X-Device-Id", window.DEVICE_ID);
        init.headers = h;
      }
    } catch (e) {}                                // never let this break a request
    return real.call(this, input, init).then(function (res) {
      // The server ends a session the moment its token turns up on another machine
      // (see session_device in api.py). That is not an error the page should try to
      // render — the token in storage is dead, so drop it and ask for a sign-in.
      // Told apart from an ordinary expiry by the header, which the backend exposes
      // to us in its CORS config.
      try {
        if (ours && res && res.status === 401 &&
            res.headers.get("X-Session-Ended") === "device") {
          localStorage.removeItem("b7_token");
          localStorage.removeItem("b7_guest");
          // Netlify serves /login as well as /login.html, so compare the page the
          // way guard.js does rather than matching a filename and looping.
          var path = location.pathname.replace(/\/+$/, "");
          var page = (path.split("/").pop() || "index").toLowerCase().replace(/\.html$/, "");
          if (page !== "login") location.replace("login.html?signedout=device");
        }
      } catch (e) {}
      return res;
    });
  };
})();
