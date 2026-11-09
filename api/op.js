// POST /api/op — todas las escrituras. Cada operación incrementa la versión para que los demás puestos se actualicen.
import {
  K, DAYS, pipe, one, httpErr, requireRole, readBody, send, wrap,
  validId, validDay, cleanPerson, cleanRec,
} from "./_lib.js";

const ADMIN_OPS = new Set(["delete", "bulkSet", "resetAsis", "wipe"]);

export default wrap(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido." });
  const b = readBody(req);
  requireRole(req, ADMIN_OPS.has(b.op) ? "admin" : "staff");
  const needId = () => { if (!validId(b.id)) throw httpErr(400, "Identificador inválido."); };
  const needDay = () => { if (!validDay(b.d)) throw httpErr(400, "Jornada inválida."); };
  let out = {};

  switch (b.op) {
    case "checkin": {
      needId(); needDay();
      const rec = cleanRec(b.rec);
      const [set] = await pipe([["HSETNX", K.asis(b.d), b.id, JSON.stringify(rec)]]);
      if (set === 0) out.already = JSON.parse(await one(["HGET", K.asis(b.d), b.id]));
      break;
    }
    case "undo": {
      needId(); needDay();
      await one(["HDEL", K.asis(b.d), b.id]);
      break;
    }
    case "create": {
      needId();
      const p = cleanPerson(b.data);
      const cmds = [["HSET", K.people, b.id, JSON.stringify(p)]];
      for (const d of DAYS) if (b.asis?.[d]) cmds.push(["HSETNX", K.asis(d), b.id, JSON.stringify(cleanRec(b.asis[d]))]);
      await pipe(cmds);
      break;
    }
    case "update": {
      needId();
      const cur = await one(["HGET", K.people, b.id]);
      if (!cur) throw httpErr(404, "La persona ya no existe en la lista.");
      const p = cleanPerson({ ...JSON.parse(cur), ...(b.patch || {}) });
      await one(["HSET", K.people, b.id, JSON.stringify(p)]);
      break;
    }
    case "delete": {
      needId();
      await pipe([["HDEL", K.people, b.id], ...DAYS.map((d) => ["HDEL", K.asis(d), b.id])]);
      break;
    }
    case "bulkSet": {
      const items = Array.isArray(b.items) ? b.items : [];
      if (!items.length || items.length > 500) throw httpErr(400, "Lote vacío o demasiado grande.");
      const args = [];
      for (const it of items) { if (!validId(it.id)) throw httpErr(400, "Identificador inválido en el lote."); args.push(it.id, JSON.stringify(cleanPerson(it.data))); }
      await one(["HSET", K.people, ...args]);
      out.n = items.length;
      break;
    }
    case "resetAsis":
      await one(["DEL", ...DAYS.map(K.asis)]);
      break;
    case "wipe":
      await one(["DEL", K.people, ...DAYS.map(K.asis)]);
      break;
    default:
      throw httpErr(400, "Operación desconocida.");
  }
  const v = await one(["INCR", K.ver]);
  send(res, 200, { ok: true, v, ...out });
});
