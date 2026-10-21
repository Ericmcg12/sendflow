# SendFlow — 04 · Brief de diseño

> **Versión 1.0 · 10/10/2026.** Colores, tipografías, logo y cómo se ven botones, títulos y formularios en cada página. Reemplaza a `sendflow-branding.md`, `desing.md` y a las secciones de paleta de `CLAUDE.md` y `architecture.md`.
> Hay **dos variantes de un mismo sistema**: la **app** (técnica, sobria, para usar en pista) y los **sitios web** (mismo ADN, con movimiento: el estilo de SendFlow Coach). Los tokens son los mismos.

## 1. Personalidad

Técnico, de competición, directo. Nunca "amigable" ni suave, nunca decorativo. Tema **oscuro** siempre (el claro existe solo para impresos/PDF). Texto en **español**, frases cortas, sin signos de exclamación de marketing, sin jerga estadística. Sensores por su nombre funcional ("sensor de horquilla", "IMU", "GPS"), nunca por modelo de chip.

## 2. Color

### 2.1 Tokens

| Token | Oscuro (app y web) | Claro (PDF/impresos) | Uso |
|---|---|---|---|
| `--bg` | `#070b0c` (web) · `#0b0f10` (app) | `#faf8f5` | Fondo de página |
| `--panel` / `--panel-2` / `--panel-3` | `#11171a` / `#151b1c` / `#1b2426` | `#f0ede8` | Tarjetas, paneles, modales |
| `--borde` / `--borde-2` | `#232b2c` / `#2e393a` | `#ddd7cf` | Bordes y divisores |
| `--ink` | `#f2f5f4` | `#12181a` | Texto principal |
| `--ink-dim` | `#8b9a98` | `#5b6b69` | Texto secundario, etiquetas |
| `--ink-mute` | `#5e6b6a` | — | Ayudas, deshabilitado |
| `--cian` / `--cian-2` | `#4fe3c2` / `#2bb89a` | `#0f9c82` | **Marca.** Horquilla/delantera. Estado "todo bien". Botón primario. |
| `--oro` | `#ffbd00` | `#b57e00` | **Todo lo seleccionado/activo** y hover. Shock/trasera. Estado "atención". |
| `--ambar` | `#d4a13d` | `#8a6320` | Oro apagado para elementos repetidos (barras, chips) |
| `--rojo` | `#e0483f` | `#c4271d` | Estado "alerta", tope, error, borrar |
| `--azul` | `#4a9eff` | `#1c6fd1` | GPS/velocidad, segundo eje; color de Lab |
| `--violeta` | `#a35bf0` | — | Solo datos (series extra en Coach) |
| `--on-cian` / `--on-oro` / `--on-rojo` | `#04211c` / `#2b1d00` / `#2a0704` | igual / igual / `#ffffff` | Texto sobre fondo relleno (nunca blanco sobre cian) |

### 2.2 Reglas de color
- El color **siempre significa algo**. Semáforos con estas tres palabras fijas, en este orden: **todo bien** (cian) · **atención** (oro) · **alerta** (rojo). No hay cuarta categoría.
- **Seleccionado / activo / hover = oro** en todo el ecosistema (menús, pestañas, toggles RUEDA/SUSPENSIÓN y %/MM, chips elegidos).
- Elementos muy repetidos (barras del Panel, chips): el token con alfa **0,55–0,75**, no el color pleno ("muy fluorescente").
- Gráficos de la app: horquilla cian, shock oro, GPS azul, alerta rojo. **Comparación A/B: azul / naranja** (no cian/oro). **Mapa (Track GPS): sin cian**; cada capa con su escala de 2–4 colores (terreno: verde `#5cc85c` → ámbar → naranja → rojo).
- Recomendaciones de AJUSTES: "Lo primero que tocaría" en oro, "Después, de a uno por bajada" en azul.

## 3. Tipografía

| Rol | Familia | Dónde |
|---|---|---|
| Interfaz y datos (`--mono`) | **Roboto Mono**, ui-monospace, SFMono-Regular, Menlo, Consolas | Toda la app y toda la interfaz web: botones, menús, tablas, formularios, números. |
| Prosa (`--sans`) | **IBM Plex Sans**, system-ui | Textos largos: ayudas (i), documentación, notas. |
| Títulos y marca (`--display`) | -apple-system, "Segoe UI", system-ui, Roboto, Arial (sans nativa, **sin webfont**) | Wordmark, títulos de página web, portadas. Nunca en la UI de datos de la app. |

**Escala:**
| Uso | Tamaño / peso |
|---|---|
| Título de página web (`.titulo-pagina`) | 30 px, 700, display |
| Wordmark / portada | 42–56 px, 700, display |
| Título de sección web (`.titulo-seccion`) | 11 px, 600, mayúsculas, `letter-spacing .16em`, cian, con línea que se desvanece a la derecha |
| Etiqueta / label (`.etiqueta`, labels de campo) | 10,5–11 px, 600, mayúsculas, `letter-spacing .12–.14em`, `--ink-dim` |
| Título de modal | 14 px, mayúsculas, `letter-spacing .12em` |
| Dato destacado (Panel) | 28 px, 500, mono |
| Dato / UI | 13–15 px, mono |
| Prosa | 14 px (12 px auxiliar), Plex Sans |

## 4. Logo

- **Isotipo:** zigzag de tres segmentos con un punto blanco en el pico más alto (la forma de un golpe de suspensión y una flecha de "send"). Trazo único **cian**; el punto `#ffffff` sobre oscuro. No separar segmentos, no suavizar, no degradé, un solo color de trazo.
- **Wordmark:** isotipo arriba (o a la izquierda en barras), **"Send"** en `--ink` + **"Flow"** en cian, una sola línea, display 700. El lockup apilado viejo (SEND / FLOW) está deprecado.
- **Descriptor de producto** (decidido 10/10): debajo o a la derecha del wordmark, en mayúsculas mono, `letter-spacing` amplio:
  - **SendFlow BIKE** → descriptor en **cian**
  - **SendFlow COACH** → descriptor en **oro**
  - **SendFlow LAB** → descriptor en **azul**
- **Sender** (hardware): isotipo en tag compacto + "SENDER" mayúsculas, para grabar/serigrafiar en la carcasa.
- **FlowBench**: nombre provisorio; logo cuando se defina el nombre comercial.
- SVG de referencia del isotipo:
```svg
<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
  <path d="M10,100 L40,60 L60,85 L85,28 L110,80 L130,55 L160,95 L190,100" fill="none" stroke="#4fe3c2" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="85" cy="28" r="9" fill="#ffffff"/>
</svg>
```
- Usos: favicon e ícono de app = isotipo solo; bienvenida de la app, encabezado del PDF y barras de navegación web = wordmark (+ descriptor en web).
- No usar sets de íconos de sistema (Material, FontAwesome) en la app: el vocabulario visual es el zigzag, los colores de estado y la mono. En la web se usan íconos de línea propios (SVG inline, trazo 1,7, `currentColor`).

## 5. Espaciado, radios y sombras
- Espaciado: 4 · 8 · 12 · 16 · 24 · 32 px.
- Radios: **2 px** botones, chips, pills · **4 px** tarjetas e inputs · **8 px** modales (techo: nunca más). Excepción: insignias de contador redondas (999 px).
- Sombra web: `0 10px 40px rgba(0,0,0,.45)`; modales `0 30px 80px rgba(0,0,0,.6)`.

## 6. Componentes

### 6.1 Botones
| Variante | Aspecto | Uso |
|---|---|---|
| **Normal** (`.btn`) | Alto 40–42 px (44 px en la app táctil), padding 0 16 px, mono 12 px mayúsculas, borde `--borde-2`, fondo transparente/panel, radio 2 px. Hover: borde y texto **oro**. Activo: escala .97. | Acciones comunes |
| **Primario** (`.btn.primario`) | Degradé 135° cian → cian-2, texto `--on-cian`, sin borde, brillo `0 6px 24px var(--cian-glow)`. Hover: brillo 1,08. **Uno por pantalla.** | Acción principal (Ingresar, Guardar, Enviar) |
| **Seleccionado** (`.btn.sel`, `.btn-toggle` activo) | Borde y texto oro, fondo `rgba(255,189,0,.08)` | Toggles, filtros |
| **Fantasma** (`.btn.fantasma`) | Transparente | Secundarias, "Volver" |
| **Peligro** (`.btn.peligro`) | Hover borde/texto rojo (web) | Borrar, formatear, reset |
| **Chico** / **Ícono** | 32 px alto · cuadrado 40/32 px | Barras de herramientas |
| Texto (`.btn-texto`) | Subrayado, `--ink-dim`, hover oro | "¿Olvidaste tu contraseña?" |
| Deshabilitado | Opacidad .4, sin eventos | — |
- Botones de la app: **todos con el mismo estilo** y hover oro en toda la app. Salidas: **flecha + "VOLVER"**, nunca X. Botones físicos de la interfaz con guantes: mínimo 44 px.
- Acciones destructivas siempre con modal de confirmación.

### 6.2 Títulos de página (web)
`.cab-pagina`: a la izquierda etiqueta pequeña (mayúsculas, dim) + título 30 px display; a la derecha los botones de la página; se acomoda en dos filas en celular.

### 6.3 Formularios
- `.campo`: label arriba (10,5 px mayúsculas dim) + input.
- Input: alto 42 px, padding 0 12 px, radio 4 px, borde `--borde-2`, fondo `--bg-2` (`#0b0f10`), texto 13 px. **Foco:** borde cian + halo `0 0 0 3px rgba(79,227,194,.15)`. Error: borde rojo + mensaje rojo debajo.
- Contraseñas con botón de ojo (mostrar/ocultar) en todos los sitios.
- Mensajes (`.mensaje`): texto bajo el formulario; `.error` rojo, `.ok` cian. Nunca se falla en silencio.
- Selects con la misma caja que los inputs. Casillas y toggles: seleccionado en oro.
- En la app: formularios de perfil por bloques (Piloto / Bici / Horquilla / Shock), campos numéricos con unidad visible.

### 6.4 Tarjetas
- Web (`.tarjeta`/`.sf-tarjeta`): degradé `rgba(21,27,28,.92)→rgba(17,23,26,.92)`, borde `--borde`, radio 4 px. Clicables: hover sube 3 px + sombra + brillo diagonal.
- Tarjetas del hub con acento por producto: Bike cian · Coach oro · Lab azul; apagadas con insignia "PRÓXIMAMENTE".
- App: tarjetas de datos uniformes; cada análisis nuevo se muestra como tarjeta igual a las existentes, con botón (i) para la explicación.

### 6.5 Chips, avisos y modales
- Chip: 10,5 px, radio 20 px, borde `--borde-2`; variantes cian/oro/rojo/azul.
- Aviso (toast): abajo al centro, panel-3, borde izquierdo 3 px (cian normal, oro atención, rojo error); no se repite si ya está en pantalla.
- Modal: ancho máx. 620 px, fondo oscurecido con blur, cabecera / cuerpo / pie con botones a la derecha.
- Insignia de contador (Recibidos): oro relleno, texto `#1a1400`.

### 6.6 Navegación
- **Web:** menú lateral de 232 px en PC (marca arriba, ítems con ícono, seleccionado en oro con barra luminosa a la izquierda, "Salir" como ítem); en celular barra inferior de 64 px y "Salir" arriba junto al logo. Ingreso sin menú: pantalla `.ingreso` en dos columnas (zigzag grande con brillo + caja de formulario).
- **App:** barra lateral de la Suite con pestañas por ícono (PANEL, LÍNEAS, DINÁMICA, EVENTOS, TMD, TRACK GPS, AJUSTES, TALLER); en ≤ 480 px se compacta y a 360 px se desliza. Panel RUEDA/SUSPENSIÓN y %/MM en grilla de 2 columnas.

## 7. Movimiento
- **Web (estilo Coach, obligatorio en todos los sitios y páginas nuevas):** fondo con grilla en perspectiva y dos halos (cian y azul) que flotan; entradas escalonadas (`.entra`); onda al tocar; brillo en tarjetas; zigzag que se dibuja; contadores animados; transición entre pantallas. Archivos comunes `estilo/sendflow.css` + `estilo/sendflow.js`, clases `sf-btn`, `sf-tarjeta`, `entra`. Web Animations API, sin librerías.
- **App:** movimiento mínimo (entrada del logo y botones en la bienvenida, anime.js). Nada que distraiga en pista.
- Todo respeta `prefers-reduced-motion`.

## 8. Por página

| Página | Variante | Notas |
|---|---|---|
| App — todas | App | Oscuro sobrio, mono, sin fondo animado. |
| App — PDF | Claro | Fondo blanco, texto oscuro, acentos claros de la tabla; encabezado con wordmark. |
| `sendflow.bike` — ingreso, inicio, perfil, admin | Web | Estilo Coach (v18). Descriptor BIKE en cian. |
| `sendflow.bike/analisis` | App dentro de web | Colores y componentes de la app + fondo y onda web (`modo-web.css/js`). **Rediseño pendiente (FASE 4)** para alinear cabecera, menú y botones con el estilo web sin tocar los gráficos. |
| `sendflow.coach` | Web | Estilo de origen. Descriptor COACH en oro. |
| `sendflowlab.com` y SendFlow Lab en el banco | Web | Mismo estilo; descriptor LAB en azul. En la pantalla táctil del banco: botones ≥ 56 px y movimiento reducido. |

## 9. Accesibilidad mínima
Contraste de texto ≥ 4,5:1 sobre el fondo (el `--ink-mute` solo para texto no esencial). Objetivos táctiles ≥ 44 px. Foco visible (halo cian). No usar el color como única señal: los semáforos llevan la palabra.
