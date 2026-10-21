# Revisión de informes externos — 15/10/2026

Eric pasó cuatro documentos escritos por otras IA sobre el proyecto: tres informes de Grok y un «Plan Estratégico de Marketing y Go-To-Market Internacional». Acá se contrasta cada preocupación con el estado real según el PRD (`final/01_PRD.md`), el plan (`final/06_IMPLEMENTATION_PLAN.md`), `referencia/HARDWARE.md` y `claude/anclaje-manubrio-horquilla-2026-09.md`.

Certeza: **[Seguro]** = está en los documentos. **[Probable]** = inferencia fuerte. **[Adivinando]** = hay que verificarlo.

## 1. Informe general (Grok, «Honest opinion»)

| Preocupación | Cómo estamos | Qué hacer |
|---|---|---|
| Demasiada superficie para una persona: hardware, firmware, app, tres webs, Coach, Lab, admin | **Cierto [Seguro].** Sender S1–S9 «A VALIDAR (firmware compila; falta hardware armado)». El 14 y 15/10 el trabajo se fue casi todo a la web. | La web está por delante del hardware. **Recomendación:** congelar funciones nuevas de web y Coach (solo arreglos) hasta tener la primera bajada real (cierre de la FASE 2). |
| El hardware es el camino crítico | **Cierto [Seguro].** Placa definitiva esperando piezas y fondos; anclaje de manubrio en rediseño (un tornillo + inserto); `/descargar`, `/en_vivo` y `/bateria` pendientes en el firmware. | Mantener el orden de la FASE 2. Todo el análisis depende de que el Sender grabe bien en la bici. |
| El modelo de negocio tiene preguntas abiertas: aprobación manual, precio de Coach, marca | **Cierto, y está documentado [Seguro]** (PRD §10 puntos 4, 5 y 6; FASE 6). La aprobación manual sirve para la etapa alfa, no para escalar. | Antes de cobrar o lanzar: empresa, marca (INPI), precio de Coach y medio de cobro. |
| Las heurísticas necesitan datos reales | **Cierto y asumido [Seguro]:** el PRD dice que todo se recalibra con bajadas reales. La postura por IA es experimental. | Juntar un corpus (Eric, Derek y 2 o 3 pilotos conocidos) antes de mostrar recomendaciones como argumento de venta. |
| Dependencia de una sola persona | **Cierto [Seguro].** La documentación ayuda, pero las llaves y los accesos dependen de Eric. | Ver §4 «Continuidad». |

## 2. Informes mecánicos (Grok 1 y 2)

- **El informe 1 parte de una premisa equivocada [Seguro]:** supone una carcasa ultrafina «tipo placa portanúmero ODI». El documento del anclaje dice que ese diseño no existe y que la carcasa vigente es de dos piezas (domo + backplate) con anclajes independientes. Sus consejos generales siguen valiendo; las medidas que propone, no.
- **El informe 2 coincide con lo decidido [Seguro]:**
  - Un solo tornillo más grueso con inserto metálico (heat-set) en el manubrio. Es la decisión de Eric, todavía sin modelar.
  - Revisar si la horquilla necesita lo mismo. Está pendiente en el documento del anclaje.
  - No cerrar el PCB antes de tener las piezas.
- **Aportes útiles para sumar al plan (FASE 2):**
  1. **Maqueta de volumen** con las piezas reales antes de dibujar el PCB: espuma o impresión 3D con Teensy, ESP32-C3, batería, GPS, placas de presión y conectores.
  2. **Estrategia de conectores** cerrada: cara, orientación, alivio de tensión, que se puedan usar con guantes y que estén protegidos ante un golpe.
  3. **Rigidez:** que el golpe vaya a la carcasa y no al PCB (nervios y anclajes que descarguen la fuerza).
  4. **RF y temperatura:** la antena del GPS es externa activa (bien) [Seguro]. La antena del ESP32-C3 queda adentro junto a la batería, pero WiFi y BLE solo se usan en boxes [Seguro], así que el riesgo es bajo [Probable]. Medir el alcance en boxes con la carcasa cerrada.
  5. **Service:** cambiar la batería y sacar la microSD sin desarmar todo.

## 3. Plan de marketing y salida al mercado

Lo que está bien: orden «primero entrenadores y talleres», casos de estudio con datos, preventa por tandas y subsidios.

Puntos flojos o que faltan:

1. **Promete cosas que todavía no están validadas [Seguro].** «Análisis de nivel World Cup», «grado científico» o «1000 Hz» son ciertos como diseño, pero no hay una bajada real grabada. No usarlos en comunicación pública hasta cerrar la FASE 2.
2. **Preventa con 50–100 % por adelantado antes de tener una unidad probada.** Es el riesgo más alto del plan [Probable]: si el lote se atrasa, se daña la marca antes de nacer. Alternativa: 3 a 5 unidades beta con pilotos conocidos durante una temporada, y recién después una preventa con seña reembolsable y fecha honesta.
3. **Faltan tres requisitos legales y operativos:**
   - **Baterías de litio:** para mandar el Sender por avión (DHL/FedEx) la batería necesita el ensayo UN38.3 y la documentación de mercancía peligrosa [Probable alto]. Afecta la elección de la batería y el costo de envío. Elegir una celda que ya tenga UN38.3.
   - **Certificación de radio (CE/RED y FCC):** usar módulos ya certificados (ESP32-C3 y GPS con certificación propia) abarata mucho, pero el producto final igual necesita ensayos para la UE [Probable].
   - **Comercio exterior desde Argentina:** importar componentes y exportar el producto terminado (régimen de courier, facturación de exportación). No está en el plan [Adivinando sobre costos y tiempos]. Consultar con un despachante.
4. **La empresa y la marca van antes que el financiamiento [Seguro, PRD §10.5].** Sin empresa constituida no se cobra una preventa, no se postula a FONTAR/ANR ni a Economía del Conocimiento, y no se firma con un inversor. Sin marca registrada, una campaña pública expone el nombre.
5. **Crowdfunding:** pide un prototipo 100 % funcional y un video en pista. Es posterior a la FASE 2 y a las unidades beta, no antes.
6. **Privacidad:** el plan nombra GDPR. Ya está detallado en `PERFILES_Y_MODOS_APP.md` §11 (página de privacidad, consentimientos, menores, borrar cuenta, registro de la base en la AAIP).
7. **Detalle:** «Programa Caballo de Troya» no conviene en un documento que vean entrenadores o inversores. Mejor «Programa de entrenadores fundadores».

## 4. Continuidad (dependencia de una persona) — recomendaciones

- **Código bajo control de versiones** con copia fuera de la PC (por ejemplo, un repositorio privado). Hoy los sitios viven en carpetas locales y en zips [Probable].
- **Llaves y accesos en dos lugares:** `sendflow.jks`, accesos de Supabase, Cloudflare, Resend y del registrador de dominios. Un gestor de contraseñas con recuperación.
- **Segunda cuenta admin** de emergencia, con otro mail.
- La documentación de `final/` ya cubre cómo reconstruir y desplegar todo [Seguro].

## 5. Qué se sumó al plan por esta revisión

- FASE 2: maqueta de volumen, estrategia de conectores, rigidez, prueba de RF en boxes, service de batería y microSD.
- FASE 6: UN38.3 de la batería, certificación de radio, consulta con despachante, empresa y marca antes de la preventa, nombre del programa de entrenadores.
- General: continuidad (§4).
- Prioridad recomendada: **hardware antes que funciones web nuevas.**
