# Acreditación · III Encuentro de Organismos Fiscalizadores del Estado

App web para acreditar a los asistentes del encuentro organizado por SERVEL (16, 17 y 18 de noviembre de 2026, Auditorio Caja Los Andes). Pensada para 2 o 3 personas en la puerta, cada una en un computador con internet, trabajando sobre la misma lista en tiempo real.

## Qué hace

- **Buscar y acreditar**: búsqueda por cualquier parte del nombre, la institución, su sigla (SII, SAG, CGR…) o el RUT, sin importar tildes ni el orden de las palabras. `Enter` acredita, con hora y puesto, y se puede deshacer.
- **Personas no inscritas**: se agregan desde la misma pantalla y quedan acreditadas en el mismo paso. La app avisa si ya existe alguien con el mismo RUT o nombre.
- **Tres jornadas**: el día se elige solo según la fecha. Muestra quién estaba inscrito para cada jornada y marca a los expositores con la hora en que expone su institución.
- **Varios puestos a la vez**: los cambios se sincronizan cada 2 a 3 segundos. Si dos puestos acreditan a la misma persona, cuenta una sola vez.
- **Corte de internet**: las acreditaciones quedan guardadas en el computador y se envían solas cuando vuelve la conexión. La pestaña no se debe cerrar mientras haya registros pendientes.
- **Lista y resumen** por institución y jornada, con **descarga a Excel**.
- **Importar inscritos** desde Excel o CSV, o pegando filas. Detecta las columnas solo y no duplica personas al importar dos veces.
- **Dos códigos de acceso**: uno para la puerta (acreditar y agregar personas) y otro de administración (importar, eliminar y borrar la base).

## Estructura

```
index.html          interfaz completa (HTML, CSS y JS sin dependencias de compilación)
api/state.js        GET  lista y asistencias (responde solo si hubo cambios)
api/op.js           POST todas las escrituras (acreditar, deshacer, crear, editar, importar…)
api/auth.js         POST valida el código de acceso
api/_lib.js         conexión a Upstash Redis (REST), control de acceso y validación
vendor/             SheetJS (lectura y escritura de Excel), servido localmente
scripts/dev.mjs     servidor local de prueba con base en memoria
```

Los datos se guardan en Upstash Redis: un hash con las personas, uno por jornada con las asistencias y un contador de versión.

## Puesta en marcha en Vercel (≈10 minutos)

1. **Importar el repo**: en Vercel, *Add New… → Project*, eliges `acreditacion-encuentro-fiscalizadores` y presionas *Deploy*. No hay que configurar nada: no tiene paso de compilación.
2. **Crear la base**: en el proyecto, pestaña *Storage → Create Database → Upstash for Redis*, plan gratuito, región São Paulo (gru1) o la más cercana. Luego *Connect* al proyecto. Esto agrega solas las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
3. **Definir los códigos**: en *Settings → Environment Variables* agregas:
   - `ACCESS_CODE`: el código para quienes acreditan en la puerta.
   - `ADMIN_CODE`: el código para los organizadores (importar, eliminar, exportar y borrar).
4. **Redesplegar**: en *Deployments*, menú `…` del último despliegue, *Redeploy*, para que tome las variables.
5. **Dominio propio (opcional)**: en *Settings → Domains* agregas por ejemplo `acreditacion.tudominio.cl`, y en tu DNS creas el registro CNAME que Vercel te indique.

Después abres la URL, entras con el `ADMIN_CODE`, vas a **Importar inscritos** y cargas las planillas que enviaron las instituciones.

> Variables opcionales: `EVENT_KEY` cambia el prefijo de las llaves en Redis, por si quieres reutilizar la misma base para otro evento.

## Probar en local

```bash
npm run dev            # http://localhost:3000, base en memoria; cualquier código entra como administrador
ACCESS_CODE=puerta ADMIN_CODE=admin npm run dev   # para probar los dos roles
```

## Antes del evento

- Haz un ensayo con dos computadores. Después, en *Importar inscritos → Zona de cuidado*, usa **Borrar todas las asistencias**: la lista se mantiene.
- En cada computador de la puerta ingresa el código de puerta una sola vez (queda guardado) y ponle un nombre al puesto, por ejemplo "Puerta 1".
- Al cierre de cada jornada, descarga el Excel desde **Lista y resumen** como respaldo.
