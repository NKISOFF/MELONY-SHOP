/* Administration : connexion, commandes, changements d'étape, ajout manuel. */
(function () {
  var D = window.DL, $ = D.$, el = D.el, cfg = D.cfg;
  var orders = [];
  var busy = false;
  var loaded = false;
  var knownPending = null;
  var pollTimer = null;
  var baseTitle = document.title;

  function show(view) {
    $("loginView").hidden = view !== "login";
    $("appView").hidden = view !== "app";
    $("adminNav").hidden = view !== "app";
  }

  /* ---------- connexion ---------- */
  $("loginForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    D.setMsg($("loginMsg"), "Connexion…");
    try {
      await D.api("POST", "/api/admin/login", { password: $("password").value });
      $("password").value = "";
      D.setMsg($("loginMsg"), "");
      await start();
    } catch (err) {
      D.setMsg($("loginMsg"), err.message, "err");
    }
  });
  $("logoutBtn").addEventListener("click", async function () {
    try { await D.api("POST", "/api/admin/logout"); } catch (e) { /* déjà déconnecté */ }
    stopPolling();
    orders = [];
    show("login");
  });

  /* ---------- affichage ---------- */
  function render() {
    var filter = $("filter").value;
    var counts = { en_attente: 0, confirmee: 0, expediee: 0, livree: 0, refusee: 0 };
    var cashed = 0;
    orders.forEach(function (o) {
      if (counts[o.status] != null) counts[o.status]++;
      if (o.status === "livree" && o.paid) cashed += o.total;
    });
    var stats = $("stats");
    stats.textContent = "";
    [["À confirmer", String(counts.en_attente)], ["À expédier", String(counts.confirmee)], ["Expédiées", String(counts.expediee)],
      ["Livrées", String(counts.livree)], ["Encaissé", D.money(Math.round(cashed * 100) / 100)]].forEach(function (s) {
      stats.appendChild(el("div", { class: "stat" }, el("b", { text: s[1] }), el("span", { text: s[0] })));
    });
    document.title = (counts.en_attente ? "(" + counts.en_attente + ") " : "") + baseTitle;

    var box = $("adminList");
    box.textContent = "";
    var list = orders.filter(function (o) { return filter === "all" || o.status === filter; });
    if (!list.length) {
      box.appendChild(el("div", { class: "empty", text: orders.length ? "Aucune commande dans cette catégorie." : "Aucune commande pour l'instant. Elles apparaîtront ici dès qu'un client commande." }));
      return;
    }
    list.forEach(function (o) { box.appendChild(card(o)); });
  }

  function card(o) {
    var actions = el("div", { class: "actions" });
    function act(label, status, ghost) {
      actions.appendChild(el("button", { class: "btn small" + (ghost ? " ghost" : ""), type: "button", text: label, onclick: function () { setStatus(o, status); } }));
    }
    if (o.status === "en_attente") { act("Confirmer la commande", "confirmee"); act("Refuser", "refusee", true); }
    else if (o.status === "confirmee") { act("Marquer expédiée", "expediee"); act("Annuler", "refusee", true); }
    else if (o.status === "expediee") act("Livrée, paiement reçu", "livree");
    var notes = {
      en_attente: "bien reçue, je la confirme très vite",
      confirmee: "confirmée, je prépare l'expédition",
      expediee: "expédiée. Préparez " + D.money(o.total) + " pour la livraison",
      livree: "livrée. Merci pour votre achat",
      refusee: "malheureusement annulée"
    };
    var note = "Bonjour " + o.name + ", votre commande " + o.code + " est " + (notes[o.status] || "en cours") + ".";
    actions.appendChild(el("a", { class: "btn small ghost", href: D.waLink(o.phone, note), target: "_blank", rel: "noopener", text: "Écrire au client" }));
    return el("article", { class: "ocard" },
      el("div", { class: "ohead" },
        el("span", { class: "ocode", text: o.code }),
        el("span", { class: "chip s-" + o.status, text: D.STATUS[o.status] || o.status })),
      el("div", { class: "odetails" },
        D.detail("Client", o.name),
        D.detail("Téléphone", "+" + o.phone),
        D.detail("Quantité", String(o.qty)),
        D.detail("Total", D.money(o.total)),
        D.detail("Paiement", D.payText(o)),
        D.detail("Adresse", o.address),
        D.detail("Reçue le", D.fmtDate(o.createdAt)),
        D.detail("Origine", o.source === "manuel" ? "Saisie manuelle" : "Site")),
      D.tracker(o.status),
      actions);
  }

  /* ---------- données ---------- */
  async function load(initial) {
    try {
      var data = await D.api("GET", "/api/admin/orders");
      loaded = true;
      orders = data.orders;
      var pending = orders.filter(function (o) { return o.status === "en_attente"; }).length;
      if (!initial && knownPending !== null && pending > knownPending) {
        var b = $("newBanner");
        b.hidden = false;
        b.textContent = (pending - knownPending) + " nouvelle" + (pending - knownPending > 1 ? "s commandes" : " commande") + " à confirmer.";
      }
      knownPending = pending;
      render();
    } catch (err) {
      if (err.status === 401) { stopPolling(); show("login"); return; }
      D.setMsg($("adminMsg"), "Impossible de charger les commandes. Nouvelle tentative bientôt.", "err");
    }
  }
  function startPolling() {
    stopPolling();
    pollTimer = setInterval(function () { if (!document.hidden && !busy) load(false); }, 20000);
  }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  async function setStatus(o, status) {
    if (busy) return;
    busy = true;
    D.setMsg($("adminMsg"), "Mise à jour de " + o.code + "…");
    try {
      await D.api("PATCH", "/api/admin/orders/" + o.code + "/status", { status: status });
      D.setMsg($("adminMsg"), o.code + " : " + D.STATUS[status].toLowerCase() + ".", "ok");
      $("newBanner").hidden = true;
      await load(true);
    } catch (err) {
      if (err.status === 401) { show("login"); busy = false; return; }
      D.setMsg($("adminMsg"), err.message, "err");
    }
    busy = false;
  }
  $("filter").addEventListener("change", render);

  $("manualForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    D.setMsg($("manualMsg"), "Enregistrement…");
    try {
      var r = await D.api("POST", "/api/admin/orders", {
        name: $("mName").value, phone: $("mPhone").value, qty: Number($("mQty").value), address: $("mAddr").value
      });
      D.setMsg($("manualMsg"), "Commande enregistrée. Code de suivi : " + r.order.code, "ok");
      $("manualForm").reset();
      $("mQty").value = 1;
      await load(true);
    } catch (err) {
      D.setMsg($("manualMsg"), err.message, "err");
    }
    busy = false;
  });

  async function start() {
    loaded = false;
    await load(true);
    if (!loaded) return; // pas de session valide : l'écran de connexion reste affiché
    show("app");
    startPolling();
  }

  /* ---------- démarrage ---------- */
  D.loadConfig().then(function () { $("shopName").textContent = cfg.shopName; });
  D.api("GET", "/api/admin/session").then(function () { start(); }, function () { show("login"); });
})();
