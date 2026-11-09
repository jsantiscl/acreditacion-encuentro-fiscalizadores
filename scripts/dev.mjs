// Servidor local para probar sin Vercel: `npm run dev` y abrir http://localhost:3000
// Sin variables de Upstash usa una base en memoria; sin ACCESS_CODE acepta cualquier código como administrador.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const routes = {
  "/api/state": (await import("../api/state.js")).default,
  "/api/op": (await import("../api/op.js")).default,
  "/api/auth": (await import("../api/auth.js")).default,
};

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const h = routes[u.pathname];
  if (h) {
    let body = "";
    for await (const c of req) body += c;
    req.query = Object.fromEntries(u.searchParams);
    try { req.body = body ? JSON.parse(body) : {}; } catch { req.body = body; }
    res.status = (s) => { res.statusCode = s; return res; };
    res.json = (o) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
    return h(req, res);
  }
  try {
    const isVendor = u.pathname.startsWith("/vendor/") && !u.pathname.includes("..");
    const file = isVendor ? path.join(root, u.pathname) : path.join(root, "index.html");
    res.setHeader("Content-Type", isVendor ? "application/javascript" : "text/html; charset=utf-8");
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end("not found"); }
}).listen(process.env.PORT || 3000, () => console.log("http://localhost:" + (process.env.PORT || 3000)));
