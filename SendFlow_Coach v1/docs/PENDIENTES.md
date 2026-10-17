# SendFlow Coach — pendientes

Numeración de ideas igual que en `telemetry\v2\telemetry_pimp\docs\PENDIENTES.md`
(sección "SendFlow Coach"), donde está el detalle de cada una. Lo hecho queda
tachado con la fecha.

## Hecho

- [x] ~~App web aparte de SendFlow, responsive, con animaciones~~ (08/10).
- [x] ~~Pilotos: alta, edición, borrado, ficha~~ (08/10).
- [x] ~~Análisis de video: recorte, cuadro a cuadro, velocidades, dibujos con
  tiempo, etiquetas por categoría, notas, comentario de voz con cámara~~
  (08/10, punto 7).
- [x] ~~Datos del Sender opcionales: lectura en pantalla, gráfico, eventos,
  sincronización con GoPro / a mano / por evento, etiquetas sugeridas~~ (08/10).
- [x] ~~Servidor propio (PHP + MySQL para el GoDaddy de Eric)~~ (08/10).
- [x] ~~Registro e ingreso: no se entra sin cuenta~~ (08/10).
- [x] ~~Modo entrenador / piloto elegible en el perfil, con menú y funciones
  distintas~~ (08/10, diseño tomado de BMX Pro).
- [x] ~~Vínculo entrenador–piloto por email; el piloto ve sus análisis en sólo
  lectura y puede quitar a un entrenador~~ (08/10, parte del punto 5).
- [x] ~~Videos y grabaciones guardados en el servidor, subidos por partes, con
  enlaces firmados~~ (08/10).
- [x] ~~Comunicación con SendFlow: enviar y traer perfiles, enviar bajadas
  (paquete .sfpb, formato propio)~~ (08/10).
- [x] ~~Bajadas del Sender en el servidor, elegibles al armar un análisis~~ (08/10).
- [x] ~~Guía para instalar en GoDaddy~~ (08/10, `INSTALAR_GODADDY.md`).

## Para hacer en el hosting

- [ ] Subir a GoDaddy siguiendo `INSTALAR_GODADDY.md` y probar con https.
- [ ] Conectar SendFlow del celular a la dirección real.
- [ ] Borrar `www/js/db.js` de la carpeta (quedó de la primera versión, no se usa).

## Para probar

- [ ] Con videos reales de Eric (celular, cámara al costado de la pista, GoPro).
- [ ] Grabación de voz en el celular (Android / iPhone): formato y permisos.
- [ ] Videos grandes (> 500 MB) subiendo desde el celular con datos móviles.
- [ ] Umbrales de eventos del Sender con bajadas reales.

## Siguiente

- [ ] Recuperar contraseña por email (hoy no hay; hace falta configurar el envío
  de mails del hosting).
- [ ] Invitación con aceptación: que el piloto confirme antes de quedar
  vinculado a un entrenador.
- [ ] Exportar un análisis en formato propio (para guardarlo fuera del servidor).
- [ ] Pantalla dividida y "fantasma": dos videos lado a lado o superpuestos,
  sincronizados en un punto (puntos 2 y 16).
- [ ] Que el piloto pueda subir su propio video para pedir una revisión.
- [ ] Mensajes / comentarios entre entrenador y piloto en cada análisis (punto 5).
- [ ] Planificación del entrenador, pretemporada y temporada (punto 14, paga),
  con carga, fatiga y plan que se acomoda (punto 17).
- [ ] Tests físicos para DH (18), largada medida (19), escalera de saltos (10),
  debrief de carrera (11), caídas automáticas (12), nivel medido (8), plan de
  progresión con ejercicios (9), programas con fecha (15), revisión remota como
  producto (13).
- [ ] Postura con IA (punto 3) y cámaras de sector (punto 4).
- [ ] Funciones pagas: definir qué es gratis y qué se cobra, y cómo se cobra.
- [ ] Empaquetar con Capacitor (Android / iOS).
- [ ] Carpeta común con SendFlow para `formato-sfb.js` y `gopro-gpmf.js` (hoy
  son copias).
