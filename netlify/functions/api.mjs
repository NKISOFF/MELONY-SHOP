// API de la boutique DigiLine pour Netlify Functions.
// Les commandes sont gardées dans Netlify Blobs (un petit espace de stockage fourni par Netlify).
//   orders/<code>              : une commande complète
//   idx/<date>_<code>          : index pour lister les commandes par date
//   limit/<nom>/<ip>/<période> : compteurs qui limitent les tentatives abusives
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

/* ---------- réglages (variables d'environnement Netlify) ---------- */
function num(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function displayPhone(digits) {
  if (digits.startsWith("243") && digits.length >= 12) {
    return "+243 " + digits.slice(3).replace(/(\d{3})(?=\d)/g, "$1 ").trim();
  }
  return "+" + digits;
}
function settings() {
  const e = process.env;
  const whatsapp = (e.WHATSAPP_NUMBER || "243827445153").replace(/\D/g, "");
  return {
    shopName: e.SHOP_NAME || "DigiLine Shop",
    whatsapp,
    phoneDisplay: e.WHATSAPP_DISPLAY || displayPhone(whatsapp),
    email: e.CONTACT_EMAIL || "nkisdan56@gmail.com",
    countryCode: e.COUNTRY_CODE || "243",
    unitPrice: num(e.UNIT_PRICE, 10),
    oldPrice: num(e.OLD_PRICE, 12),
    currency: e.CURRENCY || "$",
    adminPassword: e.ADMIN_PASSWORD || "",
    sessionSecret: e.SESSION_SECRET || "",
    sessionHours: num(e.SESSION_HOURS, 12)
  };
}

function store() {
  return getStore({ name: "boutique", consistency: "strong" });
}

/* ---------- réponses ---------- */
function json(status, body, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, headers || {})
  });
}
const fail = (status, message, headers) => json(status, { error: message }, headers);

/* ---------- limites de tentatives ---------- */
async function tooMany(st, name, ip, max, windowMs) {
  const win = Math.floor(Date.now() / windowMs);
  const who = crypto.createHash("sha256").update(String(ip)).digest("hex").slice(0, 24);
  const key = "limit/" + name + "/" + who + "/" + win;
  const cur = await st.get(key, { type: "json" });
  const count = (cur && cur.count ? cur.count : 0) + 1;
  if (count > max) return Math.max(1, Math.ceil(((win + 1) * windowMs - Date.now()) / 1000));
  await st.setJSON(key, { count });
  return 0;
}
function limited(seconds) {
  return fail(429, "Trop de tentatives. Réessayez dans quelques minutes.", { "Retry-After": String(seconds) });
}

/* ---------- session administrateur ---------- */
function sign(secret, value) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}
function makeToken(cfg) {
  const exp = String(Date.now() + cfg.sessionHours * 3600 * 1000);
  return exp + "." + sign(cfg.sessionSecret, exp);
}
function validToken(cfg, token) {
  if (typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const expected = Buffer.from(sign(cfg.sessionSecret, parts[0]));
  const given = Buffer.from(parts[1]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return false;
  return Number(parts[0]) > Date.now();
}
function readCookies(req) {
  const out = {};
  String(req.headers.get("cookie") || "").split(";").forEach(function (part) {
    const i = part.indexOf("=");
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) { /* cookie illisible */ }
    }
  });
  return out;
}
function samePassword(cfg, given) {
  const a = crypto.createHash("sha256").update(String(given)).digest();
  const b = crypto.createHash("sha256").update(cfg.adminPassword).digest();
  return crypto.timingSafeEqual(a, b);
}
function adminConfigured(cfg) {
  return cfg.adminPassword.length >= 10 && cfg.sessionSecret.length >= 16;
}
function isAdmin(cfg, req) {
  return adminConfigured(cfg) && validToken(cfg, readCookies(req).admin);
}
function originOk(req) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  let host = "";
  try { host = new URL(origin).host; } catch (e) { return false; }
  const own = new URL(req.url).host;
  const header = req.headers.get("host");
  return host === own || host === header;
}

/* ---------- commandes ---------- */
const STATUSES = ["en_attente", "confirmee", "expediee", "livree", "refusee"];
const NEXT = {
  en_attente: ["confirmee", "refusee"],
  confirmee: ["expediee", "refusee"],
  expediee: ["livree"],
  livree: [],
  refusee: []
};
const CODE_RE = /^DL-[A-Z0-9]{6}$/;

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  let code = "DL-";
  for (let i = 0; i < 6; i++) code += chars[bytes[i] % chars.length];
  return code;
}
function normPhone(cfg, raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = cfg.countryCode + d.slice(1);
  return d;
}
function clean(text, min, max) {
  const s = String(text == null ? "" : text).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return s.length >= min && s.length <= max ? s : null;
}
function readOrderInput(cfg, body) {
  const name = clean(body.name, 2, 80);
  const address = clean(body.address, 5, 300);
  const phone = normPhone(cfg, body.phone);
  const qty = Number(body.qty);
  if (!name) return { error: "Indiquez votre nom (2 à 80 caractères)." };
  if (phone.length < 9 || phone.length > 15) return { error: "Le numéro de téléphone semble incorrect." };
  if (!address) return { error: "Indiquez votre adresse de livraison (5 à 300 caractères)." };
  if (!Number.isInteger(qty) || qty < 1 || qty > 999) return { error: "La quantité doit être entre 1 et 999." };
  return { name, phone, address, qty };
}

async function insertOrder(cfg, st, input, status, source) {
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = makeCode();
    const order = {
      code, name: input.name, phone: input.phone, address: input.address, qty: input.qty,
      unitPrice: cfg.unitPrice, total: Math.round(input.qty * cfg.unitPrice * 100) / 100, currency: cfg.currency,
      status, paid: false, paidAt: null, source, createdAt: now, updatedAt: now,
      history: [{ status, at: now }]
    };
    // « seulement si nouveau » : deux commandes ne peuvent jamais avoir le même code.
    const r = await st.setJSON("orders/" + code, order, { onlyIfNew: true });
    if (r && r.modified) {
      await st.set("idx/" + now + "_" + code, code);
      return order;
    }
  }
  throw new Error("Impossible de générer un code unique");
}

async function listOrders(st, limit) {
  const { blobs } = await st.list({ prefix: "idx/" });
  const keys = blobs.map(function (b) { return b.key; }).sort().reverse().slice(0, limit);
  const codes = keys.map(function (k) { return k.slice(k.lastIndexOf("_") + 1); });
  const orders = [];
  for (let i = 0; i < codes.length; i += 20) {
    const chunk = await Promise.all(codes.slice(i, i + 20).map(function (c) { return st.get("orders/" + c, { type: "json" }); }));
    chunk.forEach(function (o) { if (o) orders.push(o); });
  }
  return orders;
}

async function readBody(req) {
  const length = Number(req.headers.get("content-length") || 0);
  if (length > 10000) return null;
  try {
    const text = await req.text();
    if (text.length > 10000) return null;
    const body = text ? JSON.parse(text) : {};
    return body && typeof body === "object" ? body : null;
  } catch (e) {
    return null;
  }
}

function publicTrack(o) {
  // Aucune donnée personnelle ici : seulement l'avancement.
  return {
    code: o.code, status: o.status, qty: o.qty, total: o.total, currency: o.currency,
    paid: !!o.paid, paidAt: o.paidAt, createdAt: o.createdAt, updatedAt: o.updatedAt, history: o.history || []
  };
}

/* ---------- routes ---------- */
export default async function handler(req, context) {
  const cfg = settings();
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = req.method;
  const ip = (context && context.ip) || req.headers.get("x-nf-client-connection-ip") || "inconnue";
  const secure = url.protocol === "https:";

  try {
    if (path === "/api/config" && method === "GET") {
      return json(200, {
        shopName: cfg.shopName, whatsapp: cfg.whatsapp, phoneDisplay: cfg.phoneDisplay,
        email: cfg.email, unitPrice: cfg.unitPrice, oldPrice: cfg.oldPrice, currency: cfg.currency
      });
    }

    const st = store();

    /* --- clients --- */
    if (path === "/api/orders" && method === "POST") {
      const wait = await tooMany(st, "order", ip, 10, 60 * 60 * 1000);
      if (wait) return limited(wait);
      const body = await readBody(req);
      if (!body) return fail(400, "Requête invalide.");
      if (body.website) return json(200, { code: "DL-000000", status: "en_attente" }); // piège à robots
      const input = readOrderInput(cfg, body);
      if (input.error) return fail(400, input.error);
      const order = await insertOrder(cfg, st, input, "en_attente", "site");
      return json(201, { code: order.code, status: order.status, total: order.total, currency: order.currency });
    }

    const track = path.match(/^\/api\/track\/([^/]+)$/);
    if (track && method === "GET") {
      const wait = await tooMany(st, "track", ip, 60, 10 * 60 * 1000);
      if (wait) return limited(wait);
      const code = decodeURIComponent(track[1]).toUpperCase();
      if (!CODE_RE.test(code)) return fail(400, "Code invalide.");
      const order = await st.get("orders/" + code, { type: "json" });
      if (!order) return fail(404, "Aucune commande avec ce code.");
      return json(200, publicTrack(order));
    }

    /* --- administration --- */
    if (path.indexOf("/api/admin/") === 0) {
      if (!adminConfigured(cfg)) {
        return fail(503, "L'administration n'est pas configurée : définissez ADMIN_PASSWORD et SESSION_SECRET dans Netlify.");
      }

      if (path === "/api/admin/login" && method === "POST") {
        if (!originOk(req)) return fail(403, "Origine refusée.");
        const wait = await tooMany(st, "login", ip, 8, 15 * 60 * 1000);
        if (wait) return limited(wait);
        const body = await readBody(req);
        if (!body || typeof body.password !== "string" || !samePassword(cfg, body.password)) {
          return fail(401, "Mot de passe incorrect.");
        }
        const flags = ["admin=" + encodeURIComponent(makeToken(cfg)), "HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=" + cfg.sessionHours * 3600];
        if (secure) flags.push("Secure");
        return json(200, { ok: true }, { "Set-Cookie": flags.join("; ") });
      }

      if (path === "/api/admin/logout" && method === "POST") {
        if (!originOk(req)) return fail(403, "Origine refusée.");
        return json(200, { ok: true }, { "Set-Cookie": "admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
      }

      if (!isAdmin(cfg, req)) return fail(401, "Connexion requise.");

      if (path === "/api/admin/session" && method === "GET") return json(200, { ok: true });

      if (path === "/api/admin/orders" && method === "GET") {
        return json(200, { orders: await listOrders(st, 300) });
      }

      if (path === "/api/admin/orders" && method === "POST") {
        if (!originOk(req)) return fail(403, "Origine refusée.");
        const body = await readBody(req);
        if (!body) return fail(400, "Requête invalide.");
        const input = readOrderInput(cfg, body);
        if (input.error) return fail(400, input.error);
        const status = body.status === "en_attente" ? "en_attente" : "confirmee";
        return json(201, { order: await insertOrder(cfg, st, input, status, "manuel") });
      }

      const change = path.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
      if (change && method === "PATCH") {
        if (!originOk(req)) return fail(403, "Origine refusée.");
        const code = decodeURIComponent(change[1]).toUpperCase();
        const body = await readBody(req);
        const status = body && body.status;
        if (!CODE_RE.test(code)) return fail(404, "Commande introuvable.");
        const found = await st.getWithMetadata("orders/" + code, { type: "json" });
        if (!found || !found.data) return fail(404, "Commande introuvable.");
        const order = found.data;
        if (STATUSES.indexOf(status) === -1 || NEXT[order.status].indexOf(status) === -1) {
          return fail(400, "Ce changement d'étape n'est pas possible.");
        }
        const now = new Date().toISOString();
        order.status = status;
        order.updatedAt = now;
        order.history = (order.history || []).concat([{ status, at: now }]);
        if (status === "livree") { order.paid = true; order.paidAt = now; }
        // « seulement si inchangée » : refuse l'écriture si la commande a été modifiée entre-temps.
        const saved = await st.setJSON("orders/" + code, order, { onlyIfMatch: found.etag });
        if (!saved || !saved.modified) return fail(409, "La commande vient d'être modifiée. Rechargez la page.");
        return json(200, { order });
      }

      if (path === "/api/admin/export.csv" && method === "GET") {
        const cell = function (v) {
          let s = String(v == null ? "" : v);
          if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // évite l'exécution de formules dans Excel
          return '"' + s.replace(/"/g, '""') + '"';
        };
        const head = ["Code", "Date", "Client", "Téléphone", "Adresse", "Quantité", "Total", "Devise", "Étape", "Payé", "Source"];
        const lines = [head.map(cell).join(",")];
        (await listOrders(st, 3000)).forEach(function (o) {
          lines.push([o.code, o.createdAt, o.name, "+" + o.phone, o.address, o.qty, o.total, o.currency, o.status, o.paid ? "oui" : "non", o.source].map(cell).join(","));
        });
        return new Response("﻿" + lines.join("\r\n"), {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="commandes.csv"',
            "Cache-Control": "no-store"
          }
        });
      }
    }

    return fail(404, "Introuvable.");
  } catch (err) {
    console.error(err);
    return fail(500, "Erreur du serveur. Réessayez.");
  }
}

export const config = {
  path: "/api/*"
};
