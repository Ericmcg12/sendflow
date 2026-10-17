# API de SendFlow Coach

Servidor en `www/api/` (PHP 8 + PDO). Todas las rutas: `api/index.php?r=<ruta>`
(sin mod_rewrite). JSON de ida y vuelta. Errores: código HTTP + `{"error": "texto
para mostrar"}`.

**Autenticación:** `Authorization: Bearer <token>`. El token sale de `login` o
`registro`, dura `sesion_dias` (60) y se guarda hasheado (sha256) en `sesiones`.
**CORS:** `*` (configurable) para que SendFlow pueda llamar desde el celular.

## Cuenta

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `estado` | — | `{ok, app, version}` (sin sesión) |
| POST | `registro` | `{nombre, email, clave (≥8), modo: coach\|piloto, cliente}` | `{token, usuario}` — vincula pilotos cargados con ese email |
| POST | `login` | `{email, clave, cliente: coach\|sendflow}` | `{token, usuario}` — máx. 8 intentos fallidos por email cada 15 min |
| POST | `logout` | — | borra la sesión del token |
| GET | `yo` | — | `{usuario: {id, email, nombre, modo, piloto{disciplina,nivel,categoria,bici,peso…}}}` |
| PUT | `yo` | `{nombre?, modo?, piloto?}` | `{usuario}` — cambiar de modo entrenador ↔ piloto |
| PUT | `yo/clave` | `{actual, nueva}` | cierra las otras sesiones |

## Entrenador

| Método | Ruta | Notas |
|---|---|---|
| GET | `pilotos` | sus pilotos (`vinculado` = el piloto tiene cuenta con ese email) |
| POST / PUT | `pilotos` / `pilotos/{id}` | `{nombre, email?, disciplina, nivel, categoria, bici, peso, color, notas}` |
| DELETE | `pilotos/{id}` | borra también sus análisis (videos y grabaciones) |
| GET | `pilotos/{id}/perfiles` | perfiles de SendFlow del piloto con cuenta |
| POST | `analisis` | `{pilotoId, titulo, pista, fecha, videoId, duracion, ancho, alto, miniatura, recorte, anotaciones, etiquetas, notas, sender}` |
| PUT | `analisis/{id}` | cualquier subconjunto de lo anterior (sin video) |
| DELETE | `analisis/{id}` | |
| POST | `analisis/{id}/grabaciones` | `{archivoId, duracion}` |
| DELETE | `grabaciones/{id}` | sólo quien la grabó |

## Entrenador y piloto

| Método | Ruta | Notas |
|---|---|---|
| GET | `analisis` | entrenador: los suyos (`&piloto=` filtra); piloto: los que le hicieron |
| GET | `analisis/{id}` | completo + `videoUrl` firmada + `puedeEditar` |
| GET | `analisis/{id}/grabaciones` | con `url` firmada |
| GET | `entrenadores` | entrenadores que lo tienen cargado |
| DELETE | `entrenadores/{coachId}` | el piloto deja de compartir (desvincula) |
| GET | `perfiles` | propios; `&incluir=pilotos` (entrenador) suma los de sus pilotos |
| PUT | `perfiles` | `{perfiles: [{nombre, datos, fecha}]}` agrega o reemplaza por nombre |
| DELETE | `perfiles/{id}` | sólo propios |
| GET | `bajadas` | propias + (entrenador) las de sus pilotos con cuenta |
| GET | `bajadas/{id}` | + `url` firmada por 1 h |
| POST | `bajadas` | `{archivoId, nombre, fecha, pista, resumen, origen: sendflow\|archivo}` |
| DELETE | `bajadas/{id}` | sólo propias |

## Archivos (subida por partes)

1. `POST archivos {clase: video|grabacion|bajada, nombre, tipo, tamano}` →
   `{id, parte: 2097152}`. Máximo: video `video_max_mb`, grabación 300 MB,
   bajada 200 MB.
2. `PUT archivos/{id}&desde=N` con los bytes de la parte (≤ 2 MB) →
   `{recibido, completo}`. Si `desde` no coincide con lo recibido responde 409
   `{recibido, reintentar: true}` y el cliente sigue desde ahí.
3. Con `completo: true` el id se usa en `analisis`, `grabaciones` o `bajadas`.

Los archivos quedan en `datos_dir/<2 primeros>/<id>.bin`. Se leen sólo por
`api/archivo.php?id=…&v=<vencimiento>&f=<HMAC-SHA256(id|v, secreto)>`, que la
API arma después de chequear el permiso. Soporta `Range` (adelantar el video).

## Tablas

`usuarios`, `sesiones`, `intentos`, `pilotos`, `analisis` (el contenido del
análisis va como JSON en `contenido`), `archivos`, `grabaciones`, `perfiles`,
`bajadas`, `meta` (versión del esquema). Se crean solas (`crear_esquema()` en
`lib/base.php`); para cambiarlas, subir `VERSION_ESQUEMA` y agregar los cambios.

## Formato `.sfpb` (paquete de bajada de SendFlow)

JSON comprimido con gzip:
`{tipo: "sendflow_bajada", version: 1, nombre, fecha, config, notas,
unidades: "mm", muestras: {n, columnas: {campo: [valores]}}}` — las muestras por
columnas como el respaldo `.sfdb`, posiciones en mm (horquilla en la barra,
shock en el vástago). Coach las pasa a % con `config` (`recH`, `sensS`, `potH`,
`potS`), igual que SendFlow.
