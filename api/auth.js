// POST /api/auth {code} — valida el código de acceso y devuelve el rol.
import { roleOf, readBody, send, wrap, dbConfigured } from "./_lib.js";

export default wrap(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido." });
  if (process.env.VERCEL && !process.env.ACCESS_CODE && !process.env.ADMIN_CODE)
    return send(res, 500, { error: "Falta definir ACCESS_CODE y ADMIN_CODE en Vercel (Settings → Environment Variables) y redesplegar." });
  if (!dbConfigured())
    return send(res, 500, { error: "Falta conectar la base de datos Upstash Redis al proyecto en Vercel (Storage) y redesplegar." });
  const { code } = readBody(req);
  await new Promise((r) => setTimeout(r, 250)); // frena intentos repetidos
  const role = roleOf(code);
  if (!role) return send(res, 401, { error: "Código de acceso incorrecto." });
  send(res, 200, { role, db: dbConfigured() });
});
