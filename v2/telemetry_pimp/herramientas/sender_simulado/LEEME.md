# Sender simulado

Un programa que corre en la PC y responde por WiFi **igual que el firmware
nuevo del Sender** (`firmware_nuevo/sender_firmware`). Sirve para probar la
app SendFlow instalada en el celular mientras no esté el prototipo.

Sólo necesita Node.js, el mismo que ya usás para Capacitor. No instala nada.
`formato-sfb.js` tiene que estar en la misma carpeta: es el mismo lector y
escritor del formato `.sfb` que usa la app.

## Cómo usarlo

1. Doble clic en `iniciar_sender_simulado.bat`.
   - La primera vez Windows pregunta si deja que Node use la red: marcá
     **Redes privadas** y aceptá. Si no aparece la pregunta y el celular no
     conecta, revisá el Firewall de Windows (permitir "Node.js" en red privada).
2. La ventana muestra la IP de la PC, por ejemplo `192.168.0.15`.
3. Conectá el celular al **mismo WiFi que la PC**.
4. En la app, donde se escribe la IP del Sender, poné esa IP y probá la conexión.

Si el puerto 80 está ocupado, la ventana lo avisa: abrí una consola en esta
carpeta y corré `node sender_simulado.js --puerto 8080`, y en la app escribí
la IP con el puerto (`192.168.0.15:8080`).

## Comandos en la ventana (letra + Enter)

| Tecla | Qué hace |
| --- | --- |
| `g` | Graba una bajada de prueba de 20 a 60 s, como tocar RUN dos veces |
| `l` | Lista las bajadas |
| `c` | Muestra la config que recibió de la app |
| `p` | SAG en vivo: sube o baja al piloto de la bici (si no se toca, alterna solo cada ~20 s) |
| `q` | Sale |

Al arrancar por primera vez crea dos bajadas viejas, sin fecha y sin config,
para ver cómo se muestran ("CONFIG NO CONFIRMADA").

## Qué probar desde la app

1. **Probar conexión** → tiene que decir CONECTADO. Con esto se verifica que
   Android deja conectar por HTTP (hace falta el `network_security_config.xml`
   nuevo y un `npx cap sync`).
2. **Enviar la config del perfil** → en la ventana aparece el piloto, el peso
   y "reloj puesto en hora".
3. **Dispositivo → Enviar** con el mapeo cambiado (por ejemplo horquilla en 2
   y shock en 1) → en la ventana aparece el mapeo aplicado. Probá también un
   conector repetido: la app tiene que mostrar "hay un conector asignado dos
   veces".
4. Tocá `g` en la ventana y **refrescá la lista de bajadas** en la app: la
   nueva tiene que aparecer con fecha, peso y circuito.
5. Buscar sensores BLE, emparejar, olvidar, recalibrar cero, formatear y
   reset de fábrica: todos responden como el Sender.

## Opciones

- `--con-descarga`: activa `/descargar` para bajar la bajada a la app. **El
  firmware todavía no lo tiene**; está para adelantar la prueba del paso
  siguiente.
- `--lento`: manda los datos a la velocidad real del ESP-01S (~10 KB/s).
  `iniciar_sender_simulado_lento.bat` arranca con `--lento --con-descarga`:
  sirve para ver en persona el problema de velocidad (con el formato
  `.sfb`, una bajada de 20 s pesa ~0,5 MB y tarda casi un minuto por el
  ESP-01S a 115200 baudios).
- `--temp-susp`: graba también la temperatura de horquilla y shock (bloque
  TEMP_SUSP del `.sfb`), con el aceite calentándose y la suspensión
  moviéndose más rápido al final. Sirve para ver la tarjeta TEMPERATURA DE
  SUSPENSIÓN en TUNE. El Sender real todavía no tiene esas sondas.
- `--presion`: graba también la presión de aire de horquilla y shock (bloque
  PRESION del `.sfb`, con la calibración del cabezal en la cabecera): la
  cámara de aire sigue la ley de Boyle y se calienta un 4 % a lo largo de la
  bajada. Sirve para ver las tarjetas PRESIÓN DE AIRE y CURVA DE RESORTE en
  TUNE. El Sender real todavía no tiene los cabezales. Se puede combinar con
  `--temp-susp` (`node sender_simulado.js --temp-susp --presion`).
- `--video archivo.mp4`: arma una bajada **a partir de un video de GoPro**,
  con el acelerómetro, el giroscopio y el GPS que la cámara grabó adentro
  del MP4 (las suspensiones son inventadas a partir de los golpes). La
  bajada arranca unos segundos después que el video y la ventana muestra el
  desfase real: sirve para probar que la app sincroniza sola el video con la
  bajada. Tecla `v` para volver a armarla. Con `--solo-grabar` sólo arma el
  `.sfb` (en `sender_simulado_datos\BAJADAS\`) y sale, para pasarlo al
  celular a mano. Hace falta `gopro-gpmf.js` en esta misma carpeta (es el
  mismo de la app, `www\js\gopro-gpmf.js`).
  Ejemplo: `node sender_simulado.js --video D:\GoPro\GX010123.MP4`

## Dónde quedan los datos

En `sender_simulado_datos\` al lado de este archivo: las bajadas (`BAJADAS\`,
en el formato propio del Sender, `.sfb`, igual que la microSD) y la config
del dispositivo. Para empezar de cero, borrá esa carpeta. Las bajadas en CSV
de la versión anterior del simulador ya no se listan.

## Lo que NO simula

- La red WiFi propia del Sender (se usa el WiFi de tu casa).
- Los tiempos y cortes del ESP-01S real, salvo la velocidad con `--lento`.
- Los sensores reales: las bajadas son señales inventadas con forma creíble.

## SAG en vivo

El simulado responde `/en_vivo` (el Sender real todavía no). En la app:
Conectar a Sender → paso 4 → MEDIR SAG EN VIVO. Con la bici "sin peso"
(los primeros 6 s de cada ciclo, o después de tocar `p`) tocá SIN PESO; con
el piloto arriba tocá MEDIR y después USAR ESTE SAG.

