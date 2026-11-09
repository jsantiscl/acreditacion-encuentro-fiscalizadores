// Utilidades compartidas: conexión a Upstash Redis (REST) y control de acceso.
import { timingSafeEqual, createHash, randomInt } from "node:crypto";

const URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PFX = (process.env.EVENT_KEY || "acr").replace(/[^a-zA-Z0-9_-]/g, "");

export const K = {
  ver: `${PFX}:ver`,
  people: `${PFX}:people`,
  asis: (d) => `${PFX}:asis:${d}`,
  users: `${PFX}:users`,
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
    case "HEXISTS": return mem.get(k)?.has(a[0]) ? 1 : 0;
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
// Hay dos tipos de código:
//  - ADMIN_CODE (variable de entorno en Vercel): administrador principal, nombre en ADMIN_NAME.
//  - Códigos personales creados desde la pestaña "Equipo" y guardados en Redis (rol acreditador o administrador).
// ACCESS_CODE (opcional, heredado) funciona como un código general de puerta sin identificar a la persona.
function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
export const normCode = (c) => String(c || "").trim().toUpperCase().replace(/\s+/g, "");
export const codeHash = (c) => createHash("sha256").update(PFX + ":" + normCode(c)).digest("hex");
const cache = globalThis.__acrWho || (globalThis.__acrWho = new Map()); // hash -> {who, exp}
export function forgetCode(hash) { cache.delete(hash); }

// Devuelve {role: "admin"|"staff", name, uid} o null.
export async function whoAmI(code) {
  code = String(code || "").trim();
  if (!code) return null;
  const ADMIN = process.env.ADMIN_CODE, ACCESS = process.env.ACCESS_CODE;
  if (!ADMIN && !ACCESS && !process.env.VERCEL && !URL) return { role: "admin", name: "Admin local", uid: "admin" };
  if (ADMIN && same(code, ADMIN)) return { role: "admin", name: process.env.ADMIN_NAME || "Administración", uid: "admin" };
  if (ACCESS && same(code, ACCESS)) return { role: ADMIN ? "staff" : "admin", name: process.env.ACCESS_NAME || "Código general", uid: "general" };
  const h = codeHash(code);
  const c = cache.get(h);
  if (c && c.exp > Date.now()) return c.who;
  const raw = await one(["HGET", K.users, h]);
  let who = null;
  if (raw) { try { const u = JSON.parse(raw); who = { role: u.role === "admin" ? "admin" : "staff", name: u.name, uid: h.slice(0, 12) }; } catch {} }
  cache.set(h, { who, exp: Date.now() + 20000 });
  return who;
}
export function reservedCode(code) {
  const n = normCode(code);
  return [process.env.ADMIN_CODE, process.env.ACCESS_CODE].some((c) => c && normCode(c) === n);
}
// Código fácil de dictar: 3 letras + 3 números, sin caracteres confundibles.
export function newCode() {
  const L = "ABCDEFGHJKMNPQRSTUVWXYZ", D = "23456789";
  let s = "";
  for (let i = 0; i < 3; i++) s += L[randomInt(L.length)];
  s += "-";
  for (let i = 0; i < 3; i++) s += D[randomInt(D.length)];
  return s;
}
export function httpErr(status, msg) { const e = new Error(msg); e.status = status; return e; }
export async function requireRole(req, need) {
  const who = await whoAmI(req.headers["x-code"]);
  if (!who) throw httpErr(401, "Código de acceso incorrecto o desactivado.");
  if (need === "admin" && who.role !== "admin") throw httpErr(403, "Esta acción solo la puede hacer un administrador.");
  return who;
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
    creadoPor: str(p.creadoPor, 60),
    creadoPorU: str(p.creadoPorU, 20),
  };
  if (!out.nombre) throw httpErr(400, "Falta el nombre.");
  return out;
}
// La hora viene del puesto (puede haberse registrado sin conexión), pero quién acreditó lo fija el servidor.
export function cleanRec(r, who) {
  const now = Date.now();
  let t = Number.isFinite(r?.t) ? r.t : now;
  if (t > now + 5 * 60e3 || t < now - 7 * 864e5) t = now;
  return { t, p: who.name, u: who.uid };
}
export const cleanName = (v) => str(v, 60);
