# Instalar SendFlow Coach en GoDaddy (hosting con cPanel)

Lo que hace falta del hosting: **PHP 8.0 o más nuevo** y **MySQL**. Los planes
de hosting compartido Linux de GoDaddy (cPanel) los traen. No hay que instalar
nada más: no usa Node, ni librerías, ni nada que compilar.

## 1. Crear la base de datos

1. cPanel → **Bases de datos MySQL**.
2. "Crear nueva base de datos": por ejemplo `coach` (cPanel le agrega un
   prefijo, queda algo como `usuario_coach`).
3. "Agregar nuevo usuario": por ejemplo `coach` con una contraseña larga (queda
   `usuario_coach`). Anotá usuario y contraseña.
4. "Agregar usuario a la base de datos": elegí los dos y marcá **TODOS LOS
   PRIVILEGIOS**.

Las tablas se crean solas la primera vez que se abre la app.

## 2. Subir los archivos

1. cPanel → **Administrador de archivos** (o FTP).
2. Decidí dónde va a vivir la app:
   - en una carpeta del sitio: `public_html/coach/` → `https://tusitio.com/coach`
   - o en un subdominio (cPanel → Dominios → crear `coach.tusitio.com`, que
     apunta a su propia carpeta).
3. Subí **todo el contenido de `SendFlow_Coach/www/`** a esa carpeta (index.html,
   css, js, img y api). Si subís un .zip, extraelo ahí mismo.
4. **No subas** `api/config.php` de la PC ni la carpeta `api/datos/` (son de las
   pruebas). En el hosting se arma un `config.php` nuevo.

## 3. Carpeta para los videos

Los videos se guardan en el disco del hosting. Lo más seguro es una carpeta
**fuera** de `public_html`:

1. Administrador de archivos → en la carpeta de inicio (`/home/TU_USUARIO/`)
   crear `coach_datos`.
2. La ruta completa se ve arriba en el administrador, por ejemplo
   `/home/abc123/coach_datos`.

(Si la dejás adentro de la web, la app le pone un bloqueo, pero afuera es mejor.)

## 4. Configurar

1. En la carpeta `api/` del hosting, copiá `config.ejemplo.php` como
   `config.php`.
2. Editá `config.php` (botón "Editar" del administrador de archivos):
   - `driver` → `mysql`
   - `nombre`, `usuario`, `clave` → los del paso 1 (con el prefijo)
   - `datos_dir` → la ruta del paso 3, por ejemplo `'/home/abc123/coach_datos'`
   - `secreto` → una frase larga al azar (64 letras y números). No la cambies
     después.
3. Guardá.

## 5. HTTPS

cPanel → **SSL/TLS Status** → activar el certificado gratuito (AutoSSL) para el
dominio o subdominio. La grabación de voz y la cámara **sólo funcionan con
https**, y SendFlow en el celular se conecta mejor por https.

## 6. Probar

1. Abrí `https://tusitio.com/coach/api/index.php?r=estado` → tiene que decir
   `{"ok":true,"app":"SendFlow Coach",...}`. Si dice que falta `config.php` o que
   no conecta a la base, revisá el paso 4.
2. Abrí `https://tusitio.com/coach` → crear cuenta → listo.

## 7. Conectar SendFlow

En SendFlow (celular o PC): Configuración → **SendFlow Coach** → poné la
dirección (`https://tusitio.com/coach`), tu email y contraseña de Coach →
Conectar.

## Actualizar a una versión nueva

Volver a subir el contenido de `www/` **sin pisar** `api/config.php`. Si una
versión nueva cambia las tablas, la app las actualiza sola la primera vez que se
abre.

## Espacio y límites

- Cada video ocupa lo mismo que el archivo original. Revisar el espacio del plan
  de GoDaddy (cPanel → uso de disco).
- Los videos se suben en partes de 2 MB, así que no hace falta tocar
  `upload_max_filesize`.
- Tamaño máximo de un video: `video_max_mb` en `config.php` (1 GB de fábrica).
- Copia de seguridad: cPanel → **Copia de seguridad** (base de datos + carpeta
  `coach_datos`).
