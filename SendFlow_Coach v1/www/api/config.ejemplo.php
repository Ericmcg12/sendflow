<?php
// ============================================================================
// Configuración del servidor de SendFlow Coach.
// Copiar este archivo como "config.php" (en esta misma carpeta) y completar.
// config.php NO se comparte ni se sube a ningún repositorio: tiene las claves.
// ============================================================================
return [
  // --- Base de datos ---
  // GoDaddy (cPanel → Bases de datos MySQL): crear la base y el usuario, darle
  // todos los permisos, y poner acá los datos.
  'db' => [
    'driver'  => 'mysql',            // 'mysql' en el hosting; 'sqlite' para probar en la PC
    'host'    => 'localhost',
    'nombre'  => 'NOMBRE_DE_LA_BASE',
    'usuario' => 'USUARIO_DE_LA_BASE',
    'clave'   => 'CLAVE_DE_LA_BASE',
    'sqlite'  => __DIR__ . '/datos/coach.sqlite', // sólo si driver = 'sqlite'
  ],

  // --- Carpeta donde se guardan videos, grabaciones y bajadas ---
  // Lo ideal es una carpeta FUERA de public_html (por ejemplo
  // /home/USUARIO_CPANEL/coach_datos). Si queda adentro, la carpeta trae un
  // .htaccess que bloquea el acceso directo.
  'datos_dir' => __DIR__ . '/datos',

  // --- Clave secreta para firmar los enlaces de los videos ---
  // Poner una frase larga y al azar (por ejemplo 64 letras y números) y no
  // cambiarla después: si cambia, los enlaces de video abiertos dejan de andar.
  'secreto' => 'CAMBIAR_POR_UNA_FRASE_LARGA_Y_AL_AZAR',

  // --- Límites ---
  'video_max_mb'  => 1024,   // tamaño máximo de un video
  'sesion_dias'   => 60,     // días que dura un ingreso sin volver a poner la contraseña

  // --- Orígenes que pueden llamar a la API (CORS) ---
  // '*' deja entrar a la app SendFlow desde el celular. Las llamadas igual
  // necesitan usuario y contraseña.
  'cors' => '*',
];
