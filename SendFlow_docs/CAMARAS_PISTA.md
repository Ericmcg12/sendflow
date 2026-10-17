# SendFlow — Cámaras de pista y controles de tiempo (etapa posterior)

> **11/10/2026 · propuesta aprobada por Eric para una etapa posterior (FASE 8 del doc 06).** No se construye nada de esto hasta después del lanzamiento (FASE 6): primero fabricar Sender y tener funcionando la app, la nube y los sitios.
> Producto pensado **para entrenadores (SendFlow Coach)**: filmar a sus pilotos en entrenamiento y medir tiempos por tramo.
> Ítem del PRD: **C25** (doc 01 §6.4).

## 1. Qué es

Un **kit de nodos de cámara** que el entrenador planta en distintos puntos de una pista de DH. Cada nodo:

1. **Filma** al piloto cuando pasa (sin que nadie apriete grabar).
2. **Es un control de tiempo**: anota la hora exacta del paso.
3. Sube clips y tiempos a **SendFlow Coach**, donde quedan atados al piloto, a su bajada del Sender y a su posición en la pista.

Con la largada (que ya da el Sender) más cada control de tiempo, se sabe **cuánto tardó el piloto en cada tramo** y se ve el video de cada punto sincronizado con la telemetría.

## 2. Decisiones tomadas

| Tema | Decisión | Por qué |
|---|---|---|
| Cámaras | **Comerciales** (GoPro primero), no cámara propia. | GoPro tiene control abierto por Bluetooth (Open GoPro, Hero 9 en adelante) y HindSight. DJI e Insta360 se pueden controlar pero con protocolo menos abierto: segunda prioridad. |
| Radio en el Sender | **No agregar hardware al Sender** (no hay lugar). | La primera versión funciona sin que el Sender transmita nada (ver §3). |
| Red WiFi grande en la pista | **Descartada.** | Ubicar por intensidad de señal da ±10–20 m, consume mucho y hay que alimentar/cablear equipos en la pista. El Sender ya sabe dónde está por GPS. |
| RFID UHF pasivo | **Descartado** como detector principal. | Alcance 5–10 m; para anticiparse habría que poner la antena lejos de la cámara. |
| Seguimiento por imagen (Pivo, OBSBOT, Insta360 Flow) | **Descartado.** | Con un piloto de DH entre árboles a 60 km/h falla. |

## 3. Diseño por etapas

### Etapa A — Nodo autónomo (sin radio en el Sender) — *la primera que se hace*

Cada nodo tiene:
- **ESP32-S3** (control), **GPS con PPS** (hora exacta y posición del nodo), baterías 18650 que también alimentan la cámara por USB, caja estanca, montaje a trípode/estaca.
- **Detector de paso** en la línea del control: barrera infrarroja/láser reflectiva cruzando la pista (precisión ~1 ms) o radar Doppler de corto alcance. A definir en pruebas.
- **GoPro con HindSight** comandada por Bluetooth: la cámara está siempre en espera guardando los últimos 15–30 s; cuando el detector marca el paso, el nodo manda "grabar" y el clip incluye lo que pasó **antes** del paso y unos segundos después. No hace falta anticiparse.

**Cómo se sabe quién pasó:** el nodo guarda la hora GPS de cada paso. Después, en Coach, cada paso se asocia al piloto cuyo Sender estaba en ese punto a esa hora (la traza GPS de la bajada subida). Para pilotos sin Sender, el entrenador asigna el paso a mano (o por orden de largada).

**Tiempos:** largada (Sender o primer control) → control 1 → control 2 → … → llegada. Tabla por piloto y por pasada, con mejor tramo y "bajada ideal" (suma de mejores tramos), igual que la app hace con sectores.

**Por qué conviene un control físico si el Sender ya tiene GPS:** el GPS a 10 Hz con el piloto a 17 m/s da un punto cada 1,7 m (interpolado, error ~0,05–0,1 s); la barrera da ~1 ms. Además funciona con pilotos que no tienen Sender.

### Etapa B — Radio desde el Sender (opcional, cuando haya lugar)

El Sender anuncia su posición GPS 5–10 veces por segundo (ID del piloto, posición, velocidad, rumbo, hora GPS):
- **Sin hardware nuevo:** ESP-NOW en modo largo alcance con el **ESP32-C3 que ya tiene el Sender** (cientos de metros a la vista). Costo: el C3 prendido en pista (+30–60 mA, igual que lo evaluado para TPMS, doc 01 §10 punto 7).
- **Si el bosque corta la señal:** LoRa (SX1262, 915 MHz) en una revisión futura de la placa o en un módulo aparte.

Suma: identificación del piloto en el momento, arranque anticipado (sin depender de HindSight), varios pilotos en pista a la vez, tiempos en vivo en Coach.

### Etapa C — Cabezal que sigue al piloto (requiere B)

Cabezal de giro propio (motor paso a paso NEMA 17 + reducción por correa, eje con rodamientos; mecanizado por Eric). El nodo calcula el ángulo hacia el piloto con su posición GPS y la del Sender, y predice con la velocidad para compensar la demora. Error del GPS 1,5–2 m → ~5° a 20 m: entra en cuadro con el ángulo amplio de la GoPro.

**Alternativa sin mecánica:** cámara 360° (Insta360) fija y el encuadre se elige después.

## 4. Sincronización con la telemetría

- Nodo y Sender comparten la **hora GPS** (el Sender tiene PPS, doc 01 S16).
- La GoPro guarda su propio GPS dentro del video (GPMF), que la app y Coach ya leen (`gopro-gpmf.js`).
- Resultado: cada clip se ubica solo en su punto de la pista y se reproduce junto con los datos de la bajada (y sirve para la comparación con "fantasma", C18).

## 5. En SendFlow Coach (a diseñar cuando llegue la etapa)

- **Sesión de pista**: el entrenador elige la pista, ubica los nodos (posición GPS del nodo) y define cuáles son largada, controles y llegada.
- **Pasadas**: lista por piloto con tiempos por tramo, mejor tramo, bajada ideal y clips de cada control.
- **Descarga de clips**: por WiFi de la GoPro al celular/tablet del entrenador en boxes, o tarjeta; después suben a R2 como cualquier video de Coach.
- Tablas nuevas en la base (sesiones, nodos, pasos, clips) — se definen en el doc 05 cuando se apruebe la etapa.

## 6. Riesgos a probar antes de prometer

- Consumo de la GoPro en HindSight/espera (alimentación externa obligatoria), calor al sol, frío.
- Que la cámara no se duerma y que el Bluetooth reconecte solo.
- Alineación y robustez de la barrera con polvo, ramas, peatones (filtrar pasos falsos por duración del corte y por velocidad).
- Robo y clima: caja estanca con candado/estaca.
- Alcance real de ESP-NOW/LoRa en bosque (etapa B).

## 7. Primera prueba (cuando se arranque)

1. ESP32 + GoPro: conectar por Bluetooth, activar HindSight, grabar/parar por comando (un fin de semana).
2. Agregar GPS con PPS y la barrera: anotar hora de paso con precisión de milisegundo.
3. Dos nodos en una pista + una bajada con Sender: armar a mano la tabla de tramos y ubicar los clips en la bajada.
