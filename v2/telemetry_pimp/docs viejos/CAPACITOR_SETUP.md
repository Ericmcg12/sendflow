# Empaquetar SendFlow con Capacitor (Android + iOS)

> Roadmap item #1 de `CLAUDE.md`. Este doc es la guía paso a paso para
> convertir la webapp actual en una app instalable de verdad en Android y
> iOS, sin reescribir nada del código existente — Capacitor envuelve el
> `index.html`/`css`/`js` tal cual en un WebView nativo.

## Por qué Capacitor y no un rewrite

- La app ya es 100% HTML/CSS/JS vanilla, sin build step, offline-first
  con IndexedDB. Reescribirla en React Native o Flutter tiraría ~380KB de
  `app.js` ya probado en pista para volver a escribir todo de cero, sin
  ninguna ganancia real (no hay UI nativa que valga la pena, no hay
  gráficos 3D nativos, etc.).
- Capacitor toma la webapp tal cual y la sirve dentro de un WebView del
  sistema (WKWebView en iOS, Android System WebView), agregando acceso a
  APIs nativas solo donde hace falta (por ahora: ninguna, ver más abajo).
- Resuelve de yapa el problema documentado en `CLAUDE.md`: abrir el
  `index.html` como `file://` en el navegador del celular bloquea la
  Geolocation API. Capacitor sirve el contenido como `https://localhost`
  (Android) / `capacitor://localhost` (iOS), no como `file://`, así que
  `navigator.geolocation` (ya usado en `app.js` línea ~2206) debería
  funcionar sin tocar código — **hay que probarlo igual** una vez armado
  el APK.

## Requisitos previos

- Node.js (LTS) instalado en esta PC.
- Android Studio con el Android SDK — **ya lo tenés instalado**, así que
  el build de Android se puede compilar y probar 100% desde acá.
- Para iOS hace falta Xcode, que solo corre en macOS. Vas a necesitar la
  Mac recién en el paso de abrir/compilar `ios/` — todo lo anterior
  (config, permisos, código) se prepara igual desde Windows.

## Paso 1 — Reorganizar los assets web en `www/`

Capacitor necesita que los archivos que se empaquetan en la app vivan en
una carpeta separada del `package.json`/`node_modules` del proyecto
(si no, `node_modules` terminaría copiado adentro de la app). `docs/` y
`firmware/` quedan afuera de `www/` a propósito — no son parte de la app.

Desde `F:\Users\Eric\Documents\claude\telemetry\v2\telemetry_pimp`, en
PowerShell:

```powershell
cd "F:\Users\Eric\Documents\claude\telemetry\v2\telemetry_pimp"

mkdir www
move index.html www\
move css www\
move js www\
move img www\
move vendor www\
```

Resultado esperado: `telemetry_pimp/www/index.html`,
`telemetry_pimp/www/css/`, `telemetry_pimp/www/js/`,
`telemetry_pimp/www/img/`, `telemetry_pimp/www/vendor/`. `docs/` y
`firmware/` quedan donde estaban, al mismo nivel que `www/`.

No hace falta tocar ninguna ruta interna del HTML/CSS/JS — todas las
referencias (`./css/estilos.css`, `./js/app.js`, `./vendor/maplibre-gl.js`,
etc.) son relativas, así que siguen funcionando igual dentro de `www/`.

## Paso 2 — Instalar Capacitor

Ya te dejé armados `package.json` y `capacitor.config.json` en esta misma
carpeta (`telemetry_pimp/`, al lado de `www/`, no adentro). Solo falta
instalar:

```powershell
npm install
```

## Paso 3 — Agregar las plataformas nativas

```powershell
npx cap add android
npx cap add ios
```

Esto genera las carpetas `android/` (proyecto de Android Studio/Gradle) y
`ios/` (proyecto de Xcode) al lado de `www/`. Se pueden generar los dos
ahora aunque todavía no tengas la Mac a mano — `ios/` va a quedar ahí
esperando a que lo abras con Xcode el día que puedas.

Cada vez que cambies algo en `www/` (HTML/CSS/JS), hay que correr:

```powershell
npx cap sync
```

para que los proyectos nativos tomen los cambios. Es el único "build
step" nuevo en el flujo de trabajo — el resto sigue siendo edición
directa de archivos, sin bundler ni transpilado.

## Paso 4 — Permisos y red en Android

La app habla con el Sender por `fetch()` a `http://<ip-del-logger>` (HTTP
plano, sin TLS — ver `docs/CLAUDE.md`). Android bloquea tráfico HTTP sin
cifrar por default desde Android 9. Hay que habilitarlo explícitamente
solo para el tema del datalogger.

**1. Crear** `android/app/src/main/res/xml/network_security_config.xml`
(la carpeta `xml/` no existe todavía — creála):

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- HTTP plano permitido para hablar con el Sender por WiFi local.
         OJO: Android NO acepta rangos (192.168.0.0/16) en domain-config,
         sólo nombres o IPs exactas — por eso va en base-config
         (corregido 25/09/2026; la versión anterior no autorizaba nada). -->
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
```

**2. Editar** `android/app/src/main/AndroidManifest.xml` — dentro de la
etiqueta `<application ...>`, agregar el atributo (si no está ya):

```xml
android:networkSecurityConfig="@xml/network_security_config"
```

y, dentro de `<manifest ...>` (fuera de `<application>`), agregar los
permisos que la app necesita:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

(`ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` son para el GPS que ya
usa `app.js` vía `navigator.geolocation` — sin esto el permiso ni
aparece en el diálogo del sistema.)

## Paso 5 — Permisos en iOS

Editar `ios/App/App/Info.plist`, agregar estas claves (formato
`<key>`/`<string>` dentro del `<dict>` principal):

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>SendFlow necesita tu ubicación para registrar el track GPS de la bajada.</string>

<key>NSLocalNetworkUsageDescription</key>
<string>SendFlow se conecta al datalogger Sender por WiFi local para leer y configurar las bajadas.</string>

<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
</dict>
```

`NSAllowsLocalNetworking` habilita HTTP plano solo para direcciones de
red local (no abre HTTP a internet en general — no hace falta
`NSAllowsArbitraryLoads`). `NSLocalNetworkUsageDescription` es
obligatorio desde iOS 14: sin esto, iOS bloquea el `fetch()` al Sender
sin ni siquiera mostrar el diálogo de permiso.

## Paso 6 — Compilar y probar

**Android (ahora, desde esta PC):**

```powershell
npx cap open android
```

Abre Android Studio con el proyecto. Desde ahí: `Run` en un emulador o
en el celular conectado por USB (con depuración USB activada).

**iOS (cuando tengas la Mac):**

Copiar toda la carpeta `telemetry_pimp/` (o al menos `www/`, `ios/`,
`package.json`, `capacitor.config.json`) a la Mac, correr `npm install`
ahí, y:

```bash
npx cap open ios
```

Abre Xcode. Para probar en un iPhone físico hace falta una cuenta de
Apple Developer (gratis alcanza para probar en tu propio dispositivo por
7 días por build; la cuenta paga de USD 99/año es solo para publicar en
la App Store o firmar por más tiempo).

## Cosas para validar apenas haya un build andando

- [ ] **GPS**: confirmar que `navigator.geolocation` pide permiso y
  entrega posición dentro del WebView empaquetado (era el bloqueo
  original con `file://`, debería estar resuelto).
- [ ] **Conexión al Sender por WiFi**: conectar el celular a la red del
  logger y probar que `fetch()` a `http://<ip>` no lo bloquee la
  network security config / ATS.
- [ ] **Exportar PDF** (`window.print()` en el modal de Notas): ya está
  marcado como pendiente de validar en `docs/CLAUDE.md` línea ~336. Si
  no abre nada dentro del WebView empaquetado, la solución es sumar
  `@capacitor/share` (compartir el HTML/print como archivo) recién en
  ese momento — no agregar la dependencia de antemano.
- [ ] **Fuente de Google Fonts** (`fonts.googleapis.com` en
  `index.html` línea 8-9): hoy se descarga de internet en cada carga.
  Rompe el principio "offline-first" si el celular no tiene señal la
  primera vez que abre la app en la pista. Recomendado: bajar el
  archivo `.woff2` de Roboto Mono una vez, guardarlo en `www/vendor/` y
  cambiar el `<link>` por un `@font-face` local — mismo patrón que ya
  se usó con MapLibre (`vendor/maplibre-gl.js` en vez de un CDN).
- [ ] **Ícono y splash screen**: por ahora Capacitor pone un ícono
  genérico. Cuando haya un logo de SendFlow, `@capacitor/assets` genera
  todos los tamaños para Android/iOS a partir de una sola imagen.

## Después de este setup

Una vez que el APK/IPA arrancan bien, el flujo de trabajo del proyecto
no cambia: seguís editando `www/index.html`, `www/css/estilos.css`,
`www/js/app.js` directo, iterando en el navegador para todo lo que no
sea GPS/red local (mucho más rápido que recompilar la app nativa cada
vez), y corrés `npx cap sync` + recompilás en Android Studio/Xcode solo
cuando quieras probar el build real en el celular.
