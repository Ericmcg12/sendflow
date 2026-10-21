# SendFlow — 00 · Índice de la documentación (leer primero)

> **10/10/2026.** Desde hoy estos 6 documentos son la **fuente de verdad** del proyecto. Cualquier chat nuevo arranca leyendo este índice y los 6 documentos, en este orden. Si otro documento los contradice, **mandan estos**.

| # | Documento | Responde |
|---|---|---|
| 01 | `final/01_PRD.md` — Requisitos de producto | Qué funciones existen, quién las usa, cuándo están terminadas. **Si no está ahí, no se construye.** |
| 02 | `final/02_TRD.md` — Requisitos técnicos | En qué corre cada pieza, dónde está alojada, con qué se conecta. |
| 03 | `final/03_APP_FLOW.md` — Recorridos | Pantalla por pantalla en la app y los sitios; qué pasa al enviar y cuando algo falla. |
| 04 | `final/04_DESIGN_BRIEF.md` — Diseño | Colores, tipografías, logo, botones, títulos y formularios. |
| 05 | `final/05_DATABASE_SCHEMA.md` — Datos | Qué se guarda, dónde y quién puede verlo. |
| 06 | `final/06_IMPLEMENTATION_PLAN.md` — Plan | Cómo está el proyecto hoy y las etapas que siguen. |
| 07 | `final/07_DEPLOY_CHECKLIST.md` — Checklist de despliegue | Pasos y orden para cada despliegue de la nube y los sitios, y cuándo volver atrás. |

**Decisión de Eric, 21/10/2026 (noche):** los planes los arma solo el coach y Sendflow le sugiere (PRD C67 a C73); se descartan los planes genéricos para pilotos sin entrenador (C40 a). Detalle en `ANEXO_MTB_FIT_2026-10-21.md`.

**Actualizado el 21/10/2026 (tarde):** doc 01 suma C61 (ventana única «Subir archivos»), C62 (etiquetas de motivo y situación), el foco de mercado (§1) y la decisión sobre la biblioteca de referencia (C40 i); doc 05 suma `coach_v30`; docs 06 y 07 suman Coach v59.

**Actualizado el 21/10/2026:** los documentos 01 (§5 W10–W13, §6.4 C51–C60), 02 (§5.1 y §5.3), 03 (recorridos nuevos), 05 (resumen de funciones coach_v24–v29), 06 y 07 incluyen lo hecho el 20–21/10. Detalle fino de la web respecto de la app: `SendFlow_Bike_Web_herramientas/CAMBIOS_WEB_VS_APP.md`; cómo reconstruir y publicar Coach: `SendFlow_Bike_Web_herramientas/coach-web/LEEME_COACH.md`.

Copia local: `F:\Users\Eric\Documents\claude\telemetry\SendFlow_docs\final\`.

## Decisiones cerradas el 10/10 al armar estos documentos
1. Lo aprobado el 07/10 y no hecho (transmisibilidad, cadencia BLE, freno switch, Mis sensores) **sigue en el alcance, en FASE 5**. Nada más se suma a la app.
2. **Una sola fuente de bajadas en la nube** (tabla `bajadas` + archivos en R2); `coach_bajadas` y el bucket de Storage se migran (FASE 3).
3. **SendFlow Lab** = app Linux en el FlowBench (sin red) + portal web `sendflowlab.com` con la misma cuenta.
4. **SendFlow Coach** queda en su dominio propio `sendflow.coach`, con la misma cuenta y base que `sendflow.bike`.
5. Logos: descriptor **BIKE cian · COACH oro · LAB azul**.
6. Alimentación del FlowBench: **queda abierta** (monofásica 220 V vs. trifásica con servo EMG).

## Documentos de referencia técnica (detalle fino, subordinados a los 6)
En el Project:
- `referencia/CLAUDE_APP.md` — cada función de análisis de la app y las lecciones aprendidas (copia del `docs/CLAUDE.md` local al 08/10; tiene secciones viejas: "sin login ni nube" y el árbol previo a `www/` — mandan 02 y 05).
- `referencia/HARDWARE.md` — sensores, frecuencias y presión de aire (§7). En pines y alimentación manda `claude/ARMADO_HARDWARE_SENDER.md`.
- `claude/ARMADO_HARDWARE_SENDER.md` · `claude/FORMATO_SFB.md` · `claude/anclaje-manubrio-horquilla-2026-09.md` (soporte).
- `claude/CAMARAS_PISTA.md` — cámaras de pista y controles de tiempo (C25, FASE 8, etapa posterior).
- `claude/ESTADO_NUBE_Y_COACH_2026-10-10.md` (scripts SQL, funciones, despliegue, incidentes) · `claude/MAPA_DE_CARPETAS_SERVIDOR_2026-10-10.md` · `claude/ESQUEMA_DATOS_V0.sql` · `claude/SITIO_BASE_LEEME.md`.
- Material de consulta: `suspensiontunning.pdf`, `Main.pdf` (guía RockShox), `medidas_horquillas_doble_corona.pdf`.

En la carpeta local: firmware `README.md` + `CAMBIOS_*.md`, `Sender_componentes.xlsx`, FlowBench `respaldo_2026-09-24_v2_scotch_yoke/`.

## Limpieza del 10/10
Se borraron del Project los documentos superados (PRD y docx viejos, arquitectura, pendientes, branding, firmware previo y las copias repetidas de CLAUDE.md/HARDWARE.md). Queda un archivo que la herramienta no puede borrar y Eric tiene que sacar a mano: **`Shredder × GnarFlow — Documento de Requisitos de Producto.pdf`** (obsoleto, no usar).
En la carpeta local siguen como históricos (no usar como guía): `TELEMETRY PIMP v6.md`, `architecture.md`, `data sources/*.docx`, `v2/SendFlow completo/`, `soft viejo/`, `SendFlow_Coach v1/docs/` (Coach PHP).
