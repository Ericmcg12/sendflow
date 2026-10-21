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
En la copia web se quitó «en reposo» de todos los textos («SAG en reposo» → «SAG»; títulos de tarjeta, popup, campos de Recorte/Bajada, informe y mensajes), porque el SAG se mide con el piloto sobre la bici. Lo hace `parchar_nombre_sag` en `aplicar_semaforos_popup.py` (reemplazo de texto en `app.js` e `index.html`). La app no se tocó y sigue diciendo «SAG en reposo».

## 2d-bis2) Perfiles en /analisis: solo se eligen
En la web los perfiles (bicis) se crean y editan en `/perfil`. En `/analisis`: se oculta «Nuevo perfil» también del selector del inicio (`#btnIrANuevoPerfilDesdeHome`), y si no hay bicis el botón «Perfil» del inicio muestra «Todavía no tenés bicis en tu cuenta. Cargalas en sendflow.bike/perfil → Mis bicis» en vez de abrir el formulario de perfil nuevo (`parchar_perfil_vacio` en `aplicar_semaforos_popup.py`). La app (celular/tablet con el Sender) no se toca: el cambio de que los perfiles se creen en la web y se bajen a la app con la cuenta, antes de analizar, es un cambio de la app que se define aparte.

## 2d-nube) «Desde la nube» y Mi nube
- **Bike/Inicio**: se quitó la tarjeta «Mi nube» (`js/app.js`: tarjeta y `contarNube`).
- **/analisis → «Desde la nube»**: ya no abre el panel a pantalla completa (`nube-ui.js`, con botones «Ir al análisis» / «Volver a SendFlow» / «Cerrar» y estilo propio). Es una pantalla más del análisis (`#pantallaNube`, `nube-web.js`) con filas del mismo estilo que «Importar bajada». Al tocar una bajada: si ya está en el navegador se abre; si no, se baja, se importa con el importador de la app y se abre directo en el análisis. «Quitar» (con confirmación en dos toques) borra de la nube; no toca la copia de la app. Salida: «← Volver» al inicio.
- `__sfAnalisis` expone además `mostrarPantalla`, `renderizarListaGuardados` y `generarTablaLeverageDefault`. `embebido.js` cuenta `pantallaNube` como pantalla de inicio (el menú de Bike sigue visible). `nube-ui.js` queda en el sitio pero sin uso desde el inicio.
- El inicio de /analisis muestra tres botones (la «Configuración» está oculta en la web desde antes).

## 2d-clima) Clima de Recorte y estado de pista en las calculadoras
- **Clima** (Recorte): ahora «Despejado / soleado», «Seco / muy soleado», «Nublado», «Lluvia», «Nieve», «Ventoso» (antes Seco / Húmedo / Lluvia), con una línea de ayuda debajo de cada uno (`inicio-web.js`). Valores: `despejado`, `muy_soleado`, `nublado`, `lluvia`, `nieve`, `ventoso`. Lo guardado como `seco` se lee como despejado y `humedo` como nublado (`parchar_clima`). **El análisis solo distingue `lluvia`** (suma 2,5 kg al piloto): el resto de los climas no cambia las cuentas; nieve no suma peso (decisión pendiente).
- **Calculadora de presión**: usa el mismo «Estado de la pista» de la app (Seco y suelto, Compacto, Húmedo, Barroso, Mojado) en vez de un «terreno» propio; en Recorte arranca con el estado elegido ahí. Se mantienen los estados de la app porque alimentan los umbrales del análisis (`FACTOR_ESTADO_PISTA`).
- **Diseño**: las ventanas de las calculadoras siguen el brief (inputs de 42 px, radio 4; botones de radio 2 con hover oro; modal de radio 8 con pie y «Volver» con flecha, sin X). El campo del dato queda corto y el botón «Calcular» al lado, en la misma línea.

## 2d-ter) Dónde están las calculadoras (SAG, presión de neumáticos, resorte)
Un solo módulo, `piezas/calculos-bici.js` (+ `calculos-bici.css`), con un «adaptador» por formulario. Botón «Calcular» junto al campo:
- **Perfil de bici del sitio** (`/perfil` → Mis bicis, `js/editor-bici.js`): sus campos no tienen id, se buscan por el grupo y la etiqueta (`SITIO` en el módulo); un `MutationObserver` agrega los botones cuando se arma el formulario. No se editó `editor-bici.js` (lo comparte el sitio Coach). La curva de leverage del editor es privada, así que acá el resorte usa el leverage promedio.
- **Perfil de la app de análisis** (ids `pf…`), **Recorte** (`rc…`) y **Bajada** (`bt…`): mismos botones; en Recorte y Bajada no hay peso de la bici ni ancho de cubierta, se escriben en la ventana.
- El script `aplicar_semaforos_popup.py` copia el módulo al sitio y a `analisis/`, y agrega los `<script>`/`<link>` en ambos `index.html`.

## 2d-quater) Vista por defecto y perfil activo automático en /analisis (20/10/2026)
- La vista de datos de una bajada abre en **Suspensión** (antes Rueda): `estado.modoCanalSusp` arranca en `"suspension"` (`parche_defaults.py`).
- En /analisis ya no hay selector de perfil, por eso Taller → Mantenimiento pedía elegir uno aunque hubiera bicis en la cuenta. Ahora, al traer los perfiles de la cuenta, se activa solo el último usado (`localStorage.sf_perfil_activo`) o el más reciente; Mantenimiento lo vuelve a intentar si no hay ninguno activo (sin tocar la configuración de una bajada abierta). Código en `piezas/perfil-auto.js`.
- Si la cuenta no tiene ninguna bici, Mantenimiento sigue pidiendo cargarla.

## 2d-quinquies) Inicio de Bike y Coach, fechas (20/10/2026)
- Bike/Inicio: tarjeta **Mensajes** (últimas 3 conversaciones, sin leer, «Ver todos»), como la de Coach. Se muestra si hay conversaciones o entrenador vinculado.
- Saludo: en Bike y en Coach, solo el primer nombre y en cian (`.saludo-nombre`).
- Fechas del calendario y de los planes: dd/mm/aaaa. El detalle de un día se abre en una ventana (con «Agregar fecha este día») en vez de aparecer debajo del calendario.
- Coach: estos cambios están hechos directo sobre `SendFlow_Coach_Web` (el pipeline del PHP original no corre acá); `coach-web/piezas/calendario.js` está al día, el saludo y `planes.js`/`app.js` no.

## 2d-sexies) Bici atada al análisis, sin bici no se analiza, logs de pilotos (20/10/2026)
- Cada bajada guarda con qué bici se analizó (`perfilId`, `perfilNubeId`, `perfilNombre` en su configuración). Al abrir una bajada guardada (navegador, nube o .sfb) se vuelve a activar esa bici; entre dispositivos se busca por el id de la cuenta. Las bajadas viejas sin ese dato usan la bici activa.
- En Recorte el selector de bici ya no tiene «sin perfil»: la elegida ahí es la de la bajada y la del Mantenimiento.
- Sin bici propia no se entra al análisis (`piezas/sin-bici.js`): aviso con botón a Perfil. Un entrenador sin bici ve además «Ver lo que me mandaron» (Recibidos de Coach). Si no se puede consultar la cuenta (sin conexión) no se bloquea.
- «Desde la nube» lista solo las bajadas propias (la política `bajada_ver` de la base deja VER las de pilotos con permiso; ahora no se listan ahí). Cada bajada tiene «Al profe» (usa el mismo envío de siempre). Un entrenador ve arriba «Enviadas por mis pilotos» (de `coach_envios_listar`), que se abren en Coach.
- Coach · Nuevo plan: «Días de entrenamiento» (como viene / todos los días / día por medio / elegir días). Reparte las sesiones de cada semana del plan armado o de «Mis planes tipo» en esos días (`Biblioteca.generarPlan/generarPropio(..., frec)`); las carreras siempre entran.

## 2d-septies) Peso extra por clima + estado de la pista (20/10/2026)
Antes: +2,5 kg fijo con lluvia. Ahora (`parchar_peso_clima` en `parche_defaults.py`): lluvia + húmedo 0,5 · mojado 1,5 · barroso 3,5; nieve + húmedo 0,5 · mojado 1,5 · barroso 2,5; nublado + mojado 1 · barroso 1,5. Cualquier otra combinación suma 0. Es una estimación, no una pesada. La lista de estado de pista no cambió.

## 2d-octies) Entrenador abre en el análisis lo que le mandan; sin WiFi (20/10/2026)
- «Desde la nube» → «Enviadas por mis pilotos»: al tocar un envío con datos del Sender se baja el .sfpb de Coach (función `archivos-coach`, acción `url`, que ya verifica el permiso), se guarda en este navegador con el formato de respaldo y se abre en el análisis, con todos los gráficos. Las marcas y comentarios siguen en Coach. Envíos solo-video se ven en Coach. Solo aparecen los que el piloto mandó (`coach_envios_listar`), no todas sus bajadas.
- «Al profe» (mandar a Coach) está en cada bajada de la nube.
- Abrir/descargar por WiFi del datalogger es solo de la app: oculto en la web (`#btnImportarWifi`, `#btnConectarWifi`).
- (20/10, ajuste) «Enviadas por mis pilotos» lista SOLO envíos de datos sin video (`soloDatos`): los videos, con o sin datos, ya se analizan en Coach. La lista ya no se duplica al volver a entrar, y al abrir una bajada se ve el velo «Bajando… un momento» hasta que abre.
- Sin verificar con datos reales: que el almacenamiento (R2) permita leer el archivo desde el origen de Bike (CORS de GET).

## 2d-nonies) Menú de Admin, sesión «hecha» y tarjeta de hoy (20/10/2026)
- `/admin.html`: el menú muestra también Análisis y Mensajes (mismas reglas que el sitio: acceso Sender; entrenador vinculado o rol entrenador con Coach). Antes solo Inicio, Perfil, Admin y Salir.
- Coach, «Tu entrenamiento de hoy»: al guardar una sesión la tarjeta desaparecía (la tarjeta nueva conservaba la clase `entra` y quedaba invisible sin su animación). Corregido en `planes.js`.
- Una sesión ya guardada como «hecha» se abre bloqueada (botones, esfuerzo y nota); solo «Todavía no» la reabre y habilita Guardar. El bloqueo es de la pantalla: la base (`coach_tarea_marcar`) no lo exige.
- «Sacar foto» en el Perfil de Bike se oculta a propósito en equipos con mouse (`capture` no abre cámara en escritorio); aparece en el celular.

## 2d-decies) Historial de entrenamiento del piloto + «no la hice» (20/10/2026)
- Coach · ficha del piloto (con cuenta vinculada): sección «Historial de entrenamiento» (`js/historial-piloto.js`, sin cambios en la base: usa `coach_planes_listar(p_piloto)` + `coach_plan_ver`, hasta 24 planes). Resumen (hechas, cumplimiento, esfuerzo promedio, ¿le cuesta menos?), gráfico semanal (sesiones hechas / no hechas / sin marcar + esfuerzo percibido vs intensidad planificada), ejercicios (veces, esfuerzo promedio, tendencia y mini gráfico), planes anteriores y línea de tiempo con notas.
- El esfuerzo es por sesión (lo marca el piloto); el de un ejercicio es el promedio de las sesiones hechas donde aparece. Tendencia = primera mitad vs segunda mitad (mínimo 4 sesiones con esfuerzo; ±0,5 puntos).
- «No la hice» se comporta igual que «Sí, la hice»: queda guardada y bloqueada; solo «Todavía no» la reabre.

## 2d-undecies) Coach · Inicio: atención con tus pilotos (20/10/2026)
`js/atencion-pilotos.js`, sin cambios en la base (`coach_calendario_datos` + `coach_plan_ver` + `coach_pilotos_listar`). Tarjeta arriba del Inicio del entrenador:
- Aviso «lleva X días sin responder»: sesiones vencidas sin marcar, desde la última que marcó, a partir de 3 días; solo cuentan los días con sesiones cargadas y sin aviso del piloto en su calendario (fecha con «no entreno», viaje o visita médica).
- Aviso «esfuerzo por encima de lo planificado»: esfuerzo percibido − intensidad ≥ 2 puntos en las dos últimas semanas con datos.
- Tabla «Cómo vienen»: cumplimiento 4 semanas, esfuerzo, evolución, última respuesta y estado de cada piloto; se abre su ficha.
- `coach-web/piezas/app.js` no se actualizó: el engarce en `app.js` (Inicio) y `index.html` está hecho directo sobre `SendFlow_Coach_Web`.

## 2d-duodecies) Resumen de pilotos en la base, menú «Coach» en Bike, diario de sensaciones, Coach reconstruible (20/10/2026)
- **Base (coach_v25.sql, aplicada):** `coach_resumen_pilotos(p_dias)` calcula en la base, en una sola consulta, lo que mira el Inicio de Coach (sin responder, cumplimiento, esfuerzo, tendencia, semanas). Solo entrenadores; solo sus pilotos con vínculo activo. `atencion-pilotos.js` la usa y, si todavía no existe, cae al camino anterior.
- **Bike · menú:** botón «Coach» (salto rápido, como «Volver a Bike» en Coach) para quien tiene Coach como entrenador o es piloto con entrenador.
- **/analisis · Recorte:** «¿Qué sentiste en esta bajada?» (horquilla, shock, texto). Se guarda con la bajada (`config.sensaciones`), viaja a la nube / .sfb / entrenador y se ve en «Notas y resumen» junto a topes y SAG dinámico (sin veredicto automático). `piezas/sensaciones.js` + `parchar_sensaciones`.
- **Coach reconstruible:** la fuente de verdad es `SendFlow_Coach_Web/`. El generador (`coach-web/historico/`) quedó archivado: necesita el Coach original en PHP, que no está en el repo. Herramientas nuevas: `coach-web/verificar_coach.py` (revisión estática) y `publicar_rama.sh bike|coach` (arma la rama de descarga). Ver `coach-web/LEEME_COACH.md`.
- **Auditoría de espacio (solo lectura):** un envío a Coach no se copia al pasar a análisis (el análisis apunta al mismo archivo) y las devoluciones (dibujos, etiquetas) son JSON en la base, no archivos. El peso real es chico (bucket de R2: 49,29 MB). La «subida incompleta de 795 MB» del 11/10 era una fila vieja de una subida que R2 ya canceló sola (7 días) y no ocupa espacio. Hallazgos: 2 archivos sin referencia; las miniaturas viajan en base64 dentro de cada lista (22–79 KB cada una).

## 2d-terdecies) Uso en Admin, Cloudflare Web Analytics, grupos de pilotos y aviso de la sesión del día (20/10/2026)
- **Base (coach_v26_uso_grupos_aviso.sql, aplicada):** `admin_uso_resumen` (solo admin), tablas `coach_grupos` / `coach_grupo_miembros` + `coach_grupos_listar/guardar/borrar` y `coach_plan_a_grupo`, columnas de aviso en `notif_prefs` + `notif_prefs_push_guardar`, secreto en el Vault, `aviso_sesion_diaria_tomar`, cron `aviso-sesion-diaria` (cada hora). NOTA: en este proyecto las sentencias `DROP` y los bucles `FOR … LOOP` hacen que `apply_migration`/`execute_sql` se cuelguen: el SQL está escrito por conjuntos y sin DROP.
- **Admin · pestaña «Uso»** (`/admin.html`): cuentas, activas 7/30 días, vínculos, dispositivos con avisos, grupos, espacio, y 8 semanas de actividad (personas activas, bajadas, envíos al profe, sesiones marcadas, mensajes, análisis, planes, cuentas nuevas). Solo números agregados.
- **Cloudflare Web Analytics:** no requiere código; la CSP de Bike y Coach ya permitía `static.cloudflareinsights.com` y `cloudflareinsights.com`. Se activa en Cloudflare → Workers y Pages → (proyecto) → Metrics → Web Analytics → Enable (en los dos proyectos).
- **Coach · Grupos** (`js/grupos.js`): Pilotos → Grupos (crear/editar/borrar; online, presencial o mixto; pilotos con cuenta vinculada); en «Nuevo plan», «Alumno» también lista los grupos (el plan se crea para todos); en un plan, «Copiar a un grupo». Cada copia es independiente y arranca sin marcar.
- **Aviso push con la sesión del día:** solo si el piloto lo prende en Perfil («Aviso con mi sesión del día», hora 05–12, en `avisos-email.js`, igual en Bike y Coach; si el dispositivo no tiene avisos activados, pide el permiso). Función de borde `aviso-diario` (sin verificación JWT, protegida por secreto del Vault; usa las claves VAPID de avisos-coach). Solo push, nunca mail; solo días con sesión pendiente; no avisa si el piloto marcó en su calendario «no entreno», viaje o visita médica. Un aviso por día.

## 2d-quaterdecies) Planes presenciales, botón «Ir a Coach» (21/10/2026)
- **Bike · menú:** «Ir a Coach →» en cian, antes de «Salir», con el mismo estilo que «← Volver a Bike» de Coach.
- **Coach · Nuevo plan:** «Modalidad» Online / Presencial. Presencial: días de clase, horario, duración y lugar. Crea una clase en cada día elegido entre las fechas del plan (o reparte un plan armado en esos días como clases). Funciona con un piloto o con un grupo (el plan se copia a todos). Cada sesión tiene modalidad, hora y lugar y se pueden editar una por una (en «Sesión»); se ven en el plan, en «Tu entrenamiento de hoy» y en Bike.
- **Aviso push:** el piloto, en su Perfil, puede prender «Recordarme las clases presenciales» (2 horas antes, con horario y lugar); el aviso de «la sesión del día» también muestra horario y lugar. Siguen siendo opcionales y solo push. Función de borde `aviso-diario` v2.
- **Base (coach_v27_presencial.sql, aplicada):** `tareas_plan.modalidad/hora/lugar`, `notif_prefs.push_clase`, `notif_prefs_clase_guardar`, `aviso_clase_tomar` y las funciones de sesiones actualizadas.
- Arreglo: en el formulario de plan los campos con `hidden` se veían igual (CSS); ahora se ocultan.

## 2e) Ayuda para medir el SAG y frases de velocidad (ideas tomadas de la revisión de sagly.at; textos propios)

El SAG es un dato que se carga **antes** de analizar una bajada; el semáforo solo confirma si está en zona. Por eso la calculadora **no** va en el popup del semáforo (ahí quedó igual que antes):
- **Calculadora de SAG en el perfil de bici** (`piezas/calculos-bici.js`): botón «Calcular» junto a cada campo «SAG medido (%)» (`pfSagMedidoH/S`). Abre una ventanita con el recorrido (toma `pfRecH` / `pfSensS`) y cuánto se corrió el o-ring → % de SAG; «Usar este valor» lo escribe en el campo (entero, como el resto del perfil). Incluye «Cómo medir el SAG» (4 pasos). No toca ninguna bajada ya analizada. La app no la tiene.
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
- `deploy-coach-web`: lo mismo para `SendFlow_Coach_Web` (el sitio Coach). Sin historial; no hacer merge de ella.
  Hay que actualizarla (copiar el sitio) cada vez que cambie.

## 2d-quindecies) Confirmar el lugar de las clases presenciales (20/10/2026)
Solo web (Coach y el mensaje «Hoy» de Bike); la app no se toca. Requiere `nube/coach_v28_confirmar_lugar.sql` (ya aplicado) y la edge function `aviso-diario` v3 (ya desplegada).
- El lugar que se define en el plan es el **lugar base**. Cada clase nace «sin confirmar» y los pilotos **no reciben aviso con lugar** hasta que el entrenador confirma.
- Inicio de Coach: tarjeta «Confirmá el lugar de tus clases» con las clases de hoy a +2 días: **Se mantiene** o **Cambiar lugar** (con opción «cambiar también las próximas clases que estaban en ese lugar»). Al confirmar sale el push a los pilotos que prendieron «Recordarme las clases presenciales»: «Clase confirmada» o «¡Cambio de lugar!».
- Push al entrenador (opt-out, Perfil → «Avisarme para confirmar el lugar de las clases»): a las 18 h del día anterior y a las 8 h del mismo día si sigue sin confirmar. El horario es el local del entrenador (zona de `notif_prefs`).
- Si el entrenador cambia lugar, horario o día de una clase ya confirmada, vuelve a «sin confirmar». El recordatorio de 2 horas antes solo sale si el lugar está confirmado; el aviso de la sesión del día dice «lugar a confirmar».
- Chips «lugar a confirmar» / «Cambió el lugar» en sesiones del plan, detalle y en la línea «Hoy» de Bike. Archivos: `SendFlow_Coach_Web/js/clases-confirmar.js` (nuevo), `planes.js`, `app.js`, `avisos-email.js` (idéntico en ambos sitios), `css/coach.css`, `SendFlow_Bike_Web/js/app.js`.
- Probado en la base con transacción revertida (por confirmar → confirmar con cambio → aviso con `cambio:true` → segundo aviso vacío). **No probado:** entrega real del push y la tarjeta con una sesión real.

## 2d-sexdecies) Asistencia a las clases presenciales (21/10/2026)
Solo web; requiere `nube/coach_v29_asistencia.sql` (aplicado) y `aviso-diario` v4 (desplegada). La app no se toca.
- Piloto (opt-in aparte, Perfil → «Preguntarme si voy a la clase», apagado por defecto): 6 h antes de la clase, y nunca antes de las 8:00 locales, push «¿Vas a la clase de hoy?». Responde «Voy» / «No voy» en la tarjeta del Inicio de Coach (puede cambiarla hasta que empiece; tocar de nuevo la quita). Solo clases con lugar ya confirmado.
- Entrenador (Perfil → «Avisarme quién va a cada clase», prendido por defecto): un solo push 2 h antes con «van X · no van Y · sin responder Z», y tarjeta «Quién va a la clase» en su Inicio con los nombres. «Sin responder» incluye a quien no tiene los avisos prendidos. Si a ningún piloto se le preguntó ni respondió, no se manda resumen.
- Si se cambia el día o el horario de la clase, se borran las respuestas.
- iPhone: el push solo funciona con el sitio agregado a la pantalla de inicio (Compartir → Agregar a inicio), sea Coach o Bike. Los avisos de planes/clases abren Coach; para pilotos conviene instalar Coach. Sin push, el piloto igual ve y responde la tarjeta al entrar.
- Archivos: `SendFlow_Coach_Web/js/asistencia-clase.js` (nuevo), `app.js`, `index.html`, `avisos-email.js` (idéntico en ambos sitios).
- Probado en la base con transacción revertida (pregunta única, responder, resumen único). **No probado:** push real ni la tarjeta con datos reales.

## 2d-septdecies) Ventana única «Subir archivos» y etiquetas (Coach v59, 21/10/2026)
Solo Coach (la app no se toca). Detalle de producto en el doc 01 (C61, C62); SQL `nube/coach_v30_etiquetas_archivo.sql` (corrido en producción el 21/10). Una sola ventana para subir video, foto, documento o (piloto) una bajada sola, con Motivo (uno) y Situación (varias), todo opcional; sin «Analizarlo ahora» (el análisis se abre desde Archivos → Analizar sobre el mismo archivo). Archivos: filtro por situación. **Probado por Eric en producción el 21/10: funciona.** Pendiente de decisión: los botones «Nuevo análisis» de otras pantallas todavía suben directo, sin pasar por la biblioteca.

## 2d-octodecies) Respuestas rápidas del entrenador (Coach v60, 21/10/2026)
Solo Coach (la app no se toca). Archivos: `SendFlow_Coach_Web/js/respuestas-rapidas.js` (nuevo), `estudio.js` (pestaña Mensajes), `app.js` (página Mensajes), `index.html`, `css/coach.css`. Botones con frases guardadas arriba de la caja de escribir; tocar uno escribe la frase (no envía); «{nombre}» = nombre del piloto; editor propio (máx. 12 frases, 7 de fábrica). Se guardan en el navegador (localStorage por usuario): cambian de un dispositivo a otro. Sin SQL. No probado en producción.

## 2d-novodecies) Ajustes del 21/10 (Coach v61, Bike)
- **Coach:** se quitó «Nuevo análisis» de la ficha del piloto (no hay página de análisis en el menú; los análisis se abren desde Archivos → Analizar). El botón de la lista Análisis queda solo en esa pantalla, que no tiene entrada de menú.
- **Calculadora de presión (Bike y /analisis, `calculos-bici.js`):** la presión ahora crece con el peso elevado a 0,65 (referencia 94 kg) en vez de linealmente. Caso real de Eric (120 kg + 27 kg bici + 4 kg equipo, DHF, seco suelto, DH): antes 29/35 psi, ahora 24/30; la que usa Eric es 23/29. Una sola medición real; falta contrastar con otros pesos.

## 2d-vicies) Clip en el mensaje y resumen semanal por mail (Coach v61, 21/10/2026)
Solo web; la app no se toca. SQL aplicado en producción: `nube/coach_v31_clip_comentario.sql`, `nube/coach_v32_resumen_semanal.sql`; edge function `aviso-diario` v5.
- **Clip:** Estudio → Mensajes (entrenador): «Inicio aquí» / «Fin aquí» sobre el video, hasta 30 s; la burbuja reproduce solo ese tramo. En la página Mensajes el enlace abre el Estudio con `?t=&fin=`. Archivos: `estudio.js`, `app.js`, `api.js`, `css/coach.css`.
- **Resumen semanal:** lunes desde las 8:00 de la zona del entrenador, una vez por semana; mail por Resend. Toggle en Perfil (`avisos-email.js`, idéntico en Bike y Coach). **No probado el envío real** del mail.

## 2d-unvicies) Pilotos: secciones y tarjetas de grupo (Coach v62, 21/10/2026)
Solo Coach. Pilotos → título de sección «Pilotos» (cian, como «Grupos») y tarjeta «+ Agregar piloto» al final de la lista (se quitó el botón de arriba). Las tarjetas de grupo muestran el nombre más grande y los avatares de sus pilotos (hasta 5 y «+N»). Sin foto propia del grupo (haría falta una columna nueva). Archivos: `app.js`, `grupos.js`, `css/coach.css`.

## 2d-duovicies) Mensajes directos (Coach v63, 21/10/2026)
Solo Coach. SQL aplicado: `nube/coach_v33_mensajes_directos.sql`. Mensajes → **Nuevo mensaje** → lista de pilotos con cuenta → conversación directa (sin abrir análisis). Una por piloto; no se lista como análisis. Si alguien abre `/analisis/<id>` de una directa, `estudio.js` lo manda a `/mensajes/<id>` (así los enlaces de los avisos caen bien). Archivos: `app.js`, `api.js`, `estudio.js`. El aviso por mail/push al piloto dice «comentario en Mensajes directos» (texto genérico de `avisos-coach`). No probado en producción.

## 2d-tricies) Campos de fecha dd/mm/aaaa en Coach (v64, 21/10/2026)
Los `<input type="date">` muestran el formato del idioma del navegador (mm/dd/aaaa en un navegador en inglés) y la página no lo puede cambiar; las fechas escritas en texto ya estaban bien. Nuevo `SendFlow_Coach_Web/js/fecha-dmy.js`: cada campo de fecha (también los que aparecen después, en ventanas) pasa a un campo de texto **dd/mm/aaaa** con máscara, validación de fechas inexistentes (31/02) y botón de calendario; el campo original queda escondido con el valor AAAA-MM-DD, así el resto del código no cambió. Probado con Chromium en inglés (muestra, escribe, rechaza 31/02, campo creado después). No aplica a Bike: Bike no tiene estos formularios de fecha en el mismo formato (sin revisar uno por uno).

## 2d-untricies) Campos de fecha dd/mm/aaaa en Bike (21/10/2026)
Mismo módulo que Coach (`SendFlow_Bike_Web/js/fecha-dmy.js`, sin estilos en línea por la CSP; reglas `.fecha-dmy*` en `css/sitio.css`). Cargado en `index.html` (y sus copias `perfil`, `mensajes`, `bajadas`). Cubre la fecha de nacimiento del perfil y las fechas del formulario de agenda del chat (`agenda-chat.js`, campos creados al abrir). `/analisis` no tiene campos de fecha. Probado solo el módulo (en Coach, Chromium en inglés); la página de Bike sin abrir.
