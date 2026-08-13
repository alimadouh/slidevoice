// B7oothKw app shell — builds the Grade A-style sidebar on every tool page.
//
// One source, five pages. Each page ships only <div class="app-shell"> with its
// own <main class="content">; this prepends the sidebar and marks the current
// page active from data-view on <body>. Runs synchronously at the end of <body>,
// BEFORE DOMContentLoaded, so theme.js still finds #themeToggle when it re-applies
// the stored theme and sets the icon.
(function () {
  var shell = document.getElementById("appShell");
  if (!shell) return;

  // Humanizer, PowerPoint and Word are three sidebar items served by ONE page, told
  // apart by the hash — so the nav highlights the right one without a second document.
  var SUBVIEWS = { "#pptx": "pptx", "#word": "word" };
  var here = document.body.getAttribute("data-view") || "humanizer";
  if (here === "humanizer" && SUBVIEWS[location.hash]) here = SUBVIEWS[location.hash];
  var COLLAPSE_KEY = "b7_nav_collapsed";

  // The B7oothKw wordmark, same drawing as the old top bar.
  var LOGO =
    '<svg class="logo-svg" viewBox="0 0 1243 360" role="img" aria-label="B7oothKw" xmlns="http://www.w3.org/2000/svg">' +
      '<g class="lg-cap" fill="#16161a">' +
        '<polygon points="178.0,96.08 318.4,146.0 178.0,195.92 37.6,146.0"/>' +
        '<polygon points="126.0,173.04 152.0,185.52 178.0,188.64 204.0,185.52 230.0,173.04 230.0,198.0 209.2,212.56 178.0,217.76 146.8,212.56 126.0,198.0"/>' +
        '<ellipse cx="178.0" cy="103.36" rx="9.36" ry="9.36"/>' +
      '</g>' +
      '<g class="lg-tassel">' +
        '<path d="M178.0,94.0 Q276.8,98.16 318.4,146.0 L318.4,208.4" fill="none" stroke="#FF3131" stroke-width="7.28" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<ellipse cx="318.4" cy="208.4" rx="11.44" ry="11.44" fill="#FF3131"/>' +
        '<polygon points="308.0,212.56 328.8,212.56 324.64,247.92 312.16,247.92" fill="#FF3131"/>' +
      '</g>' +
      '<path class="lg-must" d="M180.0,258.0 C188.0,239.0 204.0,237.0 220.0,243.0 C238.0,249.0 246.0,253.0 258.0,251.0 C272.0,249.0 281.0,235.0 285.0,220.0 C281.0,237.0 273.0,248.0 260.0,254.0 C240.0,270.0 220.0,280.0 202.0,282.0 C194.0,283.0 187.0,282.0 180.0,280.0 C173.0,282.0 166.0,283.0 158.0,282.0 C140.0,280.0 120.0,270.0 100.0,254.0 C87.0,248.0 79.0,237.0 75.0,220.0 C79.0,235.0 88.0,249.0 102.0,251.0 C114.0,253.0 122.0,249.0 140.0,243.0 C156.0,237.0 172.0,239.0 180.0,258.0 Z" fill="#16161a"/>' +
      '<text class="lg-word" x="352" y="191" font-family="\'Segoe UI\', system-ui, Arial, sans-serif" font-weight="900" font-size="170" dominant-baseline="middle" letter-spacing="-2">B7ooth<tspan fill="#FF3131">Kw</tspan></text>' +
    '</svg>';

  // view id -> {href, label, icon markup}. Order is the order in the sidebar.
  var TOOLS = [
    { v: "humanizer", href: "humanizer.html",      ic: "✦", label: "Humanizer" },
    { v: "pptx",      href: "humanizer.html#pptx", ic: "▤", label: "PowerPoint Humanizer", icColor: "#d24726" },
    { v: "word",      href: "humanizer.html#word", ic: "▥", label: "Word Humanizer", icColor: "#2b579a" },
    // Just the blue Turnitin mark, cropped out of assets/turnitin.svg (which is the
    // full 653-wide wordmark — squeezed into an 18px box it shrank to a speck).
    // The wordmark is set as text beside it, exactly as Grade A does.
    { v: "turnitin",  href: "turnitin.html",       label: "Turnitin",
      svg: '<svg class="nav-tn-icon" viewBox="0 0 120 200" fill="#0096ff" aria-hidden="true">' +
             '<path d="M8.2 74.4L5.6 90.9h26.3C11.2 109.6 0 138.7 0 157.5c0 13.9 4.4 24.7 13.3 32.1 7.1 6 16.9 9.3 29.1 10.1l1.2.1V194l-.9-.2c-11.1-2.5-29.6-9.9-29.8-32.4-.1-16.8 17.2-48.2 37.2-61.4l-5.3 30.5h16.9l9.5-56-63-.1z"/>' +
             '<path d="M24.6 0C15.9 0 8.8 7.1 8.7 15.7l-.6 44.2 9.1.1h9l.5-41.9h74.4l.5 113.5H77.8l-3.1 18.1h29.1c8.7 0 15.9-7.9 16-16.6L119.5 0H24.6z"/>' +
           '</svg>',
      word: 'turnitin<sup>&trade;</sup>' },
    { v: "narrator",  href: "narrator.html",       ic: "♪", label: "Slide Narrator", icColor: "#36d6e7" },
  ];
  var ACCOUNT = [
    { v: "plans", href: "pricing.html", ic: "◆", label: "Plans" },
    { v: "help",  href: "https://wa.me/96555495757", ic: "✆", label: "Help on WhatsApp",
      cls: "nav-wa", external: true },
  ];

  function itemHTML(it) {
    var icon = it.svg
      ? it.svg
      : '<span class="nav-ic"' + (it.icColor ? ' style="color:' + it.icColor + '"' : "") + '>' + it.ic + "</span>";
    var text = it.word ? '<span class="nav-tn-word">' + it.word + "</span>" : it.label;
    return '<a href="' + it.href + '" class="nav-item' + (it.cls ? " " + it.cls : "") +
           (it.v === here ? " active" : "") + '" data-view="' + it.v + '"' +
           (it.external ? ' target="_blank" rel="noopener"' : "") +
           (it.word ? ' aria-label="' + it.label + '"' : "") + ">" + icon + " " + text + "</a>";
  }

  var aside = document.createElement("aside");
  aside.className = "sidebar";
  aside.innerHTML =
    '<div class="side-brand"><a class="logo-link" href="humanizer.html" aria-label="B7oothKw — humanizer">' + LOGO + "</a></div>" +
    '<button class="theme-toggle" id="themeToggle" type="button" title="Switch light / dark theme" aria-label="Toggle theme">☀</button>' +
    '<button class="nav-burger" id="navBurger" type="button" aria-label="Open menu" aria-expanded="false"><span></span><span></span><span></span></button>' +
    '<nav class="nav">' +
      '<div class="nav-group-label">Tools</div>' + TOOLS.map(itemHTML).join("") +
      '<div class="nav-group-label">Account</div>' + ACCOUNT.map(itemHTML).join("") +
    "</nav>" +
    '<div class="side-foot"><button class="acct-chip" id="acctBtn" type="button"></button></div>';

  var toggle = document.createElement("button");
  toggle.className = "sidebar-toggle";
  toggle.id = "sidebarToggle";
  toggle.type = "button";
  toggle.title = "Collapse / expand menu";
  toggle.setAttribute("aria-label", "Toggle menu");
  toggle.innerHTML = '<span class="chev">‹</span>';

  shell.insertBefore(aside, shell.firstChild);
  aside.parentNode.insertBefore(toggle, aside.nextSibling);

  // theme.js owns the click handler on the real site; it reads #themeToggle by id.
  document.getElementById("themeToggle").onclick = function () {
    if (window.toggleTheme) window.toggleTheme();
  };

  // ---- collapse (desktop), remembered across pages ----
  try { if (localStorage.getItem(COLLAPSE_KEY) === "1") shell.classList.add("collapsed"); } catch (e) {}
  toggle.onclick = function () {
    var on = shell.classList.toggle("collapsed");
    try { localStorage.setItem(COLLAPSE_KEY, on ? "1" : "0"); } catch (e) {}
  };

  // ---- burger (mobile) ----
  var burger = document.getElementById("navBurger");
  burger.onclick = function () {
    var open = aside.classList.toggle("menu-open");
    burger.setAttribute("aria-expanded", open ? "true" : "false");
  };
  // Tapping a link or anywhere outside closes the overlay; without this the menu
  // stays open behind the next page's paint on a same-page (#pptx) navigation.
  aside.addEventListener("click", function (e) {
    if (e.target.closest(".nav-item")) {
      aside.classList.remove("menu-open");
      burger.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("click", function (e) {
    if (!aside.contains(e.target)) {
      aside.classList.remove("menu-open");
      burger.setAttribute("aria-expanded", "false");
    }
  });

  // Humanizer <-> PowerPoint is a hash change on the same page, so no document
  // load happens: move the highlight and let the page swap its own pane.
  window.addEventListener("hashchange", function () {
    if (document.body.getAttribute("data-view") !== "humanizer") return;
    var want = SUBVIEWS[location.hash] || "humanizer";
    aside.querySelectorAll('.nav-item[data-view]').forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-view") === want);
    });
  });

  // ---- account chip (auth.js fills the label; this gives it the avatar) ----
  // auth.js sets textContent on #acctBtn, which would wipe the avatar, so render
  // ours after it has run and keep its click handler.
  function paintAcct() {
    var b = document.getElementById("acctBtn");
    if (!b) return;
    var signedIn = window.b7HasToken && window.b7HasToken();
    var label = signedIn ? "Log out" : "Log in";
    b.textContent = "";
    var av = document.createElement("span");
    av.className = "acct-avatar";
    av.textContent = signedIn ? "B7" : "?";
    var tx = document.createElement("span");
    tx.className = "acct-text";
    tx.textContent = label;
    b.appendChild(av); b.appendChild(tx);
    b.title = label;
    b.onclick = signedIn
      ? function () { if (window.b7Logout) window.b7Logout(); }
      : function () { location.href = "login.html"; };
  }
  if (document.readyState === "loading") {
    // after auth.js's own DOMContentLoaded handler, which runs first (loaded earlier)
    document.addEventListener("DOMContentLoaded", paintAcct);
  } else {
    paintAcct();
  }
})();
