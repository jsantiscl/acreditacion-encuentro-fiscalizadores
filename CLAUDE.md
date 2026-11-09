# Notas del proyecto

App de acreditación del III Encuentro de Organismos Fiscalizadores del Estado (SERVEL, 16-18 nov 2026). Desplegada en Vercel; datos en Upstash Redis.

## Arquitectura
- `index.html`: toda la interfaz (sin build). Estado en memoria (`people` Map), reconstruido desde `server` + `outbox`.
- `api/state.js` (GET, versión incremental), `api/op.js` (todas las escrituras), `api/auth.js` (código → rol). `api/_lib.js` no es ruta (prefijo `_`).
- Redis: `acr:people` (hash id → persona JSON), `acr:asis:d1|d2|d3` (hash id → {t, p}), `acr:ver` (contador). Prefijo configurable con `EVENT_KEY`.
- Acreditar usa `HSETNX` → dos puestos que acreditan a la misma persona cuentan una vez.
- Sincronización adaptativa (`scheduleSync`): cada 2,5 s con actividad o cambios recientes, 8 s tras 2 min sin uso, 20 s tras 10 min, y nada con la pestaña oculta (salvo registros pendientes). Cuida el tope mensual de comandos del plan gratuito de Upstash.
- Cola offline (`outbox` en localStorage) solo para checkin / undo / create; editar, eliminar, importar y borrar requieren conexión.
- Identidad: `whoAmI(code)` → {role, name, uid}. `ADMIN_CODE`/`ADMIN_NAME` (env) = admin principal; códigos personales en `acr:users` (hash sha256(prefijo:código normalizado) → {name, role, code}), gestionados desde la pestaña Equipo (`userAdd`/`userDel`, `GET /api/users`). `ACCESS_CODE` = código general heredado sin identidad.
- Quién acredita lo fija el servidor (`cleanRec` usa `who.name`/`who.uid`); el cliente solo aporta la hora.
- Permisos: staff solo `checkin`, `undo`, `create` (forzado a origen "puerta") y lectura de `/api/state`; todo lo demás es admin. En la interfaz, staff solo ve la vista Acreditar (`body.staff`).
- Sin variables y fuera de Vercel, `npm run dev` usa base en memoria y cualquier código es admin.

## Convenciones
- Interfaz y mensajes en español de Chile. Fechas/horas en hora local del navegador.
- Todo texto que venga de datos se escapa con `esc()` antes de insertarlo como HTML.
- Probar con `ADMIN_CODE=admin ADMIN_NAME="Nombre" npm run dev` y dos ventanas (admin + un acreditador creado en Equipo) antes de subir cambios.
