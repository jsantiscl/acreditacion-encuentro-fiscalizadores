# Notas del proyecto

App de acreditación del III Encuentro de Organismos Fiscalizadores del Estado (SERVEL, 16-18 nov 2026). Desplegada en Vercel; datos en Upstash Redis.

## Arquitectura
- `index.html`: toda la interfaz (sin build). Estado en memoria (`people` Map), reconstruido desde `server` + `outbox`.
- `api/state.js` (GET, versión incremental), `api/op.js` (todas las escrituras), `api/auth.js` (código → rol). `api/_lib.js` no es ruta (prefijo `_`).
- Redis: `acr:people` (hash id → persona JSON), `acr:asis:d1|d2|d3` (hash id → {t, p}), `acr:ver` (contador). Prefijo configurable con `EVENT_KEY`.
- Acreditar usa `HSETNX` → dos puestos que acreditan a la misma persona cuentan una vez.
- Cola offline (`outbox` en localStorage) solo para checkin / undo / create; editar, eliminar, importar y borrar requieren conexión.
- Roles: `ACCESS_CODE` = staff (puerta), `ADMIN_CODE` = admin (import, delete, resetAsis, wipe). Sin variables y fuera de Vercel, `npm run dev` usa base en memoria y cualquier código es admin.

## Convenciones
- Interfaz y mensajes en español de Chile. Fechas/horas en hora local del navegador.
- Todo texto que venga de datos se escapa con `esc()` antes de insertarlo como HTML.
- Probar con `ACCESS_CODE=puerta ADMIN_CODE=admin npm run dev` y dos ventanas (dos puestos) antes de subir cambios.
