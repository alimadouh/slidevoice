// Staff → Stats: B7oothKw's accounts, Turnitin scans and revenue.
//
// Reads one endpoint (/api/admin/stats) and draws three charts from it. The bars are
// plain divs sized in percent rather than SVG or a charting library: the shapes here are
// simple enough that a library would only be a CDN dependency and a set of default colours
// to override, and divs inherit the theme tokens for free — this page works in light and
// dark without a single colour being named twice.
//
// Everything shown is B7oothKw only, for every viewer including the owner. That is fixed
// on the server (auth.STATS_SOURCE); there is no parameter here to widen it with.
(function () {
  const API = (window.HUMANIZER_API || "").replace(/\/+$/, "");
  const BKEY = window.BRANCH_KEY || "";
  const TOKEN = (function () { try { const t = localStorage.getItem("b7_token"); return (t && t !== "guest") ? t : ""; } catch (e) { return ""; } })();
  const H = { "X-Branch-Key": BKEY };
  if (TOKEN) H["Authorization"] = "Bearer " + TOKEN;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MON_FULL = ["January", "February", "March", "April", "May", "June", "July",
                    "August", "September", "October", "November", "December"];

  // KWD carries three decimals — its minor unit is 1/1000, so 3.000 written as "3.00"
  // is a dropped digit, not a tidier number.
  const kd = (v) => Number(v || 0).toLocaleString("en-US",
    { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const n = (v) => Number(v || 0).toLocaleString("en-US");
  // Axis labels only: three trailing zeros on every gridline is noise, and the exact
  // figure is one hover away.
  const axisNum = (v) => Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 3 });

  // "2026-08" -> "Aug". January carries the year so a twelve-month axis says where it
  // crosses, but only where there is room for it: in the half-width charts the columns
  // are ~30px and "Jan ’26" is simply cut in half, which is worse than not saying it.
  // Those charts span the same twelve months as the one above them, which names its range
  // in full.
  function xlab(m, compact) {
    const y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7));
    return (mo === 1 && !compact) ? "Jan ’" + String(y).slice(2) : MON[mo - 1];
  }
  function fullMonth(m) {
    return MON_FULL[Number(m.slice(5, 7)) - 1] + " " + m.slice(0, 4);
  }

  // A round number at or above the tallest bar, so the top gridline is readable rather
  // than being whatever the biggest month happened to be.
  function niceMax(v) {
    if (!(v > 0)) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const norm = v / pow;
    const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    return step * pow;
  }

  // Same, for a series that counts things. There are four gridlines below the top one, so
  // a maximum that isn't divisible by four labels them 18.75, 12.5, 6.25 -- and there is
  // no such thing as 6.25 signups. Rounding the QUARTER up, then multiplying back, gives
  // a top line that is still close to the data and four labels that are whole numbers.
  function niceMaxInt(v) {
    return Math.max(1, Math.ceil(niceMax(Math.max(1, Math.ceil(v))) / 4)) * 4;
  }

  // ---- chart ----------------------------------------------------------------------
  // series: [{ label, cls, get(row) }] stacked bottom-up in the order given.
  // fmt:    how a value is written in the hover readout.
  // opts:   { money } this series is currency, so the axis may carry fractions and a
  //                   month with a refund is marked;
  //         { compactX } narrow chart, so January drops its year.
  function chart(months, series, fmt, opts) {
    opts = opts || {};
    const totals = months.map((r) => series.reduce((s, x) => s + (x.get(r) || 0), 0));
    const peak = Math.max.apply(null, totals.concat([0]));
    const max = opts.money ? niceMax(peak) : niceMaxInt(peak);
    const lines = [1, 0.75, 0.5, 0.25, 0];

    const cols = months.map((r) => {
      const parts = series.map((x) => {
        const v = x.get(r) || 0;
        if (!v) return "";
        return '<span class="st-seg ' + x.cls + '" style="height:' + (v / max * 100) + '%"></span>';
      }).join("");
      // The readout names every series even at zero: "Turnitin —" is a fact about the
      // month, and a legend that appears and disappears is harder to read than a stable one.
      // The refund only belongs to the money chart. Marking it on the signups and scans
      // charts too — which an earlier version did, because `refunds` is on every row —
      // put a red flag under a month in which nothing about signups or scans went wrong.
      const refunded = opts.money && r.refunds > 0;
      // One figure per line, and no month: the column being hovered sits directly above
      // its own label on the axis, so naming the month again was the longest thing in the
      // readout and the only part of it the reader could already see.
      // Rendered as separate lines by white-space:pre-line on the bubble. The aria-label
      // below still names the month, because a screen reader has no axis to glance at.
      const rows = series.map((x) => x.label + " " + fmt(x.get(r) || 0));
      if (refunded) {
        rows.push("Refunded −" + kd(r.refunds) + " KD");
        rows.push("Net " + kd(r.total) + " KD");
      }
      const tip = rows.join("\n");
      return '<div class="st-col' + (refunded ? " has-ref" : "") +
             '" data-tip="' + esc(tip) + '" tabindex="0" role="img" aria-label="' +
             esc(fullMonth(r.m) + ": " + rows.join(", ")) + '">' +
             '<span class="st-stack">' + parts + "</span></div>";
    }).join("");

    return '<div class="st-chart">' +
      '<div class="st-plot">' +
        // Positioned rather than spaced out, so each label sits ON its gridline instead
        // of near it — with only five labels the drift is otherwise plainly visible.
        '<div class="st-ylab">' + lines.map((f) =>
          '<span style="top:' + ((1 - f) * 100) + '%">' + axisNum(max * f) + "</span>").join("") +
        "</div>" +
        '<div class="st-area"><div class="st-cols">' + cols + "</div></div>" +
      "</div>" +
      '<div class="st-xlab">' + months.map((r) =>
        "<span>" + esc(xlab(r.m, opts.compactX)) + "</span>").join("") + "</div>" +
    "</div>";
  }

  // ---- render ---------------------------------------------------------------------
  function render(d) {
    const t = d.totals, months = d.months || [];
    const gross = (t.subs || 0) + (t.turnitin || 0);
    const pct = (v) => gross > 0 ? (v / gross * 100) : 0;

    // Hero: the three money questions in one place. The split bar is the only decorative
    // thing on the page, and it is carrying real information.
    const hero =
      '<section class="st-hero">' +
        '<div class="st-hero-label">Lifetime revenue</div>' +
        '<div class="st-hero-num">' + kd(t.all) + ' <span class="st-cur">KD</span></div>' +
        // A segment worth 0.000 KD is not drawn at all. The bar gives every segment a
        // min-width so a small share stays visible, which turned an empty product into a
        // coloured nub claiming it had sold something.
        (gross > 0
          ? '<div class="st-split" role="img" aria-label="' +
              esc("Memberships " + kd(t.subs) + " KD, Turnitin " + kd(t.turnitin) + " KD") + '">' +
              [["is-subs", t.subs], ["is-tn", t.turnitin]].map(function (s) {
                return s[1] > 0
                  ? '<span class="st-split-seg ' + s[0] + '" style="width:' + pct(s[1]) + '%"></span>'
                  : "";
              }).join("") +
            "</div>"
          : '<p class="st-hero-empty">No payments recorded yet.</p>') +
        '<ul class="st-legend">' +
          '<li><i class="is-subs"></i><span>Memberships</span><b>' + kd(t.subs) + " KD</b></li>" +
          '<li><i class="is-tn"></i><span>Turnitin</span><b>' + kd(t.turnitin) + " KD</b></li>" +
          (t.refunds > 0
            ? '<li><i class="is-ref"></i><span>Refunded</span><b>−' + kd(t.refunds) + " KD</b></li>"
            : "") +
        "</ul>" +
      "</section>";

    const span = months.length
      ? fullMonth(months[0].m) + " – " + fullMonth(months[months.length - 1].m) : "";

    const revenue =
      '<section class="st-card">' +
        '<header class="st-card-head"><h3>Revenue by month</h3>' +
        '<span class="st-card-sub">' + esc(span) + "</span></header>" +
        chart(months, [
          { label: "Memberships", cls: "is-subs", get: (r) => r.subs },
          { label: "Turnitin", cls: "is-tn", get: (r) => r.turnitin },
        ], (v) => kd(v) + " KD", { money: true }) +
        // A month whose bar is drawn gross but whose net is lower is marked on the bar
        // itself; this only appears once that has actually happened.
        (months.some((r) => r.refunds > 0)
          ? '<p class="st-card-note">Bars show money taken. A marked month had a refund — ' +
            "hover it for the net.</p>" : "") +
      "</section>";

    // How many of each thing, month by month — the counts behind the money above. Both
    // product charts are read off the same payment rows as their revenue, so a chart here
    // and a figure in the hero can never tell different stories.
    //
    // The two products are paired side by side because they are the comparison worth
    // making, and they keep the colours they carry everywhere else on the page. Accounts
    // gets its own full-width row: it is neither of them, it holds the most data, and
    // three twelve-bar charts across one row leaves each column too narrow to label.
    const countCard = (title, total, label, cls, get, opts) =>
      '<section class="st-card">' +
        "<header class=\"st-card-head\"><h3>" + title + "</h3>" +
        '<span class="st-card-sub">' + n(total) + " total</span></header>" +
        chart(months, [{ label: label, cls: cls, get: get }], n, opts) +
      "</section>";

    const counts =
      '<div class="st-mini">' +
        countCard("Memberships bought", t.memberships, "Bought", "is-subs",
                  (r) => r.memberships, { compactX: true }) +
        countCard("Turnitin scans bought", t.scans, "Bought", "is-scans",
                  (r) => r.scans, { compactX: true }) +
      "</div>" +
      '<div class="st-wide">' +
        countCard("New accounts", t.users, "Signups", "is-users", (r) => r.signups, {}) +
      "</div>";

    // Never silently dropped. If a payment's amount couldn't be read, the revenue figures
    // above are missing it, and that has to be visible or they look complete when they
    // aren't.
    const bad = d.unreadable || {};
    const warn = bad.count > 0
      ? '<p class="st-warn"><b>' + n(bad.count) + (bad.count === 1 ? " payment" : " payments") +
        "</b> could not be read and are missing from the totals above" +
        (bad.samples && bad.samples.length
          ? " (e.g. " + bad.samples.map(esc).join(", ") + ")" : "") + ".</p>"
      : "";

    $("stBody").innerHTML = hero + revenue + counts + warn;
  }

  // ---- load -----------------------------------------------------------------------
  function state(html) { $("stBody").innerHTML = '<p class="st-state">' + html + "</p>"; }

  async function load() {
    const btn = $("stRefreshBtn");
    btn.disabled = true;
    try {
      const d = await (await fetch(API + "/api/admin/stats", { headers: H })).json();
      if (d.error) { state(esc(d.error)); return; }
      render(d);
    } catch (e) {
      state("Couldn’t reach the server. Try Refresh.");
    } finally {
      btn.disabled = false;
    }
  }

  $("stRefreshBtn").onclick = load;
  load();
})();
