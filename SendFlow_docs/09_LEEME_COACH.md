# Coach web: cómo se mantiene (desde el 20/10/2026)

**La fuente de verdad es la carpeta `SendFlow_Coach_Web/` del repositorio.** Se edita directo ahí y esa misma carpeta es la que se
publica (rama `deploy-coach-web`, ZIP para Cloudflare Pages). No hay que "regenerar" nada.

## Por qué
Hasta v52 Coach se armaba con `historico/construir_coach.py` + `historico/seccion_v*.py`, que parchaban el Coach original en PHP
(`/home/claude/coach_orig`). Ese original **no está en el repositorio**: el generador no se puede volver a correr, y varios
cambios posteriores se hicieron directo sobre `SendFlow_Coach_Web/`. Para que no se pierda nada, se dejó la carpeta publicada como
única fuente y el generador quedó archivado en `historico/` (solo para consultar cómo se llegó hasta acá; **no correrlo**).

## Flujo de trabajo
1. Editar archivos en `SendFlow_Coach_Web/` (js, css, index.html).
2. `python3 SendFlow_Bike_Web_herramientas/coach-web/verificar_coach.py` → revisa sintaxis de todos los .js, que cada
   `<script>`/`<link>` de index.html exista y que no haya scripts ni manejadores en línea (la CSP los bloquea).
3. `bash SendFlow_Bike_Web_herramientas/publicar_rama.sh coach` (o `bike`) → actualiza la rama `deploy-coach-web` con el contenido
   de la carpeta y la sube. Luego bajar el ZIP de esa rama y subirlo a Cloudflare Pages.
4. Anotar el cambio en `SendFlow_Bike_Web_herramientas/CAMBIOS_WEB_VS_APP.md`.

## Base de datos y funciones de borde
Los SQL de cada versión están en `SendFlow_Bike_Web_herramientas/nube/` (`coach_vNN_*.sql`) y se aplican en Supabase en orden;
las funciones de borde en `nube/funcion_*/index.ts`. La documentación del esquema: `SendFlow_docs/final/05_DATABASE_SCHEMA.md`.
