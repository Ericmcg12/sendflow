# Qué cambió en la web y no está en la app

La app (`v2/telemetry_pimp/www`) **no se modificó**. Todo lo de abajo vive solo en la copia web
`SendFlow_Bike_Web/analisis` y se aplica con `aplicar_semaforos_popup.py` (piezas en `piezas/`).
Cuando se lleve a la app, este archivo es la lista de qué portar y qué decidir.

## Cómo se aplica (y qué pasa si se regenera la web)

1. `construir_web.py` genera `SendFlow_Bike_Web/analisis` a partir de la app. **No se pudo correr** en el entorno
   donde se hizo este trabajo (falta `../nube/nube-core.js`), así que los cambios se aplicaron con el script de abajo.
2. Después de **cada** build hay que correr: `python SendFlow_Bike_Web_herramientas/aplicar_semaforos_popup.py SendFlow_Bike_Web/analisis`.
   Es idempotente. Si el build trae un `app.js` distinto, el script falla con un mensaje (`app.js cambió, no se encuentra: ...`)
   en vez de aplicar a ciegas.
3. Si se regenera sin correr el script, el popup, el equilibrio nuevo y los ajustes de diseño desaparecen.

## Archivos nuevos o modificados solo en la web

| Archivo | Qué es |
|---|---|
| `analisis/js/semaforos-popup.js` | Botón ⓘ por grupo, "qué hacer" bajo cada barra, popup. Lee `window.__sfAnalisis.estado` |
| `analisis/js/semaforos-iconos.js` | Íconos SVG: perilla (horario / antihorario), presión, token, resorte más duro, barra |
| `analisis/semaforo-anim.html`, `js/semaforo-anim.js`, `css/semaforo-anim.css` | Animaciones del popup (iframe del mismo sitio; la CSP no permite scripts inline) |
| `analisis/css/modo-web.css` (bloque final) | Estilos del popup, tarjetas del mismo alto, layout del equilibrio |
| `analisis/index.html` | Dos `<script>` agregados al final (`semaforos-iconos.js`, `semaforos-popup.js`) |
| `analisis/js/app.js` | **Parche de equilibrio** (ver abajo) |

## 1) Equilibrio adelante/atrás: cambió el criterio (parche en `app.js` de la web)

**Problema de la app.** `evaluarBalanceRebote` compara la velocidad de rebote absoluta (p95) de la rueda trasera contra la
delantera (zona 0,85–1,15) y dice "Cerrar/Abrir rebote del shock". Eso mezcla compresión con rebote: si la trasera comprime
más rápido que la delantera (terreno, leverage), también rebota más rápido y la tarjeta culpa al rebote, aunque HSR/LSR del
shock estén "en punto" (miden rebote ÷ compresión de la misma suspensión). Seguir el consejo hasta igualar velocidades
llevaría el rebote ÷ compresión del shock por debajo de `reboteMin` y HSR diría "Abrir": un lazo.

**Criterio nuevo** (no usa clics; compara el comportamiento de los dos ejes). Código en `piezas/equilibrio-geometrico.js`:

1. **Recorrido dinámico.** `trasera − delantera` del SAG dinámico medio (el que ya calcula `sagDinamicoDe`: en marcha y
   fuera de los saltos) debe estar entre **8 y 12 puntos** (objetivos de la app: horquilla 20–25 %, shock 30–35 %: 10 puntos).
   Fuera de esa franja la acción es de **SAG** del extremo que ya está fuera de su propio rango (presión de aire o precarga,
   según `tipoResorteH/S`); si ninguno lo está, el shock.
2. **Fase de rebote.** En cada golpe se mide el tiempo que cada suspensión tarda en recuperar el **80 %** desde su punto más
   hundido (`t80`). Se emparejan golpes de rebote de la horquilla y del shock (el del shock empieza entre −0,05 y +0,6 s
   después, porque la trasera pega más tarde) con profundidad **≥ 8 %** del recorrido, fuera de los saltos, y se toma la
   mediana de `Δt = t80_delantera − t80_trasera`. Hace falta **≥ 5 pares**.
   - Tolerancia `tol = max(15 ms, 12 % de t80 de la delantera)`.
   - `Δt < −tol` → "Abrir rebote del shock (pack down trasero)"; `Δt < −3·tol` es la zona grave (rojo).
   - `Δt > 6·tol` → "Cerrar rebote del shock (la trasera recupera mucho antes)".
   - Entre `−tol` y `6·tol`: en zona (la trasera puede ser algo más rápida, nunca más lenta).
3. Si ambas están fuera, manda el SAG (se corrige primero, igual que el resto de la app); el mensaje del rebote queda en
   `secundario`.

**Valores propuestos, no calibrados con datos reales** (ajustar con bajadas reales): 8–12 puntos, 80 %, 8 % de profundidad,
ventana 0,6 s, ≥ 5 pares, 15 ms / 12 %, factor 3 y 6.

**Resultado.** `resIa.BALANCE_REBOTE = { desviacion, mensaje_sugerido, accion, secundario, datos }`. `accion` es
`{tipo:"sag", susp:"S"|"H", mas:boolean}` o `{tipo:"rebote", cierra:boolean}`. `datos` conserva los campos viejos
(`rebH, rebS, ratio, compH, compS, ratioComp`) y agrega `fase {pares, dt, tF, tol}`, `sagDif, sagH, sagS`.

**Cambios exactos en `app.js` (los hace `parchar_app()` del script, con aserción de que cada texto exista una sola vez):**

1. Se inserta el bloque `EQUILIBRIO_GEOMETRICO` antes de `// SAG dinámico medio (07/10/2026, separado`.
2. En `ejecutarAnalisis`, justo después de `estado.sagDin = calcularSagDinamico(muestras);` se agrega
   `estado.resIa.BALANCE_REBOTE = evaluarEquilibrio(estado, estado.resIa.BALANCE_REBOTE, tiempos);`
   (hace falta que `estado.sagDin` ya exista; por eso va ahí y no donde se asigna `BALANCE_REBOTE`).
3. Línea de datos de la tarjeta (`dato-balance`): ahora muestra recorrido en marcha de cada eje y `Δt`, en vez de velocidades.
4. Título de la tarjeta: `BALANCE DE REBOTE ADELANTE / ATRÁS` → `EQUILIBRIO ADELANTE / ATRÁS`.
5. En el informe de texto, la línea de velocidad de rebote queda como "(en rueda, informativo)" y solo si existe `d.rebH`.
6. En la prioridad del informe, si la acción es de SAG se usa el mensaje de SAG.

**Lo que NO se tocó y sigue con el criterio viejo:** `evaluarBalanceRebote` (se sigue calculando y alimenta `datos`),
la llamada dentro del historial/comparación de set-up (`~L1459`, campo `balReb` = ratio de velocidades) y el criterio de
compresión (texto "la trasera comprime más rápido..."). Para llevarlo a la app: decidir si el historial pasa a guardar `Δt`
y la diferencia de recorrido en vez de `ratio`.

**Si se lleva a la app:** pegar `equilibrio-geometrico.js`, agregar la llamada del punto 2, y los cambios 3–6. La función
usa `buscarIndiceTiempoEn`, `percentil`, `estado.golpesH`, `estado.golpesSSusp`, `estado.mh`, `estado.msVastago`,
`estado.mascaraAire`, `estado.sagDin`, `estado.config.tipoResorteH/S`.

## 2) Textos y comportamiento de los semáforos que la web corrige en pantalla (`semaforos-popup.js`)

Estos son parches de **presentación**: el dato de la app no cambia, la web reescribe el texto mostrado. Para llevarlos a la app
conviene corregir el origen.

- **Bug de SAG en aire (sigue en la app).** `evaluarSagMedido` (`app.js ~L1182`): con aire dice "Bajar presión" cuando el SAG
  medido está **por encima** del objetivo, y "Subir presión" cuando está por debajo. Es al revés: SAG alto → subir presión
  (el aire empuja más y hay más recorrido útil). La web muestra el sentido correcto sin cambiar el dato. En espiral el
  sentido de la app es correcto.
- **Flechas `→ ← `** del texto de los mensajes: la web las quita.
- **Cantidad de clicks:** la app dice "1 click"; la web muestra 2 cuando `|desviacion| > 0,55` (el umbral "FUERTE" de la app).
  Regla del sitio: 1 click por vez; 2 solo hacia los extremos de la barra. **Pendiente confirmar** que 0,55 es lo que se quiere.
- **"Qué hacer" según el perfil (piloto + bici):** aire → presión; espiral → precarga (perilla horaria = más precarga).
  Topes con SAG en zona: token (aire) o resorte de más lbs (espiral, no precarga). Topes con SAG fuera de zona: primero el SAG.
  Compresión/rebote: perilla horaria = cerrar, antihoraria = abrir.
- Barras lineales: se mantienen; no se invirtió ningún signo. La app tiene signos inconsistentes entre barras (p. ej. la
  desviación del shock en HSC es negativa cuando pide cerrar, la de la horquilla positiva): la web decide el sentido por el
  texto del mensaje (`Cerrar…` / `Abrir…`) o por `accion`, no por el signo.

## 2b) Seguridad (revisión del 19/10/2026) — otro parche en `app.js` de la web

- **Foto de perfil** (`actualizarIndicadorPerfilActivoHome`, `actualizarAvatarPerfil`): la app arma el `<img>` con `innerHTML` y el dato
  de la foto. La web agrega `sfImgSegura()` (acepta solo `data:image/(jpeg|png|webp|gif);base64,...` y crea el elemento por DOM).
  Para llevarlo a la app: misma función y los dos reemplazos (los hace `parchar_foto()` del script).
- `_headers`: se agregan HSTS, `form-action 'self'` en `/analisis/*` y una `Permissions-Policy` más completa
  (se deja `geolocation=(self)` porque el análisis usa la geolocalización del navegador). `asegurar_cabeceras()` del script lo repite
  en cada build si el `_headers` se regenera. Detalle y pendientes: `REVISION_SEGURIDAD_2026-10-19.md`.
- `LEEME.md` del sitio se movió a `SendFlow_Bike_Web_herramientas/LEEME_sitio.md`: se publicaba en `https://sendflow.bike/LEEME.md`.

## 2c) Rutas del sitio base (`/perfil`, `/mensajes`, `/bajadas`)

No es de la app: es del sitio madre. Las reglas `_redirects` `... /index.html 200` respondían 307 hacia `/`. Ahora cada ruta es una copia
de `index.html` (`perfil.html`, `mensajes.html`, `bajadas.html`). Hay que correr `sincronizar_rutas.py` cada vez que cambie `index.html`.
Pendiente de verificar en producción: `curl -sI https://sendflow.bike/perfil` debe dar 200. Guía: `GUIA_CLOUDFLARE_SEGURIDAD.md`.

## 2d) Foto de perfil con cámara (sitio base)

`index.html` (y sus copias `perfil.html`, `mensajes.html`, `bajadas.html`), `js/mi-perfil.js`, `css/sitio.css`: junto a «Elegir foto» (galería) hay un
«Sacar foto» (`<input type="file" accept="image/*" capture="user">`) que abre la cámara frontal del celular. En la compu el botón se oculta
(el navegador ignoraría la cámara). Es la cámara del sistema, no `getUserMedia`, así que no hay que tocar `Permissions-Policy: camera=()`.
Falta probar en un celular real (iPhone y Android).

## 2d-bis) Nombre «SAG»
En la copia web se quitó «en reposo» de todos los textos («SAG en reposo» → «SAG»; títulos de tarjeta, popup, campos de Recorte/Bajada, informe y mensajes), porque el SAG se mide con el piloto sobre la bici. Lo hace `parchar_nombre_sag` en `aplicar_semaforos_popup.py` (reemplazo de texto en `app.js` e `index.html`). La app de escritorio sigue diciendo «SAG en reposo».

## 2d-ter) Dónde están las calculadoras (SAG, presión de neumáticos, resorte)
Un solo módulo, `piezas/calculos-bici.js` (+ `calculos-bici.css`), con un «adaptador» por formulario. Botón «Calcular» junto al campo:
- **Perfil de bici del sitio** (`/perfil` → Mis bicis, `js/editor-bici.js`): sus campos no tienen id, se buscan por el grupo y la etiqueta (`SITIO` en el módulo); un `MutationObserver` agrega los botones cuando se arma el formulario. No se editó `editor-bici.js` (lo comparte el sitio Coach). La curva de leverage del editor es privada, así que acá el resorte usa el leverage promedio.
- **Perfil de la app de análisis** (ids `pf…`), **Recorte** (`rc…`) y **Bajada** (`bt…`): mismos botones; en Recorte y Bajada no hay peso de la bici ni ancho de cubierta, se escriben en la ventana.
- El script `aplicar_semaforos_popup.py` copia el módulo al sitio y a `analisis/`, y agrega los `<script>`/`<link>` en ambos `index.html`.

## 2e) Ayuda para medir el SAG y frases de velocidad (ideas tomadas de la revisión de sagly.at; textos propios)

El SAG es un dato que se carga **antes** de analizar una bajada; el semáforo solo confirma si está en zona. Por eso la calculadora **no** va en el popup del semáforo (ahí quedó igual que antes):
- **Calculadora de SAG en el perfil de bici** (`piezas/calculos-bici.js`): botón «Calcular» junto a cada campo «SAG medido (%)» (`pfSagMedidoH/S`). Abre una ventanita con el recorrido (toma `pfRecH` / `pfSensS`) y cuánto se corrió el o-ring → % de SAG; «Usar este valor» lo escribe en el campo (entero, como el resto del perfil). Incluye «Cómo medir el SAG» (4 pasos). No toca ninguna bajada ya analizada. La app de escritorio no la tiene.
- **Calculadora de presión de neumáticos en el perfil** (`piezas/calculos-bici.js`): botón «Calcular» junto a «Presión (psi)» (`pfPresD/T`). Toma del perfil peso del piloto, peso de la bici, ancho de cada cubierta e inserto; en la ventana se eligen equipo, estilo, carcasa, sistema (tubeless/cámara) y terreno. Fórmula **propia** (no copiada de sagly): `psi = 1,83 · reparto · carga / ancho^1,5` (reparto 45 % delante, 55 % atrás) × factores de estilo, carcasa, sistema, terreno e inserto, limitada a 12–45 psi. «Usar estos valores» escribe ambas presiones (enteros). **Los factores son estimaciones sin validar con datos reales**; la ventana avisa que es un punto de partida y que se respeten los límites de cubierta y llanta.
- **Calculadora de resorte (coil) del shock en el perfil** (`piezas/calculos-bici.js`): botón «Calcular» junto a «Dureza resorte (lb)» del shock (solo se ve con shock a resorte). Toma peso del piloto y de la bici, `pfRecS` (recorrido de la rueda) y `pfSensS` (carrera del shock). Física estática: `tasa = (carga sobre la rueda trasera × leverage) / (carrera × SAG objetivo)`, con carga = (piloto + equipo + bici − 4 kg de masa no suspendida) × 62 % (editable); leverage = pendiente de la curva del perfil en el punto del SAG, o recorrido de rueda / carrera si no hay curva; SAG objetivo 28 % (el de base de la app, editable). Muestra el resorte necesario y los 3 comerciales más cercanos (pasos de 25 lb, de 50 sobre 500) con el SAG que daría cada uno; «Usar» lo escribe en `pfDurezaResorteS`. No considera la precarga, la progresividad del amortiguador de aire ni si el resorte entra en el shock. No cubre horquilla a resorte. Es la misma fórmula básica que usa outset.bike (conocimiento general, código propio).
- **Frases de velocidad** (popups de HSC, LSC, HSR, LSR): «alta/baja velocidad» habla de la velocidad del vástago, no de la bici; y «no hay una cantidad de clicks universal».
- **Aviso de seguridad** (presión, tokens y precarga máximos del fabricante; fuga o juego anormal) solo en los popups de TOPES y EQUILIBRIO.
- **Textos de los popups justificados** y a todo el ancho de la ventana (`semaforo-anim.css`).
- Se probó y se **descartó**: la regla «±5–10 psi ↔ 1–2 clicks de rebote» y las notas de máximo del fabricante bajo las indicaciones de las tarjetas.
- Se descartó copiar el buscador de presión por peso (tablas oficiales de SRAM con derechos de autor, y es un dato de seguridad).

## 3) Diseño

- Las tarjetas de una misma fila de `#contSemaforos` toman el alto de la más alta (`align-items: stretch`; las filas internas
  se reparten el espacio).
- Equilibrio: en pantalla ancha el "qué hacer" va a la derecha del texto; en ≤ 760 px, debajo del semáforo.

## 4) Animaciones (`semaforo-anim.*`)

- Una animación por semáforo (HSC, LSC, HSR, LSR, SAG, TOPES, EQUILIBRIO) para horquilla y shock, con el resorte del perfil
  (aire o espiral). Se abre en un iframe del mismo sitio: la CSP de `/analisis/*` solo permite `script-src 'self'`.
- El popup recibe el contexto por el hash: `#CLAVE-H|S-resorteH-resorteS[-ratio]` (para EQUILIBRIO, el último valor elige la
  escena: 1,70 = trasera recupera antes; 0,50 = pack down; 1,00 = parejo).
- EQUILIBRIO: bici de costado con la cinemática de un cuadro de cuadrilátero medida sobre un dibujo del cuadro
  (balancín, tirantes, shock). Las constantes `K` están en `semaforo-anim.js`; los valores de amortiguación y el tamaño del
  obstáculo están elegidos para que la diferencia se vea, **no están calibrados**.

## Ramas

- `animaciones-suspension`: todo el trabajo (esta carpeta, el sitio y las animaciones sueltas en `analisis/`).
- `deploy-bike-web`: solo el contenido de `SendFlow_Bike_Web` para bajar un ZIP liviano. Sin historial; no hacer merge de ella.
  Hay que actualizarla (copiar el sitio) cada vez que cambie.
