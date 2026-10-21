# SendFlow — Perfiles en la web, set-ups y modos de la app

> **v6 · 15/10/2026 (tarde).** **Parte web implementada** (ver §0). Propuesta de Claude ajustada con las decisiones de Eric del mismo día. **Nada implementado todavía.** La app no se toca hasta que Eric lo pida. Entra en la **FASE 3** del plan (`final/06_IMPLEMENTATION_PLAN.md`).

## 0. Estado (15/10/2026, tarde)
**Hecho (sin tocar la app):**
- `nube/perfiles_v1.sql`: tablas `bicis_piloto`, `setups_bici`, `setups_propuestos`, permisos del vínculo y funciones `perfiles_*`. Probado en Postgres local (`nube/pruebas/base_perfiles.sh` + `esc_perfiles.sql`), y se puede correr dos veces sin error.
- **Bike v33:**
  - Perfil → **Mis datos** (con edad, estilo y foto) / **Mis bicis** (Base, set-ups por pista, set-ups propuestos, traer bicis de un profesional, permiso al entrenador).
  - `/analisis` **solo elige** perfiles: los trae de la cuenta.
  - La bici se edita en `sendflow.bike/perfil#bici=<id>` con los mismos campos y claves que el formulario de la app (`js/editor-bici.js`, Bike v34). Antes (v33) se iba a `/analisis#bici=`; ese enlace ahora redirige a `/perfil`.
  - `/analisis` es solo para ver y analizar bajadas (ya analizadas o crudas del Sender): sin intro del logo, sin crear ni editar perfiles.
  - Disciplina en Mis datos: es solo una etiqueta (la usa Coach para mostrar). BMX Race lleva otro Sender, otros sensores y otro análisis: se sacó de la lista de Bike (v35, decisión de Eric). En Coach sigue.
  - Mis datos (v35, `perfiles_v2.sql`): nombre y apellido, fecha de nacimiento (calcula la edad), edad, peso, teléfono, disciplina, nivel, categoría, estilo, foto. Teléfono y fecha no bajan a la app; los ve el entrenador vinculado (lee la ficha de la cuenta).
- **Coach v43:** en la ficha del piloto aparecen sus bicis y set-ups. Con permiso del piloto, el entrenador crea y edita set-ups y resuelve propuestas.
- **Probado con Playwright** contra el Postgres local y un Supabase simulado: Bike en PC y celular, `/analisis` (editar bici, nueva bici, sincronizar) y Coach.

**Falta:**
- El parche de la app (§6). Hasta entonces, la app sigue usando `perfiles_equipo` y "Enviar perfiles".
- En Bike queda la sección "Perfiles subidos desde la app (versión anterior)", con el botón **Pasar a Mis bicis**.

**Orden de despliegue:**
1. Correr `perfiles_v1.sql` en Supabase.
2. Subir Bike v33.
3. Subir Coach v43.

Sin el SQL, Bike avisa "Falta correr perfiles_v1.sql" y Coach no muestra la sección nueva.

**Campos (código de la app, `leerPerfilCompleto` y `CAMPOS_SETUP`):**
- **Piloto:** `pesoPiloto`, `edad`, `estilo`, `nivel`, `foto`. En la web se guardan en `datos_piloto` como `peso`, `edad`, `estilo`, `nivelApp`, `foto`. El `nivel` web (Principiante…Élite) se traduce a principiante / medio / avanzado.
- **Set-up:** `presD`, `presT`, `presSuspH`, `presSuspS`, `clicksLsc/Hsc/Lsr/Hsr` H y S, `durezaResorteH/S`.
- **Bici:** todo lo demás (modelo, talle, geometría, TMD, frenos, suspensiones, recorridos, tipo de resorte, SAG medido, precarga, tokens, áreas de aire, cubiertas, insertos, leverage).

## 1. Decisiones de Eric (15/10)

1. **Los perfiles se crean en la web**, en Bike → Perfil (y en Coach → Perfil), con todos los datos que hoy tiene el perfil de la app. La web muestra por separado **Mis datos** (piloto) y **Mis bicis**, y se pueden cargar **varias bicis**.
2. **Perfil = datos del piloto + datos de una bici.** Si el piloto tiene varias bicis, se generan solos varios perfiles. En la app cada perfil se ve como **"Nombre · Bici"** (como hoy).
3. **`/analisis` solo elige perfiles**: no crea ni edita.
4. **Modos de la app: "Rider" y "Profesional".** El modo **sale del rol de la cuenta** (lo fija el admin).
   - **Rider**: ingresa con el mail de su cuenta web y **solo carga sus propios perfiles**. No crea perfiles en la app.
   - **Profesional** (entrenador, mecánico, taller/Lab): carga los perfiles de **todos los pilotos vinculados**. El profesional **sí tiene que tener cuenta**, pero **puede crear en la app perfiles de pilotos sin cuenta, como hasta ahora** (quedan locales en ese dispositivo).
   - Dentro de **Rider** hay dos variantes: **con cuenta** o **invitado** (sin cuenta; aprobado). El invitado sirve para una demo o un Sender prestado: perfiles locales como hoy, sin sincronizar.
5. **Mapas y perfiles siguen siendo dos acciones separadas.** Los mapas se bajan según la zona donde se va a probar; los perfiles, con el botón **Importar perfiles** que ya existe (ahora trae los de la cuenta). **No se hace un botón único "Preparar para pista".**
6. **Los perfiles que hoy están en el celular no importan** (son pruebas; la app todavía no es pública). **No hace falta migrarlos.**
7. **El set-up es de cada bajada**, con un set-up en curso que se arrastra de una bajada a la siguiente (§3).
8. **Base y set-ups con nombre se guardan solo en la web.** La app no los crea. Solo la bajada marcada como **"Bajada definitiva para esta pista"** manda su set-up a la web como propuesta, y el piloto decide ahí si lo guarda o lo borra (§3).
9. **En modo Profesional las bajadas son del perfil elegido (del rider), no del profesional.** El modo Profesional solo permite tener varios perfiles en un mismo dispositivo, para que analice alguien que sabe más que el piloto. Todo lo que sube (bajadas y propuestas de set-up) es **del rider**, así que nunca hay dos propuestas, una del profesional y otra del rider.
10. **Lo que no está registrado no sube a la web:**
    - **Invitado:** solo exporta el análisis a PDF y guarda la bajada en la app, en el dispositivo. Si después se registra, puede mandar esa bajada a analizar con un entrenador.
    - **Pilotos sin cuenta en modo Profesional:** se cargan con el botón **"Piloto nuevo"** y quedan en la **base del profesional** (§3 bis), para poder seguirlos después.

## 2. Qué es cada cosa

| Parte | Qué tiene | Dónde se edita | En la nube |
|---|---|---|---|
| **Datos del piloto** | Nombre, peso, nivel, estilo, foto, disciplina, categoría | Web (Mis datos) | `perfiles_usuario.datos_piloto` |
| **Datos de la bici** | Modelo, horquilla y shock, recorridos, leverage, geometría, áreas de aire calibradas, frenos, cubiertas, TMD | Web (Mis bicis) | `bicis_piloto` (una fila por bici; ver §4) |
| **Set-ups guardados de la bici** | **Base** + set-ups con nombre ("Setup 1 · Pista X", "Setup 2 · Pista Y"). Cada uno es presiones (cubiertas y suspensión), clicks LSC/HSC/LSR/HSR adelante y atrás, dureza de resorte: los mismos campos que hoy usa la app (`CAMPOS_SETUP`). | Web (dentro de cada bici); la app puede proponer una base nueva (§3) | `setups_bici` |
| **Set-up de la bajada** | Lo que tenía la bici en esa bajada | App, al analizar la bajada | Dentro de la bajada (`config`), como ya hace la app hoy |

**Perfil en la app** = Datos del piloto + Datos de la bici + lista de set-ups guardados de esa bici. Lo arma la nube y la app lo recibe con el formato de hoy, así **los cálculos de la app no cambian**.

## 3. Cómo funciona el set-up (definido por Eric, 15/10)

1. **En la web**, cada bici tiene su **Base** y, si quiere, set-ups con nombre por pista. **Solo ahí se crean y se editan.**
2. **En la app**, al elegir el perfil (piloto · bici), aparece un **desplegable de set-up**: *Base*, *Setup 1*, *Setup 2*… El elegido pasa a ser el **set-up en curso** de ese perfil.
3. **La app no cambia nada sola.** Los semáforos de AJUSTES dicen qué corregir, y el piloto hace los cambios **físicamente en la bici**, de a uno por vez y no necesariamente todos. Graba una bajada nueva con el Sender.
4. **Al pasar esa bajada a la app** para analizarla, la bajada arranca con el set-up en curso, y ahí el piloto **carga lo que de verdad cambió** (por ejemplo, "2 clicks menos de LSC atrás").
5. **Al guardar la bajada** con esos valores:
   - La bajada queda con **su** set-up para siempre. Al reabrirla se ve con qué se corrió, no lo que dice el perfil hoy.
   - Esos valores pasan a ser el **nuevo set-up en curso** de ese perfil, y la próxima bajada arranca desde ahí.
   - Esto pasa en **todas** las bajadas: los cambios de prueba quedan en cada bajada y en el set-up en curso, pero **no** se proponen a la web.
6. **"Bajada definitiva para esta pista":** es un botón en **Notas**, antes de guardar la bajada (y también en Bajadas, para marcar una ya guardada). Se usa cuando la bajada salió bien y el análisis no encontró nada para corregir, o solo cosas insignificantes. Solo esa bajada queda con su set-up **pendiente de registrar**, atado a ella: desde qué set-up salió, la pista y la bajada. Así en la web aparece **solo el set-up que importa**, no cada cambio de prueba.
   - Si se marca otra bajada definitiva para la misma pista y bici antes de sincronizar, **reemplaza** a la anterior: queda **una sola, la más nueva** (decidido por Eric, 15/10).
7. **Cuando la app se conecta** y exporta las bajadas a la nube, la bajada definitiva sube con su set-up como **set-up propuesto**.
8. **En la web**, al piloto le aparece el aviso **"Hay un set-up nuevo de tu <bici> para <pista>"**, con los valores comparados contra el set-up de origen y la bajada de la que salió. Lo ve en Mi perfil → bici → Set-ups, y también al importar las bajadas en `/analisis`. Opciones:
   - **Guardar como nueva base**.
   - **Guardar como set-up con nombre** (sugiere el nombre de la pista; el nombre es solo para mostrar, nunca decide un cálculo).
   - **Borrar** (descartar la propuesta).
9. En la app, desde la ficha del perfil, se puede **volver a la base** (o elegir otro set-up guardado) cuando los cambios no funcionaron. Eso solo cambia el set-up en curso; no crea ni borra nada en la web.
10. En **modo Profesional** la bajada y su propuesta son del **rider** (el perfil elegido), aunque las cargue el profesional. La propuesta le llega al rider; el profesional con `editar_setup` también puede resolverla desde Coach.

**Lo que ya existe en la app:** cada bajada guarda su `config` (con presiones y clicks), y el **historial de set-up** (`sendflow_historial_setup_v5`, campos `CAMPOS_SETUP`) arma una ficha por bajada con el set-up y cómo trabajó la suspensión. **Lo nuevo:** el set-up en curso por perfil, el desplegable de set-ups guardados y el botón "Bajada definitiva para esta pista" y la propuesta que sale de él.

## 3 bis. Pilotos sin cuenta en modo Profesional: "Piloto nuevo" (decidido 15/10)

**Problema:** al piloto con cuenta se lo identifica por el **mail** de su cuenta. Uno sin cuenta no tiene cómo registrarse.

**Solución:**
1. En la app, en modo Profesional, al cargar un perfil hay un botón **"Piloto nuevo"**: nombre (obligatorio), mail y teléfono (opcionales) y los datos del piloto y de la bici.
2. Se crea una **ficha de piloto en la base del profesional**: la misma tabla de fichas de Coach (`coach_pilotos`), que ya admite alumnos con o sin cuenta. La ficha tiene su propio `id` y **no depende del mail**.
   - Sin conexión, la ficha queda en el dispositivo y sube en la próxima conexión con el `id` que ya generó la app, así no se duplica.
3. Las bicis, set-ups y bajadas de ese piloto quedan **a nombre de la ficha, en la cuenta del profesional**. Con eso el profesional lo puede seguir: verlo en Coach, analizar sus bajadas, armarle un plan.
4. **Seguimiento:** desde Coach (o la app) el profesional completa el mail cuando lo tenga y manda la **invitación a registrarse**, que ya existe (`invitar-alumno`). Lo mismo sirve para invitarlo a ser su piloto y, cuando exista, para el cobro.
5. **Cuando el piloto se registra con ese mail y acepta la invitación,** la ficha se liga a su cuenta (como ya hace Coach con los alumnos). Al aceptar se le pregunta si quiere **traer a su cuenta** las bicis, set-ups y bajadas que cargó el profesional. Si dice que sí, pasan a ser suyas; si no, quedan solo del profesional.
6. **Mecánicos y taller (Lab)** usan el mismo mecanismo. Para el futuro hay que ver si `coach_pilotos` pasa a llamarse de forma general ("fichas de piloto del profesional"), sin cambiar cómo funciona.

**En la base (`perfiles_v1.sql`):**
- `bicis_piloto` lleva `dueno_id` (cuenta) **o** `ficha_id` (ficha del profesional), nunca los dos vacíos.
- Las bajadas de una ficha llevan `ficha_id`.
- Función `ficha_traspasar(ficha_id)`: la llama el piloto al aceptar; mueve bicis, set-ups y bajadas a su cuenta.

## 4. Cambios en la base (script `perfiles_v1.sql`, re-ejecutable)

- **`bicis_piloto`** (nueva, o renombre ordenado de `perfiles_equipo`):
  - `id`, `dueno_id` (el piloto; la bici es suya aunque la cargue un mecánico), `nombre` y `datos` jsonb (los datos de la bici).
  - `version`, `editado_en`, `editado_por` y `borrado_en` (borrado suave, para que la app sepa sacarla).
  - Se aprovecha la tabla `bicis` creada en v0 y sin uso, si encaja; si no, se elimina.
- **`setups_bici`** (nueva): `id`, `bici_id`, `nombre` ("Base", "Setup 1"…), `es_base`, `pista` (texto opcional, **solo para mostrar**; nunca decide un cálculo, regla del 2026-09), `valores` jsonb (campos de `CAMPOS_SETUP`), `version`, `editado_en`, `editado_por` y `origen` (web/app).
- **`setups_propuestos`** (nueva): `id`, `bici_id`, `desde_setup_id` (de qué set-up salió), `bajada_id` (la bajada definitiva), `pista` (solo para mostrar), `valores` jsonb, `creado_por`, `creado_en`, `estado` (pendiente / guardado_base / guardado_nombre / borrado), `resuelto_en`. La sube la app al exportar una bajada marcada como definitiva.
- **Datos del piloto:** `perfiles_usuario.datos_piloto`, que ya existe.
- **`vinculos.permisos`**, permisos nuevos:
  - `ver_perfiles` (por defecto sí con entrenador y taller).
  - `editar_setup` (el mecánico crea o cambia set-ups).
  - `editar_bici`.
  - `subir_bajadas` (el profesional sube bajadas a nombre del piloto).
- **`bajadas`:** `subido_por`, `definitiva` (bool), y el set-up de la bajada dentro de `metadatos` para poder verlo en la web sin abrir el archivo.
- **Funciones:**
  - `perfiles_mios()`: arma piloto + cada bici + sus set-ups.
  - `perfiles_de_mis_pilotos()`: lo mismo agrupado por piloto, solo con vínculo activo y `ver_perfiles`.
  - `bici_guardar` y `setup_guardar(id, valores, version_esperada)`: si alguien cambió antes, **no pisan** y devuelven los dos valores para elegir.
  - `setup_borrar`.
  - `setup_propuesto_resolver(id, accion, nombre)`: guardar como base, guardar con nombre o borrar.
- **Sin migración** de los perfiles actuales (decisión 15/10, punto 6). `perfiles_equipo` se borra o se deja de usar.

## 5. Web

**Bike → Perfil** (sendflow.bike):
- Modal **"Mi perfil"** con dos pestañas:
  - **Mis datos**.
  - **Mis bicis**: lista de bicis, con **+ Agregar bici**. Cada bici tiene una sección **Bici** (sus datos) y una sección **Set-ups** (Base + set-ups con nombre, con agregar, editar, renombrar y borrar). Arriba aparecen los **set-ups propuestos** que mandó la app, con Guardar como base / Guardar con nombre / Borrar; el inicio de Bike y `/analisis` avisan cuando hay alguno pendiente.
- El editor **reusa el formulario de perfil que ya tiene `/analisis`** (es el de la app, lo trae `construir_web.py`), así los campos son los mismos.
- **Exportar / Importar archivo** de perfiles, en el formato propio de SendFlow y compatible con el `sendflow_perfiles` actual. Al importar, cada dato cae en su pestaña: piloto en Mis datos, bici en Mis bicis y set-up en Base.
- En "Mi nube", la opción de mandar perfiles a la app se reemplaza por esto: lo que está en la cuenta es lo que baja la app.

**`/analisis`:** el selector de perfil solo elige (piloto · bici) y el set-up. Se sacan Crear, Editar y Borrar (se hace por `construir_web.py`).

**Coach → Perfil:**
- Datos del profesional.
- En cada alumno con vínculo activo, la pestaña **Bicis**: en solo lectura, o editable según `editar_bici` / `editar_setup`. Usa el mismo editor.

## 6. App (parche sobre una copia; no tocar el original)

1. **Modo según el rol** al ingresar: **Rider** (con cuenta, o **invitado** sin cuenta) o **Profesional**. Se ve en Configuración.
2. **Ingreso** con mail y contraseña de la web (ya existe el login de la nube en la app: `nube-core.js` / `nube-ui.js`).
3. **Importar perfiles** (el botón que ya existe), con conexión:
   - Rider: trae los suyos.
   - Profesional: trae los de sus pilotos vinculados.
   - Invitado: solo desde archivo.
   - De paso **sube lo pendiente**: las bajadas marcadas para subir y las **bajadas definitivas** con su set-up (que llegan a la web como propuestas).
   - **Invitado y pilotos sin cuenta** no suben nada.
4. **Mapas:** sin cambios. Se bajan aparte, por zona.
5. **Lista de perfiles:**
   - Rider: solo los suyos, sin "Nuevo perfil" (un aviso dice "Los perfiles se crean en sendflow.bike").
   - Profesional: agrupados por piloto, con buscador, **y con el botón "Piloto nuevo"** para pilotos sin cuenta (§3 bis).
   - Invitado: como hoy.
6. **Ficha del perfil:** piloto y bici en solo lectura (en Rider con cuenta y en los perfiles de la cuenta), con el **desplegable de set-up** y **Volver a la base**. **No hay** "Guardar como base" en la app: eso se decide en la web (§3).
7. **Set-up en curso** por perfil, guardado en el dispositivo (clave nueva en `ajustes`), y las **bajadas definitivas pendientes de subir** (una por pista y bici). Se arrastra de una bajada a la siguiente (§3).
8. **Sin conexión** todo funciona con lo importado. Que la sesión venza no bloquea el uso: solo pide ingresar de nuevo para sincronizar.
9. **Bajadas** guardan el `perfilId`, el piloto dueño y su set-up. En modo Profesional son **del rider** del perfil elegido y suben a su cuenta (con `subido_por` = el profesional) si el vínculo tiene `subir_bajadas`. **Botón "Bajada definitiva para esta pista"** en Notas y en Bajadas.
   - **Invitado:** exporta a PDF y guarda la bajada local; no sube nada. Si después se registra, puede mandar esas bajadas locales a un entrenador.
10. **Salir de la cuenta** pregunta si borrar del dispositivo los perfiles importados (privacidad en un celular de taller).
11. **Sacar la pantalla vieja "SendFlow Coach"** (conexión al Coach en PHP).
12. Sin cambiar `appId` ni el nombre de la base local (`sendflow_db`).
13. **Nombre visible "SendFlow Bike"** (título, `appName`, bienvenida, pie del PDF): la tarea de la FASE 1, hecha en este mismo parche.

## 7. Orden de trabajo

1. Separar en el código real de la app qué campo de `leerPerfilCompleto()` / `escribirPerfilCompleto()` es del **piloto**, cuál de la **bici** y cuál del **set-up** (`CAMPOS_SETUP`). Dejarlo escrito como tabla en este documento.
2. `perfiles_v1.sql`, probado en Postgres local (recrear `pg/`).
3. **Bike → Mi perfil** (Mis datos / Mis bicis / Set-ups) y `/analisis` solo elige.
4. **Coach → Perfil**: bicis y set-ups de los alumnos con permisos.
5. **Parche de la app**: modos, Importar perfiles desde la cuenta, desplegable de set-up, set-up en curso, botón "Bajada definitiva para esta pista" y envío como propuesta, volver a la base, nombre SendFlow Bike.
6. Prueba de punta a punta:
   - Eric crea 2 bicis con una base y un "Setup 1" en la web y las importa en la app.
   - Elige "Setup 1", graba una bajada, la pasa a la app y carga "2 clicks menos de LSC": la próxima bajada arranca con esos clicks, y no se propone nada a la web.
   - Otra bajada sale bien → la marca **definitiva para esta pista**.
   - "Volver a la base".
   - Al conectarse y exportar, en la web aparece "Hay un set-up nuevo": guardarlo como "Pista X" y verlo en el desplegable de la app al importar de nuevo.
   - Un entrenador ve la bici del alumno en su app y crea un piloto sin cuenta.

## 8. Decidido el 15/10 (11:40)
- Dos bajadas definitivas para la misma pista y bici: queda **una sola, la más nueva**.
- Pilotos sin cuenta del profesional: botón **"Piloto nuevo"** y ficha en la base del profesional (§3 bis).
- Tarjeta **"Mi entrenamiento"** de Bike en **oro**: hecho en **Bike v32** (15/10).

## 9. Pendiente de confirmar
- Al aceptar la invitación, ¿traer a la cuenta del piloto lo que cargó el profesional? (Propuesta: preguntarle al piloto.)

## 10. Para hacer luego: perfil profesional y entrenadores disponibles (pedido de Eric, 15/10)
1. **Misma ficha en Bike y en Coach.** Coach → Perfil muestra la misma ficha que Bike → Perfil: Mis datos + Mis bicis, con el mismo `mi-perfil.js` y las mismas funciones `perfiles_*`. Un entrenador que también corre la usa igual.
2. **Perfil profesional del entrenador** (solo rol entrenador, y más adelante taller), en una pestaña aparte **"Perfil profesional"**:
   - Especialidad (DH, enduro, BMX, técnica, físico…), títulos y certificaciones, años de experiencia y logros.
   - Zona o ciudad, modalidad (presencial / a distancia / las dos), idiomas.
   - Foto y texto de presentación ("venderse" ante su público). Opcional: redes y precio orientativo.
3. **"Mostrarme como entrenador disponible"**: interruptor, **apagado por defecto**. Solo con el interruptor prendido aparece en la lista.
4. **Lista de entrenadores disponibles:** la ven los **pilotos registrados que no tienen entrenador** en Coach, con filtros por especialidad, zona y modalidad. El piloto toca **"Pedirle que me entrene"** y al entrenador le llega la solicitud (mail + aviso). Si acepta, queda el vínculo como hoy, con los mismos permisos.

**Para resolver cuando se haga:**
- Hoy la invitación va solo del entrenador al piloto (`invitar-alumno`); falta el camino inverso, **solicitud del piloto**.
- Qué datos del entrenador ve un desconocido: nunca su mail ni su teléfono hasta que acepte.
- Si los títulos se muestran como "declarados por el entrenador" o los verifica el admin.
- Cómo se cruza con el cobro de Coach (FASE 6): ¿cualquier entrenador puede aparecer, o solo los que pagan la suscripción?

**Base de datos (propuesta):**
- `perfiles_usuario.datos_profesional` jsonb + `disponible` boolean.
- Tabla `solicitudes_entrenador` (piloto, entrenador, mensaje, estado, fechas).
- Funciones `entrenadores_disponibles(filtros)` y `solicitud_entrenador_crear` / `_responder`.


## 11. Datos personales: privacidad y consentimientos (15/10, PENDIENTE de decisión)
Con fecha de nacimiento, teléfono, foto, peso y telemetría con GPS, SendFlow guarda datos personales. Lo mínimo antes de abrir a más gente:
1. Página **Privacidad** (`sendflow.bike/privacidad`, enlazada desde el registro y el pie de los dos sitios): quién es el responsable, qué datos, para qué, quién los ve (entrenador vinculado, profesionales con permiso), dónde se guardan (Supabase y Cloudflare R2, fuera de Argentina), cuánto tiempo, cómo pedir acceso, corrección o borrado.
2. **Términos de uso**.
3. Al crear la cuenta: aceptar Privacidad y Términos (obligatorio) y, aparte, **casilla opcional** para recibir novedades/marketing. La fecha de nacimiento para marketing solo con ese consentimiento.
4. **Menores**: pilotos de DH menores de edad → consentimiento de madre/padre/tutor.
5. **Borrar mi cuenta** en Perfil (hoy solo lo hace el admin).
6. Argentina (Ley 25.326): inscribir la base en el Registro Nacional de Bases de Datos (AAIP). Si se vende afuera, revisar GDPR (UE) y equivalentes.
**Descargo de lesiones (decidido 21/10, PRD W14):** se acepta al abrir la cuenta por primera vez, lo gestiona Bike, y se guarda la versión y la fecha. Es independiente del cuestionario del piloto de Coach (C72).
Los textos legales los tiene que revisar un abogado; se puede armar un borrador para llevarle.

## 12. Listas de modelos compartidas (15/10, `catalogo_v1.sql`, Bike v37)
- Tabla `catalogo_equipo` (bicis, horquillas, shocks, cubiertas, frenos). Base: estudio de mercado del 15/10/2026 + los nombres viejos de la app (hay perfiles guardados con ellos).
- Un modelo escrito a mano en el editor de bici queda para todos al guardar (`catalogo_agregar`, sin duplicados por mayúsculas/espacios, máx. 40 por persona por día). El admin borra con `catalogo_borrar`.
- Pendiente: la app (parche) tiene que bajar estas listas al conectarse, en lugar de las suyas fijas. Pendiente opcional: pantalla en el panel de admin para revisar y borrar modelos nuevos.
- Dudas del estudio: nombres nuevos de Pirelli (Blacksting/Black Sting, prefijo Scorpion) y generaciones sin año confirmado (Trek Session, Transition TR11, Canyon Sender, Pivot Phoenix).

## 13. Bici: e-bike, área calibrada y largo del sensor (15/10, Bike v39)
- Nuevo campo de la bici `ebike` ("si"/"no"), en el editor de Bike y como chip en Bike y Coach. **Pendiente en la app:** leerlo y tenerlo en cuenta en las devoluciones (el peso de una e-bike cambia SAG, presiones y lectura de la suspensión).
- «Área calibrada (mm²)» (`areaAireH/S`) no se carga en la web: la llena la app sola con la calibración de «SAG en vivo». Si la bici ya lo tiene, la web lo conserva al guardar.
- Largo del sensor de horquilla/shock (`potH/potS`) lleva la marca «Solo Sender».

## 14. Seguridad (control del 15/10)
- La app (y por lo tanto `/analisis`) arma listas con `innerHTML` sin escapar (perfiles, modelos). Con perfiles que vienen de la cuenta, un texto cargado por otra persona (entrenador con permiso, pilotos del profesional) podía meter HTML. Mitigado en la web (v40): `perfiles-web.js` limpia nombres y datos al traerlos; `catalogo_agregar` rechaza < > comillas; el editor ignora nombres raros del catálogo. La CSP de `/analisis` ya bloqueaba scripts en línea.
- **Pendiente en el parche de la app:** escapar los textos en `renderizarListaPerfiles`, `poblarSelectConDB` y las listas de bajadas, o limpiar al importar de la cuenta (igual que `perfiles-web.js`).
- No revisado en este control: Edge Functions, CORS de R2, panel de admin, políticas de `bajadas`. Para eso, un escaneo completo.

## 15. Entrenadores libres y bienvenida (16/10, `coach_v23.sql`, Coach v51 / Bike v43)
- **Flujo inverso a la invitación.** El entrenador activa «Aparecer en la lista y recibir solicitudes» en Coach → Perfil → Mis alumnos (zona, modalidad: presencial / a distancia / las dos, disciplinas y una presentación de hasta 600 caracteres; sin presentación no se puede activar). Solo aparece si además tiene Coach activo. Su email no se muestra.
- **Piloto.** Si tiene Sender y no tiene entrenador: tarjeta «Encontrá un entrenador» en el Inicio de Bike y bloque «Entrenador» en Perfil (Bike y Coach). La lista se puede filtrar por nombre, zona o disciplina; «Pedir entrenamiento» con mensaje opcional (500). Puede cancelar mientras está pendiente.
- **Entrenador.** En su Inicio de Coach aparece «Un piloto quiere entrenar con vos» (nombre, foto, disciplina, nivel, categoría, edad y mensaje). «Aceptar» crea la ficha con los datos del perfil del piloto y deja el vínculo activo; «Rechazar» lo cierra (el piloto puede volver a pedir en 30 días).
- **Avisos.** Mail y push al entrenador cuando llega una solicitud y al piloto cuando se responde (`avisos-coach` v5, entran en «Devoluciones y avisos»).
- **Bienvenida.** La primera vez que una cuenta entra (Bike o Coach) ve «Primeros pasos»: completar datos y cargar bicis (con ✓ si ya está hecho) y lo que puede hacer en SendFlow. Versión entrenador: perfil, sumar pilotos (invitación o lista) y lo que hace Coach. Se marca en la base y no vuelve a salir. Las cuentas existentes también la ven una vez.
- **Archivo de bajada.** En `/analisis` y en la app el botón dice «Desde archivo .sfb» y el selector pide `.sfb` (`application/octet-stream` también, porque Android no conoce la extensión). Un `.csv` viejo se sigue pudiendo abrir si se elige igual.
