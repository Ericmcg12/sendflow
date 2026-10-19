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
