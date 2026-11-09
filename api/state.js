// GET /api/state?v=N — devuelve la lista completa y las asistencias, o {same:true} si no hubo cambios desde la versión N.
import { K, DAYS, pipe, one, hashToObj, requireRole, send, wrap } from "./_lib.js";

export default wrap(async (req, res) => {
  requireRole(req, "staff");
  const known = Number(req.query?.v ?? -1);
  const v = Number((await one(["GET", K.ver])) || 0);
  if (known === v) return send(res, 200, { v, same: true });
  const [p, a1, a2, a3, v2] = await pipe([
    ["HGETALL", K.people], ...DAYS.map((d) => ["HGETALL", K.asis(d)]), ["GET", K.ver],
  ]);
  send(res, 200, {
    v: Number(v2 || 0),
    people: hashToObj(p),
    asis: { d1: hashToObj(a1), d2: hashToObj(a2), d3: hashToObj(a3) },
  });
});
