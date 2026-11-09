// POST /api/op — todas las escrituras. Cada operación incrementa la versión para que los demás puestos se actualicen.
// Acreditadores: checkin, undo, create (personas no inscritas). Todo lo demás requiere rol administrador.
import {
  K, DAYS, pipe, one, httpErr, requireRole, readBody, send, wrap,
  validId, validDay, cleanPerson, cleanRec, cleanName,
  normCode, codeHash, newCode, reservedCode, forgetCode,
} from "./_lib.js";

const STAFF_OPS = new Set(["checkin", "undo", "create"]);

export default wrap(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido." });
  const b = readBody(req);
  const who = await requireRole(req, STAFF_OPS.has(b.op) ? "staff" : "admin");
  const needId = () => { if (!validId(b.id)) throw httpErr(400, "Identificador inválido."); };
  const needDay = () => { if (!validDay(b.d)) throw httpErr(400, "Jornada inválida."); };
  let out = {};

  switch (b.op) {
    case "checkin": {
      needId(); needDay();
      const rec = cleanRec(b.rec, who);
      if (!(await one(["HEXISTS", K.people, b.id]))) throw httpErr(404, "La persona ya no está en la lista.");
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
      const p = cleanPerson({ ...b.data, creadoPor: who.name, creadoPorU: who.uid });
      if (who.role !== "admin") { p.origen = "puerta"; p.dias = []; }
      const cmds = [["HSETNX", K.people, b.id, JSON.stringify(p)]];
      for (const d of DAYS) if (b.asis?.[d]) cmds.push(["HSETNX", K.asis(d), b.id, JSON.stringify(cleanRec(b.asis[d], who))]);
      await pipe(cmds);
      break;
    }
    case "update": {
      needId();
      const cur = await one(["HGET", K.people, b.id]);
      if (!cur) throw httpErr(404, "La persona ya no existe en la lista.");
      const old = JSON.parse(cur);
      const p = cleanPerson({ ...old, ...(b.patch || {}), creadoPor: old.creadoPor, creadoPorU: old.creadoPorU });
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
      for (const it of items) {
        if (!validId(it.id)) throw httpErr(400, "Identificador inválido en el lote.");
        args.push(it.id, JSON.stringify(cleanPerson({ creadoPor: who.name, ...it.data })));
      }
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

    /* ----- Equipo (códigos personales) ----- */
    case "userAdd": {
      const name = cleanName(b.name);
      if (!name) throw httpErr(400, "Falta el nombre.");
      const role = b.role === "admin" ? "admin" : "staff";
      const custom = normCode(b.code);
      if (custom && !/^[A-Z0-9-]{4,24}$/.test(custom)) throw httpErr(400, "El código debe tener entre 4 y 24 letras, números o guiones.");
      for (let i = 0; i < 6; i++) {
        const code = custom || newCode();
        if (reservedCode(code)) { if (custom) throw httpErr(409, "Ese código ya está en uso."); continue; }
        const h = codeHash(code);
        const ok = await one(["HSETNX", K.users, h, JSON.stringify({ name, role, code, creado: Date.now(), creadoPor: who.name })]);
        if (ok === 1) { out.user = { id: h, name, role, code }; break; }
        if (custom) throw httpErr(409, "Ese código ya está en uso.");
      }
      if (!out.user) throw httpErr(500, "No se pudo generar un código. Intenta de nuevo.");
      break;
    }
    case "userDel": {
      if (typeof b.uid !== "string" || !/^[a-f0-9]{64}$/.test(b.uid)) throw httpErr(400, "Usuario inválido.");
      await one(["HDEL", K.users, b.uid]);
      forgetCode(b.uid);
      break;
    }
    default:
      throw httpErr(400, "Operación desconocida.");
  }
  const v = await one(["INCR", K.ver]);
  send(res, 200, { ok: true, v, ...out });
});
