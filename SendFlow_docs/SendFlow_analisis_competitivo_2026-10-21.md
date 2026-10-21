# SendFlow — Análisis competitivo y foco de producto

> **Fecha de investigación: 2026-10-21.** Preparado como documento complementario de `SendFlow_docs/final/`. No reemplaza al PRD: si hay contradicción, manda el PRD.
> Certeza: **[Seguro]** = evidencia directa citada. **[Probable]** = inferencia fuerte. **[Adivinando]** = hay que verificarlo.
> Reglas de este documento: cada afirmación lleva su fuente en la misma frase; si no encontré fuente, dice "no public source found"; "no vi" significa que no lo encontré en las páginas leídas, no que no exista. Varias páginas se leyeron truncadas (indicado donde aplica). Las cifras de usuarios son autodeclaradas por cada vendor.

---

## 0. Resumen ejecutivo

1. **[Seguro]** Las funciones de relación entrenador-piloto de Sendflow (mensajes, planes, grupos, agenda, asistencia) no diferencian: las plataformas generalistas las ofrecen desde hace años (por ejemplo [CoachNow](https://coachnow.com/), [Trainerize](https://www.trainerize.com/), [My Fitness App](https://myfitnessapp.net/entrenadores.html)).
2. **[Probable]** El hueco real es **datos de suspensión de alta frecuencia dentro del flujo del entrenador**. Los productos de telemetría ([Trailmetry](https://trailmetry.com/), [BYB](https://bybtech.it/telemetry/app)) apuntan al ciclista y al técnico; los de vídeo ([SportSense](https://sportsense.coach/), [OnForm](https://onform.com/), [VisualEyes](https://www.visualeyesapp.com/)) no traen datos de sensores.
3. **[Probable]** El valor del dato para el coach es **separar "es la bici" de "es el piloto"**. Esa pregunta debería ser la función estrella.
4. **[Seguro]** El nicho no está vacío: [SportSense](https://sportsense.coach/use-cases) lista programas de MTB de élite como clientes (autodeclarado).
5. **[Seguro, según el PRD]** El hardware (Sender) no está validado con una bajada real; todo lo de Coach se probó con datos simulados.
6. **[Probable]** Mayor hueco de paridad: **la app móvil del coach** para filmar y analizar en pista (hoy Coach es web; la app instalable es C21, FASE 6).

---

## 1. Análisis detallado de SportSense (formato de ocho secciones)

### 1. Marketing & Messaging
- Titular de la [home](https://sportsense.coach/): "Save time coach smarter". Subtítulo: "Precise feedback for every athlete, wherever they train."
- Etiqueta de cabecera en la [home](https://sportsense.coach/): "video analysis that files every clip by athlete and skill."
- Promesas en la [home](https://sportsense.coach/): "Break down any clip side by side with the reference library, so your athlete actually sees the gap." y "Post it, and sportsense sorts it automatically."
- La [página About](https://sportsense.coach/about): "Modernize how coaching works" y "turns coaching insight into structured, scalable, recurring performance systems."
- La [página de casos de uso](https://sportsense.coach/use-cases) afirma "92% less time spent on video admin per session" con voice tagging y "up to 5 hours a week" ("Five minutes instead of sixty"), sin fuente ni metodología.
- Mensaje de canal en la [página de casos de uso](https://sportsense.coach/use-cases): los planes de pago son más baratos comprando en su web que por las tiendas de apps.

### 2. Product & Features
**Disponible hoy**, según la [home](https://sportsense.coach/), la [ficha de App Store](https://apps.apple.com/app/id6468841018) y la [user guide](https://sportsense.coach/user-guide):
- Grabación en la cámara de la app o importación del carrete.
- Analizador con overlays de esqueleto y ángulos, cámara lenta, comparación lado a lado, bloqueo de vídeo y anotaciones.
- Etiquetado y organización automática por voz, con transcripción.
- Bibliotecas de referencia; feeds para compartir con atletas (enlaces o QR).
- Pagos y reservas: solo en el resumen de una búsqueda [Probable]; la sección Payments de la user guide no pude leerla.
- Plataformas: iOS y Android según la [home](https://sportsense.coach/); la [ficha de App Store](https://apps.apple.com/app/id6468841018) lista iPhone, iPad, Mac (M1+) y Apple Vision.
- Cadencia: unas 25 versiones entre abril y octubre según el historial de la [ficha de App Store](https://apps.apple.com/app/id6468841018) (la 7.126 es la más reciente; las fechas no traen año). Nota de la 7.126: "Improved pose analysis performance and visibility, including clearer overlays during playback."

**Anunciado / roadmap:** no vi funciones marcadas "coming soon" ni beta en las páginas leídas [Probable; lectura truncada de la home (100.000 de 363.300 caracteres) y de la user guide (100.000 de 198.648)].
**Telemetría / sensores:** no vi ninguna mención [Probable].

### 3. Pricing & Sales
Todo según la [página de precios](https://sportsense.coach/pricing-new) (la URL `/pricing` devuelve 404). Moneda: USD.

| Plan | Precio publicado | Condiciones |
|---|---|---|
| Free | $0 per month | "For athletes and coaches getting started. No time limits." Herramientas limitadas |
| Analyze | $10 per user per month | "Annual billing is available at a 15% saving." No da el precio anual en dólares |
| Pro ("Most Popular") | $25 per coach per month | Mismo 15% de ahorro anual |
| Elite | "Custom" | Gobernanza, academias, programas institucionales; "Contact us" |

- La página no indica mínimo de asientos, "starts at" ni planes solo anuales.
- Prueba: cuentas nuevas con acceso completo a Analyze, tarjeta requerida; FAQ menciona 2 semanas; sin método de pago pasa a Free.
- Descuentos por Stripe para instructores certificados de organismos asociados.
- **Inconsistencia:** la [ficha de App Store](https://apps.apple.com/app/id6468841018) lista Analyze mensual a $7.99 y $11.99, anual $79.99, Pro mensual $19.99 y $29.99, anual $199.99, y pases de temporada que no están en la web. No explica las variantes duplicadas.
- Modelo de venta: ambos (autoservicio por Stripe y tiendas; contacto para Elite).

### 4. Audience & Customers
- Público según la [página de casos de uso](https://sportsense.coach/use-cases): coaches de MTB, alpino, snowboard, escalada y skate; negocios de coaching; resorts; programas de desarrollo.
- Logos bajo "Trusted by leading programs" en esa [página](https://sportsense.coach/use-cases): Canyon CLLCTV, Norco, Yeti Fox Factory Race Team, Specialized Gravity, Santa Cruz Syndicate, Orbea FM Racing, Ride5 Development (autodeclarados; sin confirmación independiente).
- Testimonios en la misma [página](https://sportsense.coach/use-cases): NDC Whistler, Point1 Development, Specialized Gravity. Sin casos de estudio.

### 5. Customer Sentiment
- G2, Capterra, Trustpilot, Reddit: no public source found.
- Única fuente: 2 reseñas de 2025 en la [ficha de App Store](https://apps.apple.com/app/id6468841018), 5.0 sobre 2 votos (muestra no significativa): "It's a game changer for me—well my athletes really." y "This provides incredible visual feedback."
- Quejas: no public source found. Google Play ([AppBrain](https://www.appbrain.com/app/sportsense/com.sportsensetech)) devolvió 403.

### 6. Company Profile
- Empresa: Sport Sense Technology Ltd, según la [ficha de App Store](https://apps.apple.com/app/id6468841018). País: "Developed in Canada" ([About](https://sportsense.coach/about)).
- Fundadores listados en [About](https://sportsense.coach/about): Zac Wiens, Rich MacLennan, Ross Dunlop (más Sev Nielsen, Data Solutions, no como fundador). Que Dunlop cofundó la app proviene del resumen de una búsqueda sobre un podcast de [Pinkbike](https://www.pinkbike.com/news/podcast-ross-dunlop--exploring-mountain-biking-mindset-coaching-evolution-and-two-decades-of-whistler-wisdom.html); no pude abrirlo (403) [Probable].
- Año de fundación, sede, tamaño de equipo, financiación: no public source found.

### 7. Market & Opportunity
- Categoría: análisis de vídeo y pose para coaches de deportes de acción [Seguro].
- Recientes verificables: actualizaciones frecuentes de la app y cambio de URL de precios a `/pricing-new` (sin fecha).
- Lanzamientos, cambios de precio o reposicionamiento con fecha: no public source found.

### 8. SWOT Analysis
- **Strengths:** auto-etiquetado por voz con beneficio cuantificado (sección 1); clientes de élite en MTB (sección 4); alta cadencia de versiones (sección 2); entrada gratis (sección 3).
- **Weaknesses:** casi sin prueba social independiente (sección 5); precios incoherentes web vs App Store (sección 3); foco en MTB y snowboard (sección 4).
- **Opportunities:** academias y federaciones vía Elite (sección 3); otros deportes de acción (sección 4).
- **Threats:** alternativas establecidas (sección 7); dependencia de comisiones de tiendas (sección 1).

---

## 2. Otros sistemas revisados

### 2.1 Grupo A — Vídeo para coaches

**[OnForm](https://onform.com/)** — "Record. Analyze. Share." Claims de la home: "helps coaches elevate athlete performance through video analysis" y "Turn simple 2D video into detailed 3D analysis with 12 swing metrics in seconds." Cámara lenta y cuadro a cuadro, dibujo y voz, multicámara, administración multiusuario y multi-sede, "HIPAA-compliant". Audiencia: golf, natación, atletismo, béisbol, softball; logos universitarios y de organismos (inferidos de nombres de archivo, pueden no ser exactos). Los [precios](https://onform.com/pricing/) son por coach: Coach Basic USD 19.99/mes, 199.99/año; Standard 39.99/mes, 399.99/año; Pro 59.99/mes, 599.99/año; descuento adicional con 3 o más coaches; atletas gratis si su coach está en Onform (planes Individual Basic/Standard/Premium); prueba de 14 días sin tarjeta.

**[VisualEyes](https://www.visualeyesapp.com/)** — "A Video Analysis App Created by a Coach for Coaches". Cuadro a cuadro, comparación lado a lado, dibujo, ángulos, tiempo, etiquetas por atleta, chat de equipo con roles. Autodeclara 50K+ coaches y atletas, 900K+ vídeos y 4.8 en App Store (991 valoraciones). [Precios](https://www.visualeyesapp.com/pricing) mensuales: Free 2GB; Bronze USD 4.99 (10GB); Silver 9.99 (25GB); Gold 14.99 (ilimitado); precio anual no mostrado; planes de equipo por contacto. Opera TM Athletics LLC.

**[Kinovea](https://www.kinovea.org/)** — "A microscope for your videos". "Kinovea is a video annotation tool designed for sport analysis" y "completely free. No licenses, no subscriptions, no limits." Anotar, comparar, medir ángulos y distancias, seguimiento de puntos, exportar a hoja de cálculo. Solo enlaza instalador de Windows. Versión 2025.2 (sin fecha). Mantenido por Joan Charmant desde 2004, en su tiempo libre. Marca el piso de precio: una herramienta gratis de análisis puntual.

**[SportsReflector](https://sportsreflector.com/)** — la web no renderiza sin JavaScript (solo se obtuvo el título "SportsReflector | AI Sports & Gym Coaching App"). Según listados de terceros ([Software Advice](https://www.softwareadvice.com/product/547004-SportsReflector/), [Capterra](https://www.capterra.com/p/10040191/SportsReflector/)): app iOS que puntúa técnica con la cámara (0 a 100), con modo en vivo, comparación multi-ángulo, "injury risk assessments" y nivel Coach; plan gratis y Pro a USD 19.99/mes. Capterra muestra 0 reseñas. [Probable; fuente de terceros].

### 2.2 Grupo B — Plataformas de coaching

**[CoachNow](https://coachnow.com/)** — "CoachNow is the highest rated coaching app in the world." Vídeo con cámara lenta, seguimiento "AI-enhanced" y anotaciones, voz, mensajes a uno o miles, programas, pagos, espacios por atleta o equipo, biblioteca en la nube; iOS, Android, web. Autodeclara más de 1 millón de coaches y atletas, 60+ deportes y 140+ países. [Precios](https://coachnow.com/pricing/): Analyze USD 9.99/mes o 59/año (la página también muestra 119); PRO 49.99/mes o 499/año (también 600); Academy 89.99/mes o 899/año, con calendario, facturación por Stripe Connect y precio flexible para 3 o más coaches. Prueba de 7 días.

**[Trainerize](https://www.trainerize.com/)** — "The #1 coaching app to better engage your clients". Programas, nutrición, hábitos, mensajes, comunidad, vídeo coaching, agenda, pagos, apps con marca propia. Autodeclara 400k+ entrenadores, 45k+ negocios y 1.6M+ clientes. Prueba de 30 días; precios no leídos.

**[My Fitness App](https://myfitnessapp.net/entrenadores.html)** — Argentina; "Planificá, organizá y acompañá a tus alumnos desde un solo lugar." Planes, vídeos de ejercicios, chat, pagos automáticos, agenda y reservas, lista de espera, recordatorios. Precios en ARS: $30.000/mes; $27.000/mes semestral; $24.000/mes anual, alumnos ilimitados y app propia para el alumno. Es un referente local de generalista, no de deporte de acción.

**[Sportplan](https://www.sportplan.net/)** — "SPORTS COACHING MADE EASY". Más de 15.000 vídeos y animaciones de ejercicios, planificador de sesiones, diseñador de ejercicios, gestión de equipos. Plan individual gratis; precios de club y escuela no listados. Sportplan Ltd.

**[TrainingPeaks](https://www.trainingpeaks.com/)** — "Your complete training platform." Foco en resistencia; integra Garmin, Wahoo, Zwift, Whoop, Oura y otros; seguimiento de forma y fatiga. Muestra logos de federaciones y equipos (Team Visma, FDJ Suez, entre otros), sin decir si son clientes de pago. Precio no listado ("All for one price").

### 2.3 Grupo C — Telemetría de suspensión

**[Trailmetry](https://trailmetry.com/)** — "THE SUSPENSION COACH FOR EVERY MOUNTAIN BIKE RIDER" / "Stop guessing. Start dialing. Ride faster." Telemetría de horquilla y shock a hasta 125 Hz, con pulso, GPS y clima; recomendaciones de presión, rebote y compresión (precisión declarada de ±2 PSI); resumen post-recorrido con IA; ranking de configuraciones por pista; vídeo y telemetría sincronizados con importación de CSV de BYB; grabación offline. Hardware: únicamente sensores Witmotion WT9011DCL-BT50 BLE (25 € cada uno). Precios: app gratis (solo horquilla, funciones básicas), Core 4 €/mes, Connect 9,99 €/mes, acceso de por vida USD 24.99 (la página no reconcilia moneda). No vi vista de coach o equipo [Probable].

**[BYB Telemetry](https://bybtech.it/telemetry/app)** (BYB Tech SRL, Brescia, Italia) — "It turns a thousand readings a second into one clear next move." Software de escritorio y app, gratis con cada kit; Telemetry V3 Pro a 1000 Hz con exportación CSV. Vídeo y datos en un solo cursor ("Scrub the trace and the footage follows"), autoajuste por regulador, canales de horquilla, shock, velocidad de rueda y dos entradas de freno, comparación de bajadas, hojas de setup. Comparte una bajada con un rider o un técnico; no menciona entrenadores ni equipos. Precios de los kits: no listados en la página (enlaza a la tienda). "Designed by riders, for riders."

---

## 3. Matriz de funciones

✓ = visto en su web · — = no vi · ◐ = parcial. Sendflow: estado según el [PRD](https://github.com/Ericmcg12/sendflow/blob/animaciones-suspension/SendFlow_docs/final/01_PRD.md) (rama `animaciones-suspension`, 21/10/2026); ⚠ = probado solo con datos simulados.

| Función | SportSense | OnForm | VisualEyes | CoachNow | Trainerize | My Fitness App | Trailmetry | BYB | Sendflow |
|---|---|---|---|---|---|---|---|---|---|
| Cámara lenta / cuadro a cuadro | ✓ | ✓ | ✓ | ✓ | ◐ | ◐ | — | ✓ | ✓ ⚠ |
| Dibujo y ángulos | ✓ | ✓ | ✓ | ✓ | — | — | — | — | ✓ ⚠ |
| Voz sobre el vídeo | ✓ | ✓ | ✓ | ✓ | — | — | — | — | ✓ ⚠ |
| Esqueleto / pose | ✓ | ✓ (3D, golf) | — | ✓ | — | — | — | — | ◐ impreciso |
| Datos de sensores | — | — | — | — | — | — | ✓ | ✓ | ✓ ⚠ (hardware sin validar) |
| Datos + vídeo sincronizados | — | — | — | — | — | — | ✓ | ✓ | ✓ ⚠ |
| Recomendación de ajuste | — | — | — | — | — | — | ✓ | ✓ | ✓ heurística ⚠ |
| Mensajes entrenador-alumno | ◐ | ◐ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ ⚠ |
| Grupos / equipos | — | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ ⚠ |
| Planes de entrenamiento | — | — | — | ✓ | ✓ | ✓ | — | — | ✓ ⚠ |
| Agenda / clases | — | — | — | ✓ | ✓ | ✓ | — | — | ✓ ⚠ |
| Pagos integrados | ✓ | — | — | ✓ | ✓ | ✓ | — | — | — |
| Biblioteca de referencia | ✓ | — | — | ✓ | — | — | — | — | ◐ propuesta |
| Taller / banco de suspensión | — | — | — | — | — | — | — | — | ✓ FASE 7, sin construir |
| Comunidad / ranking | — | — | — | — | ✓ | — | ✓ | — | — |
| Funciona sin señal | — | — | — | — | — | — | ✓ | — | ✓ (app) |

---

## 4. Estado de Sendflow según su documentación

Fuente: [PRD](https://github.com/Ericmcg12/sendflow/blob/animaciones-suspension/SendFlow_docs/final/01_PRD.md), [plan de implementación](https://github.com/Ericmcg12/sendflow/blob/animaciones-suspension/SendFlow_docs/final/06_IMPLEMENTATION_PLAN.md) y [revisión externa del 15/10](https://github.com/Ericmcg12/sendflow/blob/animaciones-suspension/SendFlow_docs/REVISION_EXTERNA_2026-10-15.md). No revisé el código.

- **Hardware:** S1 a S9 en "A VALIDAR (firmware compila; falta hardware armado)"; pendiente de componentes. Sin bajada real.
- **Coach:** funciones C1 a C60, todas probadas con datos simulados; sin probar con dispositivos reales: entrega de push y tarjetas de clases.
- **Usuarios reales:** el PRD cita a Eric y su hijo como únicos pilotos reales (documento del 10/10).
- **Cobro:** sin definir; no hay intención de vender todavía (decisión del propietario, 2026-10-21).
- **Web:** `/analisis` abre en Suspensión, guarda con qué bici se analizó, peso extra por clima y pista, diario de sensaciones (W12).
- **Ya se tomaron ideas de SportSense:** C36 y la propuesta C40 (f a l): selector con tacto, RaceTime, esqueleto con centro de gravedad, biblioteca de referencia, transcripción de voz, etiquetas de sector, chat de grupo.
- **Discrepancia:** el PRD fija todo el texto en español; el objetivo declarado es vender "más afuera que en Argentina". Pendiente decidir idioma.

---

## 5. Foco de producto

### 5.1 Decisión del propietario (21/10/2026)
- No competir como app de coaching; ser **la única app cuyo dato real de la bicicleta sirva al coach para entrenar mejor**.
- Objetivo de conversión: que un usuario de otra app piense "esta tiene lo mismo, y además la lectura de datos del trabajo real de la bici".
- Nicho: bicis. Hoy DH y enduro, XC de rebote. Se sumaría BMX; MX y Enduro MX solo si funciona. Quedan fuera las 4 ruedas (autos, cuatriciclos, UTV, karting) por requerir otros sensores.

### 5.2 Dos ajustes que recomiendo
1. **Dos ruedas no implica los mismos sensores [Seguro].** El propio PRD dice que BMX Race "lleva otro Sender, otros sensores y otro análisis" y por eso se sacó de la lista de Bike. MX y Enduro MX suman motor, otras velocidades de suspensión y vibración [Probable]. Ampliar a esas disciplinas es otro producto con otro hardware. Sugerido: DH/enduro ahora, XC de rebote, BMX o MX solo cuando haya un coach que lo pida.
2. **El nicho necesita un número [Adivinando].** No encontré una fuente pública del tamaño del mercado de entrenadores de DH/enduro. Contar los coaches reales de los primeros mercados evita construir para un público que no alcanza.

### 5.3 Función estrella propuesta: "¿es la bici o es el piloto?" [Probable]
El valor del coach es distinguir entre un problema de técnica y uno de ajuste. Un coach de vídeo ve el gesto, pero no sabe si el piloto frena tarde por técnica o porque la horquilla se hunde. Cinco preguntas que el dato puede contestar:

| Pregunta del coach | Dato en el diseño de Sendflow |
|---|---|
| ¿El tope es del piloto o de la suspensión? | Horquilla y shock a 1000 Hz, aterrizajes (A8 y A9) |
| ¿Frena tarde o demasiado? | Frenadas por velocidad hoy; sensor de freno en FASE 5 (S17) |
| ¿Cuánto se inclina en la curva? | BNO055 a 100 Hz (C28) |
| ¿Está mejorando entre rondas? | Comparar A/B y rondas de Coach (A16, C24) |
| ¿Está cansado o es consistente? | Pulso y cadencia (S19, S20) |

No recomiendo mostrar al coach pantallas pensadas para un mecánico: ese es el terreno de [BYB](https://bybtech.it/telemetry/app) y [Trailmetry](https://trailmetry.com/).

### 5.4 Paridad mínima para que un coach pueda cambiarse

| Función que el coach ya usa | Quién la tiene | Sendflow | Acción sugerida |
|---|---|---|---|
| Cámara lenta, cuadro a cuadro | [SportSense](https://sportsense.coach/), [OnForm](https://onform.com/), [VisualEyes](https://www.visualeyesapp.com/) | Sí, simulado | Validar con vídeo real |
| Dibujo, ángulo, voz | los mismos | Sí, simulado | Validar con vídeo real |
| Comparar dos clips | los mismos | Sí (C18) | Validar |
| Biblioteca de referencia | [SportSense](https://sportsense.coach/), [CoachNow](https://coachnow.com/) | Parcial (C40 i, sin aprobar) | Cerrar |
| Etiquetado y orden automático por atleta | [SportSense](https://sportsense.coach/) | No | Evaluar |
| Mensajes | [CoachNow](https://coachnow.com/), [VisualEyes](https://www.visualeyesapp.com/) | Sí | Mantener |
| App móvil para filmar en pista | [SportSense](https://sportsense.coach/), [OnForm](https://onform.com/), [VisualEyes](https://www.visualeyesapp.com/) | **No** (C21, FASE 6) | **Prioridad alta** |
| Importar vídeos existentes | [VisualEyes](https://www.visualeyesapp.com/) | Parcial | Facilitar la entrada del coach |

Preocupación principal [Probable]: [SportSense](https://sportsense.coach/), [OnForm](https://onform.com/) y [VisualEyes](https://www.visualeyesapp.com/) son apps móviles; Coach de Sendflow es web y el push en iPhone solo funciona con el sitio añadido a la pantalla de inicio (según [TRD](https://github.com/Ericmcg12/sendflow/blob/animaciones-suspension/SendFlow_docs/final/02_TRD.md)). El coach de DH trabaja en la montaña.

### 5.5 Dónde dejar de invertir [Probable]
- Agenda, clases y asistencia (terreno de [My Fitness App](https://myfitnessapp.net/entrenadores.html) y [Trainerize](https://www.trainerize.com/)).
- Pagos y suscripciones (ya decididos como no ahora).
- Pose por IA (prueba propia: "impreciso"; [SportSense](https://sportsense.coach/) y [OnForm](https://onform.com/) ya la ofrecen).
- Funciones multideporte o de nutrición.

Nota: las funciones de agenda y clases ya construidas (C51 a C59) no hace falta quitarlas; la recomendación es no sumar más.

### 5.6 Diferenciadores reales identificados
1. Telemetría de suspensión a 1000 Hz dentro del flujo del coach. [BYB](https://bybtech.it/telemetry/app) llega a 1000 Hz en Pro pero comparte con rider o técnico; [Trailmetry](https://trailmetry.com/) llega a 125 Hz y no mostró vista de coach.
2. Ciclo corregir-aprobar (C24): video → devolución → corrección → "Aprobado" o "Corregir de nuevo". No lo vi en los 9 sitios revisados.
3. Vista de datos sin vídeo para el coach (C27 y C28).
4. Taller y FlowBench (sin equivalente visto; FASE 7, sin construir).
5. App funcional sin señal en pista.

### 5.7 Costo de cambiar de app
Que otra app tenga lo mismo no basta [Probable]: el coach tiene sus alumnos, su historial y sus costumbres allí. Para que cambie, el dato debe resolverle algo que hoy no puede, y migrar debe ser fácil (importar vídeos y alumnos). Alternativa a evaluar: que el coach use Sendflow **junto con** su app actual en una primera etapa, sin exigir el cambio total.

---

## 6. Plan sugerido (no depende del hardware)

1. **Cerrar la paridad que importa:** biblioteca de referencia y app móvil del coach (C21), sin añadir nada fuera de la lista.
2. **Pantalla de diagnóstico "¿bici o piloto?"** con datos simulados; probarla con 3 a 5 coaches de DH/enduro mirando solo esa pantalla.
3. **Entrevistas** (guion abajo) para decidir el orden del roadmap.
4. **Congelar** nuevas funciones de agenda, clases y pagos hasta la primera bajada real validada. (Esto coincide con la recomendación de la [revisión externa](https://github.com/Ericmcg12/sendflow/blob/animaciones-suspension/SendFlow_docs/REVISION_EXTERNA_2026-10-15.md) de congelar funciones web y Coach hasta tener datos reales.)
5. **Beta de 3 a 5 pilotos y 1 o 2 coaches** (propuesta de la revisión externa) antes de cualquier preventa.

### Guion de entrevista para coaches (15 a 20 minutos)
1. ¿Qué app usas hoy para analizar vídeo y cómo la usas en una sesión típica?
2. ¿Qué te falta en esa app? ¿Qué decisión de entrenamiento no puedes tomar con vídeo solamente?
3. Cuando un piloto falla en una sección, ¿cómo decides si es técnica o ajuste de la bici?
4. (Mostrar la pantalla de diagnóstico simulada.) ¿Qué entiendes de esto? ¿Qué cambiarías? ¿Qué dato falta?
5. ¿Qué tendría que traer una app nueva para que dejes la que usas hoy?
6. ¿Qué te frenaría de cambiarte (alumnos, historial, hábitos, costo)?
7. ¿Filmas y analizas desde el móvil en pista o en casa con ordenador?
8. ¿Cuántos pilotos entrenas y cuántos tienen sensores en la bici hoy?

---

## 7. Riesgos

- **[SportSense](https://sportsense.coach/)** está en el mismo nicho con clientes de élite; si añade integración de sensores, la ventaja se acorta.
- **[Trailmetry](https://trailmetry.com/) y [BYB](https://bybtech.it/telemetry/app)** pueden sumar una vista de entrenador (hoy no la vi).
- **Un solo dato como diferenciador:** si el Sender no llega o no es fiable, solo queda un Coach más entre muchos.
- **Dependencia de una persona** (continuidad), reconocida en la [revisión externa](https://github.com/Ericmcg12/sendflow/blob/animaciones-suspension/SendFlow_docs/REVISION_EXTERNA_2026-10-15.md).
- **Legal y operativo antes de vender:** empresa y marca, baterías de litio (UN38.3), certificación de radio (CE/FCC), comercio exterior desde Argentina y privacidad (AAIP/GDPR), todos ya listados en la revisión externa.

---

## 8. Límites de esta investigación

- No consulté G2, Capterra ni Trustpilot para la mayoría de los productos (solo SportsReflector, con 0 reseñas en Capterra).
- Páginas leídas truncadas: home y user guide de SportSense; Sportplan y TrainingPeaks solo la home; Trainerize sin su página de precios.
- Fetch bloqueado (403): [AppBrain](https://www.appbrain.com/app/sportsense/com.sportsensetech) y [Pinkbike](https://www.pinkbike.com/news/podcast-ross-dunlop--exploring-mountain-biking-mindset-coaching-evolution-and-two-decades-of-whistler-wisdom.html).
- Corregido durante la investigación: `onform.net` es otro producto (formularios); se usó `onform.com`.
- No revisé el código de Sendflow ni verifiqué que lo "HECHO" lo esté más allá de lo que dice la documentación.
- Las comparaciones de precio son contexto: el propietario no pretende competir por precio.

### Afirmaciones que caducarán antes
1. Precios de todos los productos.
2. Cifras de usuarios autodeclaradas.
3. Planes y funciones de [Trailmetry](https://trailmetry.com/) (producto reciente) y cualquier vista de coach en Trailmetry o BYB.
4. Versión y reseñas de la app de SportSense.
5. Estado de Coach (v52 a v58) y del hardware: cambian cada semana.
