// GET /api/users — lista del equipo con sus códigos personales (solo administradores).
import { K, one, hashToObj, requireRole, send, wrap } from "./_lib.js";

export default wrap(async (req, res) => {
  await requireRole(req, "admin");
  const all = hashToObj(await one(["HGETALL", K.users]));
  const users = Object.entries(all)
    .map(([id, u]) => ({ id, uid: id.slice(0, 12), name: u.name, role: u.role === "admin" ? "admin" : "staff", code: u.code, creado: u.creado }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  send(res, 200, {
    users,
    builtin: [
      process.env.ADMIN_CODE ? { uid: "admin", name: process.env.ADMIN_NAME || "Administración", role: "admin", env: "ADMIN_CODE" } : null,
      process.env.ACCESS_CODE ? { uid: "general", name: process.env.ACCESS_NAME || "Código general", role: process.env.ADMIN_CODE ? "staff" : "admin", env: "ACCESS_CODE" } : null,
    ].filter(Boolean),
  });
});
