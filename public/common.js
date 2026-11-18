/* Fonctions communes à la boutique et à l'administration. */
window.DL = (function () {
  var STATUS = {
    en_attente: "En attente de confirmation",
    confirmee: "Confirmée",
    expediee: "Expédiée",
    livree: "Livrée",
    refusee: "Refusée"
  };
  var STEPS = ["en_attente", "confirmee", "expediee", "livree"];
  var STEP_LABELS = ["Commande reçue", "Confirmée", "Expédiée", "Livrée et payée"];
  var cfg = { currency: "$", unitPrice: 10, oldPrice: 0, whatsapp: "", phoneDisplay: "", email: "", shopName: "" };

  function el(tag, props) {
    var e = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      if (k === "class") e.className = props[k];
      else if (k === "text") e.textContent = props[k];
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), props[k]);
      else e.setAttribute(k, props[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null) continue;
      e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return e;
  }
  function $(id) { return document.getElementById(id); }
  function money(n) { return n + " " + cfg.currency; }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }); }
    catch (e) { return iso || ""; }
  }
  function waLink(phoneDigits, text) {
    return "https://wa.me/" + phoneDigits + "?text=" + encodeURIComponent(text);
  }
  function setMsg(node, text, kind) {
    node.textContent = text || "";
    node.className = node.className.replace(/\b(err|ok)\b/g, "").trim() + (kind ? " " + kind : "");
  }
  function tracker(status) {
    if (status === "refusee") return el("p", { class: "msg err", text: "Cette commande n'a pas pu être acceptée. Contactez le vendeur pour en savoir plus." });
    var idx = STEPS.indexOf(status);
    var ol = el("ol", { class: "steps" });
    STEPS.forEach(function (s, i) {
      var cls = i <= idx ? "done" : "";
      if (i === idx && i === STEPS.length - 1) cls += " last";
      ol.appendChild(el("li", { class: cls, text: STEP_LABELS[i] }));
    });
    return ol;
  }
  function detail(label, value) {
    return el("div", {}, el("span", { text: label }), document.createTextNode(value));
  }
  function payText(o) {
    return o.paid ? "Payé" + (o.paidAt ? " le " + fmtDate(o.paidAt) : "") : "À payer à la livraison";
  }
  async function api(method, url, body) {
    var opts = { method: method, headers: {}, credentials: "same-origin" };
    if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    var res = await fetch(url, opts);
    var data = null;
    try { data = await res.json(); } catch (e) { /* pas de JSON */ }
    if (!res.ok) {
      var err = new Error((data && data.error) || "Erreur " + res.status);
      err.status = res.status;
      throw err;
    }
    return data;
  }
  async function loadConfig() {
    try { Object.assign(cfg, await api("GET", "/api/config")); } catch (e) { /* valeurs par défaut */ }
    return cfg;
  }
  return { STATUS: STATUS, cfg: cfg, el: el, $: $, money: money, fmtDate: fmtDate, waLink: waLink, setMsg: setMsg,
    tracker: tracker, detail: detail, payText: payText, api: api, loadConfig: loadConfig };
})();
