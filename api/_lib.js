// Utilidades compartidas: conexión a Upstash Redis (REST) y control de acceso.
import { timingSafeEqual } from "node:crypto";

const URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PFX = (process.env.EVENT_KEY || "acr").replace(/[^a-zA-Z0-9_-]/g, "");

export const K = {
  ver: `${PFX}:ver`,
  people: `${PFX}:people`,
  asis: (d) => `${PFX}:asis:${d}`,
};
export const DAYS = ["d1", "d2", "d3"];

/* ---------- Redis ---------- */
// Sin variables de Upstash y fuera de Vercel se usa una base en memoria (solo para desarrollo local).
const mem = globalThis.__acrMem || (globalThis.__acrMem = new Map());
function memCmd([c, k, ...a]) {
  c = c.toUpperCase();
  const h = () => { if (!mem.has(k)) mem.set(k, new Map()); return mem.get(k); };
  switch (c) {
    case "GET": return mem.has(k) ? String(mem.get(k)) : null;
    case "INCR": { const v = (+mem.get(k) || 0) + 1; mem.set(k, v); return v; }
    case "DEL": { let n = 0; for (const x of [k, ...a]) if (mem.delete(x)) n++; return n; }
    case "HGET": return mem.get(k)?.get(a[0]) ?? null;
    case "HSET": { const m = h(); let n = 0; for (let i = 0; i < a.length; i += 2) { if (!m.has(a[i])) n++; m.set(a[i], a[i + 1]); } return n; }
    case "HSETNX": { const m = h(); if (m.has(a[0])) return 0; m.set(a[0], a[1]); return 1; }
    case "HDEL": { const m = mem.get(k); if (!m) return 0; let n = 0; for (const f of a) if (m.delete(f)) n++; return n; }
    case "HGETALL": { const m = mem.get(k); return m ? [...m].flat() : []; }
    default: throw new Error("cmd " + c);
  }
}
export function dbConfigured() { return !!(URL && TOKEN) || !process.env.VERCEL; }

export async function pipe(cmds) {
  if (!URL || !TOKEN) {
    if (process.env.VERCEL) throw httpErr(500, "Falta conectar la base de datos (Upstash Redis) en Vercel.");
    return cmds.map(memCmd);
  }
  const r = await fetch(URL.replace(/\/$/, "") + "/pipeline", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw httpErr(502, "La base de datos no respondió (" + r.status + ").");
  const j = await r.json();
  return j.map((x) => { if (x.error) throw httpErr(502, "Error de base de datos: " + x.error); return x.result; });
}
export const one = async (cmd) => (await pipe([cmd]))[0];
export function hashToObj(arr) {
  const o = {};
  if (Array.isArray(arr)) for (let i = 0; i < arr.length; i += 2) { try { o[arr[i]] = JSON.parse(arr[i + 1]); } catch { /* ignora */ } }
  else if (arr && typeof arr === "object") for (const [f, v] of Object.entries(arr)) { try { o[f] = JSON.parse(v); } catch {} }
  return o;
}

/* ---------- Acceso ---------- */
function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
// Devuelve "admin", "staff" o null.
export function roleOf(code) {
  const ACCESS = process.env.ACCESS_CODE, ADMIN = process.env.ADMIN_CODE;
  if (!code) return null;
  if (!ACCESS && !ADMIN && !process.env.VERCEL) return "admin"; // desarrollo local sin códigos
  if (ADMIN && same(code, ADMIN)) return "admin";
  if (ACCESS && same(code, ACCESS)) return ADMIN ? "staff" : "admin";
  return null;
}
export function httpErr(status, msg) { const e = new Error(msg); e.status = status; return e; }
export function requireRole(req, need) {
  const role = roleOf(req.headers["x-code"]);
  if (!role) throw httpErr(401, "Código de acceso incorrecto.");
  if (need === "admin" && role !== "admin") throw httpErr(403, "Esta acción requiere el código de administración.");
  return role;
}
export function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(body);
}
export function wrap(fn) {
  return async (req, res) => {
    try { await fn(req, res); }
    catch (e) { send(res, e.status || 500, { error: e.status ? e.message : "Error interno del servidor." }); if (!e.status) console.error(e); }
  };
}
export function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { throw httpErr(400, "Solicitud inválida."); }
}

/* ---------- Validación de personas ---------- */
const str = (v, n = 200) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
export const validId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(id);
export const validDay = (d) => DAYS.includes(d);
export function cleanPerson(p) {
  if (!p || typeof p !== "object") throw httpErr(400, "Datos de persona inválidos.");
  const out = {
    nombre: str(p.nombre), rut: str(p.rut, 20), inst: str(p.inst), cargo: str(p.cargo), correo: str(p.correo),
    tel: str(p.tel, 40), tipo: str(p.tipo, 40) || "Asistente",
    dias: Array.isArray(p.dias) ? [...new Set(p.dias.map(Number).filter((n) => n >= 1 && n <= 3))].sort() : [],
    origen: p.origen === "puerta" ? "puerta" : "lista",
    creado: Number.isFinite(p.creado) ? p.creado : Date.now(),
    creadoPor: str(p.creadoPor, 40),
  };
  if (!out.nombre) throw httpErr(400, "Falta el nombre.");
  return out;
}
export function cleanRec(r) {
  return { t: Number.isFinite(r?.t) ? r.t : Date.now(), p: str(r?.p, 40) };
}
