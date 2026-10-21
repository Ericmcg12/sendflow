# SendFlow — 03 · Recorridos (App flow)

> **Versión 1.0 · 10/10/2026.** El camino de cada usuario, pantalla por pantalla: qué viene después, qué pasa al enviar un formulario y a dónde cae cuando algo sale mal. Cubre el Sender, la app SendFlow Bike, `sendflow.bike`, `sendflow.coach` y SendFlow Lab.
> Convención: **→** = lleva a · **[botón]** · ⚠ = qué pasa si falla.
> Este es el **comportamiento requerido**. La navegación principal ya funciona así; algunos mensajes de error y aterrizajes (⚠) todavía no están implementados tal cual: se revisan y corrigen contra este documento en la FASE 3 del plan (doc 06).

---

## 1. Sender en la bici (recorrido físico)

1. Enchufar reglas/sensores a los conectores y **tocar Power** → el Sender prende; la tira muestra el estado de cada sensor, GPS y SD.
   ⚠ Sensor desconectado o cable cortado → LED de ese sensor en rojo. SD con error → LED de SD en rojo, no graba.
2. **En boxes: RUN 4 s** → se abre la ventana WiFi + BLE (tira en azul). La app se conecta (ver §2.3).
3. Al tocar RUN para grabar se cierra la ventana de boxes → WiFi apagado. BLE queda prendido solo si hay un periférico habilitado con MAC guardada.
4. **Arriba de la pista: toque RUN** → graba (patrón de grabación en la tira). **Abajo: toque RUN** → cierra la bajada `.sfb` y queda en espera.
   ⚠ Si el BLE no conectó, graba igual con esa columna vacía. Si la SD no da abasto o se cuelga un bus, anota un EVENTO y sigue.
5. Quieto 10 s → **auto-pausa** (FASE 2). Quieto 10 min → **auto-apagado** (aviso 30 s antes; cierra la bajada).
6. **Power 2 s** → cierra la bajada y apaga. **Power 4 s** → apagado forzado (solo si se colgó).
7. **RUN 10 s** → reinicio limpio. **RUN 15 s** → reset de fábrica (borra la config de boxes).
8. De vuelta en boxes: **RUN 4 s** y descargar las bajadas desde la app.

---

## 2. SendFlow Bike — app

### 2.1 Mapa de pantallas

```
Bienvenida ─┬─ [IMPORTAR BAJADA] → Importar ─┬─ Desde archivo (.sfb/.csv) ─────────┐
            │                                ├─ Bajadas guardadas → Guardadas ──────┤
            │                                └─ Desde el datalogger → Archivos del ─┤
            │                                                          Logger       │
            ├─ [SENDER] → modal Conectar a Sender (pasos 1–4)                       │
            ├─ [PERFIL] → Perfiles (lista / nuevo / editar)                         │
            ├─ [CONFIGURACIÓN] → Configuración                                      │
            └─ "generar pista de demostración" ─────────────────────────────────────┤
                                                                                    ▼
                                                    Recorte (perfil, condiciones, SAG, recorte)
                                                                                    │ [ANALIZAR]
                                                                                    ▼
                         Suite: PANEL · LÍNEAS · DINÁMICA · EVENTOS · (TMD) · TRACK GPS · AJUSTES · TALLER
                              │ barra: [Guardar] [Comparar] [Video] [Exportar CSV]
                              ├─ [Guardar] → modal Notas (resumen + nota obligatoria) → [GUARDAR] → Guardadas
                              ├─ [Comparar] → Comparación (elegir bajada B)
                              └─ [Video] → página Video (pantalla completa)
```

Todas las salidas son **VOLVER** (flecha), nunca X. Perfiles vuelve a donde se entró (Configuración o Bienvenida). El botón "atrás" de Android equivale a VOLVER.

### 2.2 Abrir y analizar una bajada
1. **Bienvenida → [IMPORTAR BAJADA] → Importar.** Elegir origen:
   - *Desde archivo*: selector del sistema → lee el archivo como binario; empieza con `SFBD` = `.sfb`, si no CSV.
   - *Guardadas*: lista → tocar una → abre en la Suite con sus notas en solo lectura, cortes, marcadores y video sincronizado.
   - *Desde el datalogger*: Archivos del Logger (lista `/archivos`) → tocar → descarga con barra de progreso.
   ⚠ Archivo dañado o de otro tipo → aviso en pantalla y se queda en Importar. ⚠ Sin conexión con el Sender → "No se pudo conectar con Sender" con la IP usada y botón para reintentar.
2. **Recorte**: elegir perfil (si no hay, ofrece crearlo), clima, estado de pista, nombre de pista, SAG medido, recortar inicio/fin. Los avisos de lectura (bloques perdidos, fallas, corte de energía, auto-apagado) aparecen en la caja de avisos.
   ⚠ Sin perfil → se puede analizar igual con valores por defecto; las tarjetas que necesitan datos del perfil dicen qué falta.
3. **[ANALIZAR]** → Suite en PANEL.
4. **[Guardar]** → modal **Notas** con el resumen (Piloto y bici · Pista y condiciones · Horquilla · Shock) → escribir la nota (obligatoria) → **[GUARDAR]** → se guarda en IndexedDB y queda en solo lectura.
   ⚠ Nota vacía → el botón no guarda y marca el campo. ⚠ Error de almacenamiento (sin espacio) → aviso rojo; la bajada sigue abierta para exportar CSV.
5. Desde Notas: **[EXPORTAR PDF]** → diálogo de impresión del sistema → "Guardar como PDF".

### 2.3 Conectar a Sender (modal en 4 pasos)
1. **WiFi**: conectar el celular a la red del Sender (o a la del router) y escribir la IP → [PROBAR] (`GET /archivos`).
   ⚠ Falla → mensaje con la causa (`errorDeSender()`) y se queda en el paso 1.
2. **Perfil**: elegir el perfil → [ENVIAR] (`POST /configurar` con la hora del celular).
3. **Bajadas**: lista del Sender → descargar.
4. **SAG EN VIVO** (modal) → [SIN PESO] referencia, [MEDIR] 3 s, [USAR ESTE SAG] carga el SAG en el modal y en Recorte. Bloque REPARTO DE PESO → [CALIBRAR REPARTO].
   ⚠ `/en_vivo` no responde → "El Sender no responde" y se detiene la lectura.

**Configuración → DISPOSITIVO** (modal): nombre de red, contraseña, BLE (on/off), muestreo, mapeo de conectores, auto-pausa → [GUARDAR] guarda local siempre y envía `POST /dispositivo` si hay conexión. Botones [BUSCAR SENSORES CERCANOS], [OLVIDAR …], [RECALIBRAR CERO]. [FORMATEAR] y [RESET DE FÁBRICA] piden confirmación.
⚠ Sin conexión → "Guardado en este dispositivo; se enviará cuando conectes".

### 2.4 Configuración
Perfiles · Carpeta de guardado · Curva de leverage por defecto · Mapa offline (radio y detalle con peso estimado → descargar) · Respaldo de datos (EXPORTAR TODO `.sfdb` / importar) · **SendFlow nube** · Dispositivo. *(La pantalla vieja "SendFlow Coach" que conectaba al servidor PHP se saca en FASE 3; su función pasa a "SendFlow nube".)*

### 2.5 SendFlow nube (opcional, con señal)
1. **Configuración → SENDFLOW NUBE** → ingresar email y contraseña de la cuenta de `sendflow.bike`.
   ⚠ Credenciales mal → "Email o contraseña incorrectos". ⚠ Cuenta no aprobada → "Tu cuenta todavía no está aprobada". ⚠ Sin producto Sender → "Tu cuenta no tiene Sender activo". ⚠ Sin señal → "Sin conexión. La app sigue funcionando igual."
2. Ya conectado: **[SUBIR BAJADAS]** (lista con casillas) · **[ENVIAR PERFILES]** · **[TRAER PERFILES]** (nunca pisa: saltea iguales, renombra los distintos) · **[DESCONECTAR]**.
3. En **Guardadas**, cada bajada tiene **[Enviar a mi entrenador]** (FASE 3): sube la bajada (y el video sincronizado si existe) y crea un envío para el entrenador.
   ⚠ Sesión vencida → se borra la sesión y vuelve al paso 1. ⚠ Corte a mitad de una subida → reintenta la parte; si no puede, la bajada queda marcada "sin subir".

---

## 3. `sendflow.bike` — sitio madre

### 3.1 Mapa
```
Bienvenida/Ingreso ──[Ingresar]──► ¿email confirmado? ──no──► "Confirmá tu email" (reenviar)
   │  [Crear cuenta] (captcha)              │ sí
   │  [¿Olvidaste tu contraseña?]           ▼
   │                                 ¿aprobada? ──no──► Cuenta pendiente de aprobación ([Volver a revisar] [Salir])
   │                                        │ sí
   ▼                                        ▼
 Recuperar ──mail──► Nueva contraseña ─► Inicio (hub) ─┬─ Analizar bajadas → /analisis
                                                      ├─ Mi nube → /analisis#nube
                                                      ├─ Panel de entrenador / Mi entrenamiento → sendflow.coach
                                                      ├─ SendFlow Lab → sendflowlab.com (FASE 7)
                                                      ├─ Invitaciones (Aceptar / Rechazar)
                                                      ├─ Perfil
                                                      └─ Administración → admin.html (solo admin)
```
Menú lateral en PC, barra inferior en celular: Inicio · Perfil · (Administración) · Salir.

### 3.2 Registro
1. **[Crear cuenta]**: nombre, email, contraseña (≥ 8), captcha → **[CREAR CUENTA]** → `registrar-cuenta`.
   ⚠ Captcha no resuelto o vencido → "Completá la verificación" y se reinicia el captcha. ⚠ Email ya registrado → "Ese email ya tiene cuenta. ¿Querés ingresar?". ⚠ Contraseña corta → marca el campo.
2. Éxito → pantalla "Te mandamos un mail para confirmar". El usuario confirma desde el mail → vuelve a `sendflow.bike`.
3. Al confirmar → la base avisa al admin por mail (`aprobar-cuenta`) con botón al panel.
4. El usuario ingresa → **Cuenta pendiente de aprobación** hasta que el admin la aprueba.

### 3.3 Ingreso y recuperación
- **[Ingresar]** → si aprobada → **Inicio**.
  ⚠ Datos mal → "Email o contraseña incorrectos" (sin decir cuál). ⚠ Muchos intentos → espera.
- **[¿Olvidaste tu contraseña?]** → email → mail con enlace → **Nueva contraseña** → Inicio.
  ⚠ Enlace vencido → vuelve a Recuperar con "El enlace venció, pedí otro".

### 3.4 Inicio (hub)
Tarjetas según **productos** y **rol**:
| Tarjeta | Aparece si | Lleva a |
|---|---|---|
| Mis bajadas | producto `sender` | `/analisis` |
| Mi nube (con contador "N bajadas · N perfiles") | producto `sender` | `/analisis#nube` |
| Panel de entrenador (oro) | rol entrenador + producto `coach` | `sendflow.coach/inicio`, ya con la sesión iniciada |
| Mi entrenamiento — mismo estilo que Mis bajadas / Mi nube (Bike v30): se toca entera, contador "N DEVOLUCIONES · N ESPERANDO" y una línea con lo de hoy del plan | producto `sender` + entrenador activo | Coach ya con la sesión iniciada: Devoluciones si hay algo nuevo, Mi plan si hay sesiones pendientes hoy, si no el Inicio |
| SendFlow Lab · Taller (azul) | rol taller + producto `taller` | `sendflowlab.com` |
| Ninguna | sin productos | Mensaje "Tu cuenta está aprobada pero no tiene productos asignados. Si ya compraste, escribinos." |

Una tarjeta de un sitio que todavía no está publicado se ve apagada con "PRÓXIMAMENTE".

**Mensajes** (menú de Bike, v23; aparece si sos alumno con entrenador o entrenador con Coach, con contador de no leídos): lista de conversaciones → la conversación al lado (celular: pantalla completa con [←]) → escribir → [Enviar] o Enter → mail de aviso al otro. [Ver el análisis] y el "0:12" de un mensaje abren el análisis en Coach (ya con la sesión). El contador "N MENSAJES" de Mi entrenamiento lleva acá.

**Pasar a Coach** (cualquier botón de Coach): "Abriendo Coach…" → Coach abre directo en esa pantalla, sin pedir mail ni contraseña. En Coach aparece **"Volver a Bike"** (en el menú; en el celular, arriba al lado de Salir). **Salir** en cualquiera de los dos cierra la sesión en los dos y termina en la bienvenida de `sendflow.bike`. ⚠ Si el pase falla → Coach se abre igual y dice el motivo (p. ej. "falta crear la función puente-coach en Supabase") y pide mail y contraseña.

**Invitación de entrenador** (caja arriba del hub): "X te invitó a ser tu entrenador" → **[Aceptar]** → vuelve a cargar el inicio con "Mi entrenamiento". **[Rechazar]** → desaparece.
⚠ Sin Sender → "Para entrenar con un profe necesitás tener Sender activo". ⚠ Suscripción del entrenador vencida → "La suscripción de tu entrenador todavía no está activa". ⚠ Falla al cargar → error en rojo (nunca en silencio).

### 3.5 Perfil
Datos del piloto (nombre, disciplina, nivel, categoría, peso, bici — la lista de bicis sale de los perfiles subidos desde la app) → **[GUARDAR]** → "Guardado". Contraseña: actual + nueva → **[CAMBIAR]**. ⚠ Error → mensaje en rojo bajo el bloque.

### 3.6 `/analisis` (SendFlow Bike web)
- Entrada solo con sesión (`modo-web-gate.js`). ⚠ Sin sesión → vuelve al ingreso de `sendflow.bike` y después regresa a `/analisis`. ⚠ Sin producto Sender → vuelve al Inicio.
- Mismo recorrido que la app desde Importar (§2.2) sin "Desde el datalogger". Bienvenida con [IMPORTAR BAJADA], [PERFIL] y el demo.
- **Mi nube** (`#nube`): lista de bajadas subidas → tocar → baja el `.sfdb` y lo importa → Guardadas/Recorte. **Perfiles** (`#perfiles`): elegir, crear y [MANDAR A LA APP].
- Track GPS baja solo el mapa de la zona del recorrido (+700 m) y lo reutiliza.
  ⚠ MapTiler no responde → la traza se dibuja igual sobre fondo liso.

### 3.7 Administración (`admin.html`, solo admin)
Lista de cuentas (nuevas primero) → en cada tarjeta: casillas **Aprobada**, **Rol** (piloto/entrenador/taller), **Productos** (sender/coach/taller) → **[GUARDAR]**; **[RESETEAR CONTRASEÑA]** (manda mail); **[ELIMINAR]** (confirmación). `aprobar.html` es el destino del botón del mail al admin.
⚠ No es admin → pantalla "Sin acceso" con botón al Inicio. ⚠ Error de la función → mensaje en la tarjeta.

---

## 4. `sendflow.coach` — SendFlow Coach

### 4.1 Entrada
Ingreso **igual al de `sendflow.bike`** (sin menú; marca → formulario → presentación en celular): pestañas **Entrar / Crear cuenta**, ojo en la contraseña y **Olvidé mi contraseña**. Misma cuenta y misma base que `sendflow.bike`. **Se puede crear la cuenta en los dos sitios** (decisión 09–10/10: Coach tiene que poder sumar entrenadores externos, que no tienen Sender); el registro de Coach usa la misma función `registrar-cuenta`, con captcha, mail de confirmación y aprobación manual del admin. El enlace de recuperación vuelve a `sendflow.coach` y muestra **Nueva contraseña**.
⚠ Cuenta no aprobada → "Tu cuenta todavía no está aprobada". ⚠ Entrenador sin producto coach → "Esta función es para entrenadores con la suscripción de Coach activa". ⚠ Piloto sin entrenador aceptado → pantalla que explica cómo aceptar la invitación en `sendflow.bike`.

**Direcciones:** cada pantalla tiene su dirección limpia (`sendflow.coach/inicio`, `/recibidos`, `/pilotos`, `/piloto/<id>`, `/analisis/<id>`, `/bajadas`, `/perfil`); atrás/adelante del navegador funcionan y se puede recargar o compartir cualquier dirección.

**Subir un video** (entrenador: análisis nuevo · piloto: Enviar): elegir o arrastrar el video (cualquier largo) → aparece la vista previa → opcional **[Marcar inicio] / [Marcar fin] / [Video entero]** ("Se sube de 0:05 a 0:12") → [Subir] → "Achicando el video · x %" (no cerrar la página) → aviso "Video listo: 750 MB → 125 MB" → "Subiendo… x de y MB" → listo. ⚠ Navegador sin compresión → "se sube el original". ⚠ Falla el recorte → mensaje, no sube nada.

### 4.2 Entrenador
```
Inicio ─┬─ [Recibidos] → Recibidos ─► Recibido (ver video, nota) ─[Analizar]─► Estudio
        ├─ [Agregar piloto] → modal ficha
        └─ [Subir video propio] → modal subida ─► Estudio
Pilotos → Ficha del piloto ("Con cuenta" / "Sin cuenta aún", [Reenviar invitación], sus análisis, perfiles)
Análisis → lista ─► Estudio (dibujar, etiquetas, notas, voz, datos del Sender) — guarda solo
Bajadas → lista (propias + alumnos) ─► usar en un análisis
Perfil → datos, contraseña, Mis alumnos (nombre + email → [Enviar invitación]), perfiles de SendFlow
Salir
```
- **[Enviar invitación]** → `invitar-alumno` → crea la ficha y manda el mail → resultado escrito en pantalla.
  ⚠ Email inválido → marca el campo. ⚠ Falla del mail → mensaje con la causa; la ficha queda creada y se puede reenviar.
- **[Analizar]** en un recibido → crea la ficha si falta y abre el Estudio; el envío pasa a "analizado".
- **Estudio**: cada cambio se guarda 700 ms después ("Guardando… / Guardado"). ⚠ Sin conexión → "No se pudo guardar, reintentando"; no se pierde lo hecho mientras la pestaña siga abierta.
- **Comparar** ([Comparar] en el Estudio, o "Comparar con la anterior" en la barra del hilo): elegir el otro análisis (arriba los del mismo piloto) → dos videos lado a lado o **superpuestos** (transparencia de B). Para sincronizar: llevar cada barra al mismo momento → [Sincronizar acá] → desde ahí play, cuadro a cuadro (← →), velocidad (0,25× / 0,5× / 1×) y la barra de A mueven los dos; mover la barra de B los desincroniza. El desfase se recuerda en ese navegador.
- **Bajada que mandó el piloto**: al abrir el análisis la primera vez se carga sola en la pestaña Sender y se intenta sincronizar con la GoPro; Recibido avisa "Mandó la bajada …".
- **Filtro por tipo** (Recibidos y Análisis): botones Todos · Entrenamiento · Carrera · Antes de una carrera · Otro · Sin tipo, con cuántos hay; se recuerda mientras la pestaña esté abierta.
- **Lo del piloto**: Recibido muestra la nota y "Momentos que marcó X" (tocar → el video salta). En el Estudio: marcas blancas en la línea de tiempo y pestaña **Mensajes** (nota, marcas, conversación; mensajes atados a un momento = punto azul). Tarjetas con "VISTO ✓ / SIN VER", "N MENSAJES NUEVOS", "N MARCAS DEL PILOTO". Contador en "Análisis" del menú.
- **Hilo de entrenamiento** (barra "Entrenamiento" arriba del video): rondas en orden — 1 Video original → 2 Corrección 1 → … — cada una con su veredicto (A CORREGIR / APROBADO ✓ / sin veredicto); tocar una abre esa ronda. Entrenador: **[Corregir de nuevo] / [Aprobado ✓]** (tocar el elegido lo quita) → después [Avisar al piloto] manda el mail con el veredicto. Piloto, en la última ronda no aprobada: **[Mandar corrección]** → mismo formulario de envío, con "Corrección de … · ronda N", título "Corrección N: …" y va solo a ese entrenador → aparece en la barra como "Corrección enviada · esperando". En Recibidos la tarjeta dice "Corrección de …" y al analizarla queda como la ronda siguiente.
  ⚠ Ya hay una corrección esperando → no deja mandar otra (se puede retirar desde Enviar). ⚠ Ronda aprobada → no hay botón de corrección.
- **Mensajes (menú, entrenador y piloto)**: lista de conversaciones (nombre, análisis, último mensaje, hace cuánto, "sin leer") → tocar una → la conversación al lado (en el celular, a pantalla completa con [←]) → escribir → [Enviar] (mail de aviso con freno). [Abrir análisis] lleva al Estudio; el "0:12" de un mensaje abre el video en ese segundo. Se actualiza sola cada 25 s. El contador de "Mensajes" muestra lo sin leer; el de "Devoluciones" (piloto), las devoluciones sin ver.
- **Voz (Coach v28)**: con «Mostrar mi cámara» se ve tu imagen en vivo en el recuadro (mismo lugar que en la grabación) antes y durante la grabación. Las grabaciones se miran con **[Ver sobre el video]**: se reproducen encima del video de arriba; × o play del video vuelve. En el celular, tocar algo del panel (grabación, etiqueta, nota, mensaje) sube a la imagen.
- **Postura**: el entrenador mide con [Este cuadro] / [Analizar el recorte]; la medición se guarda con el análisis (Coach v29 + `coach_v14.sql`). El piloto ve la pestaña Postura en solo lectura (esqueleto sobre el video, ángulos, gráfico, sugeridas) solo si el entrenador midió algo; no puede medir. ⚠ Si el video no se puede leer, el aviso dice qué origen falta en el CORS del bucket.
- **[Avisar al piloto]** (arriba, si el piloto tiene cuenta): guarda lo pendiente y le manda el mail "tu devolución está lista". El subtítulo dice "Visto por el piloto ✓" o "Sin ver por el piloto".
- **Comentario de voz**: permiso de micrófono (y cámara opcional) → 3-2-1 → graba hasta 60 s → sube por partes. ⚠ Permiso negado → explica cómo habilitarlo.

### 4.3 Piloto / alumno
```
Inicio ─┬─ [Enviar un video] → Enviar
        ├─ [Ver devoluciones] → Devoluciones ─► análisis en solo lectura
        └─ [Mis bajadas] → Mis bajadas
Perfil → datos, contraseña, mis entrenadores ([Quitar]), perfiles de SendFlow
Salir
```
- **Enviar**: elegir entrenador, video (MP4/MOV, hasta 1 GB), título, pista, fecha, nota, bajada opcional → **[ENVIAR]** → barra de subida por partes (8 MB, reintento y reanudación) → "Enviado" → aparece en la lista con estado nuevo/visto/analizado; si está analizado, tocar abre la devolución.
- **¿Qué es este video?** (obligatorio al enviar): Entrenamiento · Carrera · Antes de una carrera · Otro — cada uno con su explicación; según lo elegido cambia la ayuda de "Qué querés que mire". ⚠ Sin elegir → "Elegí qué es el video". Una corrección viene con Entrenamiento elegido.
- **Bajada del Sender (opcional)** al enviar: elegir una de "Mis bajadas" o [Subir .sfb] (se lee para comprobar que es válida y se sube al enviar). ⚠ Archivo inválido → mensaje.
- **Solo la bajada, sin video** (v22): si no se elige video, la bajada pasa a ser obligatoria → se manda como "SOLO DATOS". El entrenador la abre en Recibido (resumen: duración, vel. máx., eventos) → [Analizar la bajada] → Estudio sin video. ⚠ Ni video ni bajada → "Elegí el video, una bajada del Sender, o las dos cosas."
- **Desde `/analisis`** (Bike v27): [Enviar al profe] (barra del análisis o bajada guardada) → elegir tipo, título, qué mirar (y entrenador si hay más de uno) → sube la bajada y crea el envío → "le llegó a …" → [Ver en Coach]. ⚠ Sin tipo → aviso. Sin entrenador vinculado el botón no aparece.
- **Marcar momentos al enviar**: con la vista previa, pausar → **[+ Marcar este momento]** → escribir qué pasó ("se me fue la rueda"). Marca sin texto no se manda; si se recorta, quedan las marcas del tramo y relativas a él.
- **Devolución** (solo lectura): al abrirla queda "vista" (la primera vez le llega un mail al entrenador). Pestaña **Mensajes**: lo que mandó (nota + marcas, tocables) y la conversación; escribir → [Enviar] (opcional "En este momento del video") → mail al entrenador (máx. 1 cada 15 min por análisis). Si hay mensajes nuevos, la devolución abre directo en Mensajes.
  ⚠ Sin entrenador vinculado → el botón no aparece y explica por qué. ⚠ Archivo que no es video o muy grande → mensaje antes de subir. ⚠ Corte de red → reanuda desde la última parte.

---

## 5. SendFlow Lab (FASE 7 — recorrido objetivo)

1. **En el banco** (app Linux, sin red): Inicio → Clientes (CRM) → Cliente → Componente → [Nuevo ensayo] → montaje guiado → ensayo automático → resultado (curvas) → [Informe PDF] → guardar en el historial.
2. **Datos del piloto**: [Importar] `.sfdb`/`.sftl` desde pendrive, o con red [Traer de la nube] el historial de esa suspensión (si el cliente autorizó al taller).
3. **Sincronizar**: con red, sube informes y servicios a la nube; el contador de service del piloto vuelve a cero.
4. **Portal `sendflowlab.com`**: ingreso con la cuenta del taller → Solicitudes de service (aceptar / en proceso / terminada) → Clientes → Historial.
⚠ Sin red → todo sigue en la base local y se sincroniza después.

---

## 6. A dónde cae el usuario cuando algo sale mal (resumen)

| Situación | Dónde cae | Qué ve |
|---|---|---|
| Sin sesión en cualquier página web | Ingreso del sitio | Formulario; después vuelve a donde iba. |
| Cuenta sin confirmar email | "Confirmá tu email" | Botón para reenviar el mail. |
| Cuenta sin aprobar | "Cuenta pendiente de aprobación" | Email de la cuenta, [Volver a revisar], [Salir]. |
| Sin el producto de esa sección | Inicio de `sendflow.bike` | Solo las tarjetas que le corresponden. |
| Enlace de mail vencido | Recuperar / ingreso | "El enlace venció, pedí otro". |
| Invitación vencida o usada | Inicio | "Invitación inválida o vencida". |
| Error de una función o de la base | Misma pantalla | Mensaje en rojo con la causa; nunca falla en silencio. |
| Sin conexión en la web | Misma pantalla | "Sin conexión" y reintento. |
| Sin conexión en la app | Misma pantalla | La app sigue funcionando; solo nube/mapas avisan. |
| El Sender no responde | Paso 1 del modal | Causa + IP usada + reintentar. |
| Archivo de bajada dañado | Importar | Aviso; si es parcial, abre con avisos en Recorte. |
| Página que no existe | Inicio del sitio | — |

## Plan de entrenamiento (Coach v26)
- **Entrenador** → Planes → [Nuevo plan] (alumno con cuenta, título, tipo, fechas, fases o [Sugerir fases]) → semana: [+] en cada día → sesión (tipo, título, duración, intensidad, ejercicios) · tocar una sesión la edita o borra · [Copiar a la semana siguiente] · [Plan y fases]. ⚠ Alumno sin cuenta vinculada → aviso.
- **Piloto** → Mi plan (o "Hoy en tu plan" en Inicio, o [Marcar lo de hoy] en la tarjeta de Bike) → tocar la sesión → ✓ Sí la hice (esfuerzo 1–10) / No la hice / Todavía no + nota → Guardar. Carreras y descansos no se marcan.
## Avisos push (Coach v25 / Bike v28)
- Perfil → Avisos (o la oferta en Inicio / la fila en el inicio de Bike) → [Activar] → permiso del navegador → listo. ⚠ Bloqueados → explica cómo habilitarlos · iPhone sin instalar → "Agregar a inicio" · servidor sin claves → "todavía no están configurados".

## Recorridos nuevos del 20–21/10/2026 (Coach v52–v58)
- **Saltos entre sitios.** Bike → menú → **Ir a Coach →** (cian, antes de Salir; solo entrenador con Coach o piloto con entrenador) abre Coach sin volver a ingresar. Coach → **← Volver a Bike**. Mismo estilo en los dos.
- **Inicio de Coach (entrenador)**: arriba aparecen, según lo que haya, *Confirmá el lugar de tus clases* (clases presenciales sin confirmar de hoy a +2 días), *Quién va a la clase* (hoy y mañana) y *Atención con tus pilotos* (avisos + tabla «Cómo vienen»); el orden entre ellas depende de cuál termina de cargar primero. Cada tarjeta se oculta sola si no tiene nada que mostrar.
- **Confirmar el lugar.** Tarjeta → por clase: [Se mantiene] confirma el lugar base y avisa a los pilotos; [Cambiar lugar] → ventana con el lugar nuevo y la casilla «cambiar también las próximas clases que estaban en ese lugar» → [Confirmar y avisar] («¡Cambio de lugar!»). Sin confirmar, los pilotos no reciben aviso con lugar y en el plan la clase dice «lugar a confirmar». Push al entrenador: 18 h del día anterior y 8 h del mismo día (se apaga en Perfil → «Avisarme para confirmar el lugar de las clases»).
- **Plan presencial.** Planes → Nuevo plan → *Modalidad* Presencial → días de clase, horario, duración y lugar base → alumno **o grupo** → crea una clase por día entre las fechas. Cada clase se edita en «Sesión» (modalidad, hora, lugar). Si cambia el lugar, el horario o el día de una clase ya confirmada, vuelve a «sin confirmar».
- **Asistencia (piloto).** Perfil → «Preguntarme si voy a la clase» (apagado por defecto) → 6 h antes de la clase (no antes de las 8:00) llega «¿Vas a la clase de hoy?» → Inicio de Coach → tarjeta **¿Vas a la clase?** → [Voy] / [No voy] (tocar de nuevo la elegida la quita; se puede cambiar hasta que empiece). Sin push, la tarjeta igual aparece al entrar. **Entrenador:** 2 h antes un solo push «van X · no van Y · sin responder Z» (Perfil → «Avisarme quién va a cada clase», prendido por defecto) y la tarjeta *Quién va a la clase* con nombres.
- **Grupos.** Pilotos → Grupos → [Nuevo grupo] (nombre, modalidad, pilotos con cuenta vinculada, notas). Nuevo plan → «Alumno» también lista los grupos. En un plan → [Copiar a un grupo].
- **Sesiones del piloto.** «Sí, la hice» y «No la hice» quedan guardadas y bloqueadas; solo [Todavía no] reabre. Nuevo plan → *Días de entrenamiento* (como viene / todos los días / día por medio / elegir días).
- **Ficha del piloto (entrenador).** Sección *Historial de entrenamiento* (resumen, gráfico semanal, ejercicios, planes anteriores, línea de tiempo).
- **Calendario.** Tocar un día abre una ventana con sus fechas y [Agregar fecha este día]; fechas dd/mm/aaaa; el entrenador puede cargar fechas propias y fechas en el calendario de un piloto.
- **Aviso con la sesión del día (piloto).** Perfil → «Aviso con mi sesión del día» + hora (05–12). Una clase sin confirmar dice «lugar a confirmar».
- **Bike Inicio.** Tarjeta *Mensajes*; saludo con el primer nombre en cian; la línea de hoy muestra «Presencial hora · lugar» (o «lugar a confirmar»).
- **`/analisis` (web).** Abre en Suspensión; la bici activa se elige sola y queda atada a cada bajada; sin bici propia no se entra (aviso → Perfil; el entrenador además ve «Ver lo que me mandaron»); Recorte → «¿Qué sentiste en esta bajada?»; Mi nube → solo bajadas propias + [Al profe]; el entrenador ve «Enviadas por mis pilotos» y las abre en el análisis. Sin WiFi del datalogger en la web.
- **Admin.** Menú completo (Inicio, Análisis, Mensajes, Perfil, Admin, Salir) y pestañas *Cuentas* / *Uso*.
