# SendFlow / Sender — Branding de referencia

> Documento de referencia de marca, generado a partir del sistema de diseño vivo (Claude Artifact "Design System"): https://claude.ai/artifact/HMsLHvRjEcXE2Seq5K8gz2 — ahí están los assets SVG descargables y los componentes de UI. Esta copia en `.md` es para consulta rápida sin abrir el artifact.

## Nombres

- **SendFlow** — la webapp de análisis (software).
- **Sender** — el datalogger físico que va en la bici (hardware).
- Nombres deprecados, no usar nunca: "Telemetry PIMP", "GnarFlow", "Shredder", "OptiRide", "FlowTune".

## Voz y contenido

- Todo el copy de producto en **español**, tono técnico y directo — nunca decorativo ni con signos de exclamación de marketing. Frases cortas, sin relleno.
- Sensores en la UI siempre por nombre funcional ("sensor de horquilla", "IMU", "GPS"), nunca por modelo de chip (ADXL375, BNO055, NEO-F10N) — eso solo va en documentación técnica de hardware.
- Semáforos de estado: siempre estas tres palabras fijas, en este orden de severidad — **"todo bien"** (cian), **"atención"** (oro/ámbar), **"alerta"** (rojo). No inventar una cuarta categoría.

## Paleta de color

Dos temas: **dark** (la app en uso normal) y **light** (impresos — el export a PDF de SendFlow y este mismo tipo de documento).

| Token | Dark (app) | Light (print/docs) | Uso |
|---|---|---|---|
| `surface-100` | `#0b0f10` | `#faf8f5` | Fondo de página / pantalla base |
| `surface-200` | `#151b1c` | `#f0ede8` | Paneles, tarjetas, modales |
| `border` | `#232b2c` | `#ddd7cf` | Líneas divisorias, bordes |
| `ink` | `#f2f5f4` | `#12181a` | Texto principal |
| `ink-muted` | `#8b9a98` | `#5b6b69` | Texto secundario, etiquetas |
| `cian` | `#4fe3c2` | `#0f9c82` | Horquilla/delantera. Estado "todo bien". **Acento primario de marca.** |
| `oro` | `#ffbd00` | `#b57e00` | Shock/trasera. Estado "atención" |
| `ambar` | `#d4a13d` | `#8a6320` | Variante apagada de `oro` para elementos repetidos (barras, chips) |
| `rojo` | `#e0483f` | `#c4271d` | Estado "alerta". Bottom-out, error, acción destructiva |
| `azul` | `#4a9eff` | `#1c6fd1` | GPS/velocidad, o segundo eje cuando cian/oro ya están usados |
| `on-cian` | `#04211c` | `#04211c` | Texto/ícono sobre fondo relleno de cian — nunca blanco puro |
| `on-oro` | `#2b1d00` | `#2b1d00` | Texto/ícono sobre fondo relleno de oro |
| `on-rojo` | `#2a0704` | `#ffffff` | Texto/ícono sobre fondo relleno de rojo |

Reglas de color:
- Color con **significado semántico, nunca decorativo**.
- Evitar saturación al 100% en elementos que se repiten mucho en pantalla (barras del dashboard, chips): usar `rgba(...)` a 0.55–0.75 de alfa sobre el token, en vez del tono plano.
- Interfaz **oscura por defecto** — es la identidad del producto, no cambiar sin que lo pidan explícitamente.

## Tipografía

Tres roles, nunca mezclados:

| Rol | Familia | Uso |
|---|---|---|
| `display` | `-apple-system, "Segoe UI", system-ui, Roboto, Arial, sans-serif` (bold, peso 700) | Wordmark y portadas. Uso muy restringido, nunca en la UI de producto. **A propósito no es una webfont cargada** — se probó Chakra Petch y no convenció; usa la sans nativa de cada sistema operativo. |
| `body` | `"IBM Plex Sans", system-ui, sans-serif` | Prosa: documentación, notas, ayuda |
| `mono` | `"Roboto Mono", ui-monospace, "SFMono-Regular", monospace` | Toda la UI de la app: botones, tablas, formularios, y todo dato numérico. Es la fuente ya en producción — no reemplazar. |

Escalas de tamaño:

- **Display**: `display-lg` 56px/700 (wordmark/portadas) · `display-md` 34px/600 (títulos de sección) · `display-sm` 22px/600 (subtítulos)
- **Body**: `body-lg` 16px (intro) · `body` 14px (prosa general) · `body-sm` 12px (auxiliar) · `label` 11px/600, letter-spacing 0.06em, mayúsculas (ej. RUEDA/SUSPENSIÓN)
- **Data (mono)**: `data-lg` 28px/500 (números destacados del Dashboard) · `data` 15px/500 (UI de producción) · `code` 13px (rutas, nombres de columna CSV)

## Espaciado y radios

- Espaciado: `space-1` 4px · `space-2` 8px · `space-3` 12px · `space-4` 16px · `space-6` 24px · `space-8` 32px
- Radios: `radius-sm` 2px (botones, chips, pills) · `radius-md` 4px (tarjetas, inputs) · `radius-lg` 8px (modales — techo del sistema, nunca superar)
- El sistema es técnico y de competición, nunca "amigable" o suave.

## Isotipo y logos

El isotipo es el **zigzag de tres segmentos con un punto en el pico más alto** — la misma forma que dibuja `detectarEventosDeGolpe()` al separar una compresión de suspensión en tramos, leída también como una flecha de "enviar" (send). Es el logo real ya en producción en la app (favicon, pantalla de Bienvenida, sidebar).

- No separar los tres segmentos ni suavizar el zigzag en una curva — esa tensión angular es la marca.
- Trazo de tinta única: `cian` (variante dark o light según fondo).
- El punto del pico es la única excepción: blanco puro `#ffffff` sobre fondo oscuro.

### `mark.svg` — el isotipo solo

Uso: favicon, ícono de app, marca de agua en el mapa 3D.

```svg
<svg viewBox="0 0 200 120" width="200" height="120" xmlns="http://www.w3.org/2000/svg">
  <path d="M10,100 L40,60 L60,85 L85,28 L110,80 L130,55 L160,95 L190,100"
        fill="none" stroke="#4fe3c2" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="85" cy="28" r="9" fill="#ffffff"/>
</svg>
```

### `sendflow-wordmark.svg` — lockup principal del software

Isotipo arriba, "SendFlow" en una sola línea debajo: "Send" en `ink`, "Flow" en `cian`. Mismo tratamiento que usa el logo de la pantalla de Bienvenida y el encabezado del reporte PDF de la app. **No usar el lockup apilado viejo (SEND arriba / FLOW abajo en dos líneas) — quedó deprecado.**

```svg
<svg viewBox="0 0 320 170" width="320" height="170" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(80,4) scale(0.8)">
    <path d="M10,100 L40,60 L60,85 L85,28 L110,80 L130,55 L160,95 L190,100"
          fill="none" stroke="#4fe3c2" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="85" cy="28" r="9" fill="#ffffff"/>
  </g>
  <text x="160" y="152" text-anchor="middle" font-family="-apple-system, 'Segoe UI', system-ui, Roboto, Arial, sans-serif"
        font-weight="700" font-size="42" letter-spacing="0.5">
    <tspan fill="#f2f5f4">Send</tspan><tspan fill="#4fe3c2">Flow</tspan>
  </text>
</svg>
```

### `sender-wordmark.svg` — lockup del dispositivo

Mismo isotipo en un tag compacto + "SENDER" en mayúsculas. Pensado para ir grabado o serigrafiado sobre la carcasa física del datalogger — se apoya solo, sin necesitar el nombre de la app al lado.

```svg
<svg viewBox="0 0 280 64" width="280" height="64" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(4,4) scale(0.45)">
    <path d="M10,100 L40,60 L60,85 L85,28 L110,80 L130,55 L160,95 L190,100"
          fill="none" stroke="#4fe3c2" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="85" cy="28" r="9" fill="#ffffff"/>
  </g>
  <text x="104" y="44" font-family="-apple-system, 'Segoe UI', system-ui, Roboto, Arial, sans-serif"
        font-weight="700" font-size="30" letter-spacing="1.5" fill="#f2f5f4">SENDER</text>
</svg>
```

## Reglas generales

- No usar sets de íconos de sistema (Material, FontAwesome) dentro de la webapp — todo el vocabulario visual sale de este set: el zigzag de marca, los tres colores de estado, y la tipografía mono para datos.
- No usar degradé en el isotipo, ni más de un color de trazo a la vez.
- El tema light de esta paleta existe para impresos (reporte PDF de SendFlow, este mismo documento) — nunca para la UI de la app, que es oscura por defecto.

---
*Última actualización: 2026-09-20 — sincronizado con el sistema de diseño vivo y con el código real de la app (`index.html`, `css/estilos.css`, `js/app.js`).*
