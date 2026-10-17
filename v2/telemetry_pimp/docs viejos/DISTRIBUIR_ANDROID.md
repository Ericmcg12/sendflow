# Cómo armar SendFlow para pasarla a otros celulares (Android)

Guía para cuando la app esté terminada y la quieras mandar a otra gente.
Lo que venís haciendo (instalar directo desde Android Studio al celular) es
una versión de **prueba**: sirve sólo para tu equipo. Para pasarla hace falta
un **APK de release firmado**.

Datos del proyecto (28/09/2026):

- Identificador de la app: `com.sendflow.app` (en `capacitor.config.json` y
  `android/app/build.gradle`). **No cambiarlo nunca:** si cambia, Android la
  toma como otra app y las bajadas guardadas no pasan.
- Versión actual: `versionCode 1`, `versionName "1.0"`.

---

## 1. Antes de cada versión

1. En la carpeta `telemetry_pimp`, abrí una consola y corré:
   ```
   npx cap sync android
   ```
   Así Android se lleva la última versión de la app (`www/`).
2. Abrí `android/app/build.gradle` y, dentro de `defaultConfig`, cambiá:
   ```
   versionCode 2          ← subir de a 1 en cada versión que mandes (2, 3, 4…)
   versionName "1.1"      ← lo que quieras mostrar como versión
   ```
   Si no subís `versionCode`, el celular no deja instalar la versión nueva
   encima de la anterior.
3. Abrí Android Studio (`npx cap open android`) y esperá a que termine de
   sincronizar (barra de abajo).

## 2. La llave de firma (sólo la primera vez)

Toda versión que mandes tiene que estar firmada con **la misma llave**. Se
crea una sola vez:

1. Menú **Build → Generate Signed App Bundle / APK…**
2. Elegí **APK** → Next.
3. En *Key store path* tocá **Create new…**
   - **Key store path:** fuera de la carpeta del proyecto, por ejemplo
     `F:\Users\Eric\Documents\llaves\sendflow.jks`.
   - **Password:** una contraseña (y confirmación).
   - **Alias:** `sendflow`. **Password** de la llave: puede ser la misma.
   - **Validity (years):** 50.
   - **First and Last Name:** tu nombre (lo demás es opcional).
4. OK.

> **Guardá `sendflow.jks` y las dos contraseñas en dos lugares seguros**
> (pendrive + nube, por ejemplo). Si se pierde la llave, **nadie puede
> actualizar la app nunca más**: habría que desinstalar, y al desinstalar se
> pierden las bajadas y perfiles guardados en ese celular. Tampoco la subas
> a ningún lado público ni la mandes junto con el APK.

## 3. Generar el APK

1. **Build → Generate Signed App Bundle / APK…** → **APK** → Next.
2. Elegí `sendflow.jks`, poné las contraseñas y el alias `sendflow`
   (podés tildar *Remember passwords*). Next.
3. Elegí **release** → **Create**.
4. Cuando termina aparece un aviso abajo a la derecha con el link **locate**.
   El archivo queda en:
   ```
   telemetry_pimp\android\app\release\app-release.apk
   ```
5. Renombralo antes de mandarlo, por ejemplo `SendFlow-1.1.apk`.

## 4. Pasarlo a otra persona

- Mandalo por WhatsApp **como documento**, por Drive, Telegram o por cable.
- Al abrirlo, Android pide permiso para **instalar apps desconocidas** desde
  la app con la que lo abrió (WhatsApp, Archivos…). Se acepta una vez.
- Puede aparecer **Play Protect** diciendo que la app no es reconocida: se
  toca **Más detalles → Instalar de todos modos**. Sale porque no viene de
  Play Store, no porque tenga algo malo.
- **Actualizar:** se le manda el APK nuevo (con `versionCode` mayor y firmado
  con la misma llave) y se instala encima. Conserva bajadas y perfiles.

## 5. Tu propio celular

Hoy tenés instalada la versión de prueba, firmada con otra llave. Android no
deja instalar la de release encima. Para pasarte:

1. En la app: **Configuración → Respaldo de datos → Exportar** (archivo
   `.sfdb`) y guardalo fuera de la app (Drive, PC).
2. Desinstalá SendFlow.
3. Instalá el `app-release.apk`.
4. **Configuración → Respaldo de datos → Importar** el `.sfdb`.

Desde ahí usá siempre la versión de release. Si seguís probando cambios
desde Android Studio, instalá también con la llave de release (en
*Build Variants* elegí `release`), o vas a tener que repetir estos pasos.

## 6. Checklist de cada versión

- [ ] `npx cap sync android`
- [ ] `versionCode` +1 y `versionName` nuevo
- [ ] Generate Signed APK → release, con `sendflow.jks`
- [ ] Probar el APK en tu celular (instalarlo encima de la versión anterior)
- [ ] Renombrar a `SendFlow-X.Y.apk` y mandar

---

## Play Store (si algún día hace falta)

En el paso 3 se elige **Android App Bundle (.aab)** en vez de APK y se sube a
la **Google Play Console** (USD 25, una sola vez). Pide cuenta de
desarrollador verificada, ficha de la app, capturas y política de
privacidad; a las cuentas personales nuevas Google les exige una prueba
cerrada con un grupo de testers durante unos días antes de publicar. Para
repartir entre conocidos, el APK alcanza.

---

## ¿Se puede proteger contra copias?

**Del todo, no.** SendFlow es una app web empaquetada: adentro del APK van
`app.js`, `index.html` y `estilos.css` tal cual. Un APK es un `.zip`: quien
lo abra con cualquier descompresor ve el código completo, con los nombres y
comentarios. Ninguna app de Android es imposible de desarmar; lo que se
puede hacer es que cueste mucho más.

Lo que sirve, de más a menos efectivo:

1. **Ofuscar el JavaScript de la versión que se reparte.** Antes de generar
   el APK se pasa `www/` por un ofuscador (por ejemplo
   `javascript-obfuscator`) a otra carpeta (`www_dist/`) y Capacitor
   empaqueta esa. El código sigue funcionando igual, pero queda ilegible:
   sin comentarios, nombres cambiados por códigos, textos cifrados, lógica
   revuelta. Copiar un cálculo puntual pasa a llevar días de trabajo en vez
   de minutos. Tu código original queda intacto en `www/`. Costo: la app
   puede pesar y tardar un poco más en arrancar (hay que probarla), y
   siempre hay que generar el APK desde la versión ofuscada.
2. **Dejar lo más valioso en el Sender.** El firmware del Teensy es binario
   compilado: mucho más difícil de leer que JavaScript. Lo que no tenga que
   estar en la app (calibraciones, correcciones de sensores) conviene que
   viva ahí.
3. **Protección legal.** En Argentina el software está protegido por la
   Ley 11.723 de propiedad intelectual. Registrarlo en la **Dirección
   Nacional del Derecho de Autor (DNDA)** (trámite en línea, con el código
   fuente como obra inédita) da una fecha cierta de autoría para reclamar
   si alguien lo copia. También conviene que la app diga en pantalla
   "© (tu nombre) — todos los derechos reservados" y, si la repartís a varias
   personas, unas condiciones de uso cortas (sin copiar ni redistribuir).

Lo que **no** sirve: la opción *minifyEnabled* (R8/ProGuard) de Android
Studio sólo toca la parte Java del APK, no el JavaScript donde están los
cálculos.
