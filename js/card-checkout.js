// MyFatoorah's card component, in a modal, for the month. Ported from Grade A's
// openCardCheckout (static/app.js) -- same component, same settings, red instead of
// indigo -- so the two storefronts sell a subscription the same way.
//
// The card is typed into THEIR iframe: it never touches this page, and nothing here
// handles a token. The same press of Pay takes this month's money and files the card
// against the account; the WEBHOOK grants the month and switches renewal on with that
// card. All this page learns is "it worked", and then it walks to the humanizer, which
// polls until the grant lands (js/humanizer.js, ?paid=).
//
//   window.b7CardCheckout(session)   session = the {session} object /api/myfatoorah/checkout
//                                    answers with: session_id, script, amount, currency, plan, return
(function () {
  var $ = function (id) { return document.getElementById(id); };

  function loadScript(src) {
    return new Promise(function (res, rej) {
      if (document.querySelector('script[src="' + src + '"]')) return res();
      var s = document.createElement("script");
      s.src = src; s.async = true; s.defer = true; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  // Money the way the plan card prints it: "9.5 KWD".
  function money(amount, currency) {
    var c = String(currency || "").toUpperCase();
    if (c === "USD") return "$" + Number(amount).toFixed(2);
    return amount + " " + c;
  }

  // The card form is MyFatoorah's iframe, but its inputs, labels and button take a
  // style object from us -- so it is dressed in the page's own tokens. B7oothKw sets
  // them on body.hz-page (not :root), so they are read off <body>, at open time so the
  // light theme comes out right too. Nothing here can read what is typed.
  function formStyle(total) {
    var css = getComputedStyle(document.body);
    var v = function (name, fallback) { return (css.getPropertyValue(name) || "").trim() || fallback; };
    var font = '"Inter","Segoe UI",system-ui,-apple-system,sans-serif';
    return {
      showCardholderName: true,
      hideCardIcons: false,
      // The three field rows sit in a box MyFatoorah gives a FIXED height (140px by
      // default, sized for their bare form). Ours is label + 46px input + 8px margin,
      // three times: ~236px. Left at the default the third row spilled out under the
      // Pay button. Change inputHeight, inputMargin or the label size and this moves.
      cardHeight: "240px",
      input: {
        color: v("--ink", "#e8edf4"), fontSize: "15px", fontFamily: font,
        inputHeight: "46px", inputMargin: "8px",
        borderColor: v("--line2", "#2c3645"), backgroundColor: v("--panel2", "#161b26"),
        borderWidth: "1px", borderRadius: "10px", outerRadius: "10px",
        placeHolder: { color: v("--faint", "#5b6675"), holderName: "Name on card",
                       cardNumber: "1234 5678 9012 3456", expiryDate: "MM / YY",
                       securityCode: "CVV" },
      },
      label: {
        display: true, color: v("--mut", "#8b97a8"), fontSize: "12px", fontWeight: "600",
        fontFamily: font,
        text: { holderName: "Name on card", cardNumber: "Card number",
                expiryDate: "Expiry", securityCode: "CVV" },
      },
      error: { borderColor: v("--bad", "#f0564b"), borderRadius: "10px" },
      button: {
        textContent: "Pay " + total, fontSize: "15px", fontFamily: font, color: "#ffffff",
        backgroundColor: v("--acc", "#ff3131"), height: "46px", borderRadius: "10px",
        width: "100%", margin: "14px 0 0", cursor: "pointer",
      },
      separator: {
        useCustomSeparator: true, textContent: "Or pay with card", fontSize: "12px",
        color: v("--faint", "#5b6675"), fontFamily: font, textSpacing: "0.3px",
        lineStyle: "solid", lineColor: v("--line", "#222a37"), lineThickness: "1px",
      },
    };
  }

  function close() {
    var m = $("cardModal");
    if (m) m.classList.add("hidden");
  }

  // The component's answer. Only two things are read from it: did the payment complete,
  // and if not, is there a MyFatoorah page to finish it on. The month itself is granted
  // by the webhook, which is why this lands on the same ?paid= page as the hosted flow.
  function done(s, res) {
    var msg = $("cardMsg");
    if (!res || !res.isSuccess) {
      msg.textContent = "That card wasn't accepted. You can try another one.";
      return;
    }
    if (res.paymentCompleted) {
      msg.textContent = "Paid — activating your month…";
      location.href = s.return;
      return;
    }
    if (res.redirectionUrl && window.b7PayUrlOk && b7PayUrlOk(res.redirectionUrl)) {
      location.href = res.redirectionUrl;          // finish on MyFatoorah's own page
      return;
    }
    msg.textContent = "Payment didn't complete. You haven't been charged — you can try again.";
  }

  window.b7CardCheckout = async function (s) {
    var modal = $("cardModal");
    if (!modal) return false;
    var total = money(s.amount, s.currency);
    $("cardAmount").textContent = total;
    $("cardTotal").textContent = total;
    $("cardMsg").textContent = "";
    $("mfCard").innerHTML = "";
    modal.classList.remove("hidden");
    try {
      await loadScript(s.script);
    } catch (e) {
      $("cardMsg").textContent = "Couldn't load the card form. Please try again.";
      return true;
    }
    try {
      // No countryCode, on purpose: given one the component sends the session id whole
      // ("KWT-<uuid>") and MyFatoorah's view answers "SessionId is not valid!". Without
      // it the component splits the id itself, which is what their server accepts.
      myfatoorah.init({
        sessionId: s.session_id,
        currencyCode: s.currency,
        amount: String(s.amount),
        containerId: "mfCard",
        shouldHandlePaymentUrl: true,        // the component runs the 3-D Secure step itself
        callback: done.bind(null, s),
        // Card only. KNET is the "hostedPayment" tile: a KNET purchase would grant the
        // month without saving a card, so it could never renew. Apple Pay saves a token
        // FastPay cannot charge. KNET is still taken for scans, on the hosted page.
        settings: {
          card: { language: "en", style: formStyle(total) },
          applePay: { isEnabled: false }, googlePay: { isEnabled: false },
          stcPay: { isEnabled: false }, hostedPayment: { isEnabled: false },
        },
      });
    } catch (e) {
      $("cardMsg").textContent = "Couldn't show the card form. Please try again.";
    }
    return true;
  };

  function init() {
    var modal = $("cardModal");
    if (!modal) return;
    modal.querySelectorAll("[data-close]").forEach(function (b) { b.onclick = close; });
    modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.classList.contains("hidden")) close();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
