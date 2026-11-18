/* Boutique : commande, suivi par code, commandes de cet appareil. */
(function () {
  var D = window.DL, $ = D.$, el = D.el, cfg = D.cfg;
  var busy = false;
  var STORE_KEY = "dl_codes";

  /* ---------- codes mémorisés sur cet appareil ---------- */
  function savedCodes() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]").filter(function (c) { return /^DL-[A-Z0-9]{6}$/.test(c); }); }
    catch (e) { return []; }
  }
  function rememberCode(code) {
    try {
      var list = savedCodes().filter(function (c) { return c !== code; });
      list.unshift(code);
      localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, 20)));
    } catch (e) { /* stockage indisponible */ }
  }

  /* ---------- onglets ---------- */
  var VIEWS = ["boutique", "suivi"];
  function currentView() {
    var h = (location.hash || "").replace("#", "");
    return VIEWS.indexOf(h) === -1 ? "boutique" : h;
  }
  function showView() {
    var v = currentView();
    document.querySelectorAll("[data-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== v; });
    document.querySelectorAll("nav.tabs a").forEach(function (a) {
      if (a.getAttribute("data-view") === v) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    if (v === "suivi") renderMyOrders();
  }
  window.addEventListener("hashchange", showView);
  document.querySelectorAll("[data-go]").forEach(function (b) {
    b.addEventListener("click", function () {
      var t = $(b.getAttribute("data-go"));
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  /* ---------- prix et coordonnées ---------- */
  function applyConfig() {
    $("shopName").textContent = cfg.shopName;
    $("footName").textContent = cfg.shopName;
    $("unitPrice").textContent = cfg.unitPrice;
    document.querySelectorAll(".cur").forEach(function (n) { n.textContent = cfg.currency; });
    $("phoneFoot").textContent = cfg.phoneDisplay;
    $("mailFoot").textContent = cfg.email;
    if (cfg.oldPrice > cfg.unitPrice) {
      $("oldPrice").textContent = D.money(cfg.oldPrice);
      $("oldPrice").hidden = false;
      $("promoBadge").hidden = false;
    }
    refreshTotal();
  }

  /* ---------- formulaire ---------- */
  function qtyValue() {
    var n = parseInt($("qty").value, 10);
    if (!n || n < 1) n = 1;
    if (n > 999) n = 999;
    return n;
  }
  function refreshTotal() { $("total").textContent = D.money(Math.round(qtyValue() * cfg.unitPrice * 100) / 100); }
  $("minus").addEventListener("click", function () { $("qty").value = Math.max(1, qtyValue() - 1); refreshTotal(); });
  $("plus").addEventListener("click", function () { $("qty").value = Math.min(999, qtyValue() + 1); refreshTotal(); });
  $("qty").addEventListener("input", refreshTotal);

  function showAfter(code, qty, total, name, address) {
    var p = $("afterPanel");
    p.textContent = "";
    p.appendChild(el("h3", { text: "Commande envoyée" }));
    p.appendChild(el("p", { class: "hint", text: "Votre code de suivi :" }));
    p.appendChild(el("div", { class: "code", text: code }));
    p.appendChild(el("p", { text: "Le vendeur doit maintenant confirmer votre commande. Gardez ce code : il sert à suivre l'expédition et la livraison. Vous payez " + D.money(total) + " à la livraison." }));
    var msg = [
      "Bonjour, je viens de passer la commande " + code + " :",
      qty + " × câble oraimo DigiLine OCD-175CC (USB-C vers USB-C, 100 W)",
      "Total : " + D.money(total) + " (paiement à la livraison)",
      "Nom : " + name,
      "Livraison : " + address
    ].join("\n");
    var actions = el("div", { class: "actions" });
    actions.appendChild(el("a", { class: "btn", href: D.waLink(cfg.whatsapp, msg), target: "_blank", rel: "noopener", text: "Prévenir le vendeur sur WhatsApp" }));
    var copyState = el("div", { class: "msg", role: "status" });
    actions.appendChild(el("button", { class: "btn ghost", type: "button", text: "Copier le code", onclick: function () {
      try {
        navigator.clipboard.writeText(code).then(function () { copyState.textContent = "Code copié."; },
          function () { copyState.textContent = "Notez le code : " + code; });
      } catch (e) { copyState.textContent = "Notez le code : " + code; }
    } }));
    p.appendChild(actions);
    p.appendChild(copyState);
    p.appendChild(el("a", { href: "#suivi", text: "Suivre cette commande" }));
  }

  $("orderForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (busy) return;
    var name = $("name").value.trim(), phone = $("phone").value.trim(), address = $("addr").value.trim();
    if (!name || !phone || !address) { D.setMsg($("formMsg"), "Renseignez votre nom, votre téléphone et votre adresse.", "err"); return; }
    busy = true;
    $("submitBtn").disabled = true;
    D.setMsg($("formMsg"), "Envoi en cours…");
    try {
      var qty = qtyValue();
      var r = await D.api("POST", "/api/orders", { name: name, phone: phone, address: address, qty: qty, website: $("website").value });
      rememberCode(r.code);
      D.setMsg($("formMsg"), "Commande envoyée. Votre code : " + r.code, "ok");
      showAfter(r.code, qty, r.total, name, address);
      $("orderForm").reset();
      $("qty").value = 1;
      refreshTotal();
      $("afterPanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
      D.setMsg($("formMsg"), err.status ? err.message : "Connexion impossible. Vérifiez votre réseau et réessayez.", "err");
    }
    busy = false;
    $("submitBtn").disabled = false;
  });

  /* ---------- suivi ---------- */
  function trackCard(t) {
    return el("article", { class: "ocard" },
      el("div", { class: "ohead" },
        el("span", { class: "ocode", text: t.code }),
        el("span", { class: "chip s-" + t.status, text: D.STATUS[t.status] || t.status })),
      D.tracker(t.status),
      el("div", { class: "odetails" },
        D.detail("Quantité", t.qty + " câble" + (t.qty > 1 ? "s" : "")),
        D.detail("Total", D.money(t.total)),
        D.detail("Paiement", D.payText(t)),
        D.detail("Commandée le", D.fmtDate(t.createdAt)),
        D.detail("Dernière mise à jour", D.fmtDate(t.updatedAt))));
  }

  $("lookupForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var code = $("lookupCode").value.trim().toUpperCase();
    var res = $("lookupResult");
    res.textContent = "";
    if (!/^DL-[A-Z0-9]{6}$/.test(code)) { D.setMsg($("lookupMsg"), "Le code ressemble à DL-7K2P9Q.", "err"); return; }
    D.setMsg($("lookupMsg"), "Recherche…");
    try {
      var t = await D.api("GET", "/api/track/" + code);
      D.setMsg($("lookupMsg"), "");
      res.appendChild(trackCard(t));
      rememberCode(code);
    } catch (err) {
      D.setMsg($("lookupMsg"), err.status === 404 ? "Aucune commande avec ce code. Vérifiez qu'il est bien recopié." : err.message, "err");
    }
  });

  async function renderMyOrders() {
    var box = $("myOrders");
    var codes = savedCodes();
    box.textContent = "";
    if (!codes.length) {
      box.appendChild(el("div", { class: "empty", text: "Aucune commande sur cet appareil. Entrez un code ci-dessus ou passez commande dans l'onglet Boutique." }));
      return;
    }
    for (var i = 0; i < codes.length; i++) {
      try { box.appendChild(trackCard(await D.api("GET", "/api/track/" + codes[i]))); }
      catch (err) { if (err.status === 429) break; }
    }
  }

  /* ---------- démarrage ---------- */
  D.loadConfig().then(applyConfig);
  showView();
})();
