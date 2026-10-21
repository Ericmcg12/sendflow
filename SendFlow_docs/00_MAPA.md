# SendFlow — Mapa de la documentación

> Punto de entrada para Obsidian (los enlaces son archivos `.md` relativos: también funcionan en GitHub y VS Code). Actualizado el 21/10/2026 (tarde, Coach v59).
> Regla del proyecto: si dos documentos se contradicen, mandan los 01–07; el 08 y el 09 son detalle técnico subordinado.

## Los siete documentos oficiales
| # | Documento | Para qué sirve |
|---|---|---|
| 00 | [Índice oficial](00_INDICE.md) | Cómo leer todo y decisiones cerradas |
| 01 | [PRD — Requisitos de producto](01_PRD.md) | Qué funciones existen y su estado (W = web Bike, C = Coach) |
| 02 | [TRD — Requisitos técnicos](02_TRD.md) | Dónde corre cada pieza, Edge Functions, avisos programados |
| 03 | [App flow — Recorridos](03_APP_FLOW.md) | Pantalla por pantalla, qué pasa si algo falla |
| 04 | [Design brief](04_DESIGN_BRIEF.md) | Colores, tipografías, botones |
| 05 | [Base de datos](05_DATABASE_SCHEMA.md) | Tablas, funciones, permisos, scripts coach_v24–v30 |
| 06 | [Plan de implementación](06_IMPLEMENTATION_PLAN.md) | Dónde está el proyecto y qué sigue |
| 07 | [Checklist de despliegue](07_DEPLOY_CHECKLIST.md) | Orden de SQL, funciones, sitios y pruebas |
| 08 | [Cambios de la web respecto de la app](08_CAMBIOS_WEB_VS_APP.md) | Qué hace distinto la web; detalle 20–21/10 |
| 09 | [Cómo reconstruir y publicar Coach](09_LEEME_COACH.md) | Herramientas y ramas de descarga |

## Por tema
- **Clases presenciales** (plan, confirmar lugar, asistencia): [PRD C57–C59](01_PRD.md) · [recorridos](03_APP_FLOW.md) · [funciones y columnas](05_DATABASE_SCHEMA.md) · [avisos programados](02_TRD.md) · [pruebas de despliegue](07_DEPLOY_CHECKLIST.md) · [detalle](08_CAMBIOS_WEB_VS_APP.md)
- **Subir archivos y etiquetas** (ventana única, motivo y situación): [PRD C47, C48, C61, C62](01_PRD.md) · [recorridos](03_APP_FLOW.md) · [tabla coach_etiquetas](05_DATABASE_SCHEMA.md) · [TRD §5.3](02_TRD.md) · [despliegue v59](07_DEPLOY_CHECKLIST.md) · [detalle](08_CAMBIOS_WEB_VS_APP.md)
- **Avisos push y mails:** [TRD §5.1 y §5.3](02_TRD.md) · [PRD C32, C56, C58, C59](01_PRD.md) · [base: notif_prefs](05_DATABASE_SCHEMA.md)
- **Seguimiento del piloto** (atención, historial, grupos): [PRD C53–C55](01_PRD.md) · [recorridos](03_APP_FLOW.md)
- **Análisis web (`/analisis`)** y nube: [PRD W7, W12, W13](01_PRD.md) · [detalle](08_CAMBIOS_WEB_VS_APP.md)
- **Administración y uso:** [PRD W8, W11](01_PRD.md) · [recorridos](03_APP_FLOW.md)
- **Seguridad y permisos:** [TRD §8](02_TRD.md) · [arreglo de permisos 20/10](05_DATABASE_SCHEMA.md)
- **Publicar y volver atrás:** [Checklist](07_DEPLOY_CHECKLIST.md) · [Coach reconstruible](09_LEEME_COACH.md)

## Mercado y estrategia
- [Foco de producto: dos ruedas (DH y enduro), no multideporte](01_PRD.md) (PRD §1 y §9) — decisión de Eric del 21/10.
- [Análisis competitivo y foco de producto (21/10/2026)](ANALISIS_COMPETITIVO_2026-10-21.md): SportSense y otros, matriz de funciones, riesgos y plan que no depende del hardware.
- [Revisión de informes externos (15/10)](REVISION_EXTERNA_2026-10-15.md): qué se tomó y qué no de cuatro informes de otras IA.

## Referencia técnica (subordinada a los 01–07)
- [Estado de la nube y Coach al 10/10](ESTADO_NUBE_Y_COACH_2026-10-10.md) — scripts SQL, funciones, incidentes de la primera etapa.
- [Perfiles en la web, set-ups y modos de la app](PERFILES_Y_MODOS_APP.md) — bicis, perfiles y qué se hizo en la web.
- [Mapa de carpetas del servidor de trabajo (10/10)](MAPA_DE_CARPETAS_SERVIDOR_2026-10-10.md) — histórico: el contenedor es temporal.
- [Arquitectura general (viva, antigua)](architecture.md) · [Cámaras de pista (FASE 8, etapa posterior)](CAMARAS_PISTA.md) · [Programa integral de pretemporada DH](plan_integral_dh.md) (material de entrenamiento, base de la biblioteca de Coach).

## Qué sigue
[Plan de implementación §1 y FASE 4](06_IMPLEMENTATION_PLAN.md) y [pendientes del PRD §6.4](01_PRD.md): respuestas rápidas, clip de video, resumen semanal por mail, selector principiante/profesional, probar el push real en iPhone/Android decidir si «Nuevo análisis» pasa por la biblioteca, y el plan de la biblioteca de referencia (PRD C40 i).
