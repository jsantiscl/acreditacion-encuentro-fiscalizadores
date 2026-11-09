// POST /api/auth {code} — valida el código de acceso y devuelve el rol.
import { whoAmI, readBody, send, wrap, dbConfigured } from "./_lib.js";

export default wrap(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido." });
  if (process.env.VERCEL && !process.env.ADMIN_CODE)
    return send(res, 500, { error: "Falta definir ADMIN_CODE en Vercel (Settings → Environment Variables) y redesplegar." });
  if (!dbConfigured())
    return send(res, 500, { error: "Falta conectar la base de datos Upstash Redis al proyecto en Vercel (Storage) y redesplegar." });
  const { code } = readBody(req);
  await new Promise((r) => setTimeout(r, 250)); // frena intentos repetidos
  const who = await whoAmI(code);
  if (!who) return send(res, 401, { error: "Código de acceso incorrecto o desactivado." });
  send(res, 200, { role: who.role, name: who.name, uid: who.uid });
});
